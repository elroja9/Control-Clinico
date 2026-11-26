// Cola de transmisión de comprobantes a Hacienda: decisiones puras (sin E/S) que usan tanto el
// intento sincrónico al emitir como el proceso en segundo plano de server.ts. Patrón probado en
// producción en el POS: guardar primero (PENDIENTE, con el XML ya firmado) y transmitir después.
//
// Regla de oro: si un POST pudo haber llegado a Hacienda (timeout, red cortada después de enviar,
// 5xx, ENVIADA), SOLO se consulta por la clave; nunca se vuelve a enviar. Se reenvía únicamente
// cuando Hacienda contesta que no tiene esa clave (no_encontrado). El XML firmado guardado es el
// que se transmite siempre: nunca se vuelve a firmar un comprobante después de su primer intento.
//
// Import exclusivo del servidor.

export interface ParametrosCola {
  /** Segundos de espera tras el primer fallo; se duplica en cada intento. */
  backoffBaseSeg: number;
  /** Tope de la espera entre intentos, en segundos. */
  backoffMaxSeg: number;
  /** Intentos máximos; después el comprobante queda para acción manual. */
  maxIntentos: number;
}

/** Próximo intento: base·2^(intentos−1), con tope. `intentos` = intentos ya hechos (≥ 1). */
export function calcularProximoIntento(intentos: number, ahora: Date, p: Pick<ParametrosCola, "backoffBaseSeg" | "backoffMaxSeg">): Date {
  const n = Math.max(1, Math.floor(intentos));
  // 2^30 ya excede cualquier tope razonable: evita Infinity con muchos intentos.
  const espera = Math.min(p.backoffMaxSeg, p.backoffBaseSeg * Math.pow(2, Math.min(n - 1, 30)));
  return new Date(ahora.getTime() + Math.max(0, espera) * 1000);
}

export interface EstadoColaDocumento {
  estado: string; // PENDIENTE | ENVIADA | ERROR | ...
  /** true si un POST de este comprobante pudo haber llegado a Hacienda. */
  postRealizado: boolean;
  intentos: number;
  tieneXmlFirmado: boolean;
}

export type AccionCola = "ENVIAR" | "CONSULTAR" | "AGOTADO" | "NINGUNA";

/**
 * Qué le toca a un comprobante en la cola:
 * - CONSULTAR: Hacienda pudo haberlo recibido (ENVIADA, envío incierto): solo se pregunta por la clave.
 * - ENVIAR: PENDIENTE y ningún POST pudo haber llegado: se envía el XML firmado guardado.
 * - AGOTADO: superó el máximo de intentos; queda para acción manual.
 * - NINGUNA: estado final o sin XML firmado (nunca se firma aquí).
 */
export function decidirAccionCola(doc: EstadoColaDocumento, maxIntentos: number): AccionCola {
  const enCola = doc.estado === "PENDIENTE" || doc.estado === "ENVIADA" || (doc.estado === "ERROR" && doc.postRealizado);
  if (!enCola || !doc.tieneXmlFirmado) return "NINGUNA";
  if (doc.intentos >= maxIntentos) return "AGOTADO";
  if (doc.estado === "ENVIADA" || doc.postRealizado) return "CONSULTAR";
  return "ENVIAR";
}

/**
 * Hacienda responde 400 con X-Error-Cause cuando recibe una clave que ya tiene. Ese caso NO es un
 * error del comprobante: ya está allá, así que se pasa a consultar su estado.
 */
export function esClaveYaRecibida(status: number | null | undefined, causa: string | null | undefined): boolean {
  if (status !== 400 && status !== 409) return false;
  const texto = String(causa ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!texto) return false;
  return /ya (fue |ha sido )?(recibid|registrad|enviad|emitid)|ya existe|duplicad|already/.test(texto)
    || (texto.includes("clave") && /existe|registrad|recibid/.test(texto));
}

export type ClaseRespuestaEnvio =
  | "RECIBIDO" // 201/202: Hacienda lo aceptó para procesar
  | "YA_RECIBIDO" // 400 por clave repetida: ya lo tiene
  | "TOKEN_INVALIDO" // 401/403: no llegó; se renueva el token y se reintenta
  | "INCIERTO" // 5xx o sin respuesta: pudo haber llegado, solo consultar
  | "RECHAZO_RECEPCION"; // otro 4xx: Hacienda no lo recibió por un problema del comprobante

/** Clasifica la respuesta HTTP del POST /recepcion (status null = la red se cortó durante el envío). */
export function clasificarRespuestaEnvio(status: number | null | undefined, causa: string | null | undefined): ClaseRespuestaEnvio {
  if (status == null) return "INCIERTO";
  if (status === 201 || status === 202) return "RECIBIDO";
  if (esClaveYaRecibida(status, causa)) return "YA_RECIBIDO";
  if (status === 401 || status === 403) return "TOKEN_INVALIDO";
  if (status >= 500 || status === 408 || status === 429) return "INCIERTO";
  return "RECHAZO_RECEPCION";
}

/** Estado local que corresponde a lo que Hacienda dijo al consultar una clave en la cola. */
export function estadoTrasConsultaCola(estadoHacienda: "recibido" | "procesando" | "aceptado" | "rechazado" | "error" | "no_encontrado"): { estado: "ACEPTADA" | "RECHAZADA" | "ENVIADA" | "PENDIENTE" | null; postRealizado: boolean } {
  switch (estadoHacienda) {
    case "aceptado": return { estado: "ACEPTADA", postRealizado: true };
    case "rechazado": return { estado: "RECHAZADA", postRealizado: true };
    case "recibido":
    case "procesando": return { estado: "ENVIADA", postRealizado: true };
    // Nunca le llegó: se puede volver a enviar el MISMO XML firmado.
    case "no_encontrado": return { estado: "PENDIENTE", postRealizado: false };
    // No se supo: no cambia nada.
    default: return { estado: null, postRealizado: true };
  }
}
