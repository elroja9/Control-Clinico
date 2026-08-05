# Prescripción Calórica Parametrizada (Déficit/Superávit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar los campos manuales "TMB" y "Presupuesto Calórico Diario" de `ConsultationForm.tsx` por una calculadora que aplica 3 fórmulas clínicas (Harris Benedict Obesos, Mifflin St Jeor, Müller), un promedio calórico semanal (días de descanso/entrenamiento × factor de actividad), y un porcentaje de déficit/superávit configurable por empresa.

**Architecture:** Un módulo puro nuevo (`src/utils/calorieFormulas.ts`) contiene toda la matemática, testeado con vitest. El resto es wiring: un campo `sexo` nuevo en `Patient`, una tabla SQL nueva por empresa para los porcentajes ofrecidos, y una sección nueva dentro de `ConsultationForm.tsx` que usa el módulo puro y termina llenando (de forma editable) los campos `calorias`/`tmb` que ya existen.

**Tech Stack:** React + TypeScript (frontend), Express + MySQL vía `mysql2` (backend), Vite. Se añade `vitest` solo para el módulo de fórmulas.

## Global Constraints

- Las 3 fórmulas de TMB son exactamente las confirmadas por el usuario — no cambiar coeficientes (ver spec `docs/superpowers/specs/2026-08-04-parametrizacion-calorica-dietas-design.md`).
- Se usa el peso real del paciente en las 3 fórmulas, sin ajuste/corrección.
- `calorias` y `tmb` en `ConsultationForm.tsx` deben seguir siendo editables a mano después de calculados — nunca `disabled`/`readOnly`.
- Este repo no tiene framework de pruebas configurado. Se introduce `vitest` únicamente para `src/utils/calorieFormulas.ts` (funciones puras). El resto de las tareas se verifica con `npx tsc --noEmit -p .` (debe pasar sin salida) — no hay pruebas de componentes automatizadas en este proyecto.
- El servidor de desarrollo (`localhost:3002`) corre contra una base de datos MySQL remota real, no una de pruebas — no ejecutar scripts que inserten/borren datos reales durante la verificación; usar `tsc` y lectura de código para confirmar cada paso.
- Seguir los patrones ya existentes en `server.ts` (dual-mode `pool`/`local*` arrays, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para tablas viejas, `CREATE TABLE IF NOT EXISTS` para tablas nuevas) — no introducir un sistema de migraciones nuevo.

---

## Task 1: Módulo de fórmulas caloríficas (TDD)

**Files:**
- Create: `src/utils/calorieFormulas.ts`
- Create: `src/utils/calorieFormulas.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `FormulaTMB = 'HARRIS_BENEDICT_OBESOS' | 'MIFFLIN_ST_JEOR' | 'MULLER'`, `Sexo = 'M' | 'F'`, `DireccionPrescripcion = 'DEFICIT' | 'SUPERAVIT' | 'MANTENIMIENTO'`, `FACTORES_ACTIVIDAD` (objeto con `SEDENTARIO`, `LIGERA`, `MODERADA`, `MUY_ACTIVO`, `EXTRA_ACTIVO`), `calcularTMB(formula, sexo, peso, talla, edad): number`, `calcularPromedioSemanal(tmb, factorActividadDescanso, diasDescanso, factorActividadEntreno, diasEntrenamiento): number`, `aplicarPorcentaje(promedio, direccion, porcentaje): number`. Todas las tareas siguientes que toquen `ConsultationForm.tsx` importan de este módulo.

- [ ] **Step 1: Instalar vitest**

Run: `npm install -D vitest`
Expected: se agrega `"vitest": "^3.x.x"` a `devDependencies` en `package.json` y se actualiza `package-lock.json`.

- [ ] **Step 2: Crear la config de vitest**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

(No se toca `vite.config.ts` — tiene un comentario explícito de no modificarlo para no romper el HMR de los agentes.)

- [ ] **Step 3: Agregar script de test**

En `package.json`, dentro de `"scripts"`, agregar una línea después de `"lint": "tsc --noEmit",`:

```json
    "test": "vitest run",
```

- [ ] **Step 4: Escribir las pruebas (deben fallar — el módulo no existe aún)**

Create `src/utils/calorieFormulas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { calcularTMB, calcularPromedioSemanal, aplicarPorcentaje, FACTORES_ACTIVIDAD } from './calorieFormulas';

describe('calcularTMB', () => {
  it('Harris Benedict Obesos - hombre (peso=70, talla=175, edad=30)', () => {
    expect(calcularTMB('HARRIS_BENEDICT_OBESOS', 'M', 70, 175, 30)).toBeCloseTo(1695.667, 2);
  });

  it('Harris Benedict Obesos - mujer (peso=60, talla=165, edad=25)', () => {
    expect(calcularTMB('HARRIS_BENEDICT_OBESOS', 'F', 60, 165, 25)).toBeCloseTo(1405.333, 2);
  });

  it('Mifflin St Jeor - hombre (peso=70, talla=175, edad=30)', () => {
    expect(calcularTMB('MIFFLIN_ST_JEOR', 'M', 70, 175, 30)).toBeCloseTo(1648.75, 2);
  });

  it('Mifflin St Jeor - mujer (peso=60, talla=165, edad=25)', () => {
    expect(calcularTMB('MIFFLIN_ST_JEOR', 'F', 60, 165, 25)).toBeCloseTo(1345.25, 2);
  });

  it('Muller - hombre, no usa talla (peso=70, edad=30)', () => {
    expect(calcularTMB('MULLER', 'M', 70, 175, 30)).toBeCloseTo(1689.128, 2);
  });

  it('Muller - mujer, no usa talla (peso=60, edad=25)', () => {
    expect(calcularTMB('MULLER', 'F', 60, 165, 25)).toBeCloseTo(1353.28, 2);
  });
});

describe('calcularPromedioSemanal', () => {
  it('reproduce el ejemplo real del usuario: TMB=1187.899005, sedentario x7 dias descanso, ligera x0 dias entreno', () => {
    const promedio = calcularPromedioSemanal(1187.899005, FACTORES_ACTIVIDAD.SEDENTARIO, 7, FACTORES_ACTIVIDAD.LIGERA, 0);
    expect(promedio).toBeCloseTo(1425.478806, 3);
  });

  it('combina dias de descanso y de entrenamiento con factores distintos', () => {
    // (1500*1.2*4 + 1500*1.375*3) / 7 = (7200 + 6187.5) / 7 = 1912.5
    const promedio = calcularPromedioSemanal(1500, FACTORES_ACTIVIDAD.SEDENTARIO, 4, FACTORES_ACTIVIDAD.LIGERA, 3);
    expect(promedio).toBeCloseTo(1912.5, 3);
  });
});

describe('aplicarPorcentaje', () => {
  const promedio = 1425.478806;

  it('deficit 15% reproduce el ejemplo real del usuario', () => {
    expect(aplicarPorcentaje(promedio, 'DEFICIT', 15)).toBeCloseTo(1211.656985, 3);
  });

  it('deficit 20% reproduce el ejemplo real del usuario', () => {
    expect(aplicarPorcentaje(promedio, 'DEFICIT', 20)).toBeCloseTo(1140.383045, 3);
  });

  it('superavit 10% reproduce el ejemplo real del usuario', () => {
    expect(aplicarPorcentaje(promedio, 'SUPERAVIT', 10)).toBeCloseTo(1568.026687, 3);
  });

  it('superavit 15% reproduce el ejemplo real del usuario', () => {
    expect(aplicarPorcentaje(promedio, 'SUPERAVIT', 15)).toBeCloseTo(1639.300627, 3);
  });

  it('superavit 20% reproduce el ejemplo real del usuario', () => {
    expect(aplicarPorcentaje(promedio, 'SUPERAVIT', 20)).toBeCloseTo(1710.574567, 3);
  });

  it('mantenimiento no cambia el promedio', () => {
    expect(aplicarPorcentaje(promedio, 'MANTENIMIENTO', 0)).toBeCloseTo(promedio, 6);
  });
});

