# Fixes del POS aplicados: facturación electrónica, anulación, CxC y CxP

Fecha: 2026-09-30

## Contexto

El POS (`D:\pos-restaurante\POS--RESTAURANTE`) factura electrónicamente ante Hacienda en producción desde julio, y fue acumulando correcciones a partir de rechazos reales. Se pidió revisar todos esos bugs y fixes y aplicarlos aquí en cuatro áreas: facturación, anulación, CxC y CxP.

Se revisó el historial del POS hasta el commit `f301263` (2026-09-30) y sus specs en `docs/superpowers/specs/`. Cada fix se comparó contra el código de Control-Clinico, y solo se aplicó donde el mismo problema existía aquí. Al comparar aparecieron además dos bugs que el POS no tenía resueltos; se marcan como **(no viene del POS)**.

Archivos tocados:

- **Servidor:** `server.ts`, `server/haciendaApi.ts`, `server/haciendaFactura.ts`, `server/xmlProveedorParser.ts`, más `src/utils/fechaCR.ts` (nuevo, compartido con el navegador).
- **Interfaz:** `src/App.tsx`, `FacturacionManager.tsx`, `AjusteFacturaModal.tsx`, `CxCManager.tsx`, `CxPManager.tsx`, `CompanySettings.tsx`, `ReportesFiscales.tsx`, `src/data/mockData.ts`.
- **Pruebas nuevas:** `server/haciendaFactura.test.ts`, `server/xmlProveedorParser.test.ts`.

No hay cambios de esquema ni migraciones.

## Facturación electrónica

### `FechaEmision` salía 6 horas en el futuro

`fechaEmisionCR()` tomaba la hora **UTC** y le pegaba `-06:00` sin restarle las 6 horas. Se verificó en la BD. La factura 17 tiene `creadaEn = 2026-08-06T05:03:56Z`, pero se guardó `fechaEmision = 2026-08-06T05:03:56-06:00`. La hora real en Costa Rica era 23:03 del día 5.

Consecuencias:

- **Hacienda rechaza el comprobante.** Lo hace con el error -53 ("la hora indicada en la emisión del archivo XML no coincide con la hora oficial"), visto en producción en el POS (commit `2cc424c`).
- **Clave y fecha en días distintos.** La clave tomaba el DDMMAA de la hora local del servidor. Entre las 6 p.m. y la medianoche, la clave y `<FechaEmision>` quedaban en días diferentes.
- **El D-104 se corría de mes.** Filtra por `fechaEmision LIKE 'AAAA-MM%'`, así que lo facturado después de las 6 p.m. del último día caía en el mes siguiente.

**Corrección:** `src/utils/fechaCR.ts` (`fechaHoraCR`, `fechaCR`, `sumarDiasCR`) resta las 6 horas, igual que `costaRicaTimestamp` del POS. `fechaEmisionCR` y `generarClaveNumerica` sacan la fecha del mismo instante en hora de Costa Rica.

Las 7 facturas que ya existen son SIMULADAS y conservan su fecha vieja. En una Nota, `<FechaEmisionIR>` ahora se copia tal cual de la factura guardada en vez de recalcularse. Así coincide al carácter con el comprobante referenciado, sin importar con qué formato se emitió.

### URL del sandbox equivocada

Aquí estaba `https://api.comprobanteselectronicos.go.cr/recepcion-sandbox/v1`, una URL inferida de una fuente comunitaria. La real es `https://api-sandbox.comprobanteselectronicos.go.cr/recepcion/v1`, confirmada por el POS en el portal ATV (commit `632d0c5`).

### Llamadas a Hacienda sin límite de tiempo

Ahora todo `fetch` a Hacienda lleva `AbortSignal.timeout(20000)`, el mismo valor que el POS: el IdP, la recepción, la consulta y el buscador CABYS. Antes, un Hacienda que aceptaba la conexión y no respondía dejaba colgada la solicitud de facturar.

### Sondeo tras el envío; después solo consultar, nunca reenviar

Antes, una factura enviada quedaba en ENVIADA hasta que alguien pulsara "Verificar estado". El MensajeHacienda (la respuesta de Hacienda) no se guardaba al emitir.

`transmitirComprobante()` es ahora el único camino de firma, envío y sondeo, compartido por facturas y notas. Igual que `procesarFacturaHacienda` del POS, consulta 4 veces con 2 s entre cada una. Casi siempre el comprobante queda ACEPTADO o RECHAZADO en la misma operación, con `respuesta_hacienda` guardada.

