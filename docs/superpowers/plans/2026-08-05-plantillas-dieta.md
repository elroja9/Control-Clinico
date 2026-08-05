# Plantillas de Dieta por Rango de Calorías y Objetivo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a cada empresa de nutrición una biblioteca de plantillas de dieta (menú + macros en gramos) indexadas por rango de calorías y objetivo (Déficit/Mantenimiento/Superávit), que la calculadora de `ConsultationForm.tsx` sugiera automáticamente una vez calculada la prescripción, con un recordatorio de alergias/alimentos no deseados del paciente.

**Architecture:** Sigue exactamente el mismo patrón dual (MySQL/`local*` en memoria) y de wiring (`App.tsx` → props → componente) ya usado para `PorcentajeDieta` en el feature anterior. La única pieza nueva de UI es `PlantillaDietaManager.tsx`, extraído como componente propio porque una plantilla tiene ~10 campos y `CompanySettings.tsx` ya es grande.

**Tech Stack:** React + TypeScript (frontend), Express + MySQL vía `mysql2` (backend). Sin cambios a `calorieFormulas.ts` — se reutiliza `DireccionPrescripcion` tal cual.

## Global Constraints

- El objetivo (`direccion`) de una plantilla usa exactamente los mismos 3 valores que ya existen: `'DEFICIT' | 'MANTENIMIENTO' | 'SUPERAVIT'` (tipo `DireccionPrescripcion` de `src/utils/calorieFormulas.ts`) — no se agregan categorías nuevas.
- El rango `[caloriaMin, caloriaMax]` es **inclusivo** en ambos extremos al hacer el match contra `prescripcionFinal`.
- Los macros se ingresan y almacenan **en gramos**, nunca en porcentaje — el % que se muestra en la calculadora es solo derivado para lectura (`% = gramos × kcal_por_gramo / prescripcionFinal × 100`, con 4 kcal/g para carbohidratos y proteínas, 9 kcal/g para grasas), nunca se persiste.
- `POST`/`DELETE /api/plantillas-dieta` requieren rol Administrador (o SaaS admin) desde el primer commit — no reabrir el hueco de autorización que se corrigió para `/api/porcentajes-dieta` en el feature anterior. `GET` se mantiene abierto a cualquier usuario autenticado de la empresa.
- Todos los campos de menú/macros aplicados a una consulta (`desayuno`, `almuerzo`, etc., y los 3 macros) siguen siendo libremente editables después de aplicar una plantilla — nunca `disabled`/`readOnly`.
- Este repo no tiene framework de pruebas de componentes; se verifica con `npx tsc --noEmit -p .` (debe pasar sin salida) en cada tarea, más `npx vitest run` para confirmar que las 16 pruebas existentes de `calorieFormulas.ts` siguen pasando (ningún archivo de ese módulo se toca en este plan, así que es un chequeo de no-regresión, no un requisito nuevo).
- El servidor de producción (`pm2` proceso `control-clinico`, puerto 3000) corre contra una base de datos MySQL remota real. No ejecutar nada que reinicie servicios sin confirmación explícita del usuario — dejar el despliegue (`npm run build && pm2 restart control-clinico`) para el final, fuera de las tareas del plan, y solo con aprobación.

---

## Task 1: Tipos nuevos en `mockData.ts`

**Files:**
- Modify: `src/data/mockData.ts:658` (después de `defaultPorcentajesDieta`)
- Modify: `src/data/mockData.ts:176-195` (`Consultation.dieta`)

**Interfaces:**
- Consumes: `DireccionPrescripcion` (ya importado en la línea 2 del archivo).
- Produces: `PlantillaDieta`, `defaultPlantillasDieta`, `Consultation.dieta.macros`. Las tareas 2-6 dependen de estos tipos.

- [ ] **Step 1: Agregar `PlantillaDieta`**

En `src/data/mockData.ts`, justo después de la línea:

```typescript
export const defaultPorcentajesDieta: PorcentajeDieta[] = [];
```

(línea 658) agregar:

```typescript

export interface PlantillaDieta {
  id: number;
  idCompania: number;
  nombre: string;
  direccion: DireccionPrescripcion;
  caloriaMin: number;
  caloriaMax: number;
  carbohidratosG: number;
  proteinasG: number;
  grasasG: number;
  desayuno: string;
  meriendaManana: string;
  almuerzo: string;
  meriendaTarde: string;
  cena: string;
  indicaciones: string;
}

export const defaultPlantillasDieta: PlantillaDieta[] = [];
```

- [ ] **Step 2: Agregar `macros` a `Consultation.dieta`**

En `src/data/mockData.ts:176-195`, el bloque actual es:

```typescript
  dieta?: {
    totalCalorias: number;
    desayuno: string;
    meriendaManana: string;
    almuerzo: string;
    meriendaTarde: string;
    cena: string;
    indicaciones: string;
    prescripcionCalorica?: {
      formula: FormulaTMB;
      tmb: number;
      diasDescanso: number;
      diasEntrenamiento: number;
      factorActividadDescanso: number;
      factorActividadEntreno: number;
      promedioMantenimiento: number;
      direccion: DireccionPrescripcion;
      porcentaje: number;
    };
  };
```

Reemplazar por (se agrega `macros` después de `prescripcionCalorica`):

```typescript
  dieta?: {
    totalCalorias: number;
    desayuno: string;
    meriendaManana: string;
    almuerzo: string;
    meriendaTarde: string;
    cena: string;
    indicaciones: string;
    prescripcionCalorica?: {
      formula: FormulaTMB;
      tmb: number;
      diasDescanso: number;
      diasEntrenamiento: number;
      factorActividadDescanso: number;
      factorActividadEntreno: number;
      promedioMantenimiento: number;
      direccion: DireccionPrescripcion;
      porcentaje: number;
    };
    macros?: {
      carbohidratosG: number;
      proteinasG: number;
      grasasG: number;
    };
  };
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit -p .`
Expected: sin salida.

- [ ] **Step 4: Commit**

```bash
git add src/data/mockData.ts
git commit -m "$(cat <<'EOF'
Add PlantillaDieta type and Consultation.dieta.macros

Groundwork for per-company diet templates matched by calorie
range/objective; no behavior change yet.
EOF
)"
```

---

## Task 2: Tabla y endpoints de `plantillas_dieta` (backend)

**Files:**
- Modify: `server.ts:41` (import de tipos)
- Modify: `server.ts:44-57` (import de defaults)
- Modify: `server.ts:76` (arrays en memoria)
- Modify: `server.ts:512-518` (creación de tabla, justo antes de `compania_porcentajes_dieta`... en realidad justo después)
- Modify: `server.ts:1984-1985` (nuevos endpoints, después de `DELETE /api/porcentajes-dieta/:id`)

**Interfaces:**
- Consumes: `PlantillaDieta`, `defaultPlantillasDieta` de Task 1.
- Produces: `GET /api/plantillas-dieta`, `POST /api/plantillas-dieta`, `DELETE /api/plantillas-dieta/:id` — consumidos por `App.tsx` en Task 5.

