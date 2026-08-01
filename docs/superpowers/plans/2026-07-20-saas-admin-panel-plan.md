# Panel de Administración SaaS (Empresa 7) — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la empresa `id_compania = 7` en la operadora SaaS de la plataforma: aprobar/suspender otras empresas, controlar su límite de usuarios y llevar su historial de pagos, con las notificaciones por correo correspondientes.

**Architecture:** Se extiende el modelo existente (`companias`, `usuarios`) con columnas nuevas y una tabla nueva (`pagos_empresa`), siguiendo el patrón dual ya establecido en `server.ts` (`dbConnected && pool` → MySQL real, si no → arrays en memoria). El frontend agrega un componente nuevo (`SaasAdminPanel.tsx`), una sección nueva en `CompanySettings.tsx` ("Usuarios"), y cambios en `LoginView.tsx`/`App.tsx` para el flujo de aprobación.

**Tech Stack:** React 19 + TypeScript + Vite (frontend), Express + mysql2 (backend), nodemailer (correo, vía `server/mailer.ts` ya existente).

Referencia completa de diseño: `docs/superpowers/specs/2026-07-20-saas-admin-panel-design.md`.

## Global Constraints

- No existe framework de pruebas en este proyecto. La verificación de cada tarea es: `npm run lint` (tsc --noEmit) limpio, `npm run build` limpio, y una verificación manual (curl/script Node o inspección del bundle) del comportamiento específico de la tarea — igual que en las funciones previas de esta sesión (SMTP, bloqueo de calendario, firmador Hacienda).
- Todas las columnas/tabla nuevas se crean con `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` dentro de `createTables()` en `server.ts` — el mismo patrón idempotente ya usado en todo el archivo. **Nunca** volver a ejecutar `ConsultorioDB_schema.sql` completo en el arranque (instrucción explícita previa del usuario).
- Las columnas nuevas de `companias` (`estadoSaas`, `maxUsuarios`, `montoMensual`, `proximoVencimiento`) y la columna nueva de `usuarios` (`activo`) se crean en camelCase puro — igual que `calendar_blocks`/`compania_smtp_config`/`notification_logs` — por lo que **no** requieren ninguna entrada nueva en `normalizeRow()` (esa función solo traduce columnas snake_case heredadas del `ConsultorioDB_schema.sql` original).
- El acceso al panel SaaS se decide únicamente por `currentUser.idCompania === 7` (ninguna tabla/rol nuevo de "SUPERADMIN").
- El endpoint de creación de usuarios (`POST /api/users`) es la única puerta de entrada para el límite `maxUsuarios`; se aplica tanto al registro de una empresa nueva (primer usuario admin) como a la pestaña "Usuarios" — cuenta solo usuarios con `activo = true/1`.
- Todas las empresas que ya existen antes de esta migración quedan `estadoSaas = 'ACTIVA'` automáticamente vía el `DEFAULT 'ACTIVA'` de la columna — nunca se escribe un backfill/`UPDATE` masivo adicional (repetiría en cada arranque y podría pisar cambios manuales del admin).
- Sigue el patrón fire-and-forget ya establecido en todos los handlers de `App.tsx` (`fetch` → `.then(setState)` → `.catch(fallback local)`), con una única excepción justificada en la Tarea 4 (`handleSaveUser` sí revisa `res.ok` antes de fusionar al estado, para no insertar un objeto de error como si fuera un usuario válido).

---

### Task 1: Modelo de datos — tipos, esquema y migraciones

**Files:**
- Modify: `src/data/mockData.ts`
- Modify: `ConsultorioDB_schema.sql`
- Modify: `server.ts:33-52` (variables de fallback en memoria), `server.ts:108-247` (`createTables()`)

**Interfaces:**
- Produces: `Company` con 4 campos nuevos (`estadoSaas`, `maxUsuarios`, `montoMensual`, `proximoVencimiento`); `User` con `activo: boolean`; `CompanyPayment` (tipo nuevo) y `defaultCompanyPayments: CompanyPayment[]`; tabla MySQL `pagos_empresa`; `localCompanyPayments` en `server.ts`.

- [ ] **Paso 1: Actualizar `Company` y `User` en `src/data/mockData.ts`**

En `src/data/mockData.ts:3-16`, reemplazar la interfaz `Company`:

```ts
export interface Company {
  id: number;
  nombreComercial: string;
  razonSocial: string;
  tipoIdentificacion: '01' | '02' | '03' | '04'; // 01: Física, 02: Jurídica, etc.
  identificacion: string;
  correoEmisor: string;
  ivaPorDefecto: number;
  colorPrimario: string;
  colorSidebar: string;
  logoUrl: string;
  actividadEconomica: string;
  perfilCompania: 'Fisioterapia' | 'Nutrición' | 'Ambas';
  estadoSaas: 'PENDIENTE' | 'ACTIVA' | 'SUSPENDIDA';
  maxUsuarios: number;
  montoMensual: number | null;
  proximoVencimiento: string | null; // 'YYYY-MM-DD'
}
```

En `src/data/mockData.ts:18-26`, reemplazar la interfaz `User`:

```ts
export interface User {
  id: number;
  idCompania: number;
  nombre: string;
  usuario: string;
  correo: string;
  contrasena: string;
  rol: 'Administrador' | 'Profesional';
  activo: boolean;
}
```

- [ ] **Paso 2: Actualizar `defaultCompanies` y `defaultUsers` con los campos nuevos**

En `src/data/mockData.ts:262-291`, agregar los 4 campos nuevos a cada objeto de `defaultCompanies` (ambas empresas de ejemplo quedan `ACTIVA` con límite 5, sin datos de pago):

```ts
export const defaultCompanies: Company[] = [
  {
    id: 1,
    nombreComercial: "FisioNutri Escazú",
    razonSocial: "Clínicas de Salud Integral S.A.",
    tipoIdentificacion: "02",
    identificacion: "3-101-445566",
    correoEmisor: "contacto@fisionutriescazu.com",
    ivaPorDefecto: 4.0,
    colorPrimario: "#0f766e",
    colorSidebar: "#115e59",
    logoUrl: "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=120&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    actividadEconomica: "869001 (Servicios de Terapia Física y Nutrición)",
    perfilCompania: "Ambas",
    estadoSaas: "ACTIVA",
    maxUsuarios: 5,
    montoMensual: null,
    proximoVencimiento: null
  },
  {
    id: 2,
    nombreComercial: "Clínica Elronutri Alajuela",
    razonSocial: "Eliecer Rojas Nutrición y Terapia",
    tipoIdentificacion: "01",
    identificacion: "5-0392-0984",
    correoEmisor: "eliecer.rojas9@gmail.com",
    ivaPorDefecto: 4.0,
    colorPrimario: "#d97706",
    colorSidebar: "#92400e",
    logoUrl: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=120&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    actividadEconomica: "851201 (Servicios de Nutrición)",
    perfilCompania: "Nutrición",
    estadoSaas: "ACTIVA",
    maxUsuarios: 5,
    montoMensual: null,
    proximoVencimiento: null
  }
];
```

En `src/data/mockData.ts:293-312`, agregar `activo: true` a cada objeto de `defaultUsers`:

```ts
export const defaultUsers: User[] = [
  {
    id: 1,
    idCompania: 1,
    nombre: "Dr. Keneth Rojas",
    usuario: "admin_escazu",
    correo: "contacto@fisionutriescazu.com",
    contrasena: "123456",
    rol: "Administrador",
    activo: true
  },
  {
    id: 2,
    idCompania: 2,
    nombre: "Dr. Eliecer Rojas",
    usuario: "eliecer_alajuela",
    correo: "eliecer.rojas9@gmail.com",
    contrasena: "123456",
    rol: "Administrador",
    activo: true
  }
];
```

