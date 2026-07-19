# Firmador XAdES-EPES propio para Hacienda Costa Rica

## Contexto

Control-Clinico necesita, eventualmente, emitir facturas electrónicas válidas ante el Ministerio de Hacienda de Costa Rica. El esquema de base de datos (`ConsultorioDB_schema.sql`) ya tiene diseñada la tabla `compania_hacienda_config` (con `certificado_p12_enc`, `certificado_password_enc`, `password_atv_enc`, cifrados) y la tabla `facturas` (con columna `xml_firmado`), pero no existe ningún código de aplicación para facturación electrónica — ni UI, ni endpoints, ni librería de firma.

El usuario pidió explícitamente "crea tu propio firmador" en vez de depender de un servicio externo — se confirmó que `CRLibre/API_Hacienda` (el proyecto que mencionó originalmente) es software de auto-hospedaje obligatorio (AGPL v3), no un servicio público hospedado; nunca hubo tal servicio al que conectarse.

Durante la investigación se encontraron dos proyectos hermanos del usuario con intentos previos de resolver esto:
- `VERSION ERP/Aplicación-Pos` (`src/xmlGenerator.ts`): la firma y la respuesta de Hacienda están **100% simuladas** (el `DigestValue`/`SignatureValue` son texto concatenado en base64, no criptografía real; la respuesta "ACEPTADO" de Hacienda se fabrica localmente sin llamar a ninguna API). Este hallazgo ya se le reportó al usuario como un riesgo real si ese sistema se usa para facturar de verdad.
- `POS--RESTAURANTE` (`src/haciendaSigner.ts` + `server.ts`): una implementación **real y verificada**, con firma XAdES-EPES genuina (node-forge + Web Crypto de Node + `xadesjs`), identificador de política de firma verificado contra el PDF oficial de Hacienda "ANEXOS Y ESTRUCTURAS_V4.4" (página 86/98), y un flujo OAuth2 + envío a la API de recepción de Hacienda con URLs confirmadas contra el portal ATV real.

Este spec cubre **portar `haciendaSigner.ts`** de `POS--RESTAURANTE` a Control-Clinico, adaptado a su propio modelo de datos y su propio patrón de cifrado ya existente (`server/crypto.ts`, el mismo AES-256-GCM usado para las contraseñas SMTP). No se porta el flujo OAuth2/envío a Hacienda ni el generador de XML de factura — eso es una ampliación de alcance futura, explícitamente fuera de este trabajo.

## Decisión de alcance (confirmada con el usuario)

**Solo el módulo firmador**: dado un XML ya armado (por quien sea, en el futuro) + el certificado `.p12` y PIN de la empresa (ya guardados, cifrados), producir el XML firmado en formato XAdES-EPES. Incluye:
1. Guardar/actualizar la configuración de Hacienda de una empresa (ambiente, credenciales ATV, certificado `.p12` + PIN) — cifrado igual que SMTP.
2. Un botón "Probar Configuración" que lee el certificado guardado y muestra sujeto/emisor/vigencia, sin firmar nada — para confirmar que el archivo y el PIN son correctos antes de depender de ellos.
3. Un endpoint que, dado un XML crudo, lo firma con la configuración guardada de la empresa y devuelve el XML firmado.

Fuera de alcance: UI de creación de facturas, generador del XML de factura según el esquema v4.4 de Hacienda, autenticación OAuth2 contra el IDP de Hacienda, envío a la API de recepción de Hacienda, y todo lo relacionado con notas de crédito/débito o tiquetes electrónicos.

## Modelo de datos

La tabla `compania_hacienda_config` ya existe (creada por `ConsultorioDB_schema.sql`, con columnas en `snake_case`, a diferencia de las tablas que crea `server.ts` directamente):

