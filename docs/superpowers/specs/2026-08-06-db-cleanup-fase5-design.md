# Limpieza de Base de Datos — Fase 5 (consolidar duplicados snake_case / camelCase)

## Contexto

La auditoría final detectó columnas duplicadas: cada concepto guardado dos veces, una con nombre snake_case (heredado de `ConsultorioDB_schema.sql`) y otra camelCase (la que la app usa). La app escribe ambas en cada guardado y `normalizeRow()` prefiere la camelCase al leer.

Al analizar el alcance real aparecieron dos correcciones a esa auditoría:

- **Son 28 pares, no 20.** La heurística de la auditoría comparaba nombres normalizados, así que se perdió los pares semánticos cuyos nombres no se parecen: `fecha`/`fecha_consulta`, `motivo`/`motivo_expectativas`, `compromiso`/`compromiso_cumplir`, `anotacionesGenerales`/`comentarios_nutricionista`, `correo`/`email`, `contrasena`/`password_hash`, `identificacion`/`fact_identificacion`, `tipoIdentificacion`/`fact_tipo_identificacion`.
- **La "divergencia" de `horas_sueno` era falsa alarma**: `7.00` vs `7.0` es solo precisión decimal distinta (`DECIMAL(4,2)` vs `DECIMAL(4,1)`), no datos distintos.

Pero la divergencia real sí existe y ya causó un fallo grave: **`facturas.id_compania` es NULL en todas las filas**, lo que dejó inerte al `UNIQUE KEY uq_facturas_compania_consecutivo (id_compania, consecutivo)` — MySQL admite NULLs ilimitados en un índice único. Sin esa protección, un bug del contador de consecutivos emitió cinco facturas con el mismo número sin que nada lo detectara (corregido aparte en el commit `f1ac594`). Esto eleva la Fase 5 de "limpieza de peso muerto" a "restaurar una garantía de correctitud fiscal".

## Inventario de los 28 pares

| Tabla | Pares | Estado de los datos |
|---|---|---|
| `companias` | 8 — `nombreComercial`, `razonSocial`, `tipoIdentificacion`, `correoEmisor`, `ivaPorDefecto`, `colorPrimario`, `colorSidebar`, `logoUrl` | consistentes |
| `pacientes` | 7 — `idCompania`, `nombreCompleto`, `fechaNacimiento`, `correoElectronico`, `situacionVivienda`, `tipoIdentificacion`→`fact_tipo_identificacion`, `identificacion`→`fact_identificacion` | 1 fila legada solo con snake_case |
| `consultas` | 7 — `idPaciente`, `idCompania`, `fecha`→`fecha_consulta`, `motivo`→`motivo_expectativas`, `horasSueno`, `compromiso`→`compromiso_cumplir`, `anotacionesGenerales`→`comentarios_nutricionista` | 1 fila legada solo con snake_case |
| `usuarios` | 3 — `idCompania`, `correo`→`email`, `contrasena`→`password_hash` | consistentes |
| `facturas` | 2 — `idCompania`, `idPaciente` | snake_case 100% NULL (nunca escritas) |
| `servicios` | 1 — `idCompania` | consistentes |

## Decisión de diseño

**Se conserva la versión camelCase y se elimina la snake_case** (confirmado con el usuario).

El punto delicado es que las columnas snake_case son las que llevan las **7 claves foráneas** y el índice único de facturación. Conservar camelCase obliga a recrear esas restricciones sobre las columnas que quedan — trabajo mecánico y bien acotado. La alternativa (conservar snake_case) mantendría las FK intactas pero obligaría a reescribir todos los `INSERT`/`UPDATE`/`WHERE` de los 6 modelos centrales y cambiaría tipos (`fecha` `varchar` → `fecha_consulta` `date`), con mucho más riesgo por mucho menos beneficio.

Las claves primarias siguen siendo snake_case (`id_compania`, `id_paciente`, …), así que las FK quedan con forma `consultas.idCompania → companias.id_compania`. Es una mezcla de convenciones, pero es la que el código ya usa de hecho: elimina la duplicación sin pedirle al código que cambie de idioma.

## Ejecución por tablas

Se ejecuta por tablas y no de una vez, para poder verificar cada paso por separado (confirmado con el usuario).

### Fase 5a — `facturas` (hecha)

La de mayor valor: restaura la protección fiscal. **No requiere ningún cambio de código** — se verificó que `server.ts` nunca nombra `facturas.id_compania` ni `facturas.id_paciente`; la app siempre escribió y leyó las camelCase.

Obstáculo: recrear el índice único falla mientras existan las 5 facturas con consecutivo repetido. Todas están `SIMULADA` en ambiente `PRUEBAS_LOCAL` — nunca enviadas a Hacienda, no son documentos fiscales — así que se renumeran 1..5 por orden de creación, parchando también el segmento del consecutivo dentro de la `clave` (que lo incluye en las posiciones 21-40) para que el documento quede internamente coherente. Se respalda antes.

Pasos DDL: quitar `fk_facturas_compania` y `fk_facturas_paciente` → quitar `uq_facturas_compania_consecutivo` → eliminar las columnas `id_compania` e `id_paciente` → recrear las dos FK sobre `idCompania`/`idPaciente` → recrear el índice único sobre `(idCompania, consecutivo)`.

`id_consulta` no se toca: esa columna sí la usa la app desde la Fase 2, con su `uq_facturas_consulta` y su FK.

### Fase 5b — `companias`, `servicios`, `usuarios` (12 pares)

Datos totalmente consistentes en las tres, así que no hace falta backfill. Requiere cambios de código: quitar las columnas snake_case de los `INSERT`/`UPDATE`, simplificar los `WHERE (idCompania = ? OR id_compania = ?)`, y limpiar las asignaciones correspondientes de `normalizeRow()`. Recrear las FK `fk_servicios_compania` y `fk_usuarios_compania` sobre `idCompania`.

Cuidado con `usuarios`: `contrasena`/`password_hash` se escriben juntas en tres sitios distintos (login con migración oportunista de hash, cambio de contraseña, y alta/edición de usuario). Los tres deben quedar consistentes o se rompe el acceso.

### Fase 5c — `pacientes`, `consultas` (14 pares)

La de mayor riesgo: ambas tienen una fila legada con solo snake_case, así que **hay que rellenar la camelCase antes de eliminar nada** o se pierde el dato de esas filas. Además `consultas.fecha` es `varchar` y `fecha_consulta` es `date`: al quedarse solo con `fecha` desaparece esa diferencia de tipo, pero el backfill de la fila legada debe formatear la fecha a `'YYYY-MM-DD'`.

Recrear `fk_pacientes_compania`, `fk_consultas_compania` y `fk_consultas_paciente` sobre las columnas camelCase.

## Verificación

Por cada sub-fase: `npx tsc --noEmit` + `npx vitest run` + build + redeploy + prueba en vivo de los endpoints afectados + `.scratch/auditoria_codigo_vs_esquema.cjs` para confirmar que el código y el esquema siguen alineados. Al terminar las tres, volver a correr `.scratch/auditoria_final.cjs`: la sección de duplicados debe quedar vacía.

## Fuera de alcance

- `cierres_fiscales.datos` — se mantiene como JSON deliberadamente (foto inmutable de un reporte ya presentado).
- Las 5 columnas de auditoría 100% muertas (`dietas_recetas.creado_por`/`actualizado_por`, `compania_hacienda_config.actualizado_por`) — se pueden plegar a la 5c.
