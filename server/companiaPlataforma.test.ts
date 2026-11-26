import { describe, it, expect, afterEach } from 'vitest';
import {
  CLAVE_ID_COMPANIA_PLATAFORMA,
  idCompaniaPlataforma,
  establecerIdCompaniaPlataforma,
  idPlataformaDesdeParametros,
  esCompaniaPlataforma
} from './companiaPlataforma';
import { isSaasAdmin } from './auth';

const idInicial = idCompaniaPlataforma();
afterEach(() => establecerIdCompaniaPlataforma(idInicial));

describe('idPlataformaDesdeParametros', () => {
  it('lee el entero configurado', () => {
    expect(idPlataformaDesdeParametros([{ clave: CLAVE_ID_COMPANIA_PLATAFORMA, valor: '12' }])).toBe(12);
    expect(idPlataformaDesdeParametros([{ clave: 'otra', valor: '3' }, { clave: CLAVE_ID_COMPANIA_PLATAFORMA, valor: ' 9 ' }])).toBe(9);
  });
  it('devuelve null si falta o no es un entero positivo', () => {
    expect(idPlataformaDesdeParametros([])).toBeNull();
    for (const valor of ['', 'abc', '0', '-3', '7.5', '1e2']) {
      expect(idPlataformaDesdeParametros([{ clave: CLAVE_ID_COMPANIA_PLATAFORMA, valor }])).toBeNull();
    }
  });
});

describe('establecerIdCompaniaPlataforma / esCompaniaPlataforma', () => {
  it('usa el id vigente, también cuando llega como texto', () => {
    establecerIdCompaniaPlataforma(42);
    expect(idCompaniaPlataforma()).toBe(42);
    expect(esCompaniaPlataforma(42)).toBe(true);
    expect(esCompaniaPlataforma('42')).toBe(true);
    expect(esCompaniaPlataforma(41)).toBe(false);
    expect(esCompaniaPlataforma(null)).toBe(false);
    expect(esCompaniaPlataforma(undefined)).toBe(false);
    expect(esCompaniaPlataforma('')).toBe(false);
  });
  it('rechaza ids inválidos sin cambiar el vigente', () => {
    establecerIdCompaniaPlataforma(5);
    expect(() => establecerIdCompaniaPlataforma(0)).toThrow();
    expect(() => establecerIdCompaniaPlataforma(NaN)).toThrow();
    expect(() => establecerIdCompaniaPlataforma(2.5)).toThrow();
    expect(idCompaniaPlataforma()).toBe(5);
  });
  it('isSaasAdmin sigue al id vigente', () => {
    establecerIdCompaniaPlataforma(3);
    expect(isSaasAdmin({ userId: 1, idCompania: 3, rol: 'Administrador' })).toBe(true);
    expect(isSaasAdmin({ userId: 1, idCompania: 3, rol: 'Profesional' })).toBe(false);
    expect(isSaasAdmin({ userId: 1, idCompania: 4, rol: 'Administrador' })).toBe(false);
    expect(isSaasAdmin(null)).toBe(false);
  });
});