describe('FACTORES_ACTIVIDAD', () => {
  it('expone los 5 niveles con los multiplicadores correctos', () => {
    expect(FACTORES_ACTIVIDAD.SEDENTARIO).toBe(1.2);
    expect(FACTORES_ACTIVIDAD.LIGERA).toBe(1.375);
    expect(FACTORES_ACTIVIDAD.MODERADA).toBe(1.5);
    expect(FACTORES_ACTIVIDAD.MUY_ACTIVO).toBe(1.725);
    expect(FACTORES_ACTIVIDAD.EXTRA_ACTIVO).toBe(1.9);
  });
});
```

- [ ] **Step 5: Ejecutar y confirmar que falla**

Run: `npx vitest run src/utils/calorieFormulas.test.ts`
Expected: FAIL — `Cannot find module './calorieFormulas'` (el archivo no existe todavía).

- [ ] **Step 6: Implementar el módulo**

Create `src/utils/calorieFormulas.ts`:

```typescript
export type FormulaTMB = 'HARRIS_BENEDICT_OBESOS' | 'MIFFLIN_ST_JEOR' | 'MULLER';
export type Sexo = 'M' | 'F';
export type DireccionPrescripcion = 'DEFICIT' | 'SUPERAVIT' | 'MANTENIMIENTO';

export const FACTORES_ACTIVIDAD = {
  SEDENTARIO: 1.2,
  LIGERA: 1.375,
  MODERADA: 1.5,
  MUY_ACTIVO: 1.725,
  EXTRA_ACTIVO: 1.9,
} as const;

// Peso en kg, talla en cm, edad en años. Se usa el peso real del paciente
// (sin peso ajustado/corregido) en las 3 fórmulas — confirmado con el usuario.
export function calcularTMB(formula: FormulaTMB, sexo: Sexo, peso: number, talla: number, edad: number): number {
  switch (formula) {
    case 'HARRIS_BENEDICT_OBESOS':
      return sexo === 'M'
        ? 88.362 + 13.397 * peso + 4.799 * talla - 5.677 * edad
        : 447.593 + 9.247 * peso + 3.098 * talla - 4.330 * edad;
    case 'MIFFLIN_ST_JEOR':
      return sexo === 'M'
        ? 10 * peso + 6.25 * talla - 5 * edad + 5
        : 10 * peso + 6.25 * talla - 5 * edad - 161;
    case 'MULLER':
      // No usa talla.
      return sexo === 'M'
        ? (0.047 * peso - 0.01452 * edad + 3.21 + 1.009) * 238.8
        : (0.047 * peso - 0.01452 * edad + 3.21) * 238.8;
  }
}

export function calcularPromedioSemanal(
  tmb: number,
  factorActividadDescanso: number,
  diasDescanso: number,
  factorActividadEntreno: number,
  diasEntrenamiento: number
): number {
  return (tmb * factorActividadDescanso * diasDescanso + tmb * factorActividadEntreno * diasEntrenamiento) / 7;
}

export function aplicarPorcentaje(promedio: number, direccion: DireccionPrescripcion, porcentaje: number): number {
  if (direccion === 'DEFICIT') return promedio * (1 - porcentaje / 100);
  if (direccion === 'SUPERAVIT') return promedio * (1 + porcentaje / 100);
  return promedio;
}
```

- [ ] **Step 7: Ejecutar y confirmar que pasa**

Run: `npx vitest run src/utils/calorieFormulas.test.ts`
Expected: PASS — 12 tests, 0 failures.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/utils/calorieFormulas.ts src/utils/calorieFormulas.test.ts
git commit -m "$(cat <<'EOF'
Add pure calorieFormulas module with TMB/weekly-average/deficit-surplus math

Covers Harris Benedict (Obesos), Mifflin St Jeor and Muller, verified
against the user-provided reference numbers.
EOF
)"
```

---

## Task 2: Tipos nuevos en `mockData.ts`

**Files:**
- Modify: `src/data/mockData.ts:70-97` (interface `Patient`)
- Modify: `src/data/mockData.ts:174-182` (`Consultation.dieta`)
- Modify: `src/data/mockData.ts:637` (después de `defaultCalendarBlocks`)

**Interfaces:**
- Consumes: nada de tareas anteriores.
- Produces: `Patient.sexo?: 'M' | 'F'`, `Consultation.dieta.prescripcionCalorica` (usa `FormulaTMB`/`DireccionPrescripcion` de Task 1), `PorcentajeDieta` interface, `defaultPorcentajesDieta: PorcentajeDieta[]`. Las tareas 3-8 dependen de estos tipos.

- [ ] **Step 1: Agregar `sexo` a `Patient`**

En `src/data/mockData.ts:70-97`, el interface actual es:

```typescript
export interface Patient {
  id: number;
  idCompania: number;
  nombreCompleto: string;
  fechaNacimiento: string;
  edad: number;
  ocupacion: string;
  correoElectronico: string;
  situacionVivienda: 'SOLO' | 'ACOMPAÑADO' | 'FAMILIAR';
  tipoIdentificacion: '01' | '02' | '03' | '04' | 'EXT';
  identificacion: string;
  telefono: string;
  provinciaId: number;
  cantonId: number;
  distritoId: number;
  otrasSenas: string;
  // Antecedentes nutricionales
  diabetes: boolean;
  hipertension: boolean;
  gastritis: boolean;
  estrenimiento: boolean;
  alergiasAlimentarias: string;
  // Antecedentes fisioterapia
  fracturas: string;
  esguinces: string;
  cirugiasOrtopedicas: string;
  actividadFisica: string;
}
```

Reemplazar por (se agrega `sexo` opcional después de `edad`):

```typescript
export interface Patient {
  id: number;
  idCompania: number;
  nombreCompleto: string;
  fechaNacimiento: string;
  edad: number;
  sexo?: 'M' | 'F'; // opcional en ficha; requerido para calcular TMB (Harris Benedict/Mifflin/Muller)
  ocupacion: string;
  correoElectronico: string;
  situacionVivienda: 'SOLO' | 'ACOMPAÑADO' | 'FAMILIAR';
  tipoIdentificacion: '01' | '02' | '03' | '04' | 'EXT';
  identificacion: string;
  telefono: string;
  provinciaId: number;
  cantonId: number;
  distritoId: number;
  otrasSenas: string;
  // Antecedentes nutricionales
  diabetes: boolean;
  hipertension: boolean;
  gastritis: boolean;
  estrenimiento: boolean;
  alergiasAlimentarias: string;
  // Antecedentes fisioterapia
  fracturas: string;
  esguinces: string;
  cirugiasOrtopedicas: string;
  actividadFisica: string;
}
```

- [ ] **Step 2: Agregar `prescripcionCalorica` a `Consultation.dieta`**

En `src/data/mockData.ts:1`, el archivo empieza con:

```typescript
import { TableInfo } from './schema';
```

Agregar una línea nueva justo después:

```typescript
import { TableInfo } from './schema';
import type { FormulaTMB, DireccionPrescripcion } from '../utils/calorieFormulas';
```

En `src/data/mockData.ts:174-182`, el bloque actual es:

