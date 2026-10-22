import React, { useState } from 'react';
import { Servicio, Factura } from '../data/mockData';
import { Receipt, X, AlertCircle, Check, Loader2 } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';
import { MEDIO_PAGO_HACIENDA, colones } from '../utils/facturacion';

interface FacturarModalProps {
  idCompania: number;
  idPaciente: number;
  idCita: number | null;
  idConsulta?: number | null;
  nombrePaciente: string;
  servicios: Servicio[];
  ivaPorDefecto: number;
  plazoCreditoDefecto?: number; // Personalizar › Parámetros contables; editable en cada factura
  cantidadesIniciales?: Record<number, number>;
  onCrearFactura: (payload: {
    idCompania: number;
    idCita: number | null;
    idConsulta: number | null;
    idPaciente: number;
    condicionVenta: string;
    medioPago: string;
    montoRecibido: number | null;
    plazoCreditoDias: number | null;
    modoPrueba: boolean;
    lineas: Array<{ idServicio: number; cantidad: number }>;
  }) => Promise<Factura>;
  onVerificarEstadoFactura: (idFactura: number) => Promise<Factura>;
  onClose: () => void;
  themeColor: string;
  etiquetaPersona?: string;
}

export default function FacturarModal({
  idCompania,
  idPaciente,
  idCita,
  idConsulta,
  nombrePaciente,
  servicios,
  ivaPorDefecto,
  plazoCreditoDefecto,
  cantidadesIniciales,
  onCrearFactura,
  onVerificarEstadoFactura,
  onClose,
  themeColor,
  etiquetaPersona = 'Paciente'
}: FacturarModalProps) {
  const [facturaCantidades, setFacturaCantidades] = useState<Record<number, number>>(cantidadesIniciales || {});
  const [facturaCondicion, setFacturaCondicion] = useState<'01' | '02'>('01');
  const [facturaPlazo, setFacturaPlazo] = useState(plazoCreditoDefecto != null ? String(plazoCreditoDefecto) : '');
  const [facturaMedioPago, setFacturaMedioPago] = useState('01');
  const [facturaMontoRecibido, setFacturaMontoRecibido] = useState('');
  const [facturaModoPrueba, setFacturaModoPrueba] = useState(false);
  const [facturaEnviando, setFacturaEnviando] = useState(false);
  const [facturaError, setFacturaError] = useState('');
  const [facturaResultado, setFacturaResultado] = useState<Factura | null>(null);
  // Mientras se emite, Escape no cierra: la factura se está enviando a Hacienda
  const dialogRef = useDialog<HTMLDivElement>(true, () => { if (!facturaEnviando) onClose(); });

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

  // El vuelto solo tiene sentido en una venta de contado en efectivo.
  const pideMontoRecibido = facturaCondicion === '01' && facturaMedioPago === '01';
  const facturaMontoRecibidoNum = pideMontoRecibido && facturaMontoRecibido.trim() !== '' ? parseFloat(facturaMontoRecibido) : null;
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
    // Vacío = el servidor usa el plazo configurado de la empresa
    const plazoCreditoDias = facturaCondicion === '02' && facturaPlazo.trim() !== '' ? Number(facturaPlazo) : null;
    if (plazoCreditoDias != null && !(Number.isInteger(plazoCreditoDias) && plazoCreditoDias > 0)) {
      setFacturaError('El plazo de crédito debe ser un número entero de días mayor que cero.');
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
        condicionVenta: facturaCondicion,
        medioPago: facturaMedioPago,
        montoRecibido: facturaMontoRecibidoNum,
        plazoCreditoDias,
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

  const campo = 'w-full min-h-10 bg-slate-50 border border-slate-200 rounded-xl px-3 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden';

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 z-50 animate-fade-in font-sans">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="titulo-facturar" tabIndex={-1} className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 max-h-[92dvh] sm:max-h-[85vh] overflow-y-auto overscroll-contain animate-dialog-in focus:outline-hidden">
        <div className="surface-dark sticky top-0 z-10 p-5 bg-slate-950 text-white flex justify-between items-center" style={{ backgroundColor: themeColor }}>
          <div className="flex items-center gap-2 min-w-0">
            <Receipt className="w-5 h-5 text-white/80 shrink-0" aria-hidden="true" />
            <h3 id="titulo-facturar" className="text-sm font-bold truncate">Facturar · {nombrePaciente}</h3>
          </div>
          <button type="button" onClick={onClose} disabled={facturaEnviando} className="text-white hover:bg-white/15 w-10 h-10 -m-1.5 flex items-center justify-center rounded-lg transition-colors disabled:opacity-50" aria-label="Cerrar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {facturaError && (
            <div role="alert" className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{facturaError}</span>
            </div>
          )}

          {facturaResultado ? (
            <div className="space-y-3">
              <div role="status" className={`p-3 rounded-xl border text-xs space-y-1 ${
                facturaResultado.estado === 'RECHAZADA' || facturaResultado.estado === 'ERROR'
                  ? 'bg-rose-50 border-rose-200 text-rose-700'
                  : facturaResultado.estado === 'ACEPTADA'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}>
                <p className="font-bold uppercase">{facturaResultado.estado}</p>
                <p>Consecutivo: {facturaResultado.consecutivo}</p>
                <p className="break-all">Clave: {facturaResultado.clave}</p>
                <p>Total: {colones(facturaResultado.total)}{facturaResultado.condicionVenta === '02' ? ` · Crédito a ${facturaResultado.plazoCredito} días (queda en Cuentas por Cobrar)` : ''}</p>
                {facturaResultado.mensajeError && <p className="mt-1">{facturaResultado.mensajeError}</p>}
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
              <p className="text-xs text-slate-600">
                {etiquetaPersona}: <span className="font-bold text-slate-800">{nombrePaciente}</span>
              </p>

              {servicios.length === 0 ? (
                <p className="text-xs text-slate-600">Esta empresa no tiene servicios configurados. Agréguelos primero en Configuración de Empresa.</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {servicios.map(s => (
                    <div key={s.id} className="flex items-center justify-between gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg">
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-slate-800 block truncate">{s.nombre}</span>
                        <span id={`facturar-detalle-${s.id}`} className="text-[11px] text-slate-600">
                          {colones(s.precio)} + IVA {s.porcentajeIva ?? ivaPorDefecto}% {!s.codigoCabys && <span className="text-amber-700 font-bold">(sin CABYS: no se puede facturar)</span>}
                        </span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={facturaCantidades[s.id] || 0}
                        onChange={(e) => setFacturaCantidades(prev => ({ ...prev, [s.id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                        disabled={!s.codigoCabys}
                        aria-label={`Cantidad de ${s.nombre}`}
                        aria-describedby={`facturar-detalle-${s.id}`}
                        className="w-20 min-h-10 shrink-0 bg-white border border-slate-200 rounded-lg px-2 text-sm text-center disabled:opacity-40"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="facturarmo-condicion" className="block text-slate-600 text-xs font-bold mb-1.5">Condición de venta</label>
                  <select id="facturarmo-condicion" value={facturaCondicion} onChange={(e) => setFacturaCondicion(e.target.value as '01' | '02')} className={campo}>
                    <option value="01">Contado</option>
                    <option value="02">Crédito</option>
                  </select>
                </div>
                {/* En una venta a crédito el XML omite <MedioPago>: todavía no se ha pagado. */}
                {facturaCondicion === '02' && (
                  <div>
                    <label htmlFor="facturarmo-plazo" className="block text-slate-600 text-xs font-bold mb-1.5">Plazo (días)</label>
                    <input id="facturarmo-plazo" type="number" min="1" step="1" inputMode="numeric" value={facturaPlazo} onChange={(e) => setFacturaPlazo(e.target.value)} className={campo} />
                  </div>
                )}
                {facturaCondicion === '01' && (
                  <div>
                    <label htmlFor="facturarmo-medio-de-pago" className="block text-slate-600 text-xs font-bold mb-1.5">Medio de pago</label>
                    <select id="facturarmo-medio-de-pago" value={facturaMedioPago} onChange={(e) => setFacturaMedioPago(e.target.value)} className={campo}>
                      {Object.entries(MEDIO_PAGO_HACIENDA).map(([codigo, nombre]) => <option key={codigo} value={codigo}>{nombre}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {facturaCondicion === '02' && (
                <p className="text-[11px] text-slate-600 -mt-2">
                  Se crea una cuenta por cobrar por el total, con vencimiento según el plazo. Los abonos se registran en Facturación › Cuentas por Cobrar.
                </p>
              )}

              <dl className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-600">Subtotal</dt>
                  <dd className="font-semibold text-slate-700 tabular-nums">{colones(facturaDesglosePreview.subtotal)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-600">IVA</dt>
                  <dd className="font-semibold text-slate-700 tabular-nums">{colones(facturaDesglosePreview.iva)}</dd>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-1">
                  <dt className="text-slate-700 font-bold">Total</dt>
                  <dd className="font-bold text-slate-900 tabular-nums">{colones(facturaDesglosePreview.total)}</dd>
                </div>
              </dl>

              {pideMontoRecibido && (
                <div>
                  <label htmlFor="facturarmo-monto-recibido" className="block text-slate-600 text-xs font-bold mb-1.5">Monto recibido (opcional, para calcular el vuelto)</label>
                  <input id="facturarmo-monto-recibido"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={facturaMontoRecibido}
                    onChange={(e) => setFacturaMontoRecibido(e.target.value)}
                    placeholder={`ej: ${Math.ceil(facturaDesglosePreview.total)}`}
                    className={campo}
                  />
                  {facturaVuelto != null && (
                    <p aria-live="polite" className={`text-[11px] mt-1 font-bold ${facturaVuelto < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                      {facturaVuelto < 0 ? `Falta ${colones(Math.abs(facturaVuelto))}` : `Vuelto: ${colones(facturaVuelto)}`}
                    </p>
                  )}
                </div>
              )}

              <label className="flex items-start gap-2 p-2.5 bg-sky-50 border border-sky-200 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={facturaModoPrueba}
                  onChange={(e) => setFacturaModoPrueba(e.target.checked)}
                  className="mt-0.5 w-4 h-4"
                />
                <span className="text-[11px] text-sky-900">
                  <span className="font-bold block">Modo prueba (no enviar a Hacienda)</span>
                  Esta factura se numera y guarda igual que siempre, pero no se envía a Hacienda — queda marcada como SIMULADA. Útil para probar el flujo sin generar una presentación fiscal real.
                </span>
              </label>

              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={facturaEnviando}
                  className="min-h-10 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold px-4 rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={facturaEnviando}
                  onClick={handleEmitirFactura}
                  className="min-h-10 text-white text-xs font-extrabold px-4 rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
                  style={{ backgroundColor: themeColor }}
                >
                  {facturaEnviando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
                  {facturaEnviando ? 'Emitiendo…' : facturaCondicion === '02' ? 'Emitir factura a crédito' : 'Emitir factura'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
