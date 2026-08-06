# Limpieza de Base de Datos — Fase 2e (fisioterapia y horarioAtencion)

## Contexto

Primer caso de esta limpieza donde no existe tabla legada equivalente que reutilizar: `consultas.fisioterapia` y `companias.horarioAtencion` se agregaron a la app en algún momento posterior al esquema original de `ConsultorioDB_schema.sql`, así que hay que crear tablas nuevas. `antropometria` queda fuera de esta fase (identificada por el usuario como una fase separada, "Fase 3").

## Alcance

### `fisioterapia`

Sin tabla legada. Se crea `fisioterapia_evaluaciones` con `UNIQUE KEY (id_consulta)` — mismo patrón 1:1 que las 3 evaluaciones de Fase 2, reutilizando la infraestructura ya construida (`CONSULTA_EVAL_SELECT`/`CONSULTA_EVAL_JOIN`/`reconstruirEvaluaciones`/`guardarEvaluacionesConsulta`). Sin datos reales que migrar (las 3 consultas existentes tienen `fisioterapia` en `null`).

```sql
CREATE TABLE fisioterapia_evaluaciones (
  id_fisioterapia INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_consulta INT NOT NULL,
  mecanismo_lesion TEXT,
  diagnostico_medico TEXT,
  eva_dolor INT,
  zona_dolor VARCHAR(100),
  tipo_dolor VARCHAR(100),
  factores_agravantes TEXT,
  factores_atenuantes TEXT,
  postura_observaciones TEXT,
  palpacion_hallazgos TEXT,
  rom_medido TEXT,
  fuerza_daniels VARCHAR(100),
  pruebas_especiales TEXT,
  agentes_fisicos TEXT,
  terapia_manual TEXT,
  ejercicio_terapeutico TEXT,
  sesiones_sugeridas INT,
  soap_subjetivo TEXT,
  soap_objetivo TEXT,
  soap_analisis TEXT,
  soap_plan TEXT,
  UNIQUE KEY uq_fisioterapia_consulta (id_consulta),
  CONSTRAINT fk_fisioterapia_consulta FOREIGN KEY (id_consulta) REFERENCES consultas (id_consulta) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

### `companias.horarioAtencion`

`companias` se lee en 17 sitios distintos de `server.ts` (`SELECT * FROM companias ...`), pero solo 2 de esos 17 consumen `horarioAtencion` (ambos calculan disponibilidad de citas vía `horarioDelDia(company?.horarioAtencion, fecha)`: el endpoint de slots disponibles y `POST /api/public/citas`). En vez de convertir los 17 sitios a JOIN — innecesario y con más riesgo de romper algo no relacionado — se crea una tabla nueva 1:1 con `companias` y un helper `fetchHorarioAtencionCompania(idCompania)` que solo se invoca en esos 2 sitios puntuales, adjuntando el resultado a `company.horarioAtencion` antes de llamar `horarioDelDia`.

```sql
CREATE TABLE compania_horario_atencion (
  id_compania INT NOT NULL PRIMARY KEY,
  lunes_abre VARCHAR(5) DEFAULT NULL, lunes_cierra VARCHAR(5) DEFAULT NULL,
  martes_abre VARCHAR(5) DEFAULT NULL, martes_cierra VARCHAR(5) DEFAULT NULL,
  miercoles_abre VARCHAR(5) DEFAULT NULL, miercoles_cierra VARCHAR(5) DEFAULT NULL,
  jueves_abre VARCHAR(5) DEFAULT NULL, jueves_cierra VARCHAR(5) DEFAULT NULL,
  viernes_abre VARCHAR(5) DEFAULT NULL, viernes_cierra VARCHAR(5) DEFAULT NULL,
  sabado_abre VARCHAR(5) DEFAULT NULL, sabado_cierra VARCHAR(5) DEFAULT NULL,
  domingo_abre VARCHAR(5) DEFAULT NULL, domingo_cierra VARCHAR(5) DEFAULT NULL,
  CONSTRAINT fk_horario_compania FOREIGN KEY (id_compania) REFERENCES companias (id_compania) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
```

`VARCHAR(5)` (no `TIME`) para guardar exactamente el string `'HH:MM'` que ya usa la app, sin conversión de formato en ninguna dirección. Un día cerrado (`abre`/`cierra` ambos `null`, como hoy `domingo` en la compañía 9025) simplemente deja esas dos columnas en `NULL`.

Hay datos reales que migrar: las 2 empresas existentes tienen horarios personalizados (no el default).

## Camino de escritura

**`fisioterapia`**: se extiende `guardarEvaluacionesConsulta` igual que las demás — upsert/borrado por `id_consulta` dentro de la misma transacción de guardar consulta.

**`horarioAtencion`**: al guardar una compañía (`POST /api/companies`), después del INSERT/UPDATE de `companias` (sin la columna `horarioAtencion`), un `INSERT ... ON DUPLICATE KEY UPDATE` en `compania_horario_atencion` por `id_compania`.

## Camino de lectura

**`fisioterapia`**: se une a `CONSULTA_EVAL_JOIN`/`CONSULTA_EVAL_SELECT` un alias más (`fi`), y `reconstruirEvaluaciones` gana `fisioterapia` en su objeto de retorno.

**`horarioAtencion`**: `fetchHorarioAtencionCompania(idCompania)` hace un `SELECT * FROM compania_horario_atencion WHERE id_compania = ?` dedicado y arma el objeto `HorarioAtencion` (7 días × `{abre, cierra}`); se llama solo en los 2 sitios que lo consumen, adjuntando el resultado a `company.horarioAtencion` antes de `horarioDelDia`. El resto de los 15 sitios que leen `companias` no cambian.

## Migración y corte

Mismo patrón que las fases anteriores: respaldo (`companias.horarioAtencion` — `consultas.fisioterapia` no tiene datos reales que respaldar) → script idempotente (`CREATE TABLE IF NOT EXISTS` para ambas tablas nuevas + migración de las 2 empresas) → verificar en vivo (guardar/leer horario de una empresa, confirmar que el cálculo de slots disponibles sigue funcionando; guardar/leer fisioterapia en una consulta) → eliminar `companias.horarioAtencion` y `consultas.fisioterapia`.

## Fuera de alcance

`antropometria` de consultas — "Fase 3", pendiente de su propio diseño.
