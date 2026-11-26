// Cliente de los endpoints /api/hacienda/* (consultas a Hacienda hechas por el servidor) y
// utilidades compartidas por ConsultasHacienda y CabysSelector.
import { useEffect, useState } from 'react';
import { notify } from '../ui/Feedback';

export interface CabysItem {
  codigo: string;
  descripcion: string;
  impuesto: number | null;
}

export interface CabysSugerido extends CabysItem {
  perfil: string;
}

export interface TipoCambioRespuesta {
  dolar: { compra: { fecha: string | null; valor: number | null }; venta: { fecha: string | null; valor: number | null } };
  euro: { fecha: string | null; dolares: number | null; colones: number | null };
  consultadoEn: string;
}

export interface ContribuyenteRespuesta {
  nombre: string;
  tipoIdentificacion: string | null;
  regimen: { codigo: string | null; descripcion: string | null } | null;
  situacion: { moroso: boolean | null; omiso: boolean | null; estado: string | null; administracionTributaria: string | null } | null;
  actividades: Array<{ codigo: string; descripcion: string; estado: string | null; tipo: string | null }>;
}

export interface ExoneracionRespuesta {
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

export type AmbienteHacienda = 'SANDBOX' | 'PRODUCCION' | 'PRUEBAS_LOCAL';

export interface ComprobanteHacienda {
  clave: string;
  fecha: string | null;
  emisor: string | null;
  receptor: string | null;
  estado: string | null;
  local: { id: number; consecutivo: string; total: number; estado: string; receptorNombre: string | null } | null;
}

export interface ComprobantesRespuesta {
  ambiente: AmbienteHacienda;
  offset: number;
  limit: number;
  total: number | null;
  items: ComprobanteHacienda[];
}

export interface EstadoComprobanteRespuesta {
  clave: string;
  ambiente: AmbienteHacienda;
  estado: 'recibido' | 'procesando' | 'aceptado' | 'rechazado' | 'no_encontrado';
  detalleMensaje: string | null;
}

/** Error de la API con el código HTTP y los datos extra que mandó el servidor (p. ej. `ambiente`). */
export class ErrorApi extends Error {
  status: number;
  datos: any;
  constructor(message: string, status: number, datos: any) {
    super(message);
    this.status = status;
    this.datos = datos;
  }
}

/** GET JSON; si la respuesta no es 2xx lanza ErrorApi con el mensaje `error` del servidor. */
export async function pedirJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    throw new ErrorApi('No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.', 0, null);
  }
  const datos = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ErrorApi(datos?.error || `La consulta falló (código ${res.status}).`, res.status, datos);
  }
  return datos as T;
}

export const esAbort = (err: any) => err?.name === 'AbortError';

/** Valor que solo se actualiza tras `ms` sin cambios (para no consultar en cada tecla). */
export function useDebouncedValue<T>(valor: T, ms = 400): T {
  const [diferido, setDiferido] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setDiferido(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return diferido;
}

export async function copiarAlPortapapeles(texto: string, etiqueta = 'Copiado') {
  try {
    await navigator.clipboard.writeText(texto);
    notify.success(`${etiqueta}: ${texto}`);
  } catch {
    notify.error('No se pudo copiar. Selecciónelo y cópielo manualmente.');
  }
}

/** Fecha legible en es-CR si se puede interpretar; si no, el texto tal cual. */
export function formatearFecha(valor: string | null | undefined, conHora = false): string {
  if (!valor) return '—';
  // Una fecha sola ("2026-11-26") la interpreta JS como medianoche UTC, que en Costa Rica (UTC-6)
  // se mostraba como el día anterior. Se arma como fecha local.
  const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  const d = soloFecha
    ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
    : new Date(valor.includes(' ') && !valor.includes('T') ? valor.replace(' ', 'T') : valor);
  if (Number.isNaN(d.getTime())) return valor;
  return d.toLocaleString('es-CR', conHora ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}

export const formatearColones = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** Texto del Badge de IVA de un código CABYS. */
export const etiquetaIva = (impuesto: number | null) => (impuesto == null ? 'IVA s/d' : `IVA ${impuesto}%`);

/** Hook de búsqueda CABYS con debounce y cancelación de la consulta anterior. */
export function useBusquedaCabys(termino: string) {
  const diferido = useDebouncedValue(termino.trim(), 400);
  const [resultados, setResultados] = useState<CabysItem[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buscado, setBuscado] = useState('');

  useEffect(() => {
    // Mismo mínimo que valida el servidor (3 caracteres o un código de 13 dígitos).
    if (diferido.length < 3) {
      setResultados([]);
      setError(null);
      setCargando(false);
      setBuscado('');
      return;
    }
    const ctrl = new AbortController();
    setCargando(true);
    setError(null);
    pedirJson<{ total: number | null; items: CabysItem[] }>(`/api/hacienda/cabys?q=${encodeURIComponent(diferido)}`, ctrl.signal)
      .then(r => { setResultados(r.items); setBuscado(diferido); })
      .catch(err => { if (!esAbort(err)) { setResultados([]); setError(err.message); setBuscado(diferido); } })
      .finally(() => { if (!ctrl.signal.aborted) setCargando(false); });
    return () => ctrl.abort();
  }, [diferido]);

  return { resultados, cargando: cargando || (termino.trim().length >= 3 && termino.trim() !== diferido), error, buscado };
}

/** Sugeridos de la clínica (una sola carga). */
export function useCabysSugeridos(perfil?: string) {
  const [sugeridos, setSugeridos] = useState<CabysSugerido[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    pedirJson<CabysSugerido[]>('/api/hacienda/cabys/sugeridos', ctrl.signal)
      .then(r => setSugeridos(Array.isArray(r) ? r : []))
      .catch(err => { if (!esAbort(err)) setError(err.message); })
      .finally(() => { if (!ctrl.signal.aborted) setCargando(false); });
    return () => ctrl.abort();
  }, []);
  // `perfil` permite acotar a una especialidad (más los generales) dentro de lo que ya trae la empresa.
  const visibles = perfil ? sugeridos.filter(s => s.perfil === perfil || s.perfil === 'General') : sugeridos;
  return { sugeridos: visibles, cargando, error };
}
