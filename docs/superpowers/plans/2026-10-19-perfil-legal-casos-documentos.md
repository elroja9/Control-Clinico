# Perfil Legal: Casos y Documentos — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar el perfil de empresa `'Legal'` con clientes (tabla `pacientes`), casos, control de documentos con ubicación física y recordatorios por correo de documentos pendientes.

**Architecture:** Dos tablas nuevas (`casos_legales`, `documentos_caso`) con endpoints CRUD en `server.ts` siguiendo el patrón de `/api/plantillas-dieta` (BD + respaldo en memoria). Una función pura `tocaRecordatorio` decide los envíos; un `setInterval` horario (solo en producción) y un botón manual comparten `enviarRecordatorioCaso`. En el frontend, un componente nuevo `CasosLegalesManager` y condicionales `esLegal` en App, PatientForm, AgendaCalendar y FacturarModal, con textos de `terminoPersona()`.

**Tech Stack:** React 19 + Tailwind 4, Express + mysql2, vitest, nodemailer (vía `server/mailer.ts`).

Spec: `docs/superpowers/specs/2026-10-19-perfil-legal-casos-documentos-design.md`

## Global Constraints

- Fechas como VARCHAR: `YYYY-MM-DD` para días (`fechaLimite`, `fechaRecibido`), ISO `toISOString()` para instantes (`ultimoRecordatorioEn`, `creadoEn`) — convención de toda la BD (`citas`, `cuentas_cobrar`, `facturas`).
- "Hoy" siempre con `fechaCR()` de `src/utils/fechaCR.ts`, nunca `toISOString().slice(0,10)`.
- Todo endpoint: `requireAuth` + filtrar por `sessionOf(req).idCompania`; nunca confiar en `idCompania` del body.
- Todo endpoint con rama `dbConnected && pool` y rama en memoria (`localCasos`, `localDocumentosCaso`).
- El `.env` apunta a la BD de **producción**. No ejecutar `vite build` hacia `dist/`. El SQL se aplica solo con confirmación del usuario.
- El proceso automático de recordatorios corre solo con `NODE_ENV === "production"` (evita doble envío si `npm run dev` corre junto a pm2).
- Textos visibles en español; nombres de campos/rutas existentes (`idPaciente`, `/api/patients`) no cambian.

---

### Task 1: Esquema, tipos y `terminoPersona`

**Files:**
- Create: `docs/sql/2026-10-19-perfil-legal.sql`
- Create: `src/utils/terminoPersona.ts`
- Modify: `src/data/mockData.ts` (Company.perfilCompania, NotificationLog.tipo, nuevos tipos)
- Modify: `src/components/LoginView.tsx`, `src/components/CompanySettings.tsx` (opción 'Legal')
- Modify: `server/serviciosDefecto.ts` (comentario: Legal → [])

**Interfaces — Produces:**
```typescript
export type PerfilCompania = 'Fisioterapia' | 'Nutrición' | 'Ambas' | 'Spa' | 'Legal';
export interface DocumentoCaso { id: number; idCaso: number; nombre: string; estado: 'PENDIENTE' | 'RECIBIDO'; folio: string; fechaLimite: string | null; fechaRecibido: string | null; notas: string; }
export interface CasoLegal { id: number; idCompania: number; idPaciente: number; numeroExpediente: string; titulo: string; materia: string; estado: 'ABIERTO' | 'CERRADO'; ubicacionFisica: string; recordatorioCadaDias: number; ultimoRecordatorioEn: string | null; notas: string; creadoEn: string; documentos: DocumentoCaso[]; }
export function terminoPersona(perfil?: string): { singular: string; plural: string; minuscula: string; minusculaPlural: string };
```
`NotificationLog.tipo` agrega `'DOCUMENTOS'`.

- [ ] SQL (VARCHAR para fechas, FK con cascada):

```sql
CREATE TABLE IF NOT EXISTS casos_legales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idCompania INT NOT NULL,
  idPaciente INT NOT NULL,
  numeroExpediente VARCHAR(60) NOT NULL DEFAULT '',
  titulo VARCHAR(150) NOT NULL,
  materia VARCHAR(100) NOT NULL DEFAULT '',
  estado VARCHAR(10) NOT NULL DEFAULT 'ABIERTO',
  ubicacionFisica VARCHAR(150) NOT NULL DEFAULT '',
  recordatorioCadaDias INT NOT NULL DEFAULT 7,
  ultimoRecordatorioEn VARCHAR(50) NULL,
  notas TEXT NULL,
  creadoEn VARCHAR(50) NOT NULL,
  INDEX idx_casos_compania (idCompania),
  INDEX idx_casos_paciente (idPaciente)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS documentos_caso (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idCaso INT NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  estado VARCHAR(10) NOT NULL DEFAULT 'PENDIENTE',
  folio VARCHAR(60) NOT NULL DEFAULT '',
  fechaLimite VARCHAR(10) NULL,
  fechaRecibido VARCHAR(10) NULL,
  notas TEXT NULL,
  INDEX idx_documentos_caso (idCaso),
  CONSTRAINT fk_documentos_caso_caso FOREIGN KEY (idCaso) REFERENCES casos_legales(id) ON DELETE CASCADE
) ENGINE=InnoDB;
```

