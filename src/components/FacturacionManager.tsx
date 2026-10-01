import React, { useState } from 'react';
import { Factura, Patient, Company, Servicio, NotificationLog } from '../data/mockData';
import { Receipt, XCircle, FileMinus, FilePlus, AlertCircle, RefreshCw, Eye } from 'lucide-react';
import FacturaDetailView from './FacturaDetailView';
import AjusteFacturaModal from './AjusteFacturaModal';
import { notify } from './ui/Feedback';

interface FacturacionManagerProps {
  facturas: Factura[];
  patients: Patient[];
  company: Company;
  servicios: Servicio[];
  puedeAnular: boolean; // Administrador: anular y Notas de Crédito (el servidor también lo exige)
  onAnularFactura: (idFactura: number, motivo: string) => Promise<{ factura: Factura; notaCredito: Factura | null }>;
  onEmitirNotaCredito: (idFactura: number, payload: { motivo: string; lineas: Array<{ idServicio: number; cantidad: number }> }) => Promise<Factura>;
  onEmitirNotaDebito: (idFactura: number, payload: { motivo: string; lineas: Array<{ idServicio: number; cantidad: number }>; medioPago?: string }) => Promise<Factura>;
  onVerificarEstadoFactura: (idFactura: number) => Promise<Factura>;
  onReenviarCorreo: (idFactura: number) => Promise<NotificationLog>;
}

const ESTADO_ESTILO: Record<string, string> = {
  FIRMADA: 'bg-slate-100 text-slate-700',
  ENVIADA: 'bg-amber-100 text-amber-800',
  ACEPTADA: 'bg-emerald-100 text-emerald-800',
  RECHAZADA: 'bg-rose-100 text-rose-800',
  ERROR: 'bg-rose-100 text-rose-800',
  ANULADA: 'bg-slate-200 text-slate-600',
  SIMULADA: 'bg-sky-100 text-sky-700'
};

const MEDIO_PAGO_LABEL: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Tarjeta',
  '06': 'SINPE Móvil'
};

// Por qué una anulación no lleva Nota de Crédito, dicho en el estado concreto de la factura.
const MOTIVO_SIN_NOTA_CREDITO: Record<string, string> = {
  SIMULADA: 'es de prueba y nunca se envió a Hacienda',
  RECHAZADA: 'Hacienda la rechazó, así que nunca fue un comprobante válido',
  FIRMADA: 'nunca se envió a Hacienda'
};

// Máximo de <Razon> en el XSD v4.4 (RAZON_MAX en server/haciendaFactura.ts).
const MOTIVO_MAX = 180;

// Espejo de cantidadesAcreditadas() en server.ts: suma por servicio lo acreditado en Notas de Crédito
// que referencian la factura, sin contar las que Hacienda nunca recibió (ERROR) o rechazó. Si esa
// regla cambia en el servidor, tiene que cambiar aquí también.
function cantidadesAcreditadas(facturas: Factura[], idFactura: number): Record<number, number> {
  return facturas
    .filter(n => n.idFacturaReferencia === idFactura && n.tipoDocumento === '03' && n.estado !== 'ERROR' && n.estado !== 'RECHAZADA')
    .flatMap(n => n.lineas)
    .reduce<Record<number, number>>((acc, l) => {
      if (l.idServicio != null) acc[l.idServicio] = (acc[l.idServicio] || 0) + Number(l.cantidad);
      return acc;
    }, {});
}

function quedaPorAcreditar(f: Factura, acreditado: Record<number, number>): boolean {
  const vendido: Record<number, number> = {};
  for (const l of f.lineas) {
    if (l.idServicio == null) return true;
    vendido[l.idServicio] = (vendido[l.idServicio] || 0) + Number(l.cantidad);
  }
  return Object.entries(vendido).some(([id, cantidad]) => cantidad - (acreditado[Number(id)] || 0) > 1e-9);
}

