import React, { useState } from 'react';
import { Servicio, Factura } from '../data/mockData';
import { Receipt, X, AlertCircle, Check, Loader2 } from 'lucide-react';

interface FacturarModalProps {
  idCompania: number;
  idPaciente: number;
  idCita: number | null;
  idConsulta?: number | null;
  nombrePaciente: string;
  servicios: Servicio[];
  ivaPorDefecto: number;
  cantidadesIniciales?: Record<number, number>;
  onCrearFactura: (payload: {
    idCompania: number;
    idCita: number | null;
    idConsulta: number | null;
    idPaciente: number;
    condicionVenta: string;
    medioPago: string;
    montoRecibido: number | null;
    modoPrueba: boolean;
    lineas: Array<{ idServicio: number; cantidad: number }>;
  }) => Promise<Factura>;
  onVerificarEstadoFactura: (idFactura: number) => Promise<Factura>;
  onClose: () => void;
  themeColor: string;
}

export default function FacturarModal({
  idCompania,
  idPaciente,
  idCita,
  idConsulta,
  nombrePaciente,
  servicios,
  ivaPorDefecto,
  cantidadesIniciales,
  onCrearFactura,
  onVerificarEstadoFactura,
  onClose,
  themeColor
}: FacturarModalProps) {
  const [facturaCantidades, setFacturaCantidades] = useState<Record<number, number>>(cantidadesIniciales || {});
  const [facturaMedioPago, setFacturaMedioPago] = useState('01');
  const [facturaMontoRecibido, setFacturaMontoRecibido] = useState('');
  const [facturaModoPrueba, setFacturaModoPrueba] = useState(false);
  const [facturaEnviando, setFacturaEnviando] = useState(false);
  const [facturaError, setFacturaError] = useState('');
  const [facturaResultado, setFacturaResultado] = useState<Factura | null>(null);

  const facturaDesglosePreview = (Object.entries(facturaCantidades) as [string, number][]).reduce((acc, [idServicio, cantidad]) => {
    if (!cantidad || cantidad <= 0) return acc;
    const servicio = servicios.find(s => s.id === parseInt(idServicio));
    if (!servicio) return acc;
    const porcentajeIva = servicio.porcentajeIva != null ? servicio.porcentajeIva : ivaPorDefecto;
    const subTotal = servicio.precio * cantidad;
    const montoIva = subTotal * (porcentajeIva / 100);
    return {
      subtotal: acc.subtotal + subTotal,
      iva: acc.iva + montoIva,
      total: acc.total + subTotal + montoIva
    };
  }, { subtotal: 0, iva: 0, total: 0 });

  const facturaMontoRecibidoNum = facturaMontoRecibido.trim() !== '' ? parseFloat(facturaMontoRecibido) : null;
  const facturaVuelto = facturaMontoRecibidoNum != null && !isNaN(facturaMontoRecibidoNum)
    ? facturaMontoRecibidoNum - facturaDesglosePreview.total
    : null;

  const handleEmitirFactura = async () => {
    const lineas = (Object.entries(facturaCantidades) as [string, number][])
      .filter(([, cantidad]) => cantidad > 0)
      .map(([idServicio, cantidad]) => ({ idServicio: parseInt(idServicio), cantidad }));

    if (lineas.length === 0) {
      setFacturaError('Agregue al menos un servicio con cantidad mayor a 0.');
      return;
    }

    setFacturaEnviando(true);
    setFacturaError('');
    try {
      const factura = await onCrearFactura({
        idCompania,
        idCita,
        idConsulta: idConsulta ?? null,
        idPaciente,
        condicionVenta: '01',
        medioPago: facturaMedioPago,
        montoRecibido: facturaMontoRecibidoNum,
        modoPrueba: facturaModoPrueba,
        lineas
      });
      setFacturaResultado(factura);

      // Hacienda a veces tarda unos segundos en resolver una factura ENVIADA — se consulta
      // una vez automáticamente; si sigue sin resolver, el botón manual en el historial
      // permite reintentar cuando se quiera.
      if (factura.estado === 'ENVIADA') {
        setTimeout(() => {
          onVerificarEstadoFactura(factura.id)
            .then(actualizada => setFacturaResultado(prev => (prev && prev.id === actualizada.id ? actualizada : prev)))
            .catch(() => {});
        }, 8000);
      }
    } catch (err: any) {
      setFacturaError(err.message || 'No se pudo generar la factura.');
    } finally {
      setFacturaEnviando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
      <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 max-h-[85vh] overflow-y-auto">
        <div className="p-5 bg-slate-950 text-white flex justify-between items-center" style={{ backgroundColor: themeColor }}>
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-teal-400" />
            <h3 className="text-sm font-bold">Facturar</h3>
          </div>
          <button onClick={onClose} className="text-white hover:text-slate-200 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {facturaError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{facturaError}</span>
            </div>
          )}

          {facturaResultado ? (
            <div className="space-y-3">
              <div className={`p-3 rounded-xl border text-xs space-y-1 ${
                facturaResultado.estado === 'RECHAZADA' || facturaResultado.estado === 'ERROR'
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : facturaResultado.estado === 'ACEPTADA'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}>
                <p className="font-bold uppercase">{facturaResultado.estado}</p>
                <p>Consecutivo: {facturaResultado.consecutivo}</p>
                <p className="break-all">Clave: {facturaResultado.clave}</p>
                <p>Total: ₡{facturaResultado.total.toLocaleString('es-CR', { maximumFractionDigits: 2 })}</p>
                {facturaResultado.mensajeError && <p className="mt-1">{facturaResultado.mensajeError}</p>}
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
                Paciente: <span className="font-bold text-slate-800">{nombrePaciente}</span>
              </p>

              {servicios.length === 0 ? (
                <p className="text-xs text-slate-500">Esta empresa no tiene servicios configurados. Agréguelos primero en Configuración de Empresa.</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {servicios.map(s => (
                    <div key={s.id} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-slate-800 block truncate">{s.nombre}</span>
                        <span className="text-[10px] text-slate-500">₡{s.precio.toLocaleString('es-CR')} {!s.codigoCabys && <span className="text-amber-600 font-bold">(sin CABYS)</span>}</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={facturaCantidades[s.id] || 0}
                        onChange={(e) => setFacturaCantidades(prev => ({ ...prev, [s.id]: parseInt(e.target.value) || 0 }))}
                        disabled={!s.codigoCabys}
                        className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-center disabled:opacity-40"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-slate-600 text-xs font-bold mb-1.5">Medio de Pago</label>
                <select
                  value={facturaMedioPago}
                  onChange={(e) => setFacturaMedioPago(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                >
                  <option value="01">Efectivo</option>
                  <option value="02">Tarjeta</option>
                  <option value="06">SINPE Móvil</option>
                </select>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Subtotal</span>
                  <span className="font-semibold text-slate-700">₡{facturaDesglosePreview.subtotal.toLocaleString('es-CR', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">IVA</span>
                  <span className="font-semibold text-slate-700">₡{facturaDesglosePreview.iva.toLocaleString('es-CR', { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-1">
                  <span className="text-slate-600 font-bold">Total</span>
                  <span className="font-bold text-slate-800">₡{facturaDesglosePreview.total.toLocaleString('es-CR', { maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 text-xs font-bold mb-1.5">Monto Recibido</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={facturaMontoRecibido}
                  onChange={(e) => setFacturaMontoRecibido(e.target.value)}
                  placeholder={`ej: ${Math.ceil(facturaDesglosePreview.total)}`}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                />
                {facturaVuelto != null && (
                  <p className={`text-[10px] mt-1 font-bold ${facturaVuelto < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {facturaVuelto < 0
                      ? `Falta ₡${Math.abs(facturaVuelto).toLocaleString('es-CR', { maximumFractionDigits: 2 })}`
                      : `Vuelto: ₡${facturaVuelto.toLocaleString('es-CR', { maximumFractionDigits: 2 })}`}
                  </p>
                )}
              </div>

              <label className="flex items-start gap-2 p-2.5 bg-sky-50 border border-sky-200 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={facturaModoPrueba}
                  onChange={(e) => setFacturaModoPrueba(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-[10px] text-sky-800">
                  <span className="font-bold block">Modo prueba (no enviar a Hacienda)</span>
                  Esta factura se numera y guarda igual que siempre, pero no se envía a Hacienda — queda marcada como SIMULADA. Útil para probar el flujo sin generar una presentación fiscal real.
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
                  disabled={facturaEnviando}
                  onClick={handleEmitirFactura}
                  className="text-white text-xs font-extrabold px-4 py-2 rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
                  style={{ backgroundColor: themeColor }}
                >
                  {facturaEnviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Emitir Factura
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
