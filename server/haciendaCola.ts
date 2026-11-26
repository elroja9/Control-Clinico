// Cola de transmisión de comprobantes a Hacienda: decisiones puras (sin E/S) que usan tanto el
// intento sincrónico al emitir como el proceso en segundo plano de server.ts. Patrón probado en
// producción en el POS: guardar primero (PENDIENTE, con el XML ya firmado) y transmitir después.
//
// Regla de oro: si un POST pudo haber llegado a Hacienda (timeout, red cortada después de enviar,
// 5xx, ENVIADA), SOLO se consulta por la clave; nunca se vuelve a enviar. Se reenvía únicamente
// cuando Hacienda contesta que no tiene esa clave (no_encontrado) — y nunca automáticamente en un
// comprobante anterior a la cola (legado): ese queda para revisión manual. El XML firmado guardado
// es el que se transmite siempre: nunca se vuelve a firmar después del primer intento.
//
// Contadores separados: `intentos` cuenta los intentos de ENVÍO (se agotan: el comprobante queda en
// ERROR para acción manual); `consultas` cuenta las consultas de algo que Hacienda pudo haber
// recibido, que NUNCA se agotan en silencio: siguen a la espera máxima y con un aviso visible.
//
// Import exclusivo del servidor.

export interface ParametrosCola {
  /** Segundos de espera tras el primer fallo; se duplica en cada intento. */
  backoffBaseSeg: number;
  /** Tope de la espera entre intentos, en segundos. */
  backoffMaxSeg: number;
  /** Intentos máximos de envío (y consultas antes de avisar que Hacienda no responde). */
  maxIntentos: number;
}

/** Próximo intento: base·2^(n−1), con tope. `n` = intentos (o consultas) ya hechos (≥ 1). */
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
  /** Intentos de envío ya hechos. */
  intentos: number;
  tieneXmlFirmado: boolean;
}

export type AccionCola = "ENVIAR" | "CONSULTAR" | "AGOTADO" | "NINGUNA";

/**
 * Qué le toca a un comprobante en la cola. El orden importa: primero CONSULTAR (si un POST pudo
 * haber llegado, nunca se da por agotado ni se reenvía), después AGOTADO (solo para envíos), y
 * por último ENVIAR.
 */
export function decidirAccionCola(doc: EstadoColaDocumento, maxIntentos: number): AccionCola {
  const enCola = doc.estado === "PENDIENTE" || doc.estado === "ENVIADA" || (doc.estado === "ERROR" && doc.postRealizado);
  if (!enCola || !doc.tieneXmlFirmado) return "NINGUNA";
  if (doc.estado === "ENVIADA" || doc.postRealizado) return "CONSULTAR";
  if (doc.intentos >= maxIntentos) return "AGOTADO";
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
  | "CONSULTAR_ANTES_DE_RECHAZAR" // 4xx con un POST anterior que pudo haber llegado: preguntar antes
  | "RECHAZO_RECEPCION"; // otro 4xx: Hacienda no lo recibió por un problema del comprobante

/**
 * Clasifica la respuesta HTTP del POST /recepcion (status null = la red se cortó durante el envío).
 * `postPrevio`: un POST anterior de esta misma clave pudo haber llegado. En ese caso cualquier 4xx
 * (salvo 401/403) se verifica consultando la clave: no se confía solo en el texto de X-Error-Cause.
 */
export function clasificarRespuestaEnvio(status: number | null | undefined, causa: string | null | undefined, opciones: { postPrevio?: boolean } = {}): ClaseRespuestaEnvio {
  if (status == null) return "INCIERTO";
  if (status === 201 || status === 202) return "RECIBIDO";
  if (esClaveYaRecibida(status, causa)) return "YA_RECIBIDO";
  if (status === 401 || status === 403) return "TOKEN_INVALIDO";
  if (status >= 500 || status === 408 || status === 429) return "INCIERTO";
  if (opciones.postPrevio) return "CONSULTAR_ANTES_DE_RECHAZAR";
  return "RECHAZO_RECEPCION";
}

export interface ResultadoConsultaCola {
  /** Estado nuevo (null = no se supo: no cambia). */
  estado: "ACEPTADA" | "RECHAZADA" | "ENVIADA" | "PENDIENTE" | "ERROR" | null;
  postRealizado: boolean;
  /** true: comprobante anterior a la cola que Hacienda no tiene → nunca se reenvía solo. */
  revisionManual?: boolean;
}

/** Estado local que corresponde a lo que Hacienda dijo al consultar una clave en la cola. */
export function estadoTrasConsultaCola(estadoHacienda: "recibido" | "procesando" | "aceptado" | "rechazado" | "error" | "no_encontrado", contexto: { legado?: boolean } = {}): ResultadoConsultaCola {
  switch (estadoHacienda) {
    case "aceptado": return { estado: "ACEPTADA", postRealizado: true };
    case "rechazado": return { estado: "RECHAZADA", postRealizado: true };
    case "recibido":
    case "procesando": return { estado: "ENVIADA", postRealizado: true };
    // Nunca le llegó: se puede volver a enviar el MISMO XML firmado... salvo un comprobante
    // anterior a la cola, que queda en ERROR para revisión manual.
    case "no_encontrado":
      return contexto.legado ? { estado: "ERROR", postRealizado: false, revisionManual: true } : { estado: "PENDIENTE", postRealizado: false };
    // No se supo: no cambia nada.
    default: return { estado: null, postRealizado: true };
  }
}

/**
 * Qué hacer cuando una CONSULTA no obtuvo respuesta útil (o Hacienda sigue procesando). Nunca deja
 * de consultar: después de `maxIntentos` consultas solo se avisa. Un PENDIENTE cuyo POST pudo haber
 * llegado pasa a ERROR con la marca de envío incierto (sigue en la cola, solo consultando).
 */
export function estadoSinRespuesta(estado: string, consultas: number, maxIntentos: number): { estado: string; aviso: "ENVIO_INCIERTO" | "HACIENDA_NO_RESPONDE" | null } {
  if (consultas < maxIntentos) return { estado, aviso: null };
  if (estado === "PENDIENTE" || estado === "ERROR") return { estado: "ERROR", aviso: "ENVIO_INCIERTO" };
  return { estado, aviso: "HACIENDA_NO_RESPONDE" };
}

/**
 * Bloqueo (segundos) que debe durar el reclamo de un comprobante: al menos lo que puede tardar un
 * ciclo completo (token + envío + sondeo + una consulta). Devuelve el mayor entre el configurado y
 * ese mínimo, y si hubo que subirlo.
 */
export function bloqueoMinimoSeg(configuradoSeg: number, fetchTimeoutMs: number, plazoSondeoMs: number): { seg: number; ajustado: boolean } {
  const minimo = Math.ceil((3 * fetchTimeoutMs + plazoSondeoMs) / 1000);
  return configuradoSeg >= minimo ? { seg: configuradoSeg, ajustado: false } : { seg: minimo, ajustado: true };
}

/**
 * ¿Se puede reclamar el envío automático del correo? 0 = no enviado; 2 = en curso desde
 * `reclamadoEn`: se recupera solo si el reclamo es más viejo que `bloqueoSeg` (el proceso que lo
 * tomó se cayó). 1 = ya enviado: nunca.
 */
export function correoReclamable(correoEnviado: number, reclamadoEn: Date | null, ahora: Date, bloqueoSeg: number): boolean {
  if (correoEnviado === 0) return true;
  if (correoEnviado !== 2) return false;
  if (!reclamadoEn) return true;
  return ahora.getTime() - reclamadoEn.getTime() > bloqueoSeg * 1000;
}
