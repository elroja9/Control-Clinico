import { describe, it, expect } from 'vitest';
import { normalizarWhatsapp, normalizarMensajeWhatsapp, enlaceWhatsapp } from './whatsapp';

describe('normalizarWhatsapp', () => {
  it('antepone 506 a números de 8 dígitos y quita símbolos', () => {
    expect(normalizarWhatsapp('8888-8888')).toBe('50688888888');
    expect(normalizarWhatsapp(' 8888 8888 ')).toBe('50688888888');
  });

  it('conserva números con código de país', () => {
    expect(normalizarWhatsapp('+506 8888-8888')).toBe('50688888888');
    expect(normalizarWhatsapp('+1 (415) 555-2671')).toBe('14155552671');
  });

  it('vacío o nulo da null', () => {
    expect(normalizarWhatsapp('')).toBeNull();
    expect(normalizarWhatsapp('  ')).toBeNull();
    expect(normalizarWhatsapp(null)).toBeNull();
    expect(normalizarWhatsapp(undefined)).toBeNull();
  });

  it('rechaza menos de 8 o más de 15 dígitos', () => {
    expect(() => normalizarWhatsapp('1234567')).toThrow(/entre 8 y 15/);
    expect(() => normalizarWhatsapp('1234567890123456')).toThrow(/entre 8 y 15/);
  });
});

describe('normalizarMensajeWhatsapp', () => {
  it('recorta a 500 caracteres y vacío da null', () => {
    expect(normalizarMensajeWhatsapp('x'.repeat(600))).toHaveLength(500);
    expect(normalizarMensajeWhatsapp('   ')).toBeNull();
    expect(normalizarMensajeWhatsapp(null)).toBeNull();
    expect(normalizarMensajeWhatsapp(' Hola ')).toBe('Hola');
  });
});

describe('enlaceWhatsapp', () => {
  it('codifica el mensaje', () => {
    expect(enlaceWhatsapp('50688888888', 'Hola & adiós')).toBe('https://wa.me/50688888888?text=Hola%20%26%20adi%C3%B3s');
  });

  it('sin número devuelve null', () => {
    expect(enlaceWhatsapp(null, 'Hola')).toBeNull();
    expect(enlaceWhatsapp('', 'Hola')).toBeNull();
  });
});
