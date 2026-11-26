# Facturación electrónica (Hacienda v4.4)

Este documento explica cómo Control Clínico emite comprobantes electrónicos, qué se configura y dónde,
y cómo resolver los casos que quedan para revisión manual.

Lo atiende:
- el **administrador de cada clínica**, que configura y usa la facturación;
- el **SaaS admin**, que ajusta los parámetros globales;
- el **equipo técnico**.

El contrato con el ERP para cobrar las suscripciones SaaS está en [integracion-erp-saas.md](integracion-erp-saas.md).

## Resumen

- Cada clínica emite con **su propia cédula, certificado y consecutivos**.
  - La empresa de plataforma (`saas_id_compania_plataforma`) **no emite**; sus suscripciones se facturan desde el ERP ELROTECH.
- **Comprobantes que se emiten:**
  - Factura electrónica (01);
  - Tiquete electrónico (04);
  - Nota de crédito (03), para anulación o crédito parcial;
  - Nota de débito (02).
- **Primero se guarda y después se transmite.** El comprobante se numera, se firma una sola vez y se guarda antes de enviarlo a Hacienda. Así nunca se pierde un comprobante que Hacienda ya recibió.
  - Se hace un intento inmediato.
  - Si Hacienda no responde, el comprobante queda **EN COLA** y lo transmite un proceso en segundo plano.

## Factura o tiquete

Lo decide el servidor, no el navegador:

| Receptor | Comprobante |
|---|---|
| Identificación costarricense válida: física 9 dígitos, jurídica 10, DIMEX 11–12, NITE 10 | Factura 01 |
| Sin identificación, o pasaporte / extranjero (EXT) | Tiquete 04, sin bloque Receptor |
| Venta a crédito (condiciones en `hacienda_condiciones_exigen_receptor`) | Exige Factura con receptor identificado |

**Un pasaporte nunca se envía como DIMEX.**

## Facturar a un tercero

Un paciente puede pedir la factura a nombre de otra persona o empresa, por ejemplo su patrono.

- **En el modal de facturar** se elige "Paciente" o "Tercero".
- **Datos de Hacienda:** al digitar la cédula se consulta Hacienda para traer el nombre y las actividades económicas.
- **Terceros guardados:** se guardan por paciente (tabla `paciente_receptores_factura`) para reutilizarlos. Un extranjero guardado necesita número de pasaporte.
- **Copia del receptor:** el comprobante guarda una copia del receptor (`facturas.receptor_*`).
  - Las notas y anulaciones usan siempre esa copia.
  - En comprobantes antiguos sin copia, se usa el receptor del XML firmado original.
- **Correo:** va al correo del receptor, con copia opcional al paciente. El PDF muestra "Paciente: …".

## Descuentos y medios de pago

- **Descuento por línea**, con código del catálogo (`hacienda_catalogos`, tipo `CODIGO_DESCUENTO`).
  - El código 99 pide "naturaleza del descuento".
  - Los códigos 01–03 (regalías, bonificaciones, IVA cobrado al cliente) están **inactivos**: el sistema no los calcula.
- **Totales del XML:**
  - TotalVenta: bruto.
  - TotalVentaNeta: TotalVenta − TotalDescuentos.
  - TotalImpuesto: suma de los ImpuestoNeto.
  - TotalComprobante: TotalVentaNeta + TotalImpuesto.
- **Medios de pago:**
  - Hasta `hacienda_medios_pago_max` medios de pago, que deben sumar el total (tolerancia `hacienda_medio_pago_tolerancia`).
  - En ventas a crédito no se envía MedioPago.
- **Catálogos:** condición de venta, medios de pago y códigos de descuento se leen de `hacienda_catalogos`. Si Hacienda cambia algo, se corrige en la base de datos, sin tocar código.

## Estados de un comprobante

| Estado | Significado | Qué hacer |
|---|---|---|
| EN COLA (`PENDIENTE`) | Guardado y firmado; se está transmitiendo o reintentando. | Nada: la cola lo resuelve. Se ve el número de intento y el próximo reintento. |
| `ENVIADA` | Hacienda lo recibió y aún no responde. | Nada: se consulta sin límite de veces. Si tarda, aparece "Hacienda aún no responde". |
| `ACEPTADA` | Aceptado. Si la clínica lo tiene activado, se envía el correo automático una sola vez. | — |
| `RECHAZADA` | Hacienda lo rechazó; el motivo se guarda. | Corregir el dato y usar **Reintentar con clave nueva** (Administrador). |
| `ERROR` | Se agotaron los intentos, o se requiere revisión. | Ver el mensaje. **Reintentar envío** reenvía el mismo XML firmado. |
| `ERROR` con "Envío incierto" | Pudo haber llegado a Hacienda y no se pudo confirmar. | **Consultar estado.** No emitir otro comprobante por lo mismo hasta aclararlo. |
| `SIMULADA` | Ambiente PRUEBAS_LOCAL; no sale del servidor. | — |

## Garantías del envío

- **Nunca se envía dos veces el mismo comprobante.**
  - Antes de cada envío se marca, con una operación atómica, que "el envío pudo haber llegado".
  - Desde ese momento solo se consulta por clave. Se reenvía únicamente si Hacienda responde que no lo tiene.
- **Un comprobante lo procesa un solo proceso a la vez:** la cola, "Consultar estado" y "Anular" toman una reserva temporal (`hacienda_procesando_hasta`) antes de escribir.
- **Los estados no retroceden:** un comprobante ACEPTADO o RECHAZADO no vuelve atrás.
- **Efectos de las notas** (inventario, cuenta por cobrar, anulación):
  - se aplican **una sola vez**, cuando Hacienda recibe la nota;
  - si algo falla, la cola los reintenta;
  - mientras una nota tenga efectos pendientes o un envío incierto, se bloquean otras notas o la anulación de ese mismo comprobante.
