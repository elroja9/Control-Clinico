import React, { useState } from 'react';
import { Servicio, Factura, FacturaLinea } from '../data/mockData';
import { FileMinus, FilePlus, X, AlertCircle, Check, Loader2 } from 'lucide-react';

interface AjusteFacturaModalProps {
  tipo: 'CREDITO' | 'DEBITO';
  factura: Factura;
  servicios: Servicio[];
  ivaPorDefecto: number;
  onEmitir: (idFactura: number, payload: {
    motivo: string;
    lineas: Array<{ idServicio: number; cantidad: number }>;
    medioPago?: string;
    modoPrueba: boolean;
  }) => Promise<Factura>;
  onClose: () => void;
  themeColor: string;
}

/** Modal compartido para emitir una Nota de Crédito parcial (acredita cantidades de líneas ya
 * facturadas, sin anular toda la factura — para eso está el botón "Anular Factura") o una Nota de
 * Débito (agrega un cargo nuevo sobre una factura ya emitida) — ambas pueden ser parciales o
 * cubrir el total, según cuánto seleccione el usuario. */
export default function AjusteFacturaModal({ tipo, factura, servicios, ivaPorDefecto, onEmitir, onClose, themeColor }: AjusteFacturaModalProps) {
  const esCredito = tipo === 'CREDITO';
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [motivo, setMotivo] = useState('');
  const [medioPago, setMedioPago] = useState('01');
  const [modoPrueba, setModoPrueba] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState<Factura | null>(null);

  // Para Nota de Crédito, las opciones son las propias líneas de la factura original (se acredita
  // al precio/IVA con que se facturó, no al precio vigente hoy). Para Nota de Débito, son el
  // catálogo vigente de servicios (es un cargo nuevo, como una mini-factura adicional).
  type Opcion = { key: number; nombre: string; precio: number; porcentajeIva: number; cantidadMaxima: number | null; sinCabys: boolean };
  const opciones: Opcion[] = esCredito
    ? factura.lineas
        .filter((l: FacturaLinea) => l.idServicio != null)
        .map((l: FacturaLinea) => ({ key: l.idServicio as number, nombre: l.detalle, precio: l.precioUnitario, porcentajeIva: l.porcentajeIva, cantidadMaxima: l.cantidad, sinCabys: false }))
    : servicios.map(s => ({ key: s.id, nombre: s.nombre, precio: s.precio, porcentajeIva: s.porcentajeIva != null ? s.porcentajeIva : ivaPorDefecto, cantidadMaxima: null, sinCabys: !s.codigoCabys }));

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
        ...(esCredito ? {} : { medioPago }),
        modoPrueba
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
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 max-h-[85vh] overflow-y-auto">
        <div className="p-5 bg-slate-950 text-white flex justify-between items-center" style={{ backgroundColor: themeColor }}>
          <div className="flex items-center gap-2">
            <Icono className="w-5 h-5 text-teal-400" />
            <h3 className="text-sm font-bold">Nota de {esCredito ? 'Crédito' : 'Débito'} — Factura {factura.consecutivo}</h3>
          </div>
          <button onClick={onClose} className="text-white hover:text-slate-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs flex items-center gap-2">
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
                <p>Total: ₡{resultado.total.toLocaleString('es-CR', { maximumFractionDigits: 2 })}</p>
                {resultado.mensajeError && <p className="mt-1">{resultado.mensajeError}</p>}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold py-2.5 rounded-xl"
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
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {opciones.map(o => (
                    <div key={o.key} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-slate-800 block truncate">{o.nombre}</span>
                        <span className="text-[10px] text-slate-500">
                          ₡{o.precio.toLocaleString('es-CR')}
                          {esCredito && ` · facturado: ${o.cantidadMaxima}`}
                          {o.sinCabys && <span className="text-amber-600 font-bold"> (sin CABYS)</span>}
                        </span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        max={o.cantidadMaxima ?? undefined}
                        step="1"
                        value={cantidades[o.key] || 0}
                        onChange={(e) => setCantidades(prev => ({ ...prev, [o.key]: parseInt(e.target.value) || 0 }))}
                        disabled={o.sinCabys}
                        className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-center disabled:opacity-40"
                      />
                    </div>
                  ))}
                </div>
              )}

              {!esCredito && (
                <div>
                  <label className="block text-slate-600 text-xs font-bold mb-1.5">Medio de Pago</label>
                  <select
                    value={medioPago}
                    onChange={(e) => setMedioPago(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                  >
                    <option value="01">Efectivo</option>
                    <option value="02">Tarjeta</option>
                    <option value="06">SINPE Móvil</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-slate-600 text-xs font-bold mb-1.5">Motivo *</label>
                <input
                  type="text"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder={esCredito ? 'ej: Se cobró de más en una sesión' : 'ej: Sesión adicional no facturada'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                />
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-semibold text-slate-700">₡{desglose.subtotal.toLocaleString('es-CR', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">IVA</span>
                  <span className="font-semibold text-slate-700">₡{desglose.iva.toLocaleString('es-CR', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-1">
                  <span className="text-slate-600 font-bold">Total</span>
                  <span className="font-bold text-slate-800">₡{desglose.total.toLocaleString('es-CR', { maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              <label className="flex items-start gap-2 p-2.5 bg-sky-50 border border-sky-200 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={modoPrueba}
                  onChange={(e) => setModoPrueba(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-[10px] text-sky-800">
                  <span className="font-bold block">Modo prueba (no enviar a Hacienda)</span>
                  Se numera y guarda igual que siempre, pero no se envía a Hacienda — queda marcada como SIMULADA.
                </span>
              </label>

              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={enviando}
                  onClick={handleEmitir}
                  className="text-white text-xs font-extrabold px-4 py-2 rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
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
