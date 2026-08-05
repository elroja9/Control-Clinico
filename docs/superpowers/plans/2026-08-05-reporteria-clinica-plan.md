# Reportería Clínica (Clientes y Sesiones) + Estado de Consulta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `estado` (ABIERTA/CERRADA) field to Consulta with a "Cerrar Consulta" toggle, then build a new "Reportería" area showing clients and sessions attended per month or custom date range, sourced from that new estado field.

**Architecture:** Two backend endpoints added to `server.ts` following its existing dual-mode (`pool` query vs `local*` in-memory) pattern; one new self-contained React component (`ReporteriaClinica.tsx`, mirroring `ReportesFiscales.tsx`'s style: receives only `{ company }`, does its own `fetch`); a small toggle button + badge added to `ReportView.tsx`'s existing toolbar; one new nav tab in `App.tsx`.

**Tech Stack:** Express + TypeScript (`server.ts`), MySQL via `mysql2`, React + TypeScript, `recharts` (already installed, no new dependency).

## Global Constraints

- No new automated tests are added — this repo's only test suite is
  `src/utils/calorieFormulas.test.ts` (vitest); every other feature this
  session shipped without dedicated tests, and the approved spec
  (`docs/superpowers/specs/2026-08-05-reporteria-clinica-design.md`, "Fuera
  de alcance") explicitly confirms this. Each task's verification step is
  `npx tsc --noEmit -p .` (must stay clean) + `npx vitest run` (must stay
  16/16) as a regression gate, not new coverage.
- Historical consultations (saved before this change) keep `estado = 'ABIERTA'`
  by default — no retroactive backfill to `CERRADA`. This is an explicit,
  confirmed user decision; do not "fix" it during implementation.
- Consultas remain editable regardless of `estado` — closing/reopening never
  blocks the existing "Editar Cita" flow.
- All new endpoints are scoped by `session.idCompania` (never trust a
  company id from the request body/query for data access), matching every
  existing endpoint in `server.ts`.
- Dates: `consultas.fecha` and the `desde`/`hasta` query params are plain
  `YYYY-MM-DD` strings (lexicographically sortable). `citas.fechaHora` is
  `YYYY-MM-DDTHH:MM` — always compare on `fechaHora.slice(0, 10)` against
  `desde`/`hasta`, never the raw string.
- Follow the existing idempotent migration pattern: `ALTER TABLE ... ADD
  COLUMN IF NOT EXISTS ...` (see `server.ts:659-675` for the `consultas`
  table's existing columns) — no `CHANGE`/`MODIFY COLUMN` needed here since
  this is a brand new column, not a rename.

---

### Task 1: Add `estado` to Consultation type + migration + default on save

**Files:**
- Modify: `src/data/mockData.ts:154-326` (`Consultation` interface)
- Modify: `server.ts:675` (add one migration line after the existing `consultas` ALTER block)
- Modify: `server.ts:1786-1827` (`POST /api/consultations` — read/write `estado`)
- Modify: `src/components/ConsultationForm.tsx:436-445` (default `estado` on new/edited consultations)

**Interfaces:**
- Produces: `Consultation.estado?: 'ABIERTA' | 'CERRADA'` — every later task
  reads this field. `undefined`/missing always means "treat as ABIERTA"
  (never throw or coerce elsewhere).

- [ ] **Step 1: Add the field to the type**

In `src/data/mockData.ts`, in the `Consultation` interface (starts line 154),
add right after `compromiso: number; // 1-10` (line 162):

```typescript
  compromiso: number; // 1-10
  estado?: 'ABIERTA' | 'CERRADA'; // Nace ABIERTA; CERRADA cuando el nutricionista finaliza la sesión. Sigue siendo editable en ambos estados.
```

(Kept optional so existing seed data / in-flight objects that predate this
field don't need updating — every read site treats missing as `'ABIERTA'`.)

- [ ] **Step 2: Add the migration**

In `server.ts`, right after line 675
(`await pool.query(\`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS estiloVida JSON NULL\`);`),
add:

```typescript
    await pool.query(`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTA'`);
```

- [ ] **Step 3: Read/write `estado` in the existing save endpoint**

In `server.ts`, the `POST /api/consultations` handler (line 1786) currently
never mentions `estado`. Update the UPDATE statement (line 1796) by adding
`, estado = ?` to the SET clause and `con.estado || 'ABIERTA'` to its
parameter array (right before the trailing `con.id, con.id`):

```typescript
            await pool.query(
              "UPDATE consultas SET idPaciente = ?, id_paciente = ?, idCompania = ?, id_compania = ?, fecha = ?, fecha_consulta = ?, tipo = ?, motivo = ?, motivo_expectativas = ?, horasSueno = ?, horas_sueno = ?, compromiso = ?, compromiso_cumplir = ?, antropometria = ?, dieta = ?, fisioterapia = ?, anotacionesGenerales = ?, comentarios_nutricionista = ?, evaluacionAntropometrica = ?, evaluacionBioquimica = ?, evaluacionDietetica = ?, composicionSegmentada = ?, estiloVida = ?, estado = ? WHERE id = ? OR id_consulta = ?",
              [
                parseInt(con.idPaciente), parseInt(con.idPaciente), parseInt(con.idCompania), parseInt(con.idCompania), con.fecha, con.fecha, con.tipo, con.motivo, con.motivo, parseFloat(con.horasSueno), parseFloat(con.horasSueno), parseInt(con.compromiso), parseInt(con.compromiso), JSON.stringify(con.antropometria || null), JSON.stringify(con.dieta || null), JSON.stringify(con.fisioterapia || null), con.anotacionesGenerales, con.anotacionesGenerales,
                JSON.stringify(con.evaluacionAntropometrica || null), JSON.stringify(con.evaluacionBioquimica || null), JSON.stringify(con.evaluacionDietetica || null), JSON.stringify(con.composicionSegmentada || null), JSON.stringify(con.estiloVida || null), con.estado || 'ABIERTA',
                con.id, con.id
              ]
            );
```

And the INSERT statement (lines 1806-1812) similarly — add `estado` to the
column list and `con.estado || 'ABIERTA'` to the values:

```typescript
        const [result] = await pool.query(
          "INSERT INTO consultas (idPaciente, id_paciente, idCompania, id_compania, fecha, fecha_consulta, tipo, motivo, motivo_expectativas, horasSueno, horas_sueno, compromiso, compromiso_cumplir, antropometria, dieta, fisioterapia, anotacionesGenerales, comentarios_nutricionista, evaluacionAntropometrica, evaluacionBioquimica, evaluacionDietetica, composicionSegmentada, estiloVida, estado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            parseInt(con.idPaciente), parseInt(con.idPaciente), parseInt(con.idCompania), parseInt(con.idCompania), con.fecha, con.fecha, con.tipo, con.motivo, con.motivo, parseFloat(con.horasSueno), parseFloat(con.horasSueno), parseInt(con.compromiso), parseInt(con.compromiso), JSON.stringify(con.antropometria || null), JSON.stringify(con.dieta || null), JSON.stringify(con.fisioterapia || null), con.anotacionesGenerales, con.anotacionesGenerales,
            JSON.stringify(con.evaluacionAntropometrica || null), JSON.stringify(con.evaluacionBioquimica || null), JSON.stringify(con.evaluacionDietetica || null), JSON.stringify(con.composicionSegmentada || null), JSON.stringify(con.estiloVida || null), con.estado || 'ABIERTA'
          ]
        );
```

(The local in-memory fallback branch below, lines 1815-1823, needs no
change — it stores whatever object the client sent as-is.)

- [ ] **Step 4: Default `estado` when constructing a new/edited consultation client-side**

In `src/components/ConsultationForm.tsx`, in the `newConsultation` object
literal (starts line 436), add right after the `id` line:

```typescript
    const newConsultation: Consultation = {
      id: editingConsultation?.id ?? Date.now(),
      estado: editingConsultation?.estado ?? 'ABIERTA',
      idPaciente: patient.id,
```

This preserves an already-`CERRADA` consultation's status across an edit
(since `editingConsultation.estado` wins), and defaults brand-new
consultations to `'ABIERTA'`.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit -p .`
Expected: no output (clean).

Run: `npx vitest run`
Expected: `16 passed (16)`.

- [ ] **Step 6: Commit**

```bash
git add src/data/mockData.ts server.ts src/components/ConsultationForm.tsx
git commit -m "feat: add estado (ABIERTA/CERRADA) field to Consulta"
```

---

### Task 2: Backend endpoint to toggle Consulta estado

**Files:**
- Modify: `server.ts` (add new route right after the `POST /api/consultations` handler, i.e. after line 1827/before the `// 5. Citas` comment)

**Interfaces:**
- Consumes: `Consultation.estado` (Task 1).
- Produces: `POST /api/consultations/:id/estado` — body `{ estado: 'ABIERTA' | 'CERRADA' }`,
  returns the updated consultation JSON (same shape as `GET /api/consultations`
  rows, i.e. with JSON fields already parsed). Later tasks (ReportView) call
  this exact route.

- [ ] **Step 1: Add the endpoint**

In `server.ts`, right after the closing `});` of `POST /api/consultations`
(line 1827) and before the `// 5. Citas (Appointments)` comment (line 1829),
add:

```typescript
  app.post("/api/consultations/:id/estado", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      const id = parseInt(req.params.id);
      const estado = req.body.estado;
      if (estado !== 'ABIERTA' && estado !== 'CERRADA') {
        return res.status(400).json({ error: "Estado inválido. Use 'ABIERTA' o 'CERRADA'." });
      }
      if (dbConnected && pool) {
        const [result] = await pool.query(
          "UPDATE consultas SET estado = ? WHERE (id = ? OR id_consulta = ?) AND (idCompania = ? OR id_compania = ?)",
          [estado, id, id, session.idCompania, session.idCompania]
        );
        if ((result as any).affectedRows === 0) {
          return res.status(404).json({ error: "Consulta no encontrada." });
        }
        const [rows] = await pool.query("SELECT * FROM consultas WHERE id = ? OR id_consulta = ?", [id, id]);
        const row = (rows as any[])[0];
        if (!row) return res.status(404).json({ error: "Consulta no encontrada." });
        const norm = normalizeRow(row);
        res.json({
          ...norm,
          antropometria: typeof norm.antropometria === 'string' ? JSON.parse(norm.antropometria) : norm.antropometria,
          dieta: typeof norm.dieta === 'string' ? JSON.parse(norm.dieta) : norm.dieta,
          fisioterapia: typeof norm.fisioterapia === 'string' ? JSON.parse(norm.fisioterapia) : norm.fisioterapia,
          evaluacionAntropometrica: typeof norm.evaluacionAntropometrica === 'string' ? JSON.parse(norm.evaluacionAntropometrica) : norm.evaluacionAntropometrica,
          evaluacionBioquimica: typeof norm.evaluacionBioquimica === 'string' ? JSON.parse(norm.evaluacionBioquimica) : norm.evaluacionBioquimica,
          evaluacionDietetica: typeof norm.evaluacionDietetica === 'string' ? JSON.parse(norm.evaluacionDietetica) : norm.evaluacionDietetica,
          composicionSegmentada: typeof norm.composicionSegmentada === 'string' ? JSON.parse(norm.composicionSegmentada) : norm.composicionSegmentada,
          estiloVida: typeof norm.estiloVida === 'string' ? JSON.parse(norm.estiloVida) : norm.estiloVida
        });
      } else {
        const idx = localConsultations.findIndex(c => c.id === id && c.idCompania === session.idCompania);
        if (idx === -1) return res.status(404).json({ error: "Consulta no encontrada." });
        localConsultations[idx] = { ...localConsultations[idx], estado };
        res.json(localConsultations[idx]);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p .`
Expected: clean.

Manual check (dev server running): `POST /api/consultations/<id>/estado`
with body `{"estado":"CERRADA"}` for a consultation belonging to the logged
company returns 200 with `estado: "CERRADA"` in the response; repeating
with an id from a different company returns 404.

- [ ] **Step 3: Commit**

```bash
git add server.ts
git commit -m "feat: add endpoint to toggle consulta estado (cerrar/reabrir)"
```

---

### Task 3: "Cerrar Consulta" / "Reabrir Consulta" button in ReportView

**Files:**
- Modify: `src/components/ReportView.tsx` (props interface lines 6-24, component body starting line 38, toolbar lines 89-104)
- Modify: `src/App.tsx` (new handler near `handleSaveConsultation` at line 491, `ReportView` render at lines 1259-1268)

**Interfaces:**
- Consumes: `POST /api/consultations/:id/estado` (Task 2).
- Produces: `ReportViewProps.onConsultationUpdated: (consulta: Consultation) => void` —
  no later task consumes this further; it just needs to update `App.tsx`'s
  `consultations` array so other views (patient cards, future re-opens of
  this same report) see the fresh `estado`.

- [ ] **Step 1: Add the callback prop and local toggle state**

In `src/components/ReportView.tsx`, add to `ReportViewProps` (after line 12,
`onNotificationSent: (log: NotificationLog) => void;`):

```typescript
  onNotificationSent: (log: NotificationLog) => void;
  onConsultationUpdated: (consulta: Consultation) => void;
```

Update the function signature (line 38) to destructure it:

```typescript
export default function ReportView({ consultation, patient, company, servicios, onClose, onNotificationSent, onConsultationUpdated, onCrearFactura, onVerificarEstadoFactura }: ReportViewProps) {
```

Add local state right after `const [facturando, setFacturando] = useState(false);` (line 41):

```typescript
  const [estadoActual, setEstadoActual] = useState<'ABIERTA' | 'CERRADA'>(consultation.estado ?? 'ABIERTA');
  const [cambiandoEstado, setCambiandoEstado] = useState(false);
```

- [ ] **Step 2: Add the toggle handler**

Right after `const companyServicios = ...` line (line 43), add:

```typescript
  const handleToggleEstado = async () => {
    const nuevoEstado = estadoActual === 'CERRADA' ? 'ABIERTA' : 'CERRADA';
    setCambiandoEstado(true);
    try {
      const res = await fetch(`/api/consultations/${consultation.id}/estado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el estado de la consulta.');
      setEstadoActual(nuevoEstado);
      onConsultationUpdated(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo actualizar el estado de la consulta.');
    } finally {
      setCambiandoEstado(false);
    }
  };
```

- [ ] **Step 3: Add the badge + button to the toolbar**

In the toolbar's button group (`<div className="flex gap-2 text-xs">`, line
89), add a badge + toggle button as the first children, right before the
"Enviar a Correo" button (line 90):

```tsx
        <div className="flex gap-2 text-xs items-center">
          <span className={`font-bold px-2.5 py-1.5 rounded-xl border ${
            estadoActual === 'CERRADA'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            {estadoActual}
          </span>
          <button
            onClick={handleToggleEstado}
            disabled={cambiandoEstado}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-3 rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 disabled:opacity-60"
          >
            <CheckCircle2 className="w-4 h-4" />
            {cambiandoEstado ? 'Guardando...' : estadoActual === 'CERRADA' ? 'Reabrir Consulta' : 'Cerrar Consulta'}
          </button>
          <button
            onClick={sendClientEmail}
```

(`CheckCircle2` is already imported at line 2, no new import needed. Note
this replaces the plain opening `<button` at line 90 — leave that button's
own JSX untouched, just insert the badge + new button immediately before it
and adjust the wrapping `<div>`'s className as shown.)

- [ ] **Step 4: Wire the new prop in App.tsx**

In `src/App.tsx`, add a handler right after `handleSaveConsultation` (after
line 512, before `handleDeleteConsultation`):

```typescript
  const handleConsultationUpdated = (consulta: Consultation) => {
    setConsultations(prev => prev.map(c => c.id === consulta.id ? consulta : c));
    setSelectedReportConsultation(consulta);
  };
```

Pass it to `<ReportView>` (in the props list starting line 1259, right
after `onNotificationSent={handleAddNotificationLog}` at line 1265):

```tsx
          onNotificationSent={handleAddNotificationLog}
          onConsultationUpdated={handleConsultationUpdated}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit -p .`
Expected: clean.

Manual check (dev server + browser): open a saved consultation's report,
click "Cerrar Consulta" — badge flips to `CERRADA` and button label becomes
"Reabrir Consulta"; click again — reverts to `ABIERTA`. Confirm no console
errors and the change survives closing/reopening the report (re-fetch the
consultations list).

- [ ] **Step 6: Commit**

```bash
git add src/components/ReportView.tsx src/App.tsx
git commit -m "feat: add Cerrar/Reabrir Consulta toggle to ReportView"
```

---

### Task 4: Backend reporting endpoint (`GET /api/reportes/clientes-sesiones`)

**Files:**
- Modify: `server.ts` (add a pure builder function near `construirReporteD104` at line 986, and a new route near the other `/api/reportes/*` routes, e.g. right before `app.get("/api/reportes/d104"...)` around line 3721)

**Interfaces:**
- Consumes: `Cita` (`estadoCita`, `fechaHora`, `idPaciente`), `Consultation`
  (`estado`, `fecha`, `idPaciente`), `Patient` (`id`, `nombreCompleto`) — all
  already defined.
- Produces: `GET /api/reportes/clientes-sesiones?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`
  returning:
  ```typescript
  interface ReporteClientesSesiones {
    resumen: {
      pacientesNuevos: number;
      pacientesAtendidos: number;
      sesionesCompletadas: number;
      tasaAsistencia: number; // 0-100, one decimal
    };
    tendenciaMensual: Array<{ mes: string; pacientesNuevos: number; sesionesCompletadas: number }>;
    pacientes: Array<{ idPaciente: number; nombreCompleto: string; sesionesCompletadas: number; esNuevo: boolean }>;
  }
  ```
  Task 5 (frontend) consumes this exact shape — keep field names identical.

- [ ] **Step 1: Write the pure builder function**

In `server.ts`, near `construirReporteD104` (line 986), add (this is a pure
function — no `pool`/`req`/`res` — so it can be reasoned about and manually
verified independently of the dual-mode plumbing):

```typescript
interface ReporteClientesSesiones {
  resumen: {
    pacientesNuevos: number;
    pacientesAtendidos: number;
    sesionesCompletadas: number;
    tasaAsistencia: number;
  };
  tendenciaMensual: Array<{ mes: string; pacientesNuevos: number; sesionesCompletadas: number }>;
  pacientes: Array<{ idPaciente: number; nombreCompleto: string; sesionesCompletadas: number; esNuevo: boolean }>;
}

function construirReporteClientesSesiones(
  desde: string,
  hasta: string,
  citas: Array<{ idPaciente: number; fechaHora: string; estadoCita: string }>,
  consultas: Array<{ idPaciente: number; fecha: string; estado?: string }>,
  pacientes: Array<{ id: number; nombreCompleto: string }>
): ReporteClientesSesiones {
  const enRango = (fecha: string) => {
    const dia = fecha.slice(0, 10);
    return dia >= desde && dia <= hasta;
  };

  // Primera cita histórica por paciente (de cualquier estado, sin importar el rango) —
  // define cuándo "nació" el paciente para efectos de reportería.
  const primeraCitaPorPaciente = new Map<number, string>();
  for (const c of citas) {
    const actual = primeraCitaPorPaciente.get(c.idPaciente);
    if (!actual || c.fechaHora < actual) primeraCitaPorPaciente.set(c.idPaciente, c.fechaHora);
  }
  const esNuevoEnRango = (idPaciente: number) => {
    const primera = primeraCitaPorPaciente.get(idPaciente);
    return primera != null && enRango(primera);
  };

  const consultasCerradasEnRango = consultas.filter(c => c.estado === 'CERRADA' && enRango(c.fecha));
  const citasEnRango = citas.filter(c => enRango(c.fechaHora));

  const sesionesPorPaciente = new Map<number, number>();
  for (const c of consultasCerradasEnRango) {
    sesionesPorPaciente.set(c.idPaciente, (sesionesPorPaciente.get(c.idPaciente) || 0) + 1);
  }

  const completadas = citasEnRango.filter(c => c.estadoCita === 'COMPLETADA').length;
  const elegibles = citasEnRango.filter(c => c.estadoCita === 'COMPLETADA' || c.estadoCita === 'NO_ASISTIO' || c.estadoCita === 'CANCELADA').length;

  const meses: string[] = [];
  const cursor = new Date(desde + 'T00:00:00');
  cursor.setDate(1);
  const fin = new Date(hasta + 'T00:00:00');
  while (cursor <= fin) {
    meses.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const tendenciaMensual = meses.map(mes => ({
    mes,
    pacientesNuevos: Array.from(primeraCitaPorPaciente.values()).filter(f => f.slice(0, 7) === mes && enRango(f)).length,
    sesionesCompletadas: consultasCerradasEnRango.filter(c => c.fecha.slice(0, 7) === mes).length
  }));

  const pacientesDetalle = pacientes
    .map(p => ({
      idPaciente: p.id,
      nombreCompleto: p.nombreCompleto,
      sesionesCompletadas: sesionesPorPaciente.get(p.id) || 0,
      esNuevo: esNuevoEnRango(p.id)
    }))
    .filter(p => p.sesionesCompletadas > 0 || p.esNuevo)
    .sort((a, b) => b.sesionesCompletadas - a.sesionesCompletadas);

  return {
    resumen: {
      pacientesNuevos: pacientes.filter(p => esNuevoEnRango(p.id)).length,
      pacientesAtendidos: sesionesPorPaciente.size,
      sesionesCompletadas: consultasCerradasEnRango.length,
      tasaAsistencia: elegibles > 0 ? Math.round((completadas / elegibles) * 1000) / 10 : 0
    },
    tendenciaMensual,
    pacientes: pacientesDetalle
  };
}
```

- [ ] **Step 2: Add the route**

In `server.ts`, right before `app.get("/api/reportes/d104", ...)` (the
route whose handler body starts at line 3722), add:

```typescript
  app.get("/api/reportes/clientes-sesiones", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      const desde = String(req.query.desde || "");
      const hasta = String(req.query.hasta || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
        return res.status(400).json({ error: "Parámetros desde/hasta inválidos. Use el formato YYYY-MM-DD." });
      }
      let citas: Array<{ idPaciente: number; fechaHora: string; estadoCita: string }>;
      let consultas: Array<{ idPaciente: number; fecha: string; estado?: string }>;
      let pacientes: Array<{ id: number; nombreCompleto: string }>;
      if (dbConnected && pool) {
        const [citasRows] = await pool.query("SELECT idPaciente, fechaHora, estadoCita FROM citas WHERE idCompania = ?", [idCompania]);
        citas = (citasRows as any[]).map(normalizeRow);
        const [consultasRows] = await pool.query("SELECT idPaciente, id_paciente, fecha, estado FROM consultas WHERE idCompania = ? OR id_compania = ?", [idCompania, idCompania]);
        consultas = (consultasRows as any[]).map(normalizeRow).map(c => ({ idPaciente: c.idPaciente, fecha: c.fecha, estado: c.estado }));
        const [pacientesRows] = await pool.query("SELECT id, id_paciente, nombreCompleto FROM pacientes WHERE idCompania = ? OR id_compania = ?", [idCompania, idCompania]);
        pacientes = (pacientesRows as any[]).map(normalizeRow).map(p => ({ id: p.id, nombreCompleto: p.nombreCompleto }));
      } else {
        citas = localCitas.filter(c => c.idCompania === idCompania).map(c => ({ idPaciente: c.idPaciente, fechaHora: c.fechaHora, estadoCita: c.estadoCita }));
        consultas = localConsultations.filter(c => c.idCompania === idCompania).map(c => ({ idPaciente: c.idPaciente, fecha: c.fecha, estado: c.estado }));
        pacientes = localPatients.filter(p => p.idCompania === idCompania).map(p => ({ id: p.id, nombreCompleto: p.nombreCompleto }));
      }
      res.json(construirReporteClientesSesiones(desde, hasta, citas, consultas, pacientes));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p .`
Expected: clean.

Manual check (dev server): `GET /api/reportes/clientes-sesiones?desde=2026-08-01&hasta=2026-08-31`
returns 200 with the `resumen`/`tendenciaMensual`/`pacientes` shape above;
omitting `desde` returns 400.

- [ ] **Step 4: Commit**

```bash
git add server.ts
git commit -m "feat: add GET /api/reportes/clientes-sesiones endpoint"
```

---

### Task 5: `ReporteriaClinica.tsx` component

**Files:**
- Create: `src/components/ReporteriaClinica.tsx`

**Interfaces:**
- Consumes: `GET /api/reportes/clientes-sesiones?desde=...&hasta=...` (Task 4),
  `Company` type (`mockData.ts`) for `company.colorPrimario`/`company.id` (props
  pattern identical to `ReportesFiscales.tsx`).
- Produces: default export `ReporteriaClinica({ company }: { company: Company })`
  — consumed by Task 6's `App.tsx` wiring.

- [ ] **Step 1: Create the component**

Create `src/components/ReporteriaClinica.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { Company } from '../data/mockData';
import { BarChart3, Users, UserPlus, CheckCircle2, TrendingUp, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ReporteriaClinicaProps {
  company: Company;
}

interface ReporteClientesSesiones {
  resumen: {
    pacientesNuevos: number;
    pacientesAtendidos: number;
    sesionesCompletadas: number;
    tasaAsistencia: number;
  };
  tendenciaMensual: Array<{ mes: string; pacientesNuevos: number; sesionesCompletadas: number }>;
  pacientes: Array<{ idPaciente: number; nombreCompleto: string; sesionesCompletadas: number; esNuevo: boolean }>;
}

function primerDiaMes(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function ultimoDiaMes(): string {
  const d = new Date();
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${ultimo.getFullYear()}-${String(ultimo.getMonth() + 1).padStart(2, '0')}-${String(ultimo.getDate()).padStart(2, '0')}`;
}

function mesActual(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function ReporteriaClinica({ company }: ReporteriaClinicaProps) {
  const [modo, setModo] = useState<'mensual' | 'rango'>('mensual');
  const [mes, setMes] = useState(mesActual());
  const [desde, setDesde] = useState(primerDiaMes());
  const [hasta, setHasta] = useState(ultimoDiaMes());
  const [reporte, setReporte] = useState<ReporteClientesSesiones | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  const rangoEfectivo = (): { desde: string; hasta: string } => {
    if (modo === 'mensual') {
      const [anio, mesNum] = mes.split('-').map(Number);
      const ultimo = new Date(anio, mesNum, 0).getDate();
      return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` };
    }
    return { desde, hasta };
  };

  const cargarReporte = () => {
    const { desde: d, hasta: h } = rangoEfectivo();
    setCargando(true);
    setError('');
    fetch(`/api/reportes/clientes-sesiones?desde=${d}&hasta=${h}`)
      .then(res => res.json().then(data => ({ ok: res.ok, data })))
      .then(({ ok, data }) => { if (!ok) throw new Error(data.error); setReporte(data); })
      .catch(err => setError(err.message || 'No se pudo cargar el reporte.'))
      .finally(() => setCargando(false));
  };

  useEffect(() => { cargarReporte(); }, [modo, mes, desde, hasta]);

  const exportarCsv = () => {
    if (!reporte) return;
    const encabezado = 'Paciente,Sesiones Completadas,Nuevo\n';
    const filas = reporte.pacientes
      .map(p => `"${p.nombreCompleto.replace(/"/g, '""')}",${p.sesionesCompletadas},${p.esNuevo ? 'Sí' : 'No'}`)
      .join('\n');
    const blob = new Blob([encabezado + filas], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const { desde: d, hasta: h } = rangoEfectivo();
    a.href = url;
    a.download = `reporte-pacientes-sesiones-${d}-a-${h}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 mr-auto">
          <BarChart3 className="w-4 h-4" style={{ color: company.colorPrimario }} />
          <h3 className="text-sm font-bold text-slate-800">Reportería de Clientes y Sesiones</h3>
        </div>
        <div className="flex bg-slate-100 rounded-xl p-1 text-xs font-semibold">
          <button
            onClick={() => setModo('mensual')}
            className={`px-3 py-1.5 rounded-lg transition-all ${modo === 'mensual' ? 'bg-white shadow-xs text-slate-800' : 'text-slate-500'}`}
          >
            Mensual
          </button>
          <button
            onClick={() => setModo('rango')}
            className={`px-3 py-1.5 rounded-lg transition-all ${modo === 'rango' ? 'bg-white shadow-xs text-slate-800' : 'text-slate-500'}`}
          >
            Rango personalizado
          </button>
        </div>
        {modo === 'mensual' ? (
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs"
          />
        ) : (
          <div className="flex items-center gap-2">
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs" />
            <span className="text-xs text-slate-400">a</span>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs" />
          </div>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-600 text-xs">{error}</div>
      )}

      {cargando ? (
        <div className="text-center text-xs text-slate-400 py-10">Cargando reporte...</div>
      ) : reporte && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <UserPlus className="w-3.5 h-3.5" /> Pacientes Nuevos
              </div>
              <span className="text-2xl font-bold text-slate-900">{reporte.resumen.pacientesNuevos}</span>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <Users className="w-3.5 h-3.5" /> Pacientes Atendidos
              </div>
              <span className="text-2xl font-bold text-slate-900">{reporte.resumen.pacientesAtendidos}</span>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> Sesiones Completadas
              </div>
              <span className="text-2xl font-bold text-slate-900">{reporte.resumen.sesionesCompletadas}</span>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                <TrendingUp className="w-3.5 h-3.5" /> Tasa de Asistencia
              </div>
              <span className="text-2xl font-bold text-slate-900">{reporte.resumen.tasaAsistencia}%</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <h4 className="text-xs font-bold text-slate-600 mb-3">Tendencia Mensual</h4>
            <div style={{ width: '100%', height: 260 }}>
              <ResponsiveContainer>
                <BarChart data={reporte.tendenciaMensual}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="pacientesNuevos" name="Pacientes Nuevos" fill="#0ea5e9" />
                  <Bar dataKey="sesionesCompletadas" name="Sesiones Completadas" fill="#0f766e" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-xs font-bold text-slate-600">Detalle por Paciente</h4>
              <button
                onClick={exportarCsv}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-1.5 px-3 rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 text-xs"
              >
                <Download className="w-3.5 h-3.5" />
                Exportar CSV
              </button>
            </div>
            {reporte.pacientes.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">No hay datos para el período seleccionado.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-100">
                      <th className="py-2 pr-3">Paciente</th>
                      <th className="py-2 pr-3">Sesiones Completadas</th>
                      <th className="py-2 pr-3">Nuevo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporte.pacientes.map(p => (
                      <tr key={p.idPaciente} className="border-b border-slate-50">
                        <td className="py-2 pr-3 font-semibold text-slate-800">{p.nombreCompleto}</td>
                        <td className="py-2 pr-3 text-slate-600">{p.sesionesCompletadas}</td>
                        <td className="py-2 pr-3">
                          {p.esNuevo && <span className="bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded-full text-[10px] font-bold">Nuevo</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p .`
Expected: clean (this component isn't wired into `App.tsx` yet, so it won't
render anywhere until Task 6, but it must still type-check standalone).

- [ ] **Step 3: Commit**

```bash
git add src/components/ReporteriaClinica.tsx
git commit -m "feat: add ReporteriaClinica component"
```

---

### Task 6: Wire the new "Reportería" tab into App.tsx

**Files:**
- Modify: `src/App.tsx` (imports, `activeTab` union at line 334, mobile nav
  ~1181-1193, desktop nav ~1405-1417, render block ~1917-1920)

**Interfaces:**
- Consumes: `ReporteriaClinica` (Task 5), `activeCompany` (existing variable
  already used by the `reportes-fiscales` render block).

- [ ] **Step 1: Add imports**

In `src/App.tsx`, add `BarChart3` to the existing `lucide-react` import
list (after `FileSpreadsheet` at line 27):

```typescript
  FileSpreadsheet,
  BarChart3
} from 'lucide-react';
```

Add the component import after `import ReportesFiscales from './components/ReportesFiscales';` (line 86):

```typescript
import ReportesFiscales from './components/ReportesFiscales';
import ReporteriaClinica from './components/ReporteriaClinica';
```

- [ ] **Step 2: Extend `activeTab` union**

Line 334, add `'reporteria'` to the union (right after `'reportes-fiscales'`):

```typescript
  const [activeTab, setActiveTab] = useState<'dashboard' | 'patients' | 'consultations' | 'agenda' | 'branding' | 'saas-admin' | 'mi-perfil' | 'reservas-online' | 'facturacion' | 'cxp' | 'reportes-fiscales' | 'reporteria'>('dashboard');
```

- [ ] **Step 3: Add the mobile nav button**

Right after the `reportes-fiscales` mobile button's closing `</button>`
(line 1193), add:

```tsx
            <button
              onClick={() => { setActiveTab('reporteria'); setIsMobileMenuOpen(false); }}
              className={`flex items-center justify-between py-2.5 px-3.5 rounded-xl text-xs font-semibold transition-all sm:col-span-2 ${
                activeTab === 'reporteria'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                <span>Reportería</span>
              </div>
            </button>
```

- [ ] **Step 4: Add the desktop nav button**

Right after the `reportes-fiscales` desktop button's closing `</button>`
(line 1417), add:

```tsx
              <button
                onClick={() => setActiveTab('reporteria')}
                className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'reporteria'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  <span>Reportería</span>
                </div>
              </button>
```

- [ ] **Step 5: Add the render block**

Right after the `reportes-fiscales` render block's closing `)}` (line 1920),
add:

```tsx
            {/* ================= REPORTERÍA DE CLIENTES Y SESIONES ================= */}
            {activeTab === 'reporteria' && (
              <ReporteriaClinica company={activeCompany} />
            )}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit -p .`
Expected: clean.

Run: `npx vitest run`
Expected: `16 passed (16)`.

Manual check (dev server + browser): log in, click "Reportería" in the nav
(mobile and desktop), confirm the page loads with the current month
pre-selected, summary cards render, the bar chart renders, switching to
"Rango personalizado" and picking dates reloads the data, and "Exportar
CSV" downloads a file with the expected columns.

- [ ] **Step 7: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add Reportería nav tab wiring ReporteriaClinica into App"
```

---

## Self-Review Notes

- **Spec coverage:** Part 1 (estado + Cerrar/Reabrir) → Tasks 1-3. Part 2
  (reportería endpoint + UI + nav) → Tasks 4-6. Both spec sections fully
  covered.
- **Placeholder scan:** none found — every step has concrete code.
- **Type consistency:** `ReporteClientesSesiones` field names
  (`resumen.pacientesNuevos/pacientesAtendidos/sesionesCompletadas/tasaAsistencia`,
  `tendenciaMensual[].mes/pacientesNuevos/sesionesCompletadas`,
  `pacientes[].idPaciente/nombreCompleto/sesionesCompletadas/esNuevo`) match
  identically between Task 4 (backend) and Task 5 (frontend consumer).
  `Consultation.estado` type (`'ABIERTA' | 'CERRADA' | undefined`) is
  consistent across Tasks 1-4.
