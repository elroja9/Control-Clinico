# Bloqueo de Agenda por Especialista Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each specialist block dates/hours on their own agenda so new appointments can't be scheduled there, without affecting appointments that already exist in the blocked range.

**Architecture:** A new `CalendarBlock` entity, CRUD endpoints in `server.ts` following the exact dual-mode (MySQL/in-memory) pattern already used for `citas`, and enforcement entirely inside `AgendaCalendar.tsx` — a pure helper function checks a date/time against the current specialist's blocks, consulted by the month/week/day render functions (to gray out and redirect clicks) and by the save handler (to reject a manually-typed blocked slot).

**Tech Stack:** Same stack as the rest of the app — Express/MySQL2 backend, React/TypeScript frontend, no new dependencies.

## Global Constraints

- No test runner is configured in this project (no Jest/Vitest). Verification steps use manual `curl`/browser-code-trace checks, matching every prior task in this codebase's history.
- Follow the existing dual-mode pattern (`dbConnected && pool` vs in-memory `local*` arrays) used by every other endpoint in `server.ts` — do not introduce a new pattern.
- The new `calendar_blocks` table is created fresh by this app (not part of the legacy `ConsultorioDB_schema.sql`), so it must use `WHERE id = ?` only for lookups/deletes — do NOT add a `OR id_algo = ?` snake_case fallback like `citas` has; that pattern was found to reference a column that doesn't exist and throws in production.
- Blocks only prevent *new* scheduling. Editing an existing `Cita` without changing its date/time/specialist must never be blocked by a block created afterward.

---

### Task 1: Data model and backend CRUD for calendar blocks

**Files:**
- Modify: `src/data/mockData.ts` (append at end, after line 540)
- Modify: `server.ts:1-19` (imports), `server.ts:33-35` (in-memory fallback arrays), `server.ts:96-111` (table creation), `server.ts:644-657` (add new endpoints after the citas endpoints)

**Interfaces:**
- Produces: `CalendarBlock` type (`{ id, idCompania, idUsuarioNutricionista, fechaInicio, fechaFin, horaInicio: string | null, horaFin: string | null, motivo }`) and `defaultCalendarBlocks: CalendarBlock[] = []`, consumed by Task 2 (`App.tsx`) and Task 3/4 (`AgendaCalendar.tsx`).
- Produces: `GET /api/calendar-blocks`, `POST /api/calendar-blocks`, `DELETE /api/calendar-blocks/:id` — consumed by Task 2.

- [ ] **Step 1: Append the type and default export to `src/data/mockData.ts`**

At the end of the file (after line 540, the closing `];` of `defaultNotificationLogs`), add:

```typescript

export interface CalendarBlock {
  id: number;
  idCompania: number;
  idUsuarioNutricionista: number;
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string; // YYYY-MM-DD
  horaInicio: string | null; // HH:MM
  horaFin: string | null; // HH:MM
  motivo: string;
}

export const defaultCalendarBlocks: CalendarBlock[] = [];
```

- [ ] **Step 2: Update imports in `server.ts` (lines 1-19)**

Replace:
```typescript
import type { Company, Patient, Cita, Consultation } from "./src/data/mockData";
import { createServer as createViteServer } from "vite";
import {
  defaultCompanies,
  defaultUsers,
  defaultPatients,
  defaultConsultations,
  defaultCitas,
  defaultSmtpConfigs,
  defaultNotificationLogs
} from "./src/data/mockData";
```
with:
```typescript
import type { Company, Patient, Cita, Consultation, CalendarBlock } from "./src/data/mockData";
import { createServer as createViteServer } from "vite";
import {
  defaultCompanies,
  defaultUsers,
  defaultPatients,
  defaultConsultations,
  defaultCitas,
  defaultSmtpConfigs,
  defaultNotificationLogs,
  defaultCalendarBlocks
} from "./src/data/mockData";
```

- [ ] **Step 3: Add the in-memory fallback array (`server.ts:33-35`)**

Replace:
```typescript
let localCitas = [...defaultCitas];
let localSmtpConfigs = [...defaultSmtpConfigs];
let localLogs = [...defaultNotificationLogs];
```
with:
```typescript
let localCitas = [...defaultCitas];
let localSmtpConfigs = [...defaultSmtpConfigs];
let localLogs = [...defaultNotificationLogs];
let localCalendarBlocks = [...defaultCalendarBlocks];
```

- [ ] **Step 4: Add the table creation, right after the `citas` table block (`server.ts:97-111`)**

