# Reportería Clínica (Clientes y Sesiones) + Estado de Consulta — Design

## Contexto

Actualmente una Consulta se guarda siempre por el mismo camino (`POST /api/consultations`,
tanto para crear como para actualizar — `server.ts:1786`), sin ningún concepto de
"borrador" vs "cerrada". Una Consulta puede editarse después ("Editar Cita" en
`ConsultationForm.tsx`) para completar datos de dieta u otros campos. No existe hoy
ningún área de reportería agregada (solo `ReportesFiscales.tsx`, que es exclusivamente
para declaraciones D-104/D-101 de Hacienda, y `ReportView.tsx`, que es el reporte
imprimible/enviable de una sola consulta puntual).

Este spec cubre dos piezas que se entregan juntas porque una depende de la otra:

1. **Estado de Consulta** (`ABIERTA` / `CERRADA`) + botón "Cerrar Consulta".
2. **Área de Reportería** con reportes de clientes nuevos y sesiones atendidas,
   filtrable por mes o por rango de fechas — usando el estado de Consulta como
   fuente de "sesión completada".

## Parte 1: Estado de Consulta

- `Consultation` (mockData.ts:154+) gana un campo `estado: 'ABIERTA' | 'CERRADA'`.
- Al crear una consulta nueva, `estado` nace `'ABIERTA'`.
- Guardar/editar una consulta (`POST /api/consultations`) **nunca** cambia el
  `estado` implícitamente — solo lo hace el endpoint dedicado de abajo. Esto
  preserva "se puede seguir editando después de cerrada" sin reabrirla sola.
- Nuevo endpoint: `POST /api/consultations/:id/estado` con body `{ estado: 'ABIERTA' | 'CERRADA' }`,
  scoped por `idCompania` de la sesión (mismo patrón dual-mode que el resto de
  `server.ts`: `UPDATE consultas SET estado = ? WHERE id = ? AND idCompania = ?`
  si `dbConnected`, si no mutación sobre `localConsultations`). Valida que
  `estado` sea uno de los dos valores permitidos (400 si no).
- Migración: `ALTER TABLE consultas ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTA'`
  (idéntico patrón idempotente usado para el resto de columnas de `consultas`,
  ver `server.ts:659-675`). **Decisión confirmada con el usuario:** las consultas
  históricas quedan en `ABIERTA` por defecto — no se marcan `CERRADA`
  retroactivamente. Esto significa que el reporte de sesiones completadas
  mostrará 0 para períodos anteriores a este cambio hasta que se cierren
  manualmente si se desea.
- UI: en `ReportView.tsx`, en la barra de herramientas junto al botón "Facturar"
  existente, se agrega:
  - Un badge mostrando el estado actual (`ABIERTA` / `CERRADA`).
  - Un botón que alterna: "Cerrar Consulta" cuando está `ABIERTA` → llama al
    endpoint con `{estado:'CERRADA'}`; "Reabrir Consulta" (estilo secundario,
    menos prominente) cuando está `CERRADA` → vuelve a `{estado:'ABIERTA'}`.
    Esto da una vía de corrección si alguien cierra por error, sin bloquear
    la edición en ningún momento (consistente con la decisión del usuario de
    que la consulta sigue siendo editable siempre).
  - Al confirmar el cambio, se actualiza el estado local de `consultation` en
    `ReportView` y se propaga hacia arriba mediante un nuevo callback prop
    `onConsultationUpdated(consulta)` (mismo patrón que `onNotificationSent`),
    para que `App.tsx` refresque la consulta dentro de su array `consultations`.

## Parte 2: Área de Reportería

**Nuevo componente:** `src/components/ReporteriaClinica.tsx` — autocontenido,
recibe solo `{ company }` como prop (mismo patrón que `ReportesFiscales.tsx`),
hace su propio `fetch`.

**Nuevo endpoint:** `GET /api/reportes/clientes-sesiones?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`,
scoped por `idCompania` de la sesión. Un solo endpoint sirve tanto al modo
"Mensual" como "Rango personalizado" — la UI calcula `desde`/`hasta` según el
modo elegido y siempre llama el mismo endpoint.

