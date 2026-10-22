import React, { useEffect, useState } from 'react';
import { Scale, Plus, Trash2, AlertCircle } from 'lucide-react';
import { notify } from './ui/Feedback';

// Tramos del Impuesto sobre la Renta por período fiscal (tabla parametros_renta). Son nacionales:
// los mantiene el administrador SaaS cuando Hacienda publica el decreto anual, y el D-101 de todas
// las empresas los usa (server/impuestoRenta.ts).

type Escala = Array<[number | null, number]>;

interface ParametrosRenta {
  anio: number;
  escalaFisica: Escala;
  escalaJuridica: Escala;
  topeIngresosEscalaReducida: number;
  tarifaGeneralJuridica: number;
  referenciaLegal: string;
  actualizadoEn: string | null;
}

// En el formulario los montos y porcentajes se editan como texto (tasa en %, no en fracción).
type FilaForm = { tope: string; tasa: string };
interface Form {
  escalaFisica: FilaForm[];
  escalaJuridica: FilaForm[];
  tope: string;
  tarifaGeneral: string;
  referencia: string;
}

const aPorcentaje = (t: number) => String(Math.round(t * 10000) / 100);
const aForm = (p: ParametrosRenta): Form => ({
  escalaFisica: p.escalaFisica.map(([tope, tasa]) => ({ tope: tope == null ? '' : String(tope), tasa: aPorcentaje(tasa) })),
  escalaJuridica: p.escalaJuridica.map(([tope, tasa]) => ({ tope: tope == null ? '' : String(tope), tasa: aPorcentaje(tasa) })),
  tope: String(p.topeIngresosEscalaReducida),
  tarifaGeneral: aPorcentaje(p.tarifaGeneralJuridica),
  referencia: p.referenciaLegal
});
const FORM_VACIO: Form = { escalaFisica: [{ tope: '', tasa: '' }], escalaJuridica: [{ tope: '', tasa: '' }], tope: '', tarifaGeneral: '', referencia: '' };
// El último tramo no lleva tope: aplica a todo el exceso.
const aEscala = (filas: FilaForm[]): Escala => filas.map((f, i) => [i === filas.length - 1 ? null : Number(f.tope), Number(f.tasa) / 100]);

const campo = 'w-full min-h-10 bg-white border border-slate-200 rounded-lg px-2.5 text-xs text-slate-800';

