# Auditoría completa de la base de datos — post limpieza

Ejecutada contra la base de datos en vivo (`ConsultorioDB`) al terminar las fases 1, 2, 2b, 2c, 2d, 2e y 3. Script: `.scratch/auditoria_final.cjs`; salida cruda: `.scratch/auditoria_final.txt`.

## Resumen

| Métrica | Antes (inicio de Fase 1) | Ahora |
|---|---|---|
| Tablas | 46 | 37 |
| Columnas JSON en `consultas` | 8 | 0 |
| Columnas JSON en `facturas` | 1 | 0 |
| Claves foráneas con huérfanos | — | 0 de 29 |

37 = 46 − 11 tablas eliminadas en Fase 1 + 2 tablas nuevas creadas en Fase 2e (`fisioterapia_evaluaciones`, `compania_horario_atencion`).

## Lo que quedó bien

- **Integridad referencial intacta**: 29 claves foráneas declaradas, **cero filas huérfanas** en toda la base.
- **Las 7 tablas hijas de `consultas`** (`evaluacion_antropometrica`, `evaluacion_bioquimica`, `evaluacion_dietetica`, `composicion_segmentada`, `estilo_vida`, `dietas_recetas`, `fisioterapia_evaluaciones`) tienen todas su FK hacia `consultas` **y** su índice único correspondiente. Ninguna tiene filas apuntando a consultas inexistentes.
- **`consultas` y `facturas` ya no tienen ninguna columna JSON.** Todo su contenido estructurado vive en tablas relacionales.

## Hallazgos

### 1. Dos columnas JSON sobrevivieron a la limpieza

Ninguna de las dos estaba en el alcance original (la auditoría inicial se centró en `consultas`/`facturas`), pero existen:

**`cuentas_pagar.lineas` (longtext, JSON) — recomiendo normalizar.**
Es el equivalente exacto, del lado de compras, de `facturas.lineas` que sí normalizamos en Fase 2 (los renglones de una factura de proveedor). El código hace `JSON.parse(c.lineas)` en `GET /api/cxp`. **La tabla está vacía (0 filas)**, así que normalizarla ahora no requiere migrar ningún dato — es el mejor momento posible. Sería una "Fase 4" pequeña, con el mismo patrón ya probado siete veces.

**`cierres_fiscales.datos` (longtext, JSON) — recomiendo dejarla como está.**
Guarda `JSON.stringify(reporte)`: la foto congelada de un reporte D-104/D-101 al momento de cerrarlo. No es dato relacional vivo, es un artefacto histórico inmutable cuyo propósito es precisamente preservar el cálculo tal como se presentó a Hacienda ese día. Normalizarlo significaría crear tablas que espejen toda la estructura del reporte, y volvería a calcularse implícitamente si esas tablas cambiaran — perdiendo justo la garantía que le da valor. Este es el caso de uso legítimo de una columna JSON.

Las otras tres columnas `longtext` detectadas **no son JSON** y están bien: `companias.logoUrl`/`logo_url` (data URI base64 del logo) y `facturas.xml_firmado` (XML de Hacienda, hoy vacía).

### 2. Quedan 20 pares de columnas duplicadas snake_case ↔ camelCase — con divergencia real

Sobreviven en 6 tablas: `companias` (8 pares), `pacientes` (5), `consultas` (3), `facturas` (2), `servicios` (1), `usuarios` (1). La app escribe ambas versiones en cada guardado y `normalizeRow()` prefiere la camelCase al leer, así que hoy funciona — pero es peso muerto y ya hay divergencia:

- **`consultas` id 4**: `id_paciente = 2` pero `idPaciente = NULL`; igual `id_compania`/`idCompania` y `horas_sueno`/`horasSueno`. Es una fila legada anterior a la app.
- **`pacientes`**: 9 filas tienen los campos snake_case, solo 8 los camelCase.
- **`facturas.id_compania` y `facturas.id_paciente`: 100% NULL en las 5 filas** — completamente muertas, la app solo usa las camelCase.

Esto es exactamente la clase de duplicación que eliminamos en la Fase 3 con `antropometria`. **Consolidar a una sola versión sería una "Fase 5"**, y no es un simple `DROP COLUMN`: primero hay que rellenar la versión camelCase donde está NULL (las filas legadas), porque si no se pierde el dato de esas filas. El caso de `facturas` sí es trivial (las snake_case están vacías).

### 3. 28 columnas siempre nulas en tablas con datos

No todas son problema — hay que distinguir tres grupos:

**Funcionalidad no construida (dejar):** `servicios.stock`, `stockMinimo`, `costoUnitario`, `codigoBarras` (inventario); `facturas.xml_firmado`, `respuesta_hacienda` (persistencia del XML de Hacienda); `companias.montoMensual`, `proximoVencimiento` (facturación SaaS); `citas.idConsulta`, `notification_logs.idConsulta` (enlaces opcionales).

**Peso muerto real (candidatas a eliminar):** `facturas.id_compania`, `facturas.id_paciente` (duplicados muertos, ver hallazgo 2); `dietas_recetas.creado_por`, `actualizado_por` y `compania_hacienda_config.actualizado_por` (columnas de auditoría legadas que la app nunca pobló — mismo tipo que las ~45 eliminadas en Fase 1, se colaron en tablas que entonces estaban vacías).

**Campos opcionales legítimos:** `dietas_recetas.fecha_inicio`/`fecha_fin` (sin equivalente en la UI actual, documentado en el spec de Fase 2d); `dietas_recetas.macro_*` (se llenan solo si el nutricionista define macros); `antecedentes_*.observaciones`, etc.

## Recomendación de prioridades

1. **Fase 4 — `cuentas_pagar.lineas` → `cuentas_pagar_lineas`.** Alto valor, riesgo mínimo: la tabla está vacía, no hay datos que migrar, y el patrón está probado. Es la única columna JSON que queda con dato relacional vivo.
2. **Fase 5 — consolidar los 20 pares snake_case/camelCase.** Mayor beneficio estructural (elimina la divergencia de raíz), pero necesita backfill previo de las filas legadas y toca los 6 modelos centrales. Merece su propio diseño.
3. **Limpieza menor** — eliminar las 5 columnas de auditoría/duplicados 100% muertas del hallazgo 3. Trivial, se puede plegar a la Fase 5.
4. **No tocar** `cierres_fiscales.datos`.
