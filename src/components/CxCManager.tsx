import React, { useState } from 'react';
import { CuentaCobrar, Patient } from '../data/mockData';
import { Wallet, AlertCircle, DollarSign } from 'lucide-react';
import { fechaCR } from '../utils/fechaCR';
import { MEDIO_PAGO_ABONO, colones, fechaCorta, plazoVencimiento } from '../utils/facturacion';

interface CxCManagerProps {
  cxc: CuentaCobrar[];
  patients: Patient[];
  onRegistrarPago: (idCuentaCobrar: number, monto: number, medioPago: string, referencia: string) => Promise<void>;
  soloLectura?: boolean; // Contador: sin registrar abonos
}

// Con la fecha de hoy en Costa Rica: con la fecha UTC, después de las 6 p.m. una cuenta que vence
// hoy ya aparecía VENCIDA.
function estadoEfectivo(c: CuentaCobrar): 'PENDIENTE' | 'VENCIDA' | 'PAGADA' | 'ANULADA' {
  if (c.estado !== 'PENDIENTE') return c.estado;
  return c.fechaVencimiento < fechaCR() ? 'VENCIDA' : 'PENDIENTE';
}

const ESTADO_ESTILO: Record<string, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-800',
  VENCIDA: 'bg-rose-100 text-rose-800',
  PAGADA: 'bg-emerald-100 text-emerald-800',
  ANULADA: 'bg-slate-200 text-slate-700'
};

const FILTROS = [['TODAS', 'Todas'], ['PENDIENTE', 'Al día'], ['VENCIDA', 'Vencidas'], ['PAGADA', 'Pagadas']] as const;

