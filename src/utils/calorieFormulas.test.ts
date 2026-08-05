import { describe, it, expect } from 'vitest';
import { calcularTMB, calcularPromedioSemanal, aplicarPorcentaje, FACTORES_ACTIVIDAD } from './calorieFormulas';

describe('calcularTMB', () => {
  it('Harris Benedict Obesos - hombre (peso=70, talla=175, edad=30)', () => {
    expect(calcularTMB('HARRIS_BENEDICT_OBESOS', 'M', 70, 175, 30)).toBeCloseTo(1695.667, 2);
  });

  it('Harris Benedict Obesos - mujer (peso=60, talla=165, edad=25)', () => {
    expect(calcularTMB('HARRIS_BENEDICT_OBESOS', 'F', 60, 165, 25)).toBeCloseTo(1405.333, 2);
  });

  it('Mifflin St Jeor - hombre (peso=70, talla=175, edad=30)', () => {
    expect(calcularTMB('MIFFLIN_ST_JEOR', 'M', 70, 175, 30)).toBeCloseTo(1648.75, 2);
  });

  it('Mifflin St Jeor - mujer (peso=60, talla=165, edad=25)', () => {
    expect(calcularTMB('MIFFLIN_ST_JEOR', 'F', 60, 165, 25)).toBeCloseTo(1345.25, 2);
  });

  it('Muller - hombre, no usa talla (peso=70, edad=30)', () => {
    expect(calcularTMB('MULLER', 'M', 70, 175, 30)).toBeCloseTo(1689.128, 2);
  });

  it('Muller - mujer, no usa talla (peso=60, edad=25)', () => {
    expect(calcularTMB('MULLER', 'F', 60, 165, 25)).toBeCloseTo(1353.28, 2);
  });

  it('lanza un error si la fórmula no es reconocida', () => {
    // @ts-expect-error - probando manejo de un valor inválido en runtime (ej. dato legado corrupto)
    expect(() => calcularTMB('DESCONOCIDA', 'M', 70, 175, 30)).toThrow();
  });
});

describe('calcularPromedioSemanal', () => {
  it('reproduce el ejemplo real del usuario: TMB=1187.899005, sedentario x7 dias descanso, ligera x0 dias entreno', () => {
    const promedio = calcularPromedioSemanal(1187.899005, FACTORES_ACTIVIDAD.SEDENTARIO, 7, FACTORES_ACTIVIDAD.LIGERA, 0);
    expect(promedio).toBeCloseTo(1425.478806, 3);
  });

  it('combina dias de descanso y de entrenamiento con factores distintos', () => {
    // (1500*1.2*4 + 1500*1.375*3) / 7 = (7200 + 6187.5) / 7 = 1912.5
    const promedio = calcularPromedioSemanal(1500, FACTORES_ACTIVIDAD.SEDENTARIO, 4, FACTORES_ACTIVIDAD.LIGERA, 3);
    expect(promedio).toBeCloseTo(1912.5, 3);
  });
});

describe('aplicarPorcentaje', () => {
  const promedio = 1425.478806;

  it('deficit 15% reproduce el ejemplo real del usuario', () => {
    expect(aplicarPorcentaje(promedio, 'DEFICIT', 15)).toBeCloseTo(1211.656985, 3);
  });

  it('deficit 20% reproduce el ejemplo real del usuario', () => {
    expect(aplicarPorcentaje(promedio, 'DEFICIT', 20)).toBeCloseTo(1140.383045, 3);
  });

  it('superavit 10% reproduce el ejemplo real del usuario', () => {
    expect(aplicarPorcentaje(promedio, 'SUPERAVIT', 10)).toBeCloseTo(1568.026687, 3);
  });

  it('superavit 15% reproduce el ejemplo real del usuario', () => {
    expect(aplicarPorcentaje(promedio, 'SUPERAVIT', 15)).toBeCloseTo(1639.300627, 3);
  });

  it('superavit 20% reproduce el ejemplo real del usuario', () => {
    expect(aplicarPorcentaje(promedio, 'SUPERAVIT', 20)).toBeCloseTo(1710.574567, 3);
  });

  it('mantenimiento no cambia el promedio', () => {
    expect(aplicarPorcentaje(promedio, 'MANTENIMIENTO', 0)).toBeCloseTo(promedio, 6);
  });
});

describe('FACTORES_ACTIVIDAD', () => {
  it('expone los 5 niveles con los multiplicadores correctos', () => {
    expect(FACTORES_ACTIVIDAD.SEDENTARIO).toBe(1.2);
    expect(FACTORES_ACTIVIDAD.LIGERA).toBe(1.375);
    expect(FACTORES_ACTIVIDAD.MODERADA).toBe(1.5);
    expect(FACTORES_ACTIVIDAD.MUY_ACTIVO).toBe(1.725);
    expect(FACTORES_ACTIVIDAD.EXTRA_ACTIVO).toBe(1.9);
  });
});
