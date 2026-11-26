import { describe, it, expect } from 'vitest';
import {
  escaparTextoIcs,
  plegarLineaIcs,
  fechaHoraCRaUtc,
  formatoFechaIcs,
  inicialesDe,
  uidDeCita,
  eventoDesdeCita,
  generarCalendarioIcs,
  type CitaIcs,
  type OpcionesEvento,
} from './ics';

const AHORA = new Date('2026-11-26T12:00:00Z');

const cita: CitaIcs & { notas: string } = {
  id: 42,
  fechaHora: '2026-12-01T09:00',
  duracionMinutos: 60,
  estadoCita: 'CONFIRMADA',
  tipoVisita: 'CONSULTORIO',
  direccionDomicilio: null,
  notas: 'NOTA-CLINICA-SECRETA diabetes',
};

const opciones: OpcionesEvento = {
  audiencia: 'PROFESIONAL',
  nombreClinica: 'Clínica Sol',
  servicio: 'Fisioterapia',
  nombrePaciente: 'María José Rodríguez',
  telefonoPaciente: '88887777',
  ahora: AHORA,
};

describe('escaparTextoIcs', () => {
  it('escapa barra, punto y coma, coma y saltos de línea', () => {
    expect(escaparTextoIcs('a\\b;c,d\ne\r\nf')).toBe('a\\\\b\\;c\\,d\\ne\\nf');
  });
});

describe('plegarLineaIcs', () => {
  it('no toca líneas cortas', () => {
    expect(plegarLineaIcs('SUMMARY:hola')).toBe('SUMMARY:hola');
  });

  it('ninguna línea supera 75 octetos y al desplegar se recupera el original', () => {
    const larga = 'DESCRIPTION:' + 'ñandú áéíóú '.repeat(30);
    const plegada = plegarLineaIcs(larga);
    for (const l of plegada.split('\r\n')) {
      expect(Buffer.byteLength(l, 'utf8')).toBeLessThanOrEqual(75);
    }
    expect(plegada.split('\r\n').slice(1).every(l => l.startsWith(' '))).toBe(true);
    expect(plegada.replace(/\r\n /g, '')).toBe(larga);
  });
});

describe('conversión de hora', () => {
  it('hora de Costa Rica a UTC (+6 h)', () => {
    expect(formatoFechaIcs(fechaHoraCRaUtc('2026-12-01T09:00'))).toBe('20261201T150000Z');
  });
  it('cruza de día', () => {
    expect(formatoFechaIcs(fechaHoraCRaUtc('2026-12-31T20:30'))).toBe('20270101T023000Z');
  });
});

describe('inicialesDe', () => {
  it('genera iniciales con puntos', () => {
    expect(inicialesDe('María José Rodríguez')).toBe('M.J.R.');
  });
});

describe('eventoDesdeCita / generarCalendarioIcs', () => {
  const ics = (c: CitaIcs, o = opciones) =>
    generarCalendarioIcs({ nombreCalendario: 'Citas', eventos: [eventoDesdeCita(c, o)] });

  it('UID estable por cita', () => {
    expect(uidDeCita(42)).toBe('cita-42@control-clinico');
    expect(uidDeCita(42, 'ejemplo.com')).toBe('cita-42@ejemplo.com');
    expect(eventoDesdeCita(cita, opciones).uid).toBe(eventoDesdeCita(cita, { ...opciones, ahora: new Date() }).uid);
  });

  it('usa CRLF, fechas UTC y los encabezados de suscripción', () => {
    const out = ics(cita);
    expect(out).toContain('\r\n');
    expect(out.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(out).toContain('DTSTART:20261201T150000Z');
    expect(out).toContain('DTEND:20261201T160000Z');
    expect(out).toContain('X-WR-TIMEZONE:America/Costa_Rica');
    expect(out).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT15M');
    expect(out).toContain('X-PUBLISHED-TTL:PT15M');
    expect(out).toContain('TRIGGER:-PT30M');
    expect(out).toContain('STATUS:CONFIRMED');
    expect(out).toContain('LOCATION:Consultorio Clínica Sol');
  });

  it('STATUS según el estado de la cita', () => {
    expect(ics({ ...cita, estadoCita: 'PROGRAMADA' })).toContain('STATUS:TENTATIVE');
    const cancelada = ics({ ...cita, estadoCita: 'CANCELADA' });
    expect(cancelada).toContain('STATUS:CANCELLED');
    expect(cancelada).not.toContain('VALARM');
  });

  it('con nombre completo apagado el título usa iniciales y no hay nombre ni teléfono', () => {
    const out = ics(cita);
    expect(out).toContain('SUMMARY:Fisioterapia · M.J.R.');
    expect(out).not.toContain('María');
    expect(out).not.toContain('Rodríguez');
    expect(out).not.toContain('88887777');
  });

  it('con nombre completo encendido muestra nombre y teléfono', () => {
    const out = ics(cita, { ...opciones, nombreCompleto: true }).replace(/\r\n /g, '');
    expect(out).toContain('SUMMARY:Fisioterapia · María José Rodríguez');
    expect(out).toContain('Teléfono: 88887777');
  });

  it('nunca incluye las notas', () => {
    const casos: OpcionesEvento[] = [opciones, { ...opciones, nombreCompleto: true }, { ...opciones, audiencia: 'PACIENTE' }];
    for (const o of casos) {
      const out = ics(cita, o);
      expect(out).not.toContain('NOTA-CLINICA');
      expect(out).not.toContain('diabetes');
    }
  });

  it('domicilio usa la dirección como ubicación', () => {
    const out = ics({ ...cita, tipoVisita: 'DOMICILIO', direccionDomicilio: 'Barrio Escalante, casa 5' });
    expect(out).toContain('LOCATION:Barrio Escalante\\, casa 5');
  });

  it('correo al paciente: METHOD, título con la clínica y misma UID con SEQUENCE creciente', () => {
    const base: OpcionesEvento = { ...opciones, audiencia: 'PACIENTE' };
    const e1 = eventoDesdeCita(cita, { ...base, sequence: 1000 });
    const e2 = eventoDesdeCita(cita, { ...base, sequence: 1001, cancelar: true });
    const req = generarCalendarioIcs({ nombreCalendario: 'x', eventos: [e1], metodo: 'REQUEST' });
    const can = generarCalendarioIcs({ nombreCalendario: 'x', eventos: [e2], metodo: 'CANCEL' });
    expect(req).toContain('METHOD:REQUEST');
    expect(req).toContain('SUMMARY:Cita en Clínica Sol · Fisioterapia');
    expect(req).not.toContain('X-WR-CALNAME');
    expect(can).toContain('METHOD:CANCEL');
    expect(can).toContain('STATUS:CANCELLED');
    expect(e1.uid).toBe(e2.uid);
    expect(e2.sequence).toBeGreaterThan(e1.sequence);
  });
});
