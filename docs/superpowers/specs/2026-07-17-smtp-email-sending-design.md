# Envío real de notificaciones SMTP (correo con reporte HTML)

## Contexto

La app ya tiene una UI completa de configuración SMTP por empresa (Gmail / Outlook / Otro) y una tabla `notification_logs`, pero no existe ningún envío real de correo:

- `AgendaCalendar.tsx` construye el asunto/cuerpo de la notificación de cita y solo inserta un registro en `notification_logs` (comentario explícito: `// --- Simulated SMTP Notification Triggers ---`).
- `ReportView.tsx` (`sendClientEmail`) solo cambia un estado local por 3 segundos con `setTimeout`, sin llamar a ningún endpoint.
- No hay ninguna librería de correo (`nodemailer` u otra) en `package.json`.
- La contraseña SMTP (`smtpPasswordCifrado`) se guarda en texto plano pese a que el esquema SQL la documenta como `VARBINARY(512)` con comentario "AES-256-GCM".

Este spec cubre implementar el envío real, con una plantilla HTML de marca (logo/colores/nombre de la empresa) que varía según el `perfilCompania` (Nutrición vs Fisioterapia) y según el tipo de notificación (Cita vs Consulta con su reporte).

## Decisiones (confirmadas con el usuario)

1. **Cifrado de contraseña SMTP:** AES-256-GCM con una clave de servidor nueva (`ENCRYPTION_KEY` en `.env`). La contraseña nunca se devuelve al cliente tras guardarse.
2. **Disparo del correo de consulta:** botón manual "Enviar a Correo" ya existente en `ReportView.tsx` — se conecta al envío real, no se agrega envío automático al guardar.
3. **Disparo del correo de cita:** se mantiene automático al guardar la cita (comportamiento actual de `AgendaCalendar.tsx`), reemplazando la simulación por el envío real.

## Arquitectura

Todo el envío ocurre en el backend. El navegador nunca ve la contraseña SMTP ni construye el HTML final del correo.

### Módulos nuevos (`server/`)

- **`server/crypto.ts`**
  - `encryptSecret(plain: string): string` / `decryptSecret(cipher: string): string`.
  - Formato de almacenamiento: `iv:authTag:ciphertext` (hex, separado por `:`).
  - Lee `ENCRYPTION_KEY` de `process.env` (64 caracteres hex = 32 bytes). Si falta o tiene formato inválido, lanza un error claro al primer uso (mismo patrón que la validación de `GEMINI_API_KEY` que existía antes).
  - Si el valor a descifrar no tiene el formato `iv:authTag:cipher` esperado (p. ej. los placeholders `••••••••••••••••` de los datos semilla), lanza un error legible: *"Configura una contraseña SMTP real desde Ajustes de Empresa."*

- **`server/mailer.ts`**
  - `sendMail(config: CompaniaSmtpConfig, message: { to: string; subject: string; html: string; text: string }): Promise<void>`.
  - Crea el transporter de `nodemailer` según `smtpSeguridad`:
    - `SSL` → `secure: true`.
    - `TLS` → `secure: false, requireTLS: true`.
    - `NINGUNA` → `secure: false, ignoreTLS: true`.
  - Usa `smtpUsuario` + contraseña descifrada como `auth`.

- **`server/emailTemplates.ts`**
  - `emailShell({ company, title, contentHtml }): string` — envoltorio HTML basado en tablas (compatible con clientes de correo), con encabezado (logo + nombre comercial sobre `colorSidebar`/`colorPrimario`) y pie de página institucional.
  - `renderCitaEmail({ company, patient, cita, tipoNotif }): { subject: string; html: string; text: string }` — mismo contenido que hoy arma `AgendaCalendar.tsx` (confirmación/cancelación/modificación), ahora con el shell de marca.
  - `renderConsultaEmail({ company, patient, consultation }): { subject: string; html: string; text: string }` — reporte clínico completo, ramificado por `consultation.tipo`:
    - `Nutrición`: antropometría (peso, IMC, grasa corporal, masa muscular, etc.) + plan alimentario (desayuno/meriendas/almuerzo/cena/indicaciones).
    - `Fisioterapia`: zona/escala de dolor, factores agravantes/atenuantes, examen físico (postura, palpación, ROM, Daniels, pruebas especiales), prescripción (agentes físicos, terapia manual, ejercicio terapéutico) y nota SOAP.
  - El `text` (versión texto plano) de cada plantilla es el mismo formato breve que se guarda hoy en `notification_logs.cuerpo`, para que el historial de la Agenda siga mostrando texto legible (no HTML crudo).

### Cambio de esquema requerido

