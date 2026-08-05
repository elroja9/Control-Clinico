import React, { useState } from 'react';
import { PlantillaDieta } from '../data/mockData';
import { DireccionPrescripcion } from '../utils/calorieFormulas';
import { Plus, X } from 'lucide-react';

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
  const [carbohidratosG, setCarbohidratosG] = useState('');
  const [proteinasG, setProteinasG] = useState('');
  const [grasasG, setGrasasG] = useState('');
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
    setCarbohidratosG('');
    setProteinasG('');
    setGrasasG('');
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
    setCarbohidratosG(String(p.carbohidratosG));
    setProteinasG(String(p.proteinasG));
    setGrasasG(String(p.grasasG));
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
      alert('Ingrese un nombre para la plantilla.');
      return;
    }
    const min = parseInt(caloriaMin);
    const max = parseInt(caloriaMax);
    if (isNaN(min) || isNaN(max) || min < 0 || max <= min) {
      alert('El rango de calorías no es válido (el máximo debe ser mayor que el mínimo).');
      return;
    }
    onSavePlantillaDieta({
      id: editId ?? 0,
      idCompania,
      nombre,
      direccion,
      caloriaMin: min,
      caloriaMax: max,
      carbohidratosG: parseInt(carbohidratosG) || 0,
      proteinasG: parseInt(proteinasG) || 0,
      grasasG: parseInt(grasasG) || 0,
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

  return (
    <div className="mt-5 p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
        <div>
          <h4 className="font-bold text-slate-800">Plantillas de Dieta</h4>
          <p className="text-[10px] text-slate-500">Se sugieren automáticamente en la calculadora cuando el rango de calorías y el objetivo coinciden.</p>
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
            <p className="text-slate-400">Sin plantillas configuradas todavía.</p>
          )}
          {plantillasDeEstaEmpresa.map(p => (
            <div key={p.id} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg p-2.5">
              <div>
                <div className="font-semibold text-slate-700">{p.nombre} — {ETIQUETAS_DIRECCION[p.direccion]}</div>
                <div className="text-[10px] text-slate-500">{p.caloriaMin}-{p.caloriaMax} kcal · Carbohidratos {p.carbohidratosG}g · Proteínas {p.proteinasG}g · Grasas {p.grasasG}g</div>
              </div>
              <div className="flex gap-1">
                <button type="button" onClick={() => handleEditar(p)} className="text-slate-500 hover:text-teal-600 px-2 py-1">Editar</button>
                <button type="button" onClick={() => onDeletePlantillaDieta(p.id)} className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full p-1" title="Eliminar">
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
              <label className="block text-slate-600 font-semibold mb-1">Nombre</label>
              <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="ej: Déficit clásico 1500-1800" className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Objetivo</label>
              <select value={direccion} onChange={(e) => setDireccion(e.target.value as DireccionPrescripcion)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <option value="DEFICIT">Déficit</option>
                <option value="MANTENIMIENTO">Mantenimiento</option>
                <option value="SUPERAVIT">Superávit</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Kcal mín.</label>
                <input type="number" min={0} step={50} value={caloriaMin} onChange={(e) => setCaloriaMin(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Kcal máx.</label>
                <input type="number" min={0} step={50} value={caloriaMax} onChange={(e) => setCaloriaMax(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Carbohidratos (g)</label>
              <input type="number" min={0} value={carbohidratosG} onChange={(e) => setCarbohidratosG(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Proteínas (g)</label>
              <input type="number" min={0} value={proteinasG} onChange={(e) => setProteinasG(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Grasas (g)</label>
              <input type="number" min={0} value={grasasG} onChange={(e) => setGrasasG(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
            </div>
          </div>

          <div className="space-y-2">
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Desayuno</label>
              <textarea rows={2} value={desayuno} onChange={(e) => setDesayuno(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Merienda de la mañana</label>
              <textarea rows={1} value={meriendaManana} onChange={(e) => setMeriendaManana(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Almuerzo</label>
              <textarea rows={2} value={almuerzo} onChange={(e) => setAlmuerzo(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Merienda de la tarde</label>
              <textarea rows={1} value={meriendaTarde} onChange={(e) => setMeriendaTarde(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Cena</label>
              <textarea rows={2} value={cena} onChange={(e) => setCena(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
            </div>
            <div>
              <label className="block text-slate-600 font-semibold mb-1">Indicaciones</label>
              <textarea rows={2} value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5" />
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
