import React, { useState } from 'react';
import { PlantillaDieta } from '../data/mockData';
import { DireccionPrescripcion } from '../utils/calorieFormulas';
import { Plus, X, Check } from 'lucide-react';
import { notify } from './ui/Feedback';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { EmptyState } from './ui/EmptyState';
import { Field } from './ui/Field';
import { IconButton } from './ui/IconButton';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Textarea } from './ui/Textarea';

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
    <div className="mt-5 p-5 sm:p-6 bg-surface-muted border border-border rounded-panel space-y-4 text-body" style={{ '--brand': themeColor } as React.CSSProperties}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <h4 className="text-heading font-semibold tracking-tight text-fg">Plantillas de Dieta</h4>
          <p className="text-body text-fg-muted">Se sugieren automáticamente en la calculadora cuando el rango de calorías y el objetivo coinciden.</p>
        </div>
        {!isFormOpen && (
          <Button onClick={handleNueva} icon={<Plus className="w-4 h-4" aria-hidden="true" />}>
            Nueva Plantilla
          </Button>
        )}
      </div>

      {!isFormOpen && (
        <div className="space-y-2.5">
          {plantillasDeEstaEmpresa.length === 0 && (
            <EmptyState
              icon={<Plus />}
              title="Sin plantillas configuradas todavía"
              description="Cree una plantilla para sugerirla automáticamente según el objetivo y el rango de calorías."
            />
          )}
          {plantillasDeEstaEmpresa.map(p => (
            <div key={p.id} className="flex items-center justify-between gap-3 bg-surface border border-border rounded-card shadow-xs p-4">
              <div className="min-w-0">
                <div className="font-semibold text-fg flex flex-wrap items-center gap-2">
                  {p.nombre}
                  <Badge tone="brand">{ETIQUETAS_DIRECCION[p.direccion]}</Badge>
                </div>
                <div className="mt-1 text-xs text-fg-muted">{p.caloriaMin}-{p.caloriaMax} kcal · Carbohidratos {p.carbohidratosPct ?? '—'}% · Proteínas {p.proteinasPct ?? '—'}% · Grasas {p.grasasPct ?? '—'}%</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => handleEditar(p)}>Editar</Button>
                <IconButton label="Eliminar" icon={<X className="w-4 h-4" aria-hidden="true" />} className="hover:text-danger hover:bg-danger-soft" onClick={() => onDeletePlantillaDieta(p.id)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {isFormOpen && (
        <div className="bg-surface border border-border rounded-card shadow-xs p-4 sm:p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label="Nombre">
              <Input type="text" value={nombre} onChange={(e: any) => setNombre(e.target.value)} placeholder="ej: Déficit clásico 1500-1800" />
            </Field>
            <Field label="Objetivo">
              <Select value={direccion} onChange={(e: any) => setDireccion(e.target.value as DireccionPrescripcion)}>
                <option value="DEFICIT">Déficit</option>
                <option value="MANTENIMIENTO">Mantenimiento</option>
                <option value="SUPERAVIT">Superávit</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kcal mín.">
                <Input type="number" min={0} step={50} value={caloriaMin} onChange={(e: any) => setCaloriaMin(e.target.value)} />
              </Field>
              <Field label="Kcal máx.">
                <Input type="number" min={0} step={50} value={caloriaMax} onChange={(e: any) => setCaloriaMax(e.target.value)} />
              </Field>
            </div>
          </div>

          <div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Carbohidratos (%)">
                <Input type="number" min={0} max={100} value={carbohidratosPct} onChange={(e: any) => setCarbohidratosPct(e.target.value)} placeholder="ej: 40" />
              </Field>
              <Field label="Proteínas (%)">
                <Input type="number" min={0} max={100} value={proteinasPct} onChange={(e: any) => setProteinasPct(e.target.value)} placeholder="ej: 35" />
              </Field>
              <Field label="Grasas (%)">
                <Input type="number" min={0} max={100} value={grasasPct} onChange={(e: any) => setGrasasPct(e.target.value)} placeholder="ej: 25" />
              </Field>
            </div>
            {(carbohidratosPct !== '' || proteinasPct !== '' || grasasPct !== '') && (
              <p className={`text-xs mt-2 font-semibold ${todosLosPctLlenos && sumaPct !== 100 ? 'text-danger' : 'text-fg-muted'}`} aria-live="polite">
                Suma actual: {sumaPct}% {todosLosPctLlenos ? (sumaPct === 100 ? <Check className="inline w-3.5 h-3.5 text-success align-text-bottom" aria-label="correcto" /> : '(debe sumar 100%)') : '(opcional dejar campos en blanco)'}
              </p>
            )}
          </div>

          <div className="space-y-4">
            <Field label="Desayuno">
              <Textarea rows={2} value={desayuno} onChange={(e: any) => setDesayuno(e.target.value)} />
            </Field>
            <Field label="Merienda de la mañana">
              <Textarea rows={1} value={meriendaManana} onChange={(e: any) => setMeriendaManana(e.target.value)} />
            </Field>
            <Field label="Almuerzo">
              <Textarea rows={2} value={almuerzo} onChange={(e: any) => setAlmuerzo(e.target.value)} />
            </Field>
            <Field label="Merienda de la tarde">
              <Textarea rows={1} value={meriendaTarde} onChange={(e: any) => setMeriendaTarde(e.target.value)} />
            </Field>
            <Field label="Cena">
              <Textarea rows={2} value={cena} onChange={(e: any) => setCena(e.target.value)} />
            </Field>
            <Field label="Indicaciones">
              <Textarea rows={2} value={indicaciones} onChange={(e: any) => setIndicaciones(e.target.value)} />
            </Field>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-1">
            <Button variant="secondary" onClick={() => { setIsFormOpen(false); limpiarFormulario(); }}>
              Cancelar
            </Button>
            <Button onClick={handleGuardar}>
              Guardar Plantilla
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
