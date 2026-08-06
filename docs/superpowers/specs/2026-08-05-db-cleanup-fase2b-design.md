# Limpieza de Base de Datos — Fase 2b (composicionSegmentada)

## Contexto

Continuación de la Fase 2 (`2026-08-05-db-cleanup-fase2-design.md`), que dejó fuera `composicionSegmentada` por tener una particularidad estructural: la tabla legada `composicion_segmentada` guarda "Grasa" y "Musculo" como dos filas separadas (`tipo_medicion` enum) en vez de un objeto único. No requiere una decisión de negocio (a diferencia de `estiloVida`/`dieta`, que siguen pendientes) — solo lógica de transformación EAV, reutilizando la misma infraestructura ya construida en Fase 2.

## Alcance

`consultas.composicionSegmentada` (JSON) → `composicion_segmentada` (2 filas por consulta, `UNIQUE KEY (id_consulta, tipo_medicion)`). Hay datos reales que migrar: la consulta 13 tiene ambos objetos (`grasa`, `musculo`) poblados.

## Modelo de datos

Sin cambios de esquema. Columnas ya presentes: `total`, `mano_izquierda`, `mano_derecha`, `pierna_derecha`, `pierna_izquierda`, `tronco` (compartidas por ambos tipos) y `calificacion_grasa` (solo aplica a la fila `tipo_medicion='Grasa'`; queda `NULL` en la fila `'Musculo'`, igual que hoy el objeto `musculo` del JSON no tiene esa clave).

## Camino de escritura

Dentro de la misma transacción que ya guarda `consultas` + las 3 evaluaciones (función `guardarEvaluacionesConsulta`, extendida): si `con.composicionSegmentada.grasa` viene con datos, `INSERT ... ON DUPLICATE KEY UPDATE` en la fila `(id_consulta, 'Grasa')`; si no, `DELETE` esa fila. Mismo tratamiento para `musculo`/`'Musculo'`.

## Camino de lectura

Se extienden las constantes `CONSULTA_EVAL_SELECT`/`CONSULTA_EVAL_JOIN` ya existentes con dos alias nuevos sobre `composicion_segmentada`: uno unido con `AND tipo_medicion = 'Grasa'`, otro con `AND tipo_medicion = 'Musculo'` (ambos `LEFT JOIN`, 1:1 seguro por el `UNIQUE KEY`). `reconstruirEvaluaciones` gana un campo más en su objeto de retorno: `composicionSegmentada: { grasa, musculo }` (cada uno `undefined` si esa fila no existe). Contrato de API sin cambios.

## Migración y corte

Mismo patrón que Fase 2: script de respaldo → script idempotente de migración de datos (consulta 13) → verificar en vivo (leer consulta 13, editar y guardar) → eliminar `consultas.composicionSegmentada`.

## Fuera de alcance

`estiloVida` y `dieta`/`dietas_recetas` — requieren decisión de diseño propia, quedan para fases separadas.
