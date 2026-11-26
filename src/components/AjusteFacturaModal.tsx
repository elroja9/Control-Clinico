import React, { useState } from 'react';
import { Servicio, Factura, FacturaLinea } from '../data/mockData';
import { FileMinus, FilePlus, AlertCircle, Check, Loader2 } from 'lucide-react';
import { MEDIO_PAGO_HACIENDA, colones } from '../utils/facturacion';
import { Button } from './ui/Button';
import { ResponsiveModal } from './ui/ResponsiveModal';
import { Input } from './ui/Input';
import { Select } from './ui/Select';

interface AjusteFacturaModalProps {
  tipo: 'CREDITO' | 'DEBITO';
  factura: Factura;
  servicios: Servicio[];
  ivaPorDefecto: number;
  // Cuánto se acreditó ya de cada servicio en Notas de Crédito anteriores sobre esta factura.
  yaAcreditado: Record<number, number>;
  motivoMax: number;
  onEmitir: (idFactura: number, payload: {
    motivo: string;
    lineas: Array<{ idServicio: number; cantidad: number }>;
    medioPago?: string;
  }) => Promise<Factura>;
  onClose: () => void;
  themeColor: string;
}

/** Modal compartido para emitir una Nota de Crédito parcial (acredita cantidades de líneas ya
 * facturadas, sin anular toda la factura — para eso está el botón "Anular Factura") o una Nota de
 * Débito (agrega un cargo nuevo sobre una factura ya emitida) — ambas pueden ser parciales o
 * cubrir el total, según cuánto seleccione el usuario. */