Si no resuelve, queda ENVIADA, y desde ahí **solo se consulta** (`POST /api/facturas/:id/estado`), nunca se reenvía. Es la lección del POS (commit `923e509`): Hacienda rechaza el reenvío de una clave que ya tiene, y el POS reintentó así durante 7 horas una factura que Hacienda había aceptado desde el primer envío.

Otros ajustes del cliente HTTP:

- Header `Authorization: Bearer` (con mayúscula, como el POS).
- Cuando Hacienda rechaza la recepción, el mensaje incluye el header `X-Error-Cause`, que es donde Hacienda explica el rechazo, a menudo con el cuerpo vacío.
- `consultarEstadoHacienda` distingue `no_encontrado` (404/400: Hacienda no tiene esa clave) de `error` (no se pudo saber).
- `extraerDetalleMensajeHacienda` saca el `<DetalleMensaje>` del rechazo, como `extraerDetalleMensajeHacienda` del POS.

### `POST /api/facturas/:id/estado`

| Antes | Ahora |
|---|---|
| Una factura ANULADA que Hacienda reportaba "aceptado" volvía a ACEPTADA. | ANULADA se conserva: la anulación ya ocurrió. |
| Sobre una SIMULADA o en PRUEBAS_LOCAL intentaba llamar a Hacienda. | Responde 400 sin llamar a nada. |
| Solo se ofrecía para ENVIADA. | También para ERROR: si el envío se cortó pero Hacienda sí lo recibió, lo reconcilia a ENVIADA o ACEPTADA. |
| Un rechazo no decía por qué. | Guarda el detalle de Hacienda en `mensajeError`. |
| Un error de red respondía 200 sin cambios. | Responde 502 "no se pudo consultar". |

Si una Nota que se dio por fallida resulta estar en Hacienda, se avisa que sus efectos no se aplicaron (ver *Notas*).

### `<MedioPago>` en ventas a crédito

`<MedioPago>` ya no se emite cuando `CondicionVenta = 02`. Es opcional en el XSD v4.4 (`minOccurs=0`), y en una venta a crédito declarar "01 Efectivo" por el total es falso. El POS factura así en producción.

### Corrección manual de numeración

Viene del POS (commit `9006619`). Si la empresa ya facturó con otro sistema bajo la misma sucursal y terminal (`001`/`00001`), Hacienda rechaza con "el documento ya fue emitido".

`POST /api/hacienda-config` acepta `ultimoConsecutivo`, `ultimoConsecutivoNc` y `ultimoConsecutivoNd`:

- Solo un **Administrador** puede usarlos.
- **Solo pueden subir** (`GREATEST`): bajarlos volvería a emitir números que Hacienda ya tiene.

El `GET` devuelve los tres contadores. En Configuración de Empresa hay un bloque "Corrección de numeración", visible solo para Administrador.

## Anulación

Sigue la regla del spec del POS `2026-09-01-anulacion-nota-credito-design.md`. Anular hace tres cosas independientes:

- Siempre repone las existencias.
- Siempre anula la CxC pendiente.
- Solo si Hacienda **aceptó** la factura, emite la Nota de Crédito código `01`.

La condición es positiva a propósito. Una NC sobre un comprobante que Hacienda nunca aceptó la haría rechazar también.

| Estado de la factura | Antes | Ahora |
|---|---|---|
| ACEPTADA | NC + efectos | NC por lo **pendiente de acreditar** + efectos |
| ENVIADA | NC (Hacienda podía terminar rechazando la factura y con ella la NC) | **409**: hay que verificar el estado primero |
| ERROR | No se podía anular | Se **consulta a Hacienda**. Si la tiene aceptada, va por NC; si la rechazó o no la tiene, anulación local; si no responde, 503; si la está procesando, 409. |
| SIMULADA / RECHAZADA / FIRMADA | No se podía anular, y la consulta quedaba bloqueada para siempre | Anulación local sin NC |

Además:

