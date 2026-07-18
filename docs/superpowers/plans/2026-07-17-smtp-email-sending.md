# Envío Real de Notificaciones SMTP (Correo HTML de Marca) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the simulated SMTP notification flow with real email sending via `nodemailer`, using branded HTML templates (company logo/colors, Nutrición vs Fisioterapia content) for both appointment (cita) notifications and consultation report emails.

**Architecture:** All sending happens server-side in `server.ts` and three new modules under `server/` (`crypto.ts`, `mailer.ts`, `emailTemplates.ts`). The browser never sees SMTP credentials. A single new endpoint `POST /api/notifications/send` looks up the company + SMTP config by `idCompania`, decrypts the stored password, renders the right HTML template, sends via `nodemailer`, and persists the result to `notification_logs`.

**Tech Stack:** Node.js/Express backend (`server.ts`), `nodemailer` for SMTP, Node's built-in `crypto` (AES-256-GCM) for password encryption, React/TypeScript frontend.

## Global Constraints

- No test runner is configured in this project (no Jest/Vitest). Verification steps use manual `curl`/`tsx` checks and manual UI testing instead of automated tests.
- SMTP passwords must never be sent back to the browser after being saved (spec: `docs/superpowers/specs/2026-07-17-smtp-email-sending-design.md`).
- A failed send must never be recorded in `notification_logs` as if it succeeded.
- Reuse the existing dual-mode pattern (MySQL via `pool` when `dbConnected`, else the in-memory `local*` arrays) already used by every other endpoint in `server.ts`.

---

### Task 1: Add `nodemailer` dependency and `ENCRYPTION_KEY`

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `.env`

**Interfaces:**
- Produces: `nodemailer` importable as `import nodemailer from "nodemailer"`; `process.env.ENCRYPTION_KEY` available as a 64-char hex string.

- [ ] **Step 1: Add the dependency to `package.json`**

In `package.json`, in `"dependencies"` (currently starts with `"@tailwindcss/vite": "^4.1.14",`), add:

```json
    "nodemailer": "^6.9.16",
```

so the block reads:

```json
  "dependencies": {
    "@tailwindcss/vite": "^4.1.14",
    "@vitejs/plugin-react": "^5.0.4",
    "dotenv": "^17.2.3",
    "express": "^4.21.2",
    "lucide-react": "^0.546.0",
    "motion": "^12.23.24",
    "mysql2": "^3.23.0",
    "nodemailer": "^6.9.16",
    "react": "^19.0.1",
    "react-dom": "^19.0.1",
    "recharts": "^3.9.2",
    "vite": "^6.2.3"
  },
```

In `"devDependencies"`, add `"@types/nodemailer": "^6.4.17"` next to `"@types/express"`:

```json
    "@types/express": "^4.17.21",
    "@types/nodemailer": "^6.4.17"
```

- [ ] **Step 2: Install**

Run: `npm install`
Expected: installs `nodemailer` and `@types/nodemailer` with no errors; `node_modules/nodemailer` exists.

- [ ] **Step 3: Generate and add `ENCRYPTION_KEY`**

Generate a real key:

Run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
Expected: prints a 64-character hex string.

Add that value to `.env` (create the entry near the other env vars):

```
ENCRYPTION_KEY="<the generated 64-char hex string>"
```

Add a documented placeholder to `.env.example` (after the `APP_URL` block, before `# MySQL Database Connection Details`):

```
# ENCRYPTION_KEY: 32-byte hex key used to encrypt SMTP passwords at rest (AES-256-GCM).
# Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY="MY_64_CHAR_HEX_KEY"
```

- [ ] **Step 4: Verify the key loads**

