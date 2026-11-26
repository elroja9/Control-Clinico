import { useEffect, useState, type CSSProperties } from 'react';
import { Company } from '../data/mockData';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { EmptyState } from './ui/EmptyState';
import { Input } from './ui/Input';
import { Skeleton } from './ui/Skeleton';
import { StatCard } from './ui/StatCard';
import { BarChart3, Users, UserPlus, CheckCircle2, TrendingUp, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ReporteriaClinicaProps {
  company: Company;
}

interface ReporteClientesSesiones {
  resumen: {
    pacientesNuevos: number;
    pacientesAtendidos: number;
    sesionesCompletadas: number;
    tasaAsistencia: number;
  };
  tendenciaMensual: Array<{ mes: string; pacientesNuevos: number; sesionesCompletadas: number }>;
  pacientes: Array<{ idPaciente: number; nombreCompleto: string; sesionesCompletadas: number; esNuevo: boolean }>;
}

function primerDiaMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function ultimoDiaMes(): string {
  const d = new Date();
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${ultimo.getFullYear()}-${String(ultimo.getMonth() + 1).padStart(2, '0')}-${String(ultimo.getDate()).padStart(2, '0')}`;
}

function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ReporteriaClinica({ company }: ReporteriaClinicaProps) {
  const [modo, setModo] = useState<'mensual' | 'rango'>('mensual');
  const [mes, setMes] = useState(mesActual());
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta] = useState(ultimoDiaMes());
  const [reporte, setReporte] = useState<ReporteClientesSesiones | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const rangoEfectivo = (): { desde: string; hasta: string } => {
    if (modo === 'mensual') {
      const [anio, mesNum] = mes.split('-').map(Number);
      const ultimo = new Date(anio, mesNum, 0).getDate();
      return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` };
    }
    return { desde, hasta };
  };

  const cargarReporte = () => {
    const { desde: d, hasta: h } = rangoEfectivo();
    setCargando(true);
    setError('');
    fetch(`/api/reportes/clientes-sesiones?desde=${d}&hasta=${h}`)
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => { if (!ok) throw new Error(data.error); setReporte(data); })
      .catch(err => setError(err.message || 'No se pudo cargar el reporte.'))
      .finally(() => setCargando(false));
  };

  useEffect(() => { cargarReporte(); }, [modo, mes, desde, hasta]);

  const exportarCsv = () => {
    if (!reporte) return;
    const encabezado = 'Paciente,Sesiones Completadas,Nuevo\n';
    const filas = reporte.pacientes
      .map(p => `"${p.nombreCompleto.replace(/"/g, '""')}",${p.sesionesCompletadas},${p.esNuevo ? 'Sí' : 'No'}`)
      .join('\n');
    const blob = new Blob([encabezado + filas], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const { desde: d, hasta: h } = rangoEfectivo();
    a.href = url;
    a.download = `reporte-pacientes-sesiones-${d}-a-${h}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const segmento = (activo: boolean) =>
    `min-h-10 px-4 rounded-lg text-sm font-semibold transition-colors ${activo ? 'bg-surface shadow-sm text-fg' : 'text-fg-muted hover:text-fg'}`;

  return (
    <div className="space-y-5" style={{ '--brand': company.colorPrimario } as CSSProperties}>
      <Card className="p-4 sm:p-5 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3 mr-auto min-w-0">
          <span className="w-10 h-10 shrink-0 rounded-control bg-brand-soft text-brand-ink flex items-center justify-center" aria-hidden="true">
            <BarChart3 className="w-5 h-5" />
          </span>
          <h3 className="text-heading font-semibold tracking-tight text-fg">Reportería de Clientes y Sesiones</h3>
        </div>
        <div className="flex bg-surface-muted rounded-control p-1" role="group" aria-label="Tipo de período">
          <button type="button" onClick={() => setModo('mensual')} aria-pressed={modo === 'mensual'} className={segmento(modo === 'mensual')}>
            Mensual
          </button>
          <button type="button" onClick={() => setModo('rango')} aria-pressed={modo === 'rango'} className={segmento(modo === 'rango')}>
            Rango personalizado
          </button>
        </div>
        {modo === 'mensual' ? (
          <Input
            type="month"
            aria-label="Mes del reporte"
            value={mes}
            onChange={(e: any) => setMes(e.target.value)}
            wrapperClassName="w-full sm:w-44"
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Input type="date" aria-label="Desde" value={desde} onChange={(e: any) => setDesde(e.target.value)} wrapperClassName="w-full sm:w-44" />
            <span className="text-sm text-fg-muted">a</span>
            <Input type="date" aria-label="Hasta" value={hasta} onChange={(e: any) => setHasta(e.target.value)} wrapperClassName="w-full sm:w-44" />
          </div>
        )}
      </Card>

      {error && (
        <div role="alert" className="p-3 rounded-control bg-danger-soft border border-danger/20 text-danger text-sm">{error}</div>
      )}

      {cargando ? (
        <div className="space-y-5" role="status" aria-label="Cargando reporte">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-card" />)}
          </div>
          <Skeleton className="h-72 rounded-card" />
        </div>
      ) : reporte && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Pacientes Nuevos" icon={<UserPlus />} value={reporte.resumen.pacientesNuevos} />
            <StatCard label="Pacientes Atendidos" icon={<Users />} value={reporte.resumen.pacientesAtendidos} />
            <StatCard label="Sesiones Completadas" icon={<CheckCircle2 />} value={reporte.resumen.sesionesCompletadas} />
            <StatCard label="Tasa de Asistencia" icon={<TrendingUp />} value={`${reporte.resumen.tasaAsistencia}%`} />
          </div>

          <Card className="p-4 sm:p-5">
            <h4 className="text-body font-semibold text-fg mb-4">Tendencia Mensual</h4>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={reporte.tendenciaMensual}>
                  <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} stroke="#cbd5e1" allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: '#f1f3f6' }}
                    contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', boxShadow: '0 4px 12px -2px rgb(15 23 42 / 0.07)', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {/* Serie 1: info (#0369a1). Serie 2: color de la clínica (--brand), definido en :root */}
                  <Bar dataKey="pacientesNuevos" name="Pacientes Nuevos" fill="#0369a1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="sesionesCompletadas" name="Sesiones Completadas" fill="var(--brand)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap justify-between items-center gap-3 p-4 sm:p-5">
              <h4 className="text-body font-semibold text-fg">Detalle por Paciente</h4>
              <Button variant="outline" size="sm" onClick={exportarCsv} icon={<Download className="w-4 h-4" aria-hidden="true" />}>
                Exportar CSV
              </Button>
            </div>
            {reporte.pacientes.length === 0 ? (
              <EmptyState
                icon={<Users />}
                title="Sin datos para el período"
                description="No hay pacientes con sesiones en el período seleccionado. Pruebe con otro rango de fechas."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-surface-muted">
                    <tr className="text-left text-fg-muted text-xs font-semibold border-y border-border">
                      <th scope="col" className="py-3 px-4 sm:px-5">Paciente</th>
                      <th scope="col" className="py-3 px-4 sm:px-5">Sesiones Completadas</th>
                      <th scope="col" className="py-3 px-4 sm:px-5">Nuevo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {reporte.pacientes.map(p => (
                      <tr key={p.idPaciente} className="hover:bg-surface-muted/60 transition-colors">
                        <td className="py-3 px-4 sm:px-5 font-semibold text-fg">{p.nombreCompleto}</td>
                        <td className="py-3 px-4 sm:px-5 text-fg-muted">{p.sesionesCompletadas}</td>
                        <td className="py-3 px-4 sm:px-5">
                          {p.esNuevo && <Badge tone="info">Nuevo</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
