# Adjuntos en los correos: PDF de factura, XML de Hacienda y documento del paciente

## Contexto

Se pidió "corregir" que los correos no adjuntaran el PDF. Al revisarlo resultó que **no es una corrección sino funcionalidad que nunca existió**. Tres huecos verificados en el código actual:

1. **`sendMail` no soporta adjuntos.** La interfaz `OutgoingEmail` (`server/mailer.ts`) solo tiene `to`, `subject`, `html` y `text`; la llamada a `transporter.sendMail` no pasa `attachments`.
2. **No hay ninguna librería de PDF** en `package.json`.
3. **El XML firmado se descarta.** En `POST /api/facturas` y en la anulación, `xmlFirmado` es una constante local que se manda a Hacienda y se pierde. Las columnas `facturas.xml_firmado` y `facturas.respuesta_hacienda` existen desde el esquema original pero están **100% NULL** en las 7 facturas de la base (ya lo había señalado la auditoría del 6-ago).

Un dato a favor: `consultarEstadoHacienda()` (`server/haciendaApi.ts:112`) **ya devuelve** `respuestaXmlBase64` — el XML de aceptación de Hacienda. Hoy se ignora, pero no hay que ir a buscarlo.

## Decisión de diseño: motor de PDF

El usuario eligió renderizar el HTML real (fidelidad visual) en vez de dibujar el documento a mano con una librería tipo `pdfkit`.

El riesgo era la memoria: el servidor tiene **8 GB con ~0,5 GB libres** y corre otras dos apps en PM2 (`erp-corporativo`, `pos-elrotech`); Puppeteer descarga Chromium (~300 MB) y mantiene un navegador vivo consumiendo 200-400 MB.

**Solución adoptada: Chrome headless por línea de comandos (`--print-to-pdf`), sin ninguna dependencia npm.** Se probó en este mismo servidor:

- PDF válido (`%PDF-`, 43 KB) en **3,8 s**
- La RAM libre **subió** de 0,5 GB a 0,9 GB tras la ejecución: Chrome arranca, escribe y termina, sin dejar proceso vivo

Da la misma fidelidad que Puppeteer (es el mismo motor) sin el paquete de 300 MB ni el navegador persistente. Chrome y Edge ya están instalados en el equipo.

Salvaguardas:

- **Ruta del binario en `.env`** (`CHROME_PATH`), nunca embebida en el código — coherente con la regla del proyecto de que la configuración del entorno vive en `.env`. Si la variable falta, no se rompe el envío: se manda el correo sin adjunto y se registra el motivo.
- **Perfil aislado** (`--user-data-dir` en una carpeta temporal propia) para no tocar el perfil real de Chrome del usuario ni abrir ventanas.
- **Generación serializada** con un mutex simple: dos solicitudes simultáneas no multiplican la memoria.
- **Degradación elegante**: si la generación falla o tarda de más (timeout), el correo sale igual sin el adjunto. Nunca se pierde la notificación por un fallo del PDF.

## Alcance

### 1. Adjuntos en `sendMail`

`OutgoingEmail` gana `attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>`, que se pasan tal cual a nodemailer.

### 2. Módulo nuevo `server/pdf.ts`

`generarPdfDesdeHtml(html: string): Promise<Buffer | null>` — escribe el HTML a un archivo temporal, invoca Chrome headless, lee el PDF y limpia. Devuelve `null` (nunca lanza) si no se puede generar, para que quien lo llame decida seguir sin adjunto.

### 3. Persistir el XML firmado y la respuesta de Hacienda

- Al firmar (creación de factura y nota de crédito): guardar `xml_firmado`.
- En `POST /api/facturas/:id/estado`: guardar `respuesta_hacienda` con el `respuestaXmlBase64` que ya devuelve la consulta.

Sin esto no hay nada que adjuntar: son las dos columnas que la auditoría reportó siempre nulas.

### 4. Adjuntos por tipo de correo

| Correo | Adjuntos |
|---|---|
| Factura (`POST /api/facturas/:id/reenviar-correo`) | **Siempre el PDF**, sea simulada o real. Si además fue aceptada por Hacienda: **los 3** — PDF, XML firmado y XML de aceptación. |
| Consulta (`POST /api/notifications/send`, tipo `CONSULTA`) | PDF con el plan y las recomendaciones para el paciente. |
| Cita (confirmación/cancelación/modificación) | Sin adjunto (no cambia). |

Los XML solo se adjuntan si existen en la base: una factura simulada nunca los tendrá, y el correo sale con el PDF solo. La lógica es "adjunta lo que exista", no "exige que existan".

### 5. Documento del paciente (plantilla nueva)

Orientado al paciente, no al expediente: motivo de la consulta, plan alimentario o de terapia según el tipo, indicaciones, recomendaciones y próximos pasos. **Deja fuera** los datos técnicos internos (pliegues cutáneos, índices de laboratorio, SOAP clínico), que son para el profesional.

## Verificación

Prueba en vivo con `eliecer.rojas9` (empresa ELRONUTRI, SMTP activo), reutilizando el paciente, la cita, la consulta de fisioterapia y la factura de la prueba anterior:

1. Correo de consulta → llega con el PDF del plan adjunto.
2. Correo de factura simulada → llega con el PDF, sin XML (correcto: no se envió a Hacienda).
3. Verificar que `xml_firmado` se persiste al firmar.
4. Confirmar la degradación elegante: con `CHROME_PATH` inválido el correo debe salir igual, sin adjunto.

## Fuera de alcance

- Enviar la factura por correo automáticamente al emitirla (hoy es una acción manual; no se cambia ese comportamiento).
- Firmar facturas simuladas para poder adjuntarles XML: una factura en modo prueba no se firma por diseño, y adjuntarle un XML sugeriría que es un comprobante válido.