- **Solo Administrador.** El servidor responde 403 a un Profesional y la interfaz oculta el botón. El POS también exige autorización de administrador.
- **Libera la consulta.** `facturas.id_consulta` es UNIQUE. Mientras la factura anulada lo conservaba, esa consulta no se podía volver a facturar nunca. Ahora la anulación lo pone en NULL, y el flujo del POS ("anule y facture de nuevo") funciona.
- **La factura guarda su motivo** en `motivoAnulacion`, y la lista lo muestra.
- **(no viene del POS) La NC cubre solo lo pendiente.** Antes acreditaba la factura completa aunque ya hubiera Notas de Crédito parciales. Eso superaba el comprobante original ante Hacienda y reponía dos veces las mismas existencias. Si las parciales ya la acreditaron completa, se anula sin emitir otra NC. El POS tiene el mismo hueco.
- **La pantalla dice qué va a pasar:** si se emite NC o no y por qué, si se reponen existencias, si se anula la CxC y si se libera la consulta.

## Notas de Crédito parcial y Notas de Débito

- **Solo sobre facturas ACEPTADAS.** Antes también sobre ENVIADAS. Una Nota referencia la factura por su clave; si Hacienda no la aceptó o termina rechazándola, rechaza también la Nota.
- **Siempre se transmiten de verdad**, sin "modo prueba" (spec del POS `2026-09-02-notas-debito-credito-parcial-design.md`). Antes se podía emitir una Nota SIMULADA sobre una factura real, y el sistema y Hacienda quedaban diciendo cosas distintas. Se quitó la casilla en `AjusteFacturaModal`, y el servidor exige configuración real con `exigirConfigHacienda`, validada **antes** de reservar el consecutivo.
- **Los efectos se aplican solo si Hacienda recibió la Nota** (ENVIADA o ACEPTADA), en la misma transacción que la guarda. Antes se reponía o descontaba stock y se movía la CxC antes de saber nada, así que una Nota fallida dejaba esos cambios sin comprobante que los respaldara. Una Nota no recibida o rechazada queda guardada como registro del intento (su consecutivo ya se usó), y el endpoint responde **502** con el motivo de Hacienda. Se puede volver a intentar.
- **Red de seguridad:** si aplicar los efectos falla después de que Hacienda aceptó la Nota, la Nota se guarda igual, marcada en `mensajeError`. Perder el registro local de un documento que Hacienda tiene sería peor que quedarse sin el ajuste.
- **El tope de la NC parcial** (no acreditar más de lo facturado) suma las líneas repetidas del mismo servicio e ignora las Notas en ERROR o RECHAZADA. El modal muestra, por línea, lo facturado y lo disponible.

## CxC

- **La NC parcial ahora rebaja la cuenta por cobrar.** Antes no la tocaba, y la deuda bajaba ante Hacienda pero no en el sistema. Baja `montoTotal` y `saldoPendiente` sin pasar de 0, y si el saldo llega a 0 la cuenta queda PAGADA. Solo aplica a cuentas PENDIENTES: lo acreditado sobre una cuenta ya pagada es una devolución de dinero que se hace fuera del sistema.
- **La Nota de Débito en una venta a crédito** suma a la cuenta aunque ya esté PAGADA, y la reabre a PENDIENTE. Antes solo sumaba si seguía pendiente, así que el cargo se perdía. Si la factura no tenía CxC, se le crea una. Es el comportamiento del POS.
- **Fechas en hora de Costa Rica:** emisión, vencimiento y fecha de los abonos (`fechaCR`, `sumarDiasCR`). En pantalla, "vencida" se calcula contra el día de Costa Rica. Antes, después de las 6 p.m. una cuenta que vencía hoy ya aparecía VENCIDA.

## CxP

### Lectura del XML del proveedor (`server/xmlProveedorParser.ts`)

Todo viene del POS, commit `fc600d9` y anteriores.

- **IVA real por línea.**
  - Se suman solo los `<Impuesto>` de IVA (códigos 01, 07 y 08) menos lo exonerado.
  - La base es la de después del descuento (`<SubTotal>`).
  - Antes se tomaba el **primer** `<Impuesto>`. En bebidas ese es el específico o el selectivo, así que el crédito fiscal y la tarifa de los artículos creados salían equivocados (4,5 %, 11,66 %...).
  - Verificado con dos facturas reales de proveedor: la suma coincide exacta con su `<TotalImpuesto>` (₡22 037,60 y ₡19 735,30).
