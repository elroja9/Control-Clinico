import React, { useState } from 'react';
import { Company, User, CompanyPayment } from '../data/mockData';
import { ShieldCheck, ShieldAlert, ShieldOff, Users, DollarSign, X, Plus } from 'lucide-react';
import { notify } from './ui/Feedback';
import { useDialog } from '../hooks/useDialog';

interface SaasAdminPanelProps {
  companies: Company[];
  users: User[];
  payments: CompanyPayment[];
  onUpdateEstadoSaas: (companyId: number, estadoSaas: Company['estadoSaas']) => void;
  onUpdateMaxUsuarios: (companyId: number, maxUsuarios: number) => void;
  onLoadPayments: (companyId: number) => void;
  onAddPayment: (payment: Omit<CompanyPayment, 'id'> & { montoMensual?: number | null; proximoVencimiento?: string | null }) => void;
}

const ESTADO_BADGE: Record<Company['estadoSaas'], string> = {
  PENDIENTE: 'bg-amber-100 text-amber-800',
  ACTIVA: 'bg-emerald-100 text-emerald-800',
  SUSPENDIDA: 'bg-rose-100 text-rose-800'
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

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 text-xs">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
        <ShieldCheck className="w-5 h-5 text-slate-500" />
        <div>
          <h3 className="text-sm font-bold text-slate-800">Administración SaaS de Empresas</h3>
          <p className="text-[11px] text-slate-500">Aprobación, suspensión, límite de usuarios y pagos por empresa</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {companies.length === 0 && (
          <p className="text-slate-500 text-center py-6">No hay otras empresas registradas todavía.</p>
        )}
        {companies.map(company => {
          const activeUserCount = users.filter(u => u.idCompania === company.id && u.activo).length;
          return (
            <div key={company.id} className="border border-slate-200 rounded-xl p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div>
                  <span className="font-bold text-slate-800 block">{company.nombreComercial}</span>
                  <span className="text-[11px] text-slate-500">{company.identificacion}</span>
                </div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ESTADO_BADGE[company.estadoSaas]}`}>
                  {ESTADO_LABEL[company.estadoSaas]}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] mb-3">
                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <span className="text-slate-500 block">Usuarios</span>
                  <span className="font-semibold text-slate-800">{activeUserCount} / {company.maxUsuarios}</span>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <span className="text-slate-500 block">Monto Mensual</span>
                  <span className="font-semibold text-slate-800">{company.montoMensual != null ? `₡${company.montoMensual}` : '—'}</span>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100 col-span-2 sm:col-span-1">
                  <span className="text-slate-500 block">Próximo Vencimiento</span>
                  <span className="font-semibold text-slate-800">{company.proximoVencimiento || '—'}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {company.estadoSaas === 'PENDIENTE' && (
                  <button
                    onClick={() => onUpdateEstadoSaas(company.id, 'ACTIVA')}
                    className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg font-semibold"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Aprobar
                  </button>
                )}
                {company.estadoSaas === 'ACTIVA' && (
                  <button
                    onClick={() => onUpdateEstadoSaas(company.id, 'SUSPENDIDA')}
                    className="flex items-center gap-1 bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1.5 rounded-lg font-semibold"
                  >
                    <ShieldOff className="w-3.5 h-3.5" />
                    Suspender
                  </button>
                )}
                {company.estadoSaas === 'SUSPENDIDA' && (
                  <button
                    onClick={() => onUpdateEstadoSaas(company.id, 'ACTIVA')}
                    className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg font-semibold"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Reactivar
                  </button>
                )}

                {editingLimitId === company.id ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      value={limitDraft}
                      onChange={(e) => setLimitDraft(parseInt(e.target.value) || 0)}
                      className="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5"
                    />
                    <button
                      onClick={() => saveLimitEditor(company.id)}
                      className="bg-slate-800 hover:bg-slate-900 text-white px-2.5 py-1.5 rounded-lg font-semibold"
                    >
                      Guardar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => openLimitEditor(company)}
                    className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg font-semibold"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Editar Límite
                  </button>
                )}

                <button
                  onClick={() => openPayments(company)}
                  className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg font-semibold"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  Ver Pagos
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {paymentsCompany && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 z-50 animate-fade-in">
          <div ref={pagosDialogRef} role="dialog" aria-modal="true" aria-labelledby="titulo-pagos-saas" tabIndex={-1} className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-5 max-h-[92dvh] sm:max-h-[85vh] overflow-y-auto overscroll-contain animate-dialog-in focus:outline-hidden">
            <div className="flex items-center justify-between gap-2 mb-3 border-b border-slate-100 pb-2.5">
              <h4 id="titulo-pagos-saas" className="font-bold text-slate-900">Historial de pagos · {paymentsCompany.nombreComercial}</h4>
              <button type="button" onClick={() => setPaymentsCompanyId(null)} className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors" aria-label="Cerrar">
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            <form onSubmit={(e) => handleAddPaymentSubmit(e, paymentsCompany)} className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
              <input
                type="date"
                value={newPaymentFecha}
                onChange={(e) => setNewPaymentFecha(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
              />
              <input
                type="number"
                placeholder="Monto"
                value={newPaymentMonto || ''}
                onChange={(e) => setNewPaymentMonto(parseFloat(e.target.value) || 0)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
              />
              <button
                type="submit"
                className="flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                Registrar
              </button>
              <input
                type="text"
                placeholder="Notas (opcional)"
                value={newPaymentNotas}
                onChange={(e) => setNewPaymentNotas(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 sm:col-span-3"
              />
              <div className="sm:col-span-3 grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                <div>
                  <label htmlFor="saasadminp-monto-mensual-opcional" className="block text-slate-500 text-[11px] font-semibold mb-1">Monto Mensual (opcional)</label>
                  <input id="saasadminp-monto-mensual-opcional"
                    type="number"
                    value={newPaymentMontoMensual}
                    onChange={(e) => setNewPaymentMontoMensual(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label htmlFor="saasadminp-proximo-vencimiento-opcional" className="block text-slate-500 text-[11px] font-semibold mb-1">Próximo Vencimiento (opcional)</label>
                  <input id="saasadminp-proximo-vencimiento-opcional"
                    type="date"
                    value={newPaymentVencimiento}
                    onChange={(e) => setNewPaymentVencimiento(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                  />
                </div>
              </div>
            </form>

            <div className="space-y-1.5">
              {paymentsForCompany.length === 0 && (
                <p className="text-slate-500 text-center py-4">Sin pagos registrados todavía.</p>
              )}
              {paymentsForCompany.map(p => (
                <div key={p.id} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                  <div>
                    <span className="font-semibold text-slate-800 block">₡{p.monto}</span>
                    <span className="text-[11px] text-slate-500">{p.fecha}{p.notas ? ` · ${p.notas}` : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
