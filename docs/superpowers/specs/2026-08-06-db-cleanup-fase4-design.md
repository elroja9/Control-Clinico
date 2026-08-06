# Limpieza de Base de Datos — Fase 4 (cuentas_pagar.lineas)

## Contexto

La auditoría final (`2026-08-06-auditoria-final-bd.md`) detectó que `cuentas_pagar.lineas` sigue siendo una columna JSON. No estaba en el alcance original porque la auditoría inicial se centró en `consultas` y `facturas`, pero es el equivalente exacto del lado de compras de `facturas.lineas`, que sí se normalizó en la Fase 2: los renglones de una factura de proveedor.

**La tabla está vacía (0 filas)**, así que no hay ningún dato que migrar — es el mejor momento posible para hacerlo.

## Modelo de datos

`cuentas_pagar` es una tabla creada por esta app, no heredada de `ConsultorioDB_schema.sql`: su PK es `id` y sus columnas son camelCase. La tabla nueva sigue la convención de su tabla hermana `cxp_pagos` (nombre snake_case, columnas camelCase), no la de `factura_lineas` (que es legada y por eso usa snake_case en todo).

```sql
CREATE TABLE cuentas_pagar_lineas (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  idCuentaPagar INT NOT NULL,
  idServicio INT NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  cantidad DECIMAL(12,2) NOT NULL,
  costoUnitario DECIMAL(14,5) NOT NULL,
  INDEX idx_cxp_lineas_servicio (idServicio),
  CONSTRAINT fk_cxp_lineas_cuenta FOREIGN KEY (idCuentaPagar) REFERENCES cuentas_pagar (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

Decisiones:

- **FK sobre `idCuentaPagar` con `ON DELETE CASCADE`**: la relación padre-hijo es real y borrar una CXP debe llevarse sus renglones. Ninguna otra tabla creada por la app tiene claves foráneas (las 29 del sistema son de tablas legadas más las 2 agregadas en Fase 2e), pero fueron precisamente las FK las que garantizaron el "cero huérfanos" del informe de auditoría — vale la pena mantener el estándar en lo nuevo.
- **Sin FK sobre `idServicio`**, solo índice: los servicios nunca se borran físicamente (borrado lógico vía `activo`), y `nombre` ya se copia al momento de la compra justamente para que el registro histórico sobreviva a cambios en el catálogo (ver comentario en `LineaCuentaPagar`). Una FK aquí no aportaría integridad real y sí podría bloquear una futura limpieza del catálogo.
- **`costoUnitario DECIMAL(14,5)`** para coincidir con la precisión de `cuentas_pagar.montoTotal`; `cantidad DECIMAL(12,2)` porque puede haber compras por peso o fracción.

## Camino de escritura

Dos sitios insertan en `cuentas_pagar`, ambos pasan a transacción explícita (hoy son un solo INSERT, así que la transacción es nueva y necesaria: con dos sentencias, un fallo parcial dejaría una CXP sin sus renglones):

1. `POST /api/cxp` — registro manual de una cuenta por pagar detallada.
2. La importación de factura de proveedor desde XML — que además ya inserta en `cxp_pagos` cuando la compra fue de contado; ese INSERT entra en la misma transacción.

En ambos: INSERT en `cuentas_pagar` (sin la columna `lineas`) + INSERT en lote en `cuentas_pagar_lineas`. Se reutiliza el mismo patrón de `guardarLineasFactura`.

## Camino de lectura

`GET /api/cxp` deja de hacer `JSON.parse(c.lineas)` y pasa a una segunda consulta `SELECT * FROM cuentas_pagar_lineas WHERE idCuentaPagar IN (...) ORDER BY id ASC`, agrupada en memoria por `idCuentaPagar` — mismo patrón que `fetchLineasPorFactura`. El endpoint ya hace exactamente esto para los pagos (`cxp_pagos`), así que la forma del código no cambia conceptualmente.

**El contrato de la API no cambia**: el frontend sigue recibiendo `cxp.lineas` como arreglo de `LineaCuentaPagar`.

## Migración y corte

Sin datos que migrar (tabla vacía). Los pasos son:

1. `CREATE TABLE IF NOT EXISTS cuentas_pagar_lineas` (script idempotente).
2. Cambios de código en `server.ts` (escritura y lectura descritos arriba).
3. `npx tsc --noEmit` + `npx vitest run` + `npm run build` + redeploy.
4. Verificar en vivo: registrar una CXP detallada con varios renglones, leerla de vuelta, confirmar que el inventario se afecta igual que antes, y registrar un pago.
5. Corte final: `ALTER TABLE cuentas_pagar DROP COLUMN lineas`.

Como la tabla está vacía, el paso 5 puede hacerse en la misma sesión que el resto sin ventana de riesgo.

## Fuera de alcance

- `cierres_fiscales.datos` — se mantiene como JSON deliberadamente: es la foto congelada e inmutable de un reporte ya presentado a Hacienda (ver informe de auditoría).
- Los 20 pares snake_case/camelCase duplicados — "Fase 5", requiere backfill previo de filas legadas y toca los 6 modelos centrales.
