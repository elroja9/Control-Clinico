import React, { useState } from 'react';
import { CuentaCobrar, Patient } from '../data/mockData';
import { Wallet, AlertCircle, DollarSign } from 'lucide-react';

interface CxCManagerProps {
  cxc: CuentaCobrar[];
  patients: Patient[];
  onRegistrarPago: (idCuentaCobrar: number, monto: number, medioPago: string, referencia: string) => Promise<void>;
}

const MEDIOS_PAGO: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Tarjeta',
  '03': 'Transferencia/SINPE',
  '04': 'Cheque'
};

function hoyISO(): string {
  return new Date().toISOString().split('T')[0];
}

function estadoEfectivo(c: CuentaCobrar): 'PENDIENTE' | 'VENCIDA' | 'PAGADA' | 'ANULADA' {
  if (c.estado !== 'PENDIENTE') return c.estado;
  return c.fechaVencimiento < hoyISO() ? 'VENCIDA' : 'PENDIENTE';
}

const ESTADO_ESTILO: Record<string, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-800',
  VENCIDA: 'bg-rose-100 text-rose-800',
  PAGADA: 'bg-emerald-100 text-emerald-800',
  ANULADA: 'bg-slate-200 text-slate-600'
};

export default function CxCManager({ cxc, patients, onRegistrarPago }: CxCManagerProps) {
  const [filtro, setFiltro] = useState<'TODAS' | 'PENDIENTE' | 'VENCIDA' | 'PAGADA'>('TODAS');
  const [abonandoId, setAbonandoId] = useState<number | null>(null);
  const [montoAbono, setMontoAbono] = useState('');
  const [medioPagoAbono, setMedioPagoAbono] = useState('01');
  const [referenciaAbono, setReferenciaAbono] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const nombrePaciente = (idPaciente: number) => patients.find(p => p.id === idPaciente)?.nombreCompleto || `Paciente #${idPaciente}`;

  const ordenadas = [...cxc].sort((a, b) => b.fechaEmision.localeCompare(a.fechaEmision));
  const visibles = ordenadas.filter(c => filtro === 'TODAS' || estadoEfectivo(c) === filtro);

  const totalPendiente = cxc.filter(c => estadoEfectivo(c) !== 'PAGADA' && c.estado === 'PENDIENTE').reduce((s, c) => s + c.saldoPendiente, 0);
  const totalVencido = cxc.filter(c => estadoEfectivo(c) === 'VENCIDA').reduce((s, c) => s + c.saldoPendiente, 0);
  const totalCobrado = cxc.reduce((s, c) => s + c.pagos.reduce((sp, p) => sp + p.monto, 0), 0);

  const abrirAbono = (c: CuentaCobrar) => {
    setAbonandoId(c.id);
    setMontoAbono(c.saldoPendiente.toString());
    setMedioPagoAbono('01');
    setReferenciaAbono('');
    setError('');
  };

  const confirmarAbono = async (c: CuentaCobrar) => {
    const monto = parseFloat(montoAbono);
    if (!Number.isFinite(monto) || monto <= 0) {
      setError('Indique un monto válido.');
      return;
    }
    if (monto > c.saldoPendiente) {
      setError(`El abono no puede superar el saldo pendiente (₡${c.saldoPendiente.toLocaleString('es-CR')}).`);
      return;
    }
    setGuardando(true);
    setError('');
    try {
      await onRegistrarPago(c.id, monto, medioPagoAbono, referenciaAbono.trim());
      setAbonandoId(null);
    } catch (err: any) {
      setError(err.message || 'No se pudo registrar el abono.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
        <Wallet className="w-5 h-5 text-slate-500" />
        <div>
          <h3 className="text-sm font-bold text-slate-800">Cuentas por Cobrar</h3>
          <p className="text-[11px] text-slate-500">Facturas emitidas a crédito y sus abonos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <span className="text-[11px] font-bold text-amber-700 uppercase block">Pendiente</span>
          <span className="text-sm font-bold text-amber-900">₡{totalPendiente.toLocaleString('es-CR', { maximumFractionDigits: 0 })}</span>
        </div>
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
          <span className="text-[11px] font-bold text-rose-700 uppercase block">Vencido</span>
          <span className="text-sm font-bold text-rose-900">₡{totalVencido.toLocaleString('es-CR', { maximumFractionDigits: 0 })}</span>
        </div>
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <span className="text-[11px] font-bold text-emerald-700 uppercase block">Cobrado</span>
          <span className="text-sm font-bold text-emerald-900">₡{totalCobrado.toLocaleString('es-CR', { maximumFractionDigits: 0 })}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {(['TODAS', 'PENDIENTE', 'VENCIDA', 'PAGADA'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${filtro === f ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {f === 'TODAS' ? 'Todas' : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {visibles.length === 0 && (
        <p className="text-slate-500 text-xs text-center py-6">No hay cuentas por cobrar en este filtro.</p>
      )}

      <div className="space-y-1.5">
        {visibles.map(c => {
          const estado = estadoEfectivo(c);
          return (
            <div key={c.id} className="p-2.5 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-800 text-xs block">{nombrePaciente(c.idPaciente)}</span>
                  <span className="text-[11px] text-slate-500 block">
                    Factura {c.facturaConsecutivo} &middot; Emitida {c.fechaEmision} &middot; Vence {c.fechaVencimiento}
                  </span>
                  <span className="text-[11px] text-slate-600 block">
                    Total ₡{c.montoTotal.toLocaleString('es-CR')} &middot; Saldo ₡{c.saldoPendiente.toLocaleString('es-CR')}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ESTADO_ESTILO[estado]}`}>{estado}</span>
                  {c.estado === 'PENDIENTE' && (
                    <button
                      onClick={() => abrirAbono(c)}
                      title="Registrar Abono"
                      className="p-2.5 rounded-lg text-emerald-600 hover:bg-emerald-50"
                      aria-label="Registrar Abono"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {c.pagos.length > 0 && (
                <div className="mt-1.5 pl-2 border-l-2 border-slate-100 space-y-0.5">
                  {c.pagos.map(p => (
                    <p key={p.id} className="text-[11px] text-slate-500">
                      {p.fecha} &middot; ₡{p.monto.toLocaleString('es-CR')} &middot; {MEDIOS_PAGO[p.medioPago] || p.medioPago}{p.referencia ? ` (${p.referencia})` : ''}
                    </p>
                  ))}
                </div>
              )}

              {abonandoId === c.id && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-2">
                  {error && (
                    <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label className="block text-slate-600 font-medium mb-1 text-[11px]">Monto (₡)</label>
                      <input
                        type="number" min="0" step="0.01"
                        value={montoAbono}
                        onChange={(e) => setMontoAbono(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-medium mb-1 text-[11px]">Medio de Pago</label>
                      <select
                        value={medioPagoAbono}
                        onChange={(e) => setMedioPagoAbono(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                      >
                        {Object.entries(MEDIOS_PAGO).map(([codigo, nombre]) => (
                          <option key={codigo} value={codigo}>{nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-600 font-medium mb-1 text-[11px]">Referencia</label>
                      <input
                        type="text"
                        value={referenciaAbono}
                        onChange={(e) => setReferenciaAbono(e.target.value)}
                        placeholder="ej: # comprobante SINPE"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => setAbonandoId(null)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => confirmarAbono(c)}
                      disabled={guardando}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {guardando ? 'Guardando…' : 'Registrar Abono'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
