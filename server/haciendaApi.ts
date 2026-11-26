// Cliente HTTP para el API de Recepción de Comprobantes Electrónicos de Hacienda Costa Rica
// (envío del XML firmado) y el IdP de Hacienda (token OAuth2). Las URLs, el header y el sondeo de
// estado siguen lo que el POS de restaurante (repositorio pos-restaurante, haciendaRoutes.ts) ya
// valida en producción contra Hacienda — ver
// docs/superpowers/specs/2026-09-30-fixes-pos-facturacion-anulacion-cxc-cxp-design.md.
//
// Import exclusivo del servidor.

export type AmbienteHacienda = "SANDBOX" | "PRODUCCION" | "PRUEBAS_LOCAL";

// Sin límite, un IdP o API de recepción que acepta la conexión y nunca responde deja colgada la
// solicitud de facturar indefinidamente. El valor vigente sale de parametros_sistema
// (hacienda_fetch_timeout_ms) y server.ts lo pasa a cada función; este es solo el valor por
// omisión documentado de los parámetros opcionales (el mismo del POS y el que siembra la
// migración), para las consultas públicas de server/haciendaPublica.ts y las pruebas.
export const HACIENDA_FETCH_TIMEOUT_MS = 20000;

export class HaciendaApiError extends Error {}

/**
 * URLs y client_id de Hacienda para UN ambiente, ya resueltos desde parametros_sistema (regla del
 * proyecto: nada de valores de negocio quemados). Quien llama los resuelve con
 * `resolverEndpointsHacienda` y se los pasa a cada función, así las pruebas inyectan los suyos.
 */
export interface EndpointsHacienda {
  /** URL del token OAuth2 del IdP (hacienda_idp_url_<ambiente>). */
  idpTokenUrl: string;
  /** client_id del IdP (hacienda_client_id_<ambiente>). */
  clientId: string;
  /** Base del API de Recepción, sin barra final (hacienda_recepcion_url_<ambiente>). */
  recepcionUrl: string;
}

/** Lector de un parámetro del sistema: devuelve el valor o undefined si no existe. */
export type LectorParametro = (clave: string) => string | undefined;

/**
 * Resuelve los endpoints de un ambiente leyendo `hacienda_idp_url_*`, `hacienda_client_id_*` y
 * `hacienda_recepcion_url_*`. PRUEBAS_LOCAL nunca llama a Hacienda (server.ts salta la llamada),
 * así que devuelve endpoints vacíos, igual que las constantes de antes. Falta un parámetro → lanza
 * HaciendaApiError antes de que salga nada de este servidor.
 */
export function resolverEndpointsHacienda(ambiente: AmbienteHacienda, leer: LectorParametro): EndpointsHacienda {
  if (ambiente === "PRUEBAS_LOCAL") return { idpTokenUrl: "", clientId: "", recepcionUrl: "" };
  const sufijo = ambiente === "PRODUCCION" ? "produccion" : "sandbox";
  const requerido = (clave: string): string => {
    const valor = (leer(clave) ?? "").trim();
    if (!valor) throw new HaciendaApiError(`Falta configurar el parámetro del sistema «${clave}».`);
    return valor;
  };
  return {
    idpTokenUrl: requerido(`hacienda_idp_url_${sufijo}`),
    clientId: requerido(`hacienda_client_id_${sufijo}`),
    recepcionUrl: requerido(`hacienda_recepcion_url_${sufijo}`).replace(/\/+$/, "")
  };
}

export interface TokenHacienda {
  token: string;
  /** Vigencia que informó el IdP (expires_in, segundos); null si no la informó. */
  expiraEnSeg: number | null;
}

/** Login en el IdP de Hacienda: token y su vigencia. */
export async function obtenerTokenHaciendaConVigencia(endpoints: EndpointsHacienda, usuarioAtv: string, passwordAtv: string, timeoutMs = HACIENDA_FETCH_TIMEOUT_MS): Promise<TokenHacienda> {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: endpoints.clientId,
    username: usuarioAtv,
    password: passwordAtv
  });

  const res = await fetch(endpoints.idpTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw new HaciendaApiError(`No se pudo obtener el token de Hacienda (${res.status}): ${texto.slice(0, 300)}`);
  }
  const data: any = await res.json();
  if (!data.access_token || typeof data.access_token !== "string") {
    throw new HaciendaApiError("Hacienda no devolvió un access_token.");
  }
  const expira = Number(data.expires_in);
  return { token: data.access_token, expiraEnSeg: Number.isFinite(expira) && expira > 0 ? expira : null };
}

