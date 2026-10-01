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
- `consultarEstadoHacienda` distingue `no_encontrado` (solo un 404: Hacienda no tiene esa clave) de `error` (no se pudo saber, incluido cualquier otro 4xx/5xx o un 200 ilegible). De `no_encontrado` depende anular sin Nota de Crédito, así que falla cerrado. El `ind-estado: "error"` propio de Hacienda es un estado final y se reporta como `rechazado`.
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

- **Solo PRODUCCIÓN.** Los comprobantes de SANDBOX son pruebas sin efecto fiscal y ya no se suman al D-104 ni al D-101.
- **D-104: solo facturas que existen ante Hacienda.** Las facturas anuladas localmente no se declaran. Cuentan las ACEPTADAS y las ANULADAS que tienen una Nota de Crédito que las referencia (`SQL_FACTURA_DECLARABLE`): esas sí existen ante Hacienda, y su NC resta aparte en su propio período. Una ANULADA sin NC nunca fue válida y declararla sería declarar una venta inexistente. El POS hizo la misma corrección (commit `7f71540`).
- **D-101: mismo criterio de facturas, y resta las Notas de Crédito aceptadas.** Antes las ignoraba, así que una NC parcial nunca rebajaba el ingreso. Además, anular en enero una factura de diciembre la sacaba del año ya cerrado. El reporte trae `cantidadNotasCredito`, opcional en el tipo porque los cierres guardados antes no lo tienen.
- **D-101: compras sin IVA.** Se deduce `montoTotal − ivaAcreditable`. El IVA acreditable ya se recupera como crédito fiscal en el D-104, así que deducirlo también en la renta lo contaba dos veces. Viene de `src/d104Compras.ts` del POS. Lo que el proveedor cobra sin IVA propio sigue siendo deducible (commit `8eaf5d2` del POS).

## Modo sin BD (memoria)

- `configLocalHacienda()` crea la configuración local si no existe. Antes facturar sin haberla guardado reventaba con `cannot read properties of undefined`.
- **(no viene del POS)** En modo memoria, facturar ahora descuenta existencias como en la BD. Antes no lo hacía, y anular o acreditar las "reponía" de más.

## Cambios de contrato de la API

| Endpoint | Cambio |
|---|---|
| `POST /api/facturas/:id/anular` | Responde `{ factura, notaCredito }`, con `notaCredito: null` si no se emitió NC. **403** si no es Administrador. **409** si: la factura está ENVIADA o Hacienda la procesa; tiene Notas de Débito vigentes; una nota suya tiene envío incierto; ya hay otra operación en curso sobre ella; o es de PRODUCCIÓN y la empresa está en otro ambiente. **503** si no se pudo confirmar con Hacienda. **502** con `notaCredito` si Hacienda no recibió la NC (y la factura **no** se anula). |
| `POST /api/facturas/:id/nota-credito` | **403** si no es Administrador. **400** con `modoPrueba: true` (pestaña con la pantalla vieja). Solo sobre ACEPTADA (400 si no). **409** por envío incierto, operación en curso o ambiente distinto. **502** con `notaCredito` si Hacienda no la recibió. `mensajeError` anota el saldo a favor si lo acreditado supera lo que quedaba por cobrar. |
| `POST /api/facturas/:id/nota-debito` | Igual que la anterior, sin la restricción de rol. Cantidades > 0 y medio de pago de catálogo (400 si no). |
| `POST /api/facturas` | Cantidades > 0 y `condicionVenta`/`medioPago` de catálogo (400 si no). **409** si la misma consulta se está facturando en otra solicitud. |
| `POST /api/facturas/:id/estado` | Devuelve también `mensajeError`. **400** para SIMULADA, PRUEBAS_LOCAL o un comprobante de otro ambiente. **502** si Hacienda (consulta o login) no responde. |
| `POST /api/cxp/importar-xml` | **409** si la factura del proveedor ya está registrada. Devuelve `avisoCreditoFiscal` cuando la compra no da crédito (tiquete o factura a otra cédula). |
| `GET` / `POST /api/hacienda-config` | `ultimoConsecutivo`, `ultimoConsecutivoNc`, `ultimoConsecutivoNd` (también sin configuración guardada). El `POST` completo es solo para Administrador (403 si no). |
| `POST /api/hacienda/firmar` | Solo Administrador. |
| `GET /api/reportes/d104` y `/d101` | Solo comprobantes de PRODUCCIÓN. D-101: `cantidadNotasCredito` y `comprasCxP` sin IVA. |
| `POST /api/reportes/d104/cerrar` y `/d101/cerrar` | **409** con `pendientes` si hay comprobantes de PRODUCCIÓN sin resolver en el período; se cierra igual con `confirmarPendientes: true`. |

