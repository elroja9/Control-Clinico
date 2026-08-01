# Página Pública de Citas con Validación de Traslado — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página pública `/agendar` donde cualquier persona escoge clínica →
profesional → tipo de visita (consultorio/domicilio) → horario libre →
(si es domicilio) dirección validada por tiempo de traslado vía Google
Maps → datos del paciente → cita confirmada de inmediato.

**Architecture:** Endpoints públicos nuevos (sin auth) en `server.ts`, un
helper `server/googleMaps.ts` para la validación autoritativa de traslado,
y un componente React nuevo `PublicBooking.tsx` servido en `/agendar` sin
pasar por el login (revisión simple de `window.location.pathname` en
`src/main.tsx`, sin agregar `react-router-dom`).

**Tech Stack:** React 19 + TypeScript + Vite, Express + mysql2, Google
Maps Platform (Distance Matrix API server-side, Maps JavaScript API +
Places Autocomplete en el navegador).

Referencia completa de diseño:
`docs/superpowers/specs/2026-07-20-public-booking-page-design.md`.

## Global Constraints

- No hay framework de pruebas en este proyecto. La verificación de cada
  tarea es `npm run lint` + `npm run build` limpios, y una verificación
  manual (curl/script Node contra la base de datos real, usando una
  empresa/profesional/paciente de prueba desechable que se borra al
  terminar) — mismo patrón usado en el panel SaaS de esta misma sesión.
- Toda columna/tabla nueva se crea con `ALTER TABLE ADD COLUMN IF NOT
  EXISTS` / `CREATE TABLE IF NOT EXISTS` dentro de `createTables()` en
  `server.ts` — nunca se vuelve a ejecutar `ConsultorioDB_schema.sql`
  completo en el arranque.
- La API key de Google Maps (`GOOGLE_MAPS_API_KEY`) ya está en `.env`
  (gitignored). El servidor la usa directamente para Distance Matrix
  (nunca se expone tal cual esa ruta). Para el navegador (Places
  Autocomplete), se sirve a través de `GET /api/public/config` — el mismo
  valor, ya que la Maps JavaScript API siempre es visible en el navegador
  por naturaleza; la mitigación real es restringirla por HTTP referrer en
  Google Cloud Console (ya se le indicó esto al usuario).
- El tiempo de traslado **nunca** se calcula ni se confía en un valor
  calculado por el navegador — la validación bloqueante ocurre siempre en
  `POST /api/public/citas`, llamando a `server/googleMaps.ts`.
- Las citas de esta página pública se insertan con `estadoCita:
  'PROGRAMADA'` directamente (sin paso de confirmación manual), por
  decisión explícita ya tomada — no agregar un estado "pendiente" aquí.
- El endpoint público nunca expone `usuario`/`contrasena`/`correo` de los
  profesionales, ni datos fiscales/SMTP de las empresas — solo los campos
  listados explícitamente en cada endpoint de este plan.
- Todas las columnas nuevas de este plan (`companias.horarioAtencion`,
  `usuarios.ubicacion*`/`maxTiempoTrasladoMinutos`,
  `citas.tipoVisita`/`direccionDomicilio`/`pacienteLat`/`pacienteLng`/
  `tiempoTrasladoMinutos`) se crean en camelCase puro — no requieren
  ninguna entrada nueva en `normalizeRow()`.

---

### Task 1: Modelo de datos — tipos, esquema y migraciones

**Files:**
- Modify: `src/data/mockData.ts`
- Modify: `ConsultorioDB_schema.sql`
- Modify: `server.ts` (variables de fallback en memoria, `createTables()`)

**Interfaces:**
- Produces: `HorarioDia`, `HorarioAtencion`, `DEFAULT_HORARIO_ATENCION`
  (tipos + constante nuevos); `Company.horarioAtencion`;
  `User.ubicacionDireccion`/`ubicacionLat`/`ubicacionLng`/
  `maxTiempoTrasladoMinutos`; `Cita.tipoVisita`/`direccionDomicilio`/
  `pacienteLat`/`pacienteLng`/`tiempoTrasladoMinutos`.

- [ ] **Paso 1: Tipos de horario de atención en `src/data/mockData.ts`**

Al inicio del archivo, después de `import { TableInfo } from './schema';`,
agregar:

```ts
export interface HorarioDia {
  abre: string | null;   // 'HH:MM', null = cerrado ese día
  cierra: string | null; // 'HH:MM'
}

export interface HorarioAtencion {
  lunes: HorarioDia;
  martes: HorarioDia;
  miercoles: HorarioDia;
  jueves: HorarioDia;
  viernes: HorarioDia;
  sabado: HorarioDia;
  domingo: HorarioDia;
}

export const DEFAULT_HORARIO_ATENCION: HorarioAtencion = {
  lunes: { abre: '08:00', cierra: '18:00' },
  martes: { abre: '08:00', cierra: '18:00' },
  miercoles: { abre: '08:00', cierra: '18:00' },
  jueves: { abre: '08:00', cierra: '18:00' },
  viernes: { abre: '08:00', cierra: '18:00' },
  sabado: { abre: '08:00', cierra: '12:00' },
  domingo: { abre: null, cierra: null }
};
```

- [ ] **Paso 2: Campos nuevos en `Company`, `User` y `Cita`**

En la interfaz `Company`, agregar al final (antes del `}` de cierre):

```ts
  horarioAtencion: HorarioAtencion;
```

En la interfaz `User`, agregar al final:

```ts
  ubicacionDireccion: string | null;
  ubicacionLat: number | null;
  ubicacionLng: number | null;
  maxTiempoTrasladoMinutos: number;
```

En la interfaz `Cita`, agregar al final:

```ts
  tipoVisita: 'CONSULTORIO' | 'DOMICILIO';
  direccionDomicilio?: string | null;
  pacienteLat?: number | null;
  pacienteLng?: number | null;
  tiempoTrasladoMinutos?: number | null;
```

- [ ] **Paso 3: Actualizar `defaultCompanies`, `defaultUsers` y
  `defaultCitas` con los campos nuevos**

En cada uno de los 2 objetos de `defaultCompanies`, agregar:

```ts
    horarioAtencion: DEFAULT_HORARIO_ATENCION,
```

En cada uno de los 2 objetos de `defaultUsers`, agregar:

```ts
    ubicacionDireccion: null,
    ubicacionLat: null,
    ubicacionLng: null,
    maxTiempoTrasladoMinutos: 45,
```

En cada uno de los 4 objetos de `defaultCitas`, agregar:

```ts
    tipoVisita: 'CONSULTORIO',
```

(los campos de domicilio quedan `undefined`, ya son opcionales — no hace
falta agregarlos a los defaults).

- [ ] **Paso 4: `ConsultorioDB_schema.sql` — columnas nuevas**

En la definición `CREATE TABLE companias`, agregar antes del cierre:

```sql
  `horarioAtencion` json DEFAULT NULL,
```

En la definición `CREATE TABLE usuarios`, agregar antes del cierre (antes
de la coma final que precede a `CONSTRAINT fk_usuarios_compania`):

```sql
  `ubicacionDireccion` varchar(255) DEFAULT NULL,
  `ubicacionLat` decimal(10,7) DEFAULT NULL,
  `ubicacionLng` decimal(10,7) DEFAULT NULL,
  `maxTiempoTrasladoMinutos` int(11) NOT NULL DEFAULT 45,
```

`citas` no está en este archivo (es una tabla creada directamente por
`server.ts`, ver Paso 5) — no requiere cambio aquí.

- [ ] **Paso 5: Migraciones idempotentes en `server.ts`**

