# Limpieza de Base de Datos — Fase 3 (antropometria)

## Contexto

Última columna JSON del sistema. A diferencia de las fases anteriores, aquí el hallazgo principal no fue "dónde guardar esto" sino que **no hay nada nuevo que guardar**: `consultas.antropometria` es casi enteramente un duplicado de `evaluacion_antropometrica`, la tabla ya normalizada en Fase 2.

Verificado en `src/components/ConsultationForm.tsx` (bloque `handleFormSubmit`): 8 de los 9 campos de `antropometria` se construyen desde **las mismas variables de estado del formulario** que alimentan `evaluacionAntropometrica`:

| `antropometria` | `evaluacion_antropometrica` | variable de formulario |
|---|---|---|
| `peso` | `peso` | `peso` (misma) |
| `talla` | `talla` | `talla` (misma) |
| `imc` | `imc` | `calculatedImc` (misma) |
| `grasaVisceral` | `grasa_visceral` | `grasaVisc` (misma) |
| `masaMuscular` | `masa_muscular` | `musculo` (misma) |
| `masaOsea` | `masa_osea` | `osea` (misma) |
| `cintura` | `cintura` | `cintura` (misma) |
| `abdominal` | `circunferencia_abdominal` | `abdominal` (misma) |
| `grasaCorporal` | *(sin equivalente)* | `grasaCorp` — **input distinto** de `pctGrasaBalanza`, que alimenta `porcentaje_grasa_balanza` |

"Grasa Corporal (%)" y "Grasa Balanza (%)" son dos campos separados del formulario (medición por fórmula/plicómetro vs. lectura de balanza de bioimpedancia), así que `grasaCorporal` sí es un dato propio que hay que conservar.

Que sean copias escribibles por separado ya produjo divergencia real: en la consulta 13, `antropometria.peso` quedó en 85 mientras `evaluacion_antropometrica.peso` quedó en 86.50 (causado por una edición vía API durante las pruebas de la Fase 2, pero demuestra que nada impide que se desincronicen).

**Decisión de diseño (confirmada con el usuario)**: eliminar la duplicación en vez de preservarla. No se crea tabla nueva.

## Modelo de datos

Una sola columna nueva sobre la tabla existente:

```sql
ALTER TABLE evaluacion_antropometrica
  ADD COLUMN porcentaje_grasa_corporal DECIMAL(5,2) DEFAULT NULL;
```

`evaluacion_antropometrica` pasa a ser la única fuente de verdad de las medidas antropométricas. Los otros 8 campos de `antropometria` no necesitan columna: ya existen ahí.

## Camino de escritura

Se extiende `EVAL_ANTROPOMETRICA_COLS` con `porcentaje_grasa_corporal`. En `guardarEvaluacionesConsulta`, esa columna se toma de `con.evaluacionAntropometrica.porcentaje_grasa_corporal` si viene, y si no de `con.antropometria.grasaCorporal` — así funciona con el formulario actual (que lo manda dentro de `antropometria`) sin bloquear que en el futuro se mande directo en `evaluacionAntropometrica`.

Los otros 8 campos de `antropometria` que llegan del cliente se ignoran: son redundantes y `evaluacionAntropometrica` es la fuente. El frontend no cambia — sigue mandando ambos objetos.

## Camino de lectura

`reconstruirEvaluaciones` deriva `antropometria` de las mismas columnas `ea_*` que ya trae el JOIN, sin consulta adicional:

```
antropometria = {
  peso, talla, imc,
  grasaCorporal:  porcentaje_grasa_corporal,
  grasaVisceral:  grasa_visceral,
  masaMuscular:   masa_muscular,
  masaOsea:       masa_osea,
  cintura,
  abdominal:      circunferencia_abdominal
}
```

`undefined` cuando la consulta no tiene fila en `evaluacion_antropometrica` — mismo comportamiento que hoy con el JSON `null`. **El contrato de la API no cambia**: `ReportView.tsx` y `ConsultationForm.tsx` siguen recibiendo `consultation.antropometria.*` con la misma forma.

Efecto secundario deseado: las dos copias quedan estructuralmente imposibilitadas de divergir, porque ahora son la misma fila leída de dos maneras.

## Migración y corte

1. **Respaldo**: volcar `consultas.antropometria` de todas las filas a JSON.
2. **Migración**: `ALTER TABLE` + copiar `antropometria.grasaCorporal` → `evaluacion_antropometrica.porcentaje_grasa_corporal` (único campo que no está ya en la tabla). Los otros 8 no se migran: `evaluacion_antropometrica` ya los tiene y es la copia más reciente en el único caso divergente.
3. **Código** (`server.ts`): escritura y lectura descritas arriba; quitar `antropometria` del INSERT/UPDATE de `consultas` y del seed.
4. **Verificar en vivo**: leer la consulta 13 (debe mostrar `antropometria` completa, con `peso` ahora 86.5 — el valor vigente de la tabla, no el 85 obsoleto del JSON), editar y guardar una consulta con antropometría, confirmar que `grasaCorporal` y `porcentaje_grasa_balanza` siguen siendo independientes.
5. **Corte final**: `ALTER TABLE consultas DROP COLUMN antropometria`.

## Fuera de alcance

Ninguno. Con esta fase no queda ninguna columna JSON en la base de datos.