export async function obtenerTokenHacienda(endpoints: EndpointsHacienda, usuarioAtv: string, passwordAtv: string, timeoutMs = HACIENDA_FETCH_TIMEOUT_MS): Promise<string> {
  return (await obtenerTokenHaciendaConVigencia(endpoints, usuarioAtv, passwordAtv, timeoutMs)).token;
}

/**
 * Caché de tokens del IdP por (empresa, ambiente, usuario ATV). Un token vale hasta
 * `expires_in − margen`; sin `expires_in` no se guarda. Se invalida al recibir un 401 y al cambiar
 * las credenciales o el certificado de la empresa (invalidarEmpresa). Pura: el reloj se inyecta.
 */
export interface CacheTokensHacienda {
  obtener(clave: string): string | null;
  guardar(clave: string, token: TokenHacienda): void;
  invalidar(clave: string): void;
  invalidarEmpresa(idCompania: number): void;
  tamano(): number;
}

export function claveCacheToken(idCompania: number, ambiente: AmbienteHacienda, usuarioAtv: string): string {
  return `${idCompania}|${ambiente}|${usuarioAtv}`;
}

export function crearCacheTokensHacienda(opciones: { margenSeg: () => number; ahora?: () => number }): CacheTokensHacienda {
  const ahora = opciones.ahora ?? (() => Date.now());
  const entradas = new Map<string, { token: string; expira: number }>();
  return {
    obtener(clave) {
      const e = entradas.get(clave);
      if (!e) return null;
      if (e.expira <= ahora()) {
        entradas.delete(clave);
        return null;
      }
      return e.token;
    },
    guardar(clave, t) {
      if (!t.expiraEnSeg) return;
      const vigenciaMs = (t.expiraEnSeg - Math.max(0, opciones.margenSeg())) * 1000;
      if (vigenciaMs <= 0) return;
      entradas.set(clave, { token: t.token, expira: ahora() + vigenciaMs });
    },
    invalidar(clave) {
      entradas.delete(clave);
    },
    invalidarEmpresa(idCompania) {
      for (const k of Array.from(entradas.keys())) if (k.startsWith(`${idCompania}|`)) entradas.delete(k);
    },
    tamano() {
      return entradas.size;
    }
  };
}

export interface EnvioHaciendaResultado {
  aceptadoParaProcesar: boolean;
  location: string | null;
  mensaje: string | null;
  /** Código HTTP de la respuesta (para distinguir 401, clave repetida, 5xx…). */
  status?: number;
  /** Header X-Error-Cause de Hacienda, si vino. */
  causa?: string | null;
}

/**
 * Envía el comprobante firmado a Hacienda. `xmlFirmado` va como XML en texto plano (no base64) —
 * Hacienda lo espera en base64 dentro de `comprobanteXml` según el API de Recepción.
 */
export async function enviarFacturaHacienda(params: {
  endpoints: EndpointsHacienda;
  token: string;
  clave: string;
  fechaEmisionIso: string;
  tipoIdentificacionEmisor: string;
  cedulaEmisor: string;
  tipoIdentificacionReceptor?: string;
  cedulaReceptor?: string;
  xmlFirmado: string;
  timeoutMs?: number;
}): Promise<EnvioHaciendaResultado> {
  const { endpoints, token, clave, fechaEmisionIso, tipoIdentificacionEmisor, cedulaEmisor, tipoIdentificacionReceptor, cedulaReceptor, xmlFirmado } = params;

  const body: any = {
    clave,
    fecha: fechaEmisionIso,
    emisor: { tipoIdentificacion: tipoIdentificacionEmisor, numeroIdentificacion: cedulaEmisor },
    comprobanteXml: Buffer.from(xmlFirmado, "utf8").toString("base64")
  };
  if (cedulaReceptor) {
    body.receptor = { tipoIdentificacion: tipoIdentificacionReceptor, numeroIdentificacion: cedulaReceptor };
  }

  const res = await fetch(`${endpoints.recepcionUrl}/recepcion`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(params.timeoutMs ?? HACIENDA_FETCH_TIMEOUT_MS)
  });

  const texto = await res.text().catch(() => "");
  if (res.status === 201 || res.status === 202) {
    return { aceptadoParaProcesar: true, location: res.headers.get("location"), mensaje: null, status: res.status, causa: null };
  }
  // Hacienda explica el rechazo de la recepción en el header X-Error-Cause, a menudo con el cuerpo
  // vacío (así responde, por ejemplo, a un comprobante que ya había recibido).
  const causa = res.headers.get("x-error-cause");
  const detalle = [causa, texto.slice(0, 500)].filter(Boolean).join(" — ");
  return { aceptadoParaProcesar: false, location: null, mensaje: `Hacienda rechazó el envío (${res.status})${detalle ? `: ${detalle}` : ""}`, status: res.status, causa };
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
  // Código HTTP de la consulta (401 = token vencido), si hubo respuesta.
  httpStatus?: number;
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

