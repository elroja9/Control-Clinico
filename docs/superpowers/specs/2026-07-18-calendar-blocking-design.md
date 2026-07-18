# Bloqueo de Agenda por Especialista

## Contexto

Actualmente cualquier día/hora en la Agenda (`AgendaCalendar.tsx`) es agendable — al hacer clic en un día (vista mes) o en una celda de hora (vista semana/día) se abre el formulario de nueva cita sin ninguna restricción. El especialista necesita poder marcar fechas u horas como no disponibles (vacaciones, incapacidades, compromisos personales, horario de almuerzo extendido, etc.) para que esos espacios no se puedan agendar.

## Decisiones (confirmadas con el usuario)

1. **Sin recurrencia**: solo bloqueos puntuales — un día, un rango de horas en un día, o un rango de varios días (vacaciones). No se implementan reglas recurrentes ("todos los miércoles").
2. **Cada especialista bloquea solo su propia agenda**: no hay bloqueo cruzado por parte de un Administrador sobre la agenda de otro especialista.
3. Los bloqueos son **prospectivos**: impiden agendar citas *nuevas* en ese rango. No cancelan ni afectan citas que ya existan dentro del rango bloqueado — el especialista puede seguir editando/moviendo/cancelando esas citas existentes normalmente.

## Modelo de datos

Nueva interfaz en `src/data/mockData.ts`:

```typescript
export interface CalendarBlock {
  id: number;
  idCompania: number;
  idUsuarioNutricionista: number; // especialista dueño del bloqueo
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string; // YYYY-MM-DD (igual a fechaInicio salvo bloqueo de varios días)
  horaInicio: string | null; // HH:MM, null = día(s) completo(s)
  horaFin: string | null; // HH:MM, null = día(s) completo(s)
  motivo: string; // ej. "Vacaciones", "Cita personal" — puede ir vacío
}
```

Regla de negocio (aplicada en el formulario, no en el tipo): si `horaInicio`/`horaFin` tienen valor, `fechaFin` debe ser igual a `fechaInicio` (un bloqueo con horario específico es de un solo día). Un bloqueo de varios días siempre es de día completo (`horaInicio`/`horaFin` en `null`).

Un bloqueo se considera "activo" para una fecha+hora dada `(d, h)` si:
- `d` está entre `fechaInicio` y `fechaFin` (inclusive), Y
- (`horaInicio`/`horaFin` son `null`, es decir todo el día) O (`h` cae dentro de `[horaInicio, horaFin)`).

## Backend (`server.ts`)

Sigue el mismo patrón dual (MySQL vía `pool` cuando `dbConnected`, si no un arreglo en memoria `localCalendarBlocks`) que ya usan todos los demás recursos del archivo.

- Tabla nueva `calendar_blocks` (creada con `CREATE TABLE IF NOT EXISTS`, mismo bloque donde se crean `citas`/`compania_smtp_config`/`notification_logs`).
- `GET /api/calendar-blocks` — devuelve todos los bloqueos (el frontend filtra por especialista/empresa igual que hace con `citas`).
- `POST /api/calendar-blocks` — crea o actualiza (mismo patrón insert/update por `id` que usan `/api/citas` y `/api/smtp-configs`).
- `DELETE /api/calendar-blocks/:id` — elimina un bloqueo (mismo patrón que `DELETE /api/citas/:id`).

## Frontend

### `src/data/mockData.ts`
- Nueva interfaz `CalendarBlock` (arriba).
- `defaultCalendarBlocks: CalendarBlock[] = []` (arreglo vacío — no hay datos de ejemplo necesarios).

### `src/App.tsx`
- Nuevo estado `calendarBlocks` (mismo patrón que `citas`: `useState` con fallback a `localStorage`, fetch inicial a `/api/calendar-blocks`, persistencia a `localStorage`).
- `handleSaveCalendarBlock` / `handleDeleteCalendarBlock` (mismo patrón que `handleSaveCita`/`handleDeleteCita`).
- Pasar `calendarBlocks`, `onSaveCalendarBlock`, `onDeleteCalendarBlock` como props nuevas a `<AgendaCalendar />`.

### `src/components/AgendaCalendar.tsx`