Run: `node -e "require('dotenv').config(); console.log(process.env.ENCRYPTION_KEY.length)"`
Expected: prints `64`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore: add nodemailer dependency and ENCRYPTION_KEY config"
```

(`.env` is gitignored — do not add it.)

---

### Task 2: `server/crypto.ts` — AES-256-GCM encrypt/decrypt for SMTP passwords

**Files:**
- Create: `server/crypto.ts`

**Interfaces:**
- Consumes: `process.env.ENCRYPTION_KEY` (from Task 1).
- Produces: `encryptSecret(plain: string): string`, `decryptSecret(cipherText: string): string` — used by Task 7 (save endpoint) and Task 3 (`mailer.ts`).

- [ ] **Step 1: Write `server/crypto.ts`**

```typescript
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("ENCRYPTION_KEY environment variable is required and must be a 64-character hex string (32 bytes).");
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(cipherText: string): string {
  const parts = cipherText.split(":");
  if (parts.length !== 3) {
    throw new Error("Configura una contraseña SMTP real desde Ajustes de Empresa.");
  }
  const [ivHex, authTagHex, dataHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(dataHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
```

- [ ] **Step 2: Verify round-trip manually**

Run:
```bash
node -e "
require('dotenv').config();
require('tsx/cjs');
const { encryptSecret, decryptSecret } = require('./server/crypto.ts');
const enc = encryptSecret('hunter2-app-password');
console.log('encrypted:', enc);
console.log('decrypted:', decryptSecret(enc));
"
```
Expected: `decrypted: hunter2-app-password`, and `encrypted:` shows three `:`-separated hex segments.

- [ ] **Step 3: Verify the placeholder-mismatch error**

Run:
```bash
node -e "
require('tsx/cjs');
const { decryptSecret } = require('./server/crypto.ts');
try { decryptSecret('••••••••••••••••'); } catch (e) { console.log('ERROR:', e.message); }
"
```
Expected: `ERROR: Configura una contraseña SMTP real desde Ajustes de Empresa.`

- [ ] **Step 4: Commit**

```bash
git add server/crypto.ts
git commit -m "feat: add AES-256-GCM helpers for SMTP password encryption"
```

---

### Task 3: `server/mailer.ts` — nodemailer sending wrapper

**Files:**
- Create: `server/mailer.ts`

**Interfaces:**
- Consumes: `decryptSecret` from `./crypto` (Task 2); `CompaniaSmtpConfig` type from `../src/data/mockData`.
- Produces: `sendMail(config: CompaniaSmtpConfig, message: OutgoingEmail): Promise<void>` — used by Task 8 (send endpoint).

- [ ] **Step 1: Write `server/mailer.ts`**

```typescript
import nodemailer from "nodemailer";
import type { CompaniaSmtpConfig } from "../src/data/mockData";
import { decryptSecret } from "./crypto";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendMail(config: CompaniaSmtpConfig, message: OutgoingEmail): Promise<void> {
  const password = decryptSecret(config.smtpPasswordCifrado);

  const transporter = nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSeguridad === "SSL",
    requireTLS: config.smtpSeguridad === "TLS",
    ignoreTLS: config.smtpSeguridad === "NINGUNA",
    auth: {
      user: config.smtpUsuario,
      pass: password,
    },
  });

  await transporter.sendMail({
    from: `"${config.remitenteNombre}" <${config.remitenteCorreo}>`,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint` (this project's `tsc --noEmit` script)
Expected: no new type errors referencing `server/mailer.ts`.

- [ ] **Step 3: Commit**

```bash
git add server/mailer.ts
git commit -m "feat: add nodemailer sending wrapper"
```

---

### Task 4: `server/emailTemplates.ts` — branded HTML templates

**Files:**
- Create: `server/emailTemplates.ts`

**Interfaces:**
- Consumes: `Company`, `Patient`, `Cita`, `Consultation` types from `../src/data/mockData`.
- Produces: `renderCitaEmail(params): RenderedEmail`, `renderConsultaEmail(params): RenderedEmail`, where `RenderedEmail = { subject: string; html: string; text: string }` — used by Task 8 (send endpoint).

- [ ] **Step 1: Write `server/emailTemplates.ts`**

```typescript
import type { Company, Patient, Cita, Consultation } from "../src/data/mockData";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string | number | null | undefined): string {
  const str = String(value ?? "");
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emailShell(company: Company, title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
            <tr>
              <td style="background-color:${escapeHtml(company.colorSidebar)};padding:20px 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="56" style="vertical-align:middle;">
                      <img src="${escapeHtml(company.logoUrl)}" width="48" height="48" alt="${escapeHtml(company.nombreComercial)}" style="border-radius:10px;display:block;object-fit:cover;" />
                    </td>
                    <td style="vertical-align:middle;padding-left:12px;">
                      <span style="color:#ffffff;font-size:16px;font-weight:bold;display:block;">${escapeHtml(company.nombreComercial)}</span>
                      <span style="color:#ffffff;opacity:0.85;font-size:11px;">${escapeHtml(company.razonSocial)}</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 0 24px;">
                <h1 style="color:${escapeHtml(company.colorPrimario)};font-size:18px;margin:16px 0 8px 0;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px 24px;color:#1e293b;font-size:13px;line-height:1.6;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="background-color:#f8fafc;padding:16px 24px;border-top:1px solid #e2e8f0;">
                <span style="color:#94a3b8;font-size:10px;">${escapeHtml(company.nombreComercial)} &middot; ${escapeHtml(company.correoEmisor)}</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function infoCard(label: string, value: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
    <tr>
      <td style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px;">
        <span style="display:block;color:#64748b;font-size:10px;text-transform:uppercase;font-weight:bold;">${escapeHtml(label)}</span>
        <span style="display:block;color:#1e293b;font-size:13px;font-weight:600;">${value}</span>
      </td>
    </tr>
  </table>`;
}

const CITA_TITLES: Record<"CONFIRMACION" | "CANCELACION" | "MODIFICACION", string> = {
  CONFIRMACION: "Confirmación de Cita",
  CANCELACION: "Cita Cancelada",
  MODIFICACION: "Cita Modificada / Reprogramada",
};

export function renderCitaEmail(params: {
  company: Company;
  patient: Patient;
  cita: Cita;
  tipoNotif: "CONFIRMACION" | "CANCELACION" | "MODIFICACION";
}): RenderedEmail {
  const { company, patient, cita, tipoNotif } = params;
  const [fecha, hora] = cita.fechaHora.split("T");
  const title = CITA_TITLES[tipoNotif];
  const subject = `${title} - ${company.nombreComercial}`;

  const detailsHtml =
    infoCard("Fecha", escapeHtml(fecha)) +
    infoCard("Hora", escapeHtml(hora || "")) +
    infoCard("Duración", `${cita.duracionMinutos} minutos`) +
    infoCard("Estado", escapeHtml(cita.estadoCita)) +
    (cita.notas ? infoCard("Notas del Profesional", escapeHtml(cita.notas)) : "");

  const intro =
    tipoNotif === "CONFIRMACION"
      ? "Le confirmamos que su cita ha sido programada con éxito:"
      : tipoNotif === "CANCELACION"
      ? "Le informamos que su cita ha sido CANCELADA:"
      : "Le informamos que su cita ha sido modificada. Estos son los nuevos detalles:";

  const bodyHtml = `
    <p>Estimado(a) ${escapeHtml(patient.nombreCompleto)},</p>
    <p>${intro}</p>
    ${detailsHtml}
    <p style="margin-top:16px;">Gracias por su confianza. Ante cualquier consulta, contáctenos con anticipación.</p>
    <p style="margin-top:16px;font-weight:bold;">${escapeHtml(company.nombreComercial)}</p>
  `;

  const text = `${title}\n\nEstimado(a) ${patient.nombreCompleto},\n${intro}\nFecha: ${fecha}\nHora: ${hora || ""}\nDuración: ${cita.duracionMinutos} minutos\nEstado: ${cita.estadoCita}\n${cita.notas ? `Notas: ${cita.notas}\n` : ""}\n${company.nombreComercial}`;

  return { subject, html: emailShell(company, title, bodyHtml), text };
}

export function renderConsultaEmail(params: {
  company: Company;
  patient: Patient;
  consultation: Consultation;
}): RenderedEmail {
  const { company, patient, consultation } = params;
  const subject = `Reporte de Consulta - ${company.nombreComercial}`;
  const title = consultation.tipo === "Nutrición" ? "Reporte de Consulta Nutricional" : "Reporte de Sesión de Fisioterapia";

  let sectionHtml = "";
  let sectionText = "";

  if (consultation.tipo === "Nutrición" && consultation.antropometria) {
    const a = consultation.antropometria;
    sectionHtml += `
      <h2 style="color:${escapeHtml(company.colorPrimario)};font-size:13px;text-transform:uppercase;margin-top:20px;">Composición Corporal</h2>
      ${infoCard("Peso Corporal", `${a.peso} kg`)}
      ${infoCard("IMC", `${a.imc}`)}
      ${infoCard("Grasa Corporal", `${a.grasaCorporal}%`)}
      ${infoCard("Masa Muscular", `${a.masaMuscular} kg`)}
    `;
    sectionText += `Composición Corporal\nPeso: ${a.peso} kg | IMC: ${a.imc} | Grasa Corporal: ${a.grasaCorporal}% | Masa Muscular: ${a.masaMuscular} kg\n\n`;

    if (consultation.dieta) {
      const d = consultation.dieta;
      sectionHtml += `
        <h2 style="color:${escapeHtml(company.colorPrimario)};font-size:13px;text-transform:uppercase;margin-top:20px;">Plan Alimentario Recomendado (${d.totalCalorias} kcal)</h2>
        ${infoCard("Desayuno", escapeHtml(d.desayuno))}
        ${d.meriendaManana ? infoCard("Colación AM", escapeHtml(d.meriendaManana)) : ""}
        ${infoCard("Almuerzo", escapeHtml(d.almuerzo))}
        ${d.meriendaTarde ? infoCard("Colación PM", escapeHtml(d.meriendaTarde)) : ""}
        ${infoCard("Cena", escapeHtml(d.cena))}
        ${d.indicaciones ? infoCard("Indicaciones", escapeHtml(d.indicaciones)) : ""}
      `;
      sectionText += `Plan Alimentario (${d.totalCalorias} kcal)\nDesayuno: ${d.desayuno}\nAlmuerzo: ${d.almuerzo}\nCena: ${d.cena}\n${d.indicaciones ? `Indicaciones: ${d.indicaciones}\n` : ""}\n`;
    }
  }

  if (consultation.tipo === "Fisioterapia" && consultation.fisioterapia) {
    const f = consultation.fisioterapia;
    sectionHtml += `
      <h2 style="color:${escapeHtml(company.colorPrimario)};font-size:13px;text-transform:uppercase;margin-top:20px;">Valoración de Dolor</h2>
      ${infoCard("Zona de Dolor", escapeHtml(f.zonaDolor))}
      ${infoCard("Escala EVA", `${f.evaDolor} de 10`)}
      ${infoCard("Tipo de Dolor", escapeHtml(f.tipoDolor))}
      ${infoCard("Factores Agravantes", escapeHtml(f.factoresAgravantes))}
      ${infoCard("Factores Atenuantes", escapeHtml(f.factoresAtenuantes))}

      <h2 style="color:${escapeHtml(company.colorPrimario)};font-size:13px;text-transform:uppercase;margin-top:20px;">Examen Físico</h2>
      ${infoCard("Postura", escapeHtml(f.posturaObservaciones))}
      ${infoCard("Palpación", escapeHtml(f.palpacionHallazgos))}
      ${infoCard("ROM", escapeHtml(f.romMedido))}
      ${infoCard("Fuerza (Daniels)", escapeHtml(f.fuerzaDaniels))}
      ${infoCard("Pruebas Especiales", escapeHtml(f.pruebasEspeciales))}

      <h2 style="color:${escapeHtml(company.colorPrimario)};font-size:13px;text-transform:uppercase;margin-top:20px;">Prescripción Terapéutica (${f.sesionesSugeridas} sesiones sugeridas)</h2>
      ${infoCard("Agentes Físicos", escapeHtml(f.agentesFisicos))}
      ${infoCard("Terapia Manual", escapeHtml(f.terapiaManual))}
      ${infoCard("Ejercicio Terapéutico", escapeHtml(f.ejercicioTerapeutico))}

      <h2 style="color:${escapeHtml(company.colorPrimario)};font-size:13px;text-transform:uppercase;margin-top:20px;">Nota SOAP</h2>
      ${infoCard("Subjetivo", escapeHtml(f.soapSubjetivo))}
      ${infoCard("Objetivo", escapeHtml(f.soapObjetivo))}
      ${infoCard("Análisis", escapeHtml(f.soapAnalisis))}
      ${infoCard("Plan", escapeHtml(f.soapPlan))}
    `;
    sectionText += `Valoración de Dolor\nZona: ${f.zonaDolor} | EVA: ${f.evaDolor}/10 | Tipo: ${f.tipoDolor}\n\nNota SOAP\nS: ${f.soapSubjetivo}\nO: ${f.soapObjetivo}\nA: ${f.soapAnalisis}\nP: ${f.soapPlan}\n`;
  }

  const bodyHtml = `
    <p>Estimado(a) ${escapeHtml(patient.nombreCompleto)},</p>
    <p>Adjuntamos el reporte de su ${consultation.tipo === "Nutrición" ? "consulta nutricional" : "sesión de fisioterapia"} del ${escapeHtml(consultation.fecha)}.</p>
    ${infoCard("Motivo de la Consulta", escapeHtml(consultation.motivo))}
    ${sectionHtml}
    ${consultation.anotacionesGenerales ? infoCard("Recomendaciones del Profesional", escapeHtml(consultation.anotacionesGenerales)) : ""}
    <p style="margin-top:16px;font-weight:bold;">${escapeHtml(company.nombreComercial)}</p>
  `;

  const text = `${title}\n\nEstimado(a) ${patient.nombreCompleto},\nFecha: ${consultation.fecha}\nMotivo: ${consultation.motivo}\n\n${sectionText}${consultation.anotacionesGenerales ? `Recomendaciones: ${consultation.anotacionesGenerales}\n` : ""}\n${company.nombreComercial}`;

  return { subject, html: emailShell(company, title, bodyHtml), text };
}
```

- [ ] **Step 2: Verify rendering manually**

Run:
```bash
node -e "
require('tsx/cjs');
const { renderCitaEmail } = require('./server/emailTemplates.ts');
const company = { nombreComercial: 'FisioNutri Escazú', razonSocial: 'Clínicas S.A.', colorPrimario: '#0f766e', colorSidebar: '#115e59', logoUrl: 'https://example.com/logo.png', correoEmisor: 'a@b.com' };
const patient = { nombreCompleto: 'Ana Pérez', correoElectronico: 'ana@example.com' };
const cita = { fechaHora: '2026-07-20T10:00', duracionMinutos: 30, estadoCita: 'PROGRAMADA', notas: 'Primera visita' };
const out = renderCitaEmail({ company, patient, cita, tipoNotif: 'CONFIRMACION' });
console.log(out.subject);
console.log(out.html.includes('#0f766e'));
console.log(out.text.includes('Ana Pérez'));
"
```
Expected: prints `Confirmación de Cita - FisioNutri Escazú`, then `true`, then `true`.

- [ ] **Step 3: Commit**

```bash
git add server/emailTemplates.ts
git commit -m "feat: add branded HTML email templates for cita and consulta notifications"
```

---

### Task 5: Data model updates and `notification_logs` schema migration

**Files:**
- Modify: `src/data/mockData.ts` (interfaces `NotificationLog`, `CompaniaSmtpConfig`; new type `SmtpConfigInput`)
- Modify: `server.ts:152-162` (notification_logs table), `server.ts:164` region (add ALTERs)

**Interfaces:**
- Produces: `NotificationLog.tipo` includes `'CONSULTA'`; `NotificationLog.idCita?: number | null`; `NotificationLog.idConsulta?: number | null`; `CompaniaSmtpConfig.tieneContrasena?: boolean`; `SmtpConfigInput` (used by Task 9, `CompanySettings.tsx`).

- [ ] **Step 1: Update `NotificationLog` in `src/data/mockData.ts:87-96`**

Replace:
```typescript
export interface NotificationLog {
  id: number;
  idCompania: number;
  idCita: number;
  tipo: 'CONFIRMACION' | 'MODIFICACION' | 'RECORDATORIO' | 'CANCELACION';
  destinatario: string;
  asunto: string;
  cuerpo: string;
  enviadoEn: string;
}
```
with:
```typescript
export interface NotificationLog {
  id: number;
  idCompania: number;
  idCita?: number | null;
  idConsulta?: number | null;
  tipo: 'CONFIRMACION' | 'MODIFICACION' | 'RECORDATORIO' | 'CANCELACION' | 'CONSULTA';
  destinatario: string;
  asunto: string;
  cuerpo: string;
  enviadoEn: string;
}
```

- [ ] **Step 2: Update `CompaniaSmtpConfig` in `src/data/mockData.ts:72-85`**

Add `tieneContrasena?: boolean;` as the last field before the closing brace:
```typescript
export interface CompaniaSmtpConfig {
  id: number;
  idCompania: number;
  proveedor: 'GMAIL' | 'OUTLOOK' | 'OTRO';
  smtpHost: string;
  smtpPort: number;
  smtpSeguridad: 'TLS' | 'SSL' | 'NINGUNA';
  smtpUsuario: string;
  smtpPasswordCifrado: string;
  remitenteNombre: string;
  remitenteCorreo: string;
  recordatorioHorasAntes: number;
  activo: boolean;
  tieneContrasena?: boolean;
}

export type SmtpConfigInput = Omit<CompaniaSmtpConfig, 'smtpPasswordCifrado' | 'tieneContrasena'> & {
  smtpPassword?: string;
};
```

- [ ] **Step 3: Migrate `notification_logs` schema in `server.ts`**

In `server.ts`, right after the existing block (around line 162):
```typescript
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idCompania INT NOT NULL,
        idCita INT NOT NULL,
        tipo VARCHAR(50) NOT NULL,
        destinatario VARCHAR(255) NOT NULL,
        asunto VARCHAR(255) NOT NULL,
        cuerpo TEXT NOT NULL,
        enviadoEn VARCHAR(50) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
```
add immediately after it:
```typescript
    await pool.query(`ALTER TABLE notification_logs MODIFY COLUMN idCita INT NULL`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS idConsulta INT NULL`);
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npm run lint`
Expected: no new errors (existing call sites that build `NotificationLog`/`CompaniaSmtpConfig` objects still satisfy the widened optional fields).

- [ ] **Step 5: Verify the migration runs against a live MySQL if available**

If a MySQL instance is reachable at the configured `DB_HOST`/`DB_PORT` (check `.env`), run:
```bash
npm run dev
```
Expected in the server logs: `[MySQL] Columnas de compatibilidad camelCase y soporte para JSON clínico avanzado...` followed by no errors. If no MySQL is reachable, expect the existing fallback log `⚠️ [MySQL] No se pudo conectar...` — the in-memory path still works and does not need this migration (nullable fields are just optional in the TS objects).

- [ ] **Step 6: Commit**

```bash
git add src/data/mockData.ts server.ts
git commit -m "feat: widen NotificationLog/CompaniaSmtpConfig types and migrate notification_logs schema"
```

---

### Task 6: Encrypt-on-save / strip-on-read for `/api/smtp-configs`

**Files:**
- Modify: `server.ts:1-16` (imports)
- Modify: `server.ts:676-724` (`GET`/`POST /api/smtp-configs`)

**Interfaces:**
- Consumes: `encryptSecret` from `./server/crypto` (Task 2).
- Produces: `GET /api/smtp-configs` responses never include a real `smtpPasswordCifrado` (always `""`, plus `tieneContrasena`); `POST /api/smtp-configs` accepts an optional `smtpPassword` plaintext field.

- [ ] **Step 1: Add imports to the top of `server.ts`**

After the existing `import mysql from "mysql2/promise";` line, add:
```typescript
import { encryptSecret } from "./server/crypto";
import type { CompaniaSmtpConfig } from "./src/data/mockData";
```

- [ ] **Step 2: Replace `GET /api/smtp-configs` (`server.ts:676-691`)**

Replace:
```typescript
  app.get("/api/smtp-configs", async (req, res) => {
    try {
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM compania_smtp_config");
        const formatted = (rows as any[]).map(row => ({
          ...row,
          activo: !!row.activo
        }));
        res.json(formatted);
      } else {
        res.json(localSmtpConfigs);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```
with:
```typescript
  app.get("/api/smtp-configs", async (req, res) => {
    try {
      let rows: CompaniaSmtpConfig[];
      if (dbConnected && pool) {
        const [dbRows] = await pool.query("SELECT * FROM compania_smtp_config");
        rows = (dbRows as any[]).map(row => ({ ...row, activo: !!row.activo }));
      } else {
        rows = localSmtpConfigs;
      }
      const sanitized = rows.map(row => ({
        ...row,
        smtpPasswordCifrado: "",
        tieneContrasena: !!row.smtpPasswordCifrado
      }));
      res.json(sanitized);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Step 3: Replace `POST /api/smtp-configs` (`server.ts:693-724`)**

Replace the whole handler with:
```typescript
  app.post("/api/smtp-configs", async (req, res) => {
    try {
      const s = req.body;
      const idCompania = parseInt(s.idCompania);

      let existingPassword = "";
      if (dbConnected && pool) {
        const [existingRows] = await pool.query("SELECT smtpPasswordCifrado FROM compania_smtp_config WHERE idCompania = ?", [idCompania]);
        existingPassword = (existingRows as any[])[0]?.smtpPasswordCifrado || "";
      } else {
        existingPassword = localSmtpConfigs.find(c => c.idCompania === idCompania)?.smtpPasswordCifrado || "";
      }

      const smtpPasswordCifrado = s.smtpPassword && String(s.smtpPassword).trim()
        ? encryptSecret(String(s.smtpPassword).trim())
        : existingPassword;

      if (dbConnected && pool) {
        const [exists] = await pool.query("SELECT id FROM compania_smtp_config WHERE idCompania = ?", [idCompania]);
        if ((exists as any).length > 0) {
          await pool.query(
            "UPDATE compania_smtp_config SET proveedor = ?, smtpHost = ?, smtpPort = ?, smtpSeguridad = ?, smtpUsuario = ?, smtpPasswordCifrado = ?, remitenteNombre = ?, remitenteCorreo = ?, recordatorioHorasAntes = ?, activo = ? WHERE idCompania = ?",
            [s.provider || s.proveedor, s.smtpHost, parseInt(s.smtpPort), s.smtpSeguridad, s.smtpUsuario, smtpPasswordCifrado, s.remitenteNombre, s.remitenteCorreo, parseInt(s.recordatorioHorasAntes), s.activo ? 1 : 0, idCompania]
          );
        } else {
          await pool.query(
            "INSERT INTO compania_smtp_config (idCompania, proveedor, smtpHost, smtpPort, smtpSeguridad, smtpUsuario, smtpPasswordCifrado, remitenteNombre, remitenteCorreo, recordatorioHorasAntes, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [idCompania, s.provider || s.proveedor, s.smtpHost, parseInt(s.smtpPort), s.smtpSeguridad, s.smtpUsuario, smtpPasswordCifrado, s.remitenteNombre, s.remitenteCorreo, parseInt(s.recordatorioHorasAntes), s.activo ? 1 : 0]
          );
        }
        res.json({ ...s, idCompania, smtpPasswordCifrado: "", tieneContrasena: !!smtpPasswordCifrado });
      } else {
        const index = localSmtpConfigs.findIndex(item => item.idCompania === idCompania);
        const stored: CompaniaSmtpConfig = {
          id: index !== -1 ? localSmtpConfigs[index].id : Math.max(0, ...localSmtpConfigs.map(item => item.id)) + 1,
          idCompania,
          proveedor: s.proveedor,
          smtpHost: s.smtpHost,
          smtpPort: parseInt(s.smtpPort),
          smtpSeguridad: s.smtpSeguridad,
          smtpUsuario: s.smtpUsuario,
          smtpPasswordCifrado,
          remitenteNombre: s.remitenteNombre,
          remitenteCorreo: s.remitenteCorreo,
          recordatorioHorasAntes: parseInt(s.recordatorioHorasAntes),
          activo: !!s.activo
        };
        if (index !== -1) {
          localSmtpConfigs[index] = stored;
        } else {
          localSmtpConfigs.push(stored);
        }
        res.json({ ...stored, smtpPasswordCifrado: "", tieneContrasena: !!smtpPasswordCifrado });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Step 4: Verify manually (in-memory fallback mode, no MySQL required)**

Run: `npm run dev` (leave running), then in another terminal:
```bash
curl -s -X POST http://localhost:3000/api/smtp-configs -H "Content-Type: application/json" -d '{"idCompania":1,"proveedor":"GMAIL","smtpHost":"smtp.gmail.com","smtpPort":587,"smtpSeguridad":"TLS","smtpUsuario":"test@gmail.com","smtpPassword":"my-app-password","remitenteNombre":"Test Clinic","remitenteCorreo":"test@gmail.com","recordatorioHorasAntes":24,"activo":true}'
```
Expected JSON response includes `"smtpPasswordCifrado":""` and `"tieneContrasena":true`.

Then:
```bash
curl -s http://localhost:3000/api/smtp-configs
```
Expected: the entry for `idCompania: 1` has `"smtpPasswordCifrado":""` and `"tieneContrasena":true`.

Then verify "keep existing password" behavior — resend without `smtpPassword`:
```bash
curl -s -X POST http://localhost:3000/api/smtp-configs -H "Content-Type: application/json" -d '{"idCompania":1,"proveedor":"GMAIL","smtpHost":"smtp.gmail.com","smtpPort":587,"smtpSeguridad":"TLS","smtpUsuario":"test@gmail.com","remitenteNombre":"Test Clinic","remitenteCorreo":"test@gmail.com","recordatorioHorasAntes":24,"activo":true}'
```
Expected: response still has `"tieneContrasena":true` (password preserved, not wiped).

- [ ] **Step 5: Commit**

```bash
git add server.ts
git commit -m "feat: encrypt SMTP passwords on save and stop returning them on read"
```

---

### Task 7: `POST /api/notifications/send` endpoint

**Files:**
- Modify: `server.ts:1-16` (imports)
- Modify: `server.ts` — insert new route near `// 7. Notification Logs` (around line 726), after the existing `POST /api/notification-logs` handler (ends around line 758).

**Interfaces:**
- Consumes: `sendMail` (Task 3), `renderCitaEmail`/`renderConsultaEmail` (Task 4), `Company`/`Patient`/`Cita`/`Consultation` types.
- Produces: `POST /api/notifications/send` — request/response contract consumed by Task 9 (`AgendaCalendar.tsx`) and Task 10 (`ReportView.tsx`).

- [ ] **Step 1: Add imports to the top of `server.ts`**

Add alongside the imports from Task 6:
```typescript
import { sendMail } from "./server/mailer";
import { renderCitaEmail, renderConsultaEmail } from "./server/emailTemplates";
import type { Company, Patient, Cita, Consultation } from "./src/data/mockData";
```

- [ ] **Step 2: Add the endpoint after `POST /api/notification-logs` (after `server.ts:758`, before the closing of the notification logs section)**

```typescript
  // 8. Real-time notification sending (Cita + Consulta)
  app.post("/api/notifications/send", async (req: express.Request, res: express.Response) => {
    try {
      const body = req.body;
      const idCompania = parseInt(body.idCompania);

      let company: Company | undefined;
      let smtpConfig: CompaniaSmtpConfig | undefined;

      if (dbConnected && pool) {
        const [companyRows] = await pool.query("SELECT * FROM companias WHERE id = ? OR id_compania = ?", [idCompania, idCompania]);
        company = (companyRows as any[]).map(normalizeRow)[0];
        const [smtpRows] = await pool.query("SELECT * FROM compania_smtp_config WHERE idCompania = ?", [idCompania]);
        const smtpRow = (smtpRows as any[])[0];
        smtpConfig = smtpRow ? { ...smtpRow, activo: !!smtpRow.activo } : undefined;
      } else {
        company = localCompanies.find(c => c.id === idCompania);
        smtpConfig = localSmtpConfigs.find(s => s.idCompania === idCompania);
      }

      if (!company) {
        return res.status(400).json({ error: "Empresa no encontrada." });
      }
      if (!smtpConfig || !smtpConfig.activo) {
        return res.status(400).json({ error: "Las notificaciones SMTP no están activas para esta empresa." });
      }

      let rendered;
      let idCita: number | null = null;
      let idConsulta: number | null = null;
      let destinatario: string;
      let tipoLog: string;

      if (body.tipo === "CITA") {
        const patient: Patient = body.patient;
        const cita: Cita = body.cita;
        rendered = renderCitaEmail({ company, patient, cita, tipoNotif: body.tipoNotif });
        idCita = cita.id;
        destinatario = patient.correoElectronico;
        tipoLog = body.tipoNotif;
      } else if (body.tipo === "CONSULTA") {
        const patient: Patient = body.patient;
        const consultation: Consultation = body.consultation;
        rendered = renderConsultaEmail({ company, patient, consultation });
        idConsulta = consultation.id;
        destinatario = patient.correoElectronico;
        tipoLog = "CONSULTA";
      } else {
        return res.status(400).json({ error: "Tipo de notificación inválido." });
      }

      await sendMail(smtpConfig, { to: destinatario, subject: rendered.subject, html: rendered.html, text: rendered.text });

      const log: any = {
        idCompania,
        idCita,
        idConsulta,
        tipo: tipoLog,
        destinatario,
        asunto: rendered.subject,
        cuerpo: rendered.text,
        enviadoEn: new Date().toISOString()
      };

      if (dbConnected && pool) {
        const [result] = await pool.query(
          "INSERT INTO notification_logs (idCompania, idCita, idConsulta, tipo, destinatario, asunto, cuerpo, enviadoEn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [log.idCompania, log.idCita, log.idConsulta, log.tipo, log.destinatario, log.asunto, log.cuerpo, log.enviadoEn]
        );
        log.id = (result as any).insertId;
      } else {
        log.id = Math.max(0, ...localLogs.map(item => item.id), 0) + 1;
        localLogs.push(log);
      }

      res.json(log);
    } catch (err: any) {
      console.error("Error enviando notificación:", err);
      res.status(500).json({ error: err.message || "No se pudo enviar la notificación." });
    }
  });
```

- [ ] **Step 3: Verify manually (in-memory fallback mode)**

With `npm run dev` running and a real Gmail App Password already saved via Task 6's curl (adjust `smtpUsuario`/`smtpPassword` to a real Gmail account + App Password for this to actually deliver), run:
```bash
curl -s -X POST http://localhost:3000/api/notifications/send -H "Content-Type: application/json" -d '{
  "tipo": "CITA",
  "idCompania": 1,
  "tipoNotif": "CONFIRMACION",
  "patient": { "nombreCompleto": "Ana Pérez", "correoElectronico": "destinatario-de-prueba@example.com" },
  "cita": { "id": 999, "fechaHora": "2026-07-20T10:00", "duracionMinutos": 30, "estadoCita": "PROGRAMADA", "notas": "Primera visita" }
}'
```
Expected: `200` response with the created log JSON (`"tipo":"CONFIRMACION"`), and the test inbox receives a branded HTML email. With a bogus/placeholder password (unchanged seed data), expect `400`/`500` with a clear `error` message and no entry added by a subsequent `GET /api/notification-logs`.

- [ ] **Step 4: Commit**

```bash
git add server.ts
git commit -m "feat: add /api/notifications/send endpoint for real SMTP delivery"
```

---

### Task 8: `CompanySettings.tsx` — password field UX (never re-send the real password)

**Files:**
- Modify: `src/components/CompanySettings.tsx:1-100` (state, sync effect, `handleSaveSmtp`)
- Modify: `src/components/CompanySettings.tsx:389-397` (password input JSX)
- Modify: `src/App.tsx:425-447` (`handleUpdateSmtpConfig` type + offline fallback)
- Modify: `src/App.tsx:1244-1257` and wherever `AgendaCalendar`/`CompanySettings` props are declared, for the `onUpdateSmtpConfig` type.

**Interfaces:**
- Consumes: `SmtpConfigInput` type from `src/data/mockData` (Task 5).
- Produces: `CompanySettingsProps.onUpdateSmtpConfig: (config: SmtpConfigInput) => void`.

- [ ] **Step 1: Update imports and add a `tieneContrasena` state in `CompanySettings.tsx`**

In `src/components/CompanySettings.tsx:2`, change:
```typescript
import { Company, CompaniaSmtpConfig } from '../data/mockData';
```
to:
```typescript
import { Company, CompaniaSmtpConfig, SmtpConfigInput } from '../data/mockData';
```

In `CompanySettingsProps` (`src/components/CompanySettings.tsx:5-13`), change:
```typescript
  onUpdateSmtpConfig: (config: CompaniaSmtpConfig) => void;
```
to:
```typescript
  onUpdateSmtpConfig: (config: SmtpConfigInput) => void;
```

After the `smtpActivo` state declaration (`src/components/CompanySettings.tsx:51`), add:
```typescript
  const [smtpTieneContrasena, setSmtpTieneContrasena] = useState(false);
```

- [ ] **Step 2: Stop prefilling the real password in the sync effect (`src/components/CompanySettings.tsx:53-79`)**

Replace:
```typescript
    setSmtpProveedor(matched.proveedor);
    setSmtpHost(matched.smtpHost);
    setSmtpPort(matched.smtpPort);
    setSmtpSeguridad(matched.smtpSeguridad);
    setSmtpUsuario(matched.smtpUsuario);
    setSmtpPassword(matched.smtpPasswordCifrado);
    setSmtpRemitenteNombre(matched.remitenteNombre);
    setSmtpRemitenteCorreo(matched.remitenteCorreo);
    setSmtpRecordatorioHoras(matched.recordatorioHorasAntes);
    setSmtpActivo(matched.activo);
  }, [selectedCompanyId, smtpConfigs]);
```
with:
```typescript
    setSmtpProveedor(matched.proveedor);
    setSmtpHost(matched.smtpHost);
    setSmtpPort(matched.smtpPort);
    setSmtpSeguridad(matched.smtpSeguridad);
    setSmtpUsuario(matched.smtpUsuario);
    setSmtpPassword('');
    setSmtpTieneContrasena(!!(matched as CompaniaSmtpConfig).tieneContrasena);
    setSmtpRemitenteNombre(matched.remitenteNombre);
    setSmtpRemitenteCorreo(matched.remitenteCorreo);
    setSmtpRecordatorioHoras(matched.recordatorioHorasAntes);
    setSmtpActivo(matched.activo);
  }, [selectedCompanyId, smtpConfigs]);
```

- [ ] **Step 3: Update `handleSaveSmtp` (`src/components/CompanySettings.tsx:81-100`)**

Replace:
```typescript
  const handleSaveSmtp = (e: React.FormEvent) => {
    e.preventDefault();
    const matched = smtpConfigs.find(s => s.idCompania === selectedCompanyId);
    const updatedSmtp: CompaniaSmtpConfig = {
      id: matched ? matched.id : Math.max(...smtpConfigs.map(s => s.id), 0) + 1,
      idCompania: selectedCompanyId,
      proveedor: smtpProveedor,
      smtpHost: smtpHost,
      smtpPort: smtpPort,
      smtpSeguridad: smtpSeguridad,
      smtpUsuario: smtpUsuario,
      smtpPasswordCifrado: smtpPassword,
      remitenteNombre: smtpRemitenteNombre,
      remitenteCorreo: smtpRemitenteCorreo,
      recordatorioHorasAntes: smtpRecordatorioHoras,
      activo: smtpActivo
    };
    onUpdateSmtpConfig(updatedSmtp);
    alert('¡Configuración SMTP y notificaciones guardadas con éxito!');
  };
```
with:
```typescript
  const handleSaveSmtp = (e: React.FormEvent) => {
    e.preventDefault();
    const matched = smtpConfigs.find(s => s.idCompania === selectedCompanyId);
    const updatedSmtp: SmtpConfigInput = {
      id: matched ? matched.id : Math.max(...smtpConfigs.map(s => s.id), 0) + 1,
      idCompania: selectedCompanyId,
      proveedor: smtpProveedor,
      smtpHost: smtpHost,
      smtpPort: smtpPort,
      smtpSeguridad: smtpSeguridad,
      smtpUsuario: smtpUsuario,
      ...(smtpPassword.trim() ? { smtpPassword: smtpPassword.trim() } : {}),
      remitenteNombre: smtpRemitenteNombre,
      remitenteCorreo: smtpRemitenteCorreo,
      recordatorioHorasAntes: smtpRecordatorioHoras,
      activo: smtpActivo
    };
    onUpdateSmtpConfig(updatedSmtp);
    alert('¡Configuración SMTP y notificaciones guardadas con éxito!');
  };
```

- [ ] **Step 4: Update the password field JSX (`src/components/CompanySettings.tsx:388-397`)**

Replace:
```tsx
            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Contraseña SMTP / App Password</label>
              <input
                type="password"
                required
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
            </div>
```
with:
```tsx
            <div>
              <label className="block text-slate-600 mb-1 font-semibold">Contraseña SMTP / App Password</label>
              <input
                type="password"
                required={!smtpTieneContrasena}
                value={smtpPassword}
                onChange={(e) => setSmtpPassword(e.target.value)}
                placeholder={smtpTieneContrasena ? '•••••••• (dejar en blanco para mantener la actual)' : 'Ingresa la contraseña o App Password'}
                className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 focus:ring-1 focus:ring-teal-500 focus:outline-hidden"
              />
            </div>
```

- [ ] **Step 5: Update `App.tsx` wiring (`src/App.tsx:425-447`)**

Add `SmtpConfigInput` to the mockData import in `src/App.tsx` (find the existing `import { Patient, User, Cita, CompaniaSmtpConfig, NotificationLog, ... } from './data/mockData';` line and add `SmtpConfigInput` to it).

Replace:
```typescript
  const handleUpdateSmtpConfig = (updatedSmtp: CompaniaSmtpConfig) => {
    fetch('/api/smtp-configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedSmtp)
    })
    .then(res => res.json())
    .then(data => {
      setSmtpConfigs(prev => {
        const exists = prev.some(s => s.idCompania === data.idCompania);
        return exists ? prev.map(s => s.idCompania === data.idCompania ? data : s) : [...prev, data];
      });
    })
    .catch(err => {
      console.error("Error saving SMTP config to MySQL:", err);
      const exists = smtpConfigs.some(s => s.idCompania === updatedSmtp.idCompania);
      if (exists) {
        setSmtpConfigs(prev => prev.map(s => s.idCompania === updatedSmtp.idCompania ? updatedSmtp : s));
      } else {
        setSmtpConfigs(prev => [...prev, updatedSmtp]);
      }
    });
  };
```
with:
```typescript
  const handleUpdateSmtpConfig = (updatedSmtp: SmtpConfigInput) => {
    fetch('/api/smtp-configs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedSmtp)
    })
    .then(res => res.json())
    .then(data => {
      setSmtpConfigs(prev => {
        const exists = prev.some(s => s.idCompania === data.idCompania);
        return exists ? prev.map(s => s.idCompania === data.idCompania ? data : s) : [...prev, data];
      });
    })
    .catch(err => {
      console.error("Error saving SMTP config to MySQL:", err);
      setSmtpConfigs(prev => {
        const existing = prev.find(s => s.idCompania === updatedSmtp.idCompania);
        const merged: CompaniaSmtpConfig = {
          id: existing ? existing.id : Math.max(0, ...prev.map(s => s.id)) + 1,
          idCompania: updatedSmtp.idCompania,
          proveedor: updatedSmtp.proveedor,
          smtpHost: updatedSmtp.smtpHost,
          smtpPort: updatedSmtp.smtpPort,
          smtpSeguridad: updatedSmtp.smtpSeguridad,
          smtpUsuario: updatedSmtp.smtpUsuario,
          smtpPasswordCifrado: existing?.smtpPasswordCifrado || '',
          remitenteNombre: updatedSmtp.remitenteNombre,
          remitenteCorreo: updatedSmtp.remitenteCorreo,
          recordatorioHorasAntes: updatedSmtp.recordatorioHorasAntes,
          activo: updatedSmtp.activo,
          tieneContrasena: !!existing?.smtpPasswordCifrado
        };
        const exists = prev.some(s => s.idCompania === updatedSmtp.idCompania);
        return exists ? prev.map(s => s.idCompania === updatedSmtp.idCompania ? merged : s) : [...prev, merged];
      });
    });
  };
```

- [ ] **Step 6: Verify manually in the browser**

Run `npm run dev`, open the app, go to Ajustes de Empresa → SMTP section. Confirm:
- The password field is blank on load even for a company with a saved config, and shows the "dejar en blanco" placeholder if one exists.
- Saving with the password field blank keeps working (no "required" validation error) and a subsequent reload still shows the placeholder (password preserved).
- Typing a new password and saving updates it (verify via Task 6's `curl .../api/smtp-configs` showing `tieneContrasena: true` and being able to send successfully in Task 7's manual test).

- [ ] **Step 7: Commit**

```bash
git add src/components/CompanySettings.tsx src/App.tsx
git commit -m "feat: never round-trip the real SMTP password to the browser"
```

---

### Task 9: `AgendaCalendar.tsx` — real cita notification sending

**Files:**
- Modify: `src/components/AgendaCalendar.tsx:204-237` (simulated trigger block)
- Modify: `src/components/AgendaCalendar.tsx:624-634` (notification history badge colors)

**Interfaces:**
- Consumes: `POST /api/notifications/send` (Task 7).
- Produces: no new exports; calls existing `onTriggerNotification(log: NotificationLog)` prop with the server-persisted log.

- [ ] **Step 1: Replace the simulated trigger block (`src/components/AgendaCalendar.tsx:204-237`)**

Replace:
```typescript
    // --- Simulated SMTP Notification Triggers ---
    if (activeSmtp.activo) {
      let tipoNotif: NotificationLog['tipo'] = 'CONFIRMACION';
      let asunto = '';
      let cuerpo = '';

      if (!selectedCita) {
        tipoNotif = 'CONFIRMACION';
        asunto = `Confirmación de Cita - ${activeSmtp.remitenteNombre}`;
        cuerpo = `Estimado(a) ${patient.nombreCompleto},\n\nLe confirmamos que su cita ha sido programada con éxito:\n📅 Fecha: ${formDate}\n⏰ Hora: ${formTime}\n⏱ Duración: ${formDuration} minutos\n\nNotas del Profesional: ${formNotes || 'Ninguna'}\n\nGracias por su confianza. En caso de requerir modificaciones, contáctenos con al menos ${activeSmtp.recordatorioHorasAntes} horas de anticipación.`;
      } else if (selectedCita.estadoCita !== formStatus && formStatus === 'CANCELADA') {
        tipoNotif = 'CANCELACION';
        asunto = `Cita Cancelada - ${activeSmtp.remitenteNombre}`;
        cuerpo = `Estimado(a) ${patient.nombreCompleto},\n\nLe informamos que su cita programada para el ${formDate} a las ${formTime} ha sido CANCELADA.\n\nMotivo/Notas: ${formNotes || 'No especificadas'}\n\nSi desea re-programar, puede ponerse en contacto con nosotros en cualquier momento.`;
      } else {
        tipoNotif = 'MODIFICACION';
        asunto = `Cita Modificada / Reprogramada - ${activeSmtp.remitenteNombre}`;
        cuerpo = `Estimado(a) ${patient.nombreCompleto},\n\nLe informamos que su cita ha sido modificada. Los nuevos detalles son:\n📅 Fecha: ${formDate}\n⏰ Hora: ${formTime}\n⏱ Duración: ${formDuration} minutos\n📌 Estado: ${formStatus}\n\nNotas adicionales: ${formNotes || 'Ninguna'}\n\nAtentamente,\n${activeSmtp.remitenteNombre}`;
      }

      const logId = Math.max(...logs.map(l => l.id), 0) + 1;
      const newLog: NotificationLog = {
        id: logId,
        idCompania: activeCompanyId,
        idCita: nextId,
        tipo: tipoNotif,
        destinatario: patient.correoElectronico,
        asunto: asunto,
        cuerpo: cuerpo,
        enviadoEn: new Date().toISOString()
      };

      onTriggerNotification(newLog);
    }
  };
```
with:
```typescript
    // --- Real SMTP Notification Triggers ---
    if (activeSmtp.activo) {
      let tipoNotif: 'CONFIRMACION' | 'CANCELACION' | 'MODIFICACION' = 'CONFIRMACION';
      if (!selectedCita) {
        tipoNotif = 'CONFIRMACION';
      } else if (selectedCita.estadoCita !== formStatus && formStatus === 'CANCELADA') {
        tipoNotif = 'CANCELACION';
      } else {
        tipoNotif = 'MODIFICACION';
      }

      fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'CITA',
          idCompania: activeCompanyId,
          tipoNotif,
          patient,
          cita: savedCita
        })
      })
        .then(async (res) => {
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'No se pudo enviar la notificación.');
          onTriggerNotification(data);
        })
        .catch((err: any) => {
          console.error('Error enviando notificación SMTP:', err);
          alert(`La cita se guardó, pero no se pudo enviar la notificación por correo: ${err.message}`);
        });
    }
  };
```

- [ ] **Step 2: Add a badge color for `CONSULTA` logs (`src/components/AgendaCalendar.tsx:624-634`)**

Replace:
```tsx
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                    log.tipo === 'CANCELACION' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                    log.tipo === 'CONFIRMACION' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                    'bg-sky-100 text-sky-700 border border-sky-200'
                  }`}>
```
with:
```tsx
                  <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${
                    log.tipo === 'CANCELACION' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                    log.tipo === 'CONFIRMACION' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                    log.tipo === 'CONSULTA' ? 'bg-violet-100 text-violet-700 border border-violet-200' :
                    'bg-sky-100 text-sky-700 border border-sky-200'
                  }`}>
```

- [ ] **Step 3: Verify manually in the browser**

With `npm run dev` running and a real SMTP config saved (Task 8), schedule a new appointment for a patient whose email you can check. Confirm:
- The appointment saves and closes the form immediately.
- A branded confirmation email arrives at the patient's address shortly after.
- The "Historial de Notificaciones SMTP Enviadas" section shows the new `CONFIRMACION` entry.
- Cancel an existing appointment and confirm a `CANCELACION` email arrives and logs.
- Temporarily set `activo: false` for the SMTP config and confirm saving an appointment does NOT attempt to send (no alert, no log entry).

- [ ] **Step 4: Commit**

```bash
git add src/components/AgendaCalendar.tsx
git commit -m "feat: send real cita notification emails instead of simulating them"
```

---

### Task 10: `ReportView.tsx` — real consultation report email

**Files:**
- Modify: `src/components/ReportView.tsx:1-22` (imports, props, `sendClientEmail`)
- Modify: `src/components/ReportView.tsx:40-46` (send button JSX)
- Modify: `src/App.tsx:684-690` (`<ReportView />` usage)

**Interfaces:**
- Consumes: `POST /api/notifications/send` (Task 7); `NotificationLog` type.
- Produces: `ReportViewProps.onNotificationSent: (log: NotificationLog) => void`.

- [ ] **Step 1: Update imports, props, and `sendClientEmail` (`src/components/ReportView.tsx:1-22`)**

Replace:
```typescript
import { Patient, Consultation, Company } from '../data/mockData';
import { Printer, Download, Share2, Mail, CheckCircle2, Sliders, Calendar, User, Info, Heart, Dumbbell } from 'lucide-react';
import { useState } from 'react';

interface ReportViewProps {
  consultation: Consultation;
  patient: Patient;
  company: Company;
  onClose: () => void;
}

export default function ReportView({ consultation, patient, company, onClose }: ReportViewProps) {
  const [emailSent, setEmailSent] = useState(false);

  const triggerPrint = () => {
    window.print();
  };

  const sendClientEmail = () => {
    setEmailSent(true);
    setTimeout(() => setEmailSent(false), 3000);
  };
```
with:
```typescript
import { Patient, Consultation, Company, NotificationLog } from '../data/mockData';
import { Printer, Download, Share2, Mail, CheckCircle2, Sliders, Calendar, User, Info, Heart, Dumbbell, RefreshCw } from 'lucide-react';
import { useState } from 'react';

interface ReportViewProps {
  consultation: Consultation;
  patient: Patient;
  company: Company;
  onClose: () => void;
  onNotificationSent: (log: NotificationLog) => void;
}

export default function ReportView({ consultation, patient, company, onClose, onNotificationSent }: ReportViewProps) {
  const [emailSent, setEmailSent] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const triggerPrint = () => {
    window.print();
  };

  const sendClientEmail = async () => {
    setIsSending(true);
    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo: 'CONSULTA',
          idCompania: company.id,
          patient,
          consultation
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo enviar el reporte.');
      onNotificationSent(data);
      setEmailSent(true);
      setTimeout(() => setEmailSent(false), 3000);
    } catch (err: any) {
      alert(`No se pudo enviar el reporte por correo: ${err.message}`);
    } finally {
      setIsSending(false);
    }
  };
```

- [ ] **Step 2: Update the send button JSX (`src/components/ReportView.tsx:40-46`)**

Replace:
```tsx
          <button
            onClick={sendClientEmail}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-3 rounded-xl border border-slate-200 transition-all flex items-center gap-1.5"
          >
            <Mail className="w-4 h-4" />
            {emailSent ? '¡Correo Enviado!' : 'Enviar a Correo'}
          </button>
```
with:
```tsx
          <button
            onClick={sendClientEmail}
            disabled={isSending}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold py-2 px-3 rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 disabled:opacity-60"
          >
            {isSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            {isSending ? 'Enviando...' : emailSent ? '¡Correo Enviado!' : 'Enviar a Correo'}
          </button>
```

- [ ] **Step 3: Wire `onNotificationSent` and simplify `handleAddNotificationLog` in `src/App.tsx`**

Replace (`src/App.tsx:449-463`):
```typescript
  const handleAddNotificationLog = (log: NotificationLog) => {
    fetch('/api/notification-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(log)
    })
    .then(res => res.json())
    .then(data => {
      setLogs(prev => [data, ...prev]);
    })
    .catch(err => {
      console.error("Error saving log to MySQL:", err);
      setLogs(prev => [log, ...prev]);
    });
  };
```
with:
```typescript
  const handleAddNotificationLog = (log: NotificationLog) => {
    setLogs(prev => [log, ...prev]);
  };
```
(The log is now persisted server-side inside `/api/notifications/send` itself — see Task 7 — so this handler only needs to update local state with the log the server already saved.)

Replace (`src/App.tsx:684-689`):
```tsx
        <ReportView
          consultation={selectedReportConsultation}
          patient={patients.find(p => p.id === selectedReportConsultation.idPaciente) || patients[0]}
          company={activeCompany}
          onClose={() => setSelectedReportConsultation(null)}
        />
```
with:
```tsx
        <ReportView
          consultation={selectedReportConsultation}
          patient={patients.find(p => p.id === selectedReportConsultation.idPaciente) || patients[0]}
          company={activeCompany}
          onClose={() => setSelectedReportConsultation(null)}
          onNotificationSent={handleAddNotificationLog}
        />
```

- [ ] **Step 4: Verify manually in the browser**

With `npm run dev` running and a real SMTP config saved: open a Nutrición consultation's report and click "Enviar a Correo" — confirm the button shows "Enviando...", then "¡Correo Enviado!", and the patient's inbox receives a branded email with the diet plan/antropometría sections. Repeat for a Fisioterapia consultation and confirm the email shows the pain/SOAP sections instead. Open the Agenda's notification history and confirm a `CONSULTA` entry (violet badge) now appears. Then deactivate SMTP (`activo: false`) and confirm clicking the button shows the `alert` with a clear error instead of a false "¡Correo Enviado!".

- [ ] **Step 5: Commit**

```bash
git add src/components/ReportView.tsx src/App.tsx
git commit -m "feat: send real consultation report emails from ReportView"
```

---

### Task 11: End-to-end verification across providers

**Files:** none (manual verification only)

- [ ] **Step 1: Gmail end-to-end**

In Ajustes de Empresa, select provider "Google (Gmail)" (auto-fills `smtp.gmail.com:587` / TLS), enter a real Gmail address and a Google App Password (not the regular account password — Gmail rejects basic auth), save, then trigger a cita confirmation and a consultation report email. Confirm both arrive with correct branding (company logo/colors) and correct content per `consultation.tipo`.

- [ ] **Step 2: Outlook end-to-end**

Repeat with provider "Microsoft (Outlook / Office 365)" (auto-fills `smtp.office365.com:587` / TLS) and a real Outlook/Office365 account + password (or app password if MFA is enabled). Confirm delivery.

- [ ] **Step 3: "Otro" (generic SMTP) end-to-end**

Repeat with provider "Otro" against any other SMTP provider available (e.g. Mailgun/SES SMTP credentials, or a personal domain's mail server) using manually entered host/port/security. Confirm delivery.

- [ ] **Step 4: Failure paths**

Confirm: (a) an inactive SMTP config (`activo: false`) blocks sending with a clear error and no log entry; (b) an unconfigured/placeholder password (`decryptSecret` format mismatch) fails with the "Configura una contraseña SMTP real..." message instead of crashing the server; (c) `npm run lint` passes with zero errors after all tasks.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "chore: finish real SMTP notification sending feature"
```

---

## Plan Self-Review

**Spec coverage:** AES-256-GCM encryption (Task 2, 6), never returning the password to the browser (Task 6, 8), branded HTML per company + perfilCompania (Task 4), cita notifications (Task 9) and consulta report emails via the existing manual button (Task 10), `notification_logs` schema fix for optional `idCita`/new `idConsulta` (Task 5) — every section of `docs/superpowers/specs/2026-07-17-smtp-email-sending-design.md` maps to a task above. No gaps found.

**Placeholder scan:** no "TBD"/"TODO"/"add appropriate error handling" phrases; every step shows the literal code or command to run.

**Type consistency:** `RenderedEmail` (Task 4) is consumed as-is by Task 7's endpoint (`rendered.subject/html/text`). `SmtpConfigInput` (Task 5) is consumed identically in Task 8's `CompanySettings.tsx` and `App.tsx` edits. `NotificationLog` (Task 5, widened) matches the log object shape built in Task 7's endpoint and consumed by `onTriggerNotification`/`onNotificationSent` in Tasks 9–10. `sendMail`'s `OutgoingEmail` (Task 3) matches the `{ to, subject, html, text }` call made in Task 7.


