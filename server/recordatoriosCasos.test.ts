import { describe, it, expect } from 'vitest';
import { tocaRecordatorio } from './recordatoriosCasos';

// Costa Rica = UTC-6 todo el año: 15:00Z son las 9:00 a. m. en CR.
const base = { estado: 'ABIERTO' as const, recordatorioCadaDias: 7, ultimoRecordatorioEn: null as string | null };
const a = (iso: string) => new Date(iso);
const nueveAmCR = a('2026-10-19T15:00:00Z');

describe('tocaRecordatorio', () => {
  it('primer envío en horario hábil', () => expect(tocaRecordatorio(base, 2, nueveAmCR)).toBe(true));
  it('caso cerrado no', () => expect(tocaRecordatorio({ ...base, estado: 'CERRADO' }, 2, nueveAmCR)).toBe(false));
  it('sin pendientes no', () => expect(tocaRecordatorio(base, 0, nueveAmCR)).toBe(false));
  it('frecuencia 0 = apagado', () => expect(tocaRecordatorio({ ...base, recordatorioCadaDias: 0 }, 2, nueveAmCR)).toBe(false));
  it('7:59 CR todavía no', () => expect(tocaRecordatorio(base, 2, a('2026-10-19T13:59:00Z'))).toBe(false));
  it('8:00 CR sí', () => expect(tocaRecordatorio(base, 2, a('2026-10-19T14:00:00Z'))).toBe(true));
  it('18:00 CR ya no', () => expect(tocaRecordatorio(base, 2, a('2026-10-20T00:00:00Z'))).toBe(false));
  it('antes de N días no', () =>
    expect(tocaRecordatorio({ ...base, ultimoRecordatorioEn: '2026-10-13T16:00:00.000Z' }, 2, nueveAmCR)).toBe(false));
  it('al cumplirse N días calendario sí, aunque sea más temprano que el envío anterior', () =>
    expect(tocaRecordatorio({ ...base, ultimoRecordatorioEn: '2026-10-12T22:00:00.000Z' }, 2, nueveAmCR)).toBe(true));
  it('usa el día CR del último envío (05:30Z del 12 = 23:30 CR del 11)', () =>
    expect(tocaRecordatorio({ ...base, ultimoRecordatorioEn: '2026-10-12T05:30:00.000Z' }, 2, nueveAmCR)).toBe(true));
});
