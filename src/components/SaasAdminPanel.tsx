import React, { useState } from 'react';
import { Company, User, CompanyPayment } from '../data/mockData';
import { ShieldCheck, ShieldAlert, ShieldOff, Users, DollarSign, X, Plus, Building2 } from 'lucide-react';
import { notify } from './ui/Feedback';
import { useDialog } from '../hooks/useDialog';
import { Badge, type BadgeTone, Button, Card, CardHeader, EmptyState, Field, IconButton, Input } from './ui';

interface SaasAdminPanelProps {
  companies: Company[];
  users: User[];
  payments: CompanyPayment[];
  onUpdateEstadoSaas: (companyId: number, estadoSaas: Company['estadoSaas']) => void;
  onUpdateMaxUsuarios: (companyId: number, maxUsuarios: number) => void;
  onLoadPayments: (companyId: number) => void;
  onAddPayment: (payment: Omit<CompanyPayment, 'id'> & { montoMensual?: number | null; proximoVencimiento?: string | null }) => void;
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

export default function SaasAdminPanel({
  companies,
  users,
  payments,
  onUpdateEstadoSaas,
  onUpdateMaxUsuarios,
  onLoadPayments,
  onAddPayment
}: SaasAdminPanelProps) {
  const [editingLimitId, setEditingLimitId] = useState<number | null>(null);
  const [limitDraft, setLimitDraft] = useState(5);
  const [paymentsCompanyId, setPaymentsCompanyId] = useState<number | null>(null);
  const pagosDialogRef = useDialog<HTMLDivElement>(paymentsCompanyId != null, () => setPaymentsCompanyId(null));
  const [newPaymentFecha, setNewPaymentFecha] = useState(new Date().toISOString().slice(0, 10));
  const [newPaymentMonto, setNewPaymentMonto] = useState(0);
  const [newPaymentNotas, setNewPaymentNotas] = useState('');
  const [newPaymentMontoMensual, setNewPaymentMontoMensual] = useState('');
  const [newPaymentVencimiento, setNewPaymentVencimiento] = useState('');

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
    setNewPaymentMontoMensual(company.montoMensual != null ? String(company.montoMensual) : '');
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
      montoMensual: newPaymentMontoMensual !== '' ? parseFloat(newPaymentMontoMensual) : null,
      proximoVencimiento: newPaymentVencimiento || null
    });
    setNewPaymentMonto(0);
    setNewPaymentNotas('');
  };

  const paymentsCompany = companies.find(c => c.id === paymentsCompanyId);
  const paymentsForCompany = payments.filter(p => p.idCompania === paymentsCompanyId);

  // Acciones por empresa: se reutilizan en la tabla (escritorio) y en la lista (móvil). En la lista
  // compacta el cambio de estado conserva su texto y "Editar límite" / "Ver pagos" son IconButton de 44px.
  const renderAcciones = (company: Company, compacto = false) => {
    const tamano = compacto ? 'md' : 'sm';
    const anchoEstado = compacto ? 'flex-1 min-w-0' : undefined;
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
              aria-label={`Límite de usuarios de ${company.nombreComercial}`}
              value={limitDraft}
              onChange={(e) => setLimitDraft(parseInt(e.target.value) || 0)}
              wrapperClassName="w-24"
            />
            <Button size={tamano} variant="secondary" onClick={() => saveLimitEditor(company.id)}>
              Guardar
            </Button>
          </div>
        ) : compacto ? (
          <IconButton
            variant="outline"
            label={`Editar límite de usuarios de ${company.nombreComercial}`}
            icon={<Users className="w-4 h-4" aria-hidden="true" />}
            onClick={() => openLimitEditor(company)}
          />
        ) : (
          <Button size="sm" variant="outline" onClick={() => openLimitEditor(company)} icon={<Users className="w-4 h-4" aria-hidden="true" />}>
            Editar límite
          </Button>
        )}

        {compacto ? (
          <IconButton
            variant="outline"
            label={`Ver pagos de ${company.nombreComercial}`}
            icon={<DollarSign className="w-4 h-4" aria-hidden="true" />}
            onClick={() => openPayments(company)}
          />
        ) : (
          <Button size="sm" variant="outline" onClick={() => openPayments(company)} icon={<DollarSign className="w-4 h-4" aria-hidden="true" />}>
            Ver pagos
          </Button>
        )}
      </div>
    );
  };

  const activos = (company: Company) => users.filter(u => u.idCompania === company.id && u.activo).length;

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-brand-ink" aria-hidden="true" />
            Administración SaaS de empresas
          </span>
        }
        description="Aprobación, suspensión, límite de usuarios y pagos por empresa."
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
                  <th scope="col" className="px-3 py-3">Monto mensual</th>
                  <th scope="col" className="px-3 py-3">Próximo vencimiento</th>
                  <th scope="col" className="px-6 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {companies.map(company => (
                  <tr key={company.id} className="align-middle">
                    <td className="px-6 py-4">
                      <span className="block font-semibold text-fg">{company.nombreComercial}</span>
                      <span className="block text-xs text-fg-muted">{company.identificacion}</span>
                    </td>
                    <td className="px-3 py-4"><Badge tone={ESTADO_TONE[company.estadoSaas]}>{ESTADO_LABEL[company.estadoSaas]}</Badge></td>
                    <td className="px-3 py-4 text-fg">{activos(company)} / {company.maxUsuarios}</td>
                    <td className="px-3 py-4 text-fg">{company.montoMensual != null ? `₡${company.montoMensual}` : '—'}</td>
                    <td className="px-3 py-4 text-fg">{company.proximoVencimiento || '—'}</td>
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
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div className="min-w-0">
                    <dt className="text-xs text-fg-muted">Usuarios</dt>
                    <dd className="font-semibold text-fg">{activos(company)} / {company.maxUsuarios}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-fg-muted">Mensual</dt>
                    <dd className="font-semibold text-fg break-words">{company.montoMensual != null ? `₡${company.montoMensual}` : '—'}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-xs text-fg-muted">Vence</dt>
                    <dd className="font-semibold text-fg break-words">{company.proximoVencimiento || '—'}</dd>
                  </div>
                </dl>
                {renderAcciones(company, true)}
              </li>
            ))}
          </ul>
        </>
      )}

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
            <div className="flex items-start justify-between gap-2 mb-4 border-b border-border pb-3">
              <h4 id="titulo-pagos-saas" className="min-w-0 pt-2 text-heading font-semibold text-fg break-words">Historial de pagos · {paymentsCompany.nombreComercial}</h4>
              <IconButton label="Cerrar" icon={<X className="w-4 h-4" aria-hidden="true" />} onClick={() => setPaymentsCompanyId(null)} />
            </div>

            {/* Fecha y montos (cortos) en 2 columnas también en el iPhone; las notas a ancho completo. */}
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
              <Field label="Monto mensual (₡)" hint="Opcional">
                <Input type="number" inputMode="decimal" value={newPaymentMontoMensual} onChange={(e) => setNewPaymentMontoMensual(e.target.value)} />
              </Field>
              <Field label="Próximo vencimiento" hint="Opcional">
                <Input type="date" value={newPaymentVencimiento} onChange={(e) => setNewPaymentVencimiento(e.target.value)} />
              </Field>
              <div className="col-span-2 flex sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none">
                <Button type="submit" icon={<Plus className="w-4 h-4" aria-hidden="true" />}>
                  Registrar pago
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
  );
}