- [ ] `terminoPersona.ts`:

```typescript
// Perfil Legal: la tabla `pacientes` guarda clientes; solo cambia el texto visible.
export function terminoPersona(perfil?: string) {
  return perfil === 'Legal'
    ? { singular: 'Cliente', plural: 'Clientes', minuscula: 'cliente', minusculaPlural: 'clientes' }
    : { singular: 'Paciente', plural: 'Pacientes', minuscula: 'paciente', minusculaPlural: 'pacientes' };
}
```

- [ ] Tipos en `mockData.ts`; `Company.perfilCompania: PerfilCompania`.
- [ ] LoginView: estado `useState<PerfilCompania>`, `<option value="Legal">Despacho de abogados</option>`, `actividadEconomica` → `'Por definir (Servicios jurídicos)'` para Legal, `requiereConfirmacionCitas` sin cambio.
- [ ] CompanySettings: `useState<PerfilCompania>`, misma opción, y ocultar "Cargar servicios por defecto" también para `'Legal'`.
- [ ] `npx tsc --noEmit` → sin errores. Commit `feat(legal): esquema, tipos y perfil Legal`.

### Task 2: `tocaRecordatorio` (TDD)

**Files:**
- Create: `server/recordatoriosCasos.ts`
- Test: `server/recordatoriosCasos.test.ts`

**Interfaces — Produces:**
```typescript
export function tocaRecordatorio(caso: Pick<CasoLegal, 'estado' | 'recordatorioCadaDias' | 'ultimoRecordatorioEn'>, pendientes: number, ahora?: Date): boolean;
```
Regla: `ABIERTO`, `recordatorioCadaDias > 0`, `pendientes > 0`, hora CR en [8, 18), y (`ultimoRecordatorioEn` nulo **o** `fechaCR(ahora) >= sumarDiasCR(fechaCR(ultimo), N)`). Comparar días calendario CR (no milisegundos) para que el envío caiga en la primera pasada de las 8 a. m. del día N, sin derivar hora a hora.

- [ ] Prueba (horas en UTC; CR = UTC-6):

```typescript
import { describe, it, expect } from 'vitest';
import { tocaRecordatorio } from './recordatoriosCasos';

const base = { estado: 'ABIERTO' as const, recordatorioCadaDias: 7, ultimoRecordatorioEn: null as string | null };
const a = (iso: string) => new Date(iso);
const nueveAmCR = a('2026-10-19T15:00:00Z');

describe('tocaRecordatorio', () => {
  it('primer envío en horario hábil', () => expect(tocaRecordatorio(base, 2, nueveAmCR)).toBe(true));
  it('caso cerrado no', () => expect(tocaRecordatorio({ ...base, estado: 'CERRADO' }, 2, nueveAmCR)).toBe(false));
  it('sin pendientes no', () => expect(tocaRecordatorio(base, 0, nueveAmCR)).toBe(false));
  it('frecuencia 0 = apagado', () => expect(tocaRecordatorio({ ...base, recordatorioCadaDias: 0 }, 2, nueveAmCR)).toBe(false));
  it('7:59 CR todavía no', () => expect(tocaRecordatorio(base, 2, a('2026-10-19T13:59:00Z'))).toBe(false));
  it('8:00 CR sí', () => expect(tocaRecordatorio(base, 2, a('2026-10-19T14:00:00Z'))).toBe(true));
  it('18:00 CR ya no', () => expect(tocaRecordatorio(base, 2, a('2026-10-20T00:00:00Z'))).toBe(false));
  it('antes de N días no', () =>
    expect(tocaRecordatorio({ ...base, ultimoRecordatorioEn: '2026-10-13T16:00:00.000Z' }, 2, nueveAmCR)).toBe(false));
  it('al cumplirse N días calendario sí, aunque sea más temprano que el envío anterior', () =>
    expect(tocaRecordatorio({ ...base, ultimoRecordatorioEn: '2026-10-12T22:00:00.000Z' }, 2, nueveAmCR)).toBe(true));
  it('usa el día CR del último envío (23:30 CR del 11 = 05:30Z del 12)', () =>
    expect(tocaRecordatorio({ ...base, ultimoRecordatorioEn: '2026-10-12T05:30:00.000Z' }, 2, nueveAmCR)).toBe(true));
});
```

- [ ] `npx vitest run server/recordatoriosCasos.test.ts` → FAIL (módulo no existe).
- [ ] Implementación:

```typescript
import { fechaCR, fechaHoraCR, sumarDiasCR } from "../src/utils/fechaCR";
import type { CasoLegal } from "../src/data/mockData";

/** ¿Le toca hoy a este caso el correo de documentos pendientes? Pura: el reloj entra por parámetro. */
export function tocaRecordatorio(
  caso: Pick<CasoLegal, "estado" | "recordatorioCadaDias" | "ultimoRecordatorioEn">,
  pendientes: number,
  ahora: Date = new Date()
): boolean {
  if (caso.estado !== "ABIERTO" || caso.recordatorioCadaDias <= 0 || pendientes <= 0) return false;
  const horaCR = parseInt(fechaHoraCR(ahora).slice(11, 13), 10);
  if (horaCR < 8 || horaCR >= 18) return false; // no escribirle al cliente de madrugada
  if (!caso.ultimoRecordatorioEn) return true;
  return fechaCR(ahora) >= sumarDiasCR(fechaCR(new Date(caso.ultimoRecordatorioEn)), caso.recordatorioCadaDias);
}
```

- [ ] Prueba → PASS. Commit `feat(legal): regla de recordatorio de documentos`.

### Task 3: Plantilla de correo

**Files:**
- Modify: `server/emailTemplates.ts` (nueva `renderRecordatorioDocumentosEmail`; `renderCitaEmailProfesional` usa `terminoPersona`)
- Test: `server/emailTemplates.test.ts` (nuevo)

**Interfaces — Produces:**
```typescript
export function renderRecordatorioDocumentosEmail(params: { company: Company; patient: Patient; caso: CasoLegal; pendientes: DocumentoCaso[] }): RenderedEmail;
```

- [ ] Prueba: el HTML y el texto incluyen cada pendiente y su fecha límite, el asunto incluye el título del caso, y `<script>` en un nombre sale escapado (`&lt;script&gt;`).
- [ ] Implementación con `emailShell` + `infoCard("Caso", ...)`, `infoCard("Expediente", ...)` si hay número, y una lista `<ul>` de pendientes (`nombre` + " — entregar antes del YYYY-MM-DD" si hay `fechaLimite`). Texto plano equivalente.
- [ ] `renderCitaEmailProfesional`: `infoCard(terminoPersona(company.perfilCompania).singular, ...)`.
- [ ] Pruebas → PASS. Commit.

### Task 4: API y proceso automático (`server.ts`)

**Files:**
- Modify: `server.ts`

**Interfaces — Consumes:** `tocaRecordatorio` (Task 2), `renderRecordatorioDocumentosEmail` (Task 3), `CasoLegal`/`DocumentoCaso` (Task 1).
**Produces:** rutas de la tabla del spec. `GET /api/casos` y todas las escrituras de caso/documento devuelven `CasoLegal` con `documentos`.

- [ ] `let localCasos: Omit<CasoLegal, "documentos">[] = []; let localDocumentosCaso: DocumentoCaso[] = [];` junto a los demás `local*`.
- [ ] Helper `fetchCasos(filtro: { idCompania?: number; idCaso?: number; soloAbiertos?: boolean }): Promise<CasoLegal[]>` — una consulta para casos y otra para sus documentos (`WHERE idCaso IN (...)`), une en memoria. Normaliza `recordatorioCadaDias` a número y `notas` a `''`.
- [ ] `class RecordatorioNoEnviable extends Error {}` y `enviarRecordatorioCaso(caso: CasoLegal): Promise<NotificationLog>`: carga empresa (`fetchCompanyById`), cliente y SMTP; lanza `RecordatorioNoEnviable` si no hay pendientes, el cliente no tiene correo o el SMTP no está activo; `sendMail`; actualiza `ultimoRecordatorioEn = new Date().toISOString()`; inserta `notification_logs` con `tipo = 'DOCUMENTOS'`.
- [ ] Rutas: `GET /api/casos`; `POST /api/casos` (valida `titulo`, `idPaciente` de la empresa y activo, `estado ∈ {ABIERTO, CERRADO}`, `recordatorioCadaDias` entero 0–365; update si `id` es de la empresa, si no insert con `creadoEn`); `DELETE /api/casos/:id`; `POST /api/casos/:id/documentos` (valida `nombre`, `estado`, `fechaLimite` `^\d{4}-\d{2}-\d{2}$` o vacío→null; `RECIBIDO` sin fecha → `fechaCR()`, `PENDIENTE` → `fechaRecibido = null`); `DELETE /api/documentos-caso/:id` (JOIN con el caso para verificar empresa); `POST /api/casos/:id/recordatorio` (400 en `RecordatorioNoEnviable`, devuelve `{ log, caso }`).
- [ ] `procesarRecordatoriosCasos()`: sale si no hay BD o ya hay una pasada en curso; recorre `fetchCasos({ soloAbiertos: true })`, filtra con `tocaRecordatorio`, envía; `RecordatorioNoEnviable` se ignora, otros errores `console.error("[Recordatorios] caso", id, err)` y sigue. Tras `listen`: si `NODE_ENV === "production"`, `setTimeout(..., 60_000)` + `setInterval(..., 3_600_000)`.
- [ ] Import de `renderRecordatorioDocumentosEmail`, `tocaRecordatorio`, tipos.
- [ ] `npx tsc --noEmit` y `npx vitest run` → limpio. Commit.