- [ ] **Step 1: Importar el tipo y el default**

En `server.ts:41`:

```typescript
import type { Company, Patient, Cita, Consultation, CalendarBlock, CompanyPayment, HorarioAtencion, Servicio, Factura, CuentaCobrar, PagoCuentaCobrar, Proveedor, CuentaPagar, PagoCuentaPagar, ReporteD104, ReporteD101, GastosManualesAnuales, PorcentajeDieta } from "./src/data/mockData";
```

Reemplazar por (se agrega `PlantillaDieta`):

```typescript
import type { Company, Patient, Cita, Consultation, CalendarBlock, CompanyPayment, HorarioAtencion, Servicio, Factura, CuentaCobrar, PagoCuentaCobrar, Proveedor, CuentaPagar, PagoCuentaPagar, ReporteD104, ReporteD101, GastosManualesAnuales, PorcentajeDieta, PlantillaDieta } from "./src/data/mockData";
```

En `server.ts:44-57`:

```typescript
import {
  defaultCompanies,
  defaultUsers,
  defaultPatients,
  defaultConsultations,
  defaultCitas,
  defaultSmtpConfigs,
  defaultNotificationLogs,
  defaultCalendarBlocks,
  defaultCompanyPayments,
  defaultServicios,
  defaultFacturas,
  defaultPorcentajesDieta
} from "./src/data/mockData";
```

Reemplazar por (se agrega `defaultPlantillasDieta`):

```typescript
import {
  defaultCompanies,
  defaultUsers,
  defaultPatients,
  defaultConsultations,
  defaultCitas,
  defaultSmtpConfigs,
  defaultNotificationLogs,
  defaultCalendarBlocks,
  defaultCompanyPayments,
  defaultServicios,
  defaultFacturas,
  defaultPorcentajesDieta,
  defaultPlantillasDieta
} from "./src/data/mockData";
```

- [ ] **Step 2: Array de respaldo en memoria**

En `server.ts:76`, justo después de:

```typescript
let localPorcentajesDieta: PorcentajeDieta[] = [...defaultPorcentajesDieta];
```

agregar:

```typescript
let localPlantillasDieta: PlantillaDieta[] = [...defaultPlantillasDieta];
```

- [ ] **Step 3: Crear la tabla**

En `server.ts`, el bloque que crea `compania_porcentajes_dieta` es:

```typescript
    await pool.query(`
      CREATE TABLE IF NOT EXISTS compania_porcentajes_dieta (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idCompania INT NOT NULL,
        porcentaje DECIMAL(5,2) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
```

Justo después de ese bloque (antes del bloque de `notification_logs`), agregar:

```typescript
    await pool.query(`
      CREATE TABLE IF NOT EXISTS plantillas_dieta (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idCompania INT NOT NULL,
        nombre VARCHAR(150) NOT NULL,
        direccion VARCHAR(20) NOT NULL,
        caloriaMin INT NOT NULL,
        caloriaMax INT NOT NULL,
        carbohidratosG INT NOT NULL,
        proteinasG INT NOT NULL,
        grasasG INT NOT NULL,
        desayuno TEXT,
        meriendaManana TEXT,
        almuerzo TEXT,
        meriendaTarde TEXT,
        cena TEXT,
        indicaciones TEXT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
```

- [ ] **Step 4: Endpoints GET/POST/DELETE**

En `server.ts`, justo después del cierre del endpoint `DELETE /api/porcentajes-dieta/:id` (el `});` que precede al comentario `// 10. Servicios`), agregar:

```typescript
  app.get("/api/plantillas-dieta", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM plantillas_dieta WHERE idCompania = ?", [session.idCompania]);
        res.json(rows);
      } else {
        res.json(localPlantillasDieta.filter(p => p.idCompania === session.idCompania));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/plantillas-dieta", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (session.rol !== "Administrador" && !isSaasAdmin(session)) {
        return res.status(403).json({ error: "Solo un Administrador puede modificar las plantillas de dieta de la empresa." });
      }
      const p = req.body;
      p.idCompania = session.idCompania;
      const caloriaMin = parseInt(p.caloriaMin);
      const caloriaMax = parseInt(p.caloriaMax);
      if (!Number.isFinite(caloriaMin) || !Number.isFinite(caloriaMax) || caloriaMin < 0 || caloriaMax <= caloriaMin) {
        return res.status(400).json({ error: "El rango de calorías no es válido (el máximo debe ser mayor que el mínimo)." });
      }
      p.caloriaMin = caloriaMin;
      p.caloriaMax = caloriaMax;
      p.carbohidratosG = parseInt(p.carbohidratosG) || 0;
      p.proteinasG = parseInt(p.proteinasG) || 0;
      p.grasasG = parseInt(p.grasasG) || 0;
      if (dbConnected && pool) {
        if (p.id) {
          const [exists] = await pool.query("SELECT id FROM plantillas_dieta WHERE id = ? AND idCompania = ?", [p.id, parseInt(p.idCompania)]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE plantillas_dieta SET idCompania = ?, nombre = ?, direccion = ?, caloriaMin = ?, caloriaMax = ?, carbohidratosG = ?, proteinasG = ?, grasasG = ?, desayuno = ?, meriendaManana = ?, almuerzo = ?, meriendaTarde = ?, cena = ?, indicaciones = ? WHERE id = ?",
              [parseInt(p.idCompania), p.nombre, p.direccion, p.caloriaMin, p.caloriaMax, p.carbohidratosG, p.proteinasG, p.grasasG, p.desayuno || '', p.meriendaManana || '', p.almuerzo || '', p.meriendaTarde || '', p.cena || '', p.indicaciones || '', p.id]
            );
            return res.json(p);
          }
        }
        const [result] = await pool.query(
          "INSERT INTO plantillas_dieta (idCompania, nombre, direccion, caloriaMin, caloriaMax, carbohidratosG, proteinasG, grasasG, desayuno, meriendaManana, almuerzo, meriendaTarde, cena, indicaciones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [parseInt(p.idCompania), p.nombre, p.direccion, p.caloriaMin, p.caloriaMax, p.carbohidratosG, p.proteinasG, p.grasasG, p.desayuno || '', p.meriendaManana || '', p.almuerzo || '', p.meriendaTarde || '', p.cena || '', p.indicaciones || '']
        );
        p.id = (result as any).insertId;
        res.json(p);
      } else {
        if (p.id) {
          localPlantillasDieta = localPlantillasDieta.map(item => item.id === p.id ? p : item);
        } else {
          p.id = Math.max(0, ...localPlantillasDieta.map(item => item.id)) + 1;
          localPlantillasDieta.push(p);
        }
        res.json(p);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/plantillas-dieta/:id", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (session.rol !== "Administrador" && !isSaasAdmin(session)) {
        return res.status(403).json({ error: "Solo un Administrador puede modificar las plantillas de dieta de la empresa." });
      }
      const id = parseInt(req.params.id);
      const idCompania = session.idCompania;
      if (dbConnected && pool) {
        await pool.query("DELETE FROM plantillas_dieta WHERE id = ? AND idCompania = ?", [id, idCompania]);
        res.json({ success: true });
      } else {
        localPlantillasDieta = localPlantillasDieta.filter(item => !(item.id === id && item.idCompania === idCompania));
        res.json({ success: true });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit -p .`
Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
git add server.ts
git commit -m "$(cat <<'EOF'
Add plantillas_dieta table and CRUD endpoints

Per-company diet templates by calorie range/objective, following the
same dual-mode pattern and Administrador-only write guard as
compania_porcentajes_dieta.
EOF
)"
```

---

## Task 3: Componente `PlantillaDietaManager.tsx`

**Files:**
- Create: `src/components/PlantillaDietaManager.tsx`

**Interfaces:**
- Consumes: `PlantillaDieta` de Task 1, `DireccionPrescripcion` de `src/utils/calorieFormulas.ts` (ya existente).
- Produces: componente `PlantillaDietaManager` con props `{ idCompania: number; plantillasDieta: PlantillaDieta[]; onSavePlantillaDieta: (p: PlantillaDieta) => void; onDeletePlantillaDieta: (id: number) => void; themeColor: string }` — consumido por `CompanySettings.tsx` en Task 4.

- [ ] **Step 1: Crear el componente**

Create `src/components/PlantillaDietaManager.tsx`:

```tsx
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
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit -p .`
Expected: sin salida (el componente no está importado por nadie todavía, así que no puede romper nada; solo se verifica que compile por sí solo).

- [ ] **Step 3: Commit**

```bash
git add src/components/PlantillaDietaManager.tsx
git commit -m "$(cat <<'EOF'
Add PlantillaDietaManager component

Standalone CRUD UI for per-company diet templates (name, objective,
calorie range, macros in grams, full menu). Not wired into
CompanySettings yet.
EOF
)"
```

---

## Task 4: Integrar `PlantillaDietaManager` en `CompanySettings.tsx`

**Files:**
- Modify: `src/components/CompanySettings.tsx:2` (import de tipo)
- Modify: `src/components/CompanySettings.tsx:1` (import de componente, nueva línea)
- Modify: `src/components/CompanySettings.tsx:6-24` (props interface + destructuring)
- Modify: `src/components/CompanySettings.tsx:1636` (render, después de la sección de porcentajes)

**Interfaces:**
- Consumes: `PlantillaDieta` de Task 1, componente `PlantillaDietaManager` de Task 3.
- Produces: props `plantillasDieta`, `onSavePlantillaDieta`, `onDeletePlantillaDieta` en `CompanySettingsProps`, consumidas por `App.tsx` en Task 5.

- [ ] **Step 1: Importar el componente**

En `src/components/CompanySettings.tsx:1`:

```typescript
import React, { useState, useEffect } from 'react';
```

Agregar una línea nueva justo después:

```typescript
import React, { useState, useEffect } from 'react';
import PlantillaDietaManager from './PlantillaDietaManager';
```

- [ ] **Step 2: Importar el tipo**

En `src/components/CompanySettings.tsx:2`:

```typescript
import { Company, CompaniaSmtpConfig, SmtpConfigInput, HaciendaConfig, HaciendaConfigInput, User, HorarioAtencion, DEFAULT_HORARIO_ATENCION, Servicio, PorcentajeDieta } from '../data/mockData';
```

Reemplazar por:

```typescript
import { Company, CompaniaSmtpConfig, SmtpConfigInput, HaciendaConfig, HaciendaConfigInput, User, HorarioAtencion, DEFAULT_HORARIO_ATENCION, Servicio, PorcentajeDieta, PlantillaDieta } from '../data/mockData';
```

- [ ] **Step 3: Agregar props**

En `src/components/CompanySettings.tsx:6-24`, el interface actual es:

```typescript
interface CompanySettingsProps {
  companies: Company[];
  selectedCompanyId: number;
  onSelectCompany: (id: number) => void;
  onUpdateCompany: (company: Company) => void;
  onAddCompany: (company: Company) => void;
  smtpConfigs: CompaniaSmtpConfig[];
  onUpdateSmtpConfig: (config: SmtpConfigInput) => void;
  users: User[];
  currentUser: User;
  onSaveUser: (user: User) => void;
  servicios: Servicio[];
  onSaveServicio: (servicio: Servicio) => void;
  onCargarServiciosDefecto: (idCompania: number) => Promise<Servicio[]>;
  onAjustarStock: (idServicio: number, nuevoStock: number, notas: string) => Promise<void>;
  porcentajesDieta: PorcentajeDieta[];
  onSavePorcentajeDieta: (porcentaje: PorcentajeDieta) => void;
  onDeletePorcentajeDieta: (id: number) => void;
}

