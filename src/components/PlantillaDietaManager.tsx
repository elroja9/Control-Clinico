import React, { useState } from 'react';
import { PlantillaDieta } from '../data/mockData';
import { DireccionPrescripcion } from '../utils/calorieFormulas';
import { Plus, X, Check, Edit } from 'lucide-react';
import { notify } from './ui/Feedback';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Card, CardBody, CardHeader } from './ui/Card';
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
    // Tarjeta propia con lista de divisores: antes era un panel gris con tarjetas dentro (tarjetas anidadas en móvil).
    <Card className="text-body" style={{ '--brand': themeColor } as React.CSSProperties}>
      <CardHeader
        title="Plantillas de dieta"
        description="Se sugieren automáticamente en la calculadora cuando el rango de calorías y el objetivo coinciden."
        actions={!isFormOpen ? (
          <Button size="sm" onClick={handleNueva} icon={<Plus className="w-4 h-4" aria-hidden="true" />}>
            Nueva plantilla
          </Button>
        ) : undefined}
      />

      {!isFormOpen && plantillasDeEstaEmpresa.length === 0 && (
        <CardBody>
          <EmptyState
            icon={<Plus />}
            title="Sin plantillas configuradas todavía"
            description="Cree una plantilla para sugerirla automáticamente según el objetivo y el rango de calorías."
          />
        </CardBody>
      )}

      {!isFormOpen && plantillasDeEstaEmpresa.length > 0 && (
        <ul className="divide-y divide-border">
          {plantillasDeEstaEmpresa.map(p => (
            <li key={p.id} className="flex items-center gap-2 px-4 sm:px-6 py-3">
              <div className="flex-1 min-w-0">
                <span className="block font-semibold text-fg break-words">{p.nombre}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge tone="brand">{ETIQUETAS_DIRECCION[p.direccion]}</Badge>
                  <span className="text-xs font-semibold text-fg">{p.caloriaMin}-{p.caloriaMax} kcal</span>
                </span>
                <span className="mt-1 block text-xs text-fg-muted break-words">
                  Carbohidratos {p.carbohidratosPct ?? '—'}% · Proteínas {p.proteinasPct ?? '—'}% · Grasas {p.grasasPct ?? '—'}%
                </span>
              </div>
              <IconButton label={`Editar ${p.nombre}`} icon={<Edit className="w-4 h-4" aria-hidden="true" />} onClick={() => handleEditar(p)} />
              <IconButton label={`Eliminar ${p.nombre}`} icon={<X className="w-4 h-4" aria-hidden="true" />} className="hover:text-danger! hover:bg-danger-soft!" onClick={() => onDeletePlantillaDieta(p.id)} />
            </li>
          ))}
        </ul>
      )}

      {isFormOpen && (
        <CardBody className="space-y-5">
          {/* Nombre y objetivo a ancho completo en el iPhone; las kcal (cortas) lado a lado. */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <Field label="Nombre" className="col-span-2 sm:col-span-1">
              <Input type="text" value={nombre} onChange={(e: any) => setNombre(e.target.value)} placeholder="ej: Déficit clásico 1500-1800" />
            </Field>
            <Field label="Objetivo" className="col-span-2 sm:col-span-1">
              <Select value={direccion} onChange={(e: any) => setDireccion(e.target.value as DireccionPrescripcion)}>
                <option value="DEFICIT">Déficit</option>
                <option value="MANTENIMIENTO">Mantenimiento</option>
                <option value="SUPERAVIT">Superávit</option>
              </Select>
            </Field>
            <div className="col-span-2 sm:col-span-1 grid grid-cols-2 gap-3">
              <Field label="Kcal mín.">
                <Input type="number" min={0} step={50} inputMode="numeric" value={caloriaMin} onChange={(e: any) => setCaloriaMin(e.target.value)} />
              </Field>
              <Field label="Kcal máx.">
                <Input type="number" min={0} step={50} inputMode="numeric" value={caloriaMax} onChange={(e: any) => setCaloriaMax(e.target.value)} />
              </Field>
            </div>
          </div>

          <div>
            {/* 3 columnas también en el iPhone; items-end alinea los campos si una etiqueta baja de línea. */}
            <div className="grid grid-cols-3 items-end gap-3 sm:gap-4">
              <Field label="Carbohidratos (%)">
                <Input type="number" min={0} max={100} inputMode="numeric" value={carbohidratosPct} onChange={(e: any) => setCarbohidratosPct(e.target.value)} placeholder="ej: 40" />
              </Field>
              <Field label="Proteínas (%)">
                <Input type="number" min={0} max={100} inputMode="numeric" value={proteinasPct} onChange={(e: any) => setProteinasPct(e.target.value)} placeholder="ej: 35" />
              </Field>
              <Field label="Grasas (%)">
                <Input type="number" min={0} max={100} inputMode="numeric" value={grasasPct} onChange={(e: any) => setGrasasPct(e.target.value)} placeholder="ej: 25" />
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

          {/* En móvil las acciones quedan fijas abajo (sobre la barra de inicio de iOS), como el formulario de servicio. */}
          <div className="sticky bottom-0 z-10 -mx-4 sm:mx-0 px-4 sm:px-0 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:pb-0 bg-surface/95 sm:bg-transparent backdrop-blur-sm sm:backdrop-blur-none border-t border-border sm:border-0 flex gap-2 sm:justify-end [&>*]:flex-1 sm:[&>*]:flex-none print:hidden">
            <Button variant="outline" onClick={() => { setIsFormOpen(false); limpiarFormulario(); }}>
              Cancelar
            </Button>
            <Button onClick={handleGuardar}>
              Guardar plantilla
            </Button>
          </div>
        </CardBody>
      )}
    </Card>
  );
}