`notification_logs.idCita` es `NOT NULL` hoy, pero una notificación de tipo `CONSULTA` no siempre tiene una cita asociada (puede ser una consulta sin cita previa agendada). Se necesita:
- `ALTER TABLE notification_logs MODIFY COLUMN idCita INT NULL` (via el mismo patrón de `ADD COLUMN IF NOT EXISTS` / ALTER ya usado en `createTables()`).
- `ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS idConsulta INT NULL` — para asociar el log al reporte de consulta enviado.

Para notificaciones `CITA`, `idConsulta` queda `NULL`; para `CONSULTA`, `idCita` queda `NULL` y `idConsulta` se llena.

### Endpoint nuevo en `server.ts`

`POST /api/notifications/send`

Body:
```ts
{ tipo: 'CITA', idCompania: number, idCita: number, tipoNotif: 'CONFIRMACION'|'CANCELACION'|'MODIFICACION', patient: Patient, cita: Cita }
// o
{ tipo: 'CONSULTA', idCompania: number, idPaciente: number, patient: Patient, consultation: Consultation }
```

Flujo:
1. Buscar la empresa y la config SMTP de `idCompania` (MySQL o fallback local, igual que el resto de endpoints).
2. Si no hay config o `activo` es falso → `400` con mensaje claro.
3. Descifrar contraseña, renderizar plantilla según `tipo`, enviar con `sendMail`.
4. Insertar el registro resultante en `notification_logs` (mismo insert que ya existe para esa tabla).
5. Responder con el log creado (`200`) o con `{ error }` (`400`/`500`) si falla cualquier paso.

No se inserta un log si el envío falla (evita registrar como "enviado" algo que no salió).

### Cambios en configuración SMTP (`server.ts`)

- `POST /api/smtp-configs`: si `smtpPassword` viene no vacío en el body, se cifra con `encryptSecret` antes de guardar; si viene vacío/ausente y ya existe una fila para esa empresa, se conserva el valor cifrado anterior (no se sobreescribe).
- `GET /api/smtp-configs`: no devuelve `smtpPasswordCifrado`; en su lugar agrega `tieneContrasena: boolean`.

## Cambios en el frontend

- **`src/data/mockData.ts`**: agregar `'CONSULTA'` a `NotificationLog['tipo']`; cambiar `idCita: number` a `idCita?: number | null` y agregar `idConsulta?: number | null`; agregar `tieneContrasena?: boolean` a `CompaniaSmtpConfig` (solo lectura, viene del servidor).
- **`CompanySettings.tsx`**: el campo de contraseña SMTP ya no se prellena con el valor guardado (el servidor no lo envía). Se muestra vacío con placeholder que indica si ya hay una contraseña configurada (`tieneContrasena`) y una nota "dejar en blanco para mantener la actual". Solo se incluye `smtpPassword` en el payload si el usuario escribió algo.
- **`AgendaCalendar.tsx`**: el bloque `// --- Simulated SMTP Notification Triggers ---` pasa a llamar `POST /api/notifications/send` (tipo `CITA`) en vez de construir el log localmente. Si la petición falla, la cita ya guardada se mantiene pero se avisa con una alerta de que la notificación no se envió. Se agrega `'CONSULTA'` al mapeo de colores de badges en el historial (para cuando aparezcan ahí logs de consulta).
- **`ReportView.tsx`**: `sendClientEmail` pasa a ser async y llama `POST /api/notifications/send` (tipo `CONSULTA`). Muestra estado de carga mientras envía y un `alert` con el error si falla. Recibe un nuevo callback `onNotificationSent` para que `App.tsx` actualice la lista de logs en memoria.
- **`App.tsx`**: `handleAddNotificationLog` deja de hacer `POST /api/notification-logs` (el log ya se persiste dentro de `/api/notifications/send`); ahora solo actualiza el estado local `logs` con el registro que devuelve el endpoint de envío. Se pasa `onNotificationSent` a `ReportView` reutilizando el mismo handler.

## Dependencias nuevas

- `nodemailer` (dependency) + `@types/nodemailer` (devDependency).

## Variables de entorno nuevas

- `.env.example` y `.env`: `ENCRYPTION_KEY` — clave hex de 32 bytes para cifrar contraseñas SMTP. Se documenta cómo generarla (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).

## Fuera de alcance

- Botón de "probar conexión SMTP".
- Recordatorios automáticos (`RECORDATORIO` sigue sin dispararse).
- Adjuntos PDF en el correo.
- Reintentos automáticos de envío fallido.

## Testing

- Verificación manual (no hay suite de tests automatizados en el proyecto): guardar una config SMTP real (Gmail con App Password, o Outlook), agendar/modificar/cancelar una cita y confirmar la llegada del correo con el formato de marca correcto; abrir un reporte de consulta de Nutrición y de Fisioterapia y confirmar que cada plantilla muestra los campos correctos y que el correo llega. Confirmar que una config con `activo: false` no envía nada, y que una config sin credenciales reales falla con un mensaje claro en vez de romper el guardado de la cita.
