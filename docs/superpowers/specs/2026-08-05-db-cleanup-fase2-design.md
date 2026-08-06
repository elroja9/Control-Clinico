# Limpieza de Base de Datos — Fase 2 (normalización mecánica de columnas JSON)

## Contexto

La Fase 1 (ver `2026-08-05-db-cleanup-fase1-design.md`) eliminó tablas y columnas legadas muertas. El objetivo original más amplio — "quitar las columnas JSON y usar las tablas, base de datos limpia y normalizada, no usar columnas JSON" — sigue pendiente para las columnas JSON de `consultas` y `facturas`, que hoy guardan datos estructurados como `longtext` en vez de filas relacionales.

Auditando las 6 columnas JSON candidatas contra sus tablas legadas equivalentes (`ConsultorioDB_schema.sql`), 4 de ellas resultaron ser normalizaciones mecánicas — sin decisiones de diseño pendientes — y 2 (`estiloVida`, `dieta`→`dietas_recetas`) tienen problemas estructurales reales (granularidad paciente-vs-consulta, columnas faltantes) que requieren su propio diseño. Esta fase cubre solo las 4 mecánicas; `estiloVida`, `composicionSegmentada` y `dieta` quedan para fases 2b/2c/2d futuras.

## Alcance

### Columnas JSON a normalizar (4)

| Columna JSON (en `consultas`/`facturas`) | Tabla destino | Relación |
|---|---|---|
| `consultas.evaluacionAntropometrica` | `evaluacion_antropometrica` | 1:1 vía `UNIQUE KEY (id_consulta)` |
| `consultas.evaluacionBioquimica` | `evaluacion_bioquimica` | 1:1 vía `UNIQUE KEY (id_consulta)` |
| `consultas.evaluacionDietetica` | `evaluacion_dietetica` | 1:1 vía `UNIQUE KEY (id_consulta)` |
| `facturas.lineas` | `factura_lineas` | 1:muchos vía FK `id_factura` |

### Fuera de alcance (fases futuras)

- `consultas.estiloVida` → `estilo_vida`: la tabla legada tiene PK por `id_paciente` (un registro por paciente, para siempre); la app guarda `estiloVida` por consulta (puede cambiar sesión a sesión). Requiere decidir si se cambia la tabla legada a `id_consulta` o se usa otro enfoque — decisión de diseño propia.
- `consultas.composicionSegmentada` → `composicion_segmentada`: la tabla legada guarda "Grasa" y "Musculo" como dos filas separadas (enum `tipo_medicion`) en vez de un objeto con ambos. No requiere decisión de negocio, pero sí lógica de transformación EAV en cada lectura/escritura — se deja para una fase separada, más simple, dedicada solo a esto.
- `consultas.dieta` → `dietas_recetas`: los nombres de columna no calzan (`comida_1_desayuno` vs `desayuno`) y la tabla legada no tiene columnas para `macros` ni `prescripcionCalorica`. Requiere agregar columnas y decidir su tipo — decisión de diseño propia.
- `consultas.antropometria` y `consultas.fisioterapia`: no tienen tabla legada equivalente (objetivo de una eventual Fase 3, tablas nuevas).

## Modelo de datos

### `evaluacion_antropometrica`, `evaluacion_bioquimica`, `evaluacion_dietetica`

Sin cambios de esquema. Verificado campo por campo: los nombres de columna de cada tabla legada calzan exactamente con las claves que la app ya guarda hoy dentro del JSON correspondiente (ej. `evaluacion_antropometrica.c_muneca` ↔ `evaluacionAntropometrica.c_muneca`, mismo nombre, sin camelCase). No hace falta traducir nombres de campo en ningún sentido.

### `factura_lineas`

Agregar 3 columnas nuevas (tabla vacía hoy, alteración segura):

```sql
ALTER TABLE factura_lineas
  ADD COLUMN tipo VARCHAR(20) NOT NULL DEFAULT 'SERVICIO' AFTER id_servicio,
  ADD COLUMN unidad_medida VARCHAR(10) NOT NULL DEFAULT 'Sp' AFTER detalle,
  ADD COLUMN codigo_tarifa_iva VARCHAR(2) NOT NULL DEFAULT '01' AFTER porcentaje_iva;
```

Los defaults solo aplican a filas hipotéticas preexistentes (no hay ninguna); todo INSERT real siempre provee estos 3 valores explícitamente. Campos del JSON actual que NO necesitan columna propia porque son alias exactos de otro campo (verificado en `server/haciendaFactura.ts::calcularLineas`, no aproximación):

- `subTotal` = `montoTotal` (literalmente el mismo valor, sin descuentos)
- `baseImponible` = `subTotal`
- `impuestoNeto` = `montoIva`
- `montoTotalLinea` = `montoTotal` (col. `monto_total`) + `montoIva` (col. `monto_iva`), calculado al leer
- `numeroLinea` = posición en `ORDER BY id_linea ASC` (las líneas de una factura emitida nunca se reordenan; correcciones van por Nota de Crédito, no por edición de la factura original)

## Camino de escritura

### Guardar consulta (`POST /api/consultations`)

Pasa de un solo INSERT/UPDATE a una transacción explícita (`pool.getConnection()` + `beginTransaction`/`commit`/`rollback`, con `rollback` + re-throw en el catch):

