// Cliente HTTP para el API de Recepción de Comprobantes Electrónicos de Hacienda Costa Rica
// (envío del XML firmado) y el IdP de Hacienda (token OAuth2). Endpoints verificados por
// investigación cruzada de fuentes en julio 2026 — NO confirmados contra un envío real todavía
// en este proyecto. Antes de usar en producción, probar primero contra el ambiente SANDBOX.
//
// Import exclusivo del servidor.

export type AmbienteHacienda = "SANDBOX" | "PRODUCCION";

const IDP_TOKEN_URL: Record<AmbienteHacienda, string> = {
  SANDBOX: "https://idp.comprobanteselectronicos.go.cr/auth/realms/rut-stag/protocol/openid-connect/token",
  PRODUCCION: "https://idp.comprobanteselectronicos.go.cr/auth/realms/rut/protocol/openid-connect/token"
};

const CLIENT_ID: Record<AmbienteHacienda, string> = {
  SANDBOX: "api-stag",
  PRODUCCION: "api-prod"
};

const RECEPCION_BASE_URL: Record<AmbienteHacienda, string> = {
  SANDBOX: "https://api.comprobanteselectronicos.go.cr/recepcion-sandbox/v1",
  PRODUCCION: "https://api.comprobanteselectronicos.go.cr/recepcion/v1"
};

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
    body: body.toString()
  });

  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new HaciendaApiError(`No se pudo obtener el token de Hacienda (${res.status}): ${texto.slice(0, 300)}`);
  }
  const data: any = await res.json();
  if (!data.access_token) {
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
      "Authorization": `bearer ${token}`
    },
    body: JSON.stringify(body)
  });

  const texto = await res.text().catch(() => "");
  if (res.status === 201 || res.status === 202) {
    return { aceptadoParaProcesar: true, location: res.headers.get("location"), mensaje: null };
  }
  return { aceptadoParaProcesar: false, location: null, mensaje: `Hacienda rechazó el envío (${res.status}): ${texto.slice(0, 500)}` };
}

export interface EstadoHaciendaResultado {
  estado: "recibido" | "procesando" | "aceptado" | "rechazado" | "error" | "desconocido";
  respuestaXmlBase64: string | null;
}

export async function consultarEstadoHacienda(ambiente: AmbienteHacienda, token: string, clave: string): Promise<EstadoHaciendaResultado> {
  const res = await fetch(`${RECEPCION_BASE_URL[ambiente]}/recepcion/${clave}`, {
    headers: { "Authorization": `bearer ${token}` }
  });

  if (!res.ok) {
    return { estado: "error", respuestaXmlBase64: null };
  }
  const data: any = await res.json().catch(() => null);
  const estadoCrudo = (data?.["ind-estado"] || "").toLowerCase();
  const estado: EstadoHaciendaResultado["estado"] =
    estadoCrudo === "recibido" || estadoCrudo === "procesando" || estadoCrudo === "aceptado" || estadoCrudo === "rechazado" || estadoCrudo === "error"
      ? estadoCrudo
      : "desconocido";
  return { estado, respuestaXmlBase64: data?.["respuesta-xml"] || null };
}
