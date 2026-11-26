import { useEffect, useState } from 'react';
import { Inbox, RefreshCw, Download, Ban } from 'lucide-react';
import { FacturaCorreo } from '../data/mockData';
import { notify, confirmar } from './ui/Feedback';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Select } from './ui/Select';

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
    <section className="mb-4 p-4 bg-surface-muted border border-border rounded-card space-y-3" aria-labelledby="bandeja-correo-titulo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 id="bandeja-correo-titulo" className="text-body font-semibold text-fg flex items-center gap-2">
          <Inbox className="w-4 h-4 text-fg-subtle" aria-hidden="true" />
          Facturas recibidas por correo
        </h4>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <label htmlFor="bandeja-filtro" className="sr-only">Estado</label>
          <Select id="bandeja-filtro" value={filtro} onChange={(e: any) => setFiltro(e.target.value as Filtro)} wrapperClassName="flex-1 min-w-36 sm:flex-none sm:w-40">
            <option value="PENDIENTE">Pendientes</option>
            <option value="IMPORTADA">Importadas</option>
            <option value="DESCARTADA">Descartadas</option>
            <option value="">Todas</option>
          </Select>
          {!soloLectura && (
            <Button
              variant="outline"
              onClick={revisarAhora}
              disabled={revisando}
              icon={<RefreshCw className={`w-4 h-4 ${revisando ? 'animate-spin' : ''}`} aria-hidden="true" />}
              className="flex-1 sm:flex-none"
            >
              {revisando ? 'Revisando…' : 'Revisar correo ahora'}
            </Button>
          )}
        </div>
      </div>

      {error ? (
        <p className="text-xs text-fg-muted" role="status">{error}</p>
      ) : facturas.length === 0 ? (
        <p className="text-xs text-fg-muted py-2" role="status">
          {filtro === 'PENDIENTE'
            ? 'No hay facturas pendientes. Configure el buzón en Personalizar → Correo entrante para que las facturas de sus proveedores lleguen aquí.'
            : 'No hay facturas en este estado.'}
        </p>
      ) : (
        <ul className="divide-y divide-border bg-surface rounded-control border border-border">
          {facturas.map(f => (
            <li key={f.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-3 text-xs">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-fg text-body break-words sm:truncate">
                  {f.emisorNombre} <span className="font-normal text-fg-muted text-xs">· {f.tipoDocumento === '04' ? 'Tiquete' : 'Factura'} {f.numeroConsecutivo}</span>
                </p>
                <p className="text-fg-muted break-words sm:truncate">
                  {f.fechaEmision.slice(0, 10)} · <span className="font-semibold text-fg tabular-nums">{colones(f.montoTotal)}</span>
                  {f.moneda !== 'CRC' && (f.tipoCambio > 0 ? ` (${f.moneda}, TC ${f.tipoCambio})` : ` (${f.moneda} sin tipo de cambio: no se puede importar)`)}
                  {' · '}De: {f.remitente || 'remitente desconocido'}
                </p>
                {f.estado === 'IMPORTADA' && <p className="mt-1"><Badge tone="success">Importada{f.idCuentaPagar ? ` (cuenta por pagar #${f.idCuentaPagar})` : ''}</Badge></p>}
                {f.estado === 'DESCARTADA' && <p className="mt-1"><Badge tone="neutral">Descartada</Badge></p>}
              </div>
              {!soloLectura && f.estado === 'PENDIENTE' && (
                <div className="flex gap-2 shrink-0 [&>*]:flex-1 sm:[&>*]:flex-none">
                  <Button size="sm" onClick={() => importar(f)} disabled={ocupadoId === f.id} icon={<Download className="w-4 h-4" aria-hidden="true" />}>Importar</Button>
                  <Button size="sm" variant="outline" onClick={() => descartar(f)} disabled={ocupadoId === f.id} icon={<Ban className="w-4 h-4" aria-hidden="true" />}>Descartar</Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
