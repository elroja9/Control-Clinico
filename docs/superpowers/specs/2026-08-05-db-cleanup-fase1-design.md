# Limpieza de Base de Datos — Fase 1 (tablas y columnas muertas)

## Contexto

Auditoría en vivo de las 46 tablas de la base de datos encontró: (a) 11 tablas con 0 uso real por parte de la aplicación — o bien duplicadas por una versión más completa (`provincias`/`cantones`/`distritos` legadas vs. `cr_provincias`/`cr_cantones`/`cr_distritos`, que sí usa la app), o bien remanentes del diseño original de `ConsultorioDB_schema.sql` nunca conectados a esta app; y (b) columnas legadas muertas dentro de las 6 tablas "híbridas" (`pacientes`, `consultas`, `usuarios`, `companias`, `servicios`, `facturas`) — duplicados snake_case sin usar, columnas de auditoría nunca pobladas, y una columna `estado TINYINT(1)` legada presente en las 5 primeras que ya causó un bug real (colisión de nombre con el `estado` de consultas que debía guardar ABIERTA/CERRADA — resuelto renombrando a `estadoConsulta`, ver commit de esa fecha).

Este es el primer sub-proyecto de una limpieza más grande (normalizar las columnas JSON de `consultas`/`facturas` en tablas propias vendrá en fases 2/3, por separado). Esta fase es **solo DDL** — no requiere ningún cambio en `server.ts` ni en el frontend, porque el código de la app nunca lee ni escribe ninguna de las tablas/columnas que se eliminan aquí (verificado columna por columna contra el código actual).

## Alcance

### Tablas a eliminar (11)

`barrios`, `compania_direcciones`, `compania_telefonos`, `frecuencia_alimentos`, `historial_farmacologico`, `notificaciones_reevaluacion`, `paciente_direcciones`, `cabys_catalogo`, `provincias`, `cantones`, `distritos`.

**Orden de eliminación** (respeta las FK existentes entre ellas, sin necesidad de desactivar `FOREIGN_KEY_CHECKS`):
```
compania_direcciones → paciente_direcciones → compania_telefonos →
frecuencia_alimentos → historial_farmacologico → notificaciones_reevaluacion →
barrios → distritos → cantones → provincias → cabys_catalogo
```

### Tablas que se mantienen intactas (no forman parte de esta fase)

- `composicion_segmentada`, `estilo_vida`, `evaluacion_antropometrica`, `evaluacion_bioquimica`, `evaluacion_dietetica`, `factura_lineas`, `dietas_recetas` — objetivos de normalización de las fases 2/3.
- `antecedentes_familiares`, `antecedentes_personales`, `paciente_telefonos` — representan un modelo de historial médico/contacto más rico del que la app usa hoy (20+ condiciones vs. las 4 actuales; múltiples teléfonos vs. uno solo). No es limpieza, es funcionalidad nunca conectada — se dejan intactas para una eventual expansión futura, no forman parte de este cleanup.
- `xml_firmado` y `respuesta_hacienda` en `facturas` — nunca pobladas hoy, pero son la vía para persistir el XML firmado real de Hacienda (actualmente se firma de forma transitoria y se descarta) — se mantienen.

### Columnas legadas a eliminar por tabla

**`pacientes`**: `fact_nombre`, `fact_correo`, `periodicidad_valoracion`, `proxima_valoracion`, `creado_por`, `creado_en`, `actualizado_por`, `actualizado_en`, `estado`, `id`.

**`consultas`**: `creado_por`, `creado_en`, `actualizado_por`, `actualizado_en`, `estado`, `id`.

**`usuarios`**: `creado_en`, `actualizado_en`, `estado`, `id`.

**`companias`**: `cod_actividad_economica`, `sucursal_hacienda`, `terminal_hacienda`, `siguiente_consecutivo_factura`, `creado_en`, `actualizado_en`, `estado`, `id`.

**`servicios`**: `codigo_cabys`, `porcentaje_iva`, `estado`, `creado_en`, `actualizado_en`, `id`.

**`facturas`**: `condicion_venta`, `medio_pago`, `moneda`, `total_descuento`, `total_iva`, `total_comprobante`, `estado_hacienda`, `creado_por`, `creado_en`, `actualizado_por`, `actualizado_en`, `fecha_emision`, `id`.

La columna `id` (sombra, siempre `NULL`) se elimina en las 6 tablas: desde el fix de `normalizeRow()` de esta sesión, ningún endpoint la lee ni la escribe — el id real siempre sale de la PK con nombre propio (`id_paciente`, `id_consulta`, etc.).

## Verificación antes/después

- **Antes**: cada tabla/columna a eliminar se confirmó contra el código actual de `server.ts` (grep de cada nombre de columna) — cero coincidencias de uso real.
- **Después**: `npx tsc --noEmit` (no debería cambiar nada, es DDL puro) + `npx vitest run` (16/16) + smoke test manual: login, ver lista de pacientes/consultas/facturas, cerrar/reabrir una consulta, facturar — confirmar que todo sigue funcionando contra el esquema reducido.
- Antes de ejecutar, generar un `mysqldump` de las tablas afectadas como respaldo (dato real en producción, aunque casi todas están vacías).

## Fuera de alcance

- Normalizar las columnas JSON de `consultas`/`facturas` — fases 2/3, spec aparte.
- Expandir el modelo de antecedentes médicos usando `antecedentes_familiares`/`antecedentes_personales`/`paciente_telefonos` — posible feature futura, no parte de este cleanup.
- Ningún cambio a `server.ts`, tipos de TypeScript, o componentes de React — esta fase no los toca porque no los necesita.
