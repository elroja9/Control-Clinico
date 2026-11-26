import { describe, it, expect } from 'vitest';
import { slotLibre, haySolapeConCitas, validarTransicionEstado, fechaHoraEsPasada, esFechaHoraValida } from './citasReglas';

const tramos = [{ abre: '08:00', cierra: '18:00' }];

const base = { duracionMin: 60, bloqueosDelDia: [], fecha: '2030-01-15', tramos };

describe('slotLibre', () => {
  it('una cita CANCELADA no bloquea el horario', () => {
    const citasDelDia = [
      { id: 1, fechaHora: '2030-01-15T10:00', duracionMinutos: 60, tipoVisita: 'CONSULTORIO', tiempoTrasladoMinutos: null, estadoCita: 'CANCELADA' }
    ];
    expect(slotLibre({ ...base, citasDelDia, candidatoInicioMin: 600, horaCandidato: '10:00' })).toBe(true);
  });

  it('una cita PROGRAMADA sí bloquea el horario', () => {
    const citasDelDia = [
      { id: 1, fechaHora: '2030-01-15T10:00', duracionMinutos: 60, tipoVisita: 'CONSULTORIO', tiempoTrasladoMinutos: null, estadoCita: 'PROGRAMADA' }
    ];
    expect(slotLibre({ ...base, citasDelDia, candidatoInicioMin: 630, horaCandidato: '10:30' })).toBe(false);
  });

  it('el traslado de una cita a domicilio reserva tiempo antes y después', () => {
    const citasDelDia = [
      { id: 1, fechaHora: '2030-01-15T10:00', duracionMinutos: 60, tipoVisita: 'DOMICILIO', tiempoTrasladoMinutos: 30, estadoCita: 'CONFIRMADA' }
    ];
    // Termina 11:00 + 30 de traslado = 11:30: a las 11:00 choca, a las 11:30 ya está libre.
    expect(slotLibre({ ...base, citasDelDia, candidatoInicioMin: 660, horaCandidato: '11:00' })).toBe(false);
    expect(slotLibre({ ...base, citasDelDia, candidatoInicioMin: 690, horaCandidato: '11:30' })).toBe(true);
    // Antes: debe terminar a las 9:30 (10:00 - 30). Una de 60 min desde las 8:30 termina 9:30 -> libre.
    expect(slotLibre({ ...base, citasDelDia, candidatoInicioMin: 510, horaCandidato: '08:30' })).toBe(true);
    expect(slotLibre({ ...base, citasDelDia, candidatoInicioMin: 540, horaCandidato: '09:00' })).toBe(false);
  });

  it('rechaza una cita que no cabe antes del cierre', () => {
    expect(slotLibre({ ...base, citasDelDia: [], candidatoInicioMin: 17 * 60 + 30, horaCandidato: '17:30' })).toBe(false);
  });
});

describe('haySolapeConCitas', () => {
  const citas = [
    { id: 7, fechaHora: '2030-01-15T10:00', duracionMinutos: 45, tipoVisita: 'CONSULTORIO', tiempoTrasladoMinutos: null, estadoCita: 'PROGRAMADA' }
  ];
  it('excluye la propia cita al editar', () => {
    expect(haySolapeConCitas({ candidatoInicioMin: 600, duracionMin: 45, fecha: '2030-01-15', citasDelDia: citas, excluirId: 7 })).toBe(false);
    expect(haySolapeConCitas({ candidatoInicioMin: 600, duracionMin: 45, fecha: '2030-01-15', citasDelDia: citas, excluirId: 8 })).toBe(true);
  });
  it('citas pegadas (sin traslape) no chocan', () => {
    expect(haySolapeConCitas({ candidatoInicioMin: 645, duracionMin: 30, fecha: '2030-01-15', citasDelDia: citas })).toBe(false);
  });
  it('ignora citas de otro día', () => {
    expect(haySolapeConCitas({ candidatoInicioMin: 600, duracionMin: 45, fecha: '2030-01-16', citasDelDia: citas })).toBe(false);
  });
});

describe('validarTransicionEstado', () => {
  it('no permite CANCELADA -> COMPLETADA', () => {
    expect(validarTransicionEstado('CANCELADA', 'COMPLETADA')).toMatch(/cancelada/i);
  });
  it('no permite cancelar una COMPLETADA facturada, pero sí una no facturada', () => {
    expect(validarTransicionEstado('COMPLETADA', 'CANCELADA', { facturada: true })).toMatch(/facturad/i);
    expect(validarTransicionEstado('COMPLETADA', 'CANCELADA', { facturada: false })).toBeNull();
  });
  it('permite transiciones normales y crear', () => {
    expect(validarTransicionEstado(null, 'PROGRAMADA')).toBeNull();
    expect(validarTransicionEstado('PROGRAMADA', 'CONFIRMADA')).toBeNull();
    expect(validarTransicionEstado('CONFIRMADA', 'COMPLETADA')).toBeNull();
    expect(validarTransicionEstado('CANCELADA', 'PROGRAMADA')).toBeNull();
    expect(validarTransicionEstado('CANCELADA', 'CANCELADA')).toBeNull();
  });
});

describe('fechas', () => {
  it('fechaHoraEsPasada usa la hora de Costa Rica (UTC-6)', () => {
    // 2030-01-15T16:00Z = 10:00 en Costa Rica
    const ahora = new Date('2030-01-15T16:00:00Z');
    expect(fechaHoraEsPasada('2030-01-15T09:59', ahora)).toBe(true);
    expect(fechaHoraEsPasada('2030-01-15T10:00', ahora)).toBe(false);
    expect(fechaHoraEsPasada('2030-01-15T10:30', ahora)).toBe(false);
  });
  it('esFechaHoraValida', () => {
    expect(esFechaHoraValida('2030-01-15T10:00')).toBe(true);
    expect(esFechaHoraValida('2030-02-31T10:00')).toBe(false);
    expect(esFechaHoraValida('2030-01-15 10:00')).toBe(false);
    expect(esFechaHoraValida(undefined)).toBe(false);
  });
});