- [ ] **Paso 3: Agregar el tipo `CompanyPayment` al final de `src/data/mockData.ts`**

Al final del archivo (después del bloque `HaciendaConfigInput`), agregar:

```ts
export interface CompanyPayment {
  id: number;
  idCompania: number;
  fecha: string; // 'YYYY-MM-DD'
  monto: number;
  notas: string;
  registradoPor: string;
}

export const defaultCompanyPayments: CompanyPayment[] = [];
```

- [ ] **Paso 4: Actualizar `ConsultorioDB_schema.sql` — columnas nuevas y tabla `pagos_empresa`**

En `ConsultorioDB_schema.sql`, dentro de la definición `CREATE TABLE companias` (líneas 95-113), agregar las 4 columnas nuevas antes del cierre `) ENGINE=InnoDB...` (justo después de `estado tinyint(1) NOT NULL DEFAULT 1,`):

```sql
  `estadoSaas` enum('PENDIENTE','ACTIVA','SUSPENDIDA') NOT NULL DEFAULT 'ACTIVA',
  `maxUsuarios` int(11) NOT NULL DEFAULT 5,
  `montoMensual` decimal(10,2) DEFAULT NULL,
  `proximoVencimiento` date DEFAULT NULL,
```

En la definición `CREATE TABLE usuarios` (líneas 118-130), la columna `activo` ya existe (`activo tinyint(1) NOT NULL DEFAULT 1` — mismo nombre en camelCase de una sola palabra, no requiere cambio en esta tabla).

Después del bloque `CREATE TABLE pacientes` (busca el siguiente `-- --------------------------------------------------------` tras la tabla `pacientes`, antes de la tabla `consultas`, o en cualquier punto después de `companias` — el orden de definición de tablas no importa siempre que `pagos_empresa` quede después de `companias` por la FK), agregar:

```sql
-- --------------------------------------------------------
-- Estructura de tabla para la tabla `pagos_empresa`
-- --------------------------------------------------------
CREATE TABLE `pagos_empresa` (
  `id_pago` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_compania` int(11) NOT NULL,
  `fecha` date NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `notas` varchar(255) DEFAULT NULL,
  `registrado_por` varchar(150) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  CONSTRAINT `fk_pagos_empresa_compania` FOREIGN KEY (`id_compania`) REFERENCES `companias` (`id_compania`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

Nota: este archivo `.sql` **no se ejecuta** en el arranque de la app (ver Global Constraints) — este cambio es solo documentación/referencia para instalaciones futuras desde cero, igual que el trabajo previo de cantones/distritos.

- [ ] **Paso 5: Migraciones idempotentes en `server.ts` `createTables()`**

En `server.ts`, dentro del bloque de "Columnas de compatibilidad camelCase" (línea 179, comentario `// companias`), después de la línea `await pool.query(\`ALTER TABLE companias ADD COLUMN IF NOT EXISTS perfilCompania VARCHAR(50) NULL\`);` (línea 190), agregar:

```ts
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS estadoSaas ENUM('PENDIENTE','ACTIVA','SUSPENDIDA') NOT NULL DEFAULT 'ACTIVA'`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS maxUsuarios INT NOT NULL DEFAULT 5`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS montoMensual DECIMAL(10,2) NULL`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS proximoVencimiento DATE NULL`);
```

En el bloque `// usuarios` (línea 192), después de `await pool.query(\`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS contrasena VARCHAR(255) NULL\`);` (línea 197), agregar:

```ts
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE`);
```

Inmediatamente después del bloque `CREATE TABLE IF NOT EXISTS calendar_blocks` (línea 130-141, antes del comentario `// companias` / bloque `compania_smtp_config`), agregar la tabla nueva:

```ts
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pagos_empresa (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idCompania INT NOT NULL,
        fecha DATE NOT NULL,
        monto DECIMAL(10,2) NOT NULL,
        notas VARCHAR(255),
        registradoPor VARCHAR(150)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
```

(Nota: se usa `id`/`idCompania` en camelCase puro aquí, igual que `calendar_blocks`, en vez de `id_pago`/`id_compania` del `.sql` de referencia — así el endpoint de la Tarea 2 no necesita `normalizeRow`, consistente con el resto de tablas creadas directamente por `server.ts`.)

- [ ] **Paso 6: Import y array de fallback en memoria para pagos**

En `server.ts:14-23` (bloque de imports de `defaultXxx`), agregar `defaultCompanyPayments` a la lista:

```ts
import {
  defaultCompanies,
  defaultUsers,
  defaultPatients,
  defaultConsultations,
  defaultCitas,
  defaultSmtpConfigs,
  defaultNotificationLogs,
  defaultCalendarBlocks,
  defaultCompanyPayments
} from "./src/data/mockData";
```

En `server.ts:12`, agregar `CompanyPayment` al import de tipos:

```ts
import type { Company, Patient, Cita, Consultation, CalendarBlock, CompanyPayment } from "./src/data/mockData";
```

En `server.ts:40` (después de `let localCalendarBlocks = [...defaultCalendarBlocks];`), agregar:

```ts
let localCompanyPayments: CompanyPayment[] = [...defaultCompanyPayments];
```

- [ ] **Paso 7: Verificar**

Ejecutar `npm run lint` (debe terminar sin errores — los nuevos campos son obligatorios en `Company`/`User`, así que cualquier literal de objeto incompleto en el resto del código fallará aquí y debe corregirse antes de continuar, aunque en este punto del plan no debería haber ningún otro literal `Company`/`User` fuera de `mockData.ts`). Ejecutar `npm run build` para confirmar que compila. Reiniciar el servidor (`node dist/server.cjs`, pidiendo permiso si ya hay un proceso activo en el puerto 3000, igual que en tareas anteriores) y verificar con `curl http://localhost:3000/api/companies` que la respuesta incluye `estadoSaas`, `maxUsuarios`, `montoMensual`, `proximoVencimiento` en cada empresa real de la base de datos (deben aparecer como `'ACTIVA'`/`5`/`null`/`null` en las empresas preexistentes, confirmando que la migración `ALTER TABLE ... DEFAULT` funcionó sin necesidad de backfill).

- [ ] **Paso 8: Commit**

```bash
git add src/data/mockData.ts ConsultorioDB_schema.sql server.ts
git commit -m "Add SaaS approval/payment/user-limit data model (companias + pagos_empresa)"
```

---

### Task 2: Endpoints del backend — aprobación/suspensión, pagos y límite de usuarios

**Files:**
- Modify: `server.ts` (endpoints `/api/companies/:id/estado-saas`, `/api/companies/:id/pagos`, y extensión de `/api/users`)
- Modify: `server/emailTemplates.ts`

**Interfaces:**
- Consumes: `Company`, `CompanyPayment`, `localCompanyPayments`, `sendMail` (de `server/mailer.ts`), `dbConnected`/`pool`/`localCompanies`/`localUsers` (de Task 1 y ya existentes).
- Produces: `renderAccountStatusEmail(params): RenderedEmail` en `server/emailTemplates.ts`; endpoints `POST /api/companies/:id/estado-saas`, `GET/POST /api/companies/:id/pagos`; `POST /api/users` extendido con `activo` y validación de límite.

- [ ] **Paso 1: Plantilla de correo `renderAccountStatusEmail` en `server/emailTemplates.ts`**

Al final de `server/emailTemplates.ts` (después de `renderConsultaEmail`), agregar:

```ts
export function renderAccountStatusEmail(params: {
  platformCompany: Company;
  tenantCompany: Company;
  nuevoEstado: "ACTIVA" | "SUSPENDIDA";
  estadoAnterior: "PENDIENTE" | "ACTIVA" | "SUSPENDIDA";
}): RenderedEmail {
  const { platformCompany, tenantCompany, nuevoEstado, estadoAnterior } = params;

  let title: string;
  let mensaje: string;

  if (nuevoEstado === "ACTIVA" && estadoAnterior === "PENDIENTE") {
    title = "¡Tu empresa fue aprobada!";
    mensaje = "Tu empresa ya fue revisada y aprobada. Ya puedes iniciar sesión en TuanisBooking con las credenciales que registraste.";
  } else if (nuevoEstado === "ACTIVA") {
    title = "Tu cuenta fue reactivada";
    mensaje = "Tu cuenta fue reactivada. Ya puedes iniciar sesión normalmente.";
  } else {
    title = "Tu cuenta ha sido suspendida";
    mensaje = "Tu cuenta ha sido suspendida temporalmente. Contacta al administrador de la plataforma para más información.";
  }

  const subject = `${title} - ${tenantCompany.nombreComercial}`;
  const bodyHtml = `
    <p>Estimado(a) equipo de ${escapeHtml(tenantCompany.nombreComercial)},</p>
    <p>${escapeHtml(mensaje)}</p>
    <p style="margin-top:16px;font-weight:bold;">TuanisBooking</p>
  `;
  const text = `${title}\n\n${mensaje}\n\nTuanisBooking`;

  return { subject, html: emailShell(platformCompany, title, bodyHtml), text };
}
```

- [ ] **Paso 2: Endpoint `POST /api/companies/:id/estado-saas`**

En `server.ts`, inmediatamente después del bloque `app.post("/api/companies", ...)` (termina en la línea 444, antes del comentario `// 2. Users` en la línea 446), agregar:

```ts
  app.post("/api/companies/:id/estado-saas", async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      const nuevoEstado = req.body.estadoSaas as Company["estadoSaas"];
      if (nuevoEstado !== "ACTIVA" && nuevoEstado !== "SUSPENDIDA" && nuevoEstado !== "PENDIENTE") {
        return res.status(400).json({ error: "estadoSaas inválido." });
      }

      let company: Company | undefined;
      let estadoAnterior: Company["estadoSaas"] | undefined;

      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM companias WHERE id = ? OR id_compania = ?", [companyId, companyId]);
        company = (rows as any[]).map(normalizeRow)[0];
        if (!company) return res.status(404).json({ error: "Empresa no encontrada." });
        estadoAnterior = company.estadoSaas;
        await pool.query("UPDATE companias SET estadoSaas = ? WHERE id = ? OR id_compania = ?", [nuevoEstado, companyId, companyId]);
        company.estadoSaas = nuevoEstado;
      } else {
        company = localCompanies.find(c => c.id === companyId);
        if (!company) return res.status(404).json({ error: "Empresa no encontrada." });
        estadoAnterior = company.estadoSaas;
        company.estadoSaas = nuevoEstado;
        localCompanies = localCompanies.map(c => c.id === companyId ? company! : c);
      }

      if (nuevoEstado === "ACTIVA" || nuevoEstado === "SUSPENDIDA") {
        try {
          let platformCompany: Company | undefined;
          let platformSmtp: CompaniaSmtpConfig | undefined;
          let adminUser: any;

          if (dbConnected && pool) {
            const [platRows] = await pool.query("SELECT * FROM companias WHERE id = 7 OR id_compania = 7");
            platformCompany = (platRows as any[]).map(normalizeRow)[0];
            const [smtpRows] = await pool.query("SELECT * FROM compania_smtp_config WHERE idCompania = 7");
            const smtpRow = (smtpRows as any[])[0];
            platformSmtp = smtpRow ? { ...smtpRow, activo: !!smtpRow.activo } : undefined;
            const [userRows] = await pool.query("SELECT * FROM usuarios WHERE (idCompania = ? OR id_compania = ?) AND rol = 'Administrador' LIMIT 1", [companyId, companyId]);
            adminUser = (userRows as any[]).map(normalizeRow)[0];
          } else {
            platformCompany = localCompanies.find(c => c.id === 7);
            platformSmtp = localSmtpConfigs.find(s => s.idCompania === 7);
            adminUser = localUsers.find(u => u.idCompania === companyId && u.rol === "Administrador");
          }

          if (platformCompany && platformSmtp && platformSmtp.activo && adminUser && adminUser.correo) {
            const rendered = renderAccountStatusEmail({
              platformCompany,
              tenantCompany: company,
              nuevoEstado,
              estadoAnterior: estadoAnterior || "PENDIENTE"
            });
            await sendMail(platformSmtp, { to: adminUser.correo, subject: rendered.subject, html: rendered.html, text: rendered.text });
          } else {
            console.log("[SaaS] Notificación de estado omitida (sin SMTP de plataforma activo o sin usuario administrador destinatario).");
          }
        } catch (mailErr: any) {
          console.error("[SaaS] Error enviando correo de notificación de estado:", mailErr.message || mailErr);
        }
      }

      res.json(company);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```

Agregar `renderAccountStatusEmail` al import existente de `server/emailTemplates` en `server.ts:11`:

```ts
import { renderCitaEmail, renderConsultaEmail, renderAccountStatusEmail } from "./server/emailTemplates";
```

- [ ] **Paso 3: Endpoints `GET`/`POST /api/companies/:id/pagos`**

Inmediatamente después del endpoint anterior (`estado-saas`), agregar:

```ts
  app.get("/api/companies/:id/pagos", async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM pagos_empresa WHERE idCompania = ? ORDER BY fecha DESC", [companyId]);
        res.json(rows);
      } else {
        res.json(localCompanyPayments.filter(p => p.idCompania === companyId).sort((a, b) => b.fecha.localeCompare(a.fecha)));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/companies/:id/pagos", async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      const p = req.body;

      if (dbConnected && pool) {
        const [result] = await pool.query(
          "INSERT INTO pagos_empresa (idCompania, fecha, monto, notas, registradoPor) VALUES (?, ?, ?, ?, ?)",
          [companyId, p.fecha, parseFloat(p.monto), p.notas || null, p.registradoPor || null]
        );
        p.id = (result as any).insertId;
        p.idCompania = companyId;

        if (p.montoMensual != null || p.proximoVencimiento != null) {
          await pool.query(
            "UPDATE companias SET montoMensual = COALESCE(?, montoMensual), proximoVencimiento = COALESCE(?, proximoVencimiento) WHERE id = ? OR id_compania = ?",
            [p.montoMensual != null ? parseFloat(p.montoMensual) : null, p.proximoVencimiento || null, companyId, companyId]
          );
        }
      } else {
        p.id = Math.max(0, ...localCompanyPayments.map(item => item.id)) + 1;
        p.idCompania = companyId;
        localCompanyPayments.push(p);

        if (p.montoMensual != null || p.proximoVencimiento != null) {
          localCompanies = localCompanies.map(c => c.id === companyId
            ? { ...c, montoMensual: p.montoMensual != null ? p.montoMensual : c.montoMensual, proximoVencimiento: p.proximoVencimiento || c.proximoVencimiento }
            : c);
        }
      }

      res.json(p);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Paso 4: Extender `POST /api/users` con `activo` y el límite de `maxUsuarios`**

Reemplazar por completo el bloque `app.post("/api/users", ...)` actual (`server.ts:460-492`) por:

```ts
  app.post("/api/users", async (req, res) => {
    try {
      const u = req.body;

      if (!u.id) {
        // Solo se valida el límite al CREAR un usuario nuevo, no al editar uno existente.
        let maxUsuarios = 5;
        let activosActuales = 0;

        if (dbConnected && pool) {
          const [companyRows] = await pool.query("SELECT maxUsuarios FROM companias WHERE id = ? OR id_compania = ?", [u.idCompania, u.idCompania]);
          const companyRow = (companyRows as any[])[0];
          if (companyRow) maxUsuarios = companyRow.maxUsuarios;
          const [countRows] = await pool.query("SELECT COUNT(*) as count FROM usuarios WHERE (idCompania = ? OR id_compania = ?) AND activo = 1", [u.idCompania, u.idCompania]);
          activosActuales = (countRows as any)[0].count;
        } else {
          const company = localCompanies.find(c => c.id === parseInt(u.idCompania));
          if (company) maxUsuarios = company.maxUsuarios;
          activosActuales = localUsers.filter(item => item.idCompania === parseInt(u.idCompania) && item.activo).length;
        }

        if (activosActuales >= maxUsuarios) {
          return res.status(400).json({ error: `Límite de usuarios alcanzado (máximo ${maxUsuarios}).` });
        }
      }

      if (dbConnected && pool) {
        if (u.id) {
          const [exists] = await pool.query("SELECT * FROM usuarios WHERE id = ? OR id_usuario = ?", [u.id, u.id]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE usuarios SET idCompania = ?, id_compania = ?, nombre = ?, usuario = ?, correo = ?, email = ?, contrasena = ?, password_hash = ?, rol = ?, activo = ? WHERE id = ? OR id_usuario = ?",
              [parseInt(u.idCompania), parseInt(u.idCompania), u.nombre, u.usuario, u.correo, u.correo, u.contrasena, u.contrasena, u.rol, u.activo ? 1 : 0, u.id, u.id]
            );
            return res.json(u);
          }
        }
        const [result] = await pool.query(
          "INSERT INTO usuarios (idCompania, id_compania, nombre, usuario, correo, email, contrasena, password_hash, rol, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [parseInt(u.idCompania), parseInt(u.idCompania), u.nombre, u.usuario, u.correo, u.correo, u.contrasena, u.contrasena, u.rol, u.activo === false ? 0 : 1]
        );
        u.id = (result as any).insertId;
        u.activo = u.activo === false ? false : true;
        res.json(u);
      } else {
        if (u.id) {
          localUsers = localUsers.map(item => item.id === u.id ? u : item);
        } else {
          u.id = Math.max(0, ...localUsers.map(item => item.id)) + 1;
          u.activo = u.activo === false ? false : true;
          localUsers.push(u);
        }
        res.json(u);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
```

- [ ] **Paso 5: Verificar**

`npm run lint` y `npm run build` limpios. Con el servidor corriendo (pidiendo permiso para reiniciar si hay uno activo):

1. `curl -X POST http://localhost:3000/api/companies/<id-de-una-empresa-de-prueba>/estado-saas -H "Content-Type: application/json" -d "{\"estadoSaas\":\"ACTIVA\"}"` y confirmar que la respuesta trae `estadoSaas: "ACTIVA"`.
2. `curl -X POST http://localhost:3000/api/companies/<id>/pagos -H "Content-Type: application/json" -d "{\"fecha\":\"2026-07-20\",\"monto\":50000,\"notas\":\"prueba\",\"registradoPor\":\"test\"}"` seguido de `curl http://localhost:3000/api/companies/<id>/pagos` para confirmar que el pago quedó registrado.
3. Crear usuarios de prueba vía `POST /api/users` hasta alcanzar `maxUsuarios` de esa empresa (dato real en la BD) y confirmar que el siguiente intento responde `400` con el mensaje de límite alcanzado.
4. Si la empresa 7 tiene SMTP activo configurado, confirmar en los logs del servidor que el correo se intentó enviar (o que se omitió limpiamente si no hay SMTP configurado) al llamar el endpoint de `estado-saas`.

- [ ] **Paso 6: Commit**

```bash
git add server.ts server/emailTemplates.ts
git commit -m "Add company approval/payment endpoints and per-company user limit enforcement"
```

---

### Task 3: Registro y bloqueo de acceso por aprobación/suspensión

**Files:**
- Modify: `src/components/LoginView.tsx`
- Modify: `src/App.tsx:282-315` (`handleRegisterCompany`)

**Interfaces:**
- Consumes: `Company.estadoSaas` (de Task 1).
- Produces: `LoginView` ya no auto-inicia sesión tras registrar; pantalla de confirmación "pendiente de aprobación"; `handleLoginSubmit` bloquea según `estadoSaas`.

- [ ] **Paso 1: `LoginView.tsx` — nuevo estado de vista "registrado, pendiente"**

En `src/components/LoginView.tsx:28`, agregar un estado nuevo junto a `view`:

```ts
  const [view, setView] = useState<'login' | 'register' | 'pendiente'>('login');
```

- [ ] **Paso 2: Construir la empresa nueva con `estadoSaas: 'PENDIENTE'` y quitar el auto-login**

En `handleRegisterSubmit` (`src/components/LoginView.tsx:70-123`), en el objeto `newCompany` (línea 88-105), agregar los 4 campos nuevos:

```ts
    const newCompany: Company = {
      id: nextCompanyId,
      nombreComercial: compName,
      razonSocial: compRazon,
      tipoIdentificacion: '02',
      identificacion: compIdent,
      correoEmisor: compCorreo,
      ivaPorDefecto: 4.0,
      colorPrimario: compColor,
      colorSidebar: compColor === '#0f766e' ? '#115e59' : compColor,
      logoUrl: compPerfil === 'Fisioterapia'
        ? 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=120'
        : compPerfil === 'Nutrición'
        ? 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=120'
        : 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=120',
      actividadEconomica: compPerfil === 'Fisioterapia' ? '869001 (Fisioterapia)' : '851201 (Nutrición)',
      perfilCompania: compPerfil,
      estadoSaas: 'PENDIENTE',
      maxUsuarios: 5,
      montoMensual: null,
      proximoVencimiento: null
    };
```

En el objeto `newAdminUser` (línea 109-117), agregar `activo: true`:

```ts
    const newAdminUser: User = {
      id: nextUserId,
      idCompania: nextCompanyId,
      nombre: adminNombre,
      usuario: adminUser,
      correo: adminCorreo,
      contrasena: adminPass,
      rol: 'Administrador',
      activo: true
    };
```

Reemplazar las dos últimas líneas de `handleRegisterSubmit` (línea 119-122):

```ts
    onRegisterCompany(newCompany, newAdminUser);

    // Auto login
    onLogin(newAdminUser, nextCompanyId);
```

por:

```ts
    onRegisterCompany(newCompany, newAdminUser);
    setView('pendiente');
```

- [ ] **Paso 3: Bloquear el login según `estadoSaas`**

En `handleLoginSubmit` (`src/components/LoginView.tsx:50-68`), reemplazar el bloque completo por:

```ts
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const foundUser = users.find(u => u.usuario.trim().toLowerCase() === username.trim().toLowerCase());

    if (!foundUser) {
      setLoginError('Usuario no encontrado en la base de datos.');
      return;
    }

    if (!passwordMatches(foundUser.contrasena, password)) {
      setLoginError('Contraseña incorrecta. Intente de nuevo.');
      return;
    }

    const company = companies.find(c => c.id === foundUser.idCompania);
    if (company?.estadoSaas === 'PENDIENTE') {
      setLoginError('Esta cuenta está pendiente de aprobación. Un administrador se pondrá en contacto pronto.');
      return;
    }
    if (company?.estadoSaas === 'SUSPENDIDA') {
      setLoginError('Esta cuenta se encuentra suspendida. Contacte al administrador de la plataforma.');
      return;
    }

    // Success! Log in
    onLogin(foundUser, foundUser.idCompania);
  };
```

- [ ] **Paso 4: Pantalla de confirmación "pendiente de aprobación"**

En `src/components/LoginView.tsx`, dentro del JSX principal (`return (...)`, dentro del `<div className="w-full max-w-xl ...">`), inmediatamente antes del bloque `{/* View switcher tab buttons */}` (línea ~157), agregar una rama que reemplaza todo el contenido cuando `view === 'pendiente'`. La forma más simple es envolver el switcher de tabs y ambas vistas existentes en `{view !== 'pendiente' && (...)}"`, y agregar el bloque nuevo justo después:

```tsx
        {view === 'pendiente' ? (
          <div className="text-center py-6 space-y-4">
            <div className="inline-flex p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <Clipboard className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Registro recibido</h3>
              <p className="text-xs text-slate-400 mt-2 max-w-sm mx-auto">
                Tu empresa fue registrada correctamente y está pendiente de aprobación.
                Te contactaremos pronto para activar tu cuenta.
              </p>
            </div>
            <button
              onClick={() => { setView('login'); setUsername(''); setPassword(''); }}
              className="w-full bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs py-3 rounded-xl transition-all shadow-md"
            >
              Volver al inicio de sesión
            </button>
          </div>
        ) : (
          <>
            {/* View switcher tab buttons */}
            <div className="grid grid-cols-2 p-1 bg-slate-950/80 border border-slate-800/80 rounded-xl mb-6">
              {/* ...contenido existente del switcher, sin cambios... */}
            </div>

            {/* ...contenido existente de las vistas 'login' y 'register', sin cambios... */}
          </>
        )}
```

(El `Clipboard` icon ya está importado en la línea 4 de este archivo — no requiere un import nuevo.)

- [ ] **Paso 5: `App.tsx` — sin cambios necesarios en `handleRegisterCompany`**

`handleRegisterCompany` (`src/App.tsx:282-315`) recibe el `Company` ya completo desde `LoginView.tsx` (con `estadoSaas: 'PENDIENTE'` incluido desde el Paso 2) y simplemente lo reenvía a `POST /api/companies` sin modificarlo — no requiere ningún cambio de código, solo confirmar (lectura, no edición) que el objeto que llega ya trae los 4 campos nuevos.

- [ ] **Paso 6: Verificar**

`npm run lint` / `npm run build` limpios. Verificación manual (sin navegador disponible en este entorno, se documenta como limitación): revisar el bundle construido (`dist/assets/index-*.js`) para confirmar que el texto "pendiente de aprobación" aparece, y trazar a mano el flujo de `handleLoginSubmit` con un caso de prueba armado en un script Node standalone que importe la lógica equivalente (mismo patrón de verificación usado para el bug de bcrypt en sesiones anteriores), o pedir permiso para reiniciar el servidor y usar `curl` contra `POST /api/companies` + `POST /api/users` para crear una empresa con `estadoSaas: 'PENDIENTE'` y confirmar que sus datos quedan correctamente guardados (el bloqueo de login en sí es lógica de cliente, no verificable por curl — se revisa por inspección de código).

- [ ] **Paso 7: Commit**

```bash
git add src/components/LoginView.tsx
git commit -m "Block login for pending/suspended companies, remove auto-login after registration"
```

---

### Task 4: Pestaña "Usuarios" en `CompanySettings.tsx`

**Files:**
- Modify: `src/components/CompanySettings.tsx`
- Modify: `src/App.tsx` (props nuevas hacia `CompanySettings`, handler `handleSaveUser`)

**Interfaces:**
- Consumes: `User`, `Company.maxUsuarios` (de Task 1); endpoint `POST /api/users` con validación de límite (de Task 2).
- Produces: `handleSaveUser(user: User): void` en `App.tsx`; sección "Usuarios" en `CompanySettings.tsx` gateada por `currentUser.rol === 'Administrador'`.

- [ ] **Paso 1: `App.tsx` — `handleSaveUser`**

En `src/App.tsx`, inmediatamente después de `handleUpdateSmtpConfig` (termina en la línea 516, antes de `handleAddNotificationLog` en la línea 518), agregar:

```ts
  const handleSaveUser = (user: User) => {
    fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    })
    .then(async res => {
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'No se pudo guardar el colaborador.');
        return;
      }
      setUsers(prev => {
        const exists = prev.some(u => u.id === data.id);
        return exists ? prev.map(u => u.id === data.id ? data : u) : [...prev, data];
      });
    })
    .catch(err => {
      console.error("Error saving user to MySQL:", err);
      alert('Error de conexión al guardar el colaborador.');
    });
  };
```

(Nota: a diferencia del resto de handlers fire-and-forget de este archivo, este sí revisa `res.ok` antes de fusionar al estado — es el primer endpoint de la app que puede rechazar una operación por regla de negocio (límite de usuarios) en vez de solo por error de red, así que no puede asumir éxito ciego. También se omite el fallback local optimista de los demás handlers: si `POST /api/users` fallara por límite alcanzado, agregar el usuario al estado local igualmente estaría mal — violaría el límite que el usuario acaba de ver rechazado.)

- [ ] **Paso 2: `App.tsx` — pasar `users` y `currentUser` a `CompanySettings`**

En `src/App.tsx:1273-1287` (bloque `{activeTab === 'branding' && (<CompanySettings .../>)}`), agregar las 3 props nuevas:

```tsx
            {activeTab === 'branding' && (
              <CompanySettings
                companies={companies.filter(c => c.id === selectedCompanyId)}
                selectedCompanyId={selectedCompanyId}
                onSelectCompany={(id) => setSelectedCompanyId(id)}
                onUpdateCompany={(updated) => {
                  setCompanies(prev => prev.map(c => c.id === updated.id ? updated : c));
                }}
                onAddCompany={(newComp) => {
                  setCompanies(prev => [...prev, newComp]);
                }}
                smtpConfigs={smtpConfigs}
                onUpdateSmtpConfig={handleUpdateSmtpConfig}
                users={users}
                currentUser={currentUser!}
                onSaveUser={handleSaveUser}
              />
            )}
```

(`currentUser!` es seguro aquí: este bloque solo se alcanza dentro del `return` posterior al `if (!currentUser) return <LoginView .../>` de la línea 564, así que `currentUser` nunca es `null` en este punto — mismo patrón ya usado en la línea 1298 de este archivo, `currentUser={currentUser || users.filter(...)[0]}`, que asume lo mismo.)

- [ ] **Paso 3: `CompanySettings.tsx` — props nuevas y estado del formulario**

En `src/components/CompanySettings.tsx:1-13`, actualizar el import y la interfaz de props:

```tsx
import React, { useState, useEffect } from 'react';
import { Company, CompaniaSmtpConfig, SmtpConfigInput, HaciendaConfig, HaciendaConfigInput, User } from '../data/mockData';
import { Plus, Check, Settings, Image as ImageIcon, Sparkles, Building, Database, Copy, Mail, Server, ShieldCheck, Upload, AlertCircle, Users as UsersIcon, UserPlus, Power } from 'lucide-react';

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
}

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
  onSaveUser
}: CompanySettingsProps) {
```

Inmediatamente después de la declaración de `currentCompany` (`const currentCompany = companies.find(c => c.id === selectedCompanyId) || companies[0];`), agregar el estado del formulario "Nuevo colaborador":

```ts
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserNombre, setNewUserNombre] = useState('');
  const [newUserUsuario, setNewUserUsuario] = useState('');
  const [newUserCorreo, setNewUserCorreo] = useState('');
  const [newUserContrasena, setNewUserContrasena] = useState('');
  const [newUserRol, setNewUserRol] = useState<'Administrador' | 'Profesional'>('Profesional');
```

Y un `useEffect` que reinicia ese formulario al cambiar de empresa (mismo patrón usado para los demás formularios de este componente, evita el bug de "bleed" entre empresas ya corregido antes en la sección de Hacienda):

```ts
  useEffect(() => {
    setIsAddingUser(false);
    setNewUserNombre('');
    setNewUserUsuario('');
    setNewUserCorreo('');
    setNewUserContrasena('');
    setNewUserRol('Profesional');
  }, [selectedCompanyId]);
```

- [ ] **Paso 4: `CompanySettings.tsx` — lógica de guardado con validación de límite**

En cualquier punto antes del `return (...)` del componente (junto a los demás handlers como `saveEdit`/`createCompany`), agregar:

```ts
  const companyUsers = users.filter(u => u.idCompania === currentCompany.id);
  const activeUserCount = companyUsers.filter(u => u.activo).length;
  const userLimitReached = activeUserCount >= currentCompany.maxUsuarios;

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserNombre.trim() || !newUserUsuario.trim() || !newUserCorreo.trim() || !newUserContrasena.trim()) {
      alert('Por favor complete todos los campos del nuevo colaborador.');
      return;
    }
    if (userLimitReached) {
      alert(`Alcanzaste el límite de ${currentCompany.maxUsuarios} usuarios de tu plan. Contacta al administrador de la plataforma para ampliarlo.`);
      return;
    }
    const newUser: User = {
      id: Math.max(0, ...users.map(u => u.id)) + 1,
      idCompania: currentCompany.id,
      nombre: newUserNombre,
      usuario: newUserUsuario,
      correo: newUserCorreo,
      contrasena: newUserContrasena,
      rol: newUserRol,
      activo: true
    };
    onSaveUser(newUser);
    setIsAddingUser(false);
    setNewUserNombre('');
    setNewUserUsuario('');
    setNewUserCorreo('');
    setNewUserContrasena('');
    setNewUserRol('Profesional');
  };

  const handleToggleUserActivo = (user: User) => {
    onSaveUser({ ...user, activo: !user.activo });
  };
```

- [ ] **Paso 5: `CompanySettings.tsx` — sección visual "Usuarios"**

Inmediatamente después del bloque de la sección Hacienda (busca el cierre de esa sección, identificable por el `h4` "Firma Digital Hacienda (Facturación Electrónica)" en la línea ~566 del archivo original — la nueva sección va justo después de que ese bloque cierra, antes del bloque final "Esquema MySQL / MariaDB" de la línea ~820), y solo si `currentUser.rol === 'Administrador'`, agregar:

```tsx
      {!isEditing && !isAdding && currentUser.rol === 'Administrador' && (
        <div className="mt-5 p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-4 text-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <div className="flex items-center gap-2">
              <UsersIcon className="w-4 h-4 text-slate-600" style={{ color: currentCompany.colorPrimario }} />
              <div>
                <h4 className="font-bold text-slate-800">Usuarios y Colaboradores</h4>
                <p className="text-[10px] text-slate-500">
                  {activeUserCount} de {currentCompany.maxUsuarios} usuarios activos permitidos por tu plan
                </p>
              </div>
            </div>
            {!isAddingUser && (
              <button
                onClick={() => setIsAddingUser(true)}
                disabled={userLimitReached}
                className="flex items-center gap-1 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 disabled:cursor-not-allowed text-white px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Nuevo Colaborador
              </button>
            )}
          </div>

          {userLimitReached && !isAddingUser && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Alcanzaste el límite de {currentCompany.maxUsuarios} usuarios de tu plan. Contacta al administrador de la plataforma para ampliarlo.</span>
            </div>
          )}

          {isAddingUser && (
            <form onSubmit={handleCreateUser} className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Nombre Completo *</label>
                  <input
                    type="text"
                    value={newUserNombre}
                    onChange={(e) => setNewUserNombre(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Correo *</label>
                  <input
                    type="email"
                    value={newUserCorreo}
                    onChange={(e) => setNewUserCorreo(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Nombre de Usuario *</label>
                  <input
                    type="text"
                    value={newUserUsuario}
                    onChange={(e) => setNewUserUsuario(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">Contraseña *</label>
                  <input
                    type="password"
                    value={newUserContrasena}
                    onChange={(e) => setNewUserContrasena(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-600 font-medium mb-1">Rol</label>
                <select
                  value={newUserRol}
                  onChange={(e) => setNewUserRol(e.target.value as 'Administrador' | 'Profesional')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800"
                >
                  <option value="Profesional">Profesional</option>
                  <option value="Administrador">Administrador</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setIsAddingUser(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={userLimitReached}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                >
                  Guardar Colaborador
                </button>
              </div>
            </form>
          )}

          <div className="space-y-1.5">
            {companyUsers.map(u => (
              <div key={u.id} className="flex items-center justify-between p-2.5 bg-white border border-slate-200 rounded-lg">
                <div>
                  <span className="font-semibold text-slate-800 block">{u.nombre}</span>
                  <span className="text-[10px] text-slate-500">{u.usuario} &middot; {u.rol}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${u.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                    {u.activo ? 'Activo' : 'Inactivo'}
                  </span>
                  <button
                    onClick={() => handleToggleUserActivo(u)}
                    title={u.activo ? 'Desactivar' : 'Activar'}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                  >
                    <Power className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
```

- [ ] **Paso 6: Verificar**

`npm run lint` y `npm run build` limpios. Con permiso para reiniciar el servidor: usar `curl` para crear usuarios vía `POST /api/users` hasta el límite de una empresa de prueba real y confirmar el `400`, luego alternar `activo` de un usuario existente vía el mismo endpoint y confirmar con `GET /api/users` que el campo persiste correctamente. La verificación visual del formulario queda documentada como limitación (sin navegador disponible) — se confirma por inspección del bundle generado que el texto "Nuevo Colaborador" y "usuarios activos permitidos por tu plan" aparecen.

- [ ] **Paso 7: Commit**

```bash
git add src/App.tsx src/components/CompanySettings.tsx
git commit -m "Add per-company staff management tab with user-limit enforcement"
```

---

### Task 5: Panel de Administración SaaS (`SaasAdminPanel.tsx`)

**Files:**
- Create: `src/components/SaasAdminPanel.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `Company`, `User`, `CompanyPayment` (de Task 1); `handleSaveUser` (no se usa aquí, es de Task 4); endpoints `estado-saas`/`pagos` (de Task 2).
- Produces: componente `SaasAdminPanel`, pestaña nueva `'saas-admin'` en `App.tsx`, handlers `handleUpdateEstadoSaas`/`handleUpdateMaxUsuarios`/`handleAddPayment`/`handleLoadPayments`.

- [ ] **Paso 1: `App.tsx` — estado y handlers nuevos**

En `src/App.tsx:114-117` (después de `calendarBlocks`), agregar el estado de pagos (sin persistencia en `localStorage`, se recarga bajo demanda por empresa — ver Paso 3):

```ts
  const [companyPayments, setCompanyPayments] = useState<CompanyPayment[]>([]);
```

Agregar `CompanyPayment` al import de tipos de `./data/mockData` (`src/App.tsx:38-56`):

```ts
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
  CalendarBlock,
  CompanyPayment
} from './data/mockData';
```

Agregar el import del componente nuevo (`src/App.tsx:58-63`):

```ts
import CompanySettings from './components/CompanySettings';
import PatientForm from './components/PatientForm';
import ConsultationForm from './components/ConsultationForm';
import ReportView from './components/ReportView';
import LoginView from './components/LoginView';
import AgendaCalendar from './components/AgendaCalendar';
import SaasAdminPanel from './components/SaasAdminPanel';
```

Después de `handleSaveUser` (agregado en la Tarea 4), agregar:

```ts
  const handleUpdateEstadoSaas = (companyId: number, estadoSaas: Company['estadoSaas']) => {
    fetch(`/api/companies/${companyId}/estado-saas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estadoSaas })
    })
    .then(res => res.json())
    .then(data => {
      setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, estadoSaas: data.estadoSaas } : c));
    })
    .catch(err => console.error("Error updating company estadoSaas:", err));
  };

  const handleUpdateMaxUsuarios = (companyId: number, maxUsuarios: number) => {
    const target = companies.find(c => c.id === companyId);
    if (!target) return;
    const updated = { ...target, maxUsuarios };
    fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated)
    })
    .then(res => res.json())
    .then(data => {
      setCompanies(prev => prev.map(c => c.id === companyId ? data : c));
    })
    .catch(err => {
      console.error("Error updating maxUsuarios:", err);
      setCompanies(prev => prev.map(c => c.id === companyId ? updated : c));
    });
  };

  const handleLoadPayments = (companyId: number) => {
    fetch(`/api/companies/${companyId}/pagos`)
      .then(res => res.json())
      .then(data => setCompanyPayments(data))
      .catch(err => console.error("Error loading company payments:", err));
  };

  const handleAddPayment = (payment: Omit<CompanyPayment, 'id'> & { montoMensual?: number | null; proximoVencimiento?: string | null }) => {
    fetch(`/api/companies/${payment.idCompania}/pagos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payment)
    })
    .then(res => res.json())
    .then(data => {
      setCompanyPayments(prev => [data, ...prev]);
      if (payment.montoMensual != null || payment.proximoVencimiento != null) {
        setCompanies(prev => prev.map(c => c.id === payment.idCompania
          ? { ...c, ...(payment.montoMensual != null ? { montoMensual: payment.montoMensual } : {}), ...(payment.proximoVencimiento != null ? { proximoVencimiento: payment.proximoVencimiento } : {}) }
          : c));
      }
    })
    .catch(err => console.error("Error adding company payment:", err));
  };