```typescript
  dieta?: {
    totalCalorias: number;
    desayuno: string;
    meriendaManana: string;
    almuerzo: string;
    meriendaTarde: string;
    cena: string;
    indicaciones: string;
  };
```

Reemplazar por:

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

- [ ] **Step 3: Agregar `PorcentajeDieta`**

En `src/data/mockData.ts`, justo después de la línea `export const defaultCalendarBlocks: CalendarBlock[] = [];` (línea 637), agregar:

```typescript

export interface PorcentajeDieta {
  id: number;
  idCompania: number;
  porcentaje: number;
}

export const defaultPorcentajesDieta: PorcentajeDieta[] = [];
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit -p .`
Expected: sin salida (sin errores). Nota: `ConsultationForm.tsx` todavía no usa estos campos nuevos, así que no debería haber errores relacionados a esta tarea.

- [ ] **Step 5: Commit**

```bash
git add src/data/mockData.ts
git commit -m "$(cat <<'EOF'
Add Patient.sexo, Consultation.dieta.prescripcionCalorica and PorcentajeDieta types

Groundwork for the caloric-prescription calculator; no behavior change yet.
EOF
)"
```

---

## Task 3: Columna `sexo` en `pacientes` (backend)

**Files:**
- Modify: `server.ts:607` (bloque de `ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS`)
- Modify: `server.ts:1662-1701` (`POST /api/patients`)

**Interfaces:**
- Consumes: `Patient.sexo` de Task 2.
- Produces: el campo `sexo` viaja de punta a punta (frontend → API → MySQL → API → frontend) para cualquier consumidor futuro.

- [ ] **Step 1: Agregar la columna**

En `server.ts:607`, justo después de la línea:

```typescript
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS actividadFisica TEXT NULL`);
```

agregar:

```typescript
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS sexo VARCHAR(1) NULL`);
```

- [ ] **Step 2: Propagar `sexo` en el UPDATE**

En `server.ts:1671-1677`, el bloque actual es:

```typescript
            await pool.query(
              "UPDATE pacientes SET idCompania = ?, id_compania = ?, nombreCompleto = ?, nombre_completo = ?, fechaNacimiento = ?, fecha_nacimiento = ?, edad = ?, ocupacion = ?, correoElectronico = ?, correo_electronico = ?, situacionVivienda = ?, situacion_vivienda = ?, tipoIdentificacion = ?, fact_tipo_identificacion = ?, identificacion = ?, fact_identificacion = ?, telefono = ?, provinciaId = ?, cantonId = ?, distritoId = ?, otrasSenas = ?, diabetes = ?, hipertension = ?, gastritis = ?, estrenimiento = ?, alergiasAlimentarias = ?, fracturas = ?, esguinces = ?, cirugiasOrtopedicas = ?, actividadFisica = ? WHERE id = ? OR id_paciente = ?",
              [
                parseInt(p.idCompania), parseInt(p.idCompania), p.nombreCompleto, p.nombreCompleto, p.fechaNacimiento, p.fechaNacimiento, parseInt(p.edad), p.ocupacion, p.correoElectronico, p.correoElectronico, p.situacionVivienda, p.situacionVivienda, p.tipoIdentificacion, p.tipoIdentificacion, p.identificacion, p.identificacion, p.telefono, parseInt(p.provinciaId), parseInt(p.cantonId), parseInt(p.distritoId), p.otrasSenas, p.diabetes ? 1 : 0, p.hipertension ? 1 : 0, p.gastritis ? 1 : 0, p.estrenimiento ? 1 : 0, p.alergiasAlimentarias, p.fracturas, p.esguinces, p.cirugiasOrtopedicas, p.actividadFisica,
                p.id, p.id
              ]
            );
```

Reemplazar por:

```typescript
            await pool.query(
              "UPDATE pacientes SET idCompania = ?, id_compania = ?, nombreCompleto = ?, nombre_completo = ?, fechaNacimiento = ?, fecha_nacimiento = ?, edad = ?, sexo = ?, ocupacion = ?, correoElectronico = ?, correo_electronico = ?, situacionVivienda = ?, situacion_vivienda = ?, tipoIdentificacion = ?, fact_tipo_identificacion = ?, identificacion = ?, fact_identificacion = ?, telefono = ?, provinciaId = ?, cantonId = ?, distritoId = ?, otrasSenas = ?, diabetes = ?, hipertension = ?, gastritis = ?, estrenimiento = ?, alergiasAlimentarias = ?, fracturas = ?, esguinces = ?, cirugiasOrtopedicas = ?, actividadFisica = ? WHERE id = ? OR id_paciente = ?",
              [
                parseInt(p.idCompania), parseInt(p.idCompania), p.nombreCompleto, p.nombreCompleto, p.fechaNacimiento, p.fechaNacimiento, parseInt(p.edad), p.sexo || null, p.ocupacion, p.correoElectronico, p.correoElectronico, p.situacionVivienda, p.situacionVivienda, p.tipoIdentificacion, p.tipoIdentificacion, p.identificacion, p.identificacion, p.telefono, parseInt(p.provinciaId), parseInt(p.cantonId), parseInt(p.distritoId), p.otrasSenas, p.diabetes ? 1 : 0, p.hipertension ? 1 : 0, p.gastritis ? 1 : 0, p.estrenimiento ? 1 : 0, p.alergiasAlimentarias, p.fracturas, p.esguinces, p.cirugiasOrtopedicas, p.actividadFisica,
                p.id, p.id
              ]
            );
```

- [ ] **Step 3: Propagar `sexo` en el INSERT**

En `server.ts:1681-1686`, el bloque actual es:

```typescript
        const [result] = await pool.query(
          "INSERT INTO pacientes (idCompania, id_compania, nombreCompleto, nombre_completo, fechaNacimiento, fecha_nacimiento, edad, ocupacion, correoElectronico, correo_electronico, situacionVivienda, situacion_vivienda, tipoIdentificacion, fact_tipo_identificacion, identificacion, fact_identificacion, telefono, provinciaId, cantonId, distritoId, otrasSenas, diabetes, hipertension, gastritis, estrenimiento, alergiasAlimentarias, fracturas, esguinces, cirugiasOrtopedicas, actividadFisica) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            parseInt(p.idCompania), parseInt(p.idCompania), p.nombreCompleto, p.nombreCompleto, p.fechaNacimiento, p.fechaNacimiento, parseInt(p.edad), p.ocupacion, p.correoElectronico, p.correoElectronico, p.situacionVivienda, p.situacionVivienda, p.tipoIdentificacion, p.tipoIdentificacion, p.identificacion, p.identificacion, p.telefono, parseInt(p.provinciaId), parseInt(p.cantonId), parseInt(p.distritoId), p.otrasSenas, p.diabetes ? 1 : 0, p.hipertension ? 1 : 0, p.gastritis ? 1 : 0, p.estrenimiento ? 1 : 0, p.alergiasAlimentarias, p.fracturas, p.esguinces, p.cirugiasOrtopedicas, p.actividadFisica
          ]
        );
```

Reemplazar por:

