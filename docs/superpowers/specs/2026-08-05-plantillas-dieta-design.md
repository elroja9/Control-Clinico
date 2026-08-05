# Plantillas de Dieta por Rango de Calorías y Objetivo

## Contexto

La calculadora de prescripción calórica (`ConsultationForm.tsx`) ya calcula un número final de kcal/día y una dirección (`DEFICIT`/`MANTENIMIENTO`/`SUPERAVIT`), pero el nutricionista sigue escribiendo el menú (desayuno/almuerzo/cena/etc.) desde cero cada vez. Se necesita una biblioteca de plantillas de dieta — por empresa, indexadas por rango de calorías y objetivo — que el sistema sugiera automáticamente una vez calculada la prescripción, con su composición de macronutrientes, para que el nutricionista pueda aplicarlas y ajustarlas en vez de partir de cero.

## Decisiones (confirmadas con el usuario)

1. **Objetivo = las 3 direcciones que ya existen** (`DEFICIT`/`MANTENIMIENTO`/`SUPERAVIT`) — no se agregan categorías nuevas.
2. **Plantillas administradas por empresa**, no un catálogo fijo global — cada empresa nutricional crea/edita/elimina las suyas en Configuración de Empresa.
3. **Rango de calorías**: cada plantilla define su propio `caloriaMin`/`caloriaMax` (la UI sugiere bloques de 300 kcal como punto de partida, pero el nutricionista puede ajustar los límites libremente).
4. **Macros en gramos**, ingresados manualmente por el nutricionista al crear la plantilla (carbohidratos, proteínas, grasas) — el sistema no los calcula ni sugiere valores por defecto.
5. **Múltiples plantillas pueden coincidir** para el mismo rango+objetivo (ej. variante vegetariana vs. tradicional) — se muestran todas para que el nutricionista elija.
6. **Selección de plantilla = autocompletar, no solo referencia**: al elegir una plantilla sugerida, se llenan desayuno/meriendaMañana/almuerzo/meriendaTarde/cena/indicaciones y los macros de la consulta, además de aplicar TMB/calorías (igual que ya hace "Usar este valor" hoy) — todo queda editable después.
7. **Aviso de alergias/alimentos no deseados**: justo donde se muestran las plantillas sugeridas, se muestra un recordatorio con `Patient.alergiasAlimentarias` y (si están registrados en la consulta) `evaluacionDietetica.alimentos_no_consume`/`alimentos_preferidos`, para que el nutricionista ajuste el menú autocompletado antes de guardar. No hay sustitución automática de ingredientes — es un recordatorio visual, no lógica de validación.

## Modelo de datos

### `src/data/mockData.ts`

```typescript
export interface PlantillaDieta {
  id: number;
  idCompania: number;
  nombre: string;
  direccion: DireccionPrescripcion; // reutiliza el tipo ya importado de calorieFormulas.ts
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

`Consultation.dieta` gana un campo opcional para los macros efectivamente aplicados a esa consulta (independiente de si vinieron de una plantilla o se escribieron a mano):

```typescript
  dieta?: {
    // ...campos existentes...
    macros?: {
      carbohidratosG: number;
      proteinasG: number;
      grasasG: number;
    };
  };
```

## Backend (`server.ts`)

Mismo patrón dual (MySQL vía `pool` cuando `dbConnected`, si no un arreglo en memoria) que `compania_porcentajes_dieta`.

- Tabla nueva:
  ```sql
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
  ```
- `GET /api/plantillas-dieta` — devuelve las plantillas de la empresa de la sesión (`requireAuth`, sin restricción de rol — cualquier nutricionista de la empresa necesita leerlas para la calculadora).
- `POST /api/plantillas-dieta` — crea o actualiza (mismo patrón insert/update por `id`). **Requiere rol Administrador** (o SaaS admin) — mismo guard ya aplicado a `POST /api/porcentajes-dieta`, para no reabrir el mismo hueco de autorización que se corrigió ahí.
- `DELETE /api/plantillas-dieta/:id` — igual, requiere Administrador.

## Frontend

### `src/components/CompanySettings.tsx`
- Nueva sección "Plantillas de Dieta" (misma ubicación/patrón visual que "Porcentajes de Déficit/Superávit"), que renderiza un componente nuevo dedicado en vez de inline (ver abajo) — `CompanySettings.tsx` ya es un archivo grande y una plantilla tiene ~10 campos.

### `src/components/PlantillaDietaManager.tsx` (nuevo)
- Recibe `plantillasDieta`, `idCompania`, `onSave`, `onDelete` como props.
- Lista las plantillas existentes agrupadas por objetivo, mostrando nombre/rango/macros.
- Formulario de alta/edición: nombre, selector de objetivo (Déficit/Mantenimiento/Superávit), rango min/max (con placeholder sugiriendo bloques de 300), 3 campos de macros en gramos, y los 6 campos de menú (mismo estilo de inputs que `ConsultationForm.tsx`).

### `src/components/ConsultationForm.tsx`
- Nueva prop `plantillasDieta: PlantillaDieta[]`.
- Tras calcular `prescripcionFinal` y tener `direccionPrescripcion`, se filtran las plantillas de la empresa del paciente donde `direccion` coincide y `prescripcionFinal` cae dentro de `[caloriaMin, caloriaMax]` (límites inclusivos).
- Si hay coincidencias, se muestran como tarjetas seleccionables (nombre + rango + macros en gramos y % derivado) debajo del resultado calculado, junto con el recordatorio de alergias/alimentos no deseados del paciente (punto 7 de las decisiones). El % derivado se calcula solo para mostrar (no se guarda): `% = (gramos × kcal_por_gramo) / prescripcionFinal × 100`, con 4 kcal/g para carbohidratos y proteínas, 9 kcal/g para grasas.
- Al elegir una: llena `desayuno`/`meriendaManana`/`almuerzo`/`meriendaTarde`/`cena`/`indicaciones` y los 3 campos de macros, y aplica TMB/calorías igual que `handleAplicarPrescripcion` — todo queda editable después.
- Al guardar, `dieta.macros` se persiste si el nutricionista aplicó una plantilla (o los editó manualmente — el campo simplemente refleja el estado actual de los 3 inputs de macros, igual que `totalCalorias` refleja `calorias`).
- Al reabrir una consulta para editar (`editingConsultation`), `dieta.macros` se restaura igual que el resto de `dieta`.

### `src/App.tsx`
- Nuevo estado `plantillasDieta` (mismo patrón fetch/localStorage/save/delete que `porcentajesDieta`), pasado a `CompanySettings` y `ConsultationForm`.
