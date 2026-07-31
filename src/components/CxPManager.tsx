import React, { useState } from 'react';
import { CuentaPagar, Proveedor, Servicio } from '../data/mockData';
import { Landmark, Plus, AlertCircle, DollarSign, Trash2 } from 'lucide-react';

interface CxPManagerProps {
  cxp: CuentaPagar[];
  proveedores: Proveedor[];
  articulos: Servicio[];
  onCrearCxp: (payload: {
    idProveedor: number;
    numeroFacturaProveedor: string;
    esServicio: boolean;
    montoTotal?: number;
    plazoDias: number;
    notas: string;
    ivaAcreditable: number;
    lineas?: Array<{ idServicio: number; cantidad: number; costoUnitario: number }>;
  }) => Promise<void>;
  onRegistrarPago: (idCuentaPagar: number, monto: number, medioPago: string, referencia: string) => Promise<void>;
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

function estadoEfectivo(c: CuentaPagar): 'PENDIENTE' | 'VENCIDA' | 'PAGADA' | 'ANULADA' {
  if (c.estado !== 'PENDIENTE') return c.estado;
  return c.fechaVencimiento < hoyISO() ? 'VENCIDA' : 'PENDIENTE';
}

const ESTADO_ESTILO: Record<string, string> = {
  PENDIENTE: 'bg-amber-100 text-amber-800',
  VENCIDA: 'bg-rose-100 text-rose-800',
  PAGADA: 'bg-emerald-100 text-emerald-800',
  ANULADA: 'bg-slate-200 text-slate-600'
};

interface LineaForm {
  idServicio: string;
  cantidad: string;
  costoUnitario: string;
}

export default function CxPManager({ cxp, proveedores, articulos, onCrearCxp, onRegistrarPago }: CxPManagerProps) {
  const [filtro, setFiltro] = useState<'TODAS' | 'PENDIENTE' | 'VENCIDA' | 'PAGADA'>('TODAS');

  const [formAbierto, setFormAbierto] = useState(false);
  const [idProveedor, setIdProveedor] = useState('');
  const [numeroFactura, setNumeroFactura] = useState('');
  const [modo, setModo] = useState<'GASTO' | 'ARTICULOS'>('GASTO');
  const [montoTotal, setMontoTotal] = useState('');
  const [plazoDias, setPlazoDias] = useState('30');
  const [notas, setNotas] = useState('');
  const [ivaAcreditable, setIvaAcreditable] = useState('');
  const [lineas, setLineas] = useState<LineaForm[]>([{ idServicio: '', cantidad: '1', costoUnitario: '' }]);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const [abonandoId, setAbonandoId] = useState<number | null>(null);
  const [montoAbono, setMontoAbono] = useState('');
  const [medioPagoAbono, setMedioPagoAbono] = useState('03');
  const [referenciaAbono, setReferenciaAbono] = useState('');
  const [abonoError, setAbonoError] = useState('');
  const [abonando, setAbonando] = useState(false);

  const nombreProveedor = (idProveedor: number) => proveedores.find(p => p.id === idProveedor)?.nombre || `Proveedor #${idProveedor}`;

  const ordenadas = [...cxp].sort((a, b) => b.fechaRegistro.localeCompare(a.fechaRegistro));
  const visibles = ordenadas.filter(c => filtro === 'TODAS' || estadoEfectivo(c) === filtro);

  const totalPendiente = cxp.filter(c => c.estado === 'PENDIENTE').reduce((s, c) => s + c.saldoPendiente, 0);
  const totalVencido = cxp.filter(c => estadoEfectivo(c) === 'VENCIDA').reduce((s, c) => s + c.saldoPendiente, 0);
  const totalPagado = cxp.reduce((s, c) => s + c.pagos.reduce((sp, p) => sp + p.monto, 0), 0);

  const abrirForm = () => {
    setIdProveedor('');
    setNumeroFactura('');
    setModo('GASTO');
    setMontoTotal('');
    setPlazoDias('30');
    setNotas('');
    setIvaAcreditable('');
    setLineas([{ idServicio: '', cantidad: '1', costoUnitario: '' }]);
    setError('');
    setFormAbierto(true);
  };

  const actualizarLinea = (idx: number, campo: keyof LineaForm, valor: string) => {
    setLineas(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const actualizada = { ...l, [campo]: valor };
      if (campo === 'idServicio') {
        const art = articulos.find(a => a.id === parseInt(valor));
        if (art && art.costoUnitario != null) actualizada.costoUnitario = art.costoUnitario.toString();
      }
      return actualizada;
    }));
  };

  const totalLineas = lineas.reduce((s, l) => s + (parseFloat(l.cantidad) || 0) * (parseFloat(l.costoUnitario) || 0), 0);

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idProveedor) {
      setError('Seleccione un proveedor.');
      return;
    }
    setGuardando(true);
    setError('');
    const ivaAcreditableNum = ivaAcreditable.trim() ? parseFloat(ivaAcreditable) : 0;
    if (!Number.isFinite(ivaAcreditableNum) || ivaAcreditableNum < 0) {
      setError('El IVA acreditable debe ser un monto válido (0 o mayor).');
      setGuardando(false);
      return;
    }
    try {
      if (modo === 'GASTO') {
        const monto = parseFloat(montoTotal);
        if (!Number.isFinite(monto) || monto <= 0) {
          setError('Indique un monto total válido.');
          setGuardando(false);
          return;
        }
        await onCrearCxp({
          idProveedor: parseInt(idProveedor),
          numeroFacturaProveedor: numeroFactura.trim(),
          esServicio: true,
          montoTotal: monto,
          plazoDias: parseInt(plazoDias) || 30,
          notas: notas.trim(),
          ivaAcreditable: ivaAcreditableNum
        });
      } else {
        const lineasValidas = lineas.filter(l => l.idServicio && parseFloat(l.cantidad) > 0);
        if (lineasValidas.length === 0) {
          setError('Agregue al menos un artículo con cantidad mayor a cero.');
          setGuardando(false);
          return;
        }
        await onCrearCxp({
          idProveedor: parseInt(idProveedor),
          numeroFacturaProveedor: numeroFactura.trim(),
          esServicio: false,
          plazoDias: parseInt(plazoDias) || 30,
          notas: notas.trim(),
          ivaAcreditable: ivaAcreditableNum,
          lineas: lineasValidas.map(l => ({
            idServicio: parseInt(l.idServicio),
            cantidad: parseFloat(l.cantidad),
            costoUnitario: parseFloat(l.costoUnitario) || 0
          }))
        });
      }
      setFormAbierto(false);
    } catch (err: any) {
      setError(err.message || 'No se pudo registrar la cuenta por pagar.');
    } finally {
      setGuardando(false);
    }
  };

  const abrirAbono = (c: CuentaPagar) => {
    setAbonandoId(c.id);
    setMontoAbono(c.saldoPendiente.toString());
    setMedioPagoAbono('03');
    setReferenciaAbono('');
    setAbonoError('');
  };

  const confirmarAbono = async (c: CuentaPagar) => {
    const monto = parseFloat(montoAbono);
    if (!Number.isFinite(monto) || monto <= 0) {
      setAbonoError('Indique un monto válido.');
      return;
    }
    if (monto > c.saldoPendiente) {
      setAbonoError(`El abono no puede superar el saldo pendiente (₡${c.saldoPendiente.toLocaleString('es-CR')}).`);
      return;
    }
    setAbonando(true);
    setAbonoError('');
    try {
      await onRegistrarPago(c.id, monto, medioPagoAbono, referenciaAbono.trim());
      setAbonandoId(null);
    } catch (err: any) {
      setAbonoError(err.message || 'No se pudo registrar el abono.');
    } finally {
      setAbonando(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
      <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-slate-500" />
          <div>
            <h3 className="text-sm font-bold text-slate-800">Cuentas por Pagar</h3>
            <p className="text-[11px] text-slate-500">Facturas de proveedores y sus abonos</p>
          </div>
        </div>
        {!formAbierto && (
          <button onClick={abrirForm} className="flex items-center gap-1 bg-slate-800 hover:bg-slate-900 text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all">
            <Plus className="w-3.5 h-3.5" />
            Registrar Compra
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <span className="text-[10px] font-bold text-amber-700 uppercase block">Pendiente</span>
          <span className="text-sm font-bold text-amber-900">₡{totalPendiente.toLocaleString('es-CR', { maximumFractionDigits: 0 })}</span>
        </div>
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
          <span className="text-[10px] font-bold text-rose-700 uppercase block">Vencido</span>
          <span className="text-sm font-bold text-rose-900">₡{totalVencido.toLocaleString('es-CR', { maximumFractionDigits: 0 })}</span>
        </div>
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <span className="text-[10px] font-bold text-emerald-700 uppercase block">Pagado</span>
          <span className="text-sm font-bold text-emerald-900">₡{totalPagado.toLocaleString('es-CR', { maximumFractionDigits: 0 })}</span>
        </div>
      </div>

      {formAbierto && (
        <form onSubmit={handleGuardar} className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3 mb-4">
          {error && (
            <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[10px] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-600 text-xs font-medium mb-1">Proveedor *</label>
              <select value={idProveedor} onChange={(e) => setIdProveedor(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800">
                <option value="">Seleccione...</option>
                {proveedores.filter(p => p.activo).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-slate-600 text-xs font-medium mb-1"># Factura del Proveedor</label>
              <input type="text" value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800" />
            </div>
            <div>
              <label className="block text-slate-600 text-xs font-medium mb-1">Plazo de Crédito (días)</label>
              <input type="number" min="0" value={plazoDias} onChange={(e) => setPlazoDias(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setModo('GASTO')} className={`py-1.5 rounded-lg text-xs font-bold border-2 ${modo === 'GASTO' ? 'border-slate-800 bg-slate-50' : 'border-slate-200 text-slate-500'}`}>
              Gasto (sin inventario)
            </button>
            <button type="button" onClick={() => setModo('ARTICULOS')} className={`py-1.5 rounded-lg text-xs font-bold border-2 ${modo === 'ARTICULOS' ? 'border-slate-800 bg-slate-50' : 'border-slate-200 text-slate-500'}`}>
              Compra de Artículos
            </button>
          </div>

          {modo === 'GASTO' ? (
            <div>
              <label className="block text-slate-600 text-xs font-medium mb-1">Monto Total (₡) *</label>
              <input type="number" min="0" step="0.01" value={montoTotal} onChange={(e) => setMontoTotal(e.target.value)} placeholder="ej: alquiler, servicios, honorarios" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800" />
            </div>
          ) : (
            <div className="space-y-2">
              {lineas.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-6">
                    <label className="block text-slate-600 text-[10px] font-medium mb-1">Artículo</label>
                    <select value={l.idServicio} onChange={(e) => actualizarLinea(idx, 'idServicio', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800">
                      <option value="">Seleccione...</option>
                      {articulos.map(a => <option key={a.id} value={a.id}>{a.nombre} (stock: {a.stock ?? 0})</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-slate-600 text-[10px] font-medium mb-1">Cantidad</label>
                    <input type="number" min="0" step="1" value={l.cantidad} onChange={(e) => actualizarLinea(idx, 'cantidad', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800" />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-slate-600 text-[10px] font-medium mb-1">Costo Unitario (₡)</label>
                    <input type="number" min="0" step="0.01" value={l.costoUnitario} onChange={(e) => actualizarLinea(idx, 'costoUnitario', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800" />
                  </div>
                  <div className="col-span-1">
                    {lineas.length > 1 && (
                      <button type="button" onClick={() => setLineas(prev => prev.filter((_, i) => i !== idx))} className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setLineas(prev => [...prev, { idServicio: '', cantidad: '1', costoUnitario: '' }])} className="text-[10px] font-semibold text-teal-700 hover:underline">
                + Agregar artículo
              </button>
              <p className="text-[11px] font-bold text-slate-700">Total: ₡{totalLineas.toLocaleString('es-CR', { maximumFractionDigits: 2 })}</p>
              <p className="text-[10px] text-slate-500">Esto incrementa las existencias del artículo y actualiza su costo unitario al costo de esta compra.</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-600 text-xs font-medium mb-1">Notas</label>
              <input type="text" value={notas} onChange={(e) => setNotas(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800" />
            </div>
            <div>
              <label className="block text-slate-600 text-xs font-medium mb-1">IVA Acreditable (₡)</label>
              <input type="number" min="0" step="0.01" value={ivaAcreditable} onChange={(e) => setIvaAcreditable(e.target.value)} placeholder="Según la factura de compra recibida" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800" />
              <p className="text-[9px] text-slate-400 mt-0.5">Crédito fiscal para el D-104. Tómelo del desglose de IVA de la factura del proveedor.</p>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setFormAbierto(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
            <button type="submit" disabled={guardando} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">
              {guardando ? 'Guardando…' : 'Registrar'}
            </button>
          </div>
        </form>
      )}

      <div className="flex gap-1.5 mb-3">
        {(['TODAS', 'PENDIENTE', 'VENCIDA', 'PAGADA'] as const).map(f => (
          <button key={f} onClick={() => setFiltro(f)} className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${filtro === f ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {f === 'TODAS' ? 'Todas' : f.charAt(0) + f.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {visibles.length === 0 && (
        <p className="text-slate-400 text-xs text-center py-6">No hay cuentas por pagar en este filtro.</p>
      )}

      <div className="space-y-1.5">
        {visibles.map(c => {
          const estado = estadoEfectivo(c);
          return (
            <div key={c.id} className="p-2.5 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-semibold text-slate-800 text-xs block">
                    {nombreProveedor(c.idProveedor)}{c.numeroFacturaProveedor ? ` · ${c.numeroFacturaProveedor}` : ''}
                  </span>
                  <span className="text-[10px] text-slate-500 block">
                    {c.esServicio ? 'Gasto' : `${c.lineas.length} artículo(s)`} &middot; Registrada {c.fechaRegistro} &middot; Vence {c.fechaVencimiento}
                  </span>
                  <span className="text-[10px] text-slate-600 block">
                    Total ₡{c.montoTotal.toLocaleString('es-CR')} &middot; Saldo ₡{c.saldoPendiente.toLocaleString('es-CR')}
                    {c.ivaAcreditable > 0 ? ` · IVA acreditable ₡${c.ivaAcreditable.toLocaleString('es-CR')}` : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTADO_ESTILO[estado]}`}>{estado}</span>
                  {c.estado === 'PENDIENTE' && (
                    <button onClick={() => abrirAbono(c)} title="Registrar Abono" className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50">
                      <DollarSign className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {c.pagos.length > 0 && (
                <div className="mt-1.5 pl-2 border-l-2 border-slate-100 space-y-0.5">
                  {c.pagos.map(p => (
                    <p key={p.id} className="text-[9px] text-slate-400">
                      {p.fecha} &middot; ₡{p.monto.toLocaleString('es-CR')} &middot; {MEDIOS_PAGO[p.medioPago] || p.medioPago}{p.referencia ? ` (${p.referencia})` : ''}
                    </p>
                  ))}
                </div>
              )}

              {abonandoId === c.id && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-2">
                  {abonoError && (
                    <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[10px] flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{abonoError}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-slate-600 font-medium mb-1 text-[10px]">Monto (₡)</label>
                      <input type="number" min="0" step="0.01" value={montoAbono} onChange={(e) => setMontoAbono(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800" />
                    </div>
                    <div>
                      <label className="block text-slate-600 font-medium mb-1 text-[10px]">Medio de Pago</label>
                      <select value={medioPagoAbono} onChange={(e) => setMedioPagoAbono(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800">
                        {Object.entries(MEDIOS_PAGO).map(([codigo, nombre]) => <option key={codigo} value={codigo}>{nombre}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-600 font-medium mb-1 text-[10px]">Referencia</label>
                      <input type="text" value={referenciaAbono} onChange={(e) => setReferenciaAbono(e.target.value)} placeholder="ej: # comprobante" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800" />
                    </div>
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setAbonandoId(null)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100">Cancelar</button>
                    <button onClick={() => confirmarAbono(c)} disabled={abonando} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60">
                      {abonando ? 'Guardando…' : 'Registrar Abono'}
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