export default function CxCManager({ cxc, patients, onRegistrarPago, soloLectura = false }: CxCManagerProps) {
  const [filtro, setFiltro] = useState<'TODAS' | 'PENDIENTE' | 'VENCIDA' | 'PAGADA'>('TODAS');
  const [abonandoId, setAbonandoId] = useState<number | null>(null);
  const [montoAbono, setMontoAbono] = useState('');
  const [medioPagoAbono, setMedioPagoAbono] = useState('01');
  const [referenciaAbono, setReferenciaAbono] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const nombrePaciente = (idPaciente: number) => patients.find(p => p.id === idPaciente)?.nombreCompleto || `Paciente #${idPaciente}`;

  // Las vencidas primero (por fecha de vencimiento): es lo que tesorería tiene que gestionar hoy.
  const ordenadas = [...cxc].sort((a, b) =>
    Number(estadoEfectivo(b) === 'VENCIDA') - Number(estadoEfectivo(a) === 'VENCIDA') || a.fechaVencimiento.localeCompare(b.fechaVencimiento));
  const visibles = ordenadas.filter(c => filtro === 'TODAS' || estadoEfectivo(c) === filtro);

  const saldoPorCobrar = cxc.filter(c => c.estado === 'PENDIENTE').reduce((s, c) => s + c.saldoPendiente, 0);
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
      setError(`El abono no puede superar el saldo pendiente (${colones(c.saldoPendiente)}).`);
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

  const campo = 'w-full min-h-10 bg-slate-50 border border-slate-200 rounded-lg px-2.5 text-xs text-slate-800';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
        <Wallet className="w-5 h-5 text-slate-500" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-bold text-slate-800">Cuentas por Cobrar</h3>
          <p className="text-[11px] text-slate-600">Facturas emitidas a crédito y sus abonos</p>
        </div>
      </div>

      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <dt className="text-[11px] font-bold text-amber-800 uppercase">Saldo por cobrar</dt>
          <dd className="text-sm font-bold text-amber-900 tabular-nums">{colones(saldoPorCobrar)}</dd>
        </div>
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
          <dt className="text-[11px] font-bold text-rose-800 uppercase">De eso, vencido</dt>
          <dd className="text-sm font-bold text-rose-900 tabular-nums">{colones(totalVencido)}</dd>
        </div>
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <dt className="text-[11px] font-bold text-emerald-800 uppercase">Cobrado (abonos)</dt>
          <dd className="text-sm font-bold text-emerald-900 tabular-nums">{colones(totalCobrado)}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-1.5 mb-3" role="group" aria-label="Filtrar cuentas por cobrar">
        {FILTROS.map(([f, etiqueta]) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            aria-pressed={filtro === f}
            className={`min-h-9 px-3 rounded-lg text-[11px] font-bold ${filtro === f ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {visibles.length === 0 && (
        <p className="text-slate-600 text-xs text-center py-6">No hay cuentas por cobrar en este filtro.</p>
      )}

      <ul className="space-y-1.5">
        {visibles.map(c => {
          const estado = estadoEfectivo(c);
          const plazo = c.estado === 'PENDIENTE' ? plazoVencimiento(c.fechaVencimiento) : null;
          return (
            <li key={c.id} className="p-2.5 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-800 text-xs block">{nombrePaciente(c.idPaciente)}</span>
                  <span className="text-[11px] text-slate-600 block">
                    Factura {c.facturaConsecutivo} &middot; Emitida {fechaCorta(c.fechaEmision)} &middot; {c.plazoDias} días &middot; Vence {fechaCorta(c.fechaVencimiento)}
                    {plazo && <span className={`font-semibold ${plazo.vencida ? 'text-rose-700' : 'text-slate-700'}`}> ({plazo.texto})</span>}
                  </span>
                  <span className="text-[11px] text-slate-700 block tabular-nums">
                    Total {colones(c.montoTotal)} &middot; <span className="font-semibold">Saldo {colones(c.saldoPendiente)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ESTADO_ESTILO[estado]}`}>{estado}</span>
                  {!soloLectura && c.estado === 'PENDIENTE' && (
                    <button
                      type="button"
                      onClick={() => abrirAbono(c)}
                      title="Registrar abono"
                      className="w-10 h-10 flex items-center justify-center rounded-lg text-emerald-700 hover:bg-emerald-50"
                      aria-label={`Registrar abono de ${nombrePaciente(c.idPaciente)}, factura ${c.facturaConsecutivo}`}
                    >
                      <DollarSign className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              {c.pagos.length > 0 && (
                <ul className="mt-1.5 pl-2 border-l-2 border-slate-100 space-y-0.5" aria-label="Abonos">
                  {c.pagos.map(p => (
                    <li key={p.id} className="text-[11px] text-slate-600 tabular-nums">
                      {fechaCorta(p.fecha)} &middot; {colones(p.monto)} &middot; {MEDIO_PAGO_ABONO[p.medioPago] || p.medioPago}{p.referencia ? ` (${p.referencia})` : ''}
                    </li>
                  ))}
                </ul>
              )}

              {abonandoId === c.id && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-2">
                  {error && (
                    <div role="alert" className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <div>
                      <label htmlFor={`cxc-monto-${c.id}`} className="block text-slate-600 font-medium mb-1 text-[11px]">Monto (₡)</label>
                      <input id={`cxc-monto-${c.id}`} type="number" min="0" step="0.01" inputMode="decimal" value={montoAbono} onChange={(e) => setMontoAbono(e.target.value)} className={campo} />
                    </div>
                    <div>
                      <label htmlFor={`cxc-medio-${c.id}`} className="block text-slate-600 font-medium mb-1 text-[11px]">Medio de pago</label>
                      <select id={`cxc-medio-${c.id}`} value={medioPagoAbono} onChange={(e) => setMedioPagoAbono(e.target.value)} className={campo}>
                        {Object.entries(MEDIO_PAGO_ABONO).map(([codigo, nombre]) => (
                          <option key={codigo} value={codigo}>{nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={`cxc-ref-${c.id}`} className="block text-slate-600 font-medium mb-1 text-[11px]">Referencia</label>
                      <input id={`cxc-ref-${c.id}`} type="text" value={referenciaAbono} onChange={(e) => setReferenciaAbono(e.target.value)} placeholder="ej: # comprobante SINPE" className={campo} />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setAbonandoId(null)} className="min-h-10 px-3 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-100">
                      Cancelar
                    </button>
                    <button type="button" onClick={() => confirmarAbono(c)} disabled={guardando} className="min-h-10 px-3 rounded-lg text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60">
                      {guardando ? 'Guardando…' : 'Registrar abono'}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
