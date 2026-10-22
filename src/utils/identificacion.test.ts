import { describe, it, expect } from 'vitest';
import { errorIdentificacion } from './identificacion';

describe('errorIdentificacion', () => {
  it('acepta cada tipo con su largo, con o sin guiones', () => {
    expect(errorIdentificacion('01', '1-0100-0200')).toBeNull();
    expect(errorIdentificacion('02', '3-101-000111')).toBeNull();
    expect(errorIdentificacion('03', '155812345678')).toBeNull();
    expect(errorIdentificacion('04', '3001123456')).toBeNull();
  });

  it('rechaza largos que no calzan, letras y tipos desconocidos', () => {
    expect(errorIdentificacion('02', '1-0100-0200')).toMatch(/10 dígitos; esta tiene 9/);
    expect(errorIdentificacion('01', '1-0100-02AB')).toMatch(/solo lleva números/);
    expect(errorIdentificacion('09', '123')).toMatch(/Tipo de identificación/);
  });
});
