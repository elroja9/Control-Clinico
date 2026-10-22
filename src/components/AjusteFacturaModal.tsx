import React, { useState } from 'react';
import { Servicio, Factura, FacturaLinea } from '../data/mockData';
import { FileMinus, FilePlus, X, AlertCircle, Check, Loader2 } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';
import { MEDIO_PAGO_HACIENDA, colones } from '../utils/facturacion';

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
  const dialogRef = useDialog<HTMLDivElement>(true, () => { if (!enviando) onClose(); });

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
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 z-50 animate-fade-in font-sans">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="titulo-ajuste-factura" tabIndex={-1} className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 max-h-[92dvh] sm:max-h-[85vh] overflow-y-auto overscroll-contain animate-dialog-in focus:outline-hidden">
        <div className="surface-dark sticky top-0 z-10 p-5 bg-slate-950 text-white flex justify-between items-center" style={{ backgroundColor: themeColor }}>
          <div className="flex items-center gap-2 min-w-0">
            <Icono className="w-5 h-5 text-white/80 shrink-0" aria-hidden="true" />
            <h3 id="titulo-ajuste-factura" className="text-sm font-bold">Nota de {esCredito ? 'crédito' : 'débito'} · Factura {factura.consecutivo}</h3>
          </div>
          <button type="button" onClick={onClose} disabled={enviando} className="text-white hover:bg-white/15 w-10 h-10 -m-1.5 flex items-center justify-center rounded-lg transition-colors disabled:opacity-50" aria-label="Cerrar">
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {resultado ? (
            <div className="space-y-3">
              <div className={`p-3 rounded-xl border text-xs space-y-1 ${
                resultado.estado === 'RECHAZADA' || resultado.estado === 'ERROR'
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : resultado.estado === 'ACEPTADA'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}>
                <p className="font-bold uppercase">{resultado.estado}</p>
                <p>Consecutivo: {resultado.consecutivo}</p>
                <p className="break-all">Clave: {resultado.clave}</p>
                <p>Total: {colones(resultado.total)}</p>
                {resultado.mensajeError && <p className="mt-1">{resultado.mensajeError}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full min-h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <>
              <p className="text-xs text-slate-500">
                {esCredito
                  ? 'Acredita una cantidad de las líneas ya facturadas (se cobró de más, una devolución parcial) sin anular la factura completa.'
                  : 'Agrega un cargo adicional sobre esta factura (una sesión que no se cobró, una corrección al alza) referenciándola como documento original.'}
              </p>

              {opciones.length === 0 ? (
                <p className="text-xs text-slate-500">
                  {esCredito ? 'Esta factura no tiene líneas con servicio asociado para acreditar.' : 'Esta empresa no tiene servicios configurados. Agréguelos primero en Configuración de Empresa.'}
                </p>
              ) : yaAcreditadaCompleta ? (
                <p role="status" className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                  Esta factura ya fue acreditada por completo en Notas de Crédito anteriores: no queda nada por acreditar.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {opciones.map(o => (
                    <div key={o.key} className="flex items-center justify-between gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-slate-800 block truncate">{o.nombre}</span>
                        <span id={`ajuste-detalle-${o.key}`} className="text-[11px] text-slate-500">
                          {colones(o.precio)} + IVA {o.porcentajeIva}%
                          {esCredito && ` · facturado: ${o.cantidadFacturada} · disponible: ${o.cantidadMaxima}`}
                          {o.sinCabys && <span className="text-amber-600 font-bold"> (sin CABYS)</span>}
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
                        className="w-20 min-h-10 shrink-0 bg-white border border-slate-200 rounded-lg px-2 text-sm text-center disabled:opacity-40"
                      />
                    </div>
                  ))}
                </div>
              )}

              {pideMedioPago && (
                <div>
                  <label htmlFor="ajustefact-medio-de-pago" className="block text-slate-600 text-xs font-bold mb-1.5">Medio de pago</label>
                  <select id="ajustefact-medio-de-pago"
                    value={medioPago}
                    onChange={(e) => setMedioPago(e.target.value)}
                    className="w-full min-h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                  >
                    {Object.entries(MEDIO_PAGO_HACIENDA).map(([codigo, nombre]) => <option key={codigo} value={codigo}>{nombre}</option>)}
                  </select>
                </div>
              )}
              {!esCredito && factura.condicionVenta === '02' && (
                <p className="text-[11px] text-slate-600">La factura fue a crédito: el cargo se suma a su saldo en Cuentas por Cobrar.</p>
              )}

              <div>
                <label htmlFor="ajustefact-motivo" className="block text-slate-600 text-xs font-bold mb-1.5">Motivo *</label>
                <input id="ajustefact-motivo"
                  type="text"
                  maxLength={motivoMax}
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder={esCredito ? 'ej: Se cobró de más en una sesión' : 'ej: Sesión adicional no facturada'}
                  className="w-full min-h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-semibold text-slate-700">{colones(desglose.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">IVA</span>
                  <span className="font-semibold text-slate-700">{colones(desglose.iva)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-1">
                  <span className="text-slate-600 font-bold">Total</span>
                  <span className="font-bold text-slate-800">{colones(desglose.total)}</span>
                </div>
              </div>

              {/* Sin "modo prueba": la factura ya existe ante Hacienda, y una Nota simulada sobre ella
                  dejaba al sistema y a Hacienda diciendo cosas distintas. */}
              <p className="text-[11px] text-slate-500">
                La nota se transmite a Hacienda. {esCredito ? 'Las existencias y el saldo por cobrar' : 'Las existencias y el saldo por cobrar (si la factura fue a crédito)'} se ajustan solo si Hacienda la recibe.
              </p>

              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={enviando || yaAcreditadaCompleta}
                  onClick={handleEmitir}
                  className="min-h-10 text-white text-xs font-extrabold px-4 rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
                  style={{ backgroundColor: themeColor }}
                >
                  {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Emitir Nota de {esCredito ? 'Crédito' : 'Débito'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