Después de anular o de emitir una Nota, la interfaz vuelve a cargar facturas, CxC y servicios (`recargarFacturacion` en `App.tsx`) en vez de imitar las reglas del servidor. La recarga ocurre también cuando la operación falla, porque la Nota fallida queda registrada.

## Qué no se aplicó y por qué

| Del POS | Motivo |
|---|---|
| `<InformacionReferencia>` **antes** de `<DetalleServicio>` en NC/ND | **Es un error del POS.** El XSD oficial v4.4 (`atv.hacienda.go.cr/ATV/ComprobanteElectronico/docs/esquemas/2024/v4.4/NotaCreditoElectronica_V4.4.xsd`) define el orden `… DetalleServicio, OtrosCargos, ResumenFactura, InformacionReferencia, Otros, Signature`. Aquí ya estaba bien y se dejó así. Hay que corregirlo en el POS: sus NC/ND nunca se probaron de punta a punta. |
| Importar Notas de Crédito/Débito **de proveedor** a la CxP | Funcionalidad nueva, no un fix. Por ahora se explica al usuario que la ajuste a mano. |
| Worker en segundo plano con reintentos | Aquí el envío es síncrono, con sondeo corto. Se adoptó el principio que motivó el fix del POS (consultar antes que reenviar), no el worker. |
| Correo automático al aceptarse una factura o NC | Funcionalidad; aquí el correo se envía con "Reenviar". |
| Sucursal/terminal configurables, facturación recurrente, exoneración Zona Franca, pago dividido, 10 % de servicio, modo offline | Funcionalidades o reglas propias de restaurante. |

## Revisión antes de unir a `main` (2026-10-01)

Se pasó la rama por la revisión de gstack (`/review`): seis especialistas (pruebas, mantenibilidad, seguridad, rendimiento, diseño, simplificación), un *red team* y una revisión adversarial. Codex no está instalado, así que la adversarial corrió en un subagente de Claude. Salieron 52 hallazgos. Se verificó cada uno contra el código y la BD antes de tocar nada.

**Corregidos sin preguntar** (mecánicos):
- **Esquema y datos:**
  - `<Razon>` se recorta a 180 caracteres, el `maxLength` del XSD.
  - El tope del consecutivo baja a 2 147 483 647, el máximo de las columnas `INT`.
  - `condicionVenta` y `medioPago` se validan y se escapan en el XML firmado.
  - Las cantidades deben ser > 0.
- **Concurrencia en la importación:** el chequeo de duplicado usa `FOR UPDATE`. En REPEATABLE READ una lectura normal no veía la compra que otra importación acababa de confirmar.
- **Consulta a Hacienda:**
  - Falla cerrado: solo un 404 es "no lo tiene".
  - El "error" propio de Hacienda es final.
  - El sondeo tiene un plazo total de ~12 s; antes podía llegar a ~88 s.
  - `/estado` responde 502 si falla el login del IdP.
  - `/anular` y `/estado` comparten la misma conversión de respuesta a estado.
- **Notas:**
  - Repetir un servicio en varias líneas ya no salta el tope de la NC parcial.
  - Una pestaña vieja con "modo prueba" recibe 400 en vez de transmitir de verdad.
  - La anulación es condicional (`estado <> 'ANULADA'`) y repone existencias con `moverStockPorNota`.
  - El stock ya no se recorta a 0, para que el kardex cuadre.
  - Al guardar una nota ya transmitida, un `rollback` fallido ya no impide registrarla.