export default function AjusteFacturaModal({ tipo, factura, servicios, ivaPorDefecto, yaAcreditado, motivoMax, onEmitir, onClose, themeColor }: AjusteFacturaModalProps) {
  const esCredito = tipo === 'CREDITO';
  // La nota hereda la condición de la factura: sobre una venta a crédito no se cobra en el acto.
  const pideMedioPago = !esCredito && factura.condicionVenta !== '02';
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [motivo, setMotivo] = useState('');
  const [medioPago, setMedioPago] = useState('01');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<Factura | null>(null);
  const cerrarSiSePuede = () => { if (!enviando) onClose(); };

  // Para Nota de Crédito, las opciones son las propias líneas de la factura original (se acredita
  // al precio/IVA con que se facturó, no al precio vigente hoy). Para Nota de Débito, son el
  // catálogo vigente de servicios (es un cargo nuevo, como una mini-factura adicional).
  // En una Nota de Crédito el máximo por línea es lo facturado menos lo ya acreditado en notas
  // anteriores (el servidor lo vuelve a validar). Un mismo servicio facturado en dos líneas se suma.
  type Opcion = { key: number; nombre: string; precio: number; porcentajeIva: number; cantidadFacturada: number | null; cantidadMaxima: number | null; sinCabys: boolean };
  const opciones: Opcion[] = esCredito
    ? Array.from(factura.lineas
        .filter((l: FacturaLinea) => l.idServicio != null)
        .reduce((porServicio, l: FacturaLinea) => {
          const cantidadFacturada = (porServicio.get(l.idServicio as number)?.cantidadFacturada || 0) + Number(l.cantidad);
          porServicio.set(l.idServicio as number, {
            key: l.idServicio as number, nombre: l.detalle, precio: l.precioUnitario, porcentajeIva: l.porcentajeIva, sinCabys: false,
            cantidadFacturada, cantidadMaxima: Math.max(0, cantidadFacturada - (yaAcreditado[l.idServicio as number] || 0))
          });
          return porServicio;
        }, new Map<number, Opcion>()).values())
    : servicios.map(s => ({ key: s.id, nombre: s.nombre, precio: s.precio, porcentajeIva: s.porcentajeIva != null ? s.porcentajeIva : ivaPorDefecto, cantidadFacturada: null, cantidadMaxima: null, sinCabys: !s.codigoCabys }));
  // Notas de Crédito anteriores ya acreditaron todo lo vendido: no queda nada que acreditar.
  const yaAcreditadaCompleta = esCredito && opciones.length > 0 && opciones.every(o => o.cantidadMaxima === 0);

  const desglose = (Object.entries(cantidades) as unknown as [string, number][]).reduce((acc, [key, cantidad]) => {
    if (!cantidad || cantidad <= 0) return acc;
    const opcion = opciones.find(o => o.key === parseInt(key));
    if (!opcion) return acc;
    const subTotal = opcion.precio * cantidad;
    const montoIva = subTotal * (opcion.porcentajeIva / 100);
    return { subtotal: acc.subtotal + subTotal, iva: acc.iva + montoIva, total: acc.total + subTotal + montoIva };
  }, { subtotal: 0, iva: 0, total: 0 });

  const handleEmitir = async () => {
    const lineas = (Object.entries(cantidades) as unknown as [string, number][])
      .filter(([, cantidad]) => cantidad > 0)
      .map(([idServicio, cantidad]) => ({ idServicio: parseInt(idServicio), cantidad }));

    if (lineas.length === 0) {
      setError(esCredito ? 'Seleccione al menos una línea a acreditar.' : 'Agregue al menos un servicio a debitar.');
      return;
    }
    if (!motivo.trim()) {
      setError(`Indique el motivo de la Nota de ${esCredito ? 'Crédito' : 'Débito'}.`);
      return;
    }

    setEnviando(true);
    setError('');
    try {
      const nota = await onEmitir(factura.id, {
        motivo: motivo.trim(),
        lineas,
        ...(pideMedioPago ? { medioPago } : {})
      });
      setResultado(nota);
    } catch (err: any) {
      setError(err.message || `No se pudo emitir la Nota de ${esCredito ? 'Crédito' : 'Débito'}.`);
    } finally {
      setEnviando(false);
    }
  };

  const Icono = esCredito ? FileMinus : FilePlus;

  return (
    <ResponsiveModal
      open
      onClose={cerrarSiSePuede}
      title={`Nota de ${esCredito ? 'crédito' : 'débito'} · Factura ${factura.consecutivo}`}
      icon={<Icono aria-hidden="true" />}
      iconClassName={esCredito ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'}
      accentColor={themeColor}
      closeDisabled={enviando}
      footer={resultado ? (
        <Button variant="secondary" fullWidth onClick={onClose}>Cerrar</Button>
      ) : (
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            disabled={enviando || yaAcreditadaCompleta}
            onClick={handleEmitir}
            icon={enviando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
          >
            Emitir Nota de {esCredito ? 'Crédito' : 'Débito'}
          </Button>
        </>
      )}
    >
        <div className="space-y-4">
          {error && (
            <div role="alert" className="p-3 rounded-control bg-danger-soft border border-danger/20 text-danger text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {resultado ? (
            <div className="space-y-3">
              <div className={`p-4 rounded-card border text-sm space-y-1 ${
                resultado.estado === 'RECHAZADA' || resultado.estado === 'ERROR'
                  ? 'bg-danger-soft border-danger/20 text-danger'
                  : resultado.estado === 'ACEPTADA'
                  ? 'bg-success-soft border-success/20 text-success'
                  : 'bg-warning-soft border-warning/25 text-warning'
              }`}>
                <p className="font-semibold uppercase">{resultado.estado}</p>
                <p>Consecutivo: {resultado.consecutivo}</p>
                <p className="break-all text-xs">Clave: {resultado.clave}</p>
                <p className="tabular-nums">Total: <span className="font-semibold">{colones(resultado.total)}</span></p>
                {resultado.mensajeError && <p className="mt-1">{resultado.mensajeError}</p>}
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-fg-muted">
                {esCredito
                  ? 'Acredita una cantidad de las líneas ya facturadas (se cobró de más, una devolución parcial) sin anular la factura completa.'
                  : 'Agrega un cargo adicional sobre esta factura (una sesión que no se cobró, una corrección al alza) referenciándola como documento original.'}
              </p>

              {opciones.length === 0 ? (
                <p className="text-sm text-fg-muted">
                  {esCredito ? 'Esta factura no tiene líneas con servicio asociado para acreditar.' : 'Esta empresa no tiene servicios configurados. Agréguelos primero en Configuración de Empresa.'}
                </p>
              ) : yaAcreditadaCompleta ? (
                <p role="status" className="p-3 rounded-control bg-surface-muted border border-border text-sm text-fg-muted">
                  Esta factura ya fue acreditada por completo en Notas de Crédito anteriores: no queda nada por acreditar.
                </p>
              ) : (
                <div className="space-y-2 sm:max-h-64 sm:overflow-y-auto">
                  {opciones.map(o => (
                    <div key={o.key} className="flex items-center justify-between gap-3 p-3 bg-surface-muted border border-border rounded-control">
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-fg block truncate">{o.nombre}</span>
                        <span id={`ajuste-detalle-${o.key}`} className="text-xs text-fg-muted tabular-nums">
                          {colones(o.precio)} + IVA {o.porcentajeIva}%
                          {esCredito && ` · facturado: ${o.cantidadFacturada} · disponible: ${o.cantidadMaxima}`}
                          {o.sinCabys && <span className="text-warning font-semibold"> (sin CABYS)</span>}
                        </span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max={o.cantidadMaxima ?? undefined}
                        step="1"
                        aria-label={`Cantidad a ${esCredito ? 'acreditar' : 'debitar'} de ${o.nombre}`}
                        aria-describedby={`ajuste-detalle-${o.key}`}
                        value={cantidades[o.key] || 0}
                        // `max` solo limita las flechas del campo: lo tecleado también se acota a lo
                        // disponible, para que el total mostrado nunca sea uno que el servidor rechace.
                        onChange={(e) => {
                          const tecleado = Math.max(0, parseInt(e.target.value) || 0);
                          const cantidad = o.cantidadMaxima != null ? Math.min(tecleado, o.cantidadMaxima) : tecleado;
                          setCantidades(prev => ({ ...prev, [o.key]: cantidad }));
                        }}
                        disabled={o.sinCabys || o.cantidadMaxima === 0}
                        className="w-24 min-h-11 shrink-0 bg-surface border border-border-strong rounded-control px-2 text-body text-fg text-center tabular-nums hover:border-fg-subtle focus:border-brand disabled:opacity-40"
                      />
                    </div>
                  ))}
                </div>
              )}

              {pideMedioPago && (
                <div>
                  <label htmlFor="ajustefact-medio-de-pago" className="block text-fg text-xs font-semibold mb-1.5">Medio de pago</label>
                  <Select id="ajustefact-medio-de-pago" value={medioPago} onChange={(e: any) => setMedioPago(e.target.value)}>
                    {Object.entries(MEDIO_PAGO_HACIENDA).map(([codigo, nombre]) => <option key={codigo} value={codigo}>{nombre}</option>)}
                  </Select>
                </div>
              )}
              {!esCredito && factura.condicionVenta === '02' && (
                <p className="text-xs text-fg-muted">La factura fue a crédito: el cargo se suma a su saldo en Cuentas por Cobrar.</p>
              )}

              <div>
                <label htmlFor="ajustefact-motivo" className="block text-fg text-xs font-semibold mb-1.5">Motivo *</label>
                <Input id="ajustefact-motivo"
                  type="text"
                  maxLength={motivoMax}
                  value={motivo}
                  onChange={(e: any) => setMotivo(e.target.value)}
                  placeholder={esCredito ? 'ej: Se cobró de más en una sesión' : 'ej: Sesión adicional no facturada'}
                />
              </div>

              <dl className="p-4 bg-surface-muted border border-border rounded-card text-sm space-y-1.5">
                <div className="flex items-center justify-between">
                  <dt className="text-fg-muted">Base (subtotal)</dt>
                  <dd className="font-medium text-fg tabular-nums">{colones(desglose.subtotal)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-fg-muted">IVA</dt>
                  <dd className="font-medium text-fg tabular-nums">{colones(desglose.iva)}</dd>
                </div>
                <div className="flex items-baseline justify-between border-t border-border-strong pt-2 mt-1">
                  <dt className="text-fg font-semibold">Total</dt>
                  <dd className="font-bold text-fg text-title tabular-nums">{colones(desglose.total)}</dd>
                </div>
              </dl>

              {/* Sin "modo prueba": la factura ya existe ante Hacienda, y una Nota simulada sobre ella
                  dejaba al sistema y a Hacienda diciendo cosas distintas. */}
              <p className="text-xs text-fg-muted">
                La nota se transmite a Hacienda. {esCredito ? 'Las existencias y el saldo por cobrar' : 'Las existencias y el saldo por cobrar (si la factura fue a crédito)'} se ajustan solo si Hacienda la recibe.
              </p>
            </>
          )}
        </div>
    </ResponsiveModal>
  );
}
