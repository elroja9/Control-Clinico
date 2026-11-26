import { describe, it, expect } from 'vitest';
import { decidirAccesoContador, crearCacheUsuarios, sesionDesdeUsuario } from './accesoContador';

describe('decidirAccesoContador', () => {
  it('permite rutas financieras en minúsculas', () => {
    expect(decidirAccesoContador('GET', '/api/facturas')).toBe('permitido');
  });
  it('bloquea pacientes sin importar mayúsculas', () => {
    expect(decidirAccesoContador('GET', '/api/patients')).toBe('prohibido');
    expect(decidirAccesoContador('GET', '/API/patients')).toBe('prohibido');
    expect(decidirAccesoContador('GET', '/Api/Patients')).toBe('prohibido');
    expect(decidirAccesoContador('GET', '/api/patients/')).toBe('prohibido');
  });
  it('bloquea rutas codificadas con %', () => {
    expect(decidirAccesoContador('GET', '/api/%70atients')).toBe('prohibido');
  });
  it('marca como inválida una codificación rota', () => {
    expect(decidirAccesoContador('GET', '/api/%E0%A4%A')).toBe('invalida');
  });
  it('permite las consultas GET a Hacienda', () => {
    for (const ruta of [
      '/api/hacienda/cabys', '/api/hacienda/cabys/sugeridos', '/api/hacienda/tipo-cambio',
      '/api/hacienda/contribuyente/3101123456', '/api/hacienda/exoneracion/AL-00020402-24',
      '/api/hacienda/comprobantes', '/api/hacienda/comprobantes/' + '5'.repeat(50), '/API/Hacienda/Tipo-Cambio/'
    ]) {
      expect(decidirAccesoContador('GET', ruta)).toBe('permitido');
    }
  });
  it('bloquea métodos de escritura y rutas no listadas bajo /api/hacienda', () => {
    expect(decidirAccesoContador('POST', '/api/hacienda/comprobantes')).toBe('prohibido');
    expect(decidirAccesoContador('DELETE', '/api/hacienda/cabys')).toBe('prohibido');
    expect(decidirAccesoContador('GET', '/api/hacienda/otra')).toBe('prohibido');
    expect(decidirAccesoContador('GET', '/api/hacienda/contribuyente/1/extra')).toBe('prohibido');
    expect(decidirAccesoContador('POST', '/api/hacienda-config/3')).toBe('prohibido');
  });
  it('rutas fuera de /api no se filtran', () => {
    expect(decidirAccesoContador('GET', '/assets/x.js')).toBe('no-api');
  });
});

describe('caché de usuario vigente', () => {
  it('expira por TTL e invalida', () => {
    let t = 0;
    const c = crearCacheUsuarios(60_000, () => t);
    c.set(1, { id: 1, rol: 'Contador', idCompania: 2, activo: true });
    expect(c.get(1)?.rol).toBe('Contador');
    t = 60_001;
    expect(c.get(1)).toBeUndefined();
    c.set(1, null);
    c.invalidate(1);
    expect(c.get(1)).toBeUndefined();
  });
  it('usuario desactivado o inexistente no tiene sesión (401)', () => {
    expect(sesionDesdeUsuario({ id: 1, rol: 'Profesional', idCompania: 2, activo: false })).toBeNull();
    expect(sesionDesdeUsuario(null)).toBeNull();
    expect(sesionDesdeUsuario({ id: 1, rol: 'Profesional', idCompania: 3, activo: true })).toEqual({ userId: 1, idCompania: 3, rol: 'Profesional', sv: 0 });
  });

  it('un token con versión de sesión anterior (contraseña cambiada) no tiene sesión', () => {
    const u = { id: 1, rol: 'Profesional' as const, idCompania: 3, activo: true, sesionVersion: 2 };
    expect(sesionDesdeUsuario(u, 1)).toBeNull();
    expect(sesionDesdeUsuario(u, 2)).toEqual({ userId: 1, idCompania: 3, rol: 'Profesional', sv: 2 });
    // Tokens antiguos sin versión cuentan como 0: valen solo si el usuario nunca cambió la clave.
    expect(sesionDesdeUsuario({ ...u, sesionVersion: 0 }, 0)).not.toBeNull();
  });
});
