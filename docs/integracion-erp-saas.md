# Integración SaaS → ERP ELROTECH (contrato v1)

Objetivo: las suscripciones de **todos** los SaaS (Control Clínico y POS Restaurante) se facturan
**solo desde el ERP ELROTECH**, con un único consecutivo de Hacienda. Las apps SaaS son la fuente de
verdad de sus suscriptores (alta, cuota, moneda, estado); el ERP es el único emisor de comprobantes.

## Autenticación

- Cada app SaaS usa una **clave de integración** emitida en el ERP (pantalla de administración SaaS → Integraciones).
- Cabecera: `Authorization: Bearer <clave>`. La clave se muestra **una sola vez** al crearla.
- El ERP guarda solo `SHA-256(clave)` en `integracion_api_keys` y la liga a:
  - `companyId` emisor (la empresa del ERP que factura);
  - `origen` (`control-clinico` | `pos-restaurante`);
  - `activo`, `creadoEn`, `ultimoUsoEn`.
- Límite de peticiones por clave, configurable en BD. Una clave revocada responde 401.
- En las apps SaaS, la URL base del ERP y la clave se guardan en BD: la clave **cifrada** (AES-256-GCM, como los demás secretos), nunca en código ni en `.env` de negocio.
- Todas las llamadas van servidor a servidor por HTTPS. Si el ERP usa certificado propio, se confía explícitamente en ese certificado (CA configurable en BD); no se desactiva la verificación TLS de forma global.

Base: `{erpUrl}/api/integraciones/v1`. Todas las respuestas son JSON. Errores: `{ "error": "mensaje en español", "codigo": "CODIGO" }` con HTTP 400, 401, 403, 404, 409, 422 o 429.

## Endpoints del ERP

### `PUT /suscriptores/{idExterno}`

Crea o actualiza un suscriptor. El `origen` sale de la clave, no del cuerpo. `idExterno` es el id de la empresa en la app SaaS.

```json
{
  "tipoIdentificacion": "01|02|03|04",
  "identificacion": "solo dígitos",
  "nombre": "razón social",
  "nombreComercial": "opcional",
  "correo": "facturas@cliente.com",
  "telefono": "opcional",
  "provincia": "1", "canton": "01", "distrito": "01", "otrasSenas": "opcional",
  "codigoActividad": "6 dígitos, opcional",
  "moneda": "CRC|USD",
  "montoMensual": 25000.00,
  "diaFacturacion": 1,
  "activo": true
}
```

- El ERP busca el cliente por `(companyId, identificacion)`; si no existe, lo crea. Lo deja habilitado para crédito y facturación recurrente.
- Guarda la suscripción en `suscripciones_saas`:
  - `companyId`, `origen`, `idExterno` (UNIQUE de los tres), `clientId`;
  - `moneda`, `montoMensual`, `diaFacturacion` (1-28), `activo`;
  - `proximaFacturacion`, `creadoEn`, `actualizadoEn`.
- `activo:false` detiene la facturación futura y no anula nada.
- Respuesta 200: `{ "clientId": 123, "suscripcion": { ... , "proximaFacturacion": "2026-12-01" } }`.

### Facturación automática (dentro del ERP)

- Un worker del ERP emite, el `diaFacturacion` de cada mes, **una factura 01 a crédito** por cada suscripción activa.
- Una línea con el producto de servicio SaaS configurado para el `origen` (CABYS e IVA del producto), por el `montoMensual` en su moneda. En USD se usa el tipo de cambio del día (modelo actual del ERP).
- Crea la cuenta por cobrar y el asiento contable, igual que la facturación recurrente actual del ERP.
- Plazo de crédito configurable en BD.
- La numeración la asigna el servidor, con situación 1.
- Idempotencia: `invoices.referenciaExterna = "{origen}:{idExterno}:{AAAA-MM}"`, UNIQUE por `companyId`. Un reintento nunca duplica.
- Transmisión: la cola y worker de Hacienda existentes del ERP. El correo al cliente sale al quedar aceptada, como ya hace el ERP.

### `POST /suscriptores/{idExterno}/facturas`

Factura manual adicional, por ejemplo meses por adelantado o un cargo de instalación.

```json
{ "referencia": "texto único del lado SaaS", "meses": 1, "descripcion": "opcional", "monto": null }
```

- Idempotente: `referenciaExterna = "{origen}:{idExterno}:manual:{referencia}"`. Si ya existe responde 200 con la misma factura.
- `monto` null → `montoMensual × meses`.
- Respuesta 201 o 200: `{ "factura": FacturaResumen }`.

### `GET /suscriptores/{idExterno}/estado-cuenta`

```json
{
  "suscriptor": { "clientId": 123, "activo": true, "moneda": "CRC", "montoMensual": 25000, "proximaFacturacion": "2026-12-01" },
  "resumen": { "saldoPendiente": 25000, "saldoVencido": 0, "diasMoraMax": 0, "alDia": true, "monedaSaldo": "CRC" },
  "facturas": [ FacturaResumen ]
}
```

`FacturaResumen`:

```json
{
  "id": 1,
  "referenciaExterna": "...",
  "consecutivo": "00100001010000000123",
  "clave": "506...",
  "fechaEmision": "2026-12-01T08:00:00-06:00",
  "moneda": "CRC",
  "total": 25000,
  "saldoPendiente": 25000,
  "fechaVencimiento": "2026-12-31",
  "estadoHacienda": "Pendiente|Enviando|Aceptado|Rechazado|...",
  "pagada": false
}
```

Las facturas van de la más reciente a la más antigua, con un máximo configurable.

### `GET /salud`

Devuelve `{ "ok": true, "origen": "...", "empresa": "nombre" }`. Sirve para el botón **Probar conexión** de las apps SaaS.

## Lado de las apps SaaS (Control Clínico y POS)

- **Configuración** (SaaS admin), guardada en BD: URL del ERP, clave cifrada, sincronización automática sí/no, intervalo de sincronización, y días de mora para suspensión automática (0 = desactivada).
- **Datos de cada suscriptor:** `moneda` (CRC/USD), `montoMensual` y `diaFacturacion`, además de los datos fiscales que ya tienen.
- **Sincronización:**
  - Al aprobar, editar o suspender una empresa, la app llama a `PUT /suscriptores/{id}`.
  - Un job periódico reintenta los pendientes y consulta `estado-cuenta`. Guarda en la app un resumen (saldo, mora, última factura) para mostrarlo en el panel SaaS.
- **Suspensión automática por mora:** solo si está configurada (días > 0) y nunca para la empresa de plataforma. Avisa por correo antes de suspender.
- **Panel SaaS:**
  - estado de la integración y botón **Probar conexión**;
  - por empresa: moneda, cuota, día de facturación, saldo, mora, última factura, y botón **Facturar meses por adelantado**, que llama a `POST .../facturas`.
- **POS:** el botón "Facturar" de la administración SaaS **ya no emite** desde la empresa 1. El registro de pagos queda solo como histórico, o se alimenta desde `estado-cuenta`.

## Seguridad

- Las claves de integración nunca aparecen en logs ni en respuestas, salvo al crearlas.
- El ERP valida que el `idExterno` pertenezca al `origen` de la clave, así una app no puede tocar los suscriptores de otra.
- Los montos y el CABYS los calcula el ERP. La app SaaS solo envía cuota, moneda y meses.
