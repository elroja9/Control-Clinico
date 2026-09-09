import React, { useState } from 'react';
import { Factura, Patient, Company, Servicio, NotificationLog } from '../data/mockData';
import { Receipt, XCircle, FileMinus, FilePlus, AlertCircle, RefreshCw, Eye } from 'lucide-react';
import FacturaDetailView from './FacturaDetailView';
import AjusteFacturaModal from './AjusteFacturaModal';

interface FacturacionManagerProps {
  facturas: Factura[];
  patients: Patient[];
  company: Company;
  servicios: Servicio[];
  onAnularFactura: (idFactura: number, motivo: string) => Promise<Factura>;
  onEmitirNotaCredito: (idFactura: number, payload: { motivo: string; lineas: Array<{ idServicio: number; cantidad: number }>; modoPrueba: boolean }) => Promise<Factura>;
  onEmitirNotaDebito: (idFactura: number, payload: { motivo: string; lineas: Array<{ idServicio: number; cantidad: number }>; medioPago?: string; modoPrueba: boolean }) => Promise<Factura>;
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

export default function FacturacionManager({ facturas, patients, company, servicios, onAnularFactura, onEmitirNotaCredito, onEmitirNotaDebito, onVerificarEstadoFactura, onReenviarCorreo }: FacturacionManagerProps) {
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
      await onVerificarEstadoFactura(id);
    } catch (err: any) {
      setError(err.message || 'No se pudo verificar el estado con Hacienda.');
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

  const puedeAnular = (f: Factura) => f.tipoDocumento === '01' && (f.estado === 'ENVIADA' || f.estado === 'ACEPTADA');

  const handleConfirmarAnular = async (id: number) => {
    if (!motivoAnulacion.trim()) {
      setError('Indique el motivo de la anulación.');
      return;
    }
    setAnulando(true);
    setError('');
    try {
      await onAnularFactura(id, motivoAnulacion.trim());
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
        <p className="text-slate-400 text-xs text-center py-6">Todavía no se ha emitido ninguna factura.</p>
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
                  <span className="text-[10px] text-slate-500 block truncate">
                    {nombrePaciente(f.idPaciente)} &middot; {new Date(f.fechaEmision).toLocaleString('es-CR')} &middot; ₡{f.total.toLocaleString('es-CR', { maximumFractionDigits: 2 })}
                    {f.condicionVenta === '02' && ' · Crédito'}
                    {!esNotaCredito && ` · ${MEDIO_PAGO_LABEL[f.medioPago] || f.medioPago}`}
                    {!esNota && f.montoRecibido != null && ` · Vuelto ₡${(f.montoRecibido - f.total).toLocaleString('es-CR', { maximumFractionDigits: 2 })}`}
                  </span>
                  {esNota && f.idFacturaReferencia != null && (
                    <span className="text-[10px] text-slate-400 block">{esNotaCredito ? 'Ajusta' : 'Debita'} factura {referenciaFactura(f.idFacturaReferencia)}{f.motivoAnulacion ? ` — ${f.motivoAnulacion}` : ''}</span>
                  )}
                  {f.mensajeError && (f.estado === 'ERROR' || f.estado === 'RECHAZADA') && (
                    <span className="text-[10px] text-rose-600 block truncate" title={f.mensajeError}>{f.mensajeError}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTADO_ESTILO[f.estado] || 'bg-slate-100 text-slate-600'}`}>
                    {f.estado}
                  </span>
                  <button
                    onClick={() => setViewingFactura(f)}
                    title="Ver / Imprimir / Reenviar"
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  {f.estado === 'ENVIADA' && (
                    <button
                      onClick={() => handleVerificarEstado(f.id)}
                      disabled={verificandoId === f.id}
                      title="Verificar estado con Hacienda"
                      className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${verificandoId === f.id ? 'animate-spin' : ''}`} />
                    </button>
                  )}
                  {puedeAnular(f) && (
                    <button
                      onClick={() => setAjustando({ tipo: 'CREDITO', factura: f })}
                      title="Emitir Nota de Crédito parcial"
                      className="p-1.5 rounded-lg text-indigo-500 hover:bg-indigo-50"
                    >
                      <FileMinus className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {puedeAnular(f) && (
                    <button
                      onClick={() => setAjustando({ tipo: 'DEBITO', factura: f })}
                      title="Emitir Nota de Débito"
                      className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50"
                    >
                      <FilePlus className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {puedeAnular(f) && (
                    <button
                      onClick={() => { setAnulandoId(f.id); setMotivoAnulacion(''); setError(''); }}
                      title="Anular Factura"
                      className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {anulandoId === f.id && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-2">
                  {error && (
                    <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[10px] flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                  <p className="text-[10px] text-slate-500">
                    Esto emite y firma una Nota de Crédito Electrónica que anula esta factura ante Hacienda
                    {f.lineas.some(l => l.tipo === 'ARTICULO') ? ' y repone las existencias de los artículos facturados' : ''}.
                    No se puede deshacer.
                  </p>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <label className="block text-slate-600 font-medium mb-1 text-[10px]">Motivo de la anulación *</label>
                      <input
                        type="text"
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
          onEmitir={ajustando.tipo === 'CREDITO' ? onEmitirNotaCredito : onEmitirNotaDebito}
          onClose={() => setAjustando(null)}
          themeColor={company.colorPrimario}
        />
      )}
    </div>
  );
}
