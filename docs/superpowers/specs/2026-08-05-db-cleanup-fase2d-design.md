# Limpieza de Base de Datos — Fase 2d (dieta)

## Contexto

Última normalización pendiente de la Fase 2 (`2026-08-05-db-cleanup-fase2-design.md`): `consultas.dieta` (JSON) → `dietas_recetas`. Es la más compleja de las 4: los campos base (comidas del día) sí calzan con la tabla legada pero con nombres distintos, y `prescripcionCalorica`/`macros` no tienen columna alguna hoy — esos dos sub-objetos se agregaron a `dieta` en una sesión anterior, después de que se escribiera el esquema legado original.

## Alcance y modelo de datos

**Renombres** (mismo campo, nombre distinto): `totalCalorias`→`total_calorias`, `desayuno`→`comida_1_desayuno`, `meriendaManana`→`comida_2_merienda_manana`, `almuerzo`→`comida_3_almuerzo`, `meriendaTarde`→`comida_4_merienda_tarde`, `cena`→`comida_5_cena`, `indicaciones`→`indicaciones_adicionales`.

**Columnas nuevas** (12, decisión confirmada — mismo criterio que `factura_lineas` en Fase 2: tabla vacía, extenderla es seguro):

```sql
ALTER TABLE dietas_recetas
  ADD COLUMN formula VARCHAR(30) DEFAULT NULL,
  ADD COLUMN tmb DECIMAL(7,2) DEFAULT NULL,
  ADD COLUMN dias_descanso INT DEFAULT NULL,
  ADD COLUMN dias_entrenamiento INT DEFAULT NULL,
  ADD COLUMN factor_actividad_descanso DECIMAL(5,3) DEFAULT NULL,
  ADD COLUMN factor_actividad_entreno DECIMAL(5,3) DEFAULT NULL,
  ADD COLUMN promedio_mantenimiento DECIMAL(7,2) DEFAULT NULL,
  ADD COLUMN direccion VARCHAR(20) DEFAULT NULL,
  ADD COLUMN porcentaje DECIMAL(5,2) DEFAULT NULL,
  ADD COLUMN macro_carbohidratos_pct DECIMAL(5,2) DEFAULT NULL,
  ADD COLUMN macro_proteinas_pct DECIMAL(5,2) DEFAULT NULL,
  ADD COLUMN macro_grasas_pct DECIMAL(5,2) DEFAULT NULL,
  ADD UNIQUE KEY uq_dietas_recetas_consulta (id_consulta);
```

`formula` (`FormulaTMB`: `HARRIS_BENEDICT_OBESOS`/`MIFFLIN_ST_JEOR`/`MULLER`) y `direccion` (`DireccionPrescripcion`: `DEFICIT`/`MANTENIMIENTO`/`SUPERAVIT`) — tamaños de columna con margen sobre el valor más largo conocido. Se agrega `UNIQUE KEY (id_consulta)` (la tabla no tenía ninguna) para poder hacer upsert igual que en las demás tablas normalizadas.

`fecha_inicio`/`fecha_fin` (ya existentes en la tabla) no tienen equivalente en el JSON actual — quedan siempre `NULL`, no se les agrega comportamiento nuevo (no es parte de esta limpieza inventar funcionalidad).

## Camino de escritura y lectura

Mismo patrón que las 3 evaluaciones/composicionSegmentada/estiloVida: se extiende `guardarEvaluacionesConsulta` con upsert/borrado de `dietas_recetas` por `id_consulta`, y `CONSULTA_EVAL_SELECT`/`CONSULTA_EVAL_JOIN`/`reconstruirEvaluaciones` ganan un alias `dr` más, reconstruyendo `dieta: { ...campos base, prescripcionCalorica: {...} | undefined, macros: {...} | undefined }`. Contrato de API sin cambios.

## Migración y corte

Mismo patrón: respaldo → script idempotente (ALTER TABLE + migración de datos; consulta 13 tiene `dieta` con `prescripcionCalorica` poblado, sin `macros`) → verificar en vivo → eliminar `consultas.dieta`.

## Fuera de alcance

Ninguno — esta es la última de las normalizaciones JSON identificadas en la auditoría original. Quedan pendientes para el futuro (no forman parte de este proyecto de limpieza): `antropometria`/`fisioterapia` (sin tabla legada equivalente, requerirían tablas nuevas — "Fase 3" mencionada en el spec original de Fase 1) y `companias.horarioAtencion`.