export default function CompanySettings({
  companies,
  selectedCompanyId,
  onSelectCompany,
  onUpdateCompany,
  onAddCompany,
  smtpConfigs,
  onUpdateSmtpConfig,
  users,
  currentUser,
  onSaveUser,
  servicios,
  onSaveServicio,
  onCargarServiciosDefecto,
  onAjustarStock,
  porcentajesDieta,
  onSavePorcentajeDieta,
  onDeletePorcentajeDieta
}: CompanySettingsProps) {
```

Reemplazar por (se agregan las 3 props nuevas al final de ambos bloques):

```typescript
interface CompanySettingsProps {
  companies: Company[];
  selectedCompanyId: number;
  onSelectCompany: (id: number) => void;
  onUpdateCompany: (company: Company) => void;
  onAddCompany: (company: Company) => void;
  smtpConfigs: CompaniaSmtpConfig[];
  onUpdateSmtpConfig: (config: SmtpConfigInput) => void;
  users: User[];
  currentUser: User;
  onSaveUser: (user: User) => void;
  servicios: Servicio[];
  onSaveServicio: (servicio: Servicio) => void;
  onCargarServiciosDefecto: (idCompania: number) => Promise<Servicio[]>;
  onAjustarStock: (idServicio: number, nuevoStock: number, notas: string) => Promise<void>;
  porcentajesDieta: PorcentajeDieta[];
  onSavePorcentajeDieta: (porcentaje: PorcentajeDieta) => void;
  onDeletePorcentajeDieta: (id: number) => void;
  plantillasDieta: PlantillaDieta[];
  onSavePlantillaDieta: (plantilla: PlantillaDieta) => void;
  onDeletePlantillaDieta: (id: number) => void;
}

export default function CompanySettings({
  companies,
  selectedCompanyId,
  onSelectCompany,
  onUpdateCompany,
  onAddCompany,
  smtpConfigs,
  onUpdateSmtpConfig,
  users,
  currentUser,
  onSaveUser,
  servicios,
  onSaveServicio,
  onCargarServiciosDefecto,
  onAjustarStock,
  porcentajesDieta,
  onSavePorcentajeDieta,
  onDeletePorcentajeDieta,
  plantillasDieta,
  onSavePlantillaDieta,
  onDeletePlantillaDieta
}: CompanySettingsProps) {
```

- [ ] **Step 4: Renderizar el componente**

En `src/components/CompanySettings.tsx`, la sección de porcentajes termina así (línea 1636):

```tsx
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step="0.5"
              value={nuevoPorcentaje}
              onChange={(e) => setNuevoPorcentaje(e.target.value)}
              placeholder="ej: 25"
              className="w-28 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5"
            />
            <button
              type="button"
              onClick={handleAgregarPorcentaje}
              className="text-white px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1"
              style={{ backgroundColor: currentCompany.colorPrimario }}
            >
              <Plus className="w-3.5 h-3.5" /> Agregar
            </button>
          </div>
        </div>
      )}

      {/* Editing / Creating Form */}
      {(isEditing || isAdding) && (
```

Reemplazar por (se inserta el render de `PlantillaDietaManager` entre el cierre de la sección de porcentajes y el comentario "Editing / Creating Form"):

```tsx
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              step="0.5"
              value={nuevoPorcentaje}
              onChange={(e) => setNuevoPorcentaje(e.target.value)}
              placeholder="ej: 25"
              className="w-28 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5"
            />
            <button
              type="button"
              onClick={handleAgregarPorcentaje}
              className="text-white px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1"
              style={{ backgroundColor: currentCompany.colorPrimario }}
            >
              <Plus className="w-3.5 h-3.5" /> Agregar
            </button>
          </div>
        </div>
      )}

      {!isEditing && !isAdding && currentUser.rol === 'Administrador' && (
        <PlantillaDietaManager
          idCompania={currentCompany.id}
          plantillasDieta={plantillasDieta}
          onSavePlantillaDieta={onSavePlantillaDieta}
          onDeletePlantillaDieta={onDeletePlantillaDieta}
          themeColor={currentCompany.colorPrimario}
        />
      )}

      {/* Editing / Creating Form */}
      {(isEditing || isAdding) && (
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit -p .`
Expected: error esperado en `App.tsx` porque todavía no pasa las 3 props nuevas a `<CompanySettings>` (se resuelve en Task 5) — confirmar que el ÚNICO error nuevo es sobre esas 3 props faltantes en el call site de `App.tsx`, nada dentro de `CompanySettings.tsx` ni `PlantillaDietaManager.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/components/CompanySettings.tsx
git commit -m "$(cat <<'EOF'
Wire PlantillaDietaManager into CompanySettings

Renders right after the deficit/surplus percentages section, same
Administrador-only visibility gate.
EOF
)"
```

---

## Task 5: Wiring de `plantillasDieta` en `App.tsx`

**Files:**
- Modify: `src/App.tsx:42-69` (imports de tipos y defaults)
- Modify: `src/App.tsx:141-144` (estado, después de `porcentajesDieta`)
- Modify: `src/App.tsx:231-234` (fetch inicial)
- Modify: `src/App.tsx:284-285` (persistencia a localStorage)
- Modify: `src/App.tsx:551-571` (handler de guardado, después de `handleSavePorcentajeDieta`)
- Modify: `src/App.tsx:749-758` (handler de borrado, después de `handleDeletePorcentajeDieta`)
- Modify: `src/App.tsx:1204-1212` (props de `<ConsultationForm>`)
- Modify: `src/App.tsx:1854-1872` (props de `<CompanySettings>`)

**Interfaces:**
- Consumes: `PlantillaDieta` de Task 1, `/api/plantillas-dieta` (GET/POST/DELETE) de Task 2, props `plantillasDieta`/`onSavePlantillaDieta`/`onDeletePlantillaDieta` de `CompanySettingsProps` (Task 4).
- Produces: prop `plantillasDieta` para `ConsultationForm` (consumida en Task 6) y las 3 props para `CompanySettings`.

- [ ] **Step 1: Importar el tipo y el default**

En `src/App.tsx:42-69`, el bloque de import es:

```typescript
import {
  defaultCompanies,
  defaultPatients,
  defaultConsultations,
  defaultUsers,
  defaultCitas,
  defaultSmtpConfigs,
  defaultNotificationLogs,
  defaultCalendarBlocks,
  defaultPorcentajesDieta,
  defaultServicios,
  Company,
  Patient,
  Consultation,
  User,
  Cita,
  CompaniaSmtpConfig,
  NotificationLog,
  SmtpConfigInput,
  CalendarBlock,
  PorcentajeDieta,
  CompanyPayment,
  Servicio,
  Factura,
  CuentaCobrar,
  Proveedor,
  CuentaPagar
} from './data/mockData';
```

Reemplazar por (se agrega `defaultPlantillasDieta` y `PlantillaDieta`):

```typescript
import {
  defaultCompanies,
  defaultPatients,
  defaultConsultations,
  defaultUsers,
  defaultCitas,
  defaultSmtpConfigs,
  defaultNotificationLogs,
  defaultCalendarBlocks,
  defaultPorcentajesDieta,
  defaultPlantillasDieta,
  defaultServicios,
  Company,
  Patient,
  Consultation,
  User,
  Cita,
  CompaniaSmtpConfig,
  NotificationLog,
  SmtpConfigInput,
  CalendarBlock,
  PorcentajeDieta,
  PlantillaDieta,
  CompanyPayment,
  Servicio,
  Factura,
  CuentaCobrar,
  Proveedor,
  CuentaPagar
} from './data/mockData';
```

- [ ] **Step 2: Estado**

En `src/App.tsx:141-144`:

```typescript
  const [porcentajesDieta, setPorcentajesDieta] = useState<PorcentajeDieta[]>(() => {
    const local = localStorage.getItem('fisio_porcentajes_dieta');
    return local ? JSON.parse(local) : defaultPorcentajesDieta;
  });
```

Justo después, agregar:

```typescript

  const [plantillasDieta, setPlantillasDieta] = useState<PlantillaDieta[]>(() => {
    const local = localStorage.getItem('fisio_plantillas_dieta');
    return local ? JSON.parse(local) : defaultPlantillasDieta;
  });
```

- [ ] **Step 3: Fetch inicial**

En `src/App.tsx:231-234`:

```typescript
    fetch('/api/porcentajes-dieta')
      .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then(data => { if (Array.isArray(data)) setPorcentajesDieta(data); })
      .catch(err => console.log("MySQL offline, using local fallback for porcentajes de dieta"));
```

Justo después, agregar:

```typescript

    fetch('/api/plantillas-dieta')
      .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then(data => { if (Array.isArray(data)) setPlantillasDieta(data); })
      .catch(err => console.log("MySQL offline, using local fallback for plantillas de dieta"));
```

- [ ] **Step 4: Persistencia a localStorage**

En `src/App.tsx:284-285`:

```typescript
    localStorage.setItem('fisio_porcentajes_dieta', JSON.stringify(porcentajesDieta));
  }, [porcentajesDieta]);
