import React, { useCallback, useEffect, useState } from 'react';
import { Company, User, CompanyPayment } from '../data/mockData';
import { ShieldCheck, ShieldAlert, ShieldOff, Users, History, X, Plus, Building2, RefreshCw, FileText, CalendarClock, Settings2 } from 'lucide-react';
import { notify, confirmar } from './ui/Feedback';
import { useDialog } from '../hooks/useDialog';
import { Badge, type BadgeTone, Button, Card, CardHeader, EmptyState, Field, IconButton, Input, ResponsiveModal, SegmentedControl } from './ui';
import IntegracionErpCard, { apiJson, type ConfigIntegracionErp } from './IntegracionErpCard';

interface SaasAdminPanelProps {
  companies: Company[];
  users: User[];
  payments: CompanyPayment[];
  onUpdateEstadoSaas: (companyId: number, estadoSaas: Company['estadoSaas']) => void;
  onUpdateMaxUsuarios: (companyId: number, maxUsuarios: number) => void;
  onLoadPayments: (companyId: number) => void;
  onAddPayment: (payment: Omit<CompanyPayment, 'id'> & { montoMensual?: number | null; proximoVencimiento?: string | null }) => void;
  /** Fila de la empresa actualizada por el servidor (suscripción y estado del ERP). */
  onCompanyUpdated: (company: Company) => void;
}

const ESTADO_TONE: Record<Company['estadoSaas'], BadgeTone> = {
  PENDIENTE: 'warning',
  ACTIVA: 'success',
  SUSPENDIDA: 'danger'
};

const ESTADO_LABEL: Record<Company['estadoSaas'], string> = {
  PENDIENTE: 'Pendiente',
  ACTIVA: 'Activa',
  SUSPENDIDA: 'Suspendida'
};

/** FacturaResumen del contrato del ERP. */
interface FacturaErp {
  id: number;
  consecutivo: string | null;
  fechaEmision: string | null;
  moneda: string | null;
  total: number;
  saldoPendiente: number;
  fechaVencimiento: string | null;
  estadoHacienda: string | null;
  pagada: boolean;
}

interface EstadoCuentaErp {
  suscriptor: { activo: boolean; moneda: string | null; montoMensual: number | null; proximaFacturacion: string | null };
  resumen: { saldoPendiente: number; saldoVencido: number; diasMoraMax: number; alDia: boolean; monedaSaldo: string | null };
  facturas: FacturaErp[];
}

function formatoMonto(monto: number | null | undefined, moneda: string | null | undefined): string {
  if (monto == null || !Number.isFinite(Number(monto))) return '—';
  const codigo = moneda === 'USD' ? 'USD' : 'CRC';
  return new Intl.NumberFormat('es-CR', { style: 'currency', currency: codigo, maximumFractionDigits: 2 }).format(Number(monto));
}

const fechaCorta = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : '—');

/** Insignia del estado de la empresa en el ERP (sincronización y mora). */
export function estadoErp(c: Company): { tone: BadgeTone; label: string; detalle?: string } {
  if (c.erpError) return { tone: 'danger', label: 'Error de sincronización', detalle: c.erpError };
  if (Number(c.erpPendienteSync) === 1) return { tone: 'warning', label: 'Sincronización pendiente' };
  if (!c.erpSincronizadoEn) return { tone: 'neutral', label: c.montoMensual ? 'Sin sincronizar' : 'Sin suscripción' };
  const mora = Number(c.erpDiasMora) || 0;
  if (mora > 0) return { tone: 'danger', label: `En mora ${mora} ${mora === 1 ? 'día' : 'días'}` };
  if (c.erpEstadoCuentaEn) return { tone: 'success', label: 'Al día' };
  return { tone: 'info', label: 'Sincronizada' };
}

function toneHacienda(estado: string | null): BadgeTone {
  const e = String(estado || '').toLowerCase();
  if (e.startsWith('acept')) return 'success';
  if (e.startsWith('rechaz')) return 'danger';
  return 'warning';
}