```sql
CREATE TABLE `compania_hacienda_config` (
  `id_compania` int(11) NOT NULL PRIMARY KEY,
  `ambiente` enum('SANDBOX','PRODUCCION') NOT NULL DEFAULT 'SANDBOX',
  `usuario_atv` varchar(50) DEFAULT NULL,
  `password_atv_enc` varbinary(512) DEFAULT NULL,
  `certificado_p12_enc` longblob DEFAULT NULL,
  `certificado_password_enc` varbinary(512) DEFAULT NULL,
  `certificado_nombre_archivo` varchar(255) DEFAULT NULL,
  `certificado_vence_en` date DEFAULT NULL,
  ...
)
```

`id_compania` es la propia llave primaria (una fila por empresa, sin `id` autoincremental separado) — a diferencia de `compania_smtp_config`. Las consultas de este módulo usan directamente los nombres `snake_case` reales de esta tabla (no se usa `normalizeRow`, que tiene sus propios matices ya conocidos) — el mapeo a `camelCase` para el frontend se hace explícitamente en el handler del endpoint, igual que en el resto de `server.ts`.

Tipo nuevo en `src/data/mockData.ts` (forma que ve el frontend, nunca incluye los campos cifrados reales):

```typescript
export interface HaciendaConfig {
  idCompania: number;
  ambiente: 'SANDBOX' | 'PRODUCCION';
  usuarioAtv: string;
  tienePasswordAtv: boolean;
  tieneCertificado: boolean;
  certificadoNombreArchivo: string | null;
  certificadoVenceEn: string | null; // YYYY-MM-DD
}

export type HaciendaConfigInput = {
  idCompania: number;
  ambiente: 'SANDBOX' | 'PRODUCCION';
  usuarioAtv: string;
  passwordAtv?: string; // solo cuando el usuario escribe una nueva
  certificadoP12Base64?: string; // solo cuando el usuario sube un nuevo archivo .p12
  certificadoPin?: string; // solo cuando el usuario escribe un nuevo PIN
};
```

## Módulo del firmador (`server/haciendaSigner.ts`)

Se porta el archivo `haciendaSigner.ts` de `POS--RESTAURANTE` prácticamente verbatim — es lógica criptográfica ya verificada, no hay razón para reescribirla. Exporta:

- `verificarLlaveP12(p12Base64: string, pin: string): InfoCertificadoP12` — abre el `.p12` con el PIN dado, sin firmar nada; devuelve `{ sujeto, emisor, numeroSerie, validoDesde, validoHasta, expirado }`. Usada por "Probar Configuración".
- `firmarXadesEpes(xml: string, p12Base64: string, pin: string): Promise<string>` — firma el XML dado con XAdES-EPES (política de firma oficial de Hacienda v4.4, RSA-SHA256, referencia enveloped) y devuelve el XML firmado completo.

Ambas funciones lanzan errores con mensajes en español ya pensados para mostrarse al usuario (ej. "No se pudo leer la llave criptográfica (.p12): verifique el archivo y el PIN...") — se preservan tal cual.

**Regla de seguridad explícita** (ya documentada en el archivo original, se mantiene): este módulo es de importación exclusiva del servidor — nunca se importa desde componentes de React (usa `node:crypto` y `node-forge`, que no existen en el navegador). El PIN, la contraseña ATV y el contenido del `.p12` nunca deben aparecer en un `console.log`, mensaje de error, o respuesta HTTP.

## Dependencias nuevas

Mismas versiones ya probadas en `POS--RESTAURANTE`:
- `node-forge` ^1.4.0 (+ `@types/node-forge` ^1.3.14 como devDependency)
- `xadesjs` ^2.6.7
- `@xmldom/xmldom` ^0.8.13
- `xpath` ^0.0.34
- `xml-core` ^1.2.5

## Backend (`server.ts`)

Reutiliza `encryptSecret`/`decryptSecret` de `server/crypto.ts` (el mismo AES-256-GCM ya usado para las contraseñas SMTP) para cifrar `password_atv_enc`, `certificado_p12_enc` (el `.p12` completo, en base64, cifrado) y `certificado_password_enc` (el PIN). Mismo patrón "cifrar solo si se manda un valor nuevo, si no conservar el existente" que ya usa `/api/smtp-configs`.

