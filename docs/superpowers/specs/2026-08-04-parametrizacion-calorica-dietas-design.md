# Parametrización de Prescripción Calórica (Déficit/Superávit) en Dietas

## Contexto

Hoy el "Presupuesto Calórico Diario" (`calorias`) y el "TMB (Kcal/día)" (`tmb`) de una consulta de Nutrición (`ConsultationForm.tsx`) son inputs numéricos manuales, sin ningún cálculo detrás — el nutricionista los escribe a mano.

Se requiere que el sistema calcule esos valores a partir de fórmulas clínicas reconocidas (Harris Benedict para obesos, Mifflin St Jeor, Müller), el nivel de actividad del paciente, y un porcentaje de déficit o superávit calórico configurable por empresa, dejando el resultado final editable por si el nutricionista necesita ajustarlo.

## Fórmulas (confirmadas con el usuario)

Todas usan `peso` en kg, `talla` en cm, `edad` en años, y el `sexo` del paciente. Se usa el **peso real** del paciente en las tres — sin peso ajustado/corregido.

**Harris Benedict (Obesos)** — revisada 1984 (Roza & Shizgal):
- Hombres: `TMB = 88.362 + (13.397×peso) + (4.799×talla) − (5.677×edad)`
- Mujeres: `TMB = 447.593 + (9.247×peso) + (3.098×talla) − (4.330×edad)`

**Mifflin St Jeor**:
- Hombres: `TMB = (10×peso) + (6.25×talla) − (5×edad) + 5`
- Mujeres: `TMB = (10×peso) + (6.25×talla) − (5×edad) − 161`

**Müller (2004)** — no usa talla:
- Hombres: `TMB = [(0.047×peso) − (0.01452×edad) + 3.21 + 1.009] × 238.8`
- Mujeres: `TMB = [(0.047×peso) − (0.01452×edad) + 3.21] × 238.8`

**Factores de actividad** (tabla fija en código, no configurable):
| Nivel | Factor |
|---|---|
| Sedentario | 1.2 |
| Actividad ligera | 1.375 |
| Actividad moderada | 1.5 |
| Muy activo | 1.725 |
| Extra activo | 1.9 |

Nota informativa (Solís, L. 2020) que se muestra como ayuda visual, no como regla forzada: pacientes de menos de 60kg — usar actividad ligera.

**Promedio calórico semanal para mantenimiento:**
```
promedio = (TMB × factorActividadDescanso × díasDescanso + TMB × factorActividadEntreno × díasEntrenamiento) / 7
```

**Prescripción final (déficit/superávit):**
```
DEFICIT:      promedio × (1 − porcentaje/100)
SUPERAVIT:    promedio × (1 + porcentaje/100)
MANTENIMIENTO: promedio  (equivalente a porcentaje = 0)
```

## Decisiones confirmadas con el usuario

1. La calculadora vive **dentro de `ConsultationForm.tsx`**, no como herramienta separada.
2. **Flujo de 4 pasos**: (a) se calculan y muestran las 3 fórmulas para el paciente (usando su sexo/peso/talla/edad reales) → (b) el nutricionista elige **una** para asociarla a esa dieta → (c) indica días de descanso/entrenamiento en la semana y el factor de actividad para cada tipo de día → (d) elige dirección (Déficit/Superávit/Mantenimiento) y un porcentaje de una lista configurable por empresa.
3. El resultado calculado llena `calorias` y `tmb`, pero **ambos siguen siendo editables** — el nutricionista puede sobrescribirlos a mano después de ver el cálculo.
4. **Empresa** configura la lista de porcentajes ofrecidos (Configuración de Empresa): completamente libre, puede incluir `0` y tener cualquier cantidad de valores (no limitado a 10/15/20). Se guarda en una **tabla SQL dedicada** por empresa, no como JSON embebido.
5. `Patient.sexo` es un campo nuevo, **opcional en la ficha del paciente** (no bloquea guardar), pero **obligatorio para poder calcular** — si falta, la calculadora muestra un aviso pidiendo completarlo primero (con acceso directo a editar la ficha).

## Modelo de datos

### `src/data/mockData.ts`

```typescript
export interface Patient {
  // ...existentes
  sexo?: 'M' | 'F';
}
```

```typescript
export interface Consultation {
  // ...
  dieta?: {
    // ...campos existentes (totalCalorias, desayuno, etc.)
    prescripcionCalorica?: {
      formula: 'HARRIS_BENEDICT_OBESOS' | 'MIFFLIN_ST_JEOR' | 'MULLER';
      tmb: number;
      diasDescanso: number;
      diasEntrenamiento: number;
      factorActividadDescanso: number;
      factorActividadEntreno: number;
      promedioMantenimiento: number;
      direccion: 'DEFICIT' | 'SUPERAVIT' | 'MANTENIMIENTO';
      porcentaje: number;
    };
  };
}
```

`prescripcionCalorica` guarda todos los parámetros usados (no solo el resultado), para poder reabrir la consulta en modo edición (ver la funcionalidad de "Editar Cita" ya existente) y ver/ajustar exactamente lo que se eligió, no solo el número final.

Nueva interfaz para la config de empresa:

```typescript
export interface PorcentajeDieta {
  id: number;
  idCompania: number;
  porcentaje: number;
}
```