Inmediatamente después del bloque `CREATE TABLE IF NOT EXISTS citas (...)`
(termina en la línea con `) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;` seguida de la plantilla literal que cierra con
`` ` ``  ` `);`, justo antes del bloque `calendar_blocks`), agregar:

```ts
    await pool.query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS tipoVisita VARCHAR(20) NOT NULL DEFAULT 'CONSULTORIO'`);
    await pool.query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS direccionDomicilio VARCHAR(255) NULL`);
    await pool.query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS pacienteLat DECIMAL(10,7) NULL`);
    await pool.query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS pacienteLng DECIMAL(10,7) NULL`);
    await pool.query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS tiempoTrasladoMinutos INT NULL`);
```

En el bloque `// companias` (después de la línea `await pool.query(\`ALTER
TABLE companias ADD COLUMN IF NOT EXISTS proximoVencimiento DATE NULL\`);`),
agregar:

```ts
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS horarioAtencion JSON NULL`);
```

En el bloque `// usuarios` (después de la línea `await pool.query(\`ALTER
TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT
TRUE\`);`), agregar:

```ts
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ubicacionDireccion VARCHAR(255) NULL`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ubicacionLat DECIMAL(10,7) NULL`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ubicacionLng DECIMAL(10,7) NULL`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS maxTiempoTrasladoMinutos INT NOT NULL DEFAULT 45`);
```

- [ ] **Paso 6: Import y literal `Company`/`User` incompletos**

Ejecutar `npm run lint` tras los pasos anteriores. Como en el trabajo del
panel SaaS, es probable que aparezcan errores de tipo en cualquier literal
`Company`/`User`/`Cita` fuera de `mockData.ts` que ya exista en el código
(por ejemplo, si `CompanySettings.tsx` o `LoginView.tsx` construyen un
`Company`/`User` nuevo en algún flujo). Completar cada uno con valores
sensatos:
- `Company` nuevo: `horarioAtencion: DEFAULT_HORARIO_ATENCION` (importar
  `DEFAULT_HORARIO_ATENCION` desde `../data/mockData` donde haga falta).
- `User` nuevo: `ubicacionDireccion: null, ubicacionLat: null,
  ubicacionLng: null, maxTiempoTrasladoMinutos: 45`.
- `Cita` nuevo (si aplica en `AgendaCalendar.tsx`): `tipoVisita:
  'CONSULTORIO'`.

No asumir de antemano cuáles son — dejar que `tsc` los señale y
completarlos uno por uno hasta que `npm run lint` termine sin errores.

- [ ] **Paso 7: Verificar**

`npm run lint` y `npm run build` limpios. Reiniciar el servidor (pidiendo
permiso si hay un proceso activo en el puerto 3000) y confirmar con `curl
https://localhost:3000/api/companies` (con `-k` por el certificado
autofirmado) que la empresa 7 real trae `horarioAtencion: null` (columna
nueva, sin backfill — se resuelve al default en el Paso de Task 3) y que
`curl https://localhost:3000/api/users` trae `maxTiempoTrasladoMinutos:
45` en los usuarios reales.

- [ ] **Paso 8: Commit**

```bash
git add src/data/mockData.ts ConsultorioDB_schema.sql server.ts
git commit -m "Add booking data model: business hours, professional location, visit type"
```

---

### Task 2: Backend — Google Maps y endpoints públicos

**Files:**
- Create: `server/googleMaps.ts`
- Modify: `server.ts`

**Interfaces:**
- Consumes: `Company.horarioAtencion`, `User.ubicacion*`/
  `maxTiempoTrasladoMinutos`, `Cita.tipoVisita`/etc (de Task 1);
  `CalendarBlock` (ya existente); `Patient` (ya existente).
- Produces: `calcularTiempoTrasladoMinutos(params): Promise<number>`;
  endpoints `GET /api/public/config`, `GET /api/public/clinicas`, `GET
  /api/public/clinicas/:id/profesionales`, `GET
  /api/public/clinicas/:id/pacientes/:identificacion`, `GET
  /api/public/disponibilidad`, `POST /api/public/citas`.

- [ ] **Paso 1: `server/googleMaps.ts`**

```ts
export class TrasladoNoCalculableError extends Error {}

export async function calcularTiempoTrasladoMinutos(params: {
  origenLat: number;
  origenLng: number;
  destinoLat: number;
  destinoLng: number;
}): Promise<number> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY no está configurada.");
  }

  const { origenLat, origenLng, destinoLat, destinoLng } = params;
  const url = new URL("https://maps.googleapis.com/maps/api/distancematrix/json");
  url.searchParams.set("origins", `${origenLat},${origenLng}`);
  url.searchParams.set("destinations", `${destinoLat},${destinoLng}`);
  url.searchParams.set("mode", "driving");
  url.searchParams.set("key", apiKey);

  const response = await fetch(url.toString());
  const data: any = await response.json();

  if (data.status !== "OK") {
    throw new Error(`Google Distance Matrix respondió: ${data.status}`);
  }

  const element = data.rows?.[0]?.elements?.[0];
  if (!element || element.status !== "OK") {
    throw new TrasladoNoCalculableError("No se pudo calcular la ruta a esa dirección.");
  }

  return Math.round(element.duration.value / 60);
}
```

- [ ] **Paso 2: Import en `server.ts`**

Agregar junto a los demás imports de `./server/*`:

```ts
import { calcularTiempoTrasladoMinutos, TrasladoNoCalculableError } from "./server/googleMaps";
```

Agregar `DEFAULT_HORARIO_ATENCION` y `HorarioAtencion` al import de tipos
existente desde `./src/data/mockData` (junto a `Company`, `Patient`, etc.).

- [ ] **Paso 3: Helper de horario del día y de disponibilidad**

En cualquier punto antes de las rutas (junto a `normalizeRow` u otras
funciones de utilidad), agregar:

```ts
const DIAS_SEMANA: Array<keyof HorarioAtencion> = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

function horarioDelDia(horario: HorarioAtencion | null | undefined, fecha: string): { abre: string | null; cierra: string | null } {
  const efectivo = horario || DEFAULT_HORARIO_ATENCION;
  const diaSemana = DIAS_SEMANA[new Date(`${fecha}T00:00:00`).getDay()];
  return efectivo[diaSemana];
}

function generarSlotsCandidatos(abre: string, cierra: string): string[] {
  const slots: string[] = [];
  let [h, m] = abre.split(":").map(Number);
  const [hFin, mFin] = cierra.split(":").map(Number);
  while (h < hFin || (h === hFin && m < mFin)) {
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += 30;
    if (m >= 60) { m -= 60; h += 1; }
  }
  return slots;
}

function minutosDesdeMedianoche(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const DURACION_POR_TIPO_VISITA: Record<"CONSULTORIO" | "DOMICILIO", number> = {
  CONSULTORIO: 45,
  DOMICILIO: 60
};

function slotLibre(params: {
  candidatoInicioMin: number;
  duracionMin: number;
  citasDelDia: Array<{ fechaHora: string; duracionMinutos: number; tipoVisita: string; tiempoTrasladoMinutos: number | null }>;
  bloqueosDelDia: CalendarBlock[];
  fecha: string;
  horaCandidato: string;
}): boolean {
  const { candidatoInicioMin, duracionMin, citasDelDia, bloqueosDelDia, fecha, horaCandidato } = params;
  const candidatoFinMin = candidatoInicioMin + duracionMin;

  for (const b of bloqueosDelDia) {
    if (fecha < b.fechaInicio || fecha > b.fechaFin) continue;
    if (!b.horaInicio || !b.horaFin) return false;
    if (horaCandidato >= b.horaInicio && horaCandidato < b.horaFin) return false;
  }

  for (const c of citasDelDia) {
    const citaFecha = c.fechaHora.split("T")[0];
    if (citaFecha !== fecha) continue;
    const citaHora = c.fechaHora.split("T")[1];
    const citaInicioMin = minutosDesdeMedianoche(citaHora);
    const padding = c.tipoVisita === "DOMICILIO" ? (c.tiempoTrasladoMinutos || 0) : 0;
    const ocupadoInicio = citaInicioMin - padding;
    const ocupadoFin = citaInicioMin + c.duracionMinutos + padding;
    if (candidatoInicioMin < ocupadoFin && candidatoFinMin > ocupadoInicio) return false;
  }

  return true;
}
```