**Nuevo estado del componente:**
- `isBlockFormOpen: boolean`, `selectedBlock: CalendarBlock | null`
- Estado del formulario de bloqueo: `blockFechaInicio`, `blockFechaFin`, `blockEsVariosDias: boolean`, `blockEsTodoElDia: boolean` (default `true`), `blockHoraInicio`, `blockHoraFin`, `blockMotivo`

**Helper de solapamiento:**
```typescript
function isSlotBlocked(blocks: CalendarBlock[], doctorId: number, dateStr: string, timeStr?: string): CalendarBlock | undefined {
  return blocks.find(b => {
    if (b.idUsuarioNutricionista !== doctorId) return false;
    if (dateStr < b.fechaInicio || dateStr > b.fechaFin) return false;
    if (!b.horaInicio || !b.horaFin) return true; // bloqueo de día completo
    if (!timeStr) return false; // vista mes: solo cuenta como bloqueado si es de día completo
    return timeStr >= b.horaInicio && timeStr < b.horaFin;
  });
}
```

**Botón nuevo** junto a "+ Nueva Cita" (línea ~563 actual): "Bloquear Horario" (ícono `Lock`, ya importado y sin usar en el archivo), abre `isBlockFormOpen`.

**Modal de bloqueo** (mismo estilo/estructura que el modal de cita existente, líneas ~651-804): fecha inicio, checkbox "Bloquear varios días" (muestra fecha fin), checkbox "Todo el día" marcado por defecto (al destildar muestra hora inicio/fin), campo de motivo opcional, botón eliminar (si `selectedBlock`), botones cancelar/guardar.

**Nueva sección "Bloqueos de Agenda"** (mismo estilo que la sección "Historial de Notificaciones SMTP Enviadas" ya existente): lista los bloqueos de `currentUser.id`, cada uno con motivo/rango y botón de eliminar.

**Enforcement:**
- Vista mes (`renderMonthView`): si `isSlotBlocked(calendarBlocks, doctorRelevante, dateStr)` devuelve un bloqueo de día completo, la celda del día se pinta distinta (rayado/gris con ícono `Lock`) y su `onClick` muestra `alert` con el motivo en vez de llamar a `handleOpenNewCita`.
- Vista semana/día (`renderWeekView`/`renderDayView`): mismo chequeo pero pasando `timeStr`, aplicado a cada celda de hora.
- `handleFormSubmit`: antes de guardar, calcula si el slot (fecha/hora/profesional) elegido cambió respecto al original: `const slotChanged = !selectedCita || selectedCita.fechaHora !== fullFechaHora || selectedCita.idUsuarioNutricionista !== formDoctorId;`. Si `slotChanged` es `true` y `isSlotBlocked(calendarBlocks, formDoctorId, formDate, formTime)` devuelve un bloqueo, setea `formError` con el motivo y no guarda (`return` antes de `onSaveCita`). Si `slotChanged` es `false` (se está editando una cita existente sin mover su fecha/hora/profesional — por ejemplo solo cambiando notas o estado), no se valida contra bloqueos, para no impedir editar una cita que ya vivía dentro de un rango que se bloqueó después.
- ¿Qué especialista usar para el chequeo en vista mes/semana/día? El mismo que ya determina qué citas se muestran: si `selectedDoctorId !== 0` se usa ese; si es "Todos los Especialistas" (`0`), no se aplica sombreado de bloqueo (mostrar bloqueo con un solo especialista filtrado activo evita ambigüedad de "bloqueado para quién").

## Fuera de alcance (YAGNI)
- Recurrencia.
- Bloqueo cruzado por Administrador sobre otro especialista.
- Cancelación automática de citas existentes al crear un bloqueo que las cubre.
- Notificación por correo al crear un bloqueo.

## Testing
Sin framework de pruebas automatizadas en el proyecto (igual que el resto de la app). Verificación manual: crear un bloqueo de día completo y confirmar que ese día no se puede agendar en vista mes/semana/día; crear un bloqueo de horario específico y confirmar que solo esa franja se bloquea; confirmar que citas ya agendadas dentro de un bloqueo nuevo siguen siendo editables; confirmar que el formulario de nueva cita rechaza (con `formError`) un intento de guardar manualmente una fecha/hora bloqueada; confirmar que eliminar un bloqueo libera el horario de inmediato.