- **Rendimiento:**
  - `GET /api/facturas` ya no envía `xml_firmado` ni `respuesta_hacienda`.
  - Los reportes leen solo las columnas que usan.
  - El `EXISTS` de facturas declarables se acota por empresa.
- **Importación:** el código comercial solo une artículos con el mismo CABYS (es el SKU interno del proveedor, que se repite entre proveedores), y nombre y código se recortan una sola vez para las dos rutas.
- **Interfaz:**
  - El texto de anulación dice exactamente lo que va a pasar (ERROR, factura ya acreditada completa, conjunciones bien puestas), y al terminar avisa si hubo NC.
  - Los avisos de una nota aceptada se muestran antes del "aceptado" verde.
  - El modal acota lo tecleado a lo disponible, muestra cuando ya no queda nada y tiene etiquetas accesibles.
  - Subir la numeración pide confirmación y muestra el valor actual como texto.
- **Pruebas:**
  - `server/haciendaApi.test.ts`, nuevo, con `fetch` simulado.
  - Notas de Crédito y Débito y los respaldos del parser.
  - Zona horaria fija (`Asia/Tokyo`) en `vitest.config.ts`: en una máquina en Costa Rica la prueba de la clave pasaba incluso con el error viejo.

**Decididos por el usuario (aplicados):**
1. **Envío incierto.** Si la conexión se corta *durante* el envío, se consulta a Hacienda por la clave antes de dar el comprobante por fallido.
   - Si no se puede saber, queda en ERROR con el prefijo `Envío incierto:`.
   - Mientras una nota esté así, no se emiten otras ni se anula su factura.
   - El 502 ya no invita a reintentar.
   - Si una nota ENVIADA termina RECHAZADA, se avisa que sus efectos ya aplicados hay que revertirlos a mano.
2. **Una operación a la vez por factura.** Un candado en memoria (`unaOperacionALaVez`) cubre `/anular`, `/nota-credito` y `/nota-debito`, y otro cubre facturar una misma consulta. El servidor es un solo proceso pm2. La prueba con dos anulaciones simultáneas transmite una sola NC.
3. **Notas de Crédito solo para Administrador:** una NC "parcial" por el 100% equivale a anular.
4. **Ambiente.**
   - Los reportes fiscales cuentan solo PRODUCCIÓN.
   - Las Notas y la consulta de estado usan el ambiente en que se emitió la factura.
   - Una factura de SANDBOX, estando ya en otro ambiente, se anula solo en el sistema.
   - Una de PRODUCCIÓN no se anula fuera de PRODUCCIÓN.
5. **No se anula una factura con Notas de Débito vigentes:** esas notas seguirían válidas ante Hacienda mientras el sistema anula la CxC. Todavía no hay Notas de Crédito sobre Notas de Débito.
6. **Crédito fiscal solo de una Factura Electrónica a nombre de la empresa.** Un tiquete, o una factura a otra cédula, entra con `ivaAcreditable = 0` y un aviso. Su IVA queda en el costo, que el D-101 deduce completo.
7. **Configuración de Hacienda solo para Administrador:** credenciales, certificado, ambiente y numeración. `/api/hacienda/firmar` tampoco lo usa ninguna pantalla; queda solo para Administrador.
8. **Saldo a favor.** Una NC mayor que el saldo de una cuenta, o sobre una ya pagada, anota "Saldo a favor del paciente: ₡X" en la nota en vez de perder ese monto. Se conserva al verificarla.
9. **Cierre con pendientes.** Cerrar el D-104 o el D-101 con comprobantes de PRODUCCIÓN sin resolver (ENVIADA/ERROR/FIRMADA) muestra la lista y pide una segunda confirmación.

**Descartado con evidencia:**
- *"Las CxP manuales viejas quedan mal en el D-101."* No hay datos afectados: `cuentas_pagar` tiene 0 filas en producción.