- **Numeración:** el consecutivo se reserva en la misma transacción que guarda el comprobante, así que no hay saltos ni repetidos. Si MySQL detecta un interbloqueo, la transacción se reintenta (`hacienda_transaccion_reintentos`).
- **Token de Hacienda:** se reutiliza hasta poco antes de vencer (`hacienda_token_margen_seg`). Se descarta si Hacienda responde 401 o si cambia la configuración.

## Configuración por clínica

Se configura en **Configuración → Firma digital Hacienda**:

- **Ambiente:** SANDBOX, PRODUCCION o PRUEBAS_LOCAL.
- **Credenciales:**
  - usuario y contraseña ATV, guardada cifrada;
  - certificado `.p12` y PIN, guardados cifrados.
- **Sucursal (3 dígitos) y terminal (5 dígitos).** Si la clínica también factura desde otro sistema con la misma cédula, **use otra terminal** para que los consecutivos no choquen.
- **Numeración mínima** por tipo de comprobante, o **Ajustar numeración** pegando la última clave (50 dígitos) o el último consecutivo (20) emitido en el otro sistema. Solo sube el contador, nunca lo baja.
- **Correo automático al aceptar:** activado o desactivado.
- **Probar configuración:** valida el certificado y el PIN, y hace un inicio de sesión real en Hacienda. Queda registrado como "configuración verificada".

**Antes de numerar, el sistema exige:**
- correo del emisor;
- actividad económica de 6 dígitos;
- identificación y ubicación del emisor;
- certificado vigente;
- credenciales ATV;
- códigos de venta y pago válidos.

## Parámetros globales (`parametros_sistema`)

Los cambia el SaaS admin en la base de datos. Se aplican en menos de 60 segundos, sin reiniciar.

| Clave | Valor inicial | Uso |
|---|---|---|
| `hacienda_cola_intervalo_seg` | 60 | Cada cuánto revisa la cola. |
| `hacienda_cola_lote` | 20 | Comprobantes por vuelta. |
| `hacienda_cola_bloqueo_seg` | 300 | Reserva de un comprobante mientras se transmite. Se usa el mayor entre este valor y el mínimo seguro que se calcula a partir de los tiempos de espera. |
| `hacienda_cola_backoff_base_seg` / `_max_seg` | 60 / 3600 | Espera entre reintentos; se duplica en cada intento. |
| `hacienda_cola_max_intentos` | 12 | Intentos de envío antes de pasar a ERROR. |
| `hacienda_fetch_timeout_ms` | 20000 | Tiempo máximo de cada llamada a Hacienda. |
| `hacienda_sondeo_intentos` / `_espera_ms` / `_plazo_ms` | 4 / 2000 / 12000 | Consulta inmediata después de enviar. |
| `hacienda_consulta_timeout_ms` | 5000 | Tiempo máximo de cada consulta de estado. |
| `hacienda_token_margen_seg` | 60 | Renovación anticipada del token. |
| `hacienda_transaccion_reintentos` | 3 | Reintentos ante un interbloqueo. |
| `hacienda_correo_bloqueo_seg` | 600 | Tiempo tras el cual se reintenta un correo que quedó a medias. |
| `hacienda_politica_firma_url` / `_hash` | según el anexo v4.4 | Política de firma XAdES-EPES. |
| `hacienda_unidad_medida_servicio` / `_mercancia` | Sp / Unid | Unidad de medida por omisión. |
| `hacienda_codigo_descuento_defecto` | 07 | Código de descuento por omisión. |
| `hacienda_medio_pago_tolerancia` / `hacienda_medios_pago_max` | 0.01 / 4 | Medios de pago. |
| `hacienda_detalle_min` / `_max` | 3 / 200 | Largo del detalle de cada línea. |
| `hacienda_condiciones_exigen_receptor` | 02 | Condiciones de venta que exigen factura con receptor. |
| `hacienda_tipo_cambio_cache_min` | 30 | Minutos que se guarda el tipo de cambio. |

Las URLs de Hacienda (IdP, recepción, `client_id` por ambiente, API pública) están en `parametros_sistema`, con las claves `hacienda_*` sembradas el 2026-11-26.

**Requisito de la cola:** solo corre con `NODE_ENV=production`.

## Comprobantes anteriores a esta versión

La migración `2026-11-27-facturacion-robusta.sql` marca todas las filas existentes como **heredadas** (`hacienda_origen_legado = 1`).

- **Solo se consultan:** los comprobantes heredados que estaban ENVIADA o con "Envío incierto" vuelven a la cola, pero **solo para consultarlos**.
- **No se reenvían solos:** si Hacienda no tiene la clave, quedan en ERROR para revisión manual.
- **Sin correo automático:** los comprobantes heredados no disparan el correo automático.

## Migraciones

Se aplican en este orden, a través de `mysql2` con `multipleStatements` (no usan `DELIMITER`). Todas se pueden repetir sin efectos.

1. `docs/sql/2026-11-26-saas-compania-plataforma.sql`
2. `docs/sql/2026-11-26-saas-registro-seguro.sql`
3. `docs/sql/2026-11-27-facturacion-robusta.sql`
4. `docs/sql/2026-11-27-integracion-erp.sql`

## Pendiente de verificar en SANDBOX

- **Aceptación de los documentos nuevos:** que Hacienda acepte el Tiquete 04, los descuentos y los varios medios de pago. Se comprueba emitiendo en SANDBOX con una clínica de pruebas.
- **Catálogo de códigos de descuento:** confirmar las descripciones de `CODIGO_DESCUENTO` contra el anexo oficial v4.4.