After this existing block:
```typescript
      CREATE TABLE IF NOT EXISTS citas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idCompania INT NOT NULL,
        idPaciente INT NOT NULL,
        idUsuarioNutricionista INT NOT NULL,
        idConsulta INT NULL,
        fechaHora VARCHAR(50) NOT NULL,
        duracionMinutos INT NOT NULL DEFAULT 30,
        estadoCita VARCHAR(50) NOT NULL DEFAULT 'PROGRAMADA',
        notas TEXT,
        confirmacionEnviadaEn VARCHAR(50),
        recordatorioEnviadoEn VARCHAR(50),
        cancelacionEnviadaEn VARCHAR(50)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
```
add:
```typescript
    await pool.query(`
      CREATE TABLE IF NOT EXISTS calendar_blocks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idCompania INT NOT NULL,
        idUsuarioNutricionista INT NOT NULL,
        fechaInicio VARCHAR(10) NOT NULL,
        fechaFin VARCHAR(10) NOT NULL,
        horaInicio VARCHAR(5) NULL,
        horaFin VARCHAR(5) NULL,
        motivo VARCHAR(255)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
```

- [ ] **Step 5: Add the three endpoints, after `DELETE /api/citas/:id` (`server.ts:644-657`)**

After the existing:
```typescript
  app.delete("/api/citas/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (dbConnected && pool) {
        await pool.query("DELETE FROM citas WHERE id = ? OR id_cita = ?", [id, id]);
        res.json({ success: true });
      } else {
        localCitas = localCitas.filter(item => item.id !== id);
        res.json({ success: true });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```
add:
```typescript

  // 9. Calendar Blocks (specialist agenda blocking)
  app.get("/api/calendar-blocks", async (req, res) => {
    try {
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM calendar_blocks");
        res.json(rows);
      } else {
        res.json(localCalendarBlocks);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/calendar-blocks", async (req, res) => {
    try {
      const b = req.body;
      if (dbConnected && pool) {
        if (b.id) {
          const [exists] = await pool.query("SELECT id FROM calendar_blocks WHERE id = ?", [b.id]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE calendar_blocks SET idCompania = ?, idUsuarioNutricionista = ?, fechaInicio = ?, fechaFin = ?, horaInicio = ?, horaFin = ?, motivo = ? WHERE id = ?",
              [parseInt(b.idCompania), parseInt(b.idUsuarioNutricionista), b.fechaInicio, b.fechaFin, b.horaInicio || null, b.horaFin || null, b.motivo || '', b.id]
            );
            return res.json(b);
          }
        }
        const [result] = await pool.query(
          "INSERT INTO calendar_blocks (idCompania, idUsuarioNutricionista, fechaInicio, fechaFin, horaInicio, horaFin, motivo) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [parseInt(b.idCompania), parseInt(b.idUsuarioNutricionista), b.fechaInicio, b.fechaFin, b.horaInicio || null, b.horaFin || null, b.motivo || '']
        );
        b.id = (result as any).insertId;
        res.json(b);
      } else {
        if (b.id) {
          localCalendarBlocks = localCalendarBlocks.map(item => item.id === b.id ? b : item);
        } else {
          b.id = Math.max(0, ...localCalendarBlocks.map(item => item.id)) + 1;
          localCalendarBlocks.push(b);
        }
        res.json(b);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/calendar-blocks/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (dbConnected && pool) {
        await pool.query("DELETE FROM calendar_blocks WHERE id = ?", [id]);
        res.json({ success: true });
      } else {
        localCalendarBlocks = localCalendarBlocks.filter(item => item.id !== id);
        res.json({ success: true });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Step 6: Verify with `npm run lint`**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Verify manually (protect the live database — see note below)**

**Before running any live check:** the project's `.env` points at a real, currently-in-use remote MySQL database (only one real company, `id_compania: 7`). Use a throwaway `idCompania` (e.g. `9001`) for any test row and delete it afterward with a follow-up `DELETE` call, confirming with a follow-up `GET`. Also confirm no dev server is left listening on port 3000 when done (`netstat -ano | grep ":3000" | grep LISTENING` should show nothing — a prior session left one running for over an hour by mistake).

Run `npm run dev`, then:
```bash
curl -s -X POST http://localhost:3000/api/calendar-blocks -H "Content-Type: application/json" -d '{"idCompania":9001,"idUsuarioNutricionista":9001,"fechaInicio":"2026-08-01","fechaFin":"2026-08-05","horaInicio":null,"horaFin":null,"motivo":"Vacaciones de prueba"}'
curl -s http://localhost:3000/api/calendar-blocks
curl -s -X DELETE http://localhost:3000/api/calendar-blocks/<id-returned-above>
curl -s http://localhost:3000/api/calendar-blocks
```
Expected: the POST returns the created block with an `id`; the first GET includes it; after DELETE, the second GET no longer includes it.

- [ ] **Step 8: Commit**

```bash
git add src/data/mockData.ts server.ts
git commit -m "feat: add CalendarBlock data model and CRUD endpoints"
```

---

### Task 2: `App.tsx` wiring

**Files:**
- Modify: `src/App.tsx:39-55` (imports), add state near `src/App.tsx:108-111`, add fetch near `src/App.tsx:187-197`, add localStorage persistence near `src/App.tsx:212-214`, add handlers near `src/App.tsx:413-424`, modify the `<AgendaCalendar />` usage near `src/App.tsx:1244-1261`

**Interfaces:**
- Consumes: `CalendarBlock`, `defaultCalendarBlocks` (Task 1); `GET/POST/DELETE /api/calendar-blocks` (Task 1).
- Produces: `calendarBlocks: CalendarBlock[]`, `onSaveCalendarBlock: (block: CalendarBlock) => void`, `onDeleteCalendarBlock: (id: number) => void` passed as props to `<AgendaCalendar />` — consumed by Task 3.

- [ ] **Step 1: Add to the mockData import (`src/App.tsx:39-55`)**

Replace:
```typescript
import {
  defaultCompanies,
  defaultPatients,
  defaultConsultations,
  defaultUsers,
  defaultCitas,
  defaultSmtpConfigs,
  defaultNotificationLogs,
  Company,
  Patient,
  Consultation,
  User,
  Cita,
  CompaniaSmtpConfig,
  NotificationLog,
  SmtpConfigInput
} from './data/mockData';
```
with:
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
  Company,
  Patient,
  Consultation,
  User,
  Cita,
  CompaniaSmtpConfig,
  NotificationLog,
  SmtpConfigInput,
  CalendarBlock
} from './data/mockData';
```

- [ ] **Step 2: Add state, after the `logs` state (`src/App.tsx:108-111`)**

Find:
```typescript
  const [logs, setLogs] = useState<NotificationLog[]>(() => {
    const local = localStorage.getItem('fisio_notification_logs');
    return local ? JSON.parse(local) : defaultNotificationLogs;
  });
```
add immediately after it:
```typescript

  const [calendarBlocks, setCalendarBlocks] = useState<CalendarBlock[]>(() => {
    const local = localStorage.getItem('fisio_calendar_blocks');
    return local ? JSON.parse(local) : defaultCalendarBlocks;
  });
```

- [ ] **Step 3: Add the initial fetch, after the notification logs fetch (`src/App.tsx:187-197`)**

Find:
```typescript
    // 8. Fetch notification logs
    fetch('/api/notification-logs')
      .then(res => {
        if (!res.ok) throw new Error("API error");
        return res.json();
      })
      .then(data => {
        if (data && data.length > 0) setLogs(data);
      })
      .catch(err => console.log("MySQL offline, using local fallback for logs"));
  }, []);
```
replace with:
```typescript
    // 8. Fetch notification logs
    fetch('/api/notification-logs')
      .then(res => {
        if (!res.ok) throw new Error("API error");
        return res.json();
      })
      .then(data => {
        if (data && data.length > 0) setLogs(data);
      })
      .catch(err => console.log("MySQL offline, using local fallback for logs"));

    // 9. Fetch calendar blocks
    fetch('/api/calendar-blocks')
      .then(res => {
        if (!res.ok) throw new Error("API error");
        return res.json();
      })
      .then(data => {
        if (data && data.length > 0) setCalendarBlocks(data);
      })
      .catch(err => console.log("MySQL offline, using local fallback for calendar blocks"));
  }, []);
```

- [ ] **Step 4: Add localStorage persistence, after the citas persistence effect (`src/App.tsx:212-214`)**

Find:
```typescript
  useEffect(() => {
    localStorage.setItem('fisio_citas', JSON.stringify(citas));
  }, [citas]);
```
add immediately after it:
```typescript

  useEffect(() => {
    localStorage.setItem('fisio_calendar_blocks', JSON.stringify(calendarBlocks));
  }, [calendarBlocks]);
```

- [ ] **Step 5: Add save/delete handlers, after `handleDeleteCita` (`src/App.tsx:413-424`)**

Find:
```typescript
  const handleDeleteCita = (id: number) => {
    if (confirm("¿Está seguro de que desea cancelar / eliminar esta cita?")) {
      fetch(`/api/citas/${id}`, { method: 'DELETE' })
        .then(() => {
          setCitas(prev => prev.filter(c => c.id !== id));
        })
        .catch(err => {
          console.error("Error deleting appointment from MySQL:", err);
          setCitas(prev => prev.filter(c => c.id !== id));
        });
    }
  };
```
add immediately after it:
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

- [ ] **Step 6: Wire the new props into `<AgendaCalendar />` (`src/App.tsx:1244-1261`)**

Find the `<AgendaCalendar ... />` element (look for `onDeleteCita={handleDeleteCita}` inside it) and add three new props alongside the existing ones:
```tsx
                onSaveCita={handleSaveCita}
                onDeleteCita={handleDeleteCita}
                onTriggerNotification={handleAddNotificationLog}
                onStartConsultation={(patient) => handleStartSoapFromCalendar(patient.id)}
                themeColor={activeCompany.colorPrimario}
```
replace with:
```tsx
                onSaveCita={handleSaveCita}
                onDeleteCita={handleDeleteCita}
                onTriggerNotification={handleAddNotificationLog}
                onStartConsultation={(patient) => handleStartSoapFromCalendar(patient.id)}
                calendarBlocks={calendarBlocks}
                onSaveCalendarBlock={handleSaveCalendarBlock}
                onDeleteCalendarBlock={handleDeleteCalendarBlock}
                themeColor={activeCompany.colorPrimario}
```

- [ ] **Step 7: Verify with `npm run lint`**

Run: `npm run lint`
Expected: errors referencing `AgendaCalendarProps` missing fields are expected at this point (Task 3 adds them) — confirm the *only* errors are about `AgendaCalendar`'s prop types, nothing else. (If Task 2 and Task 3 are done in the same session before committing, this step can instead simply confirm zero errors once both are applied — see Task 3's own lint step for the authoritative check.)

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "feat: wire calendar blocks state and handlers into App.tsx"
```

---

### Task 3: `AgendaCalendar.tsx` — block creation UI

**Files:**
- Modify: `src/components/AgendaCalendar.tsx:1-2` (imports), `:27-55` (props interface + destructuring), state block after `:75`, handlers after `:171`, button area `:563-569`, modal insertion after the existing cita modal (`:651-804`), new list section before the notification history section (`:606`)

**Interfaces:**
- Consumes: `CalendarBlock` type (Task 1); `calendarBlocks`, `onSaveCalendarBlock`, `onDeleteCalendarBlock` props (Task 2).
- Produces: `isSlotBlocked` is added in Task 4, not here — this task only adds creation/listing UI, no enforcement yet.

- [ ] **Step 1: Update the mockData import (`src/components/AgendaCalendar.tsx:2`)**

Replace:
```typescript
import { Patient, User, Cita, CompaniaSmtpConfig, NotificationLog } from '../data/mockData';
```
with:
```typescript
import { Patient, User, Cita, CompaniaSmtpConfig, NotificationLog, CalendarBlock } from '../data/mockData';
```

- [ ] **Step 2: Update the props interface and destructuring (`src/components/AgendaCalendar.tsx:27-55`)**

Replace:
```typescript
interface AgendaCalendarProps {
  patients: Patient[];
  users: User[];
  citas: Cita[];
  smtpConfigs: CompaniaSmtpConfig[];
  logs: NotificationLog[];
  activeCompanyId: number;
  currentUser: User;
  onSaveCita: (cita: Cita) => void;
  onDeleteCita: (id: number) => void;
  onTriggerNotification: (log: NotificationLog) => void;
  onStartConsultation: (patient: Patient, citaId: number) => void;
  themeColor: string;
}

export default function AgendaCalendar({
  patients,
  users,
  citas,
  smtpConfigs,
  logs,
  activeCompanyId,
  currentUser,
  onSaveCita,
  onDeleteCita,
  onTriggerNotification,
  onStartConsultation,
  themeColor
}: AgendaCalendarProps) {
```
with:
```typescript
interface AgendaCalendarProps {
  patients: Patient[];
  users: User[];
  citas: Cita[];
  smtpConfigs: CompaniaSmtpConfig[];
  logs: NotificationLog[];
  activeCompanyId: number;
  currentUser: User;
  onSaveCita: (cita: Cita) => void;
  onDeleteCita: (id: number) => void;
  onTriggerNotification: (log: NotificationLog) => void;
  onStartConsultation: (patient: Patient, citaId: number) => void;
  calendarBlocks: CalendarBlock[];
  onSaveCalendarBlock: (block: CalendarBlock) => void;
  onDeleteCalendarBlock: (id: number) => void;
  themeColor: string;
}

export default function AgendaCalendar({
  patients,
  users,
  citas,
  smtpConfigs,
  logs,
  activeCompanyId,
  currentUser,
  onSaveCita,
  onDeleteCita,
  onTriggerNotification,
  onStartConsultation,
  calendarBlocks,
  onSaveCalendarBlock,
  onDeleteCalendarBlock,
  themeColor
}: AgendaCalendarProps) {
```

- [ ] **Step 3: Add block-form state, after `formError` (`src/components/AgendaCalendar.tsx:75`)**

Find:
```typescript
  const [formError, setFormError] = useState<string>('');
```
add immediately after it:
```typescript

  // Calendar block form state
  const [isBlockFormOpen, setIsBlockFormOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<CalendarBlock | null>(null);
  const [blockFechaInicio, setBlockFechaInicio] = useState<string>('');
  const [blockEsVariosDias, setBlockEsVariosDias] = useState(false);
  const [blockFechaFin, setBlockFechaFin] = useState<string>('');
  const [blockEsTodoElDia, setBlockEsTodoElDia] = useState(true);
  const [blockHoraInicio, setBlockHoraInicio] = useState<string>('08:00');
  const [blockHoraFin, setBlockHoraFin] = useState<string>('18:00');
  const [blockMotivo, setBlockMotivo] = useState<string>('');
```

- [ ] **Step 4: Add block handlers, after `handleOpenEditCita` (`src/components/AgendaCalendar.tsx:171`, right before `// Save changes` / `const handleFormSubmit`)**

Find:
```typescript
    setFormDoctorId(cita.idUsuarioNutricionista);
    setFormError('');
    setIsFormOpen(true);
  };

  // Save changes
  const handleFormSubmit = (e: React.FormEvent) => {
```
replace with:
```typescript
    setFormDoctorId(cita.idUsuarioNutricionista);
    setFormError('');
    setIsFormOpen(true);
  };

  // Calendar block handlers
  const handleOpenNewBlock = () => {
    setSelectedBlock(null);
    setBlockFechaInicio(formatDateString(currentDate));
    setBlockEsVariosDias(false);
    setBlockFechaFin(formatDateString(currentDate));
    setBlockEsTodoElDia(true);
    setBlockHoraInicio('08:00');
    setBlockHoraFin('18:00');
    setBlockMotivo('');
    setIsBlockFormOpen(true);
  };

  const handleOpenEditBlock = (block: CalendarBlock) => {
    setSelectedBlock(block);
    setBlockFechaInicio(block.fechaInicio);
    setBlockEsVariosDias(block.fechaFin !== block.fechaInicio);
    setBlockFechaFin(block.fechaFin);
    setBlockEsTodoElDia(!block.horaInicio || !block.horaFin);
    setBlockHoraInicio(block.horaInicio || '08:00');
    setBlockHoraFin(block.horaFin || '18:00');
    setBlockMotivo(block.motivo);
    setIsBlockFormOpen(true);
  };

  const handleBlockFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const fechaFin = blockEsVariosDias ? blockFechaFin : blockFechaInicio;
    const nextId = selectedBlock ? selectedBlock.id : Math.max(...calendarBlocks.map(b => b.id), 0) + 1;

    const savedBlock: CalendarBlock = {
      id: nextId,
      idCompania: activeCompanyId,
      idUsuarioNutricionista: currentUser.id,
      fechaInicio: blockFechaInicio,
      fechaFin,
      horaInicio: blockEsTodoElDia ? null : blockHoraInicio,
      horaFin: blockEsTodoElDia ? null : blockHoraFin,
      motivo: blockMotivo
    };

    onSaveCalendarBlock(savedBlock);
    setIsBlockFormOpen(false);
  };

  const handleDeleteBlock = (id: number) => {
    if (confirm('¿Está seguro de que desea eliminar este bloqueo de agenda?')) {
      onDeleteCalendarBlock(id);
      setIsBlockFormOpen(false);
    }
  };

  const myCalendarBlocks = calendarBlocks.filter(b => b.idCompania === activeCompanyId && b.idUsuarioNutricionista === currentUser.id);

  // Save changes
  const handleFormSubmit = (e: React.FormEvent) => {
```

- [ ] **Step 5: Add the "Bloquear Horario" button, before "+ Nueva Cita" (`src/components/AgendaCalendar.tsx:563-569`)**

Find:
```tsx
          <button
            onClick={() => handleOpenNewCita()}
            className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer ml-auto md:ml-0"
          >
            <Plus className="w-4 h-4" />
            Nueva Cita
          </button>
```
replace with:
```tsx
          <button
            onClick={handleOpenNewBlock}
            className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-extrabold px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer ml-auto md:ml-0"
          >
            <Lock className="w-4 h-4" />
            Bloquear Horario
          </button>

          <button
            onClick={() => handleOpenNewCita()}
            className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nueva Cita
          </button>
```

- [ ] **Step 6: Add the "Bloqueos de Agenda" list section, before the notification history section**

Find the comment `{/* Notification Logs History Section */}` and its enclosing `<div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">` opening tag. Insert this new block immediately BEFORE that comment:

```tsx
      {/* Calendar Blocks List Section */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-slate-500" />
            <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider">Bloqueos de Agenda</h3>
          </div>
          <span className="text-[10px] bg-slate-100 text-slate-600 font-bold border border-slate-200 px-2.5 py-0.5 rounded-full uppercase">
            {myCalendarBlocks.length} activo{myCalendarBlocks.length !== 1 ? 's' : ''}
          </span>
        </div>

        {myCalendarBlocks.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            No tienes horarios bloqueados. Usa "Bloquear Horario" para marcar fechas u horas no disponibles.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {myCalendarBlocks.map(block => (
              <div key={block.id} className="p-3.5 rounded-2xl border border-slate-150 bg-slate-50/50 hover:bg-slate-50 transition-all flex items-center justify-between gap-2 text-xs">
                <div>
                  <span className="font-bold text-slate-700 block">
                    {block.fechaInicio === block.fechaFin ? block.fechaInicio : `${block.fechaInicio} al ${block.fechaFin}`}
                    {block.horaInicio && block.horaFin ? ` · ${block.horaInicio} - ${block.horaFin}` : ' · Todo el día'}
                  </span>
                  {block.motivo && <span className="text-slate-500 block mt-0.5">{block.motivo}</span>}
                </div>
                <button
                  onClick={() => handleOpenEditBlock(block)}
                  className="text-slate-400 hover:text-rose-600 p-1.5 shrink-0 cursor-pointer"
                  title="Editar o eliminar"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

```

- [ ] **Step 7: Add the block creation/edit modal, right after the existing cita modal closes (`src/components/AgendaCalendar.tsx`, after the `)}` that closes `{isFormOpen && ( ... )}`, before the final closing `</div>\n  );\n}` of the component)**

Insert:
```tsx
      {isBlockFormOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in font-sans">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 bg-slate-950 text-white flex justify-between items-center" style={{ backgroundColor: themeColor }}>
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-teal-400" />
                <h3 className="text-sm font-bold">{selectedBlock ? 'Editar Bloqueo de Agenda' : 'Bloquear Horario de Agenda'}</h3>
              </div>
              <button onClick={() => setIsBlockFormOpen(false)} className="text-white hover:text-slate-200 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBlockFormSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-slate-600 text-xs font-bold mb-1.5">Fecha de Inicio *</label>
                <input
                  type="date"
                  required
                  value={blockFechaInicio}
                  onChange={(e) => setBlockFechaInicio(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="blockEsVariosDias"
                  checked={blockEsVariosDias}
                  onChange={(e) => {
                    setBlockEsVariosDias(e.target.checked);
                    if (e.target.checked) {
                      setBlockEsTodoElDia(true);
                    }
                  }}
                  className="rounded text-teal-600 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="blockEsVariosDias" className="text-xs font-bold text-slate-700 cursor-pointer">Bloquear varios días (ej. vacaciones)</label>
              </div>

              {blockEsVariosDias && (
                <div>
                  <label className="block text-slate-600 text-xs font-bold mb-1.5">Fecha de Fin *</label>
                  <input
                    type="date"
                    required
                    value={blockFechaFin}
                    onChange={(e) => setBlockFechaFin(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                  />
                </div>
              )}

              {!blockEsVariosDias && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="blockEsTodoElDia"
                    checked={blockEsTodoElDia}
                    onChange={(e) => setBlockEsTodoElDia(e.target.checked)}
                    className="rounded text-teal-600 w-4 h-4 cursor-pointer"
                  />
                  <label htmlFor="blockEsTodoElDia" className="text-xs font-bold text-slate-700 cursor-pointer">Todo el día</label>
                </div>
              )}

              {!blockEsVariosDias && !blockEsTodoElDia && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 text-xs font-bold mb-1.5">Hora Inicio *</label>
                    <input
                      type="time"
                      required
                      value={blockHoraInicio}
                      onChange={(e) => setBlockHoraInicio(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-xs font-bold mb-1.5">Hora Fin *</label>
                    <input
                      type="time"
                      required
                      value={blockHoraFin}
                      onChange={(e) => setBlockHoraFin(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-slate-600 text-xs font-bold mb-1.5">Motivo (opcional)</label>
                <input
                  type="text"
                  value={blockMotivo}
                  onChange={(e) => setBlockMotivo(e.target.value)}
                  placeholder="ej: Vacaciones, Capacitación, Cita personal"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                {selectedBlock ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteBlock(selectedBlock.id)}
                    className="text-rose-600 hover:text-rose-700 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    Eliminar
                  </button>
                ) : (
                  <div></div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsBlockFormOpen(false)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2 rounded-xl"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="text-white text-xs font-extrabold px-4 py-2 rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                    style={{ backgroundColor: themeColor }}
                  >
                    <Check className="w-4 h-4" />
                    {selectedBlock ? 'Actualizar Bloqueo' : 'Guardar Bloqueo'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
```

- [ ] **Step 8: Update `src/App.tsx` if lint reveals it's still missing props (cross-check with Task 2)**

If Task 2 was already completed, this should already be satisfied. Run `npm run lint` and confirm zero errors — any remaining error must be about something other than `AgendaCalendarProps`.

- [ ] **Step 9: Verify manually in the browser**

Run `npm run dev`, open the Agenda tab. Click "Bloquear Horario", create a one-day full-day block for today with a motivo, save, and confirm it appears in the new "Bloqueos de Agenda" list. Click it again, confirm the edit form pre-fills correctly, then delete it and confirm it disappears from the list. Create a "varios días" block and a "horario específico" block and confirm both save with the right shape (check via `curl http://localhost:3000/api/calendar-blocks` if using DB mode, or just visually via the list's date/hour text).

- [ ] **Step 10: Commit**

```bash
git add src/components/AgendaCalendar.tsx
git commit -m "feat: add calendar block creation UI to the Agenda"
```

---

### Task 4: `AgendaCalendar.tsx` — enforcement (block new scheduling)

**Files:**
- Modify: `src/components/AgendaCalendar.tsx` — add `isSlotBlocked` helper near `formatDateString`, modify `renderMonthView`'s day cell, `renderWeekView`'s hour cell, `renderDayView`'s hour cell, and `handleFormSubmit`.

**Interfaces:**
- Consumes: `calendarBlocks` prop, `selectedDoctorId` state (both already present after Tasks 2-3).
- Produces: `isSlotBlocked(dateStr: string, timeStr?: string): CalendarBlock | undefined` — used internally by this task's own view/save changes only.

- [ ] **Step 1: Add the `isSlotBlocked` helper, right after `formatDateString` (`src/components/AgendaCalendar.tsx`, find `const formatDateString = (date: Date) => { return date.toISOString().split('T')[0]; };`)**

Find:
```typescript
  const formatDateString = (date: Date) => {
    return date.toISOString().split('T')[0];
  };
```
add immediately after it:
```typescript

  // Returns the block covering (dateStr, timeStr) for the currently-filtered specialist, or undefined.
  // No block shading applies when "Todos los Especialistas" (id 0) is selected — a block is only
  // meaningful in relation to one specific specialist's calendar.
  const isSlotBlocked = (dateStr: string, timeStr?: string): CalendarBlock | undefined => {
    if (selectedDoctorId === 0) return undefined;
    return calendarBlocks.find(b => {
      if (b.idCompania !== activeCompanyId || b.idUsuarioNutricionista !== selectedDoctorId) return false;
      if (dateStr < b.fechaInicio || dateStr > b.fechaFin) return false;
      if (!b.horaInicio || !b.horaFin) return true;
      if (!timeStr) return false;
      return timeStr >= b.horaInicio && timeStr < b.horaFin;
    });
  };
```

- [ ] **Step 2: Enforce in `renderMonthView`'s day cell**

Find:
```tsx
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayCitas = filteredCitas.filter(c => c.fechaHora.startsWith(dateStr));

      days.push(
        <div 
          key={`day-${day}`} 
          onClick={() => handleOpenNewCita(dateStr)}
          className="h-28 border border-slate-100 hover:bg-slate-50/40 p-1.5 transition-colors cursor-pointer relative flex flex-col justify-between"
        >
          <span className="text-xs font-bold text-slate-500">{day}</span>
```
replace with:
```tsx
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayCitas = filteredCitas.filter(c => c.fechaHora.startsWith(dateStr));
      const dayBlock = isSlotBlocked(dateStr);

      days.push(
        <div 
          key={`day-${day}`} 
          onClick={() => {
            if (dayBlock) {
              alert(`Este día está bloqueado${dayBlock.motivo ? `: ${dayBlock.motivo}` : '.'}`);
              return;
            }
            handleOpenNewCita(dateStr);
          }}
          className={`h-28 border border-slate-100 p-1.5 transition-colors cursor-pointer relative flex flex-col justify-between ${
            dayBlock ? 'bg-slate-100/70 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(100,116,139,0.08)_6px,rgba(100,116,139,0.08)_12px)]' : 'hover:bg-slate-50/40'
          }`}
        >
          <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
            {day}
            {dayBlock && <Lock className="w-3 h-3 text-slate-400" />}
          </span>
```

- [ ] **Step 3: Enforce in `renderWeekView`'s hour cell**

Find:
```tsx
                  return (
                    <div 
                      key={i} 
                      onClick={() => handleOpenNewCita(dateStr, timeStr)}
                      className="border-r border-slate-100 hover:bg-slate-50/30 p-1 relative cursor-pointer min-h-16 flex flex-col gap-1 transition-colors"
                    >
                      {hourCitas.map(cita => {
```
replace with:
```tsx
                  const slotBlock = isSlotBlocked(dateStr, timeStr);

                  return (
                    <div 
                      key={i} 
                      onClick={() => {
                        if (slotBlock) {
                          alert(`Este horario está bloqueado${slotBlock.motivo ? `: ${slotBlock.motivo}` : '.'}`);
                          return;
                        }
                        handleOpenNewCita(dateStr, timeStr);
                      }}
                      className={`border-r border-slate-100 p-1 relative cursor-pointer min-h-16 flex flex-col gap-1 transition-colors ${
                        slotBlock ? 'bg-slate-100/70 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(100,116,139,0.08)_6px,rgba(100,116,139,0.08)_12px)]' : 'hover:bg-slate-50/30'
                      }`}
                    >
                      {slotBlock && hourCitas.length === 0 && (
                        <Lock className="w-3 h-3 text-slate-400 m-auto" />
                      )}
                      {hourCitas.map(cita => {
```

- [ ] **Step 4: Enforce in `renderDayView`'s hour cell**

Find:
```tsx
                <div 
                  onClick={() => handleOpenNewCita(dateStr, timeStr)}
                  className="flex-1 p-2 hover:bg-slate-50/40 transition-colors cursor-pointer flex flex-col gap-1.5"
                >
                  {hourCitas.length === 0 ? (
                    <span className="text-[10px] text-slate-300 italic font-medium block my-auto pl-2">Ranura disponible</span>
                  ) : (
```
replace with:
```tsx
                <div 
                  onClick={() => {
                    const slotBlock = isSlotBlocked(dateStr, timeStr);
                    if (slotBlock) {
                      alert(`Este horario está bloqueado${slotBlock.motivo ? `: ${slotBlock.motivo}` : '.'}`);
                      return;
                    }
                    handleOpenNewCita(dateStr, timeStr);
                  }}
                  className={`flex-1 p-2 transition-colors cursor-pointer flex flex-col gap-1.5 ${
                    isSlotBlocked(dateStr, timeStr) ? 'bg-slate-100/70 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,rgba(100,116,139,0.08)_6px,rgba(100,116,139,0.08)_12px)]' : 'hover:bg-slate-50/40'
                  }`}
                >
                  {hourCitas.length === 0 ? (
                    isSlotBlocked(dateStr, timeStr) ? (
                      <span className="text-[10px] text-slate-400 italic font-bold flex items-center gap-1 my-auto pl-2">
                        <Lock className="w-3 h-3" /> Bloqueado{isSlotBlocked(dateStr, timeStr)?.motivo ? `: ${isSlotBlocked(dateStr, timeStr)?.motivo}` : ''}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-300 italic font-medium block my-auto pl-2">Ranura disponible</span>
                    )
                  ) : (
```

- [ ] **Step 5: Validate in `handleFormSubmit` before saving**

Find:
```typescript
    const fullFechaHora = `${formDate}T${formTime}`;
    const nextId = selectedCita ? selectedCita.id : Math.max(...citas.map(c => c.id), 0) + 1;

    const savedCita: Cita = {
```
replace with:
```typescript
    const fullFechaHora = `${formDate}T${formTime}`;

    const slotChanged = !selectedCita || selectedCita.fechaHora !== fullFechaHora || selectedCita.idUsuarioNutricionista !== formDoctorId;
    if (slotChanged) {
      const blockingBlock = calendarBlocks.find(b => {
        if (b.idCompania !== activeCompanyId || b.idUsuarioNutricionista !== formDoctorId) return false;
        if (formDate < b.fechaInicio || formDate > b.fechaFin) return false;
        if (!b.horaInicio || !b.horaFin) return true;
        return formTime >= b.horaInicio && formTime < b.horaFin;
      });
      if (blockingBlock) {
        setFormError(`Este horario está bloqueado${blockingBlock.motivo ? `: ${blockingBlock.motivo}` : '.'} Elige otra fecha/hora.`);
        return;
      }
    }

    const nextId = selectedCita ? selectedCita.id : Math.max(...citas.map(c => c.id), 0) + 1;

    const savedCita: Cita = {
```

- [ ] **Step 6: Verify with `npm run lint`**

Run: `npm run lint`
Expected: zero errors.

- [ ] **Step 7: Verify manually in the browser**

With `npm run dev` running: select a specific specialist (not "Todos los Especialistas") in the doctor filter. Create a full-day block for tomorrow. In month view, confirm tomorrow's cell is shaded with a lock icon and clicking it shows an alert instead of opening the new-cita form. Switch to week/day view and confirm every hour cell for that day is shaded and non-functional the same way. Create a specific-hour block (e.g. 14:00-16:00 today) and confirm only those hour cells are shaded in week/day view, while month view still lets you click that day (since part of it is open) — then in the opened form, manually type a time inside the blocked range and submit; confirm `formError` shows the block message and the appointment is NOT saved. Confirm typing a time outside the blocked range on the same day saves normally. Finally, confirm editing an existing appointment that sits inside a block (without changing its date/time) still saves successfully (e.g. just change its notes or status).

- [ ] **Step 8: Commit**

```bash
git add src/components/AgendaCalendar.tsx
git commit -m "feat: prevent scheduling new appointments in blocked calendar slots"
```

---

## Plan Self-Review

**Spec coverage:** data model + backend CRUD (Task 1), state/wiring (Task 2), creation/listing UI (Task 3), and enforcement in all three calendar views plus the save handler (Task 4) — every section of `docs/superpowers/specs/2026-07-18-calendar-blocking-design.md` maps to a task above. No gaps found.

**Placeholder scan:** no "TBD"/"TODO"/vague instructions — every step shows literal code or commands.

**Type consistency:** `CalendarBlock` (Task 1) is used identically in Task 2's state/handlers, Task 3's form state/handlers, and Task 4's `isSlotBlocked` helper — field names (`fechaInicio`, `fechaFin`, `horaInicio`, `horaFin`, `motivo`, `idUsuarioNutricionista`) match across all four tasks. `onSaveCalendarBlock`/`onDeleteCalendarBlock` signatures match between Task 2's `App.tsx` handlers and Task 3's prop interface.