**Pendiente (decidido dejar para después):**
10. **Guardar el comprobante antes de transmitirlo** (estado "enviando") y reconciliar al arrancar. Hoy, si pm2 reinicia durante los segundos de envío y sondeo, se puede perder el registro local de un comprobante que Hacienda aceptó.
11. **Pruebas de rutas completas.** Hay que separar `server.ts` en una fábrica `createApp()` para poder importarlo, y subir el arnés de punta a punta al repositorio.
12. **Simplificaciones opcionales:**
    - helpers para el bloque emisor, el tipo de receptor y la creación de CxC;
    - `construirReporteD101` con un objeto en vez de 9 parámetros;
    - `extraerDetalleMensajeHacienda` con DOMParser;
    - quitar los envoltorios `hoyISO`.

Además: decidir si se elimina `/api/hacienda/firmar`, y confirmar en SANDBOX que Hacienda responde 404 a una clave que no tiene.

## Verificación

- **`tsc --noEmit`** limpio.
- **56 pruebas unitarias** (`npx vitest run`), 40 nuevas:
  - `server/haciendaFactura.test.ts`:
    - hora de Costa Rica, clave y fecha el mismo día;
    - `<MedioPago>` en contado y en crédito;
    - Notas: `FechaEmisionIR` tal cual, `InformacionReferencia` después del resumen, `<Razon>` de 180, escape de códigos.
  - `server/haciendaApi.test.ts`:
    - 404 vs. resto de respuestas;
    - el "error" de Hacienda;
    - detalle del rechazo, sondeo y su plazo;
    - `X-Error-Cause` y URL de sandbox.
  - `server/xmlProveedorParser.test.ts`:
    - IVA con varios impuestos y descuento, exoneración;
    - conversión de USD y bloqueo sin tipo de cambio;
    - XML inválido, Nota de Crédito de proveedor;
    - respaldos cuando faltan nodos.
- **Recorrido de punta a punta: 71 verificaciones, todas pasan** (64 en la primera versión, ampliado tras la revisión).
  - **Montaje:** `server.ts` real en modo memoria (sin MySQL, puerto aparte). Un Hacienda falso dentro del mismo proceso responde al IdP, la recepción y la consulta, y simula envíos cortados antes y después de llegar y Hacienda caída. Un `.p12` autofirmado de prueba hace que la firma XAdES corra de verdad.
  - **Permisos:** Profesional sin acceso a anular, emitir NC ni configurar Hacienda.
  - **Ambiente:** factura de SANDBOX anulada en local al pasar a PRODUCCIÓN.
  - **Factura y Notas:**
    - factura a crédito aceptada; NC parcial, con su tope incluso repitiendo líneas;
    - ND, también sobre una CxC ya pagada; ND con cantidad negativa y "modo prueba" rechazadas;
    - Nota no recibida que no aplica nada; saldo a favor.
  - **Anulación:**
    - bloqueada con ND vigentes;
    - dos simultáneas: una sola NC transmitida, por lo pendiente;
    - local de SIMULADA, de ERROR que Hacienda no tiene y de RECHAZADA;
    - bloqueo de ENVIADA; liberación de la consulta.
  - **Envíos cortados:**
    - Hacienda no lo tiene → ERROR;
    - sí lo aceptó → ACEPTADA;
    - Hacienda caída → envío incierto, que bloquea notas hasta verificarlo;
    - nota ENVIADA luego RECHAZADA con aviso;
    - `/estado` nunca reenvía.
  - **Reportes:** totales de D-104 y D-101 sin SANDBOX ni anuladas sin NC; cierre con pendientes.
  - **CxP:**
    - importación de facturas reales (a otra cédula: sin crédito fiscal) y del duplicado;
    - compra a mano; D-101 sin IVA.
  - **Numeración:** corrección del consecutivo y tope `INT`.
  - El arnés quedó fuera del repositorio (carpeta temporal).
- **SQL contra MySQL real.** Las consultas nuevas del D-104 y el D-101 se corrieron contra la BD real, **solo lectura**.

**Sin verificar todavía:** la aceptación real de Hacienda. El siguiente paso recomendado es, en **SANDBOX** con las credenciales de la empresa, emitir una factura de contado y una a crédito, una NC parcial, una ND y una anulación, y confirmar que Hacienda acepta las cinco. Es también la primera prueba real de la URL de sandbox corregida.