**Fuentes de datos (confirmadas con el usuario):**
- **Pacientes nuevos**: pacientes cuya *primera cita jamás registrada*
  (`MIN(fechaHora)` entre todas sus citas en `citas`, cualquier `estadoCita`)
  cae dentro de `[desde, hasta]`. No requiere cambios de esquema en `Paciente`.
- **Sesiones completadas** y **pacientes atendidos**: ahora basados en
  `consultas.estado = 'CERRADA'` con `fecha` dentro de `[desde, hasta]`
  (cambiado desde el diseño original de `citas.estadoCita = 'COMPLETADA'`,
  por decisión explícita del usuario tras agregar el estado de consulta).
- **Tasa de asistencia** (métrica complementaria, basada en Citas, sin
  cambios): `COMPLETADA / (COMPLETADA + NO_ASISTIO + CANCELADA)` de citas en
  el rango — mide cumplimiento de agenda, distinto de cierre clínico.

**Forma de la respuesta** (tipo transitorio, no persistido — se define en
`ReporteriaClinica.tsx`, no en `mockData.ts`):

```ts
interface ReporteClientesSesiones {
  resumen: {
    pacientesNuevos: number;
    pacientesAtendidos: number;      // distinct idPaciente con consulta CERRADA en rango
    sesionesCompletadas: number;     // count de consultas CERRADA en rango
    tasaAsistencia: number;          // 0-100, basada en citas
  };
  tendenciaMensual: Array<{
    mes: string;                     // 'YYYY-MM'
    pacientesNuevos: number;
    sesionesCompletadas: number;
  }>;
  pacientes: Array<{
    idPaciente: number;
    nombreCompleto: string;
    sesionesCompletadas: number;     // en el rango
    esNuevo: boolean;                // primera cita cae en el rango
  }>;
}
```

**Backend** (`server.ts`, dual-mode, mismo patrón que `GET /api/citas` en
`server.ts:1830-1842`):
- Modo `pool`: queries con `GROUP BY`/subconsultas (`MIN(fechaHora)` por
  paciente para nuevos; `COUNT`/`COUNT DISTINCT` con `DATE_FORMAT(fecha,'%Y-%m')`
  para la tendencia mensual).
- Modo local (`dbConnected === false`): agregación equivalente con `reduce`/
  `filter` sobre `localCitas` y `localConsultations`.

**UI (`ReporteriaClinica.tsx`):**
- Barra de filtro: toggle "Mensual" (`<input type="month">`) / "Rango
  personalizado" (dos `<input type="date">`). Por defecto: mes actual.
- Tarjetas resumen: Pacientes Nuevos, Pacientes Atendidos, Sesiones
  Completadas, Tasa de Asistencia.
- Gráfico de barras (recharts `BarChart`, ya instalado — sin nueva
  dependencia) con dos series por mes: Pacientes Nuevos y Sesiones
  Completadas.
- Tabla detallada por paciente (nombre, sesiones completadas en el rango,
  badge "Nuevo" si aplica), ordenable por sesiones descendente.
- Botón "Exportar CSV": genera el CSV de la tabla detallada client-side
  (`Blob` + link de descarga), sin librería nueva.

**Navegación (`App.tsx`):**
- Extender el union de `activeTab` (línea 334) con `'reporteria'`.
- Agregar botones de navegación mirroring el patrón de `reportes-fiscales`
  (móvil ~1181-1193, escritorio ~1406-1420) — **sin gate de rol**, visible
  para cualquier usuario autenticado de la empresa (igual que Reportes
  Fiscales hoy).
- Agregar el bloque de render (`{activeTab === 'reporteria' && <ReporteriaClinica company={activeCompany} />}`)
  cerca de la línea 1918.

## Fuera de alcance

- No se agrega backfill retroactivo de `estado = 'CERRADA'` a consultas
  existentes (decisión explícita del usuario).
- No se agregan tests automatizados nuevos — consistente con el resto de
  features de esta sesión (solo `calorieFormulas.test.ts` tiene suite
  propia); se usa `npx tsc --noEmit` y `npx vitest run` como gate de
  regresión, no para cobertura nueva.
- No se toca `ReportesFiscales.tsx` ni su lógica D-101/D-104.
