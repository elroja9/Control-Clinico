// Cliente del API pública de Hacienda Costa Rica (sin autenticación): catálogo CABYS,
// contribuyentes (actividades económicas), tipo de cambio y exoneraciones. Funciones puras: reciben
// la URL base ya leída de parametros_sistema (hacienda_api_publica_url) y no tocan la BD.
// Respuestas verificadas con curl el 2026-11-26; la de exoneración existente no está verificada y se
// trata de forma defensiva.
//
// Import exclusivo del servidor.

import { HACIENDA_FETCH_TIMEOUT_MS } from "./haciendaApi";

/** Error con el código HTTP que conviene devolver al navegador (400 entrada, 404 no existe, 502 Hacienda). */
export class HaciendaPublicaError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export interface CabysItem {
  codigo: string;
  descripcion: string;
  /** Tarifa de IVA en porcentaje (p. ej. 13); null si Hacienda no la indica. */
  impuesto: number | null;
}

export interface ActividadContribuyente {
  codigo: string;
  descripcion: string;
  estado: string | null;
  tipo: string | null;
}

export interface Contribuyente {
  nombre: string;
  tipoIdentificacion: string | null;
  regimen: { codigo: string | null; descripcion: string | null } | null;
  situacion: { moroso: boolean | null; omiso: boolean | null; estado: string | null; administracionTributaria: string | null } | null;
  actividades: ActividadContribuyente[];
}

export interface TipoCambio {
  dolar: { compra: { fecha: string | null; valor: number | null }; venta: { fecha: string | null; valor: number | null } };
  euro: { fecha: string | null; dolares: number | null; colones: number | null };
}

/** Campos conocidos de una exoneración; `crudo` conserva la respuesta completa para mostrar el resto. */
export interface Exoneracion {
  numeroDocumento: string | null;
  identificacion: string | null;
  porcentajeExoneracion: number | null;
  fechaEmision: string | null;
  fechaVencimiento: string | null;
  cabys: string[];
  tipoDocumento: string | null;
  nombreInstitucion: string | null;
  crudo: unknown;
}

export const CABYS_TERMINO_MIN = 3;
export const CABYS_TERMINO_MAX = 100;
export const AUTORIZACION_MAX = 40;

const RE_CODIGO_CABYS = /^\d{13}$/;
const RE_IDENTIFICACION = /^\d{9,12}$/;
// Números de autorización como "AL-00020402-24": letras, dígitos y guiones, empezando por letra o
// dígito. Sin "/": viaja como segmento de la ruta /api/hacienda/exoneracion/:autorizacion.
const RE_AUTORIZACION = new RegExp(`^[A-Za-z0-9][A-Za-z0-9-]{2,${AUTORIZACION_MAX - 1}}$`);

function normalizarBase(baseUrl: string): string {
  const base = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) {
    throw new HaciendaPublicaError("La URL del API pública de Hacienda no está configurada.", 500);
  }
  return base;
}

/** GET con timeout. Devuelve el JSON, o `null` si Hacienda respondió 404. */
async function obtenerJson(url: string): Promise<unknown | null> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(HACIENDA_FETCH_TIMEOUT_MS) });
  } catch (err: any) {
    const motivo = err?.name === "TimeoutError" ? "tiempo de espera agotado" : (err?.message || String(err));
    throw new HaciendaPublicaError(`No se pudo comunicar con Hacienda (${motivo}). Intente de nuevo en unos minutos.`, 502);
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    const causa = res.headers.get("x-error-cause");
    throw new HaciendaPublicaError(`Hacienda respondió ${res.status}${causa ? `: ${causa}` : "."}`, 502);
  }
  try {
    return await res.json();
  } catch {
    throw new HaciendaPublicaError("Hacienda devolvió una respuesta que no se pudo interpretar.", 502);
  }
}

const texto = (v: unknown): string | null => (typeof v === "string" || typeof v === "number" ? String(v) : null);
const numero = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const booleano = (v: unknown): boolean | null => {
  if (typeof v === "boolean") return v;
  if (v === "SI" || v === "S" || v === "true") return true;
  if (v === "NO" || v === "N" || v === "false") return false;
  return null;
};
const objeto = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null);

function normalizarCabys(el: unknown): CabysItem | null {
  const o = objeto(el);
  if (!o) return null;
  const codigo = texto(o.codigo);
  if (!codigo) return null;
  return { codigo, descripcion: texto(o.descripcion) ?? "", impuesto: numero(o.impuesto) };
}

/**
 * Busca en el catálogo CABYS. Un término de 13 dígitos se consulta como código (Hacienda devuelve
 * un ARREGLO); cualquier otro como texto (devuelve `{ total, cantidad, cabys: [...] }`).
 */