- `GET /api/hacienda-config/:idCompania` — devuelve la fila sin ninguno de los tres campos cifrados; en su lugar, `tienePasswordAtv`/`tieneCertificado` (booleanos) y los campos no sensibles (`ambiente`, `usuarioAtv`, `certificadoNombreArchivo`, `certificadoVenceEn`).
- `POST /api/hacienda-config` — guarda/actualiza (upsert por `id_compania`, ya que es la llave primaria). Antes de guardar, resuelve el **par efectivo** certificado+PIN: si el request trae `certificadoP12Base64` úsalo, si no descifra el `certificado_p12_enc` ya guardado; igual para `certificadoPin` contra `certificado_password_enc`. Si con ese par efectivo hay al menos un certificado (nuevo o preexistente) para verificar, llama a `verificarLlaveP12(p12Efectivo, pinEfectivo)` — si falla (certificado o PIN inválido, incluida la combinación "PIN nuevo contra certificado viejo" o viceversa), responde `400` con el mensaje de error de `verificarLlaveP12` y **no guarda nada** (ni el campo que sí era válido). Si no hay certificado efectivo (primera vez que se configura, sin subir archivo todavía), se guarda el resto de los campos sin intentar verificar. Si la verificación pasa, guarda cifrado y actualiza `certificado_vence_en` con la fecha real de vencimiento del certificado (no depende de que el usuario la escriba a mano).
- `POST /api/hacienda/verificar-certificado` — recibe `{ idCompania }`, descifra el certificado/PIN guardados, llama a `verificarLlaveP12`, devuelve `{ sujeto, emisor, numeroSerie, validoDesde, validoHasta, expirado }`. `400` si no hay certificado guardado para esa empresa.
- `POST /api/hacienda/firmar` — recibe `{ idCompania, xml }`, descifra el certificado/PIN guardados, llama a `firmarXadesEpes`, devuelve `{ xmlFirmado }`. `400` si no hay certificado guardado.

## Frontend (`CompanySettings.tsx`)

Nueva sección "Firma Digital Hacienda (Facturación Electrónica)", mismo estilo que la sección SMTP ya existente:
- Selector Ambiente (Sandbox/Producción).
- Usuario ATV (texto) + Contraseña ATV (mismo patrón que la contraseña SMTP: nunca se prellena, solo se envía si el usuario escribe una nueva).
- Certificado `.p12`: `<input type="file" accept=".p12,.pfx">`, leído con `FileReader.readAsArrayBuffer` y convertido a base64 en el navegador antes de enviarlo — nunca se prellena con el archivo ya guardado (solo se muestra el nombre de archivo actual). PIN del certificado con el mismo patrón "dejar en blanco para mantener".
- Muestra `certificadoNombreArchivo` y `certificadoVenceEn` (con aviso visual si `expirado`/próximo a vencer, usando el resultado de la última verificación).
- Botón "Probar Configuración": llama a `/api/hacienda/verificar-certificado` y muestra sujeto/emisor/vigencia, o el mensaje de error tal cual lo devuelve el servidor.

## Verificación

Sin framework de pruebas automatizadas (igual que el resto del proyecto). Dos niveles:

1. **Automatizada (durante la implementación)**: se genera un certificado `.p12` autofirmado sintético (con `node-forge`, desechable) para probar mecánicamente que guardar/cifrar/descifrar/leer el certificado y llamar a `firmarXadesEpes` funciona de principio a fin, sin tocar nunca el certificado real del usuario ni sus credenciales ATV reales.
2. **Manual, con el certificado real (responsabilidad del usuario)**: el usuario sube su `certificado.p12` real y su PIN a través de la UI, y usa "Probar Configuración" para confirmar que se lee correctamente. Confirmar que Hacienda *acepta* una factura firmada con este módulo requiere el flujo completo de envío (fuera de alcance) — no se puede validar en esta tarea.

## Fuera de alcance (YAGNI)

- Generador de XML de factura/nota de crédito/tiquete según el esquema v4.4.
- Autenticación OAuth2 y envío a la API de recepción de Hacienda.
- Notas de crédito/débito, tiquetes electrónicos.
- Recordatorio automático de vencimiento del certificado (se muestra el estado, no se envía notificación).