export default function SaasAdminPanel({
  companies,
  users,
  payments,
  onUpdateEstadoSaas,
  onUpdateMaxUsuarios,
  onLoadPayments,
  onAddPayment,
  onCompanyUpdated
}: SaasAdminPanelProps) {
  const [editingLimitId, setEditingLimitId] = useState<number | null>(null);
  const [limitDraft, setLimitDraft] = useState(5);
  const [paymentsCompanyId, setPaymentsCompanyId] = useState<number | null>(null);
  const pagosDialogRef = useDialog<HTMLDivElement>(paymentsCompanyId != null, () => setPaymentsCompanyId(null));
  const [newPaymentFecha, setNewPaymentFecha] = useState(new Date().toISOString().slice(0, 10));
  const [newPaymentMonto, setNewPaymentMonto] = useState(0);
  const [newPaymentNotas, setNewPaymentNotas] = useState('');
  const [newPaymentVencimiento, setNewPaymentVencimiento] = useState('');

  // --- Integración con el ERP ---
  const [configErp, setConfigErp] = useState<ConfigIntegracionErp | null>(null);
  const [cargandoConfig, setCargandoConfig] = useState(true);
  const [sincronizando, setSincronizando] = useState<Record<number, boolean>>({});

  // Suscripción (modal)
  const [suscripcionId, setSuscripcionId] = useState<number | null>(null);
  const [subMoneda, setSubMoneda] = useState<'CRC' | 'USD'>('CRC');
  const [subMonto, setSubMonto] = useState('');
  const [subDia, setSubDia] = useState('');
  const [guardandoSub, setGuardandoSub] = useState(false);

  // Estado de cuenta (modal)
  const [estadoCuentaId, setEstadoCuentaId] = useState<number | null>(null);
  const [estadoCuenta, setEstadoCuenta] = useState<EstadoCuentaErp | null>(null);
  const [estadoCuentaError, setEstadoCuentaError] = useState('');
  const [cargandoEstado, setCargandoEstado] = useState(false);

  // Facturar meses por adelantado (modal)
  const [adelantadoId, setAdelantadoId] = useState<number | null>(null);
  const [meses, setMeses] = useState('1');
  const [facturando, setFacturando] = useState(false);

  const cargarConfig = useCallback(async () => {
    setCargandoConfig(true);
    try {
      setConfigErp(await apiJson<ConfigIntegracionErp>('/api/saas/integracion-erp'));
    } catch (err: any) {
      console.error('Error cargando la integración con el ERP:', err);
      setConfigErp(null);
    } finally {
      setCargandoConfig(false);
    }
  }, []);

  useEffect(() => { cargarConfig(); }, [cargarConfig]);

  const erpConfigurado = !!configErp && !!configErp.url && configErp.apiKeyConfigurada && configErp.faltantes.length === 0;

  const openLimitEditor = (company: Company) => {
    setEditingLimitId(company.id);
    setLimitDraft(company.maxUsuarios);
  };

  const saveLimitEditor = (companyId: number) => {
    onUpdateMaxUsuarios(companyId, limitDraft);
    setEditingLimitId(null);
  };

  const openPayments = (company: Company) => {
    setPaymentsCompanyId(company.id);
    setNewPaymentFecha(new Date().toISOString().slice(0, 10));
    setNewPaymentMonto(0);
    setNewPaymentNotas('');
    setNewPaymentVencimiento(company.proximoVencimiento || '');
    onLoadPayments(company.id);
  };

  const handleAddPaymentSubmit = (e: React.FormEvent, company: Company) => {
    e.preventDefault();
    if (newPaymentMonto <= 0) {
      notify.warning('Ingrese un monto válido.');
      return;
    }
    onAddPayment({
      idCompania: company.id,
      fecha: newPaymentFecha,
      monto: newPaymentMonto,
      notas: newPaymentNotas,
      registradoPor: 'Administrador SaaS',
      proximoVencimiento: newPaymentVencimiento || null
    });
    setNewPaymentMonto(0);
    setNewPaymentNotas('');
  };

  const openSuscripcion = (company: Company) => {
    setSuscripcionId(company.id);
    setSubMoneda(company.monedaSuscripcion === 'USD' ? 'USD' : 'CRC');
    setSubMonto(company.montoMensual != null ? String(company.montoMensual) : '');
    setSubDia(company.diaFacturacion != null ? String(company.diaFacturacion) : '');
  };

  const guardarSuscripcion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (suscripcionId == null) return;
    const monto = Number(subMonto);
    const dia = Number(subDia);
    if (!(monto > 0)) return notify.warning('Ingrese una cuota mensual mayor que cero.');
    if (!Number.isInteger(dia) || dia < 1 || dia > 28) return notify.warning('El día de facturación debe estar entre 1 y 28.');
    setGuardandoSub(true);
    try {
      const r = await apiJson<{ company: Company; sincronizacion: { ok: boolean; error?: string; omitida?: string } }>(
        `/api/saas/companias/${suscripcionId}/suscripcion`,
        { method: 'PUT', body: JSON.stringify({ monedaSuscripcion: subMoneda, montoMensual: monto, diaFacturacion: dia }) }
      );
      onCompanyUpdated(r.company);
      setSuscripcionId(null);
      if (r.sincronizacion.ok) notify.success(r.sincronizacion.omitida ? 'Suscripción guardada.' : 'Suscripción guardada y enviada al ERP.');
      else notify.warning(`Suscripción guardada, pero no se pudo enviar al ERP: ${r.sincronizacion.error}`);
    } catch (err: any) {
      notify.error(err.message || 'No se pudo guardar la suscripción.');
    } finally {
      setGuardandoSub(false);
    }
  };

  const sincronizar = async (company: Company) => {
    setSincronizando(prev => ({ ...prev, [company.id]: true }));
    try {
      const r = await apiJson<{ company: Company; sincronizacion: { ok: boolean; error?: string; omitida?: string }; errorEstadoCuenta: string | null }>(
        `/api/saas/companias/${company.id}/sincronizar`, { method: 'POST' }
      );
      if (r.company) onCompanyUpdated(r.company);
      if (!r.sincronizacion.ok) notify.error(r.sincronizacion.error || 'No se pudo sincronizar.', company.nombreComercial);
      else if (r.sincronizacion.omitida === 'pendiente-de-aprobacion') notify.info('La empresa está pendiente de aprobación: se enviará al ERP al aprobarla.', company.nombreComercial);
      else if (r.sincronizacion.omitida === 'sin-cuota') notify.info('La empresa no tiene cuota mensual: no se factura en el ERP.', company.nombreComercial);
      else if (r.errorEstadoCuenta) notify.warning(`Sincronizada, pero no se pudo leer el estado de cuenta: ${r.errorEstadoCuenta}`, company.nombreComercial);
      else notify.success('Sincronizada con el ERP.', company.nombreComercial);
    } catch (err: any) {
      notify.error(err.message || 'No se pudo sincronizar.', company.nombreComercial);
    } finally {
      setSincronizando(prev => ({ ...prev, [company.id]: false }));
    }
  };

  const openEstadoCuenta = async (company: Company) => {
    setEstadoCuentaId(company.id);
    setEstadoCuenta(null);
    setEstadoCuentaError('');
    setCargandoEstado(true);
    try {
      const r = await apiJson<{ estadoCuenta: EstadoCuentaErp; company: Company }>(`/api/saas/companias/${company.id}/estado-cuenta`);
      setEstadoCuenta(r.estadoCuenta);
      if (r.company) onCompanyUpdated(r.company);
    } catch (err: any) {
      setEstadoCuentaError(err.message || 'No se pudo consultar el estado de cuenta.');
    } finally {
      setCargandoEstado(false);
    }
  };

  const openAdelantado = (company: Company) => {
    setAdelantadoId(company.id);
    setMeses('1');
  };

  const facturarAdelantado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adelantadoId == null || facturando) return;
    const company = companies.find(c => c.id === adelantadoId);
    const n = Number(meses);
    const max = configErp?.adelantadoMesesMax ?? 1;
    if (!Number.isInteger(n) || n < 1 || n > max) return notify.warning(`Indique entre 1 y ${max} meses.`);
    const ok = await confirmar({
      title: 'Facturar meses por adelantado',
      message: `El ERP emitirá una factura electrónica por ${n} ${n === 1 ? 'mes' : 'meses'} de suscripción a ${company?.razonSocial || company?.nombreComercial}. ¿Continuar?`,
      confirmText: 'Emitir factura'
    });
    if (!ok) return;
    setFacturando(true);
    try {
      const r = await apiJson<{ factura: FacturaErp; reutilizada: boolean; nueva: boolean }>(
        `/api/saas/companias/${adelantadoId}/facturar-adelantado`, { method: 'POST', body: JSON.stringify({ meses: n }) }
      );
      setAdelantadoId(null);
      const resumen = `${r.factura.consecutivo || `#${r.factura.id}`} por ${formatoMonto(r.factura.total, r.factura.moneda)}`;
      if (r.nueva) notify.success(`Factura ${resumen} emitida por el ERP.`);
      else notify.info(`El ERP ya tenía esta factura (${resumen}); no se duplicó.`);
    } catch (err: any) {
      notify.error(err.message || 'No se pudo facturar por adelantado.');
    } finally {
      setFacturando(false);
    }
  };

  const paymentsCompany = companies.find(c => c.id === paymentsCompanyId);
  const paymentsForCompany = payments.filter(p => p.idCompania === paymentsCompanyId);
  const suscripcionCompany = companies.find(c => c.id === suscripcionId);
  const estadoCuentaCompany = companies.find(c => c.id === estadoCuentaId);
  const adelantadoCompany = companies.find(c => c.id === adelantadoId);

  // Acciones por empresa: se reutilizan en la tabla (escritorio) y en la lista (móvil). En la lista
  // compacta el cambio de estado conserva su texto y el resto son IconButton de 44px.
  const renderAcciones = (company: Company, compacto = false) => {
    const tamano = compacto ? 'md' : 'sm';
    const anchoEstado = compacto ? 'flex-1 min-w-0' : undefined;
    const nombre = company.nombreComercial;
    const iconoErp = (label: string, icon: React.ReactNode, onClick: () => void, disabled = false) => (
      <IconButton variant="outline" label={`${label} · ${nombre}`} title={label} icon={icon} onClick={onClick} disabled={disabled} />
    );
    return (
      <div className="flex flex-wrap items-center gap-2">
        {company.estadoSaas === 'PENDIENTE' && (
          <Button size={tamano} className={anchoEstado} onClick={() => onUpdateEstadoSaas(company.id, 'ACTIVA')} icon={<ShieldCheck className="w-4 h-4" aria-hidden="true" />}>
            Aprobar
          </Button>
        )}
        {company.estadoSaas === 'ACTIVA' && (
          <Button size={tamano} className={anchoEstado} variant="danger" onClick={() => onUpdateEstadoSaas(company.id, 'SUSPENDIDA')} icon={<ShieldOff className="w-4 h-4" aria-hidden="true" />}>
            Suspender
          </Button>
        )}
        {company.estadoSaas === 'SUSPENDIDA' && (
          <Button size={tamano} className={anchoEstado} onClick={() => onUpdateEstadoSaas(company.id, 'ACTIVA')} icon={<ShieldAlert className="w-4 h-4" aria-hidden="true" />}>
            Reactivar
          </Button>
        )}

        {editingLimitId === company.id ? (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              inputMode="numeric"
              aria-label={`Límite de usuarios de ${nombre}`}
              value={limitDraft}
              onChange={(e) => setLimitDraft(parseInt(e.target.value) || 0)}
              wrapperClassName="w-24"
            />
            <Button size={tamano} variant="secondary" onClick={() => saveLimitEditor(company.id)}>
              Guardar
            </Button>
          </div>
        ) : (
          iconoErp('Editar límite de usuarios', <Users className="w-4 h-4" aria-hidden="true" />, () => openLimitEditor(company))
        )}

        {iconoErp('Suscripción (moneda, cuota y día de facturación)', <Settings2 className="w-4 h-4" aria-hidden="true" />, () => openSuscripcion(company))}
        {iconoErp(
          'Sincronizar ahora con el ERP',
          <RefreshCw className={`w-4 h-4 ${sincronizando[company.id] ? 'animate-spin' : ''}`} aria-hidden="true" />,
          () => sincronizar(company),
          !erpConfigurado || !!sincronizando[company.id]
        )}
        {iconoErp('Ver estado de cuenta', <FileText className="w-4 h-4" aria-hidden="true" />, () => openEstadoCuenta(company), !erpConfigurado || !company.erpSincronizadoEn)}
        {iconoErp('Facturar meses por adelantado', <CalendarClock className="w-4 h-4" aria-hidden="true" />, () => openAdelantado(company), !erpConfigurado || !(Number(company.montoMensual) > 0))}
        {iconoErp('Historial de pagos manuales', <History className="w-4 h-4" aria-hidden="true" />, () => openPayments(company))}
      </div>
    );
  };

  const activos = (company: Company) => users.filter(u => u.idCompania === company.id && u.activo).length;

  const textoSuscripcion = (c: Company) =>
    c.montoMensual != null && Number(c.montoMensual) > 0
      ? `${formatoMonto(c.montoMensual, c.monedaSuscripcion)}${c.diaFacturacion ? ` · día ${c.diaFacturacion}` : ' · sin día'}`
      : 'Sin cuota';

  const renderErp = (c: Company) => {
    const e = estadoErp(c);
    return (
      <div className="min-w-0 space-y-1">
        <Badge tone={e.tone} title={e.detalle}>{e.label}</Badge>
        {e.detalle && <span className="block text-xs text-danger break-words line-clamp-2" title={e.detalle}>{e.detalle}</span>}
        {c.erpEstadoCuentaEn && (
          <span className="block text-xs text-fg-muted">
            Saldo {formatoMonto(c.erpSaldoPendiente, c.erpMonedaSaldo)}
            {Number(c.erpSaldoVencido) > 0 ? ` · vencido ${formatoMonto(c.erpSaldoVencido, c.erpMonedaSaldo)}` : ''}
          </span>
        )}
        {c.erpUltimaFacturaConsecutivo && (
          <span className="block text-xs text-fg-muted break-words">
            Última: {c.erpUltimaFacturaConsecutivo} · {c.erpUltimaFacturaEstado || '—'} · {fechaCorta(c.erpUltimaFacturaFecha)}
          </span>
        )}
        {c.erpProximaFacturacion && <span className="block text-xs text-fg-muted">Próxima: {fechaCorta(c.erpProximaFacturacion)}</span>}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <IntegracionErpCard config={configErp} cargando={cargandoConfig} onGuardada={setConfigErp} />

      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-brand-ink" aria-hidden="true" />
              Administración SaaS de empresas
            </span>
          }
          description="Aprobación, suspensión, límite de usuarios y suscripción por empresa. Las facturas de la suscripción las emite el ERP."
        />

        {companies.length === 0 ? (
          <EmptyState
            icon={<Building2 />}
            title="Sin otras empresas"
            description="No hay otras empresas registradas todavía."
          />
        ) : (
          <>
            {/* Escritorio: tabla */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Empresas registradas en la plataforma</caption>
                <thead>
                  <tr className="text-left text-xs font-semibold uppercase tracking-wide text-fg-muted border-b border-border bg-surface-muted/60">
                    <th scope="col" className="px-6 py-3">Empresa</th>
                    <th scope="col" className="px-3 py-3">Estado</th>
                    <th scope="col" className="px-3 py-3">Usuarios</th>
                    <th scope="col" className="px-3 py-3">Suscripción</th>
                    <th scope="col" className="px-3 py-3">ERP</th>
                    <th scope="col" className="px-6 py-3">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {companies.map(company => (
                    <tr key={company.id} className="align-top">
                      <td className="px-6 py-4">
                        <span className="block font-semibold text-fg">{company.nombreComercial}</span>
                        <span className="block text-xs text-fg-muted">{company.identificacion}</span>
                      </td>
                      <td className="px-3 py-4"><Badge tone={ESTADO_TONE[company.estadoSaas]}>{ESTADO_LABEL[company.estadoSaas]}</Badge></td>
                      <td className="px-3 py-4 text-fg">{activos(company)} / {company.maxUsuarios}</td>
                      <td className="px-3 py-4 text-fg whitespace-nowrap">{textoSuscripcion(company)}</td>
                      <td className="px-3 py-4 max-w-64">{renderErp(company)}</td>
                      <td className="px-6 py-4">{renderAcciones(company)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Móvil y tablet: filas compactas con divisores (sin tarjetas dentro de la tarjeta) */}
            <ul className="lg:hidden divide-y divide-border">
              {companies.map(company => (
                <li key={company.id} className="px-4 sm:px-6 py-4 space-y-3">
                  <div className="min-w-0">
                    <span className="block font-semibold text-fg break-words">{company.nombreComercial}</span>
                    <span className="block text-xs text-fg-muted break-words">{company.identificacion}</span>
                    <Badge tone={ESTADO_TONE[company.estadoSaas]} className="mt-1.5">{ESTADO_LABEL[company.estadoSaas]}</Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div className="min-w-0">
                      <dt className="text-xs text-fg-muted">Usuarios</dt>
                      <dd className="font-semibold text-fg">{activos(company)} / {company.maxUsuarios}</dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-xs text-fg-muted">Suscripción</dt>
                      <dd className="font-semibold text-fg break-words">{textoSuscripcion(company)}</dd>
                    </div>
                    <div className="min-w-0 col-span-2">
                      <dt className="text-xs text-fg-muted mb-1">ERP</dt>
                      <dd>{renderErp(company)}</dd>
                    </div>
                  </dl>
                  {renderAcciones(company, true)}
                </li>
              ))}
            </ul>
          </>
        )}

        {/* Suscripción: moneda, cuota y día de facturación (solo SaaS admin) */}
        <ResponsiveModal
          open={!!suscripcionCompany}
          onClose={() => !guardandoSub && setSuscripcionId(null)}
          title={`Suscripción · ${suscripcionCompany?.nombreComercial ?? ''}`}
          icon={<Settings2 />}
          size="sm"
          closeDisabled={guardandoSub}
          footer={
            <>
              <Button variant="ghost" onClick={() => setSuscripcionId(null)} disabled={guardandoSub}>Cancelar</Button>
              <Button type="submit" form="form-suscripcion-saas" loading={guardandoSub}>Guardar y sincronizar</Button>
            </>
          }
        >
          <form id="form-suscripcion-saas" onSubmit={guardarSuscripcion} className="space-y-4">
            <Field label="Moneda">
              {() => (
                <SegmentedControl
                  ariaLabel="Moneda de la suscripción"
                  value={subMoneda}
                  onChange={setSubMoneda}
                  options={[{ value: 'CRC', label: 'Colones (CRC)' }, { value: 'USD', label: 'Dólares (USD)' }]}
                />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cuota mensual" hint="Antes de impuestos; el ERP aplica el IVA del producto.">
                {(p) => <Input {...p} type="number" inputMode="decimal" min={0} step="0.01" value={subMonto} onChange={(e) => setSubMonto(e.target.value)} />}
              </Field>
              <Field label="Día de facturación" hint="1 a 28">
                {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={28} value={subDia} onChange={(e) => setSubDia(e.target.value)} />}
              </Field>
            </div>
            <p className="text-xs text-fg-muted">
              Al guardar, los datos se envían al ERP, que emite cada mes la factura a crédito de la suscripción.
            </p>
          </form>
        </ResponsiveModal>

        {/* Estado de cuenta en vivo desde el ERP */}
        <ResponsiveModal
          open={!!estadoCuentaCompany}
          onClose={() => setEstadoCuentaId(null)}
          title={`Estado de cuenta · ${estadoCuentaCompany?.nombreComercial ?? ''}`}
          icon={<FileText />}
          size="lg"
        >
          {cargandoEstado ? (
            <p className="text-sm text-fg-muted">Consultando el ERP…</p>
          ) : estadoCuentaError ? (
            <p className="text-sm text-danger">{estadoCuentaError}</p>
          ) : estadoCuenta ? (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div><dt className="text-xs text-fg-muted">Saldo pendiente</dt><dd className="font-semibold text-fg">{formatoMonto(estadoCuenta.resumen.saldoPendiente, estadoCuenta.resumen.monedaSaldo)}</dd></div>
                <div><dt className="text-xs text-fg-muted">Saldo vencido</dt><dd className="font-semibold text-fg">{formatoMonto(estadoCuenta.resumen.saldoVencido, estadoCuenta.resumen.monedaSaldo)}</dd></div>
                <div>
                  <dt className="text-xs text-fg-muted">Mora</dt>
                  <dd>
                    {estadoCuenta.resumen.alDia || estadoCuenta.resumen.diasMoraMax === 0
                      ? <Badge tone="success">Al día</Badge>
                      : <Badge tone="danger">{estadoCuenta.resumen.diasMoraMax} días</Badge>}
                  </dd>
                </div>
                <div><dt className="text-xs text-fg-muted">Próxima factura</dt><dd className="font-semibold text-fg">{fechaCorta(estadoCuenta.suscriptor.proximaFacturacion)}</dd></div>
              </dl>
              {!estadoCuenta.suscriptor.activo && (
                <p className="text-xs text-warning">El ERP tiene esta suscripción inactiva: no emitirá facturas nuevas.</p>
              )}
              <ul className="divide-y divide-border border-t border-border">
                {estadoCuenta.facturas.length === 0 && (
                  <li className="text-sm text-fg-muted text-center py-4">El ERP no tiene facturas de esta suscripción todavía.</li>
                )}
                {estadoCuenta.facturas.map(f => (
                  <li key={f.id} className="py-3 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="block font-semibold text-fg break-all">{f.consecutivo || `#${f.id}`}</span>
                      <span className="block text-xs text-fg-muted">
                        Emitida {fechaCorta(f.fechaEmision)} · vence {fechaCorta(f.fechaVencimiento)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block font-semibold text-fg">{formatoMonto(f.total, f.moneda)}</span>
                      <span className="flex flex-wrap justify-end gap-1 mt-1">
                        <Badge tone={toneHacienda(f.estadoHacienda)}>{f.estadoHacienda || 'Sin estado'}</Badge>
                        {f.pagada
                          ? <Badge tone="success">Pagada</Badge>
                          : <Badge tone="warning">Saldo {formatoMonto(f.saldoPendiente, f.moneda)}</Badge>}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </ResponsiveModal>

        {/* Facturar meses por adelantado (POST /suscriptores/{id}/facturas del ERP) */}
        <ResponsiveModal
          open={!!adelantadoCompany}
          onClose={() => !facturando && setAdelantadoId(null)}
          title={`Facturar por adelantado · ${adelantadoCompany?.nombreComercial ?? ''}`}
          icon={<CalendarClock />}
          size="sm"
          closeDisabled={facturando}
          footer={
            <>
              <Button variant="ghost" onClick={() => setAdelantadoId(null)} disabled={facturando}>Cancelar</Button>
              <Button type="submit" form="form-adelantado-saas" loading={facturando}>Facturar</Button>
            </>
          }
        >
          {adelantadoCompany && (
            <form id="form-adelantado-saas" onSubmit={facturarAdelantado} className="space-y-4">
              <Field label="Meses" hint={`De 1 a ${configErp?.adelantadoMesesMax ?? 1}`}>
                {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={configErp?.adelantadoMesesMax ?? 1} value={meses} onChange={(e) => setMeses(e.target.value)} />}
              </Field>
              <p className="text-sm text-fg">
                Cuota {formatoMonto(adelantadoCompany.montoMensual, adelantadoCompany.monedaSuscripcion)} × {Number(meses) || 0} ={' '}
                <span className="font-semibold">{formatoMonto((Number(adelantadoCompany.montoMensual) || 0) * (Number(meses) || 0), adelantadoCompany.monedaSuscripcion)}</span>{' '}
                antes de impuestos.
              </p>
              <p className="text-xs text-fg-muted">
                El ERP calcula el monto final (IVA y tipo de cambio) y emite la factura electrónica. Un segundo clic no duplica la factura.
              </p>
            </form>
          )}
        </ResponsiveModal>

        {paymentsCompany && (
          <div className="fixed inset-0 bg-fg/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 z-50 animate-fade-in">
            <div
              ref={pagosDialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="titulo-pagos-saas"
              tabIndex={-1}
              className="bg-surface rounded-t-panel sm:rounded-panel border border-border shadow-lg max-w-lg w-full p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] sm:p-6 max-h-[92dvh] sm:max-h-[85vh] overflow-y-auto overscroll-contain animate-dialog-in focus:outline-hidden"
            >
              <div className="flex items-start justify-between gap-2 mb-2 border-b border-border pb-3">
                <h4 id="titulo-pagos-saas" className="min-w-0 pt-2 text-heading font-semibold text-fg break-words">Historial de pagos manuales · {paymentsCompany.nombreComercial}</h4>
                <IconButton label="Cerrar" icon={<X className="w-4 h-4" aria-hidden="true" />} onClick={() => setPaymentsCompanyId(null)} />
              </div>
              <p className="text-xs text-fg-muted mb-4">
                Registro histórico. Las facturas y los cobros de la suscripción los lleva el ERP («Ver estado de cuenta»); la cuota se edita en «Suscripción».
              </p>

              {/* Fecha y monto (cortos) en 2 columnas también en el iPhone; las notas a ancho completo. */}
              <form onSubmit={(e) => handleAddPaymentSubmit(e, paymentsCompany)} className="grid grid-cols-2 gap-3 mb-5">
                <Field label="Fecha del pago">
                  <Input type="date" value={newPaymentFecha} onChange={(e) => setNewPaymentFecha(e.target.value)} />
                </Field>
                <Field label="Monto (₡)">
                  <Input type="number" inputMode="decimal" placeholder="Monto" value={newPaymentMonto || ''} onChange={(e) => setNewPaymentMonto(parseFloat(e.target.value) || 0)} />
                </Field>
                <Field label="Notas (opcional)" className="col-span-2">
                  <Input type="text" placeholder="Notas (opcional)" value={newPaymentNotas} onChange={(e) => setNewPaymentNotas(e.target.value)} />
                </Field>
                <Field label="Próximo vencimiento" hint="Opcional" className="col-span-2">
                  <Input type="date" value={newPaymentVencimiento} onChange={(e) => setNewPaymentVencimiento(e.target.value)} />
                </Field>
                <div className="col-span-2 flex sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none">
                  <Button type="submit" icon={<Plus className="w-4 h-4" aria-hidden="true" />}>
                    Registrar pago manual
                  </Button>
                </div>
              </form>

              <ul className="divide-y divide-border border-t border-border">
                {paymentsForCompany.length === 0 && (
                  <li className="text-sm text-fg-muted text-center py-4">Sin pagos registrados todavía.</li>
                )}
                {paymentsForCompany.map(p => (
                  <li key={p.id} className="py-3 min-w-0">
                    <span className="block font-semibold text-fg">₡{p.monto}</span>
                    <span className="block text-xs text-fg-muted break-words">{p.fecha}{p.notas ? ` · ${p.notas}` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
