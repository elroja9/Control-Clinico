# Panel de Administración SaaS (Empresa 7) — Diseño

## Contexto

Control-Clínico es multiempresa: cualquier persona puede registrar una nueva
empresa/clínica desde `LoginView.tsx` (pestaña "Registrar Empresa"), y esa
empresa queda operativa de inmediato (auto-login, sin aprobación de nadie).
No existe ningún control de pagos, ningún límite de usuarios por empresa, y
ninguna pantalla para que una empresa agregue colaboradores adicionales
(solo se crea un único usuario Administrador al registrarse).

La empresa con `id_compania = 7` ("ELRONUTRI") es la empresa del dueño de la
plataforma. Este diseño la convierte en la operadora/administradora SaaS de
todas las demás empresas (tenants).

## Objetivo

1. Toda empresa nueva registrada queda **pendiente de aprobación** y no puede
   iniciar sesión hasta que la empresa 7 la apruebe.
2. La empresa 7 puede **suspender/reactivar** cualquier otra empresa (p. ej.
   por atraso de pago); mientras está suspendida, ningún usuario de esa
   empresa puede iniciar sesión.
3. La empresa 7 controla un **límite máximo de usuarios** por empresa.
4. La empresa 7 lleva un **historial completo de pagos** por empresa.
5. Aprobar/suspender/reactivar envía un **correo de notificación** automático
   (reutilizando el SMTP ya configurado) al administrador de esa empresa.
6. Como no existe hoy ninguna pantalla para crear colaboradores dentro de una
   empresa, se agrega una pestaña "Usuarios" a `CompanySettings.tsx` donde
   cada empresa gestiona su propio staff, respetando su límite máximo.
7. Todas las empresas que ya existen en el sistema hoy quedan aprobadas
   automáticamente (no se interrumpe a nadie); solo las registraciones
   futuras pasan por aprobación.

## Fuera de alcance

- Pasarela de pago / cobro automático — el registro de pagos es manual,
  hecho por el administrador de la empresa 7 desde el panel.
- Suspensión automática por fecha de vencimiento vencida — la suspensión es
  siempre una acción manual del administrador de la empresa 7.
- Cambiar el mecanismo de acceso al panel (fijo por `idCompania === 7`, sin
  rol `SUPERADMIN` nuevo).
- Hashing de contraseñas con bcrypt para los usuarios nuevos — el patrón
  existente en `POST /api/users` ya guarda la contraseña en texto plano en
  `contrasena`/`password_hash`; este trabajo no lo cambia (es una
  inconsistencia preexistente, no introducida por esta función).

## Modelo de datos

### Tabla `companias` — 4 columnas nuevas

En `ConsultorioDB_schema.sql` (definición de tabla) y en `server.ts`
`createTables()` (vía `ALTER TABLE ADD COLUMN IF NOT EXISTS`, el mismo patrón
idempotente ya usado para las demás columnas de compatibilidad):

```sql
ALTER TABLE companias ADD COLUMN IF NOT EXISTS estado_saas ENUM('PENDIENTE','ACTIVA','SUSPENDIDA') NOT NULL DEFAULT 'ACTIVA';
ALTER TABLE companias ADD COLUMN IF NOT EXISTS max_usuarios INT NOT NULL DEFAULT 5;
ALTER TABLE companias ADD COLUMN IF NOT EXISTS monto_mensual DECIMAL(10,2) NULL;
ALTER TABLE companias ADD COLUMN IF NOT EXISTS proximo_vencimiento DATE NULL;
```

El default `'ACTIVA'` en `estado_saas` es lo que grandfathera automáticamente
a todas las empresas ya existentes (incluida la 7) sin backfill adicional —
esta migración corre una sola vez por columna faltante y nunca vuelve a
tocar filas existentes en arranques posteriores (mismo comportamiento que el
resto de columnas `ADD COLUMN IF NOT EXISTS` del archivo). Las empresas
**nuevas** nunca dependen de ese default: el endpoint de registro siempre
inserta explícitamente `estado_saas = 'PENDIENTE'`.

`src/data/mockData.ts` — `Company` interface, campos nuevos:

```ts
export interface Company {
  // ...campos existentes...
  estadoSaas: 'PENDIENTE' | 'ACTIVA' | 'SUSPENDIDA';
  maxUsuarios: number;
  montoMensual: number | null;
  proximoVencimiento: string | null; // 'YYYY-MM-DD'
}
```

### Tabla nueva `pagos_empresa`