```typescript
        const [result] = await pool.query(
          "INSERT INTO pacientes (idCompania, id_compania, nombreCompleto, nombre_completo, fechaNacimiento, fecha_nacimiento, edad, sexo, ocupacion, correoElectronico, correo_electronico, situacionVivienda, situacion_vivienda, tipoIdentificacion, fact_tipo_identificacion, identificacion, fact_identificacion, telefono, provinciaId, cantonId, distritoId, otrasSenas, diabetes, hipertension, gastritis, estrenimiento, alergiasAlimentarias, fracturas, esguinces, cirugiasOrtopedicas, actividadFisica) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            parseInt(p.idCompania), parseInt(p.idCompania), p.nombreCompleto, p.nombreCompleto, p.fechaNacimiento, p.fechaNacimiento, parseInt(p.edad), p.sexo || null, p.ocupacion, p.correoElectronico, p.correoElectronico, p.situacionVivienda, p.situacionVivienda, p.tipoIdentificacion, p.tipoIdentificacion, p.identificacion, p.identificacion, p.telefono, parseInt(p.provinciaId), parseInt(p.cantonId), parseInt(p.distritoId), p.otrasSenas, p.diabetes ? 1 : 0, p.hipertension ? 1 : 0, p.gastritis ? 1 : 0, p.estrenimiento ? 1 : 0, p.alergiasAlimentarias, p.fracturas, p.esguinces, p.cirugiasOrtopedicas, p.actividadFisica
          ]
        );
```

(El fallback en memoria, `localPatients`, no necesita cambios — ya hace `localPatients.push(p)`/`.map(item => item.id === p.id ? p : item)` con el objeto completo, así que `sexo` viaja automáticamente.)

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit -p .`
Expected: sin salida.

- [ ] **Step 5: Commit**

```bash
git add server.ts
git commit -m "$(cat <<'EOF'
Add sexo column to pacientes and wire it through POST /api/patients

Required input for the TMB formulas (Harris Benedict/Mifflin/Muller
all branch on sex).
EOF
)"
```

---

## Task 4: Tabla y endpoints de `compania_porcentajes_dieta` (backend)

**Files:**
- Modify: `server.ts:41` (import de tipos)
- Modify: `server.ts:44-56` (import de defaults)
- Modify: `server.ts:74` (arrays en memoria)
- Modify: `server.ts:508` (creación de tabla, después de `compania_smtp_config`)
- Modify: `server.ts:1895-1896` (nuevos endpoints, después de `DELETE /api/calendar-blocks/:id`)

**Interfaces:**
- Consumes: `PorcentajeDieta`, `defaultPorcentajesDieta` de Task 2.
- Produces: `GET /api/porcentajes-dieta`, `POST /api/porcentajes-dieta`, `DELETE /api/porcentajes-dieta/:id` — consumidos por `App.tsx` en Task 6.

- [ ] **Step 1: Importar el tipo y el default**

En `server.ts:41`, el import actual es:

```typescript
import type { Company, Patient, Cita, Consultation, CalendarBlock, CompanyPayment, HorarioAtencion, Servicio, Factura, CuentaCobrar, PagoCuentaCobrar, Proveedor, CuentaPagar, PagoCuentaPagar, ReporteD104, ReporteD101, GastosManualesAnuales } from "./src/data/mockData";
```

Reemplazar por (se agrega `PorcentajeDieta`):

```typescript
import type { Company, Patient, Cita, Consultation, CalendarBlock, CompanyPayment, HorarioAtencion, Servicio, Factura, CuentaCobrar, PagoCuentaCobrar, Proveedor, CuentaPagar, PagoCuentaPagar, ReporteD104, ReporteD101, GastosManualesAnuales, PorcentajeDieta } from "./src/data/mockData";
```

En `server.ts:44-56`, el import actual es:

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
  defaultFacturas
} from "./src/data/mockData";
```

Reemplazar por (se agrega `defaultPorcentajesDieta`):

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

- [ ] **Step 2: Array de respaldo en memoria**

En `server.ts:74`, justo después de:

```typescript
let localCalendarBlocks = [...defaultCalendarBlocks];
```

agregar:

```typescript
let localPorcentajesDieta: PorcentajeDieta[] = [...defaultPorcentajesDieta];
```

- [ ] **Step 3: Crear la tabla**