1. Upsert de `consultas` (igual que hoy, pero sin las columnas `evaluacionAntropometrica`, `evaluacionBioquimica`, `evaluacionDietetica`).
2. Por cada una de las 3 evaluaciones, si el campo viene con datos: `INSERT INTO evaluacion_xxx (...) VALUES (...) ON DUPLICATE KEY UPDATE ...` usando `id_consulta` como clave de upsert. Si el campo viene `null`/ausente: `DELETE FROM evaluacion_xxx WHERE id_consulta = ?` (idempotente, sin error si no existe la fila).

La transacción es una mejora necesaria, no opcional: hoy un fallo a mitad de camino es imposible (una sola sentencia); con 4 sentencias separadas, sin transacción un fallo parcial dejaría una consulta con evaluaciones inconsistentes.

### Facturar (`POST /api/facturas`) y Nota de Crédito

Mismo patrón: transacción con INSERT en `facturas` (sin columna `lineas`) + INSERT en lote (`bulk INSERT`, una sola sentencia con múltiples tuplas) en `factura_lineas` por cada línea calculada.

## Camino de lectura

### Consultas

Los 3 sitios que hoy leen `consultas` (`GET /api/consultations` lista, fetch individual dentro del endpoint de estado, y el fetch usado para el email de resumen) cambian de `SELECT *` a un `LEFT JOIN`:

```sql
SELECT c.*, 
  ea.peso AS ea_peso, ea.talla AS ea_talla, ... (resto de columnas de evaluacion_antropometrica, aliadas con prefijo ea_)
  eb.indice_homa AS eb_indice_homa, ... (prefijo eb_)
  ed.tiempos_comida AS ed_tiempos_comida, ... (prefijo ed_)
FROM consultas c
LEFT JOIN evaluacion_antropometrica ea ON ea.id_consulta = c.id_consulta
LEFT JOIN evaluacion_bioquimica eb ON eb.id_consulta = c.id_consulta
LEFT JOIN evaluacion_dietetica ed ON ed.id_consulta = c.id_consulta
WHERE ...
```

El `JOIN` es 1:1 seguro (cada tabla hija tiene `UNIQUE KEY (id_consulta)`, nunca multiplica filas). Una función helper nueva `reconstruirEvaluaciones(row)` arma los 3 objetos anidados (`evaluacionAntropometrica`, `evaluacionBioquimica`, `evaluacionDietetica`) a partir de las columnas con prefijo, devolviendo `undefined` para cada uno si todas sus columnas vienen `NULL` (equivalente a como hoy se comporta un JSON `null`). **El contrato de la API hacia el frontend no cambia** — mismo shape de objeto anidado que ya consume `ConsultationForm.tsx`/`ReportView.tsx`.

### Facturas

`GET /api/facturas` y los demás sitios que leen `facturas` (reporte D-104, generación de Nota de Crédito) pasan de `JSON.parse(row.lineas)` a una segunda consulta `SELECT * FROM factura_lineas WHERE id_factura IN (...) ORDER BY id_linea ASC`, agrupada en memoria por `id_factura` y reconstruida al shape `FacturaLinea[]` actual (incluyendo los campos derivados listados arriba).

## Migración de datos existentes

Hay datos reales en producción que migrar (verificado en vivo): la consulta `id_consulta=13` tiene las 3 evaluaciones pobladas; las 4 facturas existentes (`id_factura` 11-14) tienen 1 línea cada una.

Mismo patrón que Fase 1:

1. **Respaldo**: script `.scratch/backup_fase2.cjs` — vuelca a JSON el valor actual de las 4 columnas JSON de todas las filas de `consultas`/`facturas` antes de tocar nada.
2. **DDL + migración de datos**: script idempotente `.scratch/apply_fase2.cjs` — agrega las 3 columnas a `factura_lineas` (con manejo de `ER_DUP_FIELDNAME` como en Fase 1, para poder reejecutar tras un fallo parcial), luego recorre `consultas`/`facturas`, parsea cada JSON no-nulo, e inserta en las tablas destino: `INSERT ... ON DUPLICATE KEY UPDATE` para las 3 evaluaciones (usan `id_consulta` como clave única) y `INSERT IGNORE` para `factura_lineas` por cada línea de cada factura (sin clave única propia — el `IGNORE` evita duplicar si el script se corre dos veces, apoyado en revisar `COUNT(*) WHERE id_factura = ?` antes de insertar).
3. **Cambios de código** (`server.ts`): camino de escritura y lectura descritos arriba. Verificar con `npx tsc --noEmit` + `npx vitest run`.
4. **Build + redeploy** (`npm run build`, verificar PID/cwd de `control-clinico` vía `pm2 jlist`, `pm2 restart control-clinico`).
5. **Verificación en vivo**: login, ver consulta 13 (debe mostrar las 3 evaluaciones igual que antes), editar y guardar una consulta con evaluaciones, ver las 4 facturas existentes (deben mostrar su línea igual que antes), generar una factura nueva, generar una nota de crédito.
6. **Corte final** (paso separado, solo después de verificar todo lo anterior en vivo): `ALTER TABLE consultas DROP COLUMN evaluacionAntropometrica, DROP COLUMN evaluacionBioquimica, DROP COLUMN evaluacionDietetica` y `ALTER TABLE facturas DROP COLUMN lineas`.

## Fuera de alcance

- `estiloVida`, `composicionSegmentada`, `dieta`/`dietas_recetas`, `antropometria`, `fisioterapia` — fases 2b/2c/2d/3 separadas, cada una con su propio spec por requerir decisiones de diseño (ver sección "Fuera de alcance" arriba).
- Ningún cambio a componentes de React ni al contrato de la API — el frontend sigue recibiendo exactamente el mismo shape de JSON anidado que hoy.
