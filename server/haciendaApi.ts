// Cliente HTTP para el API de Recepción de Comprobantes Electrónicos de Hacienda Costa Rica
// (envío del XML firmado) y el IdP de Hacienda (token OAuth2). Las URLs, el header y el sondeo de
// estado siguen lo que el POS (D:\pos-restaurante\POS--RESTAURANTE, src/haciendaRoutes.ts) ya
// valida en producción contra Hacienda.
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
// solicitud de facturar indefinidamente. Mismo valor que usa el POS.
const HACIENDA_FETCH_TIMEOUT_MS = 20000;

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
  // "error": no se pudo saber (Hacienda caída, timeout) — NO significa que no lo tenga.
  estado: "recibido" | "procesando" | "aceptado" | "rechazado" | "error" | "no_encontrado" | "desconocido";
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

export async function consultarEstadoHacienda(ambiente: AmbienteHacienda, token: string, clave: string): Promise<EstadoHaciendaResultado> {
  let res: Response;
  try {
    res = await fetch(`${RECEPCION_BASE_URL[ambiente]}/recepcion/${clave}`, {
      headers: { "Authorization": `Bearer ${token}` },
      signal: AbortSignal.timeout(HACIENDA_FETCH_TIMEOUT_MS)
    });
  } catch {
    return { estado: "error", respuestaXmlBase64: null, detalleMensaje: null };
  }

  // 404/400 con un token válido y una clave bien formada (siempre lo está: la genera este sistema)
  // es Hacienda diciendo que no tiene esa clave. 401/403/5xx caen abajo como "error" (no se sabe).
  if (res.status === 404 || res.status === 400) {
    return { estado: "no_encontrado", respuestaXmlBase64: null, detalleMensaje: null };
  }
  if (!res.ok) {
    return { estado: "error", respuestaXmlBase64: null, detalleMensaje: null };
  }
  const data: any = await res.json().catch(() => null);
  const estadoCrudo = (data?.["ind-estado"] || "").toLowerCase();
  const estado: EstadoHaciendaResultado["estado"] =
    estadoCrudo === "recibido" || estadoCrudo === "procesando" || estadoCrudo === "aceptado" || estadoCrudo === "rechazado" || estadoCrudo === "error"
      ? estadoCrudo
      : "desconocido";
  const respuestaXmlBase64 = data?.["respuesta-xml"] || null;
  return { estado, respuestaXmlBase64, detalleMensaje: extraerDetalleMensajeHacienda(respuestaXmlBase64) };
}

/**
 * Sondeo corto justo DESPUÉS de un envío aceptado para procesar (mismo patrón que el POS: 4
 * consultas, 2 s entre cada una). Casi siempre basta para que el comprobante quede ACEPTADO o
 * RECHAZADO en la misma operación, con su MensajeHacienda guardado.
 *
 * Si no resuelve a tiempo, el comprobante queda ENVIADO y lo que sigue es SOLO volver a consultar
 * (POST /api/facturas/:id/estado), nunca reenviarlo: Hacienda rechaza el reenvío de una clave que ya
 * tiene, y el POS llegó a reintentar así una factura durante 7 horas que Hacienda ya había aceptado.
 */
export async function esperarResolucionHacienda(ambiente: AmbienteHacienda, token: string, clave: string, intentos = 4, esperaMs = 2000): Promise<EstadoHaciendaResultado> {
  let ultimo: EstadoHaciendaResultado = { estado: "recibido", respuestaXmlBase64: null, detalleMensaje: null };
  for (let i = 0; i < intentos; i++) {
    await new Promise(r => setTimeout(r, esperaMs));
    const consulta = await consultarEstadoHacienda(ambiente, token, clave);
    if (consulta.estado === "aceptado" || consulta.estado === "rechazado") return consulta;
    ultimo = consulta;
  }
  return ultimo;
}
