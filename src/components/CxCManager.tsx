import React, { useState } from 'react';
import { CuentaCobrar, Patient } from '../data/mockData';
import { Wallet, AlertCircle, DollarSign } from 'lucide-react';
import { fechaCR } from '../utils/fechaCR';
import { StatCard } from './ui/StatCard';
import { Card } from './ui/Card';
import { Badge, type BadgeTone } from './ui/Badge';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { EmptyState } from './ui/EmptyState';
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

const ESTADO_TONO: Record<string, BadgeTone> = {
  PENDIENTE: 'warning',
  VENCIDA: 'danger',
  PAGADA: 'success',
  ANULADA: 'neutral'
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

  const nombrePaciente = (idPaciente: number, cuenta?: CuentaCobrar) =>
    patients.find(p => p.id === idPaciente)?.nombreCompleto || cuenta?.receptorNombre || `Paciente #${idPaciente}`;

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

  const labelCls = 'block text-fg font-semibold mb-1.5 text-xs';

  return (
    <section aria-labelledby="cxc-titulo">
      <div className="mb-4">
        <h3 id="cxc-titulo" className="text-heading font-semibold text-fg tracking-tight">Cuentas por Cobrar</h3>
        <p className="text-body text-fg-muted">Facturas emitidas a crédito y sus abonos</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label="Saldo por cobrar" value={colones(saldoPorCobrar)} icon={<Wallet />} className="bg-warning-soft border-warning/25" />
        <StatCard label="De eso, vencido" value={colones(totalVencido)} icon={<AlertCircle />} className={totalVencido > 0 ? 'bg-danger-soft border-danger/25' : undefined} />
        <StatCard label="Cobrado (abonos)" value={colones(totalCobrado)} icon={<DollarSign />} className="bg-success-soft border-success/25" />
      </div>

      <Card>
        <div className="flex flex-wrap gap-1.5 p-4 border-b border-border" role="group" aria-label="Filtrar cuentas por cobrar">
          {FILTROS.map(([f, etiqueta]) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              aria-pressed={filtro === f}
              className={`min-h-10 px-4 rounded-control text-xs font-semibold transition-colors ${filtro === f ? 'bg-brand-solid text-brand-fg shadow-xs' : 'bg-surface-muted text-fg-muted hover:bg-border hover:text-fg'}`}
            >
              {etiqueta}
            </button>
          ))}
        </div>

        {visibles.length === 0 && (
          <EmptyState icon={<Wallet />} title="Sin cuentas por cobrar" description="No hay cuentas por cobrar en este filtro." />
        )}

        <ul className="divide-y divide-border">
        {visibles.map(c => {
          const estado = estadoEfectivo(c);
          const plazo = c.estado === 'PENDIENTE' ? plazoVencimiento(c.fechaVencimiento) : null;
          return (
            <li key={c.id} className="p-4 hover:bg-surface-muted/40 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <span className="font-semibold text-fg text-body block">{nombrePaciente(c.idPaciente, c)}</span>
                  <span className="text-xs text-fg-muted block">
                    Factura {c.facturaConsecutivo} &middot; Emitida {fechaCorta(c.fechaEmision)} &middot; {c.plazoDias} días &middot; Vence {fechaCorta(c.fechaVencimiento)}
                    {plazo && <span className={`font-semibold ${plazo.vencida ? 'text-danger' : 'text-fg'}`}> ({plazo.texto})</span>}
                  </span>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <div className="text-right tabular-nums">
                    <span className="block text-body font-semibold text-fg">{colones(c.saldoPendiente)}</span>
                    <span className="block text-caption text-fg-subtle">de {colones(c.montoTotal)}</span>
                  </div>
                  <Badge tone={ESTADO_TONO[estado]}>{estado}</Badge>
                  {!soloLectura && c.estado === 'PENDIENTE' && (
                    <button
                      type="button"
                      onClick={() => abrirAbono(c)}
                      title="Registrar abono"
                      className="w-10 h-10 flex items-center justify-center rounded-control text-success hover:bg-success-soft"
                      aria-label={`Registrar abono de ${nombrePaciente(c.idPaciente, c)}, factura ${c.facturaConsecutivo}`}
                    >
                      <DollarSign className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              {c.pagos.length > 0 && (
                <ul className="mt-2 pl-3 border-l-2 border-border space-y-0.5" aria-label="Abonos">
                  {c.pagos.map(p => (
                    <li key={p.id} className="text-xs text-fg-muted tabular-nums">
                      {fechaCorta(p.fecha)} &middot; {colones(p.monto)} &middot; {MEDIO_PAGO_ABONO[p.medioPago] || p.medioPago}{p.referencia ? ` (${p.referencia})` : ''}
                    </li>
                  ))}
                </ul>
              )}

              {abonandoId === c.id && (
                <div className="mt-3 pt-3 border-t border-border space-y-3 animate-slide-down">
                  {error && (
                    <div role="alert" className="p-2.5 rounded-control bg-danger-soft border border-danger/20 text-danger text-xs flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span>{error}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label htmlFor={`cxc-monto-${c.id}`} className={labelCls}>Monto (₡)</label>
                      <Input id={`cxc-monto-${c.id}`} type="number" min="0" step="0.01" inputMode="decimal" value={montoAbono} onChange={(e: any) => setMontoAbono(e.target.value)} className="tabular-nums" />
                    </div>
                    <div>
                      <label htmlFor={`cxc-medio-${c.id}`} className={labelCls}>Medio de pago</label>
                      <Select id={`cxc-medio-${c.id}`} value={medioPagoAbono} onChange={(e: any) => setMedioPagoAbono(e.target.value)}>
                        {Object.entries(MEDIO_PAGO_ABONO).map(([codigo, nombre]) => (
                          <option key={codigo} value={codigo}>{nombre}</option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <label htmlFor={`cxc-ref-${c.id}`} className={labelCls}>Referencia</label>
                      <Input id={`cxc-ref-${c.id}`} type="text" value={referenciaAbono} onChange={(e: any) => setReferenciaAbono(e.target.value)} placeholder="ej: # comprobante SINPE" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" onClick={() => setAbonandoId(null)}>Cancelar</Button>
                    <Button onClick={() => confirmarAbono(c)} disabled={guardando}>
                      {guardando ? 'Guardando…' : 'Registrar abono'}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        </ul>
      </Card>
    </section>
  );
}