export async function cabys(baseUrl: string, termino: string, max: number): Promise<{ total: number | null; items: CabysItem[] }> {
  const t = String(termino ?? "").trim();
  if (!Number.isInteger(max) || max < 1) throw new HaciendaPublicaError("Máximo de resultados CABYS no válido.", 500);
  const base = normalizarBase(baseUrl);
  const esCodigo = RE_CODIGO_CABYS.test(t);
  if (!esCodigo && (t.length < CABYS_TERMINO_MIN || t.length > CABYS_TERMINO_MAX)) {
    throw new HaciendaPublicaError(`Escriba entre ${CABYS_TERMINO_MIN} y ${CABYS_TERMINO_MAX} caracteres, o un código CABYS de 13 dígitos.`, 400);
  }
  const url = esCodigo
    ? `${base}/fe/cabys?codigo=${encodeURIComponent(t)}`
    : `${base}/fe/cabys?q=${encodeURIComponent(t)}&top=${max}`;
  const data = await obtenerJson(url);
  if (data === null) return { total: 0, items: [] };
  const lista = Array.isArray(data) ? data : (objeto(data)?.cabys as unknown);
  const items = (Array.isArray(lista) ? lista : []).map(normalizarCabys).filter((x): x is CabysItem => x !== null).slice(0, max);
  const total = Array.isArray(data) ? items.length : numero(objeto(data)?.total);
  return { total, items };
}

/** Datos públicos de un contribuyente (nombre, régimen, situación y actividades económicas). */
export async function contribuyente(baseUrl: string, identificacion: string): Promise<Contribuyente> {
  const id = String(identificacion ?? "").replace(/[\s-]/g, "");
  if (!RE_IDENTIFICACION.test(id)) throw new HaciendaPublicaError("La identificación debe tener de 9 a 12 dígitos, sin letras.", 400);
  const base = normalizarBase(baseUrl);
  const data = objeto(await obtenerJson(`${base}/fe/ae?identificacion=${encodeURIComponent(id)}`));
  if (!data || !texto(data.nombre)) throw new HaciendaPublicaError("Contribuyente no encontrado en Hacienda.", 404);
  const regimen = objeto(data.regimen);
  const situacion = objeto(data.situacion);
  const actividades = (Array.isArray(data.actividades) ? data.actividades : [])
    .map(objeto)
    .filter((a): a is Record<string, unknown> => a !== null)
    .map(a => ({ codigo: texto(a.codigo) ?? "", descripcion: texto(a.descripcion) ?? "", estado: texto(a.estado), tipo: texto(a.tipo) }));
  return {
    nombre: texto(data.nombre) as string,
    tipoIdentificacion: texto(data.tipoIdentificacion),
    regimen: regimen ? { codigo: texto(regimen.codigo), descripcion: texto(regimen.descripcion) } : null,
    situacion: situacion
      ? { moroso: booleano(situacion.moroso), omiso: booleano(situacion.omiso), estado: texto(situacion.estado), administracionTributaria: texto(situacion.administracionTributaria) }
      : null,
    actividades
  };
}

/** Tipo de cambio de referencia del BCCR que publica Hacienda (dólar compra/venta y euro). */
export async function tipoCambio(baseUrl: string): Promise<TipoCambio> {
  const base = normalizarBase(baseUrl);
  const data = objeto(await obtenerJson(`${base}/indicadores/tc`));
  const dolar = objeto(data?.dolar);
  const euro = objeto(data?.euro);
  if (!dolar && !euro) throw new HaciendaPublicaError("Hacienda no devolvió el tipo de cambio.", 502);
  const compra = objeto(dolar?.compra);
  const venta = objeto(dolar?.venta);
  return {
    dolar: {
      compra: { fecha: texto(compra?.fecha), valor: numero(compra?.valor) },
      venta: { fecha: texto(venta?.fecha), valor: numero(venta?.valor) }
    },
    euro: { fecha: texto(euro?.fecha), dolares: numero(euro?.dolares), colones: numero(euro?.colones) }
  };
}

/** Valida un número de autorización de exoneración. 404 de Hacienda → «no encontrada». */
export async function exoneracion(baseUrl: string, autorizacion: string): Promise<Exoneracion> {
  const a = String(autorizacion ?? "").trim();
  if (a.length > AUTORIZACION_MAX || !RE_AUTORIZACION.test(a)) {
    throw new HaciendaPublicaError(`El número de autorización solo admite letras, números y guiones (de 3 a ${AUTORIZACION_MAX} caracteres).`, 400);
  }
  const base = normalizarBase(baseUrl);
  const data = await obtenerJson(`${base}/fe/ex?autorizacion=${encodeURIComponent(a)}`);
  const o = objeto(data);
  // Hacienda contesta 404 con { code: 404, status: "Information no available..." }; por si el mismo
  // cuerpo llegara con un 200, también cuenta como no encontrada.
  if (!o || numero(o.code) === 404) throw new HaciendaPublicaError("Exoneración no encontrada en Hacienda.", 404);
  const cabysCrudo = o.cabys;
  const cabysLista = Array.isArray(cabysCrudo)
    ? cabysCrudo.map(c => texto(c) ?? texto(objeto(c)?.codigo)).filter((c): c is string => !!c)
    : texto(cabysCrudo) ? [texto(cabysCrudo) as string] : [];
  return {
    numeroDocumento: texto(o.numeroDocumento),
    identificacion: texto(o.identificacion),
    porcentajeExoneracion: numero(o.porcentajeExoneracion),
    fechaEmision: texto(o.fechaEmision),
    fechaVencimiento: texto(o.fechaVencimiento),
    cabys: cabysLista,
    tipoDocumento: texto(o.tipoDocumento) ?? texto(objeto(o.tipoDocumento)?.descripcion),
    nombreInstitucion: texto(o.nombreInstitucion),
    crudo: data
  };
}
