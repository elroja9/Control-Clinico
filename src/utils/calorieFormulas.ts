export type FormulaTMB = 'HARRIS_BENEDICT_OBESOS' | 'MIFFLIN_ST_JEOR' | 'MULLER';
export type Sexo = 'M' | 'F';
export type DireccionPrescripcion = 'DEFICIT' | 'SUPERAVIT' | 'MANTENIMIENTO';

export const FACTORES_ACTIVIDAD = {
  SEDENTARIO: 1.2,
  LIGERA: 1.375,
  MODERADA: 1.5,
  MUY_ACTIVO: 1.725,
  EXTRA_ACTIVO: 1.9,
} as const;

// Peso en kg, talla en cm, edad en años. Se usa el peso real del paciente
// (sin peso ajustado/corregido) en las 3 fórmulas — confirmado con el usuario.
export function calcularTMB(formula: FormulaTMB, sexo: Sexo, peso: number, talla: number, edad: number): number {
  switch (formula) {
    case 'HARRIS_BENEDICT_OBESOS':
      return sexo === 'M'
        ? 88.362 + 13.397 * peso + 4.799 * talla - 5.677 * edad
        : 447.593 + 9.247 * peso + 3.098 * talla - 4.330 * edad;
    case 'MIFFLIN_ST_JEOR':
      return sexo === 'M'
        ? 10 * peso + 6.25 * talla - 5 * edad + 5
        : 10 * peso + 6.25 * talla - 5 * edad - 161;
    case 'MULLER':
      // No usa talla.
      return sexo === 'M'
        ? (0.047 * peso - 0.01452 * edad + 3.21 + 1.009) * 238.8
        : (0.047 * peso - 0.01452 * edad + 3.21) * 238.8;
  }
}

export function calcularPromedioSemanal(
  tmb: number,
  factorActividadDescanso: number,
  diasDescanso: number,
  factorActividadEntreno: number,
  diasEntrenamiento: number
): number {
  return (tmb * factorActividadDescanso * diasDescanso + tmb * factorActividadEntreno * diasEntrenamiento) / 7;
}

export function aplicarPorcentaje(promedio: number, direccion: DireccionPrescripcion, porcentaje: number): number {
  if (direccion === 'DEFICIT') return promedio * (1 - porcentaje / 100);
  if (direccion === 'SUPERAVIT') return promedio * (1 + porcentaje / 100);
  return promedio;
}
