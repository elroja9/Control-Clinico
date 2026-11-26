import React, { useState } from 'react';
import { Servicio, Factura } from '../data/mockData';
import { Receipt, X, AlertCircle, Check, Loader2 } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';
import { MEDIO_PAGO_HACIENDA, colones } from '../utils/facturacion';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';
import { Input } from './ui/Input';
import { Select } from './ui/Select';

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

  return (
    <div className="fixed inset-0 bg-fg/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 z-50 animate-fade-in font-sans">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="titulo-facturar" tabIndex={-1} className="bg-surface rounded-t-panel sm:rounded-panel w-full max-w-lg shadow-lg border border-border max-h-[92dvh] sm:max-h-[85vh] overflow-y-auto overscroll-contain animate-dialog-in focus:outline-hidden">
        <div className="sticky top-0 z-10 bg-surface border-b border-border">
          <div className="h-1" style={{ backgroundColor: themeColor }} aria-hidden="true" />
          <div className="px-5 py-4 flex justify-between items-center gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-9 h-9 shrink-0 rounded-control bg-brand-soft text-brand-ink flex items-center justify-center" aria-hidden="true">
                <Receipt className="w-4.5 h-4.5" />
              </span>
              <h3 id="titulo-facturar" className="text-heading font-semibold text-fg truncate">Facturar · {nombrePaciente}</h3>
            </div>
            <IconButton label="Cerrar" icon={<X className="w-5 h-5" aria-hidden="true" />} onClick={onClose} disabled={facturaEnviando} />
          </div>
        </div>

        <div className="p-5 space-y-4">
          {facturaError && (
            <div role="alert" className="p-3 rounded-control bg-danger-soft border border-danger/20 text-danger text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{facturaError}</span>
            </div>
          )}

          {facturaResultado ? (
            <div className="space-y-3">
              <div role="status" className={`p-4 rounded-card border text-sm space-y-1 ${
                facturaResultado.estado === 'RECHAZADA' || facturaResultado.estado === 'ERROR'
                  ? 'bg-danger-soft border-danger/20 text-danger'
                  : facturaResultado.estado === 'ACEPTADA'
                  ? 'bg-success-soft border-success/20 text-success'
                  : 'bg-warning-soft border-warning/25 text-warning'
              }`}>
                <p className="font-semibold uppercase">{facturaResultado.estado}</p>
                <p>Consecutivo: {facturaResultado.consecutivo}</p>
                <p className="break-all text-xs">Clave: {facturaResultado.clave}</p>
                <p className="tabular-nums">Total: <span className="font-semibold">{colones(facturaResultado.total)}</span>{facturaResultado.condicionVenta === '02' ? ` · Crédito a ${facturaResultado.plazoCredito} días (queda en Cuentas por Cobrar)` : ''}</p>
                {facturaResultado.mensajeError && <p className="mt-1">{facturaResultado.mensajeError}</p>}
              </div>
              <Button variant="secondary" fullWidth onClick={onClose}>Cerrar</Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-fg-muted">
                {etiquetaPersona}: <span className="font-semibold text-fg">{nombrePaciente}</span>
              </p>

              {servicios.length === 0 ? (
                <p className="text-sm text-fg-muted">Esta empresa no tiene servicios configurados. Agréguelos primero en Configuración de Empresa.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {servicios.map(s => (
                    <div key={s.id} className="flex items-center justify-between gap-3 p-3 bg-surface-muted border border-border rounded-control">
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-fg block truncate">{s.nombre}</span>
                        <span id={`facturar-detalle-${s.id}`} className="text-xs text-fg-muted tabular-nums">
                          {colones(s.precio)} + IVA {s.porcentajeIva ?? ivaPorDefecto}% {!s.codigoCabys && <span className="text-warning font-semibold">(sin CABYS: no se puede facturar)</span>}
                        </span>
                      </div>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        inputMode="numeric"
                        value={facturaCantidades[s.id] || 0}
                        onChange={(e: any) => setFacturaCantidades(prev => ({ ...prev, [s.id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                        disabled={!s.codigoCabys}
                        aria-label={`Cantidad de ${s.nombre}`}
                        aria-describedby={`facturar-detalle-${s.id}`}
                        wrapperClassName="w-24 shrink-0"
                        className="text-center tabular-nums"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="facturarmo-condicion" className="block text-fg text-xs font-semibold mb-1.5">Condición de venta</label>
                  <Select id="facturarmo-condicion" value={facturaCondicion} onChange={(e: any) => setFacturaCondicion(e.target.value as '01' | '02')}>
                    <option value="01">Contado</option>
                    <option value="02">Crédito</option>
                  </Select>
                </div>
                {/* En una venta a crédito el XML omite <MedioPago>: todavía no se ha pagado. */}
                {facturaCondicion === '02' && (
                  <div>
                    <label htmlFor="facturarmo-plazo" className="block text-fg text-xs font-semibold mb-1.5">Plazo (días)</label>
                    <Input id="facturarmo-plazo" type="number" min="1" step="1" inputMode="numeric" value={facturaPlazo} onChange={(e: any) => setFacturaPlazo(e.target.value)} />
                  </div>
                )}
                {facturaCondicion === '01' && (
                  <div>
                    <label htmlFor="facturarmo-medio-de-pago" className="block text-fg text-xs font-semibold mb-1.5">Medio de pago</label>
                    <Select id="facturarmo-medio-de-pago" value={facturaMedioPago} onChange={(e: any) => setFacturaMedioPago(e.target.value)}>
                      {Object.entries(MEDIO_PAGO_HACIENDA).map(([codigo, nombre]) => <option key={codigo} value={codigo}>{nombre}</option>)}
                    </Select>
                  </div>
                )}
              </div>
              {facturaCondicion === '02' && (
                <p className="text-xs text-fg-muted -mt-2">
                  Se crea una cuenta por cobrar por el total, con vencimiento según el plazo. Los abonos se registran en Facturación › Cuentas por Cobrar.
                </p>
              )}

              <dl className="p-4 bg-surface-muted border border-border rounded-card text-sm space-y-1.5">
                <div className="flex items-center justify-between">
                  <dt className="text-fg-muted">Base (subtotal)</dt>
                  <dd className="font-medium text-fg tabular-nums">{colones(facturaDesglosePreview.subtotal)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-fg-muted">IVA</dt>
                  <dd className="font-medium text-fg tabular-nums">{colones(facturaDesglosePreview.iva)}</dd>
                </div>
                <div className="flex items-baseline justify-between border-t border-border-strong pt-2 mt-1">
                  <dt className="text-fg font-semibold">Total</dt>
                  <dd className="font-bold text-fg text-title tabular-nums">{colones(facturaDesglosePreview.total)}</dd>
                </div>
              </dl>

              {pideMontoRecibido && (
                <div>
                  <label htmlFor="facturarmo-monto-recibido" className="block text-fg text-xs font-semibold mb-1.5">Monto recibido (opcional, para calcular el vuelto)</label>
                  <Input id="facturarmo-monto-recibido"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={facturaMontoRecibido}
                    onChange={(e: any) => setFacturaMontoRecibido(e.target.value)}
                    placeholder={`ej: ${Math.ceil(facturaDesglosePreview.total)}`}
                  />
                  {facturaVuelto != null && (
                    <p aria-live="polite" className={`text-xs mt-1.5 font-semibold tabular-nums ${facturaVuelto < 0 ? 'text-danger' : 'text-success'}`}>
                      {facturaVuelto < 0 ? `Falta ${colones(Math.abs(facturaVuelto))}` : `Vuelto: ${colones(facturaVuelto)}`}
                    </p>
                  )}
                </div>
              )}

              <label className="flex items-start gap-3 p-3 bg-info-soft border border-info/20 rounded-control cursor-pointer min-h-11">
                <input
                  type="checkbox"
                  checked={facturaModoPrueba}
                  onChange={(e) => setFacturaModoPrueba(e.target.checked)}
                  className="mt-0.5 w-4 h-4"
                />
                <span className="text-xs text-info">
                  <span className="font-semibold block">Modo prueba (no enviar a Hacienda)</span>
                  Esta factura se numera y guarda igual que siempre, pero no se envía a Hacienda — queda marcada como SIMULADA. Útil para probar el flujo sin generar una presentación fiscal real.
                </span>
              </label>

              <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
                <Button variant="secondary" onClick={onClose} disabled={facturaEnviando}>Cancelar</Button>
                <Button
                  disabled={facturaEnviando}
                  onClick={handleEmitirFactura}
                  icon={facturaEnviando ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
                >
                  {facturaEnviando ? 'Emitiendo…' : facturaCondicion === '02' ? 'Emitir factura a crédito' : 'Emitir factura'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