```

Justo después, agregar:

```typescript

  useEffect(() => {
    localStorage.setItem('fisio_plantillas_dieta', JSON.stringify(plantillasDieta));
  }, [plantillasDieta]);
```

- [ ] **Step 5: Handler de guardado**

En `src/App.tsx:551-571`:

```typescript
  const handleSavePorcentajeDieta = (porcentaje: PorcentajeDieta) => {
    fetch('/api/porcentajes-dieta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(porcentaje)
    })
    .then(res => res.json())
    .then(data => {
      setPorcentajesDieta(prev => {
        const exists = prev.some(p => p.id === data.id);
        return exists ? prev.map(p => p.id === data.id ? data : p) : [...prev, data];
      });
    })
    .catch(err => {
      console.error("Error saving porcentaje dieta to MySQL:", err);
      setPorcentajesDieta(prev => {
        const exists = prev.some(p => p.id === porcentaje.id);
        return exists ? prev.map(p => p.id === porcentaje.id ? porcentaje : p) : [...prev, porcentaje];
      });
    });
  };
```

Justo después, agregar:

```typescript

  const handleSavePlantillaDieta = (plantilla: PlantillaDieta) => {
    fetch('/api/plantillas-dieta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plantilla)
    })
    .then(res => res.json())
    .then(data => {
      setPlantillasDieta(prev => {
        const exists = prev.some(p => p.id === data.id);
        return exists ? prev.map(p => p.id === data.id ? data : p) : [...prev, data];
      });
    })
    .catch(err => {
      console.error("Error saving plantilla dieta to MySQL:", err);
      setPlantillasDieta(prev => {
        const exists = prev.some(p => p.id === plantilla.id);
        return exists ? prev.map(p => p.id === plantilla.id ? plantilla : p) : [...prev, plantilla];
      });
    });
  };