function EditorEscala({ titulo, id, filas, onChange }: { titulo: string; id: string; filas: FilaForm[]; onChange: (f: FilaForm[]) => void }) {
  const cambiar = (i: number, k: keyof FilaForm, v: string) => onChange(filas.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  return (
    <fieldset className="p-3 border border-slate-200 rounded-xl space-y-2">
      <legend className="px-1 text-[11px] font-bold text-slate-700 uppercase">{titulo}</legend>
      {filas.map((f, i) => {
        const ultimo = i === filas.length - 1;
        return (
          <div key={i} className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-7">
              <label htmlFor={`${id}-tope-${i}`} className="block text-[11px] text-slate-600 mb-1">{ultimo ? 'Tope (último tramo: sin tope)' : `Hasta (₡) — tramo ${i + 1}`}</label>
              <input id={`${id}-tope-${i}`} type="number" min="0" step="1" inputMode="numeric" disabled={ultimo} value={ultimo ? '' : f.tope} placeholder={ultimo ? 'Todo el exceso' : ''} onChange={(e) => cambiar(i, 'tope', e.target.value)} className={`${campo} disabled:bg-slate-100`} />
            </div>
            <div className="col-span-3">
              <label htmlFor={`${id}-tasa-${i}`} className="block text-[11px] text-slate-600 mb-1">Tasa (%)</label>
              <input id={`${id}-tasa-${i}`} type="number" min="0" max="100" step="0.01" inputMode="decimal" value={f.tasa} onChange={(e) => cambiar(i, 'tasa', e.target.value)} className={campo} />
            </div>
            <div className="col-span-2 flex justify-end">
              {filas.length > 1 && (
                <button type="button" onClick={() => onChange(filas.filter((_, j) => j !== i))} className="w-10 h-10 flex items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50" aria-label={`Quitar tramo ${i + 1} de ${titulo}`}>
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        );
      })}
      <button type="button" onClick={() => onChange([...filas.slice(0, -1), { tope: '', tasa: '' }, filas[filas.length - 1]])} className="min-h-9 inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline">
        <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Agregar tramo intermedio
      </button>
    </fieldset>
  );
}

export default function ParametrosRentaManager() {
  const [periodos, setPeriodos] = useState<ParametrosRenta[]>([]);
  const [anio, setAnio] = useState<number | null>(null);
  const [nuevoAnio, setNuevoAnio] = useState('');
  const [form, setForm] = useState<Form>(FORM_VACIO);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = (seleccionar?: number) =>
    fetch('/api/parametros-renta')
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error);
        setPeriodos(data);
        const elegido = data.find((p: ParametrosRenta) => p.anio === seleccionar) || data[0];
        if (elegido) { setAnio(elegido.anio); setForm(aForm(elegido)); }
      })
      .catch(err => setError(err.message || 'No se pudieron cargar los tramos de renta.'));

  useEffect(() => { cargar(); }, []);

  const elegir = (a: number) => {
    const p = periodos.find(x => x.anio === a);
    setAnio(a);
    setForm(p ? aForm(p) : FORM_VACIO);
    setError('');
  };

  // Un período nuevo arranca con los tramos del más reciente: el decreto anual suele mover solo los montos.
  const crearPeriodo = () => {
    const a = parseInt(nuevoAnio);
    if (!Number.isInteger(a) || a < 2000 || a > 2100) { setError('Indique un año fiscal válido.'); return; }
    if (periodos.some(p => p.anio === a)) { elegir(a); setNuevoAnio(''); return; }
    setAnio(a);
    setForm(periodos[0] ? { ...aForm(periodos[0]), referencia: '' } : FORM_VACIO);
    setNuevoAnio('');
    setError('');
  };

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (anio == null) return;
    setGuardando(true);
    setError('');
    try {
      const res = await fetch(`/api/parametros-renta/${anio}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          escalaFisica: aEscala(form.escalaFisica),
          escalaJuridica: aEscala(form.escalaJuridica),
          topeIngresosEscalaReducida: Number(form.tope),
          tarifaGeneralJuridica: Number(form.tarifaGeneral) / 100,
          referenciaLegal: form.referencia
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      notify.success(`Tramos de renta del período ${anio} guardados.`);
      await cargar(anio);
    } catch (err: any) {
      setError(err.message || 'No se pudieron guardar los tramos.');
    } finally {
      setGuardando(false);
    }
  };

  const actual = periodos.find(p => p.anio === anio);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 text-xs space-y-4">
      <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
        <Scale className="w-5 h-5 text-slate-500" aria-hidden="true" />
        <div>
          <h3 className="text-sm font-bold text-slate-800">Tramos del Impuesto sobre la Renta (D-101)</h3>
          <p className="text-[11px] text-slate-600">Uno por período fiscal; los usa el D-101 de todas las empresas. Actualícelos cuando Hacienda publique el decreto anual.</p>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="renta-periodo" className="block text-[11px] text-slate-600 mb-1">Período fiscal</label>
          <select id="renta-periodo" value={anio ?? ''} onChange={(e) => elegir(parseInt(e.target.value))} className="min-h-10 bg-slate-50 border border-slate-200 rounded-lg px-2.5 text-xs">
            {anio != null && !periodos.some(p => p.anio === anio) && <option value={anio}>{anio} (nuevo, sin guardar)</option>}
            {periodos.map(p => <option key={p.anio} value={p.anio}>{p.anio}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="renta-nuevo" className="block text-[11px] text-slate-600 mb-1">Registrar otro período</label>
          <div className="flex gap-2">
            <input id="renta-nuevo" type="number" min="2000" max="2100" placeholder="Año" value={nuevoAnio} onChange={(e) => setNuevoAnio(e.target.value)} className="w-24 min-h-10 bg-slate-50 border border-slate-200 rounded-lg px-2.5 text-xs" />
            <button type="button" onClick={crearPeriodo} className="min-h-10 px-3 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-semibold">Crear</button>
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {anio == null ? (
        <p className="text-slate-600">No hay períodos registrados. Cree el primero con el año fiscal del decreto vigente.</p>
      ) : (
        <form onSubmit={guardar} className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <EditorEscala titulo="Persona física con actividad lucrativa" id="renta-fisica" filas={form.escalaFisica} onChange={(f) => setForm(prev => ({ ...prev, escalaFisica: f }))} />
            <EditorEscala titulo="Persona jurídica — escala reducida" id="renta-juridica" filas={form.escalaJuridica} onChange={(f) => setForm(prev => ({ ...prev, escalaJuridica: f }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="renta-tope" className="block text-[11px] text-slate-600 mb-1">Tope de ingresos brutos para la escala reducida (₡)</label>
              <input id="renta-tope" type="number" min="1" step="1" inputMode="numeric" value={form.tope} onChange={(e) => setForm(prev => ({ ...prev, tope: e.target.value }))} className={campo} />
            </div>
            <div>
              <label htmlFor="renta-general" className="block text-[11px] text-slate-600 mb-1">Tarifa general persona jurídica sobre el tope (%)</label>
              <input id="renta-general" type="number" min="0" max="100" step="0.01" inputMode="decimal" value={form.tarifaGeneral} onChange={(e) => setForm(prev => ({ ...prev, tarifaGeneral: e.target.value }))} className={campo} />
            </div>
            <div>
              <label htmlFor="renta-referencia" className="block text-[11px] text-slate-600 mb-1">Referencia legal (decreto y publicación)</label>
              <input id="renta-referencia" type="text" maxLength={255} value={form.referencia} onChange={(e) => setForm(prev => ({ ...prev, referencia: e.target.value }))} placeholder="ej: Decreto Ejecutivo 45333-H" className={campo} />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-600">{actual?.actualizadoEn ? `Última actualización: ${new Date(actual.actualizadoEn).toLocaleString('es-CR')}` : 'Período aún no guardado.'}</span>
            <button type="submit" disabled={guardando} className="min-h-10 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-semibold disabled:opacity-60">
              {guardando ? 'Guardando…' : `Guardar tramos ${anio}`}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