### Task 5: `CasosLegalesManager.tsx`

**Files:**
- Create: `src/components/CasosLegalesManager.tsx`

**Interfaces — Produces:**
```typescript
interface CasosLegalesManagerProps {
  casos: CasoLegal[];           // ya filtrados por empresa
  clientes: Patient[];          // pacientes activos de la empresa
  themeColor: string;
  idClienteFiltro: number | null;
  onQuitarFiltroCliente: () => void;
  onCasoGuardado: (caso: CasoLegal) => void;   // reemplaza o agrega en el estado de App
  onCasoEliminado: (id: number) => void;
  onNotificacion: (log: NotificationLog) => void;
}
```

- [ ] Lista: búsqueda (cliente, expediente, título, materia, ubicación), filtro estado (Abiertos/Cerrados/Todos, por defecto Abiertos), chip de filtro por cliente. Fila: título, cliente, expediente, ubicación, "N pendientes", "N vencidos" (pendiente con `fechaLimite < fechaCR()`).
- [ ] Formulario de caso (nuevo/editar): cliente (select), título*, expediente, materia, ubicación física, recordatorio cada N días (0 = sin recordatorio), estado, notas. `POST /api/casos`.
- [ ] Detalle: datos del caso, último recordatorio, botones Editar / Enviar recordatorio ahora (deshabilitado con motivo si el cliente no tiene correo o no hay pendientes) / Eliminar (con `confirmar`). Lista de documentos con casilla "Recibido", folio, fecha límite (vencido en rojo), Editar, Eliminar; formulario para agregar/editar (nombre*, folio, fecha límite, notas).
- [ ] Errores de API con `notify.error(mensaje del servidor)`; éxitos con `notify.success`.
- [ ] `npx tsc --noEmit` → limpio. Commit.

### Task 6: Integración en la app

**Files:**
- Modify: `src/App.tsx`, `src/components/PatientForm.tsx`, `src/components/AgendaCalendar.tsx`, `src/components/FacturarModal.tsx`

- [ ] App: `TabId`/`TAB_IDS` + `'casos'`; estado `casos` + `fetch('/api/casos')` en la carga; `esLegal`, `persona = terminoPersona(perfil)`; estado `casosClienteFiltro`.
- [ ] Menú Legal: grupo "Despacho"; "Resumen"; "Clientes"; "Casos y Documentos" (icono `FolderOpen`, badge = documentos pendientes); sin "Historial de Citas" ni "Reportería"; "Personalizar Despacho".
- [ ] Resumen Legal: indicadores Citas de hoy / Clientes / Casos abiertos / Documentos pendientes / Documentos vencidos; botón "Nuevo cliente"; se oculta "Últimos pacientes atendidos" (depende de consultas).
- [ ] Lista de clientes (Legal): textos con `persona`; tarjeta con teléfono, correo y cantidad de casos en vez de antecedentes; botón único "Ver casos" (filtra por cliente y navega a `casos`).
- [ ] Render de `CasosLegalesManager` cuando `activeTab === 'casos' && esLegal`.
- [ ] PatientForm: prop `perfilCompania`; en Legal oculta fecha de nacimiento, edad, sexo, núcleo familiar y secciones 3 y 4; títulos con `persona`.
- [ ] AgendaCalendar: prop `perfilCompania`; textos visibles "paciente" → `persona`; en Legal se oculta "Iniciar consulta". Pasa `etiquetaPersona` a FacturarModal.
- [ ] FacturarModal: prop opcional `etiquetaPersona = 'Paciente'`.
- [ ] `npx tsc --noEmit`, `npx vitest run` → limpio. Commit.

### Task 7: Verificación

- [ ] Pedir confirmación y aplicar `docs/sql/2026-10-19-perfil-legal.sql` (solo crea tablas nuevas).
- [ ] `npm run dev` (puerto distinto al de pm2 si choca) y con navegador: cambiar una empresa de prueba a perfil Legal, crear cliente, caso, documentos, marcar recibido, buscar por ubicación, enviar recordatorio manual (si hay SMTP). Volver al perfil original.
- [ ] Reportar al usuario: qué se probó, qué no (envío automático real), y el paso de despliegue (`npm run pm2:restart`).
