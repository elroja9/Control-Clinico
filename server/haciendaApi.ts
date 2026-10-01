// Cliente HTTP para el API de Recepción de Comprobantes Electrónicos de Hacienda Costa Rica
// (envío del XML firmado) y el IdP de Hacienda (token OAuth2). Las URLs, el header y el sondeo de
// estado siguen lo que el POS de restaurante (repositorio pos-restaurante, haciendaRoutes.ts) ya
// valida en producción contra Hacienda — ver
// docs/superpowers/specs/2026-09-30-fixes-pos-facturacion-anulacion-cxc-cxp-design.md.
//
// Import exclusivo del servidor.

export type AmbienteHacienda = "SANDBOX" | "PRODUCCION" | "PRUEBAS_LOCAL";

// PRUEBAS_LOCAL nunca llega a usar estas URLs — server.ts salta por completo la llamada a
// Hacienda para ese ambiente (ver POST /api/facturas). Las entradas existen solo para que
// estos Record<AmbienteHacienda, string> compilen con el tipo ampliado.
const IDP_TOKEN_URL: Record<AmbienteHacienda, string> = {
  SANDBOX: "https://idp.comprobanteselectronicos.go.cr/auth/realms/rut-stag/protocol/openid-connect/token",
  PRODUCCION: "https://idp.comprobanteselectronicos.go.cr/auth/realms/rut/protocol/openid-connect/token",
  PRUEBAS_LOCAL: ""
};

const CLIENT_ID: Record<AmbienteHacienda, string> = {
  SANDBOX: "api-stag",
  PRODUCCION: "api-prod",
  PRUEBAS_LOCAL: ""
};

// Sandbox: subdominio "api-sandbox" con la misma ruta /recepcion/v1 que producción, confirmado en el
// portal ATV ("Mi perfil" > ambiente de pruebas). Aquí estaba "api.../recepcion-sandbox/v1", una
// URL inferida de una fuente comunitaria que el POS ya había corregido.
const RECEPCION_BASE_URL: Record<AmbienteHacienda, string> = {
  SANDBOX: "https://api-sandbox.comprobanteselectronicos.go.cr/recepcion/v1",
  PRODUCCION: "https://api.comprobanteselectronicos.go.cr/recepcion/v1",
  PRUEBAS_LOCAL: ""
};

// Sin límite, un IdP o API de recepción que acepta la conexión y nunca responde deja colgada la
// solicitud de facturar indefinidamente. Mismo valor que usa el POS. Exportado para que todo fetch
// a Hacienda (también el buscador CABYS de server.ts) use el mismo.
export const HACIENDA_FETCH_TIMEOUT_MS = 20000;

export class HaciendaApiError extends Error {}

export async function obtenerTokenHacienda(ambiente: AmbienteHacienda, usuarioAtv: string, passwordAtv: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: CLIENT_ID[ambiente],
    username: usuarioAtv,
    password: passwordAtv
  });

  const res = await fetch(IDP_TOKEN_URL[ambiente], {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(HACIENDA_FETCH_TIMEOUT_MS)
  });

  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new HaciendaApiError(`No se pudo obtener el token de Hacienda (${res.status}): ${texto.slice(0, 300)}`);
  }
  const data: any = await res.json();
  if (!data.access_token || typeof data.access_token !== "string") {
    throw new HaciendaApiError("Hacienda no devolvió un access_token.");
  }
  return data.access_token;
}

export interface EnvioHaciendaResultado {
  aceptadoParaProcesar: boolean;
  location: string | null;
  mensaje: string | null;
}

/**
 * Envía el comprobante firmado a Hacienda. `xmlFirmado` va como XML en texto plano (no base64) —
 * Hacienda lo espera en base64 dentro de `comprobanteXml` según el API de Recepción.
 */
export async function enviarFacturaHacienda(params: {
  ambiente: AmbienteHacienda;
  token: string;
  clave: string;
  fechaEmisionIso: string;
  tipoIdentificacionEmisor: string;
  cedulaEmisor: string;
  tipoIdentificacionReceptor?: string;
  cedulaReceptor?: string;
  xmlFirmado: string;
}): Promise<EnvioHaciendaResultado> {
  const { ambiente, token, clave, fechaEmisionIso, tipoIdentificacionEmisor, cedulaEmisor, tipoIdentificacionReceptor, cedulaReceptor, xmlFirmado } = params;

  const body: any = {
    clave,
    fecha: fechaEmisionIso,
    emisor: { tipoIdentificacion: tipoIdentificacionEmisor, numeroIdentificacion: cedulaEmisor },
    comprobanteXml: Buffer.from(xmlFirmado, "utf8").toString("base64")
  };
  if (cedulaReceptor) {
    body.receptor = { tipoIdentificacion: tipoIdentificacionReceptor, numeroIdentificacion: cedulaReceptor };
  }

  const res = await fetch(`${RECEPCION_BASE_URL[ambiente]}/recepcion`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(HACIENDA_FETCH_TIMEOUT_MS)
  });

  const texto = await res.text().catch(() => "");
  if (res.status === 201 || res.status === 202) {
    return { aceptadoParaProcesar: true, location: res.headers.get("location"), mensaje: null };
  }
  // Hacienda explica el rechazo de la recepción en el header X-Error-Cause, a menudo con el cuerpo
  // vacío (así responde, por ejemplo, a un comprobante que ya había recibido).
  const causa = res.headers.get("x-error-cause");
  const detalle = [causa, texto.slice(0, 500)].filter(Boolean).join(" — ");
  return { aceptadoParaProcesar: false, location: null, mensaje: `Hacienda rechazó el envío (${res.status})${detalle ? `: ${detalle}` : ""}` };
}