```

- [ ] **Paso 2: `App.tsx` — pestaña nueva gateada por empresa 7**

En `src/App.tsx:272`, extender el tipo de `activeTab`:

```ts
  const [activeTab, setActiveTab] = useState<'dashboard' | 'patients' | 'consultations' | 'agenda' | 'branding' | 'saas-admin'>('dashboard');
```

En el sidebar de escritorio (`src/App.tsx:847-859`, botón "Personalizar Clínica"), agregar el botón nuevo justo después, gateado por `currentUser?.idCompania === 7`:

```tsx
              <button
                onClick={() => setActiveTab('branding')}
                className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'branding'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  <span>Personalizar Clínica</span>
                </div>
              </button>

              {currentUser?.idCompania === 7 && (
                <button
                  onClick={() => setActiveTab('saas-admin')}
                  className={`w-full flex items-center justify-between py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                    activeTab === 'saas-admin'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-500" />
                    <span>Administración SaaS</span>
                  </div>
                </button>
              )}
```

(El ícono `Lock` ya está importado en `src/App.tsx:21` — no requiere import nuevo.) Replicar el mismo botón (mismo `onClick`/condición) en el drawer móvil, inmediatamente después del botón "Personalizar Clínica" del drawer (`src/App.tsx:721-733`):

```tsx
            <button
              onClick={() => { setActiveTab('branding'); setIsMobileMenuOpen(false); }}
              className={`flex items-center justify-between py-2.5 px-3.5 rounded-xl text-xs font-semibold transition-all sm:col-span-2 ${
                activeTab === 'branding'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                <span>Personalizar Clínica</span>
              </div>
            </button>

            {currentUser?.idCompania === 7 && (
              <button
                onClick={() => { setActiveTab('saas-admin'); setIsMobileMenuOpen(false); }}
                className={`flex items-center justify-between py-2.5 px-3.5 rounded-xl text-xs font-semibold transition-all sm:col-span-2 ${
                  activeTab === 'saas-admin'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 bg-slate-50 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-amber-500" />
                  <span>Administración SaaS</span>
                </div>
              </button>
            )}
```

- [ ] **Paso 3: `App.tsx` — renderizar `SaasAdminPanel`**

Inmediatamente después del bloque `{activeTab === 'branding' && (<CompanySettings .../>)}` (de la Tarea 4), agregar:

```tsx
            {activeTab === 'saas-admin' && currentUser?.idCompania === 7 && (
              <SaasAdminPanel
                companies={companies.filter(c => c.id !== 7)}
                users={users}
                payments={companyPayments}
                onUpdateEstadoSaas={handleUpdateEstadoSaas}
                onUpdateMaxUsuarios={handleUpdateMaxUsuarios}
                onLoadPayments={handleLoadPayments}
                onAddPayment={handleAddPayment}
              />
            )}
```

- [ ] **Paso 4: Crear `src/components/SaasAdminPanel.tsx`**

```tsx
import React, { useState } from 'react';
import { Company, User, CompanyPayment } from '../data/mockData';
import { ShieldCheck, ShieldAlert, ShieldOff, Users, DollarSign, X, Plus } from 'lucide-react';

interface SaasAdminPanelProps {
  companies: Company[];
  users: User[];
  payments: CompanyPayment[];
  onUpdateEstadoSaas: (companyId: number, estadoSaas: Company['estadoSaas']) => void;
  onUpdateMaxUsuarios: (companyId: number, maxUsuarios: number) => void;
  onLoadPayments: (companyId: number) => void;
  onAddPayment: (payment: Omit<CompanyPayment, 'id'> & { montoMensual?: number | null; proximoVencimiento?: string | null }) => void;
}

const ESTADO_BADGE: Record<Company['estadoSaas'], string> = {
  PENDIENTE: 'bg-amber-100 text-amber-800',
  ACTIVA: 'bg-emerald-100 text-emerald-800',
  SUSPENDIDA: 'bg-rose-100 text-rose-800'
};

const ESTADO_LABEL: Record<Company['estadoSaas'], string> = {
  PENDIENTE: 'Pendiente',
  ACTIVA: 'Activa',
  SUSPENDIDA: 'Suspendida'
};

export default function SaasAdminPanel({
  companies,
  users,
  payments,
  onUpdateEstadoSaas,
  onUpdateMaxUsuarios,
  onLoadPayments,
  onAddPayment
}: SaasAdminPanelProps) {
  const [editingLimitId, setEditingLimitId] = useState<number | null>(null);
  const [limitDraft, setLimitDraft] = useState(5);
  const [paymentsCompanyId, setPaymentsCompanyId] = useState<number | null>(null);
  const [newPaymentFecha, setNewPaymentFecha] = useState(new Date().toISOString().slice(0, 10));
  const [newPaymentMonto, setNewPaymentMonto] = useState(0);
  const [newPaymentNotas, setNewPaymentNotas] = useState('');
  const [newPaymentMontoMensual, setNewPaymentMontoMensual] = useState('');
  const [newPaymentVencimiento, setNewPaymentVencimiento] = useState('');

  const openLimitEditor = (company: Company) => {
    setEditingLimitId(company.id);
    setLimitDraft(company.maxUsuarios);
  };

  const saveLimitEditor = (companyId: number) => {
    onUpdateMaxUsuarios(companyId, limitDraft);
    setEditingLimitId(null);
  };

  const openPayments = (company: Company) => {
    setPaymentsCompanyId(company.id);
    setNewPaymentFecha(new Date().toISOString().slice(0, 10));
    setNewPaymentMonto(0);
    setNewPaymentNotas('');
    setNewPaymentMontoMensual(company.montoMensual != null ? String(company.montoMensual) : '');
    setNewPaymentVencimiento(company.proximoVencimiento || '');
    onLoadPayments(company.id);
  };

  const handleAddPaymentSubmit = (e: React.FormEvent, company: Company) => {
    e.preventDefault();
    if (newPaymentMonto <= 0) {
      alert('Ingrese un monto válido.');
      return;
    }
    onAddPayment({
      idCompania: company.id,
      fecha: newPaymentFecha,
      monto: newPaymentMonto,
      notas: newPaymentNotas,
      registradoPor: 'Administrador SaaS',
      montoMensual: newPaymentMontoMensual !== '' ? parseFloat(newPaymentMontoMensual) : null,
      proximoVencimiento: newPaymentVencimiento || null
    });
    setNewPaymentMonto(0);
    setNewPaymentNotas('');
  };

  const paymentsCompany = companies.find(c => c.id === paymentsCompanyId);
  const paymentsForCompany = payments.filter(p => p.idCompania === paymentsCompanyId);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 text-xs">
      <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
        <ShieldCheck className="w-5 h-5 text-slate-500" />
        <div>
          <h3 className="text-sm font-bold text-slate-800">Administración SaaS de Empresas</h3>
          <p className="text-[11px] text-slate-500">Aprobación, suspensión, límite de usuarios y pagos por empresa</p>
        </div>
      </div>

      <div className="space-y-2.5">
        {companies.length === 0 && (
          <p className="text-slate-500 text-center py-6">No hay otras empresas registradas todavía.</p>
        )}
        {companies.map(company => {
          const activeUserCount = users.filter(u => u.idCompania === company.id && u.activo).length;
          return (
            <div key={company.id} className="border border-slate-200 rounded-xl p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div>
                  <span className="font-bold text-slate-800 block">{company.nombreComercial}</span>
                  <span className="text-[10px] text-slate-500">{company.identificacion}</span>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${ESTADO_BADGE[company.estadoSaas]}`}>
                  {ESTADO_LABEL[company.estadoSaas]}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] mb-3">
                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <span className="text-slate-500 block">Usuarios</span>
                  <span className="font-semibold text-slate-800">{activeUserCount} / {company.maxUsuarios}</span>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                  <span className="text-slate-500 block">Monto Mensual</span>
                  <span className="font-semibold text-slate-800">{company.montoMensual != null ? `₡${company.montoMensual}` : '—'}</span>
                </div>
                <div className="bg-slate-50 rounded-lg p-2 border border-slate-100 col-span-2 sm:col-span-1">
                  <span className="text-slate-500 block">Próximo Vencimiento</span>
                  <span className="font-semibold text-slate-800">{company.proximoVencimiento || '—'}</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {company.estadoSaas === 'PENDIENTE' && (
                  <button
                    onClick={() => onUpdateEstadoSaas(company.id, 'ACTIVA')}
                    className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg font-semibold"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Aprobar
                  </button>
                )}
                {company.estadoSaas === 'ACTIVA' && (
                  <button
                    onClick={() => onUpdateEstadoSaas(company.id, 'SUSPENDIDA')}
                    className="flex items-center gap-1 bg-rose-600 hover:bg-rose-700 text-white px-2.5 py-1.5 rounded-lg font-semibold"
                  >
                    <ShieldOff className="w-3.5 h-3.5" />
                    Suspender
                  </button>
                )}
                {company.estadoSaas === 'SUSPENDIDA' && (
                  <button
                    onClick={() => onUpdateEstadoSaas(company.id, 'ACTIVA')}
                    className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg font-semibold"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Reactivar
                  </button>
                )}

                {editingLimitId === company.id ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      value={limitDraft}
                      onChange={(e) => setLimitDraft(parseInt(e.target.value) || 0)}
                      className="w-16 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5"
                    />
                    <button
                      onClick={() => saveLimitEditor(company.id)}
                      className="bg-slate-800 hover:bg-slate-900 text-white px-2.5 py-1.5 rounded-lg font-semibold"
                    >
                      Guardar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => openLimitEditor(company)}
                    className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg font-semibold"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Editar Límite
                  </button>
                )}

                <button
                  onClick={() => openPayments(company)}
                  className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1.5 rounded-lg font-semibold"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  Ver Pagos
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {paymentsCompany && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-lg w-full p-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2.5">
              <h4 className="font-bold text-slate-800">Historial de Pagos — {paymentsCompany.nombreComercial}</h4>
              <button onClick={() => setPaymentsCompanyId(null)} className="p-1.5 rounded-full hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <form onSubmit={(e) => handleAddPaymentSubmit(e, paymentsCompany)} className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
              <input
                type="date"
                value={newPaymentFecha}
                onChange={(e) => setNewPaymentFecha(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
              />
              <input
                type="number"
                placeholder="Monto"
                value={newPaymentMonto || ''}
                onChange={(e) => setNewPaymentMonto(parseFloat(e.target.value) || 0)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
              />
              <button
                type="submit"
                className="flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 rounded-lg font-semibold"
              >
                <Plus className="w-3.5 h-3.5" />
                Registrar
              </button>
              <input
                type="text"
                placeholder="Notas (opcional)"
                value={newPaymentNotas}
                onChange={(e) => setNewPaymentNotas(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 sm:col-span-3"
              />
              <div className="sm:col-span-3 grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                <div>
                  <label className="block text-slate-500 text-[10px] font-semibold mb-1">Monto Mensual (opcional)</label>
                  <input
                    type="number"
                    value={newPaymentMontoMensual}
                    onChange={(e) => setNewPaymentMontoMensual(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                  />
                </div>
                <div>
                  <label className="block text-slate-500 text-[10px] font-semibold mb-1">Próximo Vencimiento (opcional)</label>
                  <input
                    type="date"
                    value={newPaymentVencimiento}
                    onChange={(e) => setNewPaymentVencimiento(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5"
                  />
                </div>
              </div>
            </form>

            <div className="space-y-1.5">
              {paymentsForCompany.length === 0 && (
                <p className="text-slate-500 text-center py-4">Sin pagos registrados todavía.</p>
              )}
              {paymentsForCompany.map(p => (
                <div key={p.id} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-lg">
                  <div>
                    <span className="font-semibold text-slate-800 block">₡{p.monto}</span>
                    <span className="text-[10px] text-slate-500">{p.fecha}{p.notas ? ` · ${p.notas}` : ''}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Paso 5: Verificar**

`npm run lint` y `npm run build` limpios. Con permiso para reiniciar el servidor: probar manualmente con `curl` la secuencia completa de una empresa de prueba real — `POST /api/companies` (crear con `estadoSaas: 'PENDIENTE'`) → `POST /api/companies/:id/estado-saas` (`ACTIVA`) → `POST /api/companies/:id/estado-saas` (`SUSPENDIDA`) → confirmar en cada paso con `GET /api/companies` que el estado persiste. Confirmar por inspección del bundle que "Administración SaaS", "Aprobar", "Suspender" y "Ver Pagos" aparecen en el JS generado. Documentar como limitación que no se pudo verificar visualmente que la pestaña solo aparece para `idCompania === 7` (sin navegador disponible) — se confirma por lectura de código que la condición está en los 3 puntos (sidebar escritorio, drawer móvil, render del panel).

- [ ] **Paso 6: Commit**

```bash
git add src/App.tsx src/components/SaasAdminPanel.tsx
git commit -m "Add SaaS admin panel for company approval, user limits, and payment history"
```
