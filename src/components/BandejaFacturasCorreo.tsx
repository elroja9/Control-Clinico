import { useEffect, useState } from 'react';
import { Inbox, RefreshCw, Download, Ban } from 'lucide-react';
import { FacturaCorreo } from '../data/mockData';
import { notify, confirmar } from './ui/Feedback';

// Bandeja de las facturas de proveedor que el servidor leyó del buzón de la empresa (ver
// server/correoProveedores.ts). No crea cuentas por pagar: "Importar" entrega el XML al mismo flujo
// de confirmación de "Cargar Factura XML" en CxPManager.

interface Props {
  version: number; // CxPManager lo incrementa tras importar, para recargar la lista
  onImportar: (factura: FacturaCorreo, xml: string) => void;
  soloLectura?: boolean; // Contador: solo ver la bandeja (sin revisar, importar ni descartar)
}

type Filtro = 'PENDIENTE' | 'IMPORTADA' | 'DESCARTADA' | '';

async function pedir<T>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'No se pudo completar la operación.');
  return data as T;
}

const colones = (n: number) => `₡${n.toLocaleString('es-CR', { maximumFractionDigits: 2 })}`;

export default function BandejaFacturasCorreo({ version, onImportar, soloLectura = false }: Props) {
  const [filtro, setFiltro] = useState<Filtro>('PENDIENTE');
  const [facturas, setFacturas] = useState<FacturaCorreo[]>([]);
  const [error, setError] = useState('');
  const [revisando, setRevisando] = useState(false);
  const [ocupadoId, setOcupadoId] = useState<number | null>(null);
  const [recarga, setRecarga] = useState(0);

  useEffect(() => {
    pedir<FacturaCorreo[]>(`/api/facturas-correo${filtro ? `?estado=${filtro}` : ''}`)
      .then(f => { setFacturas(f); setError(''); })
      .catch(err => setError(err.message));
  }, [filtro, version, recarga]);

  const revisarAhora = async () => {
    setRevisando(true);
    try {
      const r = await pedir<{ nuevos: number; yaRegistrados: number; revisados: number; buzonAlDia: boolean; carpetasConError: { carpeta: string; error: string }[] }>(
        '/api/facturas-correo/revisar-ahora', 'POST'
      );
      const partes = [
        r.nuevos ? `${r.nuevos} factura(s) nueva(s)` : 'Sin facturas nuevas',
        r.yaRegistrados ? `${r.yaRegistrados} ya estaban registradas` : '',
        `${r.revisados} correo(s) revisado(s)`,
        r.buzonAlDia ? '' : 'quedan correos por revisar en la próxima pasada'
      ].filter(Boolean);
      notify.success(partes.join(' · ') + '.');
      for (const f of r.carpetasConError) notify.warning(`No se pudo revisar la carpeta "${f.carpeta}": ${f.error}`);
      setRecarga(n => n + 1);
    } catch (err: any) {
      notify.error(err.message);
    } finally {
      setRevisando(false);
    }
  };

  const importar = async (f: FacturaCorreo) => {
    setOcupadoId(f.id);
    try {
      const { xml } = await pedir<{ xml: string }>(`/api/facturas-correo/${f.id}/xml`);
      onImportar(f, xml);
    } catch (err: any) {
      notify.error(err.message);
    } finally {
      setOcupadoId(null);
    }
  };

  const descartar = async (f: FacturaCorreo) => {
    const ok = await confirmar({
      title: '¿Descartar esta factura?',
      message: `La factura ${f.numeroConsecutivo} de ${f.emisorNombre} saldrá de la bandeja sin registrarse como cuenta por pagar.`,
      confirmText: 'Descartar',
      tone: 'warning'
    });
    if (!ok) return;
    setOcupadoId(f.id);
    try {
      await pedir(`/api/facturas-correo/${f.id}/estado`, 'POST', { estado: 'DESCARTADA', motivoDescarte: 'Descartada desde la bandeja' });
      setRecarga(n => n + 1);
    } catch (err: any) {
      notify.error(err.message);
    } finally {
      setOcupadoId(null);
    }
  };

  return (
    <section className="mb-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3" aria-labelledby="bandeja-correo-titulo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id="bandeja-correo-titulo" className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <Inbox className="w-4 h-4 text-slate-500" aria-hidden="true" />
          Facturas recibidas por correo
        </h4>
        <div className="flex items-center gap-2">
          <label htmlFor="bandeja-filtro" className="sr-only">Estado</label>
          <select id="bandeja-filtro" value={filtro} onChange={e => setFiltro(e.target.value as Filtro)} className="text-xs bg-white border border-slate-200 rounded-lg px-2 py-1.5">
            <option value="PENDIENTE">Pendientes</option>
            <option value="IMPORTADA">Importadas</option>
            <option value="DESCARTADA">Descartadas</option>
            <option value="">Todas</option>
          </select>
          {!soloLectura && (
            <button type="button" onClick={revisarAhora} disabled={revisando} className="flex items-center gap-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60">
              <RefreshCw className={`w-3.5 h-3.5 ${revisando ? 'animate-spin' : ''}`} aria-hidden="true" />
              {revisando ? 'Revisando…' : 'Revisar correo ahora'}
            </button>
          )}
        </div>
      </div>

      {error ? (
        <p className="text-xs text-slate-600" role="status">{error}</p>
      ) : facturas.length === 0 ? (
        <p className="text-xs text-slate-600" role="status">
          {filtro === 'PENDIENTE'
            ? 'No hay facturas pendientes. Configure el buzón en Personalizar → Correo entrante para que las facturas de sus proveedores lleguen aquí.'
            : 'No hay facturas en este estado.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-200 bg-white rounded-lg border border-slate-200">
          {facturas.map(f => (
            <li key={f.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-800 truncate">
                  {f.emisorNombre} <span className="font-normal text-slate-500">· {f.tipoDocumento === '04' ? 'Tiquete' : 'Factura'} {f.numeroConsecutivo}</span>
                </p>
                <p className="text-slate-600 truncate">
                  {f.fechaEmision.slice(0, 10)} · <span className="font-semibold text-slate-800">{colones(f.montoTotal)}</span>
                  {f.moneda !== 'CRC' && (f.tipoCambio > 0 ? ` (${f.moneda}, TC ${f.tipoCambio})` : ` (${f.moneda} sin tipo de cambio: no se puede importar)`)}
                  {' · '}De: {f.remitente || 'remitente desconocido'}
                </p>
                {f.estado === 'IMPORTADA' && <p className="text-emerald-700 font-semibold">Importada{f.idCuentaPagar ? ` (cuenta por pagar #${f.idCuentaPagar})` : ''}</p>}
                {f.estado === 'DESCARTADA' && <p className="text-slate-500 font-semibold">Descartada</p>}
              </div>
              {!soloLectura && f.estado === 'PENDIENTE' && (
                <div className="flex gap-1.5 shrink-0">
                  <button type="button" onClick={() => importar(f)} disabled={ocupadoId === f.id} className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg font-semibold disabled:opacity-60">
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />Importar
                  </button>
                  <button type="button" onClick={() => descartar(f)} disabled={ocupadoId === f.id} className="flex items-center gap-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg font-semibold disabled:opacity-60">
                    <Ban className="w-3.5 h-3.5" aria-hidden="true" />Descartar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
