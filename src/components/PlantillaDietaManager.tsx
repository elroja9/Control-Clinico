import React, { useState } from 'react';
import { PlantillaDieta } from '../data/mockData';
import { DireccionPrescripcion } from '../utils/calorieFormulas';
import { Plus, X, Check } from 'lucide-react';
import { notify } from './ui/Feedback';

interface PlantillaDietaManagerProps {
  idCompania: number;
  plantillasDieta: PlantillaDieta[];
  onSavePlantillaDieta: (plantilla: PlantillaDieta) => void;
  onDeletePlantillaDieta: (id: number) => void;
  themeColor: string;
}

const ETIQUETAS_DIRECCION: Record<DireccionPrescripcion, string> = {
  DEFICIT: 'Déficit',
  MANTENIMIENTO: 'Mantenimiento',
  SUPERAVIT: 'Superávit'
};

export default function PlantillaDietaManager({ idCompania, plantillasDieta, onSavePlantillaDieta, onDeletePlantillaDieta, themeColor }: PlantillaDietaManagerProps) {
  const plantillasDeEstaEmpresa = plantillasDieta.filter(p => p.idCompania === idCompania);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState<DireccionPrescripcion>('DEFICIT');
  const [caloriaMin, setCaloriaMin] = useState('1200');
  const [caloriaMax, setCaloriaMax] = useState('1500');
  const [carbohidratosPct, setCarbohidratosPct] = useState('');
  const [proteinasPct, setProteinasPct] = useState('');
  const [grasasPct, setGrasasPct] = useState('');
  const [desayuno, setDesayuno] = useState('');
  const [meriendaManana, setMeriendaManana] = useState('');
  const [almuerzo, setAlmuerzo] = useState('');
  const [meriendaTarde, setMeriendaTarde] = useState('');
  const [cena, setCena] = useState('');
  const [indicaciones, setIndicaciones] = useState('');

  const limpiarFormulario = () => {
    setEditId(null);
    setNombre('');
    setDireccion('DEFICIT');
    setCaloriaMin('1200');
    setCaloriaMax('1500');
    setCarbohidratosPct('');
    setProteinasPct('');
    setGrasasPct('');
    setDesayuno('');
    setMeriendaManana('');
    setAlmuerzo('');
    setMeriendaTarde('');
    setCena('');
    setIndicaciones('');
  };

  const handleNueva = () => {
    limpiarFormulario();
    setIsFormOpen(true);
  };

  const handleEditar = (p: PlantillaDieta) => {
    setEditId(p.id);
    setNombre(p.nombre);
    setDireccion(p.direccion);
    setCaloriaMin(String(p.caloriaMin));
    setCaloriaMax(String(p.caloriaMax));
    setCarbohidratosPct(p.carbohidratosPct != null ? String(p.carbohidratosPct) : '');
    setProteinasPct(p.proteinasPct != null ? String(p.proteinasPct) : '');
    setGrasasPct(p.grasasPct != null ? String(p.grasasPct) : '');
    setDesayuno(p.desayuno);
    setMeriendaManana(p.meriendaManana);
    setAlmuerzo(p.almuerzo);
    setMeriendaTarde(p.meriendaTarde);
    setCena(p.cena);
    setIndicaciones(p.indicaciones);
    setIsFormOpen(true);
  };

  const handleGuardar = () => {
    if (!nombre.trim()) {
      notify.warning('Ingrese un nombre para la plantilla.');
      return;
    }
    const min = parseInt(caloriaMin);
    const max = parseInt(caloriaMax);
    if (isNaN(min) || isNaN(max) || min < 0 || max <= min) {
      notify.warning('El rango de calorías no es válido: el máximo debe ser mayor que el mínimo.');
      return;
    }
    const parsePct = (v: string): number | null => (v.trim() === '' ? null : parseInt(v));
    const carbPct = parsePct(carbohidratosPct);
    const protPct = parsePct(proteinasPct);
    const grasaPct = parsePct(grasasPct);
    const pctValores = [carbPct, protPct, grasaPct];
    if (pctValores.some(v => v != null && (isNaN(v) || v < 0 || v > 100))) {
      notify.warning('Cada porcentaje debe estar entre 0 y 100.');
      return;
    }
    if (pctValores.every(v => v != null) && pctValores.reduce((s, v) => s + (v as number), 0) !== 100) {
      notify.warning('Carbohidratos + proteínas + grasas deben sumar 100% cuando los tres tienen valor.');
      return;
    }
    onSavePlantillaDieta({
      id: editId ?? 0,
      idCompania,
      nombre,
      direccion,
      caloriaMin: min,
      caloriaMax: max,
      carbohidratosPct: carbPct,
      proteinasPct: protPct,
      grasasPct: grasaPct,
      desayuno,
      meriendaManana,
      almuerzo,
      meriendaTarde,
      cena,
      indicaciones
    });
    setIsFormOpen(false);
    limpiarFormulario();
  };

  const sumaPct = (carbohidratosPct === '' ? 0 : parseInt(carbohidratosPct) || 0)
    + (proteinasPct === '' ? 0 : parseInt(proteinasPct) || 0)
    + (grasasPct === '' ? 0 : parseInt(grasasPct) || 0);
  const todosLosPctLlenos = carbohidratosPct !== '' && proteinasPct !== '' && grasasPct !== '';

  return (
    <div className="mt-5 p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
        <div>
          <h4 className="font-bold text-slate-800">Plantillas de Dieta</h4>
          <p className="text-[11px] text-slate-500">Se sugieren automáticamente en la calculadora cuando el rango de calorías y el objetivo coinciden.</p>
        </div>
        {!isFormOpen && (
          <button
            type="button"
            onClick={handleNueva}
            className="text-white px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1"
            style={{ backgroundColor: themeColor }}
          >
            <Plus className="w-3.5 h-3.5" /> Nueva Plantilla
          </button>
        )}
      </div>

      {!isFormOpen && (
        <div className="space-y-2">
          {plantillasDeEstaEmpresa.length === 0 && (
            <p className="text-slate-500">Sin plantillas configuradas todavía.</p>
          )}
          {plantillasDeEstaEmpresa.map(p => (
            <div key={p.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-2.5">
              <div>
                <div className="font-semibold text-slate-700">{p.nombre} — {ETIQUETAS_DIRECCION[p.direccion]}</div>
                <div className="text-[11px] text-slate-500">{p.caloriaMin}-{p.caloriaMax} kcal · Carbohidratos {p.carbohidratosPct ?? '—'}% · Proteínas {p.proteinasPct ?? '—'}% · Grasas {p.grasasPct ?? '—'}%</div>
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={() => handleEditar(p)} className="text-slate-500 hover:text-teal-600 px-2 py-1">Editar</button>
                <button type="button" onClick={() => onDeletePlantillaDieta(p.id)} className="text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-full p-2" title="Eliminar" aria-label="Eliminar">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isFormOpen && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="plantillad-nombre" className="block text-slate-600 font-semibold mb-1">Nombre</label>
              <input id="plantillad-nombre" type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej: Déficit clásico 1500-1800" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
            </div>
            <div>
              <label htmlFor="plantillad-objetivo" className="block text-slate-600 font-semibold mb-1">Objetivo</label>
              <select id="plantillad-objetivo" value={direccion} onChange={(e) => setDireccion(e.target.value as DireccionPrescripcion)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <option value="DEFICIT">Déficit</option>
                <option value="MANTENIMIENTO">Mantenimiento</option>
                <option value="SUPERAVIT">Superávit</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="plantillad-kcal-min" className="block text-slate-600 font-semibold mb-1">Kcal mín.</label>
                <input id="plantillad-kcal-min" type="number" min={0} step={50} value={caloriaMin} onChange={(e) => setCaloriaMin(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
              </div>
              <div>
                <label htmlFor="plantillad-kcal-max" className="block text-slate-600 font-semibold mb-1">Kcal máx.</label>
                <input id="plantillad-kcal-max" type="number" min={0} step={50} value={caloriaMax} onChange={(e) => setCaloriaMax(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
              </div>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="plantillad-carbohidratos" className="block text-slate-600 font-semibold mb-1">Carbohidratos (%)</label>
                <input id="plantillad-carbohidratos" type="number" min={0} max={100} value={carbohidratosPct} onChange={(e) => setCarbohidratosPct(e.target.value)} placeholder="ej: 40" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
              </div>
              <div>
                <label htmlFor="plantillad-proteinas" className="block text-slate-600 font-semibold mb-1">Proteínas (%)</label>
                <input id="plantillad-proteinas" type="number" min={0} max={100} value={proteinasPct} onChange={(e) => setProteinasPct(e.target.value)} placeholder="ej: 35" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
              </div>
              <div>
                <label htmlFor="plantillad-grasas" className="block text-slate-600 font-semibold mb-1">Grasas (%)</label>
                <input id="plantillad-grasas" type="number" min={0} max={100} value={grasasPct} onChange={(e) => setGrasasPct(e.target.value)} placeholder="ej: 25" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
              </div>
            </div>
            {(carbohidratosPct !== '' || proteinasPct !== '' || grasasPct !== '') && (
              <p className={`text-[11px] mt-1 font-semibold ${todosLosPctLlenos && sumaPct !== 100 ? 'text-rose-600' : 'text-slate-500'}`}>
                Suma actual: {sumaPct}% {todosLosPctLlenos ? (sumaPct === 100 ? <Check className="inline w-3.5 h-3.5 text-emerald-600 align-text-bottom" aria-label="correcto" /> : '(debe sumar 100%)') : '(opcional dejar campos en blanco)'}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div>
              <label htmlFor="plantillad-desayuno" className="block text-slate-600 font-semibold mb-1">Desayuno</label>
              <textarea id="plantillad-desayuno" rows={2} value={desayuno} onChange={(e) => setDesayuno(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
            </div>
            <div>
              <label htmlFor="plantillad-merienda-de-la-manana" className="block text-slate-600 font-semibold mb-1">Merienda de la mañana</label>
              <textarea id="plantillad-merienda-de-la-manana" rows={1} value={meriendaManana} onChange={(e) => setMeriendaManana(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
            </div>
            <div>
              <label htmlFor="plantillad-almuerzo" className="block text-slate-600 font-semibold mb-1">Almuerzo</label>
              <textarea id="plantillad-almuerzo" rows={2} value={almuerzo} onChange={(e) => setAlmuerzo(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
            </div>
            <div>
              <label htmlFor="plantillad-merienda-de-la-tarde" className="block text-slate-600 font-semibold mb-1">Merienda de la tarde</label>
              <textarea id="plantillad-merienda-de-la-tarde" rows={1} value={meriendaTarde} onChange={(e) => setMeriendaTarde(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
            </div>
            <div>
              <label htmlFor="plantillad-cena" className="block text-slate-600 font-semibold mb-1">Cena</label>
              <textarea id="plantillad-cena" rows={2} value={cena} onChange={(e) => setCena(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
            </div>
            <div>
              <label htmlFor="plantillad-indicaciones" className="block text-slate-600 font-semibold mb-1">Indicaciones</label>
              <textarea id="plantillad-indicaciones" rows={2} value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
            </div>
          </div>

          <div className="flex gap-2">
            <button type="button" onClick={handleGuardar} className="text-white px-3 py-1.5 rounded-lg font-semibold" style={{ backgroundColor: themeColor }}>
              Guardar Plantilla
            </button>
            <button type="button" onClick={() => { setIsFormOpen(false); limpiarFormulario(); }} className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-lg font-semibold">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