En `server.ts`, justo después del bloque que crea `compania_smtp_config` (termina en la línea 508 con `` `); ``):

```typescript
    await pool.query(`
      CREATE TABLE IF NOT EXISTS compania_smtp_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idCompania INT NOT NULL,
        proveedor VARCHAR(50) NOT NULL DEFAULT 'OTRO',
        smtpHost VARCHAR(255),
        smtpPort INT NOT NULL DEFAULT 587,
        smtpSeguridad VARCHAR(50) NOT NULL DEFAULT 'TLS',
        smtpUsuario VARCHAR(255),
        smtpPasswordCifrado VARCHAR(255),
        remitenteNombre VARCHAR(255),
        remitenteCorreo VARCHAR(255),
        recordatorioHorasAntes INT NOT NULL DEFAULT 24,
        activo BOOLEAN NOT NULL DEFAULT FALSE,
        UNIQUE KEY unique_compania (idCompania)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
```

agregar inmediatamente después (antes del bloque de `notification_logs`):

```typescript
    await pool.query(`
      CREATE TABLE IF NOT EXISTS compania_porcentajes_dieta (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idCompania INT NOT NULL,
        porcentaje DECIMAL(5,2) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
```

- [ ] **Step 4: Endpoints GET/POST/DELETE**

En `server.ts`, justo después del cierre del endpoint `DELETE /api/calendar-blocks/:id` (línea 1895, `});`) y antes del comentario `// 10. Servicios` (línea 1897), agregar:

```typescript
  app.get("/api/porcentajes-dieta", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM compania_porcentajes_dieta WHERE idCompania = ?", [session.idCompania]);
        res.json(rows);
      } else {
        res.json(localPorcentajesDieta.filter(p => p.idCompania === session.idCompania));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/porcentajes-dieta", requireAuth, async (req, res) => {
    try {
      const p = req.body;
      p.idCompania = sessionOf(req).idCompania;
      if (dbConnected && pool) {
        if (p.id) {
          const [exists] = await pool.query("SELECT id FROM compania_porcentajes_dieta WHERE id = ? AND idCompania = ?", [p.id, parseInt(p.idCompania)]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE compania_porcentajes_dieta SET idCompania = ?, porcentaje = ? WHERE id = ?",
              [parseInt(p.idCompania), parseFloat(p.porcentaje), p.id]
            );
            return res.json(p);
          }
        }
        const [result] = await pool.query(
          "INSERT INTO compania_porcentajes_dieta (idCompania, porcentaje) VALUES (?, ?)",
          [parseInt(p.idCompania), parseFloat(p.porcentaje)]
        );
        p.id = (result as any).insertId;
        res.json(p);
      } else {
        if (p.id) {
          localPorcentajesDieta = localPorcentajesDieta.map(item => item.id === p.id ? p : item);
        } else {
          p.id = Math.max(0, ...localPorcentajesDieta.map(item => item.id)) + 1;
          localPorcentajesDieta.push(p);
        }
        res.json(p);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/porcentajes-dieta/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const idCompania = sessionOf(req).idCompania;
      if (dbConnected && pool) {
        await pool.query("DELETE FROM compania_porcentajes_dieta WHERE id = ? AND idCompania = ?", [id, idCompania]);
        res.json({ success: true });
      } else {
        localPorcentajesDieta = localPorcentajesDieta.filter(item => !(item.id === id && item.idCompania === idCompania));
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
Add compania_porcentajes_dieta table and CRUD endpoints

Per-company configurable list of deficit/surplus percentages, following
the same dual-mode (MySQL/in-memory) pattern as calendar_blocks.
EOF
)"
```

---

## Task 5: Campo "Sexo" en `PatientForm.tsx`

**Files:**
- Modify: `src/components/PatientForm.tsx:24-36` (estado)
- Modify: `src/components/PatientForm.tsx:50-74` (hidratación al editar)
- Modify: `src/components/PatientForm.tsx:101-126` (payload al guardar)
- Modify: `src/components/PatientForm.tsx:183-213` (JSX)

**Interfaces:**
- Consumes: `Patient.sexo` de Task 2.
- Produces: nada nuevo — el paciente guardado ahora puede traer `sexo`, que `ConsultationForm.tsx` (Task 8) necesita para calcular TMB.

- [ ] **Step 1: Agregar estado**

En `src/components/PatientForm.tsx:26`, justo después de:

```typescript
  const [edad, setEdad] = useState(30);
```

agregar:

```typescript
  const [sexo, setSexo] = useState<'M' | 'F' | ''>('');
```

- [ ] **Step 2: Hidratar al editar**

En `src/components/PatientForm.tsx:54`, justo después de:

```typescript
      setEdad(editingPatient.edad);
```

agregar:

```typescript
      setSexo(editingPatient.sexo || '');
```

- [ ] **Step 3: Incluir en el payload de guardado**

En `src/components/PatientForm.tsx:101-126`, el objeto actual empieza:

```typescript
    const patientData: Patient = {
      id: editingPatient ? editingPatient.id : Math.max(0, ...patients.map(p => p.id)) + 1,
      idCompania: companyId,
      nombreCompleto: nombre,
      fechaNacimiento: fechaNac,
      edad: edad,
      ocupacion: ocupacion,
```

Reemplazar esas líneas por (se agrega `sexo` después de `edad`):

```typescript
    const patientData: Patient = {
      id: editingPatient ? editingPatient.id : Math.max(0, ...patients.map(p => p.id)) + 1,
      idCompania: companyId,
      nombreCompleto: nombre,
      fechaNacimiento: fechaNac,
      edad: edad,
      sexo: sexo || undefined,
      ocupacion: ocupacion,
```

- [ ] **Step 4: Agregar el selector en el formulario**

En `src/components/PatientForm.tsx:183-213`, el bloque actual es:

```tsx
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-slate-600 font-medium mb-1">Nombre Completo *</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="ej: María Delgado"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                required
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Fecha de Nacimiento</label>
              <input
                type="date"
                value={fechaNac}
                onChange={(e) => handleBirthdateChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Edad calculada</label>
              <input
                type="number"
                value={edad}
                disabled
                className="w-full bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 font-bold"
              />
            </div>
          </div>
```

Reemplazar por (grid de 3 a 4 columnas, se agrega el selector de Sexo):

```tsx
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-slate-600 font-medium mb-1">Nombre Completo *</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="ej: María Delgado"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                required
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Fecha de Nacimiento</label>
              <input
                type="date"
                value={fechaNac}
                onChange={(e) => handleBirthdateChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Edad calculada</label>
              <input
                type="number"
                value={edad}
                disabled
                className="w-full bg-slate-100 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-500 font-bold"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Sexo</label>
              <select
                value={sexo}
                onChange={(e) => setSexo(e.target.value as 'M' | 'F' | '')}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
              >
                <option value="">Sin especificar</option>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
              </select>
            </div>
          </div>
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit -p .`
Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
git add src/components/PatientForm.tsx
git commit -m "$(cat <<'EOF'
Add optional Sexo selector to PatientForm

Not required to save a patient, but needed later to calculate TMB via
Harris Benedict/Mifflin/Muller.
EOF
)"
```

---

## Task 6: Wiring de `porcentajesDieta` en `App.tsx`

**Files:**
- Modify: `src/App.tsx:42-67` (imports de tipos y defaults)
- Modify: `src/App.tsx:134-137` (estado, después de `calendarBlocks`)
- Modify: `src/App.tsx:219-222` (fetch inicial)
- Modify: `src/App.tsx:268-269` (persistencia a localStorage)
- Modify: `src/App.tsx:513-533` (handlers, después de `handleSaveCalendarBlock`)
- Modify: `src/App.tsx:700-709` (handlers, después de `handleDeleteCalendarBlock`)
- Modify: `src/App.tsx:1155-1162` (props de `<ConsultationForm>`)
- Modify: `src/App.tsx:1804-1819` (props de `<CompanySettings>`)

**Interfaces:**
- Consumes: `PorcentajeDieta` de Task 2, `/api/porcentajes-dieta` (GET/POST/DELETE) de Task 4.
- Produces: prop `porcentajesDieta: PorcentajeDieta[]` y handlers `onSavePorcentajeDieta`/`onDeletePorcentajeDieta`, consumidos por `CompanySettings.tsx` (Task 7) y `ConsultationForm.tsx` (Task 8).

- [ ] **Step 1: Importar el tipo y el default**

En `src/App.tsx:50`, dentro del bloque de import de `./data/mockData`, justo después de:

```typescript
  defaultCalendarBlocks,
```

agregar:

```typescript
  defaultPorcentajesDieta,
```

Y en el mismo bloque de import, justo después de:

```typescript
  CalendarBlock,
```

agregar:

```typescript
  PorcentajeDieta,
```

- [ ] **Step 2: Estado**

En `src/App.tsx:134-137`, justo después de:

```typescript
  const [calendarBlocks, setCalendarBlocks] = useState<CalendarBlock[]>(() => {
    const local = localStorage.getItem('fisio_calendar_blocks');
    return local ? JSON.parse(local) : defaultCalendarBlocks;
  });
```

agregar:

```typescript

  const [porcentajesDieta, setPorcentajesDieta] = useState<PorcentajeDieta[]>(() => {
    const local = localStorage.getItem('fisio_porcentajes_dieta');
    return local ? JSON.parse(local) : defaultPorcentajesDieta;
  });
```

- [ ] **Step 3: Fetch inicial**

En `src/App.tsx:219-222`, justo después de:

```typescript
    fetch('/api/calendar-blocks')
      .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then(data => { if (data && data.length > 0) setCalendarBlocks(data); })
      .catch(err => console.log("MySQL offline, using local fallback for calendar blocks"));
```

agregar:

```typescript

    fetch('/api/porcentajes-dieta')
      .then(res => { if (!res.ok) throw new Error("API error"); return res.json(); })
      .then(data => { if (data && data.length > 0) setPorcentajesDieta(data); })
      .catch(err => console.log("MySQL offline, using local fallback for porcentajes de dieta"));
```

- [ ] **Step 4: Persistencia a localStorage**

En `src/App.tsx:268-269`, justo después de:

```typescript
    localStorage.setItem('fisio_calendar_blocks', JSON.stringify(calendarBlocks));
  }, [calendarBlocks]);
```

agregar:

```typescript

  useEffect(() => {
    localStorage.setItem('fisio_porcentajes_dieta', JSON.stringify(porcentajesDieta));
  }, [porcentajesDieta]);
```

- [ ] **Step 5: Handler de guardado**

En `src/App.tsx`, justo después del cierre de `handleSaveCalendarBlock` (línea 533, `};`):

```typescript
  const handleSaveCalendarBlock = (block: CalendarBlock) => {
    fetch('/api/calendar-blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(block)
    })
    .then(res => res.json())
    .then(data => {
      setCalendarBlocks(prev => {
        const exists = prev.some(b => b.id === data.id);
        return exists ? prev.map(b => b.id === data.id ? data : b) : [...prev, data];
      });
    })
    .catch(err => {
      console.error("Error saving calendar block to MySQL:", err);
      setCalendarBlocks(prev => {
        const exists = prev.some(b => b.id === block.id);
        return exists ? prev.map(b => b.id === block.id ? block : b) : [...prev, block];
      });
    });
  };
