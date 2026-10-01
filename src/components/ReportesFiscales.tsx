import React, { useEffect, useState } from 'react';
import { Company, ReporteD104, ReporteD101, GastosManualesAnuales, CierreFiscal } from '../data/mockData';
import { FileSpreadsheet, AlertTriangle, Lock, CheckCircle, Archive } from 'lucide-react';
import { notify, confirmar } from './ui/Feedback';

interface ReportesFiscalesProps {
  company: Company;
}

const MESES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function periodOptions(): { value: string; label: string }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { value, label: `${MESES_ES[d.getMonth()]} de ${d.getFullYear()}${i === 0 ? ' (período actual)' : ''}` };
  });
}

function yearOptions(): number[] {
  const y = new Date().getFullYear();
  return [y, y - 1, y - 2, y - 3, y - 4];
}

function colones(n: number): string {
  return `₡${n.toLocaleString('es-CR', { maximumFractionDigits: 2 })}`;
}

export default function ReportesFiscales({ company }: ReportesFiscalesProps) {
  const [subTab, setSubTab] = useState<'d104' | 'd101' | 'historial'>('d104');

  // --- D-104 ---
  const [periodo, setPeriodo] = useState(() => periodOptions()[0].value);
  const [d104, setD104] = useState<ReporteD104 | null>(null);
  const [cargandoD104, setCargandoD104] = useState(false);
  const [cerrandoD104, setCerrandoD104] = useState(false);
  const [errorD104, setErrorD104] = useState('');

  const cargarD104 = (p: string) => {
    setCargandoD104(true);
    setErrorD104('');
    fetch(`/api/reportes/d104?periodo=${p}`)
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => { if (!ok) throw new Error(data.error); setD104(data); })
      .catch(err => setErrorD104(err.message || 'No se pudo cargar el reporte D-104.'))
      .finally(() => setCargandoD104(false));
  };

  useEffect(() => { cargarD104(periodo); }, [periodo]);

  const handleCerrarD104 = async () => {
    const ok = await confirmar({
      title: `¿Cerrar el período ${periodo}?`,
      message: 'Un cierre declarado es un registro permanente: no se puede deshacer ni recalcular después.',
      confirmText: 'Cerrar período',
      tone: 'warning'
    });
    if (!ok) return;
    setCerrandoD104(true);
    setErrorD104('');
    try {
      const res = await fetch('/api/reportes/d104/cerrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setD104(data);
    } catch (err: any) {
      setErrorD104(err.message || 'No se pudo cerrar el período.');
    } finally {
      setCerrandoD104(false);
    }
  };

  // --- D-101 ---
  const [anio, setAnio] = useState(() => yearOptions()[0]);
  const [d101, setD101] = useState<ReporteD101 | null>(null);
  const [cargandoD101, setCargandoD101] = useState(false);
  const [cerrandoD101, setCerrandoD101] = useState(false);
  const [errorD101, setErrorD101] = useState('');
  const [gastosForm, setGastosForm] = useState<GastosManualesAnuales>({ alquileres: 0, servicios: 0, planilla: 0, otros: 0 });
  const [guardandoGastos, setGuardandoGastos] = useState(false);

  const cargarD101 = (a: number) => {
    setCargandoD101(true);
    setErrorD101('');
    fetch(`/api/reportes/d101?anio=${a}`)
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error);
        setD101(data);
        setGastosForm(data.gastosManuales);
      })
      .catch(err => setErrorD101(err.message || 'No se pudo cargar el reporte D-101.'))
      .finally(() => setCargandoD101(false));
  };

  useEffect(() => { cargarD101(anio); }, [anio]);

  const handleGuardarGastos = async () => {
    setGuardandoGastos(true);
    setErrorD101('');
    try {
      const res = await fetch('/api/reportes/d101-gastos-manuales', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anio, ...gastosForm })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      cargarD101(anio);
    } catch (err: any) {
      setErrorD101(err.message || 'No se pudieron guardar los gastos.');
    } finally {
      setGuardandoGastos(false);
    }
  };

  const handleCerrarD101 = async () => {
    const ok = await confirmar({
      title: `¿Presentar la liquidación de Renta ${anio}?`,
      message: 'Un cierre declarado es un registro permanente: no se puede deshacer ni recalcular después.',
      confirmText: 'Presentar liquidación',
      tone: 'warning'
    });
    if (!ok) return;
    setCerrandoD101(true);
    setErrorD101('');
    try {
      const res = await fetch('/api/reportes/d101/cerrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anio })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setD101(data);
    } catch (err: any) {
      setErrorD101(err.message || 'No se pudo presentar la liquidación.');
    } finally {
      setCerrandoD101(false);
    }
  };

  // --- Historial ---
  const [historialTipo, setHistorialTipo] = useState<'D104' | 'D101'>('D104');
  const [cierres, setCierres] = useState<CierreFiscal[]>([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  useEffect(() => {
    if (subTab !== 'historial') return;
    setCargandoHistorial(true);
    fetch(`/api/reportes/cierres?tipo=${historialTipo}`)
      .then(res => res.json())
      .then(data => setCierres(Array.isArray(data) ? data : []))
      .catch(() => setCierres([]))
      .finally(() => setCargandoHistorial(false));
  }, [subTab, historialTipo]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
        <FileSpreadsheet className="w-5 h-5 text-slate-500" />
        <div>
          <h3 className="text-sm font-bold text-slate-800">Reportes Fiscales</h3>
          <p className="text-[11px] text-slate-500">Declaración de IVA (D-104) y Renta (D-101)</p>
        </div>
      </div>

      <div className="flex gap-1.5 mb-4">
        {(['d104', 'd101', 'historial'] as const).map(t => (
          <button
            key={t}
            onClick={() => setSubTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold ${subTab === t ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {t === 'd104' ? 'D-104 Mensual' : t === 'd101' ? 'D-101 Anual' : 'Historial'}
          </button>
        ))}
      </div>

      {subTab === 'd104' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label htmlFor="reportesfi-periodo" className="text-xs font-medium text-slate-600">Período</label>
            <select id="reportesfi-periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800">
              {periodOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {errorD104 && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorD104}</span>
            </div>
          )}

          {cargandoD104 && <p className="text-xs text-slate-500 text-center py-6">Calculando...</p>}

          {!cargandoD104 && d104 && (
            <>
              {d104.regimenSimplificado && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-800">
                    Esta empresa está registrada bajo <strong>Régimen de Tributación Simplificada</strong>: no declara IVA mediante el formulario D-104 tradicional (se declara por cuotas trimestrales según su actividad). Las cifras de abajo son solo un resumen informativo de las ventas registradas, no una declaración válida.
                  </p>
                </div>
              )}

              {d104.yaCerrado && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-[11px] text-emerald-800">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>Período cerrado el {d104.fechaCierre ? new Date(d104.fechaCierre).toLocaleString('es-CR') : ''}. Este es un registro fiscal permanente.</span>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase">
                      <th className="text-left py-2 px-3">Tarifa</th>
                      <th className="text-right py-2 px-3">Base Gravable</th>
                      <th className="text-right py-2 px-3">IVA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr><td className="py-2 px-3">13% (Tarifa General)</td><td className="py-2 px-3 text-right font-mono">{colones(d104.tarifas.t13.base)}</td><td className="py-2 px-3 text-right font-mono font-bold text-indigo-600">{colones(d104.tarifas.t13.iva)}</td></tr>
                    <tr><td className="py-2 px-3">4% (Reducida)</td><td className="py-2 px-3 text-right font-mono">{colones(d104.tarifas.t4.base)}</td><td className="py-2 px-3 text-right font-mono font-bold text-indigo-600">{colones(d104.tarifas.t4.iva)}</td></tr>
                    <tr><td className="py-2 px-3">2% (Reducida)</td><td className="py-2 px-3 text-right font-mono">{colones(d104.tarifas.t2.base)}</td><td className="py-2 px-3 text-right font-mono font-bold text-indigo-600">{colones(d104.tarifas.t2.iva)}</td></tr>
                    <tr><td className="py-2 px-3">1% (Reducida)</td><td className="py-2 px-3 text-right font-mono">{colones(d104.tarifas.t1.base)}</td><td className="py-2 px-3 text-right font-mono font-bold text-indigo-600">{colones(d104.tarifas.t1.iva)}</td></tr>
                    <tr><td className="py-2 px-3">Exento</td><td className="py-2 px-3 text-right font-mono">{colones(d104.tarifas.exento.base)}</td><td className="py-2 px-3 text-right font-mono text-slate-500">—</td></tr>
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Débito Fiscal</span>
                  <span className="text-sm font-bold text-slate-800">{colones(d104.debitoFiscal)}</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Crédito Fiscal (compras)</span>
                  <span className="text-sm font-bold text-slate-800">{colones(d104.creditoFiscal)}</span>
                </div>
                <div className={`p-3 rounded-xl border ${d104.saldoAPagar >= 0 ? 'bg-rose-50 border-rose-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <span className={`text-[11px] font-bold uppercase block ${d104.saldoAPagar >= 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{d104.saldoAPagar >= 0 ? 'Saldo a Pagar' : 'Saldo a Favor'}</span>
                  <span className={`text-sm font-bold ${d104.saldoAPagar >= 0 ? 'text-rose-900' : 'text-emerald-900'}`}>{colones(Math.abs(d104.saldoAPagar))}</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500">{d104.cantidadFacturas} factura(s) · {d104.cantidadNotasCredito} nota(s) de crédito · {d104.cantidadNotasDebito} nota(s) de débito en este período.</p>

              {!d104.yaCerrado && (
                <button
                  onClick={handleCerrarD104}
                  disabled={cerrandoD104}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
                >
                  <Lock className="w-3.5 h-3.5" />
                  {cerrandoD104 ? 'Cerrando...' : 'Cerrar Período'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {subTab === 'd101' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <label htmlFor="reportesfi-ano-fiscal" className="text-xs font-medium text-slate-600">Año Fiscal</label>
            <select id="reportesfi-ano-fiscal" value={anio} onChange={(e) => setAnio(parseInt(e.target.value))} className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800">
              {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {errorD101 && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorD101}</span>
            </div>
          )}

          {cargandoD101 && <p className="text-xs text-slate-500 text-center py-6">Calculando...</p>}

          {!cargandoD101 && d101 && (
            <>
              {d101.regimenSimplificado && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-800">
                    Esta empresa está en Régimen Simplificado. Igualmente debe presentar Renta (D-101) anualmente, pero el cálculo de utilidad y gastos deducibles sigue reglas distintas a las mostradas aquí — use esta cifra solo como referencia.
                  </p>
                </div>
              )}

              {d101.yaCerrado && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-[11px] text-emerald-800">
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  <span>Liquidación presentada el {d101.fechaCierre ? new Date(d101.fechaCierre).toLocaleString('es-CR') : ''}. Este es un registro fiscal permanente.</span>
                </div>
              )}

              <p className="text-[11px] text-slate-500">Contribuyente: <strong>{d101.tipoContribuyente === 'fisica' ? 'Persona Física con Actividad Lucrativa' : 'Persona Jurídica'}</strong> (según cédula de la empresa)</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Ventas Netas</span>
                  <span className="text-sm font-bold text-slate-800">{colones(d101.ventasNetas)}</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block" title="El IVA de las compras no se deduce aquí: se recupera como crédito fiscal en el D-104">Compras (CxP, sin IVA)</span>
                  <span className="text-sm font-bold text-slate-800">{colones(d101.comprasCxP)}</span>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <span className="text-[11px] font-bold text-slate-500 uppercase block">Gastos Deducibles</span>
                  <span className="text-sm font-bold text-slate-800">{colones(d101.totalGastosDeducibles)}</span>
                </div>
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-xl">
                  <span className="text-[11px] font-bold text-indigo-700 uppercase block">Utilidad Neta</span>
                  <span className="text-sm font-bold text-indigo-900">{colones(d101.utilidadNeta)}</span>
                </div>
              </div>

              <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3">
                <p className="text-[11px] font-bold text-slate-600 uppercase">Gastos Anuales Adicionales (planilla, alquileres, etc.)</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(Object.keys(gastosForm) as Array<keyof GastosManualesAnuales>).map(campo => (
                    <div key={campo}>
                      <label className="block text-slate-600 text-[11px] font-medium mb-1 capitalize">{campo}</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={gastosForm[campo]}
                        disabled={d101.yaCerrado}
                        onChange={(e) => setGastosForm(prev => ({ ...prev, [campo]: parseFloat(e.target.value) || 0 }))}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 disabled:opacity-60"
                      />
                    </div>
                  ))}
                </div>
                {!d101.yaCerrado && (
                  <button
                    onClick={handleGuardarGastos}
                    disabled={guardandoGastos}
                    className="text-xs font-semibold text-teal-700 hover:underline disabled:opacity-60"
                  >
                    {guardandoGastos ? 'Guardando...' : 'Guardar Gastos'}
                  </button>
                )}
              </div>

              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                <span className="text-[11px] font-bold text-rose-700 uppercase block">Impuesto de Renta Estimado</span>
                <span className="text-lg font-bold text-rose-900">{colones(d101.impuestoRenta)}</span>
              </div>

              <details className="text-[11px] text-slate-500">
                <summary className="cursor-pointer font-semibold text-slate-600">Ver desglose por tramos</summary>
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  {d101.tramos.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </details>

              <p className="text-[11px] text-slate-500">{d101.cantidadFacturas} factura(s){d101.cantidadNotasCredito != null ? ` · ${d101.cantidadNotasCredito} nota(s) de crédito` : ''} · {d101.cantidadNotasDebito} nota(s) de débito emitidas en {d101.anio}.</p>

              {!d101.yaCerrado && (
                <button
                  onClick={handleCerrarD101}
                  disabled={cerrandoD101}
                  className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-60"
                >
                  <Lock className="w-3.5 h-3.5" />
                  {cerrandoD101 ? 'Presentando...' : 'Presentar Liquidación Anual'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {subTab === 'historial' && (
        <div className="space-y-3">
          <div className="flex gap-1.5">
            {(['D104', 'D101'] as const).map(t => (
              <button key={t} onClick={() => setHistorialTipo(t)} className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${historialTipo === t ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{t}</button>
            ))}
          </div>
          {cargandoHistorial && <p className="text-xs text-slate-500 text-center py-6">Cargando...</p>}
          {!cargandoHistorial && cierres.length === 0 && (
            <p className="text-slate-500 text-xs text-center py-6 flex flex-col items-center gap-1.5">
              <Archive className="w-5 h-5 text-slate-300" />
              Sin cierres {historialTipo} declarados todavía.
            </p>
          )}
          <div className="space-y-1.5">
            {cierres.map(c => (
              <div key={c.id} className="p-2.5 bg-white border border-slate-200 rounded-lg flex items-center justify-between">
                <div>
                  <span className="font-semibold text-slate-800 text-xs block">Período {c.periodo}</span>
                  <span className="text-[11px] text-slate-500">Cerrado el {new Date(c.creadoEn).toLocaleString('es-CR')}</span>
                </div>
                <span className="text-xs font-bold text-slate-700">
                  {c.tipo === 'D104' ? colones((c.datos as ReporteD104).saldoAPagar) : colones((c.datos as ReporteD101).impuestoRenta)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
