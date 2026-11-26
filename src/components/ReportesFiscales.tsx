import React, { useEffect, useState } from 'react';
import { Company, ReporteD104, ReporteD101, GastosManualesAnuales, CierreFiscal } from '../data/mockData';
import { FileSpreadsheet, AlertTriangle, Lock, CheckCircle, Archive } from 'lucide-react';
import { confirmar } from './ui/Feedback';
import { colones } from '../utils/facturacion';
import { PageHeader } from './ui/PageHeader';
import { StatCard } from './ui/StatCard';
import { Card, CardHeader, CardBody } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { EmptyState } from './ui/EmptyState';
import { Skeleton } from './ui/Skeleton';
import { SegmentedControl } from './ui/SegmentedControl';

// Tarjetas de resumen en móvil: menos relleno y monto que puede bajar de línea
const STAT_MOVIL = 'min-w-0 max-sm:p-3.5 [&_.text-title]:break-words max-sm:[&_.text-title]:text-heading';

interface ReportesFiscalesProps {
  company: Company;
  soloLectura?: boolean; // Contador: consulta los reportes sin cerrar períodos ni editar gastos
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

const ETIQUETA_GASTO: Record<keyof GastosManualesAnuales, string> = {
  alquileres: 'Alquileres',
  servicios: 'Servicios (luz, agua, internet…)',
  planilla: 'Planilla y cargas sociales',
  otros: 'Otros gastos deducibles'
};

const periodoLegible = (periodo: string) =>
  /^\d{4}-\d{2}$/.test(periodo) ? `${MESES_ES[parseInt(periodo.slice(5)) - 1]} de ${periodo.slice(0, 4)}` : periodo;

export default function ReportesFiscales({ company, soloLectura = false }: ReportesFiscalesProps) {
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

  // Cierra un período. Si el servidor responde que hay comprobantes que Hacienda todavía no resolvió,
  // los muestra y solo cierra con una segunda confirmación explícita.
  const cerrarPeriodo = async (url: string, body: object): Promise<any> => {
    const enviar = (confirmarPendientes: boolean) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, confirmarPendientes })
    }).then(async res => ({ res, data: await res.json() }));
    let { res, data } = await enviar(false);
    if (res.status === 409 && Array.isArray(data.pendientes)) {
      const cerrarIgual = await confirmar({
        title: 'Hay comprobantes sin resolver en Hacienda',
        message: `${data.error} ¿Cerrar de todos modos?`,
        confirmText: 'Cerrar de todos modos',
        tone: 'warning'
      });
      if (!cerrarIgual) return null;
      ({ res, data } = await enviar(true));
    }
    if (!res.ok) throw new Error(data.error);
    return data;
  };

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
      const data = await cerrarPeriodo('/api/reportes/d104/cerrar', { periodo });
      if (data) setD104(data);
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

  // El cierre usa los gastos guardados en el servidor: presentar con cambios sin guardar declararía otros montos.
  const gastosSinGuardar = !!d101 && (Object.keys(gastosForm) as Array<keyof GastosManualesAnuales>).some(k => gastosForm[k] !== d101.gastosManuales[k]);

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
      const data = await cerrarPeriodo('/api/reportes/d101/cerrar', { anio });
      if (data) setD101(data);
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
    <div>
      <PageHeader title="Reportes fiscales" description="Declaración de IVA (D-104) y Renta (D-101)" />

      <SegmentedControl
        ariaLabel="Tipo de reporte"
        value={subTab}
        onChange={(t) => setSubTab(t)}
        options={(['d104', 'd101', 'historial'] as const).map(t => ({
          value: t,
          label: t === 'd104' ? 'D-104 Mensual' : t === 'd101' ? 'D-101 Anual' : 'Historial'
        }))}
        className="mb-5 sm:w-auto sm:inline-flex"
      />

      {subTab === 'd104' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <label htmlFor="reportesfi-periodo" className="text-sm font-semibold text-fg">Período</label>
            <Select id="reportesfi-periodo" value={periodo} onChange={(e: any) => setPeriodo(e.target.value)} wrapperClassName="sm:w-72">
              {periodOptions().map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </div>

          {errorD104 && (
            <div role="alert" className="p-3 rounded-control bg-danger-soft border border-danger/20 text-danger text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{errorD104}</span>
            </div>
          )}

          {cargandoD104 && (
            <div role="status" aria-label="Calculando" className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" />
              </div>
              <Skeleton className="h-40" />
            </div>
          )}

          {!cargandoD104 && d104 && (
            <>
              {d104.regimenSimplificado && (
                <div className="p-4 bg-warning-soft border border-warning/25 rounded-card flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-xs text-warning">
                    Esta empresa está registrada bajo <strong>Régimen de Tributación Simplificada</strong>: no declara IVA mediante el formulario D-104 tradicional (se declara por cuotas trimestrales según su actividad). Las cifras de abajo son solo un resumen informativo de las ventas registradas, no una declaración válida.
                  </p>
                </div>
              )}

              {d104.yaCerrado && (
                <div className="p-3 bg-success-soft border border-success/20 rounded-card flex items-center gap-2 text-xs text-success">
                  <CheckCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Período cerrado el {d104.fechaCierre ? new Date(d104.fechaCierre).toLocaleString('es-CR') : ''} — registro fiscal permanente.</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <StatCard label="Débito Fiscal" value={colones(d104.debitoFiscal)} icon={<FileSpreadsheet />} />
                <StatCard label="Crédito Fiscal (compras)" value={colones(d104.creditoFiscal)} icon={<FileSpreadsheet />} />
                <StatCard
                  label={d104.saldoAPagar >= 0 ? 'Saldo a Pagar' : 'Saldo a Favor'}
                  value={colones(Math.abs(d104.saldoAPagar))}
                  icon={<FileSpreadsheet />}
                  className={d104.saldoAPagar >= 0 ? 'bg-danger-soft border-danger/25' : 'bg-success-soft border-success/25'}
                />
              </div>

              <Card>
                <CardHeader title="Desglose por tarifa" description="Base gravable e IVA del período" />
                {/* Móvil: cada tarifa como fila apilada (sin scroll horizontal) */}
                <dl className="sm:hidden divide-y divide-border text-sm">
                  {([
                    ['13% (Tarifa General)', d104.tarifas.t13],
                    ['4% (Reducida)', d104.tarifas.t4],
                    ['2% (Reducida)', d104.tarifas.t2],
                    ['1% (Reducida)', d104.tarifas.t1]
                  ] as const).map(([etiqueta, t]) => (
                    <div key={etiqueta} className="px-4 py-3">
                      <dt className="font-medium text-fg">{etiqueta}</dt>
                      <dd className="mt-1 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2 text-xs">
                        <span className="text-fg-muted">Base <span className="block text-sm text-fg tabular-nums">{colones(t.base)}</span></span>
                        <span className="text-fg-muted text-right">IVA <span className="block text-sm font-semibold text-brand-ink tabular-nums">{colones(t.iva)}</span></span>
                      </dd>
                    </div>
                  ))}
                  <div className="px-4 py-3">
                    <dt className="font-medium text-fg">Exento</dt>
                    <dd className="mt-1 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2 text-xs">
                      <span className="text-fg-muted">Base <span className="block text-sm text-fg tabular-nums">{colones(d104.tarifas.exento.base)}</span></span>
                      <span className="text-fg-muted text-right">IVA <span className="block text-sm text-fg-subtle">—</span></span>
                    </dd>
                  </div>
                </dl>
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm border-collapse min-w-[22rem]">
                    <thead>
                      <tr className="bg-surface-muted text-fg-muted text-caption uppercase tracking-wider">
                        <th scope="col" className="text-left py-2.5 px-4 sm:px-6 font-semibold">Tarifa</th>
                        <th scope="col" className="text-right py-2.5 px-4 font-semibold">Base Gravable</th>
                        <th scope="col" className="text-right py-2.5 px-4 sm:px-6 font-semibold">IVA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <tr><td className="py-3 px-4 sm:px-6 text-fg">13% (Tarifa General)</td><td className="py-3 px-4 text-right tabular-nums text-fg">{colones(d104.tarifas.t13.base)}</td><td className="py-3 px-4 sm:px-6 text-right tabular-nums font-semibold text-brand-ink">{colones(d104.tarifas.t13.iva)}</td></tr>
                      <tr><td className="py-3 px-4 sm:px-6 text-fg">4% (Reducida)</td><td className="py-3 px-4 text-right tabular-nums text-fg">{colones(d104.tarifas.t4.base)}</td><td className="py-3 px-4 sm:px-6 text-right tabular-nums font-semibold text-brand-ink">{colones(d104.tarifas.t4.iva)}</td></tr>
                      <tr><td className="py-3 px-4 sm:px-6 text-fg">2% (Reducida)</td><td className="py-3 px-4 text-right tabular-nums text-fg">{colones(d104.tarifas.t2.base)}</td><td className="py-3 px-4 sm:px-6 text-right tabular-nums font-semibold text-brand-ink">{colones(d104.tarifas.t2.iva)}</td></tr>
                      <tr><td className="py-3 px-4 sm:px-6 text-fg">1% (Reducida)</td><td className="py-3 px-4 text-right tabular-nums text-fg">{colones(d104.tarifas.t1.base)}</td><td className="py-3 px-4 sm:px-6 text-right tabular-nums font-semibold text-brand-ink">{colones(d104.tarifas.t1.iva)}</td></tr>
                      <tr><td className="py-3 px-4 sm:px-6 text-fg">Exento</td><td className="py-3 px-4 text-right tabular-nums text-fg">{colones(d104.tarifas.exento.base)}</td><td className="py-3 px-4 sm:px-6 text-right text-fg-subtle">—</td></tr>
                    </tbody>
                  </table>
                </div>
              </Card>

              <p className="text-xs text-fg-muted">{d104.cantidadFacturas} factura(s) · {d104.cantidadNotasCredito} nota(s) de crédito · {d104.cantidadNotasDebito} nota(s) de débito en este período.</p>

              {!soloLectura && !d104.yaCerrado && (
                <Button
                  className="w-full sm:w-auto"
                  onClick={handleCerrarD104}
                  disabled={cerrandoD104}
                  icon={<Lock className="w-4 h-4" aria-hidden="true" />}
                >
                  {cerrandoD104 ? 'Cerrando...' : 'Cerrar Período'}
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {subTab === 'd101' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
            <label htmlFor="reportesfi-ano-fiscal" className="text-sm font-semibold text-fg">Año Fiscal</label>
            <Select id="reportesfi-ano-fiscal" value={anio} onChange={(e: any) => setAnio(parseInt(e.target.value))} wrapperClassName="sm:w-40">
              {yearOptions().map(y => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>

          {errorD101 && (
            <div role="alert" className="p-3 rounded-control bg-danger-soft border border-danger/20 text-danger text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{errorD101}</span>
            </div>
          )}

          {cargandoD101 && (
            <div role="status" aria-label="Calculando" className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" />
              </div>
              <Skeleton className="h-32" />
            </div>
          )}

          {!cargandoD101 && d101 && (
            <>
              {d101.regimenSimplificado && (
                <div className="p-4 bg-warning-soft border border-warning/25 rounded-card flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden="true" />
                  <p className="text-xs text-warning">
                    Esta empresa está en Régimen Simplificado. Igualmente debe presentar Renta (D-101) anualmente, pero el cálculo de utilidad y gastos deducibles sigue reglas distintas a las mostradas aquí — use esta cifra solo como referencia.
                  </p>
                </div>
              )}

              {d101.yaCerrado && (
                <div className="p-3 bg-success-soft border border-success/20 rounded-card flex items-center gap-2 text-xs text-success">
                  <CheckCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Liquidación presentada el {d101.fechaCierre ? new Date(d101.fechaCierre).toLocaleString('es-CR') : ''} — registro fiscal permanente.</span>
                </div>
              )}

              <p className="text-xs text-fg-muted">Contribuyente: <strong className="text-fg">{d101.tipoContribuyente === 'fisica' ? 'Persona Física con Actividad Lucrativa' : 'Persona Jurídica'}</strong> (según cédula de la empresa)</p>

              {/* minmax(0,1fr) + montos que pueden bajar de línea: sin scroll horizontal a 360px */}
              <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-4 gap-3">
                <StatCard label="Ventas Netas" value={colones(d101.ventasNetas)} className={STAT_MOVIL} />
                <div className="min-w-0">
                  <StatCard label="Compras (CxP, sin IVA)" value={colones(d101.comprasCxP)} delta={{ value: 'El IVA de las compras se recupera en el D-104, no se deduce aquí.' }} className={`h-full ${STAT_MOVIL}`} />
                </div>
                <StatCard label="Gastos Deducibles" value={colones(d101.totalGastosDeducibles)} className={STAT_MOVIL} />
                <StatCard label="Utilidad Neta" value={colones(d101.utilidadNeta)} className={`bg-brand-soft border-brand/25 ${STAT_MOVIL}`} />
              </div>

              <Card>
                <CardHeader title="Gastos anuales que no pasan por Cuentas por Pagar" description="Se suman a los gastos deducibles del año" />
                <CardBody className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {(Object.keys(gastosForm) as Array<keyof GastosManualesAnuales>).map(campo => (
                      <div key={campo}>
                        <label htmlFor={`d101-gasto-${campo}`} className="block text-fg text-xs font-semibold mb-1.5">{ETIQUETA_GASTO[campo]} (₡)</label>
                        <Input
                          id={`d101-gasto-${campo}`}
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={gastosForm[campo]}
                          disabled={d101.yaCerrado || soloLectura}
                          onChange={(e: any) => setGastosForm(prev => ({ ...prev, [campo]: Math.max(0, parseFloat(e.target.value) || 0) }))}
                          className="tabular-nums"
                        />
                      </div>
                    ))}
                  </div>
                  {!soloLectura && !d101.yaCerrado && (
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        onClick={handleGuardarGastos}
                        disabled={guardandoGastos || !gastosSinGuardar}
                      >
                        {guardandoGastos ? 'Guardando…' : 'Guardar gastos y recalcular'}
                      </Button>
                      {gastosSinGuardar && <span role="status" className="text-xs font-semibold text-warning">Hay cambios sin guardar: el impuesto mostrado aún no los incluye.</span>}
                    </div>
                  )}
                </CardBody>
              </Card>

              <div className="p-5 bg-danger-soft border border-danger/25 rounded-card">
                <span className="text-xs font-semibold text-danger uppercase tracking-wider block">Impuesto de renta estimado</span>
                <span className="text-title sm:text-display font-bold text-danger tabular-nums block mt-1 break-words">{colones(d101.impuestoRenta)}</span>
                {d101.referenciaTramos && <span className="block text-xs text-danger mt-1">Tramos: {d101.referenciaTramos}</span>}
              </div>

              <details className="text-xs text-fg-muted" open={d101.tramos.length > 0 && d101.tramos[0].startsWith('No hay')}>
                <summary className="cursor-pointer font-semibold text-fg min-h-10 flex items-center">Ver desglose por tramos</summary>
                <ul className="mt-2 space-y-1 list-disc list-inside">
                  {d101.tramos.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </details>

              <p className="text-xs text-fg-muted">{d101.cantidadFacturas} factura(s){d101.cantidadNotasCredito != null ? ` · ${d101.cantidadNotasCredito} nota(s) de crédito` : ''} · {d101.cantidadNotasDebito} nota(s) de débito emitidas en {d101.anio}.</p>

              {!soloLectura && !d101.yaCerrado && (
                <Button
                  className="w-full sm:w-auto"
                  onClick={handleCerrarD101}
                  disabled={cerrandoD101 || gastosSinGuardar}
                  title={gastosSinGuardar ? 'Guarde primero los gastos' : undefined}
                  icon={<Lock className="w-4 h-4" aria-hidden="true" />}
                >
                  {cerrandoD101 ? 'Presentando...' : 'Presentar Liquidación Anual'}
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {subTab === 'historial' && (
        <div className="space-y-4">
          <SegmentedControl
            ariaLabel="Tipo de cierre"
            size="sm"
            value={historialTipo}
            onChange={(t) => setHistorialTipo(t)}
            options={(['D104', 'D101'] as const).map(t => ({ value: t, label: t === 'D104' ? 'D-104 (IVA)' : 'D-101 (Renta)' }))}
            className="sm:w-auto sm:inline-flex"
          />
          {cargandoHistorial && (
            <div role="status" aria-label="Cargando" className="space-y-2">
              <Skeleton className="h-16" /><Skeleton className="h-16" />
            </div>
          )}
          {!cargandoHistorial && cierres.length === 0 && (
            <Card>
              <EmptyState icon={<Archive />} title="Sin cierres" description={`Sin cierres ${historialTipo} declarados todavía.`} />
            </Card>
          )}
          {cierres.length > 0 && (
            <Card className="divide-y divide-border">
              {cierres.map(c => (
                <div key={c.id} className="p-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <span className="font-semibold text-fg text-body block">Período {periodoLegible(c.periodo)}</span>
                    <span className="text-xs text-fg-muted">Cerrado el {new Date(c.creadoEn).toLocaleString('es-CR')}</span>
                  </div>
                  <span className="text-body font-semibold text-fg tabular-nums text-right">
                    {c.tipo === 'D104'
                      ? `${(c.datos as ReporteD104).saldoAPagar >= 0 ? 'A pagar' : 'A favor'} ${colones(Math.abs((c.datos as ReporteD104).saldoAPagar))}`
                      : `Renta ${colones((c.datos as ReporteD101).impuestoRenta)}`}
                  </span>
                </div>
              ))}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