/** "a", "a y b", "a, b y c". */
function unirFrases(partes: string[]): string {
  return partes.length <= 1 ? (partes[0] || '') : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

// Lo que va a pasar al anular, dicho antes de confirmar — tiene que coincidir con lo que hace
// POST /api/facturas/:id/anular, porque la acción no se puede deshacer.
function explicacionAnulacion(f: Factura, acreditado: Record<number, number>): string {
  const pendiente = quedaPorAcreditar(f, acreditado);
  let inicio: string;
  if (f.estado === 'ACEPTADA') {
    inicio = pendiente
      ? 'Se emite y transmite a Hacienda una Nota de Crédito que anula esta factura'
      : 'No se emite otra Nota de Crédito: las anteriores ya acreditaron la factura completa. Se anula en el sistema';
  } else if (f.estado === 'ERROR') {
    inicio = 'Primero se consulta a Hacienda: si la tiene aceptada, se emite una Nota de Crédito; si nunca le llegó, se anula solo en el sistema';
  } else {
    inicio = `No se emite Nota de Crédito porque esta factura ${MOTIVO_SIN_NOTA_CREDITO[f.estado] || `no fue aceptada por Hacienda (estado ${f.estado})`}; se anula solo en el sistema`;
  }
  const efectos: string[] = [];
  if (pendiente && f.lineas.some(l => l.tipo === 'ARTICULO')) efectos.push('se reponen las existencias de los artículos facturados');
  if (f.condicionVenta === '02') efectos.push('se anula el saldo pendiente de cobro');
  if (f.idConsulta != null) efectos.push('se libera la consulta para volver a facturarla');
  return `${inicio}.${efectos.length ? ` Además, ${unirFrases(efectos)}.` : ''} No se puede deshacer.`;
}

export default function FacturacionManager({ facturas, patients, company, servicios, puedeAnular, onAnularFactura, onEmitirNotaCredito, onEmitirNotaDebito, onVerificarEstadoFactura, onReenviarCorreo }: FacturacionManagerProps) {
  const [anulandoId, setAnulandoId] = useState<number | null>(null);
  const [motivoAnulacion, setMotivoAnulacion] = useState('');
  const [anulando, setAnulando] = useState(false);
  const [error, setError] = useState('');
  const [verificandoId, setVerificandoId] = useState<number | null>(null);
  const [viewingFactura, setViewingFactura] = useState<Factura | null>(null);
  const [ajustando, setAjustando] = useState<{ tipo: 'CREDITO' | 'DEBITO'; factura: Factura } | null>(null);

  const handleVerificarEstado = async (id: number) => {
    setVerificandoId(id);
    try {
      const actualizada = await onVerificarEstadoFactura(id);
      // El mensaje va primero: una Nota ACEPTADA puede traer el aviso de que su ajuste de inventario
      // o cuenta por cobrar hay que hacerlo a mano, y un "aceptado" verde lo escondería.
      if (actualizada.estado === 'RECHAZADA') notify.error(actualizada.mensajeError || 'Hacienda rechazó el comprobante.', 'Comprobante rechazado');
      else if (actualizada.mensajeError) notify.warning(actualizada.mensajeError, actualizada.estado === 'ACEPTADA' ? 'Aceptado — requiere ajuste manual' : undefined);
      else if (actualizada.estado === 'ACEPTADA') notify.success(`Hacienda aceptó el comprobante ${actualizada.consecutivo}.`);
      else notify.info('Hacienda todavía está procesando el comprobante. Vuelva a verificar en unos minutos.');
    } catch (err: any) {
      // Antes este error iba al recuadro del panel de anulación, que casi nunca está abierto.
      notify.error(err.message || 'No se pudo verificar el estado con Hacienda.');
    } finally {
      setVerificandoId(null);
    }
  };

  const ordenadas = [...facturas].sort((a, b) => b.creadaEn.localeCompare(a.creadaEn));

  const nombrePaciente = (idPaciente: number) => patients.find(p => p.id === idPaciente)?.nombreCompleto || `Paciente #${idPaciente}`;
  const referenciaFactura = (idFacturaReferencia: number | null) => {
    if (idFacturaReferencia == null) return null;
    return facturas.find(f => f.id === idFacturaReferencia)?.consecutivo || `#${idFacturaReferencia}`;
  };

  // Una Nota referencia la factura por su clave: solo tiene sentido sobre una que Hacienda aceptó.
  const puedeAjustar = (f: Factura) => f.tipoDocumento === '01' && f.estado === 'ACEPTADA';
  // Anular sirve para cualquier factura (también rechazadas o de prueba, que antes no tenían forma
  // de reversarse), salvo mientras Hacienda la procesa: primero hay que verificar su estado.
  const puedeAnularFactura = (f: Factura) => puedeAnular && f.tipoDocumento === '01' && f.estado !== 'ANULADA' && f.estado !== 'ENVIADA';
  const puedeVerificar = (f: Factura) => f.estado === 'ENVIADA' || f.estado === 'ERROR';

  const handleConfirmarAnular = async (id: number) => {
    if (!motivoAnulacion.trim()) {
      setError('Indique el motivo de la anulación.');
      return;
    }
    setAnulando(true);
    setError('');
    try {
      const { factura, notaCredito } = await onAnularFactura(id, motivoAnulacion.trim());
      notify.success(notaCredito
        ? `Factura ${factura.consecutivo} anulada con la Nota de Crédito ${notaCredito.consecutivo} (${notaCredito.estado}).`
        : `Factura ${factura.consecutivo} anulada en el sistema, sin Nota de Crédito.`);
      setAnulandoId(null);
      setMotivoAnulacion('');
    } catch (err: any) {
      setError(err.message || 'No se pudo anular la factura.');
    } finally {
      setAnulando(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
        <Receipt className="w-5 h-5 text-slate-500" />
        <div>
          <h3 className="text-sm font-bold text-slate-800">Facturación Electrónica</h3>
          <p className="text-[11px] text-slate-500">Historial de Facturas y Notas de Crédito emitidas a Hacienda</p>
        </div>
      </div>

      {ordenadas.length === 0 && (
        <p className="text-slate-500 text-xs text-center py-6">Todavía no se ha emitido ninguna factura.</p>
      )}

      <div className="space-y-1.5">
        {ordenadas.map(f => {
          const esNotaCredito = f.tipoDocumento === '03';
          const esNotaDebito = f.tipoDocumento === '02';
          const esNota = esNotaCredito || esNotaDebito;
          return (
            <div key={f.id} className="p-2.5 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-800 inline-flex items-center gap-1.5 text-xs">
                    {esNotaCredito ? <FileMinus className="w-3.5 h-3.5 text-rose-500" /> : esNotaDebito ? <FilePlus className="w-3.5 h-3.5 text-amber-600" /> : <Receipt className="w-3.5 h-3.5 text-slate-500" />}
                    {esNotaCredito ? 'Nota de Crédito' : esNotaDebito ? 'Nota de Débito' : 'Factura'} {f.consecutivo}
                  </span>
                  <span className="text-[11px] text-slate-500 block truncate">
                    {nombrePaciente(f.idPaciente)} &middot; {new Date(f.fechaEmision).toLocaleString('es-CR')} &middot; ₡{f.total.toLocaleString('es-CR', { maximumFractionDigits: 2 })}
                    {f.condicionVenta === '02' && ' · Crédito'}
                    {!esNotaCredito && ` · ${MEDIO_PAGO_LABEL[f.medioPago] || f.medioPago}`}
                    {!esNota && f.montoRecibido != null && ` · Vuelto ₡${(f.montoRecibido - f.total).toLocaleString('es-CR', { maximumFractionDigits: 2 })}`}
                  </span>
                  {esNota && f.idFacturaReferencia != null && (
                    <span className="text-[11px] text-slate-500 block">{esNotaCredito ? 'Ajusta' : 'Debita'} factura {referenciaFactura(f.idFacturaReferencia)}{f.motivoAnulacion ? ` — ${f.motivoAnulacion}` : ''}</span>
                  )}
                  {!esNota && f.estado === 'ANULADA' && f.motivoAnulacion && (
                    <span className="text-[11px] text-slate-500 block truncate" title={f.motivoAnulacion}>Anulada — {f.motivoAnulacion}</span>
                  )}
                  {f.mensajeError && f.estado !== 'SIMULADA' && (
                    <span className={`text-[11px] block truncate ${f.estado === 'ERROR' || f.estado === 'RECHAZADA' ? 'text-rose-600' : 'text-amber-700'}`} title={f.mensajeError}>{f.mensajeError}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ESTADO_ESTILO[f.estado] || 'bg-slate-100 text-slate-600'}`}>
                    {f.estado}
                  </span>
                  <button
                    onClick={() => setViewingFactura(f)}
                    title="Ver / Imprimir / Reenviar"
                    className="p-2.5 rounded-lg text-slate-500 hover:bg-slate-100"
                    aria-label="Ver / Imprimir / Reenviar"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  {puedeVerificar(f) && (
                    <button
                      onClick={() => handleVerificarEstado(f.id)}
                      disabled={verificandoId === f.id}
                      title="Verificar estado con Hacienda"
                      className="p-2.5 rounded-lg text-amber-600 hover:bg-amber-50 disabled:opacity-50"
                      aria-label="Verificar estado con Hacienda"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${verificandoId === f.id ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                  {/* Una Nota de Crédito puede acreditar todo lo vendido (equivale a anular): mismo permiso. */}
                  {puedeAjustar(f) && puedeAnular && (
                    <button
                      onClick={() => setAjustando({ tipo: 'CREDITO', factura: f })}
                      title="Emitir Nota de Crédito parcial"
                      className="p-2.5 rounded-lg text-indigo-500 hover:bg-indigo-50"
                      aria-label="Emitir Nota de Crédito parcial"
                    >
                      <FileMinus className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {puedeAjustar(f) && (
                    <button
                      onClick={() => setAjustando({ tipo: 'DEBITO', factura: f })}
                      title="Emitir Nota de Débito"
                      className="p-2.5 rounded-lg text-amber-600 hover:bg-amber-50"
                      aria-label="Emitir Nota de Débito"
                    >
                      <FilePlus className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {puedeAnularFactura(f) && (
                    <button
                      onClick={() => { setAnulandoId(f.id); setMotivoAnulacion(''); setError(''); }}
                      title="Anular Factura"
                      className="p-2.5 rounded-lg text-rose-500 hover:bg-rose-50"
                      aria-label="Anular Factura"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {anulandoId === f.id && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-2">
                  {error && (
                    <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500">
                    {explicacionAnulacion(f, cantidadesAcreditadas(facturas, f.id))}
                  </p>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label htmlFor={`motivo-anulacion-${f.id}`} className="block text-slate-600 font-medium mb-1 text-[11px]">Motivo de la anulación *</label>
                      <input
                        id={`motivo-anulacion-${f.id}`}
                        type="text"
                        maxLength={MOTIVO_MAX}
                        value={motivoAnulacion}
                        onChange={(e) => setMotivoAnulacion(e.target.value)}
                        placeholder="ej: Error en el monto facturado"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                      />
                    </div>
                    <button
                      onClick={() => setAnulandoId(null)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleConfirmarAnular(f.id)}
                      disabled={anulando}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-60"
                    >
                      {anulando ? 'Anulando…' : 'Confirmar Anulación'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {viewingFactura && (() => {
        const pacienteFactura = patients.find(p => p.id === viewingFactura.idPaciente);
        if (!pacienteFactura) return null;
        return (
          <FacturaDetailView
            factura={viewingFactura}
            patient={pacienteFactura}
            company={company}
            onClose={() => setViewingFactura(null)}
            onReenviarCorreo={onReenviarCorreo}
          />
        );
      })()}

      {ajustando && (
        <AjusteFacturaModal
          tipo={ajustando.tipo}
          factura={ajustando.factura}
          servicios={servicios}
          ivaPorDefecto={company.ivaPorDefecto}
          yaAcreditado={cantidadesAcreditadas(facturas, ajustando.factura.id)}
          motivoMax={MOTIVO_MAX}
          onEmitir={ajustando.tipo === 'CREDITO' ? onEmitirNotaCredito : onEmitirNotaDebito}
          onClose={() => setAjustando(null)}
          themeColor={company.colorPrimario}
        />
      )}
    </div>
  );
}
