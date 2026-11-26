import React, { useEffect, useState } from 'react';
import { Scale, Plus, Trash2, AlertCircle } from 'lucide-react';
import { notify } from './ui/Feedback';
import { Button, Card, CardBody, CardFooter, CardHeader, IconButton, Input, Select } from './ui';

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

const etiqueta = 'block text-xs font-semibold text-fg mb-1.5';

function EditorEscala({ titulo, id, filas, onChange }: { titulo: string; id: string; filas: FilaForm[]; onChange: (f: FilaForm[]) => void }) {
  const cambiar = (i: number, k: keyof FilaForm, v: string) => onChange(filas.map((f, j) => (j === i ? { ...f, [k]: v } : f)));
  return (
    // Grupo con fondo sutil; en móvil ocupa el ancho de la tarjeta (sin recuadro anidado).
    // role="group" + título en lugar de fieldset/legend: la leyenda sin borde quedaba montada en el borde superior.
    <div role="group" aria-labelledby={`${id}-titulo`} className="min-w-0 -mx-4 sm:mx-0 px-4 py-4 sm:p-4 bg-surface-muted/40 border-y sm:border border-border sm:rounded-card space-y-3">
      <h4 id={`${id}-titulo`} className="text-xs font-semibold uppercase tracking-wide text-fg-muted">{titulo}</h4>
      {filas.map((f, i) => {
        const ultimo = i === filas.length - 1;
        return (
          // Tope flexible, tasa fija y 44px para el botón de quitar (con 12 columnas el botón no cabía a 360px).
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_6.5rem_2.75rem] gap-2 items-end">
            <div className="min-w-0">
              <label htmlFor={`${id}-tope-${i}`} className={etiqueta}>{ultimo ? 'Último tramo (sin tope)' : `Hasta (₡) — tramo ${i + 1}`}</label>
              <Input id={`${id}-tope-${i}`} type="number" min="0" step="1" inputMode="numeric" disabled={ultimo} value={ultimo ? '' : f.tope} placeholder={ultimo ? 'Todo el exceso' : ''} onChange={(e) => cambiar(i, 'tope', e.target.value)} />
            </div>
            <div className="min-w-0">
              <label htmlFor={`${id}-tasa-${i}`} className={etiqueta}>Tasa (%)</label>
              <Input id={`${id}-tasa-${i}`} type="number" min="0" max="100" step="0.01" inputMode="decimal" value={f.tasa} onChange={(e) => cambiar(i, 'tasa', e.target.value)} />
            </div>
            <div className="flex justify-end">
              {filas.length > 1 && (
                <IconButton
                  label={`Quitar tramo ${i + 1} de ${titulo}`}
                  variant="ghost"
                  className="text-danger! hover:bg-danger-soft!"
                  icon={<Trash2 className="w-4 h-4" aria-hidden="true" />}
                  onClick={() => onChange(filas.filter((_, j) => j !== i))}
                />
              )}
            </div>
          </div>
        );
      })}
      <Button
        variant="ghost"
        size="sm"
        className="text-brand-ink!"
        icon={<Plus className="w-4 h-4" aria-hidden="true" />}
        onClick={() => onChange([...filas.slice(0, -1), { tope: '', tasa: '' }, filas[filas.length - 1]])}
      >
        Agregar tramo intermedio
      </Button>
    </div>
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
    <Card className="mt-6">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Scale className="w-5 h-5 text-brand-ink" aria-hidden="true" />
            Tramos del Impuesto sobre la Renta (D-101)
          </span>
        }
        description="Uno por período fiscal; los usa el D-101 de todas las empresas. Actualícelos cuando Hacienda publique el decreto anual."
      />

      <CardBody className="space-y-5">
        {/* En móvil cada control ocupa su fila (sin desbordar); desde sm van lado a lado. */}
        <div className="flex flex-wrap items-end gap-3 sm:gap-4">
          <div className="flex-1 min-w-36 sm:flex-none">
            <label htmlFor="renta-periodo" className={etiqueta}>Período fiscal</label>
            <Select id="renta-periodo" value={anio ?? ''} onChange={(e) => elegir(parseInt(e.target.value))} wrapperClassName="min-w-36">
              {anio != null && !periodos.some(p => p.anio === anio) && <option value={anio}>{anio} (nuevo, sin guardar)</option>}
              {periodos.map(p => <option key={p.anio} value={p.anio}>{p.anio}</option>)}
            </Select>
          </div>
          <div className="flex-1 min-w-48 sm:flex-none">
            <label htmlFor="renta-nuevo" className={etiqueta}>Nuevo período</label>
            <div className="flex gap-2">
              <Input id="renta-nuevo" type="number" min="2000" max="2100" inputMode="numeric" placeholder="Año" value={nuevoAnio} onChange={(e) => setNuevoAnio(e.target.value)} wrapperClassName="flex-1 min-w-0 sm:flex-none sm:w-28" />
              <Button variant="secondary" onClick={crearPeriodo}>Crear</Button>
            </div>
          </div>
        </div>

        {error && (
          <div role="alert" className="p-3 rounded-control bg-danger-soft border border-danger/20 text-danger text-sm flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span className="min-w-0 break-words">{error}</span>
          </div>
        )}

        {anio == null ? (
          <p className="text-sm text-fg-muted">No hay períodos registrados. Cree el primero con el año fiscal del decreto vigente.</p>
        ) : (
          <form id="renta-form" onSubmit={guardar} className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <EditorEscala titulo="Persona física con actividad lucrativa" id="renta-fisica" filas={form.escalaFisica} onChange={(f) => setForm(prev => ({ ...prev, escalaFisica: f }))} />
              <EditorEscala titulo="Persona jurídica — escala reducida" id="renta-juridica" filas={form.escalaJuridica} onChange={(f) => setForm(prev => ({ ...prev, escalaJuridica: f }))} />
            </div>
            {/* Tope y tarifa (números cortos) lado a lado en el iPhone; la referencia a ancho completo. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="min-w-0">
                <label htmlFor="renta-tope" className={etiqueta}>Tope (₡)</label>
                <Input id="renta-tope" aria-describedby="renta-tope-ayuda" type="number" min="1" step="1" inputMode="numeric" value={form.tope} onChange={(e) => setForm(prev => ({ ...prev, tope: e.target.value }))} />
                <p id="renta-tope-ayuda" className="mt-1.5 text-xs text-fg-muted">Ingresos brutos máximos de la escala reducida.</p>
              </div>
              <div className="min-w-0">
                <label htmlFor="renta-general" className={etiqueta}>Tarifa general (%)</label>
                <Input id="renta-general" aria-describedby="renta-general-ayuda" type="number" min="0" max="100" step="0.01" inputMode="decimal" value={form.tarifaGeneral} onChange={(e) => setForm(prev => ({ ...prev, tarifaGeneral: e.target.value }))} />
                <p id="renta-general-ayuda" className="mt-1.5 text-xs text-fg-muted">Persona jurídica, sobre el tope.</p>
              </div>
              <div className="min-w-0 col-span-2 sm:col-span-1">
                <label htmlFor="renta-referencia" className={etiqueta}>Referencia legal</label>
                <Input id="renta-referencia" aria-describedby="renta-referencia-ayuda" type="text" maxLength={255} value={form.referencia} onChange={(e) => setForm(prev => ({ ...prev, referencia: e.target.value }))} placeholder="ej: Decreto Ejecutivo 45333-H" />
                <p id="renta-referencia-ayuda" className="mt-1.5 text-xs text-fg-muted">Decreto y publicación.</p>
              </div>
            </div>
          </form>
        )}
      </CardBody>

      {anio != null && (
        // En móvil el pie queda fijo abajo (sobre la barra de inicio de iOS) mientras se edita la tarjeta.
        <CardFooter className="justify-between flex-wrap max-sm:sticky max-sm:bottom-0 max-sm:z-10 max-sm:bg-surface-muted! max-sm:pb-[calc(1rem+env(safe-area-inset-bottom,0px))]!">
          <span className="min-w-0 text-xs text-fg-muted">{actual?.actualizadoEn ? `Última actualización: ${new Date(actual.actualizadoEn).toLocaleString('es-CR')}` : 'Período aún no guardado.'}</span>
          <Button type="submit" form="renta-form" loading={guardando}>
            {guardando ? 'Guardando…' : (
              <>
                <span className="sm:hidden">Guardar {anio}</span>
                <span className="hidden sm:inline">Guardar tramos {anio}</span>
              </>
            )}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
