import { useEffect, useState } from 'react';
import { Company } from '../data/mockData';
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

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-auto">
          <BarChart3 className="w-4 h-4" style={{ color: company.colorPrimario }} />
          <h3 className="text-sm font-bold text-slate-800">Reportería de Clientes y Sesiones</h3>
        </div>
        <div className="flex bg-slate-100 rounded-xl p-1 text-xs font-semibold">
          <button
            onClick={() => setModo('mensual')}
            className={`px-3 py-1.5 rounded-lg transition-all ${modo === 'mensual' ? 'bg-white shadow-xs text-slate-800' : 'text-slate-500'}`}
          >
            Mensual
          </button>
          <button
            onClick={() => setModo('rango')}
            className={`px-3 py-1.5 rounded-lg transition-all ${modo === 'rango' ? 'bg-white shadow-xs text-slate-800' : 'text-slate-500'}`}
          >
            Rango personalizado
          </button>
        </div>
        {modo === 'mensual' ? (
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs"
          />
        ) : (
          <div className="flex items-center gap-2">
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs" />
            <span className="text-xs text-slate-400">a</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs" />
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs">{error}</div>
      )}

      {cargando ? (
        <div className="text-center text-xs text-slate-400 py-10">Cargando reporte...</div>
      ) : reporte && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <UserPlus className="w-3.5 h-3.5" /> Pacientes Nuevos
              </div>
              <span className="text-2xl font-bold text-slate-900">{reporte.resumen.pacientesNuevos}</span>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <Users className="w-3.5 h-3.5" /> Pacientes Atendidos
              </div>
              <span className="text-2xl font-bold text-slate-900">{reporte.resumen.pacientesAtendidos}</span>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Sesiones Completadas
              </div>
              <span className="text-2xl font-bold text-slate-900">{reporte.resumen.sesionesCompletadas}</span>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <TrendingUp className="w-3.5 h-3.5" /> Tasa de Asistencia
              </div>
              <span className="text-2xl font-bold text-slate-900">{reporte.resumen.tasaAsistencia}%</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h4 className="text-xs font-bold text-slate-600 mb-3">Tendencia Mensual</h4>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={reporte.tendenciaMensual}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="pacientesNuevos" name="Pacientes Nuevos" fill="#0ea5e9" />
                  <Bar dataKey="sesionesCompletadas" name="Sesiones Completadas" fill="#0f766e" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-xs font-bold text-slate-600">Detalle por Paciente</h4>
              <button
                onClick={exportarCsv}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-1.5 px-3 rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar CSV
              </button>
            </div>
            {reporte.pacientes.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No hay datos para el período seleccionado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-100">
                      <th className="py-2 pr-3">Paciente</th>
                      <th className="py-2 pr-3">Sesiones Completadas</th>
                      <th className="py-2 pr-3">Nuevo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.pacientes.map(p => (
                      <tr key={p.idPaciente} className="border-b border-slate-50">
                        <td className="py-2 pr-3 font-semibold text-slate-800">{p.nombreCompleto}</td>
                        <td className="py-2 pr-3 text-slate-600">{p.sesionesCompletadas}</td>
                        <td className="py-2 pr-3">
                          {p.esNuevo && <span className="bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded-full text-[10px] font-bold">Nuevo</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