```

agregar:

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

- [ ] **Step 6: Handler de borrado**

En `src/App.tsx`, justo después del cierre de `handleDeleteCalendarBlock` (línea 709, `};`):

```typescript
  const handleDeleteCalendarBlock = (id: number) => {
    fetch(`/api/calendar-blocks/${id}`, { method: 'DELETE' })
      .then(() => {
        setCalendarBlocks(prev => prev.filter(b => b.id !== id));
      })
      .catch(err => {
        console.error("Error deleting calendar block from MySQL:", err);
        setCalendarBlocks(prev => prev.filter(b => b.id !== id));
      });
  };
```

agregar:

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

- [ ] **Step 7: Pasar la prop a `<ConsultationForm>`**

En `src/App.tsx:1155-1162`:

```tsx
          <ConsultationForm
            patient={activeConsultationPatient}
            editingConsultation={editingConsultation}
            onSave={handleSaveConsultation}
            onCancel={() => { setActiveConsultationPatient(null); setEditingConsultation(null); }}
            themeColor={activeCompany.colorPrimario}
            perfilCompania={activeCompany.perfilCompania || 'Ambas'}
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
          />
```

- [ ] **Step 8: Pasar las props a `<CompanySettings>`**

En `src/App.tsx:1804-1819`:

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
              />
```

- [ ] **Step 9: Verificar tipos (fallará hasta las tareas 7 y 8 — esperado)**

Run: `npx tsc --noEmit -p .`
Expected: errores `TS2322`/`TS2741` en `CompanySettings` y `ConsultationForm` porque todavía no aceptan esas props — se resuelven en las tareas 7 y 8. Confirmar que el ÚNICO error nuevo es sobre estas dos props que faltan (no debe haber errores de sintaxis en `App.tsx`).

- [ ] **Step 10: Commit**

```bash
git add src/App.tsx
git commit -m "$(cat <<'EOF'
Wire porcentajesDieta state/fetch/handlers through App.tsx

Passes the company-scoped percentage list down to CompanySettings and
ConsultationForm (both implemented in the next two tasks).
EOF
)"
```

---

## Task 7: Gestión de porcentajes en `CompanySettings.tsx`

**Files:**
- Modify: `src/components/CompanySettings.tsx:1-21` (imports y props)
- Modify: `src/components/CompanySettings.tsx:1561` (nueva sección JSX, después de "Horario de Atención")

**Interfaces:**
- Consumes: `PorcentajeDieta` de Task 2; props `porcentajesDieta`, `onSavePorcentajeDieta`, `onDeletePorcentajeDieta` de Task 6.
- Produces: nada nuevo consumido por otras tareas — es hoja del árbol de componentes.

- [ ] **Step 1: Importar el tipo**

En `src/components/CompanySettings.tsx:2`:

```typescript
import { Company, CompaniaSmtpConfig, SmtpConfigInput, HaciendaConfig, HaciendaConfigInput, User, HorarioAtencion, DEFAULT_HORARIO_ATENCION, Servicio } from '../data/mockData';
```

Reemplazar por:

```typescript
import { Company, CompaniaSmtpConfig, SmtpConfigInput, HaciendaConfig, HaciendaConfigInput, User, HorarioAtencion, DEFAULT_HORARIO_ATENCION, Servicio, PorcentajeDieta } from '../data/mockData';
```

- [ ] **Step 2: Agregar props**

En `src/components/CompanySettings.tsx:6-21`, el interface actual es:

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
}
```

Reemplazar por (se agregan las 3 props al final):

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
```

En `src/components/CompanySettings.tsx:23-38`, el destructuring actual es:

```typescript
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
  onAjustarStock
}: CompanySettingsProps) {
```

Reemplazar por:

```typescript
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

- [ ] **Step 3: Estado local para el input de "agregar porcentaje"**

En `src/components/CompanySettings.tsx:54` (justo después de la línea `const [horarioGuardado, setHorarioGuardado] = useState(false);`), agregar:

```typescript

  // Porcentajes de Déficit/Superávit para Dietas
  const [nuevoPorcentaje, setNuevoPorcentaje] = useState('');
  const porcentajesDeEstaEmpresa = porcentajesDieta.filter(p => p.idCompania === currentCompany.id);

  const handleAgregarPorcentaje = () => {
    const valor = parseFloat(nuevoPorcentaje);
    if (isNaN(valor) || valor < 0) return;
    onSavePorcentajeDieta({ id: 0, idCompania: currentCompany.id, porcentaje: valor });
    setNuevoPorcentaje('');
  };
```

- [ ] **Step 4: JSX — nueva sección**

En `src/components/CompanySettings.tsx:1561`, justo después del cierre de la sección "Horario de Atención":

```tsx
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleGuardarHorario}
              className="text-white px-3 py-1.5 rounded-lg font-semibold"
              style={{ backgroundColor: currentCompany.colorPrimario }}
            >
              Guardar Horario
            </button>
            {horarioGuardado && (
              <span className="text-emerald-600 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Horario guardado
              </span>
            )}
          </div>
        </div>
      )}