- **Moneda extranjera.** Se convierte a colones con el `<TipoCambio>` del propio comprobante. Si no trae uno válido, se bloquea la importación en vez de tratar dólares como colones.
- **XML inválido.** Un archivo mal formado o truncado se rechaza con "no es un XML válido". Antes podía importarse a medias o fallar con un mensaje engañoso.
- **Notas de Crédito y Débito de proveedor.** Se explica que todavía no se importan, en vez de "no es una Factura".

### Importación (`POST /api/cxp/importar-xml`)

- **Sin duplicados.** La misma factura (mismo proveedor y mismo consecutivo) responde **409** en vez de sumar otra vez stock, deuda e IVA acreditable. La fila del proveedor se bloquea (`FOR UPDATE`) para que dos importaciones simultáneas no pasen ambas el chequeo.
- **Una sola transacción** para el proveedor nuevo, el inventario, la cuenta por pagar y el pago de contado. Antes el inventario se confirmaba aparte y un fallo posterior dejaba el stock sumado sin respaldo; era un hueco anotado en el spec de la Fase 4.
- **Artículos por código de barras, no por CABYS.** El CABYS es la categoría tributaria y no es único por producto: dos medicamentos con el mismo CABYS terminaban fusionados en un solo artículo. Ahora se busca por `<CodigoComercial>` y, si la línea no trae código, por CABYS más la misma descripción. Dos líneas del mismo artículo nuevo en un mismo XML se acumulan en uno.
- **Costo y tarifa de los artículos.** El costo unitario es el efectivo (base después del descuento ÷ cantidad), y los artículos nuevos llevan la tarifa real de IVA.
- **Longitud del nombre.** Los nombres se recortan a 150 caracteres, el límite de `servicios.nombre` y `cuentas_pagar_lineas.nombre`.

### Compras registradas a mano (`POST /api/cxp`)

- En "Compra de Artículos", el monto a pagar es ahora **costo + IVA acreditable**: lo que realmente se le debe al proveedor, igual que una compra importada. Antes la deuda quedaba sin el IVA. La pantalla muestra "Subtotal + IVA = Total a pagar" y pide el costo unitario **sin IVA**.
- En "Gasto", el monto se rotula "con IVA", y se rechaza un IVA acreditable mayor que el total.
- Las fechas de registro, vencimiento y abonos usan hora de Costa Rica.

## Reportes fiscales

- **D-104: solo facturas que existen ante Hacienda.** Las facturas anuladas localmente no se declaran. Cuentan las ACEPTADAS y las ANULADAS que tienen una Nota de Crédito que las referencia (`SQL_FACTURA_DECLARABLE`): esas sí existen ante Hacienda, y su NC resta aparte en su propio período. Una ANULADA sin NC nunca fue válida y declararla sería declarar una venta inexistente. El POS hizo la misma corrección (commit `7f71540`).
- **D-101: mismo criterio de facturas, y resta las Notas de Crédito aceptadas.** Antes las ignoraba, así que una NC parcial nunca rebajaba el ingreso. Además, anular en enero una factura de diciembre la sacaba del año ya cerrado. El reporte trae `cantidadNotasCredito`, opcional en el tipo porque los cierres guardados antes no lo tienen.
- **D-101: compras sin IVA.** Se deduce `montoTotal − ivaAcreditable`. El IVA acreditable ya se recupera como crédito fiscal en el D-104, así que deducirlo también en la renta lo contaba dos veces. Viene de `src/d104Compras.ts` del POS. Lo que el proveedor cobra sin IVA propio sigue siendo deducible (commit `8eaf5d2` del POS).

## Modo sin BD (memoria)

- `configLocalHacienda()` crea la configuración local si no existe. Antes facturar sin haberla guardado reventaba con `cannot read properties of undefined`.
- **(no viene del POS)** En modo memoria, facturar ahora descuenta existencias como en la BD. Antes no lo hacía, y anular o acreditar las "reponía" de más.

## Cambios de contrato de la API