```

- [ ] **Step 6: Handler de borrado**

En `src/App.tsx:749-758`:

```typescript
  const handleDeletePorcentajeDieta = (id: number) => {
    fetch(`/api/porcentajes-dieta/${id}`, { method: 'DELETE' })
      .then(() => {
        setPorcentajesDieta(prev => prev.filter(p => p.id !== id));
      })
      .catch(err => {
        console.error("Error deleting porcentaje dieta from MySQL:", err);
        setPorcentajesDieta(prev => prev.filter(p => p.id !== id));
      });
  };
```

Justo después, agregar:

```typescript

  const handleDeletePlantillaDieta = (id: number) => {
    fetch(`/api/plantillas-dieta/${id}`, { method: 'DELETE' })
      .then(() => {
        setPlantillasDieta(prev => prev.filter(p => p.id !== id));
      })
      .catch(err => {
        console.error("Error deleting plantilla dieta from MySQL:", err);
        setPlantillasDieta(prev => prev.filter(p => p.id !== id));
      });
  };
```

- [ ] **Step 7: Pasar la prop a `<ConsultationForm>`**

En `src/App.tsx:1204-1212`:

```tsx
          <ConsultationForm
            patient={activeConsultationPatient}
            editingConsultation={editingConsultation}
            onSave={handleSaveConsultation}
            onCancel={() => { setActiveConsultationPatient(null); setEditingConsultation(null); }}
            themeColor={activeCompany.colorPrimario}
            perfilCompania={activeCompany.perfilCompania || 'Ambas'}
            porcentajesDieta={porcentajesDieta}
          />
```

Reemplazar por:

```tsx
          <ConsultationForm
            patient={activeConsultationPatient}
            editingConsultation={editingConsultation}
            onSave={handleSaveConsultation}
            onCancel={() => { setActiveConsultationPatient(null); setEditingConsultation(null); }}
            themeColor={activeCompany.colorPrimario}
            perfilCompania={activeCompany.perfilCompania || 'Ambas'}
            porcentajesDieta={porcentajesDieta}
            plantillasDieta={plantillasDieta}
          />
```

- [ ] **Step 8: Pasar las props a `<CompanySettings>`**

En `src/App.tsx:1854-1872`:

```tsx
              <CompanySettings
                companies={companies.filter(c => c.id === selectedCompanyId)}
                selectedCompanyId={selectedCompanyId}
                onSelectCompany={(id) => setSelectedCompanyId(id)}
                onUpdateCompany={handleUpdateCompany}
                onAddCompany={handleAddCompany}
                smtpConfigs={smtpConfigs}
                onUpdateSmtpConfig={handleUpdateSmtpConfig}
                users={users}
                currentUser={currentUser!}
                onSaveUser={handleSaveUser}
                servicios={servicios}
                onSaveServicio={handleSaveServicio}
                onCargarServiciosDefecto={handleCargarServiciosDefecto}
                onAjustarStock={handleAjustarStock}
                porcentajesDieta={porcentajesDieta}
                onSavePorcentajeDieta={handleSavePorcentajeDieta}
                onDeletePorcentajeDieta={handleDeletePorcentajeDieta}
              />
```

Reemplazar por:

```tsx
              <CompanySettings
                companies={companies.filter(c => c.id === selectedCompanyId)}
                selectedCompanyId={selectedCompanyId}
                onSelectCompany={(id) => setSelectedCompanyId(id)}
                onUpdateCompany={handleUpdateCompany}
                onAddCompany={handleAddCompany}
                smtpConfigs={smtpConfigs}
                onUpdateSmtpConfig={handleUpdateSmtpConfig}
                users={users}
                currentUser={currentUser!}
                onSaveUser={handleSaveUser}
                servicios={servicios}
                onSaveServicio={handleSaveServicio}
                onCargarServiciosDefecto={handleCargarServiciosDefecto}
                onAjustarStock={handleAjustarStock}
                porcentajesDieta={porcentajesDieta}
                onSavePorcentajeDieta={handleSavePorcentajeDieta}
                onDeletePorcentajeDieta={handleDeletePorcentajeDieta}
                plantillasDieta={plantillasDieta}
                onSavePlantillaDieta={handleSavePlantillaDieta}
                onDeletePlantillaDieta={handleDeletePlantillaDieta}
              />
```

- [ ] **Step 9: Verificar tipos**

Run: `npx tsc --noEmit -p .`
Expected: error esperado en `ConsultationForm.tsx` call site (`src/App.tsx`) porque `ConsultationFormProps` todavía no acepta `plantillasDieta` — se resuelve en Task 6. Confirmar que el ÚNICO error restante es ese.

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx
git commit -m "$(cat <<'EOF'
Wire plantillasDieta state/fetch/handlers through App.tsx

Passes the company-scoped template list down to CompanySettings (now
fully wired) and ConsultationForm (wired in the next task).
EOF
)"
```

---

## Task 6: Sugerencia y aplicación de plantillas en `ConsultationForm.tsx`

**Files:**
- Modify: `src/components/ConsultationForm.tsx:2` (import de tipo)
- Modify: `src/components/ConsultationForm.tsx:7-17` (prop)
- Modify: `src/components/ConsultationForm.tsx:168-213` (estado y valores derivados de la calculadora)
- Modify: `src/components/ConsultationForm.tsx:303-323` (restauración en el `useEffect` de edición)
- Modify: `src/components/ConsultationForm.tsx:411-432` (persistencia en `handleFormSubmit`)
- Modify: `src/components/ConsultationForm.tsx:1787-1806` (JSX — plantillas sugeridas + aviso de alergias, después de "Resultado calculado")
- Modify: `src/components/ConsultationForm.tsx:1813-1823` (JSX — inputs de macros, junto a "Presupuesto Calórico Diario")