export interface EstadoHaciendaResultado {
  // "no_encontrado": Hacienda no tiene ningún comprobante con esa clave (nunca le llegó).
  // "error": no se pudo saber (Hacienda caída, timeout, respuesta ilegible) — NO significa que no
  // lo tenga. Nunca se toma una decisión irreversible sobre "error".
  // El "error" PROPIO de Hacienda (ind-estado = "error": recibió el documento y no lo pudo
  // procesar) es un estado final y se reporta como "rechazado": antes se confundía con "no pude
  // consultar", y el comprobante quedaba reintentándose para siempre sin poder anularse.
  estado: "recibido" | "procesando" | "aceptado" | "rechazado" | "error" | "no_encontrado";
  respuestaXmlBase64: string | null;
  // Motivo legible del rechazo (<DetalleMensaje> del MensajeHacienda), si lo hay.
  detalleMensaje: string | null;
}

/** Extrae <DetalleMensaje> del MensajeHacienda (base64) — es donde Hacienda explica un rechazo. */
export function extraerDetalleMensajeHacienda(respuestaXmlBase64: string | null): string | null {
  if (!respuestaXmlBase64) return null;
  const xml = Buffer.from(respuestaXmlBase64, "base64").toString("utf8");
  const match = xml.match(/<DetalleMensajes?>([\s\S]*?)<\/DetalleMensajes?>/);
  if (!match) return null;
  return match[1]
    .replace(/&#13;/g, "\n")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .trim() || null;
}

export async function consultarEstadoHacienda(ambiente: AmbienteHacienda, token: string, clave: string, timeoutMs = HACIENDA_FETCH_TIMEOUT_MS): Promise<EstadoHaciendaResultado> {
  let res: Response;
  try {
    res = await fetch(`${RECEPCION_BASE_URL[ambiente]}/recepcion/${clave}`, {
      headers: { "Authorization": `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    return { estado: "error", respuestaXmlBase64: null, detalleMensaje: null };
  }

  // Solo un 404 cuenta como "Hacienda no tiene esa clave": de eso depende anular sin Nota de
  // Crédito, que es irreversible, así que cualquier otra respuesta (400 incluido) falla cerrado
  // como "error" y se informa la causa que dio Hacienda.
  if (res.status === 404) {
    return { estado: "no_encontrado", respuestaXmlBase64: null, detalleMensaje: null };
  }
  if (!res.ok) {
    return { estado: "error", respuestaXmlBase64: null, detalleMensaje: res.headers.get("x-error-cause") };
  }
  const data: any = await res.json().catch(() => null);
  const estadoCrudo = String(data?.["ind-estado"] || "").toLowerCase();
  const respuestaXmlBase64 = data?.["respuesta-xml"] || null;
  const detalleMensaje = extraerDetalleMensajeHacienda(respuestaXmlBase64);
  if (estadoCrudo === "error") {
    return { estado: "rechazado", respuestaXmlBase64, detalleMensaje: detalleMensaje || "Hacienda no pudo procesar el comprobante (estado «error»)." };
  }
  if (estadoCrudo === "recibido" || estadoCrudo === "procesando" || estadoCrudo === "aceptado" || estadoCrudo === "rechazado") {
    return { estado: estadoCrudo, respuestaXmlBase64, detalleMensaje };
  }
  // Un 200 con un cuerpo que no se entiende (p. ej. una página de un proxy) no prueba nada.
  return { estado: "error", respuestaXmlBase64: null, detalleMensaje: null };
}

/**
 * Sondeo corto justo DESPUÉS de un envío aceptado para procesar (mismo patrón que el POS: 4
 * consultas, 2 s entre cada una). Casi siempre basta para que el comprobante quede ACEPTADO o
 * RECHAZADO en la misma operación, con su MensajeHacienda guardado. Tiene un plazo TOTAL
 * (`plazoMs`): sin él, una consulta de Hacienda colgada sumaba 4 × 20 s a la espera del usuario.
 *
 * Si no resuelve a tiempo, el comprobante queda ENVIADO y lo que sigue es SOLO volver a consultar
 * (POST /api/facturas/:id/estado), nunca reenviarlo: Hacienda rechaza el reenvío de una clave que ya
 * tiene, y el POS llegó a reintentar así una factura durante 7 horas que Hacienda ya había aceptado.
 */
export async function esperarResolucionHacienda(ambiente: AmbienteHacienda, token: string, clave: string, intentos = 4, esperaMs = 2000, plazoMs = 12000): Promise<EstadoHaciendaResultado> {
  const limite = Date.now() + plazoMs;
  let ultimo: EstadoHaciendaResultado = { estado: "recibido", respuestaXmlBase64: null, detalleMensaje: null };
  for (let i = 0; i < intentos; i++) {
    await new Promise(r => setTimeout(r, esperaMs));
    const restante = limite - Date.now();
    if (restante <= 0) break;
    const consulta = await consultarEstadoHacienda(ambiente, token, clave, Math.min(5000, restante));
    if (consulta.estado === "aceptado" || consulta.estado === "rechazado") return consulta;
    ultimo = consulta;
  }
  return ultimo;
}
