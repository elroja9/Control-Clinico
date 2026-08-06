# Limpieza de Base de Datos — Fase 2c (estiloVida)

## Contexto

Continuación de la Fase 2 (`2026-08-05-db-cleanup-fase2-design.md`), que dejó fuera `estiloVida` por un problema estructural real: la tabla legada `estilo_vida` tiene `PRIMARY KEY (id_paciente)` — un registro por paciente, para siempre — mientras que la app guarda `estiloVida` dentro de cada consulta (`consultas.estiloVida`, JSON).

Se verificó cómo lo usa el formulario (`ConsultationForm.tsx`): `estiloVida` solo se precarga al **editar** una consulta existente; una consulta **nueva** siempre arranca en blanco, sin heredar el estilo de vida de una consulta anterior del mismo paciente. La app trata esto genuinamente como dato por consulta, con su propio historial — no como un perfil único y compartido del paciente.

**Decisión de diseño (confirmada con el usuario)**: en vez de usar la tabla legada tal cual (lo que perdería el historial por consulta), se altera su clave — de `PRIMARY KEY (id_paciente)` a `UNIQUE KEY (id_consulta)` — para preservar exactamente el comportamiento actual. La tabla está vacía en producción (0 filas), así que este cambio de clave es seguro.

## Modelo de datos

```sql
ALTER TABLE estilo_vida
  DROP PRIMARY KEY,
  ADD COLUMN id_estilo_vida INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST,
  ADD COLUMN id_consulta INT NOT NULL AFTER id_paciente,
  ADD UNIQUE KEY uq_estilo_vida_consulta (id_consulta),
  ADD CONSTRAINT fk_estilo_vida_consulta FOREIGN KEY (id_consulta) REFERENCES consultas (id_consulta) ON DELETE CASCADE;
```

`id_paciente` se conserva como columna simple (ya tenía su propio FK `fk_estilo_vida_paciente`, independiente de la PK) — útil si en el futuro se quiere consultar el historial de estilo de vida de un paciente across todas sus consultas. El resto de columnas (`realiza_ejercicio`, `tiempo_entrenar`, ... `cantidad_fumado`) calzan campo por campo con el JSON actual, igual que las 3 evaluaciones de Fase 2 — sin traducción de nombres.

## Camino de escritura y lectura

Mismo patrón que las evaluaciones y `composicionSegmentada`: se extiende `guardarEvaluacionesConsulta` con un upsert/borrado de `estilo_vida` por `id_consulta` (ya no por `id_paciente`), y `CONSULTA_EVAL_SELECT`/`CONSULTA_EVAL_JOIN`/`reconstruirEvaluaciones` ganan un alias `ev` más. `realiza_ejercicio`, `consume_alcohol`, `fuma` son columnas `tinyint(1)` (booleanas) — se castean igual que las de `evaluacion_dietetica`. Contrato de API sin cambios.

## Migración y corte

Mismo patrón: respaldo → script idempotente que aplica el ALTER TABLE y migra los datos existentes (consulta 13 tiene `estiloVida` poblado) → verificar en vivo → eliminar `consultas.estiloVida`.

## Fuera de alcance

`dieta`/`dietas_recetas` — sigue pendiente, con su propia decisión de diseño (columnas faltantes para macros/prescripción calórica).