```

agregar (nueva sección, misma condición de visibilidad que "Horario de Atención"):

```tsx

      {!isEditing && !isAdding && currentUser.rol === 'Administrador' && (
        <div className="mt-5 p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
            <Sparkles className="w-4 h-4 text-slate-600" style={{ color: currentCompany.colorPrimario }} />
            <div>
              <h4 className="font-bold text-slate-800">Porcentajes de Déficit/Superávit para Dietas</h4>
              <p className="text-[10px] text-slate-500">Los nutricionistas de esta empresa eligen entre estos porcentajes al calcular la prescripción calórica de una dieta. Puede incluir 0% (mantenimiento).</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {porcentajesDeEstaEmpresa.length === 0 && (
              <span className="text-slate-400">Sin porcentajes configurados — se usará el respaldo 10% / 15% / 20%.</span>
            )}
            {porcentajesDeEstaEmpresa.map(p => (
              <span key={p.id} className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-full pl-3 pr-1.5 py-1">
                {Number(p.porcentaje)}%
                <button
                  type="button"
                  onClick={() => onDeletePorcentajeDieta(p.id)}
                  className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full p-0.5"
                  title="Eliminar"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>

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
```

El ícono `X` no está importado todavía en este archivo. En `src/components/CompanySettings.tsx:4`:

```typescript
import { Plus, Check, Settings, Image as ImageIcon, Sparkles, Building, Mail, ShieldCheck, Upload, AlertCircle, Users as UsersIcon, UserPlus, Power, Clock, Receipt, Edit } from 'lucide-react';
```

Reemplazar por (se agrega `X` al final):

```typescript
import { Plus, Check, Settings, Image as ImageIcon, Sparkles, Building, Mail, ShieldCheck, Upload, AlertCircle, Users as UsersIcon, UserPlus, Power, Clock, Receipt, Edit, X } from 'lucide-react';
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit -p .`
Expected: los errores sobre `CompanySettings` de la Task 6 desaparecen. Puede quedar el error sobre `ConsultationForm` (se resuelve en Task 8).

- [ ] **Step 6: Commit**

```bash
git add src/components/CompanySettings.tsx
git commit -m "$(cat <<'EOF'
Add per-company deficit/surplus percentage management to CompanySettings

Admins can add/remove percentage options (including 0%) via the new
compania_porcentajes_dieta table.
EOF
)"
```

---

## Task 8: Calculadora de prescripción calórica en `ConsultationForm.tsx`

**Files:**
- Modify: `src/components/ConsultationForm.tsx:1-14` (imports)
- Modify: `src/components/ConsultationForm.tsx:160-164` (nuevo estado, después del bloque SOAP)
- Modify: `src/components/ConsultationForm.tsx:254-262` (restauración en el `useEffect` de edición, dentro del bloque `if (d) { ... }`)
- Modify: `src/components/ConsultationForm.tsx:350-358` (persistencia dentro de `dieta: { ... }` en `handleFormSubmit`)
- Modify: `src/components/ConsultationForm.tsx:1584-1595` (JSX — nueva sección antes de "Presupuesto Calórico Diario")

**Interfaces:**
- Consumes: `calcularTMB`, `calcularPromedioSemanal`, `aplicarPorcentaje`, `FACTORES_ACTIVIDAD`, tipos `FormulaTMB`/`DireccionPrescripcion` de Task 1; `Patient.sexo` de Task 2/5; prop `porcentajesDieta` de Task 6.
- Produces: nada consumido por otras tareas — es la última pieza del flujo.

- [ ] **Step 1: Imports**

En `src/components/ConsultationForm.tsx:1-4`:

```typescript
import React, { useState, useEffect } from 'react';
import { Patient, Consultation } from '../data/mockData';
import { Sparkles, Save, X, Calendar, ClipboardList, Activity, Heart, Dumbbell, ChevronRight } from 'lucide-react';
import PainMapSelector from './PainMapSelector';
```

Reemplazar por:

```typescript
import React, { useState, useEffect } from 'react';
import { Patient, Consultation, PorcentajeDieta } from '../data/mockData';
import { Sparkles, Save, X, Calendar, ClipboardList, Activity, Heart, Dumbbell, ChevronRight, Calculator, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import PainMapSelector from './PainMapSelector';
import { calcularTMB, calcularPromedioSemanal, aplicarPorcentaje, FACTORES_ACTIVIDAD, FormulaTMB, DireccionPrescripcion } from '../utils/calorieFormulas';
```

- [ ] **Step 2: Prop nueva**

En `src/components/ConsultationForm.tsx`, el interface `ConsultationFormProps` (modificado en la sesión anterior) es:

```typescript
interface ConsultationFormProps {
  patient: Patient;
  editingConsultation: Consultation | null;
  onSave: (consultation: Consultation) => void;
  onCancel: () => void;
  themeColor: string;
  perfilCompania: 'Fisioterapia' | 'Nutrición' | 'Ambas';
}

export default function ConsultationForm({ patient, editingConsultation, onSave, onCancel, themeColor, perfilCompania }: ConsultationFormProps) {
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
}

export default function ConsultationForm({ patient, editingConsultation, onSave, onCancel, themeColor, perfilCompania, porcentajesDieta }: ConsultationFormProps) {
```

- [ ] **Step 3: Estado del calculador**

En `src/components/ConsultationForm.tsx:160-164`, justo después de:

```typescript
  // SOAP SOAP SOAP
  const [soapSubjetivo, setSoapSubjetivo] = useState('');
  const [soapObjetivo, setSoapObjetivo] = useState('');
  const [soapAnalisis, setSoapAnalisis] = useState('');
  const [soapPlan, setSoapPlan] = useState('');
```

agregar:

```typescript

  // Prescripción Calórica (Déficit/Superávit)
  const [formulaSeleccionada, setFormulaSeleccionada] = useState<FormulaTMB | null>(null);
  const [diasDescanso, setDiasDescanso] = useState(7);
  const [diasEntrenamiento, setDiasEntrenamiento] = useState(0);
  const [factorActividadDescanso, setFactorActividadDescanso] = useState<number>(FACTORES_ACTIVIDAD.SEDENTARIO);
  const [factorActividadEntreno, setFactorActividadEntreno] = useState<number>(FACTORES_ACTIVIDAD.LIGERA);
  const [direccionPrescripcion, setDireccionPrescripcion] = useState<DireccionPrescripcion>('DEFICIT');
  const [porcentajePrescripcion, setPorcentajePrescripcion] = useState<number>(0);

  const tmbPorFormula = patient.sexo ? {
    HARRIS_BENEDICT_OBESOS: calcularTMB('HARRIS_BENEDICT_OBESOS', patient.sexo, peso, talla, patient.edad),
    MIFFLIN_ST_JEOR: calcularTMB('MIFFLIN_ST_JEOR', patient.sexo, peso, talla, patient.edad),
    MULLER: calcularTMB('MULLER', patient.sexo, peso, talla, patient.edad),
  } : null;

  const tmbSeleccionado = formulaSeleccionada && tmbPorFormula ? tmbPorFormula[formulaSeleccionada] : null;

  const promedioMantenimiento = tmbSeleccionado != null
    ? calcularPromedioSemanal(tmbSeleccionado, factorActividadDescanso, diasDescanso, factorActividadEntreno, diasEntrenamiento)
    : null;

  const prescripcionFinal = promedioMantenimiento != null
    ? aplicarPorcentaje(promedioMantenimiento, direccionPrescripcion, porcentajePrescripcion)
    : null;

  const porcentajesDisponibles = porcentajesDieta.filter(p => p.idCompania === patient.idCompania).map(p => Number(p.porcentaje));
  const porcentajesParaMostrar = porcentajesDisponibles.length > 0 ? porcentajesDisponibles : [10, 15, 20];

  const handleAplicarPrescripcion = () => {
    if (tmbSeleccionado == null || prescripcionFinal == null) return;
    setTmb(Math.round(tmbSeleccionado));
    setCalorias(Math.round(prescripcionFinal));
  };
```

(`peso`, `talla`, `setTmb`, `setCalorias` ya existen como estado más arriba en el mismo componente — no se reimportan.)

- [ ] **Step 4: Restaurar al editar una consulta existente**

En el `useEffect` que restaura campos al editar (agregado en la sesión anterior — busca el bloque `if (d) { ... }` que contiene `setCalorias(d.totalCalorias);`):

```typescript
    if (d) {
      setCalorias(d.totalCalorias);
      setDesayuno(d.desayuno);
      setMeriendaMan(d.meriendaManana);
      setAlmuerzo(d.almuerzo);
      setMeriendaTar(d.meriendaTarde);
      setCena(d.cena);
      setIndicacionesDieta(d.indicaciones);
    }
```

Reemplazar por (se agrega la restauración de `prescripcionCalorica` al final del bloque):

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
      }
    }
```

- [ ] **Step 5: Persistir al guardar**

En `handleFormSubmit`, dentro del objeto `dieta: { ... }` (rama `tipo === 'Nutrición'`):

```typescript
        dieta: {
          totalCalorias: calorias,
          desayuno,
          meriendaManana: meriendaMan,
          almuerzo,
          meriendaTarde: meriendaTar,
          cena,
          indicaciones: indicacionesDieta
        },
```

Reemplazar por (se agrega `prescripcionCalorica` condicional):

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

- [ ] **Step 6: JSX — insertar la calculadora antes de "Presupuesto Calórico Diario"**

En `src/components/ConsultationForm.tsx:1584-1595`:

```tsx
              <div className="p-4 space-y-4">
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

Reemplazar por (se agrega el bloque de la calculadora justo antes del grid existente):

```tsx
              <div className="p-4 space-y-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4">
                  <div className="flex items-center gap-2 text-slate-700 font-bold">
                    <Calculator className="w-4 h-4 text-teal-600" />
                    Prescripción Calórica (Déficit/Superávit)
                  </div>

                  {!patient.sexo ? (
                    <p className="text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2.5">
                      Complete el sexo del paciente en su ficha para poder calcular la prescripción calórica.
                    </p>
                  ) : (
                    <>
                      <div>
                        <label className="block text-slate-600 font-semibold mb-1.5">1. Elija la fórmula de TMB</label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {(['HARRIS_BENEDICT_OBESOS', 'MIFFLIN_ST_JEOR', 'MULLER'] as FormulaTMB[]).map(f => {
                            const tmbCalculado = tmbPorFormula ? tmbPorFormula[f] : 0;
                            const seleccionada = formulaSeleccionada === f;
                            const etiquetas: Record<FormulaTMB, string> = {
                              HARRIS_BENEDICT_OBESOS: 'Harris Benedict (Obesos)',
                              MIFFLIN_ST_JEOR: 'Mifflin St Jeor',
                              MULLER: 'Müller'
                            };
                            return (
                              <button
                                type="button"
                                key={f}
                                onClick={() => setFormulaSeleccionada(f)}
                                className={`p-2.5 rounded-lg border text-left ${seleccionada ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100'}`}
                              >
                                <div className="font-semibold text-slate-700">{etiquetas[f]}</div>
                                <div className="text-lg font-black text-slate-800">{Math.round(tmbCalculado)} <span className="text-[10px] font-normal text-slate-400">kcal/día</span></div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {formulaSeleccionada && (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-slate-600 font-semibold mb-1">Días de descanso / semana</label>
                              <input
                                type="number"
                                min={0}
                                max={7}
                                value={diasDescanso}
                                onChange={(e) => setDiasDescanso(parseInt(e.target.value) || 0)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                              />
                              <select
                                value={factorActividadDescanso}
                                onChange={(e) => setFactorActividadDescanso(parseFloat(e.target.value))}
                                className="w-full mt-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                              >
                                <option value={FACTORES_ACTIVIDAD.SEDENTARIO}>Sedentario (1.2)</option>
                                <option value={FACTORES_ACTIVIDAD.LIGERA}>Actividad ligera (1.375)</option>
                                <option value={FACTORES_ACTIVIDAD.MODERADA}>Actividad moderada (1.5)</option>
                                <option value={FACTORES_ACTIVIDAD.MUY_ACTIVO}>Muy activo (1.725)</option>
                                <option value={FACTORES_ACTIVIDAD.EXTRA_ACTIVO}>Extra activo (1.9)</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-slate-600 font-semibold mb-1">Días de entrenamiento / semana</label>
                              <input
                                type="number"
                                min={0}
                                max={7}
                                value={diasEntrenamiento}
                                onChange={(e) => setDiasEntrenamiento(parseInt(e.target.value) || 0)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                              />
                              <select
                                value={factorActividadEntreno}
                                onChange={(e) => setFactorActividadEntreno(parseFloat(e.target.value))}
                                className="w-full mt-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
                              >
                                <option value={FACTORES_ACTIVIDAD.SEDENTARIO}>Sedentario (1.2)</option>
                                <option value={FACTORES_ACTIVIDAD.LIGERA}>Actividad ligera (1.375)</option>
                                <option value={FACTORES_ACTIVIDAD.MODERADA}>Actividad moderada (1.5)</option>
                                <option value={FACTORES_ACTIVIDAD.MUY_ACTIVO}>Muy activo (1.725)</option>
                                <option value={FACTORES_ACTIVIDAD.EXTRA_ACTIVO}>Extra activo (1.9)</option>
                              </select>
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-400">Nota: pacientes de menos de 60kg — se recomienda usar actividad ligera (Solís, L. 2020).</p>

                          {promedioMantenimiento != null && (
                            <p className="text-slate-700 font-semibold">
                              Promedio para mantenimiento: <span className="font-black">{Math.round(promedioMantenimiento)} kcal/día</span>
                            </p>
                          )}

                          <div>
                            <label className="block text-slate-600 font-semibold mb-1.5">3. Dirección y porcentaje</label>
                            <div className="flex gap-2 mb-2">
                              {(['DEFICIT', 'MANTENIMIENTO', 'SUPERAVIT'] as DireccionPrescripcion[]).map(d => (
                                <button
                                  type="button"
                                  key={d}
                                  onClick={() => { setDireccionPrescripcion(d); if (d === 'MANTENIMIENTO') setPorcentajePrescripcion(0); }}
                                  className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1 ${direccionPrescripcion === d ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                                >
                                  {d === 'DEFICIT' && <TrendingDown className="w-3.5 h-3.5" />}
                                  {d === 'SUPERAVIT' && <TrendingUp className="w-3.5 h-3.5" />}
                                  {d === 'MANTENIMIENTO' && <Minus className="w-3.5 h-3.5" />}
                                  {d === 'DEFICIT' ? 'Déficit' : d === 'SUPERAVIT' ? 'Superávit' : 'Mantenimiento'}
                                </button>
                              ))}
                            </div>
                            {direccionPrescripcion !== 'MANTENIMIENTO' && (
                              <div className="flex flex-wrap gap-2">
                                {porcentajesParaMostrar.map(pct => (
                                  <button
                                    type="button"
                                    key={pct}
                                    onClick={() => setPorcentajePrescripcion(pct)}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold border ${porcentajePrescripcion === pct ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-200 bg-white text-slate-600'}`}
                                  >
                                    {pct}%
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {prescripcionFinal != null && (
                            <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-center justify-between">
                              <div>
                                <div className="text-[10px] text-teal-700 uppercase font-bold">Resultado calculado</div>
                                <div className="text-xl font-black text-teal-800">{Math.round(prescripcionFinal)} kcal/día</div>
                              </div>
                              <button
                                type="button"
                                onClick={handleAplicarPrescripcion}
                                className="bg-teal-600 hover:bg-teal-700 text-white font-semibold px-3 py-1.5 rounded-lg text-xs"
                              >
                                Usar este valor
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>

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

- [ ] **Step 7: Verificar tipos**

Run: `npx tsc --noEmit -p .`
Expected: sin salida (todos los errores pendientes de las tareas 6-8 deben estar resueltos).

- [ ] **Step 8: Verificación manual (documentada, no automatizada)**

No ejecutar contra el servidor de producción sin supervisión. Documentar para el usuario los pasos a probar manualmente en su navegador:
1. Abrir un paciente sin `sexo` — la calculadora debe mostrar el aviso rojo pidiendo completar el sexo.
2. Completar el sexo del paciente, volver a "Editar Cita" / "Registrar Cita" — deben aparecer las 3 tarjetas con TMB calculado.
3. Elegir una fórmula, ajustar días/AF, elegir Déficit 15% — el resultado debe coincidir con `promedio × 0.85`.
4. Click en "Usar este valor" — debe llenar `Presupuesto Calórico Diario` y `TMB (Kcal/día)`, y ambos deben seguir siendo editables a mano después.
5. Guardar la consulta, volver a abrir "Editar Cita" sobre esa misma consulta — los 3 pasos deben restaurarse tal cual quedaron.
6. En Configuración de Empresa, agregar/quitar porcentajes y confirmar que las píldoras del paso 3 cambian de inmediato.

- [ ] **Step 9: Commit**

```bash
git add src/components/ConsultationForm.tsx
git commit -m "$(cat <<'EOF'
Add caloric prescription calculator to ConsultationForm

Computes TMB via 3 formulas, weekly maintenance average, and applies a
company-configurable deficit/surplus percentage. Result pre-fills the
existing editable calorias/tmb fields; parameters persist and restore
when editing a saved consultation.
EOF
)"
```

---

## Final check (no es una tarea nueva — repaso rápido antes de cerrar)

- [ ] `npx tsc --noEmit -p .` sin salida.
- [ ] `npx vitest run` — todos los tests de `calorieFormulas.test.ts` en verde.
- [ ] Repasar la spec (`docs/superpowers/specs/2026-08-04-parametrizacion-calorica-dietas-design.md`) punto por punto contra las tareas 1-8 — cada decisión confirmada con el usuario tiene una tarea que la implementa.