| Endpoint | Cambio |
|---|---|
| `POST /api/facturas/:id/anular` | Responde `{ factura, notaCredito }`, con `notaCredito: null` si no se emitió NC. **403** si no es Administrador, **409** si la factura está ENVIADA o Hacienda la procesa, **503** si no se pudo confirmar con Hacienda, **502** con `notaCredito` si Hacienda no recibió la NC (y la factura **no** se anula). |
| `POST /api/facturas/:id/nota-credito` y `/nota-debito` | Ignoran `modoPrueba`. Solo sobre ACEPTADA (400 si no). **502** con `notaCredito` o `notaDebito` si Hacienda no la recibió. |
| `POST /api/facturas/:id/estado` | Devuelve también `mensajeError`. 400 para SIMULADA o PRUEBAS_LOCAL, 502 si Hacienda no responde. |
| `POST /api/cxp/importar-xml` | **409** si la factura del proveedor ya está registrada. |
| `GET` / `POST /api/hacienda-config` | `ultimoConsecutivo`, `ultimoConsecutivoNc`, `ultimoConsecutivoNd`. |
| `GET /api/reportes/d101` | `cantidadNotasCredito`; `comprasCxP` ahora sin IVA. |

Después de anular o de emitir una Nota, la interfaz vuelve a cargar facturas, CxC y servicios (`recargarFacturacion` en `App.tsx`) en vez de imitar las reglas del servidor. La recarga ocurre también cuando la operación falla, porque la Nota fallida queda registrada.

## Qué no se aplicó y por qué

| Del POS | Motivo |
|---|---|
| `<InformacionReferencia>` **antes** de `<DetalleServicio>` en NC/ND | **Es un error del POS.** El XSD oficial v4.4 (`atv.hacienda.go.cr/ATV/ComprobanteElectronico/docs/esquemas/2024/v4.4/NotaCreditoElectronica_V4.4.xsd`) define el orden `… DetalleServicio, OtrosCargos, ResumenFactura, InformacionReferencia, Otros, Signature`. Aquí ya estaba bien y se dejó así. Hay que corregirlo en el POS: sus NC/ND nunca se probaron de punta a punta. |
| Importar Notas de Crédito/Débito **de proveedor** a la CxP | Funcionalidad nueva, no un fix. Por ahora se explica al usuario que la ajuste a mano. |
| Worker en segundo plano con reintentos | Aquí el envío es síncrono, con sondeo corto. Se adoptó el principio que motivó el fix del POS (consultar antes que reenviar), no el worker. |
| Correo automático al aceptarse una factura o NC | Funcionalidad; aquí el correo se envía con "Reenviar". |
| Sucursal/terminal configurables, facturación recurrente, exoneración Zona Franca, pago dividido, 10 % de servicio, modo offline | Funcionalidades o reglas propias de restaurante. |

## Verificación

- **`tsc --noEmit`** limpio.
- **31 pruebas unitarias** (`npx vitest run`), 15 nuevas:
  - `server/haciendaFactura.test.ts`: hora de Costa Rica, clave y fecha el mismo día, `<MedioPago>` en contado y en crédito.
  - `server/xmlProveedorParser.test.ts`:
    - IVA con varios impuestos y descuento, exoneración.
    - Conversión de USD y bloqueo sin tipo de cambio.
    - XML truncado o que no es XML, Nota de Crédito de proveedor.
- **Recorrido de punta a punta: 64 verificaciones, todas pasan.**
  - **Montaje:** `server.ts` real en modo memoria (sin MySQL, puerto aparte). Un Hacienda falso dentro del mismo proceso responde al IdP, la recepción y la consulta. Un `.p12` autofirmado de prueba hace que la firma XAdES corra de verdad.
  - **Factura y Notas:** factura a crédito aceptada; NC parcial; ND, también sobre una CxC ya pagada; Nota no recibida que no aplica nada.
  - **Anulación:** con NC por lo pendiente, local de SIMULADA, de ERROR que Hacienda no tiene y de RECHAZADA; bloqueo de ENVIADA; liberación de la consulta.
  - **Consulta de estado:** reconciliación de un ERROR que Hacienda sí aceptó; verificación de que `/estado` no reenvía.
  - **Reportes:** totales de D-104 y D-101.
  - **CxP:** importación de las dos facturas reales y del duplicado; compra a mano.
  - **Numeración:** corrección del consecutivo.
  - El arnés quedó fuera del repositorio (carpeta temporal).
- **SQL contra MySQL real.** Las consultas nuevas del D-104 y el D-101 se corrieron contra la BD real, **solo lectura**.

**Sin verificar todavía:** la aceptación real de Hacienda. El siguiente paso recomendado es, en **SANDBOX** con las credenciales de la empresa, emitir una factura de contado y una a crédito, una NC parcial, una ND y una anulación, y confirmar que Hacienda acepta las cinco. Es también la primera prueba real de la URL de sandbox corregida.