### Nuevo módulo `src/utils/calorieFormulas.ts`

Funciones puras, sin estado ni dependencias de React — testeables de forma aislada:

```typescript
export type FormulaTMB = 'HARRIS_BENEDICT_OBESOS' | 'MIFFLIN_ST_JEOR' | 'MULLER';

export const FACTORES_ACTIVIDAD = {
  SEDENTARIO: 1.2,
  LIGERA: 1.375,
  MODERADA: 1.5,
  MUY_ACTIVO: 1.725,
  EXTRA_ACTIVO: 1.9,
} as const;

export function calcularTMB(formula: FormulaTMB, sexo: 'M' | 'F', peso: number, talla: number, edad: number): number;

export function calcularPromedioSemanal(
  tmb: number,
  factorActividadDescanso: number,
  diasDescanso: number,
  factorActividadEntreno: number,
  diasEntrenamiento: number
): number;

export function aplicarPorcentaje(
  promedio: number,
  direccion: 'DEFICIT' | 'SUPERAVIT' | 'MANTENIMIENTO',
  porcentaje: number
): number;
```

## Backend (`server.ts`)

Sigue el mismo patrón dual (MySQL vía `pool` cuando `dbConnected`, si no un arreglo en memoria) que el resto del archivo (ver `calendar_blocks` como precedente directo).

- Tabla nueva, creada con `CREATE TABLE IF NOT EXISTS` junto a las demás tablas de arranque:
  ```sql
  CREATE TABLE IF NOT EXISTS compania_porcentajes_dieta (
    id INT AUTO_INCREMENT PRIMARY KEY,
    idCompania INT NOT NULL,
    porcentaje DECIMAL(5,2) NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  ```
- `GET /api/porcentajes-dieta` — devuelve los porcentajes de la empresa de la sesión (mismo patrón que `GET /api/calendar-blocks`). Si la empresa no tiene ninguno configurado, el frontend usa `[10, 15, 20]` como default visual (no se insertan filas automáticamente).
- `POST /api/porcentajes-dieta` — crea o actualiza uno (mismo patrón insert/update por `id` que `POST /api/calendar-blocks`).
- `DELETE /api/porcentajes-dieta/:id` — elimina uno (mismo patrón que `DELETE /api/calendar-blocks/:id`).

`Patient.sexo`: se agrega la columna `sexo VARCHAR(1) NULL` a la tabla `pacientes` (vía `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` si el patrón del proyecto lo permite, o incluida en el `INSERT`/`UPDATE` de `POST /api/patients` igual que los demás campos). Se propaga en los mismos endpoints existentes de pacientes, sin endpoints nuevos.

## Frontend

### `src/components/PatientForm.tsx`
- Nuevo selector "Sexo" (Masculino/Femenino), opcional, junto a los demás datos básicos del paciente.

### `src/components/CompanySettings.tsx`
- Nueva sección "Porcentajes de Déficit/Superávit para Dietas": lista los `PorcentajeDieta` de la empresa (valor + botón eliminar) y un input para agregar uno nuevo (acepta `0`). CRUD contra los endpoints nuevos.

### `src/components/ConsultationForm.tsx`
Reemplaza los inputs manuales de `calorias`/`tmb` (dentro de la sección de Nutrición) por una nueva sub-sección "Prescripción Calórica":

1. **Paso 1 — Comparación de fórmulas**: si `patient.sexo` no existe, se muestra un aviso bloqueando este paso ("Complete el sexo del paciente para calcular"). Si existe, se muestran 3 tarjetas (una por fórmula) con el TMB calculado en vivo — usando `sexo` del paciente, `patient.edad`, y los estados `peso`/`talla` que el propio formulario ya mantiene (los mismos que se guardan en `antropometria`/`evaluacionAntropometrica`, no una fuente nueva) — clic en una la selecciona (`formulaSeleccionada` en el estado del form).
2. **Paso 2 — Actividad semanal**: inputs `díasDescanso` (default 7) y `díasEntrenamiento` (default 0), y un selector de factor de actividad (los 5 niveles) para cada tipo de día. Muestra en vivo el "Promedio para mantenimiento".
3. **Paso 3 — Dirección y porcentaje**: segmentado Déficit/Mantenimiento/Superávit, y píldoras con los porcentajes obtenidos de `GET /api/porcentajes-dieta` (fallback `[10,15,20]`). Si elige Mantenimiento, el porcentaje se fija en 0 y no se muestra selector.
4. El resultado final calculado sobreescribe `calorias` (y `tmb` con el TMB de la fórmula elegida), pero el nutricionista puede seguir editando esos dos campos a mano después — igual que hoy.
5. Al guardar, el objeto `prescripcionCalorica` completo (fórmula, tmb, días, factores, promedio, dirección, porcentaje) se adjunta a `dieta` en el `Consultation` guardado.
6. Al **editar** una consulta existente (funcionalidad ya implementada — ver `editingConsultation`), si `dieta.prescripcionCalorica` existe, el `useEffect` de precarga restaura los 3 pasos tal cual quedaron guardados, en vez de arrancar en blanco.

### `src/App.tsx`
- Nuevo estado `porcentajesDieta` (fetch a `/api/porcentajes-dieta` al montar, igual patrón que `calendarBlocks`), pasado como prop a `ConsultationForm` y a `CompanySettings`.