**Interfaces:**
- Consumes: `PlantillaDieta` de Task 1, prop `plantillasDieta` de `App.tsx` (Task 5), `DireccionPrescripcion` (ya importado).
- Produces: nada consumido por otras tareas — última pieza del flujo.

- [ ] **Step 1: Importar el tipo**

En `src/components/ConsultationForm.tsx:2`:

```typescript
import { Patient, Consultation, PorcentajeDieta } from '../data/mockData';
```

Reemplazar por:

```typescript
import { Patient, Consultation, PorcentajeDieta, PlantillaDieta } from '../data/mockData';
```

- [ ] **Step 2: Prop nueva**

En `src/components/ConsultationForm.tsx:7-17`:

```typescript
interface ConsultationFormProps {
  patient: Patient;
  editingConsultation: Consultation | null;
  onSave: (consultation: Consultation) => void;
  onCancel: () => void;
  themeColor: string;
  perfilCompania: 'Fisioterapia' | 'Nutrición' | 'Ambas';
  porcentajesDieta: PorcentajeDieta[];
}

export default function ConsultationForm({ patient, editingConsultation, onSave, onCancel, themeColor, perfilCompania, porcentajesDieta }: ConsultationFormProps) {
```

Reemplazar por:

```typescript
interface ConsultationFormProps {
  patient: Patient;
  editingConsultation: Consultation | null;
  onSave: (consultation: Consultation) => void;
  onCancel: () => void;
  themeColor: string;
  perfilCompania: 'Fisioterapia' | 'Nutrición' | 'Ambas';
  porcentajesDieta: PorcentajeDieta[];
  plantillasDieta: PlantillaDieta[];
}

export default function ConsultationForm({ patient, editingConsultation, onSave, onCancel, themeColor, perfilCompania, porcentajesDieta, plantillasDieta }: ConsultationFormProps) {
```

- [ ] **Step 3: Estado de macros y plantillas coincidentes**

En `src/components/ConsultationForm.tsx:168-213`, el bloque actual (calculadora, ya con las correcciones de la revisión final aplicadas) es:

```typescript
  // Prescripción Calórica (Déficit/Superávit)
  const [formulaSeleccionada, setFormulaSeleccionada] = useState<FormulaTMB | null>(null);
  const [diasDescanso, setDiasDescanso] = useState(7);
  const [diasEntrenamiento, setDiasEntrenamiento] = useState(0);
  const [factorActividadDescanso, setFactorActividadDescanso] = useState<number>(FACTORES_ACTIVIDAD.SEDENTARIO);
  const [factorActividadEntreno, setFactorActividadEntreno] = useState<number>(FACTORES_ACTIVIDAD.LIGERA);
  const [direccionPrescripcion, setDireccionPrescripcion] = useState<DireccionPrescripcion>('DEFICIT');
  const [porcentajePrescripcion, setPorcentajePrescripcion] = useState<number>(0);
  const [tmbRestaurado, setTmbRestaurado] = useState<number | null>(null);
  const [promedioRestaurado, setPromedioRestaurado] = useState<number | null>(null);

  const [prescripcionAplicada, setPrescripcionAplicada] = useState(false);

  const invalidarRestaurado = () => {
    setTmbRestaurado(null);
    setPromedioRestaurado(null);
    setPrescripcionAplicada(false);
  };

  const tmbPorFormula = patient.sexo ? {
    HARRIS_BENEDICT_OBESOS: calcularTMB('HARRIS_BENEDICT_OBESOS', patient.sexo, peso, talla, patient.edad),
    MIFFLIN_ST_JEOR: calcularTMB('MIFFLIN_ST_JEOR', patient.sexo, peso, talla, patient.edad),
    MULLER: calcularTMB('MULLER', patient.sexo, peso, talla, patient.edad),
  } : null;

  const tmbCalculadoEnVivo = formulaSeleccionada && tmbPorFormula ? tmbPorFormula[formulaSeleccionada] : null;
  const tmbSeleccionado = tmbRestaurado ?? tmbCalculadoEnVivo;

  const promedioCalculadoEnVivo = tmbCalculadoEnVivo != null
    ? calcularPromedioSemanal(tmbCalculadoEnVivo, factorActividadDescanso, diasDescanso, factorActividadEntreno, diasEntrenamiento)
    : null;
  const promedioMantenimiento = promedioRestaurado ?? promedioCalculadoEnVivo;

  const prescripcionFinal = promedioMantenimiento != null
    ? aplicarPorcentaje(promedioMantenimiento, direccionPrescripcion, porcentajePrescripcion)
    : null;

  const porcentajesDisponibles = porcentajesDieta.filter(p => p.idCompania === patient.idCompania).map(p => Number(p.porcentaje));
  const porcentajesParaMostrar = porcentajesDisponibles.length > 0 ? [...new Set(porcentajesDisponibles)] : [10, 15, 20];

  const handleAplicarPrescripcion = () => {
    if (tmbSeleccionado == null || prescripcionFinal == null) return;
    setTmb(Math.round(tmbSeleccionado));
    setCalorias(Math.round(prescripcionFinal));
    setPrescripcionAplicada(true);
  };
```

Reemplazar por (se agregan 3 estados de macros y, al final, `plantillasCoincidentes` + `handleAplicarPlantilla`):