export async function consultarEstadoHacienda(endpoints: EndpointsHacienda, token: string, clave: string, timeoutMs = HACIENDA_FETCH_TIMEOUT_MS): Promise<EstadoHaciendaResultado> {
  let res: Response;
  try {
    res = await fetch(`${endpoints.recepcionUrl}/recepcion/${clave}`, {
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
    return { estado: "error", respuestaXmlBase64: null, detalleMensaje: res.headers.get("x-error-cause"), httpStatus: res.status };
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
export interface ParametrosSondeo {
  intentos: number;
  esperaMs: number;
  /** Plazo total del sondeo. */
  plazoMs: number;
  /** Tope de cada consulta individual. */
  consultaTimeoutMs: number;
}

/** Valores por omisión documentados (los mismos que siembra la migración en parametros_sistema). */
export const SONDEO_POR_OMISION: ParametrosSondeo = { intentos: 4, esperaMs: 2000, plazoMs: 12000, consultaTimeoutMs: 5000 };

export async function esperarResolucionHacienda(endpoints: EndpointsHacienda, token: string, clave: string, sondeo: ParametrosSondeo = SONDEO_POR_OMISION): Promise<EstadoHaciendaResultado> {
  const { intentos, esperaMs, plazoMs, consultaTimeoutMs } = sondeo;
  const limite = Date.now() + plazoMs;
  let ultimo: EstadoHaciendaResultado = { estado: "recibido", respuestaXmlBase64: null, detalleMensaje: null };
  for (let i = 0; i < intentos; i++) {
    await new Promise(r => setTimeout(r, esperaMs));
    const restante = limite - Date.now();
    if (restante <= 0) break;
    const consulta = await consultarEstadoHacienda(endpoints, token, clave, Math.min(consultaTimeoutMs, restante));
    if (consulta.estado === "aceptado" || consulta.estado === "rechazado") return consulta;
    ultimo = consulta;
  }
  return ultimo;
}

/**
 * Emisor en el formato que pide GET /comprobantes: tipo de identificación (2 dígitos) más la
 * identificación rellenada con ceros a 12 (p. ej. "02" + "3101123456" → "02003101123456").
 * Devuelve null si los datos de la empresa no permiten armarlo.
 */
export function formatoEmisorHacienda(tipoIdentificacion: string | null | undefined, identificacion: string | null | undefined): string | null {
  const tipo = String(tipoIdentificacion ?? "").trim();
  const numero = String(identificacion ?? "").replace(/[\s-]/g, "");
  if (!/^\d{2}$/.test(tipo) || !/^\d{9,12}$/.test(numero)) return null;
  return tipo + numero.padStart(12, "0");
}

export interface ComprobanteEmitidoHacienda {
  clave: string;
  fecha: string | null;
  emisor: string | null;
  receptor: string | null;
  estado: string | null;
}

export interface ListaComprobantesHacienda {
  items: ComprobanteEmitidoHacienda[];
  total?: number;
  /** Presente solo si la consulta falló: motivo legible, con el X-Error-Cause de Hacienda si vino. */
  errorCausa?: string;
}

// Hacienda puede mandar el emisor/receptor como texto o como objeto {nombre, numeroIdentificacion…}.
function textoParte(valor: unknown): string | null {
  if (valor == null) return null;
  if (typeof valor === "string" || typeof valor === "number") return String(valor) || null;
  if (typeof valor === "object") {
    const o = valor as Record<string, unknown>;
    const nombre = o.nombre ?? o.name;
    const numero = o.numeroIdentificacion ?? o.identificacion;
    const partes = [nombre, numero].filter(p => typeof p === "string" || typeof p === "number").map(String);
    return partes.length ? partes.join(" — ") : null;
  }
  return null;
}

function textoOpcional(valor: unknown): string | null {
  return typeof valor === "string" || typeof valor === "number" ? String(valor) : null;
}

/** La forma con token no está verificada: se acepta un arreglo o un objeto que contenga uno. */
function extraerArregloComprobantes(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const k of ["comprobantes", "items", "data", "content", "resultados"]) {
      if (Array.isArray(o[k])) return o[k] as unknown[];
    }
    const primero = Object.values(o).find(Array.isArray);
    if (primero) return primero as unknown[];
  }
  return [];
}

/** Total de la paginación: X-Total-Count, o el número tras "/" en Content-Range ("items 0-19/245"). */
function totalDesdeCabeceras(headers: Headers): number | undefined {
  const xTotal = parseInt(headers.get("x-total-count") || "", 10);
  if (Number.isFinite(xTotal) && xTotal >= 0) return xTotal;
  const rango = headers.get("content-range")?.match(/\/\s*(\d+)\s*$/);
  if (rango) return parseInt(rango[1], 10);
  return undefined;
}

/**
 * Lista los comprobantes emitidos por `emisor` en Hacienda (GET {recepcion}/comprobantes). Nunca
 * lanza: cualquier falla vuelve como `errorCausa` (con el X-Error-Cause de Hacienda) e `items` vacío.
 * PRUEBAS_LOCAL no llama a Hacienda.
 */
export async function listarComprobantesEmitidos(params: {
  token: string;
  ambiente: AmbienteHacienda;
  emisor: string;
  offset: number;
  limit: number;
  endpoints: EndpointsHacienda;
  timeoutMs?: number;
}): Promise<ListaComprobantesHacienda> {
  const { token, ambiente, emisor, offset, limit, endpoints } = params;
  if (ambiente === "PRUEBAS_LOCAL") {
    return { items: [], errorCausa: "La empresa está en ambiente de pruebas locales: sus comprobantes nunca se envían a Hacienda." };
  }
  if (!/^\d{14}$/.test(emisor)) {
    return { items: [], errorCausa: "El emisor debe tener 14 dígitos (tipo de identificación y número rellenado a 12)." };
  }
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1) {
    return { items: [], errorCausa: "Paginación no válida." };
  }

  const url = `${endpoints.recepcionUrl}/comprobantes?offset=${offset}&limit=${limit}&emisor=${encodeURIComponent(emisor)}`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
      signal: AbortSignal.timeout(params.timeoutMs ?? HACIENDA_FETCH_TIMEOUT_MS)
    });
  } catch (err: any) {
    return { items: [], errorCausa: `No se pudo comunicar con Hacienda (${err?.name === "TimeoutError" ? "tiempo de espera agotado" : err?.message || err}).` };
  }

  if (!res.ok) {
    const causa = res.headers.get("x-error-cause");
    const texto = causa ? "" : (await res.text().catch(() => "")).slice(0, 300);
    const detalle = causa || texto;
    return { items: [], errorCausa: `Hacienda respondió ${res.status}${detalle ? `: ${detalle}` : "."}` };
  }

  const data: unknown = await res.json().catch(() => null);
  if (data === null) {
    return { items: [], errorCausa: "Hacienda devolvió una respuesta que no se pudo interpretar." };
  }
  const items: ComprobanteEmitidoHacienda[] = [];
  for (const el of extraerArregloComprobantes(data)) {
    if (!el || typeof el !== "object") continue;
    const o = el as Record<string, unknown>;
    const clave = textoOpcional(o.clave);
    if (!clave) continue;
    items.push({
      clave,
      fecha: textoOpcional(o.fecha ?? o.fechaEmision),
      emisor: textoParte(o.emisor),
      receptor: textoParte(o.receptor),
      estado: textoOpcional(o.estado ?? o["ind-estado"])
    });
  }
  const total = totalDesdeCabeceras(res.headers);
  return total === undefined ? { items } : { items, total };
}