- [ ] **Paso 4: `GET /api/public/config`, `GET /api/public/clinicas`,
  `GET /api/public/clinicas/:id/profesionales`, `GET
  /api/public/clinicas/:id/pacientes/:identificacion`**

Agregar como un bloque nuevo de rutas (después de todas las rutas
`/api/*` existentes, antes del middleware de Vite/estáticos si lo hay, o
simplemente al final de la sección de rutas API):

```ts
  // --- Public Booking Routes (no auth) ---

  app.get("/api/public/config", (req, res) => {
    res.json({ googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "" });
  });

  app.get("/api/public/clinicas", async (req, res) => {
    try {
      let companies: Company[];
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM companias WHERE estadoSaas = 'ACTIVA'");
        companies = (rows as any[]).map(normalizeRow);
      } else {
        companies = localCompanies.filter(c => c.estadoSaas === "ACTIVA");
      }
      res.json(companies.map(c => ({
        id: c.id,
        nombreComercial: c.nombreComercial,
        perfilCompania: c.perfilCompania,
        logoUrl: c.logoUrl,
        colorPrimario: c.colorPrimario,
        colorSidebar: c.colorSidebar
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/public/clinicas/:id/profesionales", async (req, res) => {
    try {
      const idCompania = parseInt(req.params.id);
      let users: any[];
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM usuarios WHERE (idCompania = ? OR id_compania = ?) AND activo = 1", [idCompania, idCompania]);
        users = (rows as any[]).map(normalizeRow);
      } else {
        users = localUsers.filter(u => u.idCompania === idCompania && u.activo);
      }
      res.json(users.map(u => ({
        id: u.id,
        nombre: u.nombre,
        rol: u.rol,
        aceptaDomicilio: u.ubicacionLat != null && u.ubicacionLng != null
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/public/clinicas/:id/pacientes/:identificacion", async (req, res) => {
    try {
      const idCompania = parseInt(req.params.id);
      const identificacion = req.params.identificacion;
      let patient: Patient | undefined;
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM pacientes WHERE (idCompania = ? OR id_compania = ?) AND (identificacion = ? OR fact_identificacion = ?)", [idCompania, idCompania, identificacion, identificacion]);
        patient = (rows as any[]).map(normalizeRow)[0];
      } else {
        patient = localPatients.find(p => p.idCompania === idCompania && p.identificacion === identificacion);
      }
      if (!patient) return res.status(404).json({ error: "Paciente no encontrado." });
      res.json({
        nombreCompleto: patient.nombreCompleto,
        telefono: patient.telefono,
        correoElectronico: patient.correoElectronico,
        tipoIdentificacion: patient.tipoIdentificacion,
        fechaNacimiento: patient.fechaNacimiento
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Paso 5: `GET /api/public/disponibilidad`**

Inmediatamente después del bloque anterior:

```ts
  app.get("/api/public/disponibilidad", async (req, res) => {
    try {
      const idUsuario = parseInt(req.query.idUsuario as string);
      const fecha = req.query.fecha as string;
      const tipoVisita = (req.query.tipoVisita as string) === "DOMICILIO" ? "DOMICILIO" : "CONSULTORIO";

      let user: any;
      let company: Company | undefined;
      let citasDelDia: any[];
      let bloqueosDelDia: CalendarBlock[];

      if (dbConnected && pool) {
        const [userRows] = await pool.query("SELECT * FROM usuarios WHERE id = ? OR id_usuario = ?", [idUsuario, idUsuario]);
        user = (userRows as any[]).map(normalizeRow)[0];
        if (!user) return res.status(404).json({ error: "Profesional no encontrado." });

        const [companyRows] = await pool.query("SELECT * FROM companias WHERE id = ? OR id_compania = ?", [user.idCompania, user.idCompania]);
        company = (companyRows as any[]).map(normalizeRow)[0];

        const [citaRows] = await pool.query("SELECT * FROM citas WHERE idUsuarioNutricionista = ? AND fechaHora LIKE ?", [idUsuario, `${fecha}%`]);
        citasDelDia = citaRows as any[];

        const [blockRows] = await pool.query("SELECT * FROM calendar_blocks WHERE idUsuarioNutricionista = ?", [idUsuario]);
        bloqueosDelDia = blockRows as any[];
      } else {
        user = localUsers.find(u => u.id === idUsuario);
        if (!user) return res.status(404).json({ error: "Profesional no encontrado." });
        company = localCompanies.find(c => c.id === user.idCompania);
        citasDelDia = localCitas.filter(c => c.idUsuarioNutricionista === idUsuario && c.fechaHora.startsWith(fecha));
        bloqueosDelDia = localCalendarBlocks.filter(b => b.idUsuarioNutricionista === idUsuario);
      }

      const { abre, cierra } = horarioDelDia(company?.horarioAtencion, fecha);
      if (!abre || !cierra) return res.json([]);

      const duracionMin = DURACION_POR_TIPO_VISITA[tipoVisita];
      const candidatos = generarSlotsCandidatos(abre, cierra);
      const libres = candidatos.filter(hora => slotLibre({
        candidatoInicioMin: minutosDesdeMedianoche(hora),
        duracionMin,
        citasDelDia,
        bloqueosDelDia,
        fecha,
        horaCandidato: hora
      }));

      res.json(libres);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Paso 6: `POST /api/public/citas`**

Inmediatamente después:

```ts
  app.post("/api/public/citas", async (req, res) => {
    try {
      const body = req.body;
      const idCompania = parseInt(body.idCompania);
      const idUsuarioNutricionista = parseInt(body.idUsuarioNutricionista);
      const tipoVisita: "CONSULTORIO" | "DOMICILIO" = body.tipoVisita === "DOMICILIO" ? "DOMICILIO" : "CONSULTORIO";
      const fechaHora = body.fechaHora as string;
      const fecha = fechaHora.split("T")[0];
      const hora = fechaHora.split("T")[1];
      const duracionMinutos = DURACION_POR_TIPO_VISITA[tipoVisita];

      let user: any;
      if (dbConnected && pool) {
        const [userRows] = await pool.query("SELECT * FROM usuarios WHERE id = ? OR id_usuario = ?", [idUsuarioNutricionista, idUsuarioNutricionista]);
        user = (userRows as any[]).map(normalizeRow)[0];
      } else {
        user = localUsers.find(u => u.id === idUsuarioNutricionista);
      }
      if (!user) return res.status(404).json({ error: "Profesional no encontrado." });

      let tiempoTrasladoMinutos: number | null = null;
      if (tipoVisita === "DOMICILIO") {
        if (user.ubicacionLat == null || user.ubicacionLng == null) {
          return res.status(400).json({ error: "Este profesional no tiene ubicación configurada para visitas a domicilio." });
        }
        const pacienteLat = parseFloat(body.pacienteLat);
        const pacienteLng = parseFloat(body.pacienteLng);
        try {
          // mysql2 devuelve columnas DECIMAL como strings, no numbers — forzar
          // parseFloat aquí (mismo patrón ya usado en este archivo para
          // ivaPorDefecto) para no interpolar un string sin validar en la URL.
          tiempoTrasladoMinutos = await calcularTiempoTrasladoMinutos({
            origenLat: parseFloat(user.ubicacionLat),
            origenLng: parseFloat(user.ubicacionLng),
            destinoLat: pacienteLat,
            destinoLng: pacienteLng
          });
        } catch (err: any) {
          if (err instanceof TrasladoNoCalculableError) {
            return res.status(400).json({ error: err.message });
          }
          throw err;
        }
        if (tiempoTrasladoMinutos > user.maxTiempoTrasladoMinutos) {
          return res.status(400).json({
            error: `El tiempo de traslado estimado (${tiempoTrasladoMinutos} min) supera el máximo que este profesional acepta (${user.maxTiempoTrasladoMinutos} min).`
          });
        }
      }

      // Re-verificar disponibilidad (condición de carrera)
      let citasDelDia: any[];
      let bloqueosDelDia: CalendarBlock[];
      let company: Company | undefined;
      if (dbConnected && pool) {
        const [citaRows] = await pool.query("SELECT * FROM citas WHERE idUsuarioNutricionista = ? AND fechaHora LIKE ?", [idUsuarioNutricionista, `${fecha}%`]);
        citasDelDia = citaRows as any[];
        const [blockRows] = await pool.query("SELECT * FROM calendar_blocks WHERE idUsuarioNutricionista = ?", [idUsuarioNutricionista]);
        bloqueosDelDia = blockRows as any[];
        const [companyRows] = await pool.query("SELECT * FROM companias WHERE id = ? OR id_compania = ?", [idCompania, idCompania]);
        company = (companyRows as any[]).map(normalizeRow)[0];
      } else {
        citasDelDia = localCitas.filter(c => c.idUsuarioNutricionista === idUsuarioNutricionista && c.fechaHora.startsWith(fecha));
        bloqueosDelDia = localCalendarBlocks.filter(b => b.idUsuarioNutricionista === idUsuarioNutricionista);
        company = localCompanies.find(c => c.id === idCompania);
      }
      const libre = slotLibre({
        candidatoInicioMin: minutosDesdeMedianoche(hora),
        duracionMin: duracionMinutos,
        citasDelDia,
        bloqueosDelDia,
        fecha,
        horaCandidato: hora
      });
      if (!libre) {
        return res.status(409).json({ error: "Ese horario ya no está disponible. Por favor escoja otro." });
      }

      // Buscar o crear paciente por cédula
      const pac = body.paciente;
      let paciente: Patient | undefined;
      if (dbConnected && pool) {
        const [existing] = await pool.query("SELECT * FROM pacientes WHERE (idCompania = ? OR id_compania = ?) AND (identificacion = ? OR fact_identificacion = ?)", [idCompania, idCompania, pac.identificacion, pac.identificacion]);
        paciente = (existing as any[]).map(normalizeRow)[0];
      } else {
        paciente = localPatients.find(p => p.idCompania === idCompania && p.identificacion === pac.identificacion);
      }

      if (!paciente) {
        const nuevoPaciente: any = {
          idCompania,
          nombreCompleto: pac.nombreCompleto,
          fechaNacimiento: pac.fechaNacimiento,
          edad: (() => {
            const nacimiento = new Date(pac.fechaNacimiento);
            const hoy = new Date();
            let edad = hoy.getFullYear() - nacimiento.getFullYear();
            const m = hoy.getMonth() - nacimiento.getMonth();
            if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
            return isNaN(edad) ? 0 : edad;
          })(),
          ocupacion: "",
          correoElectronico: pac.correoElectronico,
          situacionVivienda: "SOLO",
          tipoIdentificacion: pac.tipoIdentificacion,
          identificacion: pac.identificacion,
          telefono: pac.telefono,
          provinciaId: 1,
          cantonId: 101,
          distritoId: 10101,
          otrasSenas: tipoVisita === "DOMICILIO" ? (body.direccionDomicilio || "") : "",
          diabetes: false,
          hipertension: false,
          gastritis: false,
          estrenimiento: false,
          alergiasAlimentarias: "",
          fracturas: "",
          esguinces: "",
          cirugiasOrtopedicas: "",
          actividadFisica: ""
        };

        if (dbConnected && pool) {
          const [result] = await pool.query(
            "INSERT INTO pacientes (idCompania, id_compania, nombreCompleto, nombre_completo, fechaNacimiento, fecha_nacimiento, edad, ocupacion, correoElectronico, correo_electronico, situacionVivienda, situacion_vivienda, tipoIdentificacion, fact_tipo_identificacion, identificacion, fact_identificacion, telefono, provinciaId, cantonId, distritoId, otrasSenas, diabetes, hipertension, gastritis, estrenimiento, alergiasAlimentarias, fracturas, esguinces, cirugiasOrtopedicas, actividadFisica) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
              nuevoPaciente.idCompania, nuevoPaciente.idCompania, nuevoPaciente.nombreCompleto, nuevoPaciente.nombreCompleto, nuevoPaciente.fechaNacimiento, nuevoPaciente.fechaNacimiento, nuevoPaciente.edad, nuevoPaciente.ocupacion, nuevoPaciente.correoElectronico, nuevoPaciente.correoElectronico, nuevoPaciente.situacionVivienda, nuevoPaciente.situacionVivienda, nuevoPaciente.tipoIdentificacion, nuevoPaciente.tipoIdentificacion, nuevoPaciente.identificacion, nuevoPaciente.identificacion, nuevoPaciente.telefono, nuevoPaciente.provinciaId, nuevoPaciente.cantonId, nuevoPaciente.distritoId, nuevoPaciente.otrasSenas, 0, 0, 0, 0, nuevoPaciente.alergiasAlimentarias, nuevoPaciente.fracturas, nuevoPaciente.esguinces, nuevoPaciente.cirugiasOrtopedicas, nuevoPaciente.actividadFisica
            ]
          );
          nuevoPaciente.id = (result as any).insertId;
        } else {
          nuevoPaciente.id = Math.max(0, ...localPatients.map(p => p.id)) + 1;
          localPatients.push(nuevoPaciente);
        }
        paciente = nuevoPaciente;
      }

      const nuevaCita: any = {
        idCompania,
        idPaciente: paciente!.id,
        idUsuarioNutricionista,
        idConsulta: null,
        fechaHora,
        duracionMinutos,
        estadoCita: "PROGRAMADA",
        notas: "",
        tipoVisita,
        direccionDomicilio: tipoVisita === "DOMICILIO" ? body.direccionDomicilio : null,
        pacienteLat: tipoVisita === "DOMICILIO" ? parseFloat(body.pacienteLat) : null,
        pacienteLng: tipoVisita === "DOMICILIO" ? parseFloat(body.pacienteLng) : null,
        tiempoTrasladoMinutos
      };

      if (dbConnected && pool) {
        const [result] = await pool.query(
          "INSERT INTO citas (idCompania, idPaciente, idUsuarioNutricionista, idConsulta, fechaHora, duracionMinutos, estadoCita, notas, tipoVisita, direccionDomicilio, pacienteLat, pacienteLng, tiempoTrasladoMinutos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [nuevaCita.idCompania, nuevaCita.idPaciente, nuevaCita.idUsuarioNutricionista, nuevaCita.idConsulta, nuevaCita.fechaHora, nuevaCita.duracionMinutos, nuevaCita.estadoCita, nuevaCita.notas, nuevaCita.tipoVisita, nuevaCita.direccionDomicilio, nuevaCita.pacienteLat, nuevaCita.pacienteLng, nuevaCita.tiempoTrasladoMinutos]
        );
        nuevaCita.id = (result as any).insertId;
      } else {
        nuevaCita.id = Math.max(0, ...localCitas.map(c => c.id)) + 1;
        localCitas.push(nuevaCita);
      }

      res.json(nuevaCita);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Paso 7: Extender `POST /api/companies` y `POST /api/users` con
  los campos nuevos**

En `POST /api/companies`, agregar `horarioAtencion = ?` al UPDATE y al
INSERT (serializado con `JSON.stringify(c.horarioAtencion || null)`), y
en el SELECT/normalización de lectura, parsear con `JSON.parse` si viene
como string (mismo patrón ya usado para los campos JSON de `consultas` en
`fetchConsultationById`).

En `POST /api/users`, agregar `ubicacionDireccion = ?, ubicacionLat = ?,
ubicacionLng = ?, maxTiempoTrasladoMinutos = ?` al UPDATE y al INSERT,
usando `u.ubicacionDireccion || null`, `u.ubicacionLat != null ?
parseFloat(u.ubicacionLat) : null` (mismo para lng), `u.
maxTiempoTrasladoMinutos || 45`.

- [ ] **Paso 8: Verificar**

`npm run lint` y `npm run build` limpios. Con permiso para reiniciar el
servidor, crear una empresa + usuario + probar el flujo completo con
`curl` usando datos de prueba desechables (mismo patrón del panel SaaS:
crear, ejercitar, borrar en cascada):
1. `GET /api/public/config` devuelve la API key.
2. `GET /api/public/clinicas` incluye solo empresas `ACTIVA` (confirmar
   que la empresa 7 real aparece).
3. Configurar `ubicacionLat`/`ubicacionLng`/`maxTiempoTrasladoMinutos` en
   un usuario de prueba vía `POST /api/users`, y `horarioAtencion` en una
   empresa de prueba vía `POST /api/companies`.
4. `GET /api/public/disponibilidad` para ese usuario/fecha devuelve una
   lista de horas dentro del horario configurado.
5. `POST /api/public/citas` con `tipoVisita: 'DOMICILIO'` y una
   `pacienteLat`/`pacienteLng` muy lejana (ej. otro continente) — debe
   responder 400 por tiempo de traslado excedido.
6. `POST /api/public/citas` con una ubicación cercana real — debe crear
   la cita, y una segunda llamada al mismo horario debe fallar con 409.
7. Limpiar todos los datos de prueba (empresa/usuario/paciente/cita)
   antes de terminar.

- [ ] **Paso 9: Commit**

```bash
git add server/googleMaps.ts server.ts
git commit -m "Add Google Maps travel-time validation and public booking endpoints"
```

---

### Task 3: Ruteo público y página `PublicBooking.tsx`

**Files:**
- Create: `src/utils/loadGoogleMaps.ts`
- Create: `src/components/PublicBooking.tsx`
- Modify: `src/main.tsx`

**Interfaces:**
- Consumes: endpoints de la Tarea 2 (`/api/public/*`).
- Produces: `loadGoogleMapsScript(apiKey: string): Promise<void>`;
  componente `PublicBooking`; ruteo simple en `main.tsx`.

- [ ] **Paso 1: `src/utils/loadGoogleMaps.ts`**

```ts
let loadPromise: Promise<void> | null = null;

export function loadGoogleMapsScript(apiKey: string): Promise<void> {
  if ((window as any).google?.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('No se pudo cargar Google Maps.'));
    document.head.appendChild(script);
  });

  return loadPromise;
}
```

- [ ] **Paso 2: Ruteo simple en `src/main.tsx`**

Reemplazar el contenido completo de `src/main.tsx`:

```tsx
import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import PublicBooking from './components/PublicBooking.tsx';
import './index.css';

const isPublicBooking = window.location.pathname.startsWith('/agendar');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPublicBooking ? <PublicBooking /> : <App />}
  </StrictMode>,
);
```

- [ ] **Paso 3: `src/components/PublicBooking.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Building, User as UserIcon, Calendar, MapPin, Check, ArrowLeft, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { loadGoogleMapsScript } from '../utils/loadGoogleMaps';

interface ClinicaPublica {
  id: number;
  nombreComercial: string;
  perfilCompania: string;
  logoUrl: string;
  colorPrimario: string;
  colorSidebar: string;
}

interface ProfesionalPublico {
  id: number;
  nombre: string;
  rol: string;
  aceptaDomicilio: boolean;
}

type Paso = 1 | 2 | 3 | 4 | 5 | 6;

export default function PublicBooking() {
  const [paso, setPaso] = useState<Paso>(1);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [clinicas, setClinicas] = useState<ClinicaPublica[]>([]);
  const [clinicaId, setClinicaId] = useState<number | null>(null);

  const [profesionales, setProfesionales] = useState<ProfesionalPublico[]>([]);
  const [profesionalId, setProfesionalId] = useState<number | null>(null);

  const [tipoVisita, setTipoVisita] = useState<'CONSULTORIO' | 'DOMICILIO'>('CONSULTORIO');
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [horariosDisponibles, setHorariosDisponibles] = useState<string[]>([]);
  const [horaSeleccionada, setHoraSeleccionada] = useState('');
  const [cargandoHorarios, setCargandoHorarios] = useState(false);

  const [direccionDomicilio, setDireccionDomicilio] = useState('');
  const [pacienteLat, setPacienteLat] = useState<number | null>(null);
  const [pacienteLng, setPacienteLng] = useState<number | null>(null);
  const [mapsListo, setMapsListo] = useState(false);

  const [cedula, setCedula] = useState('');
  const [tipoIdentificacion, setTipoIdentificacion] = useState<'01' | '02' | '03' | '04' | 'EXT'>('01');
  const [nombreCompleto, setNombreCompleto] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('1995-01-01');
  const [telefono, setTelefono] = useState('');
  const [correoElectronico, setCorreoElectronico] = useState('');
  const [pacienteEncontrado, setPacienteEncontrado] = useState(false);

  const [citaCreada, setCitaCreada] = useState<any>(null);

  const clinica = clinicas.find(c => c.id === clinicaId);
  const profesional = profesionales.find(p => p.id === profesionalId);

  useEffect(() => {
    fetch('/api/public/clinicas')
      .then(res => res.json())
      .then(setClinicas)
      .catch(() => setError('No se pudieron cargar las clínicas.'));
  }, []);

  useEffect(() => {
    if (!clinicaId) return;
    fetch(`/api/public/clinicas/${clinicaId}/profesionales`)
      .then(res => res.json())
      .then(setProfesionales)
      .catch(() => setError('No se pudieron cargar los profesionales.'));
  }, [clinicaId]);

  useEffect(() => {
    if (paso !== 4 || tipoVisita !== 'DOMICILIO') return;
    fetch('/api/public/config')
      .then(res => res.json())
      .then(data => loadGoogleMapsScript(data.googleMapsApiKey))
      .then(() => setMapsListo(true))
      .catch(() => setError('No se pudo cargar Google Maps.'));
  }, [paso, tipoVisita]);

  useEffect(() => {
    if (!mapsListo || tipoVisita !== 'DOMICILIO') return;
    const input = document.getElementById('direccion-domicilio-input') as HTMLInputElement | null;
    if (!input) return;
    const autocomplete = new (window as any).google.maps.places.Autocomplete(input, { fields: ['formatted_address', 'geometry'] });
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry?.location) {
        setDireccionDomicilio(place.formatted_address || input.value);
        setPacienteLat(place.geometry.location.lat());
        setPacienteLng(place.geometry.location.lng());
      }
    });
  }, [mapsListo, tipoVisita]);

  const usarUbicacionActual = () => {
    if (!navigator.geolocation) {
      setError('Tu navegador no soporta geolocalización.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setPacienteLat(pos.coords.latitude);
        setPacienteLng(pos.coords.longitude);
        setDireccionDomicilio(prev => prev || 'Ubicación actual del dispositivo');
      },
      () => setError('No se pudo obtener tu ubicación. Escribe tu dirección manualmente.')
    );
  };

  const cargarHorarios = () => {
    if (!profesionalId) return;
    setCargandoHorarios(true);
    setHoraSeleccionada('');
    fetch(`/api/public/disponibilidad?idUsuario=${profesionalId}&fecha=${fecha}&tipoVisita=${tipoVisita}`)
      .then(res => res.json())
      .then(data => setHorariosDisponibles(data))
      .catch(() => setError('No se pudieron cargar los horarios disponibles.'))
      .finally(() => setCargandoHorarios(false));
  };

  useEffect(() => {
    if (paso === 3 && profesionalId) cargarHorarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paso, profesionalId, fecha, tipoVisita]);

  const buscarPacientePorCedula = () => {
    if (!cedula.trim() || !clinicaId) return;
    fetch(`/api/public/clinicas/${clinicaId}/pacientes/${encodeURIComponent(cedula.trim())}`)
      .then(res => {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then(data => {
        setNombreCompleto(data.nombreCompleto);
        setTelefono(data.telefono);
        setCorreoElectronico(data.correoElectronico);
        setTipoIdentificacion(data.tipoIdentificacion);
        setFechaNacimiento(data.fechaNacimiento);
        setPacienteEncontrado(true);
      })
      .catch(() => setPacienteEncontrado(false));
  };

  const confirmarCita = () => {
    setError('');
    if (!nombreCompleto.trim() || !telefono.trim() || !correoElectronico.trim() || !cedula.trim()) {
      setError('Por favor complete todos los campos.');
      return;
    }
    if (tipoVisita === 'DOMICILIO' && (pacienteLat == null || pacienteLng == null)) {
      setError('Por favor indique su dirección o use su ubicación actual.');
      return;
    }
    setSubmitting(true);
    fetch('/api/public/citas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idCompania: clinicaId,
        idUsuarioNutricionista: profesionalId,
        fechaHora: `${fecha}T${horaSeleccionada}`,
        tipoVisita,
        direccionDomicilio: tipoVisita === 'DOMICILIO' ? direccionDomicilio : undefined,
        pacienteLat: tipoVisita === 'DOMICILIO' ? pacienteLat : undefined,
        pacienteLng: tipoVisita === 'DOMICILIO' ? pacienteLng : undefined,
        paciente: { identificacion: cedula, tipoIdentificacion, nombreCompleto, telefono, correoElectronico, fechaNacimiento }
      })
    })
      .then(async res => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo agendar la cita.');
        setCitaCreada(data);
        setPaso(6);
      })
      .catch(err => setError(err.message))
      .finally(() => setSubmitting(false));
  };

  const colorPrimario = clinica?.colorPrimario || '#0d9488';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-xl bg-white rounded-3xl border border-slate-200 shadow-xl p-6 sm:p-8">
        <div className="text-center mb-6">
          <h1 className="text-xl font-extrabold text-slate-900">Agendar Cita</h1>
          <p className="text-xs text-slate-500 mt-1">TuanisBooking &middot; Reserva en línea</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {paso === 1 && (
          <div className="space-y-3">
            <h2 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><Building className="w-4 h-4" /> Escoja su clínica</h2>
            {clinicas.map(c => (
              <button
                key={c.id}
                onClick={() => { setClinicaId(c.id); setPaso(2); }}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200 hover:border-slate-400 transition-all text-left"
              >
                <img src={c.logoUrl} alt={c.nombreComercial} className="w-10 h-10 rounded-lg object-cover border border-slate-200" referrerPolicy="no-referrer" />
                <div>
                  <span className="font-bold text-sm text-slate-800 block">{c.nombreComercial}</span>
                  <span className="text-[10px] text-slate-500">{c.perfilCompania}</span>
                </div>
              </button>
            ))}
            {clinicas.length === 0 && <p className="text-slate-500 text-xs text-center py-4">Cargando clínicas...</p>}
          </div>
        )}

        {paso === 2 && (
          <div className="space-y-3">
            <button onClick={() => setPaso(1)} className="text-xs text-slate-500 flex items-center gap-1 mb-2"><ArrowLeft className="w-3.5 h-3.5" /> Cambiar clínica</button>
            <h2 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><UserIcon className="w-4 h-4" /> Escoja su profesional</h2>
            {profesionales.map(p => (
              <button
                key={p.id}
                onClick={() => { setProfesionalId(p.id); setPaso(3); }}
                className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 hover:border-slate-400 transition-all text-left"
              >
                <div>
                  <span className="font-bold text-sm text-slate-800 block">{p.nombre}</span>
                  <span className="text-[10px] text-slate-500">{p.rol}</span>
                </div>
                {p.aceptaDomicilio && <span className="text-[9px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">Acepta domicilio</span>}
              </button>
            ))}
            {profesionales.length === 0 && <p className="text-slate-500 text-xs text-center py-4">Este centro no tiene profesionales disponibles.</p>}
          </div>
        )}

        {paso === 3 && (
          <div className="space-y-4">
            <button onClick={() => setPaso(2)} className="text-xs text-slate-500 flex items-center gap-1 mb-2"><ArrowLeft className="w-3.5 h-3.5" /> Cambiar profesional</button>
            <h2 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><Calendar className="w-4 h-4" /> Tipo de visita y horario</h2>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setTipoVisita('CONSULTORIO')}
                className={`p-3 rounded-xl border-2 text-xs font-bold ${tipoVisita === 'CONSULTORIO' ? 'border-slate-800 bg-slate-50' : 'border-slate-200'}`}
              >
                En Consultorio
              </button>
              <button
                onClick={() => setTipoVisita('DOMICILIO')}
                disabled={!profesional?.aceptaDomicilio}
                className={`p-3 rounded-xl border-2 text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed ${tipoVisita === 'DOMICILIO' ? 'border-slate-800 bg-slate-50' : 'border-slate-200'}`}
              >
                A Domicilio
              </button>
            </div>

            <div>
              <label className="block text-slate-600 text-xs font-medium mb-1">Fecha</label>
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
              />
            </div>

            <div>
              <label className="block text-slate-600 text-xs font-medium mb-1">Horarios disponibles</label>
              {cargandoHorarios ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-3"><Loader2 className="w-4 h-4 animate-spin" /> Buscando horarios...</div>
              ) : (
                <div className="grid grid-cols-4 gap-1.5">
                  {horariosDisponibles.map(h => (
                    <button
                      key={h}
                      onClick={() => setHoraSeleccionada(h)}
                      className={`py-1.5 rounded-lg text-xs font-semibold ${horaSeleccionada === h ? 'text-white' : 'bg-slate-100 text-slate-700'}`}
                      style={horaSeleccionada === h ? { backgroundColor: colorPrimario } : {}}
                    >
                      {h}
                    </button>
                  ))}
                  {horariosDisponibles.length === 0 && <p className="col-span-4 text-slate-500 text-xs text-center py-2">No hay horarios libres ese día.</p>}
                </div>
              )}
            </div>

            <button
              disabled={!horaSeleccionada}
              onClick={() => setPaso(tipoVisita === 'DOMICILIO' ? 4 : 5)}
              className="w-full text-white font-bold text-xs py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              style={{ backgroundColor: colorPrimario }}
            >
              Continuar <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {paso === 4 && (
          <div className="space-y-4">
            <button onClick={() => setPaso(3)} className="text-xs text-slate-500 flex items-center gap-1 mb-2"><ArrowLeft className="w-3.5 h-3.5" /> Cambiar horario</button>
            <h2 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-1.5"><MapPin className="w-4 h-4" /> Su dirección</h2>
            <input
              id="direccion-domicilio-input"
              type="text"
              value={direccionDomicilio}
              onChange={(e) => setDireccionDomicilio(e.target.value)}
              placeholder="Escriba su dirección exacta"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
            />
            <button onClick={usarUbicacionActual} className="text-xs text-slate-600 flex items-center gap-1.5 underline">
              <MapPin className="w-3.5 h-3.5" /> Usar mi ubicación actual
            </button>
            <p className="text-[10px] text-slate-500">El tiempo de traslado se validará al confirmar la cita en el siguiente paso.</p>
            <button
              disabled={!direccionDomicilio.trim() && (pacienteLat == null)}
              onClick={() => setPaso(5)}
              className="w-full text-white font-bold text-xs py-3 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
              style={{ backgroundColor: colorPrimario }}
            >
              Continuar <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {paso === 5 && (
          <div className="space-y-3">
            <button onClick={() => setPaso(tipoVisita === 'DOMICILIO' ? 4 : 3)} className="text-xs text-slate-500 flex items-center gap-1 mb-2"><ArrowLeft className="w-3.5 h-3.5" /> Volver</button>
            <h2 className="text-xs font-bold text-slate-500 uppercase">Sus datos</h2>
            <div>
              <label className="block text-slate-600 text-xs font-medium mb-1">Cédula</label>
              <input
                type="text"
                value={cedula}
                onChange={(e) => setCedula(e.target.value)}
                onBlur={buscarPacientePorCedula}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs"
              />
              {pacienteEncontrado && <p className="text-[10px] text-emerald-600 mt-1">¡Bienvenido(a) de nuevo! Verifique sus datos.</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input type="text" placeholder="Nombre completo" value={nombreCompleto} onChange={(e) => setNombreCompleto(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" />
              <input type="date" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" />
              <input type="text" placeholder="Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" />
              <input type="email" placeholder="Correo" value={correoElectronico} onChange={(e) => setCorreoElectronico(e.target.value)} className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs" />
            </div>
            <button
              disabled={submitting}
              onClick={confirmarCita}
              className="w-full text-white font-bold text-xs py-3 rounded-xl disabled:opacity-60 flex items-center justify-center gap-1.5"
              style={{ backgroundColor: colorPrimario }}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Confirmar Cita
            </button>
          </div>
        )}

        {paso === 6 && citaCreada && (
          <div className="text-center py-6 space-y-3">
            <div className="inline-flex p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600">
              <Check className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">¡Cita confirmada!</h2>
            <p className="text-xs text-slate-500">
              {fecha} a las {horaSeleccionada} con {profesional?.nombre} en {clinica?.nombreComercial}.
              {tipoVisita === 'DOMICILIO' && citaCreada.tiempoTrasladoMinutos != null && (
                <> Tiempo de traslado estimado: {citaCreada.tiempoTrasladoMinutos} min.</>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Paso 4: Verificar**

`npm run lint` y `npm run build` limpios. `npm run build` debe generar
`dist/index.html` capaz de servir tanto `/` como `/agendar` con el mismo
archivo (SPA) — confirmar que el servidor Express sirve `index.html` para
cualquier ruta no-API (ya debería ser así dado que Vite/Express sirve
estáticos con fallback; si no, agregar un catch-all `app.get('*', ...)`
que sirva `index.html` para rutas que no empiecen con `/api`). Verificar
con `curl -sk https://localhost:3000/agendar` que devuelve el HTML de la
SPA (no un 404). Confirmar por inspección del bundle que
`PublicBooking`/`loadGoogleMapsScript` están incluidos. Documentar como
limitación que la interacción real (clics, autocompletado de Google
Places) no se pudo probar visualmente sin navegador disponible en este
entorno.

- [ ] **Paso 5: Commit**

```bash
git add src/utils/loadGoogleMaps.ts src/components/PublicBooking.tsx src/main.tsx
git commit -m "Add public booking page at /agendar with simple pathname-based routing"
```

---

### Task 4: "Mi Perfil" — autoservicio de ubicación del profesional

**Files:**
- Create: `src/components/MyProfile.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `User` (de Task 1), `handleSaveUser` (ya existente de la
  Tarea 4 del panel SaaS).
- Produces: componente `MyProfile`, pestaña `'mi-perfil'` en `App.tsx`.

- [ ] **Paso 1: `src/components/MyProfile.tsx`**

```tsx
import React, { useState, useEffect } from 'react';
import { User } from '../data/mockData';
import { MapPin, Clock, Save } from 'lucide-react';
import { loadGoogleMapsScript } from '../utils/loadGoogleMaps';

interface MyProfileProps {
  currentUser: User;
  onSaveUser: (user: User) => void;
}

export default function MyProfile({ currentUser, onSaveUser }: MyProfileProps) {
  const [ubicacionDireccion, setUbicacionDireccion] = useState(currentUser.ubicacionDireccion || '');
  const [ubicacionLat, setUbicacionLat] = useState<number | null>(currentUser.ubicacionLat);
  const [ubicacionLng, setUbicacionLng] = useState<number | null>(currentUser.ubicacionLng);
  const [maxTiempoTrasladoMinutos, setMaxTiempoTrasladoMinutos] = useState(currentUser.maxTiempoTrasladoMinutos);
  const [mapsListo, setMapsListo] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    fetch('/api/public/config')
      .then(res => res.json())
      .then(data => loadGoogleMapsScript(data.googleMapsApiKey))
      .then(() => setMapsListo(true))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!mapsListo) return;
    const input = document.getElementById('mi-perfil-direccion-input') as HTMLInputElement | null;
    if (!input) return;
    const autocomplete = new (window as any).google.maps.places.Autocomplete(input, { fields: ['formatted_address', 'geometry'] });
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      if (place.geometry?.location) {
        setUbicacionDireccion(place.formatted_address || input.value);
        setUbicacionLat(place.geometry.location.lat());
        setUbicacionLng(place.geometry.location.lng());
      }
    });
  }, [mapsListo]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveUser({ ...currentUser, ubicacionDireccion, ubicacionLat, ubicacionLng, maxTiempoTrasladoMinutos });
    setGuardado(true);
    setTimeout(() => setGuardado(false), 2500);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 text-xs max-w-lg">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
        <MapPin className="w-5 h-5 text-slate-500" />
        <div>
          <h3 className="text-sm font-bold text-slate-800">Mi Perfil — Visitas a Domicilio</h3>
          <p className="text-[11px] text-slate-500">Configura tu ubicación principal para que los pacientes puedan agendar visitas a domicilio contigo</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-3">
        <div>
          <label className="block text-slate-600 font-medium mb-1">Dirección Principal</label>
          <input
            id="mi-perfil-direccion-input"
            type="text"
            value={ubicacionDireccion}
            onChange={(e) => setUbicacionDireccion(e.target.value)}
            placeholder="Escriba su dirección exacta"
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
          />
        </div>
        <div>
          <label className="block text-slate-600 font-medium mb-1 flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> Tiempo máximo de traslado aceptado (minutos)</label>
          <input
            type="number"
            min={0}
            value={maxTiempoTrasladoMinutos}
            onChange={(e) => setMaxTiempoTrasladoMinutos(parseInt(e.target.value) || 0)}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
          />
        </div>
        <button type="submit" className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg font-semibold">
          <Save className="w-3.5 h-3.5" />
          {guardado ? 'Guardado ✓' : 'Guardar'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Paso 2: Wiring en `src/App.tsx`**

Extender el tipo de `activeTab` para incluir `'mi-perfil'`:

```ts
  const [activeTab, setActiveTab] = useState<'dashboard' | 'patients' | 'consultations' | 'agenda' | 'branding' | 'saas-admin' | 'mi-perfil'>('dashboard');
```

Agregar el import:

```ts
import MyProfile from './components/MyProfile';
```

Agregar el ícono `MapPin` al import de `lucide-react` existente.

En el drawer móvil, agregar el botón justo después de "Personalizar
Clínica" (visible para cualquier usuario, sin gate de empresa):

```tsx
            <button
              onClick={() => { setActiveTab('mi-perfil'); setIsMobileMenuOpen(false); }}
              className={`flex items-center justify-between py-2.5 px-3.5 rounded-xl text-xs font-semibold transition-all sm:col-span-2 ${
                activeTab === 'mi-perfil'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span>Mi Perfil</span>
              </div>
            </button>
```

En el sidebar de escritorio, el mismo botón (variante de estilo `w-full
... hover:bg-slate-50`, igual que el resto de botones de esa columna):

```tsx
              <button
                onClick={() => setActiveTab('mi-perfil')}
                className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'mi-perfil'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  <span>Mi Perfil</span>
                </div>
              </button>
```

Y el render, junto a los demás bloques `{activeTab === '...' && (...)}`:

```tsx
            {activeTab === 'mi-perfil' && currentUser && (
              <MyProfile currentUser={currentUser} onSaveUser={handleSaveUser} />
            )}
```

- [ ] **Paso 3: Verificar**

`npm run lint` y `npm run build` limpios. Con permiso para reiniciar el
servidor, verificar con `curl` que `POST /api/users` persiste
`ubicacionDireccion`/`ubicacionLat`/`ubicacionLng`/
`maxTiempoTrasladoMinutos` correctamente (reusa la extensión ya hecha en
la Tarea 2, Paso 7) usando un usuario de prueba desechable. Confirmar por
inspección del bundle que "Mi Perfil" y "Visitas a Domicilio" aparecen.

- [ ] **Paso 4: Commit**

```bash
git add src/components/MyProfile.tsx src/App.tsx
git commit -m "Add self-service professional location profile (Mi Perfil tab)"
```

---

### Task 5: "Horario de Atención" en `CompanySettings.tsx`

**Files:**
- Modify: `src/components/CompanySettings.tsx`

**Interfaces:**
- Consumes: `Company.horarioAtencion`, `HorarioAtencion`,
  `DEFAULT_HORARIO_ATENCION` (de Task 1); `onUpdateCompany` (ya
  existente).

- [ ] **Paso 1: Import y estado del formulario**

Agregar `HorarioAtencion`, `DEFAULT_HORARIO_ATENCION` al import existente
de `../data/mockData`, y `Clock` al import de `lucide-react`.

Junto a los demás `useState` de este componente, agregar:

```ts
  const [horario, setHorario] = useState<HorarioAtencion>(currentCompany.horarioAtencion || DEFAULT_HORARIO_ATENCION);
```

En el `useEffect` que ya reinicia formularios al cambiar de empresa
(el mismo que resetea `isAddingUser`, etc. de la Tarea 4 del panel SaaS),
agregar:

```ts
    setHorario(currentCompany.horarioAtencion || DEFAULT_HORARIO_ATENCION);
```

(Nota: ese `useEffect` depende de `[selectedCompanyId]`; `currentCompany`
se recalcula en cada render a partir de `companies`/`selectedCompanyId`,
así que leerlo dentro del efecto es seguro aquí, igual que ya hacen los
demás campos reseteados en ese mismo efecto.)

- [ ] **Paso 2: Handler de guardado**

Junto a los demás handlers del componente:

```ts
  const diasLabel: Record<keyof HorarioAtencion, string> = {
    lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
    viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo'
  };

  const handleGuardarHorario = () => {
    onUpdateCompany({ ...currentCompany, horarioAtencion: horario });
  };

  const handleCambiarDia = (dia: keyof HorarioAtencion, campo: 'abre' | 'cierra', valor: string) => {
    setHorario(prev => ({ ...prev, [dia]: { ...prev[dia], [campo]: valor || null } }));
  };

  const handleToggleCerrado = (dia: keyof HorarioAtencion, cerrado: boolean) => {
    setHorario(prev => ({ ...prev, [dia]: cerrado ? { abre: null, cierra: null } : { abre: '08:00', cierra: '18:00' } }));
  };
```

- [ ] **Paso 3: Sección visual**

Insertar inmediatamente después de la sección "Usuarios y Colaboradores"
agregada en la Tarea 4 del panel SaaS (busca el `)}` que cierra ese
bloque, justo antes del comentario `{/* Editing / Creating Form */}`):

```tsx
      {!isEditing && !isAdding && currentUser.rol === 'Administrador' && (
        <div className="mt-5 p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-xs">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2.5">
            <Clock className="w-4 h-4 text-slate-600" style={{ color: currentCompany.colorPrimario }} />
            <div>
              <h4 className="font-bold text-slate-800">Horario de Atención</h4>
              <p className="text-[10px] text-slate-500">Usado para calcular los horarios disponibles en la página pública de citas</p>
            </div>
          </div>

          <div className="space-y-1.5">
            {(Object.keys(diasLabel) as Array<keyof HorarioAtencion>).map(dia => {
              const cerrado = horario[dia].abre == null;
              return (
                <div key={dia} className="flex items-center gap-2.5 p-2 bg-white border border-slate-200 rounded-lg">
                  <span className="w-20 font-semibold text-slate-700">{diasLabel[dia]}</span>
                  <label className="flex items-center gap-1.5 text-slate-500">
                    <input type="checkbox" checked={cerrado} onChange={(e) => handleToggleCerrado(dia, e.target.checked)} />
                    Cerrado
                  </label>
                  {!cerrado && (
                    <>
                      <input
                        type="time"
                        value={horario[dia].abre || ''}
                        onChange={(e) => handleCambiarDia(dia, 'abre', e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1"
                      />
                      <span className="text-slate-400">a</span>
                      <input
                        type="time"
                        value={horario[dia].cierra || ''}
                        onChange={(e) => handleCambiarDia(dia, 'cierra', e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1"
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={handleGuardarHorario}
            className="text-white px-3 py-1.5 rounded-lg font-semibold"
            style={{ backgroundColor: currentCompany.colorPrimario }}
          >
            Guardar Horario
          </button>
        </div>
      )}
```

- [ ] **Paso 4: Verificar**

`npm run lint` y `npm run build` limpios. Con permiso para reiniciar el
servidor, verificar con `curl` que `POST /api/companies` persiste
`horarioAtencion` correctamente (reusa la extensión de la Tarea 2, Paso
7) usando una empresa de prueba desechable, y que `GET
/api/public/disponibilidad` refleja el horario configurado (por ejemplo,
cerrar un día y confirmar que no aparecen horarios ese día). Confirmar
por inspección del bundle que "Horario de Atención" aparece.

- [ ] **Paso 5: Commit**

```bash
git add src/components/CompanySettings.tsx
git commit -m "Add per-company business hours configuration"
```