```typescript
  // Prescripción Calórica (Déficit/Superávit)
  const [formulaSeleccionada, setFormulaSeleccionada] = useState<FormulaTMB | null>(null);
  const [diasDescanso, setDiasDescanso] = useState(7);
  const [diasEntrenamiento, setDiasEntrenamiento] = useState(0);
  const [factorActividadDescanso, setFactorActividadDescanso] = useState<number>(FACTORES_ACTIVIDAD.SEDENTARIO);
  const [factorActividadEntreno, setFactorActividadEntreno] = useState<number>(FACTORES_ACTIVIDAD.LIGERA);
  const [direccionPrescripcion, setDireccionPrescripcion] = useState<DireccionPrescripcion>('DEFICIT');
  const [porcentajePrescripcion, setPorcentajePrescripcion] = useState<number>(0);
  const [tmbRestaurado, setTmbRestaurado] = useState<number | null>(null);
  const [promedioRestaurado, setPromedioRestaurado] = useState<number | null>(null);
  const [macrosCarbohidratos, setMacrosCarbohidratos] = useState(0);
  const [macrosProteinas, setMacrosProteinas] = useState(0);
  const [macrosGrasas, setMacrosGrasas] = useState(0);

  const [prescripcionAplicada, setPrescripcionAplicada] = useState(false);

  const invalidarRestaurado = () => {
    setTmbRestaurado(null);
    setPromedioRestaurado(null);
    setPrescripcionAplicada(false);
  };

  const tmbPorFormula = patient.sexo ? {
    HARRIS_BENEDICT_OBESOS: calcularTMB('HARRIS_BENEDICT_OBESOS', patient.sexo, peso, talla, patient.edad),
    MIFFLIN_ST_JEOR: calcularTMB('MIFFLIN_ST_JEOR', patient.sexo, peso, talla, patient.edad),
    MULLER: calcularTMB('MULLER', patient.sexo, peso, talla, patient.edad),
  } : null;

  const tmbCalculadoEnVivo = formulaSeleccionada && tmbPorFormula ? tmbPorFormula[formulaSeleccionada] : null;
  const tmbSeleccionado = tmbRestaurado ?? tmbCalculadoEnVivo;

  const promedioCalculadoEnVivo = tmbCalculadoEnVivo != null
    ? calcularPromedioSemanal(tmbCalculadoEnVivo, factorActividadDescanso, diasDescanso, factorActividadEntreno, diasEntrenamiento)
    : null;
  const promedioMantenimiento = promedioRestaurado ?? promedioCalculadoEnVivo;

  const prescripcionFinal = promedioMantenimiento != null
    ? aplicarPorcentaje(promedioMantenimiento, direccionPrescripcion, porcentajePrescripcion)
    : null;

  const porcentajesDisponibles = porcentajesDieta.filter(p => p.idCompania === patient.idCompania).map(p => Number(p.porcentaje));
  const porcentajesParaMostrar = porcentajesDisponibles.length > 0 ? [...new Set(porcentajesDisponibles)] : [10, 15, 20];

  const plantillasCoincidentes = prescripcionFinal != null
    ? plantillasDieta.filter(p =>
        p.idCompania === patient.idCompania &&
        p.direccion === direccionPrescripcion &&
        prescripcionFinal >= p.caloriaMin &&
        prescripcionFinal <= p.caloriaMax
      )
    : [];

  const handleAplicarPrescripcion = () => {
    if (tmbSeleccionado == null || prescripcionFinal == null) return;
    setTmb(Math.round(tmbSeleccionado));
    setCalorias(Math.round(prescripcionFinal));
    setPrescripcionAplicada(true);
  };

  const handleAplicarPlantilla = (plantilla: PlantillaDieta) => {
    setDesayuno(plantilla.desayuno);
    setMeriendaMan(plantilla.meriendaManana);
    setAlmuerzo(plantilla.almuerzo);
    setMeriendaTar(plantilla.meriendaTarde);
    setCena(plantilla.cena);
    setIndicacionesDieta(plantilla.indicaciones);
    setMacrosCarbohidratos(plantilla.carbohidratosG);
    setMacrosProteinas(plantilla.proteinasG);
    setMacrosGrasas(plantilla.grasasG);
    handleAplicarPrescripcion();
  };
```

- [ ] **Step 4: Restaurar macros al editar una consulta existente**

En `src/components/ConsultationForm.tsx:303-323`, el bloque actual es:

```typescript
    if (d) {
      setCalorias(d.totalCalorias);
      setDesayuno(d.desayuno);
      setMeriendaMan(d.meriendaManana);
      setAlmuerzo(d.almuerzo);
      setMeriendaTar(d.meriendaTarde);
      setCena(d.cena);
      setIndicacionesDieta(d.indicaciones);
      if (d.prescripcionCalorica) {
        const pc = d.prescripcionCalorica;
        setFormulaSeleccionada(pc.formula);
        setDiasDescanso(pc.diasDescanso);
        setDiasEntrenamiento(pc.diasEntrenamiento);
        setFactorActividadDescanso(pc.factorActividadDescanso);
        setFactorActividadEntreno(pc.factorActividadEntreno);
        setDireccionPrescripcion(pc.direccion);
        setPorcentajePrescripcion(pc.porcentaje);
        setTmbRestaurado(pc.tmb);
        setPromedioRestaurado(pc.promedioMantenimiento);
      }
    }
```

Reemplazar por (se agrega la restauración de `macros` al final del bloque):

```typescript
    if (d) {
      setCalorias(d.totalCalorias);
      setDesayuno(d.desayuno);
      setMeriendaMan(d.meriendaManana);
      setAlmuerzo(d.almuerzo);
      setMeriendaTar(d.meriendaTarde);
      setCena(d.cena);
      setIndicacionesDieta(d.indicaciones);
      if (d.prescripcionCalorica) {
        const pc = d.prescripcionCalorica;
        setFormulaSeleccionada(pc.formula);
        setDiasDescanso(pc.diasDescanso);
        setDiasEntrenamiento(pc.diasEntrenamiento);
        setFactorActividadDescanso(pc.factorActividadDescanso);
        setFactorActividadEntreno(pc.factorActividadEntreno);
        setDireccionPrescripcion(pc.direccion);
        setPorcentajePrescripcion(pc.porcentaje);
        setTmbRestaurado(pc.tmb);
        setPromedioRestaurado(pc.promedioMantenimiento);
      }
      if (d.macros) {
        setMacrosCarbohidratos(d.macros.carbohidratosG);
        setMacrosProteinas(d.macros.proteinasG);
        setMacrosGrasas(d.macros.grasasG);
      }
    }
```

- [ ] **Step 5: Persistir macros al guardar**

En `src/components/ConsultationForm.tsx:411-432`, el bloque actual es:

```typescript
        dieta: {
          totalCalorias: calorias,
          desayuno,
          meriendaManana: meriendaMan,
          almuerzo,
          meriendaTarde: meriendaTar,
          cena,
          indicaciones: indicacionesDieta,
          ...(formulaSeleccionada && tmbSeleccionado != null && promedioMantenimiento != null ? {
            prescripcionCalorica: {
              formula: formulaSeleccionada,
              tmb: tmbSeleccionado,
              diasDescanso,
              diasEntrenamiento,
              factorActividadDescanso,
              factorActividadEntreno,
              promedioMantenimiento,
              direccion: direccionPrescripcion,
              porcentaje: porcentajePrescripcion
            }
          } : {})
        },
```

Reemplazar por (se agrega `macros` condicional después de `prescripcionCalorica`):

```typescript
        dieta: {
          totalCalorias: calorias,
          desayuno,
          meriendaManana: meriendaMan,
          almuerzo,
          meriendaTarde: meriendaTar,
          cena,
          indicaciones: indicacionesDieta,
          ...(formulaSeleccionada && tmbSeleccionado != null && promedioMantenimiento != null ? {
            prescripcionCalorica: {
              formula: formulaSeleccionada,
              tmb: tmbSeleccionado,
              diasDescanso,
              diasEntrenamiento,
              factorActividadDescanso,
              factorActividadEntreno,
              promedioMantenimiento,
              direccion: direccionPrescripcion,
              porcentaje: porcentajePrescripcion
            }
          } : {}),
          ...(macrosCarbohidratos > 0 || macrosProteinas > 0 || macrosGrasas > 0 ? {
            macros: {
              carbohidratosG: macrosCarbohidratos,
              proteinasG: macrosProteinas,
              grasasG: macrosGrasas
            }
          } : {})
        },
```

- [ ] **Step 6: JSX — plantillas sugeridas y aviso de alergias**

En `src/components/ConsultationForm.tsx:1787-1806`:

```tsx
                          {prescripcionFinal != null && (
                            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-center justify-between">
                              <div>
                                <div className="text-[10px] text-teal-700 uppercase font-bold">Resultado calculado</div>
                                <div className="text-xl font-black text-teal-800">{Math.round(prescripcionFinal)} kcal/día</div>
                              </div>
                              <div className="text-right">
                                <button
                                  type="button"
                                  onClick={handleAplicarPrescripcion}
                                  className="bg-teal-600 hover:bg-teal-700 text-white font-semibold px-3 py-1.5 rounded-lg text-xs"
                                >
                                  Usar este valor
                                </button>
                                {prescripcionAplicada && (
                                  <p className="text-[10px] text-teal-700 font-semibold mt-1">✓ Aplicado a TMB y Presupuesto Calórico</p>
                                )}
                              </div>
                            </div>
                          )}
```

Reemplazar por (se agrega el bloque de plantillas sugeridas + aviso de alergias justo después de la tarjeta de resultado):

```tsx
                          {prescripcionFinal != null && (
                            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-center justify-between">
                              <div>
                                <div className="text-[10px] text-teal-700 uppercase font-bold">Resultado calculado</div>
                                <div className="text-xl font-black text-teal-800">{Math.round(prescripcionFinal)} kcal/día</div>
                              </div>
                              <div className="text-right">
                                <button
                                  type="button"
                                  onClick={handleAplicarPrescripcion}
                                  className="bg-teal-600 hover:bg-teal-700 text-white font-semibold px-3 py-1.5 rounded-lg text-xs"
                                >
                                  Usar este valor
                                </button>
                                {prescripcionAplicada && (
                                  <p className="text-[10px] text-teal-700 font-semibold mt-1">✓ Aplicado a TMB y Presupuesto Calórico</p>
                                )}
                              </div>
                            </div>
                          )}

                          {plantillasCoincidentes.length > 0 && (
                            <div className="space-y-2">
                              {(patient.alergiasAlimentarias || alimentosNoConsume || alimentosPreferidos) && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-amber-800">
                                  <p className="font-bold">⚠ Revisar antes de aplicar una plantilla:</p>
                                  {patient.alergiasAlimentarias && <p>Alergias: {patient.alergiasAlimentarias}</p>}
                                  {alimentosNoConsume && <p>No consume: {alimentosNoConsume}</p>}
                                  {alimentosPreferidos && <p>Prefiere: {alimentosPreferidos}</p>}
                                </div>
                              )}
                              <label className="block text-slate-600 font-semibold">Plantillas sugeridas para este rango</label>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {plantillasCoincidentes.map(pl => (
                                  <button
                                    type="button"
                                    key={pl.id}
                                    onClick={() => handleAplicarPlantilla(pl)}
                                    className="p-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-left"
                                  >
                                    <div className="font-semibold text-slate-700">{pl.nombre}</div>
                                    <div className="text-[10px] text-slate-500">{pl.caloriaMin}-{pl.caloriaMax} kcal · C:{pl.carbohidratosG}g P:{pl.proteinasG}g G:{pl.grasasG}g</div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
```

- [ ] **Step 7: JSX — inputs de macros**

En `src/components/ConsultationForm.tsx:1813-1823`:

```tsx
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 w-56">
                    <label className="block text-slate-600 font-bold mb-1">Presupuesto Calórico Diario (kcal)</label>
                    <input
                      type="number"
                      value={calorias}
                      onChange={(e) => setCalorias(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-bold"
                    />
                  </div>
                </div>
```

Reemplazar por (se agrega una segunda tarjeta con los 3 inputs de macros, llenando el grid de 2 columnas):

```tsx
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60 w-56">
                    <label className="block text-slate-600 font-bold mb-1">Presupuesto Calórico Diario (kcal)</label>
                    <input
                      type="number"
                      value={calorias}
                      onChange={(e) => setCalorias(parseInt(e.target.value) || 0)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 font-bold"
                    />
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
                    <label className="block text-slate-600 font-bold mb-1">Macronutrientes (g/día)</label>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-slate-500 text-[10px] mb-0.5">Carbohidratos</label>
                        <input
                          type="number"
                          value={macrosCarbohidratos}
                          onChange={(e) => setMacrosCarbohidratos(parseInt(e.target.value) || 0)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[10px] mb-0.5">Proteínas</label>
                        <input
                          type="number"
                          value={macrosProteinas}
                          onChange={(e) => setMacrosProteinas(parseInt(e.target.value) || 0)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 text-[10px] mb-0.5">Grasas</label>
                        <input
                          type="number"
                          value={macrosGrasas}
                          onChange={(e) => setMacrosGrasas(parseInt(e.target.value) || 0)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800"
                        />
                      </div>
                    </div>
                  </div>
                </div>
```

- [ ] **Step 8: Verificar tipos**

Run: `npx tsc --noEmit -p .`
Expected: sin salida (este es el último eslabón de la cadena de props iniciada en Task 5 — todos los errores esperados de las tareas 4-6 deben quedar resueltos).

- [ ] **Step 9: Verificación manual (documentada, no automatizada)**

No ejecutar contra el servidor de producción sin supervisión. Documentar para el usuario los pasos a probar manualmente en su navegador:
1. En Configuración de Empresa, crear al menos una plantilla (ej. Déficit, 1200-1500 kcal, con macros y menú).
2. Abrir un paciente con sexo definido, ir a "Editar Cita" o "Registrar Cita", calcular una prescripción cuyo resultado caiga dentro de ese rango con la misma dirección — debe aparecer la tarjeta de la plantilla.
3. Si el paciente tiene alergias o alimentos no deseados registrados, debe verse el recuadro de aviso ámbar antes de la lista de plantillas.
4. Click en la plantilla — debe llenar desayuno/almuerzo/cena/etc., los 3 campos de macros, y aplicar TMB/calorías. Todo debe seguir editable después.
5. Guardar, reabrir la consulta para editar — los macros y el menú deben restaurarse tal cual quedaron.

- [ ] **Step 10: Commit**

```bash
git add src/components/ConsultationForm.tsx
git commit -m "$(cat <<'EOF'
Suggest and apply matching diet templates in ConsultationForm

Once a caloric prescription is calculated, templates matching the
company's range+objective are offered with a one-click apply that
fills the menu and macros, alongside a patient allergy/dislike
reminder. Macros persist and restore like the rest of dieta.
EOF
)"
```

---

## Final check (repaso rápido antes de cerrar)

- [ ] `npx tsc --noEmit -p .` sin salida.
- [ ] `npx vitest run` — las 16 pruebas existentes de `calorieFormulas.ts` en verde (no se tocó ese módulo, es chequeo de no-regresión).
- [ ] Repasar la spec (`docs/superpowers/specs/2026-08-05-plantillas-dieta-design.md`) punto por punto contra las tareas 1-6 — cada decisión confirmada con el usuario tiene una tarea que la implementa.
- [ ] Desplegar a producción (`npm run build && pm2 restart control-clinico`) **solo con confirmación explícita del usuario**, fuera del alcance de las tareas de este plan.
