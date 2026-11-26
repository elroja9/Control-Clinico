import { describe, it, expect } from 'vitest';
import { errorDatosFiscalesAlta, ubicacionValida } from './datosFiscales';
import { TIPOS_IDENTIFICACION, esTipoIdentificacion, soloDigitosIdentificacion, errorIdentificacion } from './identificacion';

const alta = {
  tipoIdentificacion: '01',
  identificacion: '1-0234-0567',
  razonSocial: 'Ana Mora Solís',
  correoEmisor: 'ana@ejemplo.cr',
  provincia: '1', canton: '01', distrito: '01'
};

describe('errorDatosFiscalesAlta', () => {
  it('acepta un alta completa', () => {
    expect(errorDatosFiscalesAlta(alta)).toBeNull();
  });

  it('valida el largo según el tipo (física 9, jurídica 10, DIMEX 11-12, NITE 10)', () => {
    expect(errorDatosFiscalesAlta({ ...alta, tipoIdentificacion: '02' })).toMatch(/10 dígitos; esta tiene 9/);
    expect(errorDatosFiscalesAlta({ ...alta, tipoIdentificacion: '03', identificacion: '155812345678' })).toBeNull();
    expect(errorDatosFiscalesAlta({ ...alta, tipoIdentificacion: '04', identificacion: '3001123456' })).toBeNull();
    expect(errorDatosFiscalesAlta({ ...alta, tipoIdentificacion: '' })).toMatch(/tipo de identificación/);
  });

  it('exige razón social, correo y una ubicación del catálogo', () => {
    expect(errorDatosFiscalesAlta({ ...alta, razonSocial: '  ' })).toMatch(/razón social/);
    expect(errorDatosFiscalesAlta({ ...alta, correoEmisor: 'sin-arroba' })).toMatch(/correo/);
    expect(errorDatosFiscalesAlta({ ...alta, provincia: '' })).toMatch(/provincia/);
    expect(errorDatosFiscalesAlta({ ...alta, distrito: '99' })).toMatch(/provincia/);
    expect(ubicacionValida('1', '02', '01')).toBe(true);
  });
});

describe('catálogo de tipos de identificación', () => {
  it('ofrece los cuatro tipos de Hacienda y normaliza a dígitos', () => {
    expect(TIPOS_IDENTIFICACION.map(t => t.codigo)).toEqual(['01', '02', '03', '04']);
    expect(esTipoIdentificacion('02')).toBe(true);
    expect(esTipoIdentificacion('05')).toBe(false);
    expect(esTipoIdentificacion('__proto__')).toBe(false);
    expect(soloDigitosIdentificacion(' 3-101-123456 ')).toBe('3101123456');
    expect(errorIdentificacion('03', '12345678901')).toBeNull();
  });
});