```sql
CREATE TABLE IF NOT EXISTS pagos_empresa (
  id_pago INT AUTO_INCREMENT PRIMARY KEY,
  id_compania INT NOT NULL,
  fecha DATE NOT NULL,
  monto DECIMAL(10,2) NOT NULL,
  notas VARCHAR(255) NULL,
  registrado_por VARCHAR(150) NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_pagos_empresa_compania FOREIGN KEY (id_compania) REFERENCES companias (id_compania) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

`mockData.ts` — nuevo tipo:

```ts
export interface CompanyPayment {
  id: number;
  idCompania: number;
  fecha: string; // 'YYYY-MM-DD'
  monto: number;
  notas: string;
  registradoPor: string;
}
```

Creado en `server.ts` `createTables()` igual que las demás tablas nuevas de
esta app (mismo patrón `CREATE TABLE IF NOT EXISTS`).

### Tabla `usuarios` — campo `activo`

La columna `activo TINYINT(1) NOT NULL DEFAULT 1` ya existe en
`ConsultorioDB_schema.sql` pero no está en el tipo TS `User` ni se
lee/escribe en `server.ts`. Se agrega:

```ts
export interface User {
  // ...campos existentes...
  activo: boolean;
}
```

Y se añade `activo`/`activo` al SELECT/INSERT/UPDATE de `/api/users` en
`server.ts`, con default `true` para usuarios nuevos.

## Backend (`server.ts`)

Todos los endpoints nuevos siguen el patrón dual ya establecido en todo el
archivo: `if (dbConnected && pool) { ...SQL... } else { ...array local... }`.

### 1. `POST /api/companies` (existente, se extiende)

El INSERT y el UPDATE agregan las 4 columnas nuevas. El **registro** de una
empresa nueva (llamado desde `LoginView.tsx` → `App.tsx`
`handleRegisterCompany`) siempre construye el objeto `Company` con
`estadoSaas: 'PENDIENTE'`, `maxUsuarios: 5` (default razonable, editable
después por la empresa 7), `montoMensual: null`, `proximoVencimiento: null`.

### 2. `POST /api/companies/:id/estado-saas` (nuevo)

Body: `{ estadoSaas: 'ACTIVA' | 'SUSPENDIDA' | 'PENDIENTE' }`.

- Lee primero el `estado_saas` **actual** de la empresa (antes de
  actualizar), para poder distinguir "aprobación" (`PENDIENTE → ACTIVA`) de
  "reactivación" (`SUSPENDIDA → ACTIVA`) al elegir el texto del correo.
- Actualiza `estado_saas` de esa empresa.
- Busca el usuario con `rol = 'Administrador'` de esa empresa (el primero
  encontrado) para obtener su correo.
- Si el nuevo `estadoSaas` es `'ACTIVA'` o `'SUSPENDIDA'` (no se notifica al
  volver a `'PENDIENTE'`, caso que no ocurre desde la UI propuesta), envía
  un correo usando `server/mailer.ts` con la plantilla correspondiente (ver
  sección Correos) — no bloquea la respuesta HTTP si el envío falla (igual
  que el resto de notificaciones ya existentes en la app: se registra el
  error en consola, la operación de negocio ya se guardó).
- Devuelve la compañía actualizada.

### 3. `GET /api/companies/:id/pagos` y `POST /api/companies/:id/pagos` (nuevos)

- `GET`: `SELECT * FROM pagos_empresa WHERE id_compania = ? ORDER BY fecha DESC`.
- `POST` body: `{ fecha, monto, notas, registradoPor }` → INSERT. Si el
  body incluye `montoMensual`/`proximoVencimiento`, también actualiza esas
  dos columnas en `companias` (para que "registrar pago" pueda a la vez
  mover la fecha de próximo vencimiento).

### 4. `POST /api/users` (existente, se extiende)

- INSERT/UPDATE agregan la columna `activo`.
- **Antes de insertar un usuario nuevo** (`!u.id`): cuenta
  `SELECT COUNT(*) FROM usuarios WHERE id_compania = ? AND activo = 1`
  (o el equivalente en `localUsers` en modo memoria) y compara contra
  `maxUsuarios` de esa `companias`. Si ya alcanzó el límite, responde
  `400 { error: 'Límite de usuarios alcanzado (máximo N).' }` y no inserta.
  Esto aplica tanto al registro de una empresa nueva (que crea su primer
  usuario) como a la nueva pantalla "Usuarios" — un límite de 0 bloquearía
  incluso el usuario administrador inicial, pero el default de 5 hace esto
  irrelevante en la práctica.

## Frontend

### 1. `LoginView.tsx`

- `handleRegisterSubmit`: ya no llama `onLogin(newAdminUser, nextCompanyId)`
  tras `onRegisterCompany`. En su lugar, muestra una pantalla/mensaje de
  confirmación: "Tu empresa fue registrada correctamente y está pendiente de
  aprobación. Te contactaremos pronto." con un botón para volver a la
  pantalla de login.
- `handleLoginSubmit`: tras verificar usuario+contraseña, busca la
  `Company` de `foundUser.idCompania` y evalúa `estadoSaas`:
  - `'PENDIENTE'` → `setLoginError('Esta cuenta está pendiente de aprobación. Un administrador se pondrá en contacto pronto.')`, no llama `onLogin`.
  - `'SUSPENDIDA'` → `setLoginError('Esta cuenta se encuentra suspendida. Contacte al administrador de la plataforma.')`, no llama `onLogin`.
  - `'ACTIVA'` (o compañía no encontrada, caso defensivo) → procede como hoy.

### 2. `SaasAdminPanel.tsx` (componente nuevo)

Sigue el mismo patrón de props que `CompanySettings.tsx` (props-in,
callback-out, sin fetch propio — recibe arrays ya cargados por `App.tsx`):

```ts
interface SaasAdminPanelProps {
  companies: Company[];      // todas menos la 7
  users: User[];
  payments: CompanyPayment[];
  onUpdateEstadoSaas: (companyId: number, estado: Company['estadoSaas']) => void;
  onUpdateMaxUsuarios: (companyId: number, maxUsuarios: number) => void;
  onAddPayment: (payment: Omit<CompanyPayment, 'id'>) => void;
}
```

Contenido:
- Tabla de empresas (excluye la 7): nombre comercial, badge de estado
  (Pendiente=ámbar, Activa=verde, Suspendida=rojo), `usuarios activos /
  maxUsuarios`, `proximoVencimiento`, `montoMensual`.
- Por fila: botón **Aprobar** (solo si Pendiente), botón **Suspender**/
  **Reactivar** (según estado actual), botón **Editar límite** (input
  numérico inline), botón **Ver pagos** (abre un panel/modal con la lista
  de `payments` de esa empresa + formulario para registrar uno nuevo:
  fecha, monto, notas).

### 3. `App.tsx`

- Nueva pestaña en el switcher de tabs (junto a `dashboard`/`patients`/...):
  `'saas-admin'`, visible solo cuando
  `currentUser?.idCompania === 7` (mismo lugar donde ya se calcula
  `activeCompany`, según el reporte de exploración).
- Estado nuevo `payments: CompanyPayment[]`, cargado con
  `fetch('/api/companies/.../pagos')` por empresa cuando se abre el panel
  (o cargado todo de una vez si se agrega un endpoint de listado global —
  se deja al criterio del plan de implementación, no es una decisión de
  diseño crítica).
- Handlers nuevos: `handleUpdateEstadoSaas`, `handleUpdateMaxUsuarios`,
  `handleAddPayment`, todos con el mismo patrón fetch + fallback local que
  ya usa `handleRegisterCompany`.
- `handleRegisterCompany`: se agregan los 4 campos nuevos al `Company` que
  construye antes de hacer POST (`estadoSaas: 'PENDIENTE'`, etc.) — en
  realidad este objeto ya lo arma `LoginView.tsx`, así que el cambio real
  está ahí (ver sección `LoginView.tsx` de "Modelo de datos" — se agregan
  esos 4 campos al `newCompany` que construye `handleRegisterSubmit`).

### 4. `CompanySettings.tsx` — nueva sección "Usuarios"

Nueva sección (mismo patrón visual que las de SMTP/Hacienda: bloque con
`h4` de título), visible para cualquier empresa, solo si
`currentUser.rol === 'Administrador'`. Requiere threading de dos props
nuevas: `users: User[]` y `currentUser: User`.

- Lista los usuarios de `currentCompany` (`users.filter(u => u.idCompania === currentCompany.id)`)
  con nombre, usuario, rol, badge activo/inactivo.
- Botón activar/desactivar por fila (toggle `activo`, hace `POST /api/users`
  con el usuario completo y `activo` invertido).
- Formulario "Nuevo colaborador" (nombre, usuario, correo, contraseña, rol
  Administrador/Profesional) — si
  `usuarios_activos_de_esta_empresa >= currentCompany.maxUsuarios`, el botón
  de guardar se deshabilita y se muestra: "Alcanzaste el límite de N
  usuarios de tu plan. Contacta al administrador de la plataforma para
  ampliarlo." (el backend igual valida esto de forma autoritativa, ver
  endpoint `POST /api/users`).

## Correos de notificación

Nueva función en `server/emailTemplates.ts`, `renderAccountStatusEmail(company, estado)`,
que arma un HTML simple (sin la marca del tenant, ya que es un mensaje de la
plataforma hacia el tenant) con tres variantes de texto:

- `'ACTIVA'` (tras estar `PENDIENTE`): "¡Tu empresa fue aprobada! Ya puedes
  iniciar sesión en Control-Clínico."
- `'ACTIVA'` (tras estar `SUSPENDIDA`, i.e. reactivación): "Tu cuenta fue
  reactivada. Ya puedes iniciar sesión normalmente."
- `'SUSPENDIDA'`: "Tu cuenta ha sido suspendida temporalmente. Contacta al
  administrador de la plataforma para más información."

Enviado desde el endpoint `POST /api/companies/:id/estado-saas` usando
`server/mailer.ts` (mismo transporte SMTP ya configurado a nivel de
plataforma/empresa — se usa la configuración SMTP de la empresa 7 como
remitente, ya que es un correo "de la plataforma").

## Casos límite

- Empresa sin usuario `Administrador` (no debería ocurrir dado el flujo de
  registro, pero defensivamente): el endpoint de aprobación/suspensión
  simplemente omite el envío de correo si no encuentra un destinatario, sin
  fallar la operación.
- Login de un usuario de la empresa 7: nunca se bloquea por
  `estado_saas` porque el default la deja `'ACTIVA'` desde la migración
  inicial; no hay lógica especial adicional necesaria.
- Un usuario que ya tenía sesión iniciada cuando su empresa es suspendida:
  no se cierra su sesión activa en el navegador (fuera de alcance) — el
  bloqueo aplica al siguiente intento de login.
