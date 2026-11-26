import { describe, it, expect, vi, afterEach } from 'vitest';
import { cabys, contribuyente, tipoCambio, exoneracion, HaciendaPublicaError } from './haciendaPublica';

const BASE = 'https://publica.prueba/';
const respuesta = (status: number, body: unknown = '', headers: Record<string, string> = {}) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });

afterEach(() => vi.unstubAllGlobals());

describe('cabys', () => {
  it('búsqueda por texto: Hacienda devuelve un objeto; se normaliza y se pide top=max', async () => {
    const f = vi.fn().mockResolvedValue(respuesta(200, {
      total: 2, cantidad: 2,
      cabys: [
        { codigo: '9310210150420', descripcion: 'Masaje de cuerpo entero', impuesto: 4, categorias: ['x'] },
        { codigo: '9310210030201', descripcion: 'Masaje de tronco', impuesto: '13' }
      ]
    }));
    vi.stubGlobal('fetch', f);
    const r = await cabys(BASE, ' masaje ', 20);
    expect(f.mock.calls[0][0]).toBe('https://publica.prueba/fe/cabys?q=masaje&top=20');
    expect(r.total).toBe(2);
    expect(r.items).toEqual([
      { codigo: '9310210150420', descripcion: 'Masaje de cuerpo entero', impuesto: 4 },
      { codigo: '9310210030201', descripcion: 'Masaje de tronco', impuesto: 13 }
    ]);
  });

  it('búsqueda por código de 13 dígitos: Hacienda devuelve un arreglo', async () => {
    const f = vi.fn().mockResolvedValue(respuesta(200, [{ codigo: '9310210150420', descripcion: 'Masaje de cuerpo entero', impuesto: 4 }]));
    vi.stubGlobal('fetch', f);
    const r = await cabys(BASE, '9310210150420', 20);
    expect(f.mock.calls[0][0]).toBe('https://publica.prueba/fe/cabys?codigo=9310210150420');
    expect(r.items).toEqual([{ codigo: '9310210150420', descripcion: 'Masaje de cuerpo entero', impuesto: 4 }]);
  });

  it('respeta el máximo aunque Hacienda devuelva más', async () => {
    const muchos = Array.from({ length: 5 }, (_, i) => ({ codigo: `931021015042${i}`, descripcion: `d${i}`, impuesto: 13 }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(200, { total: 5, cabys: muchos })));
    expect((await cabys(BASE, 'masaje', 2)).items).toHaveLength(2);
  });

  it('término demasiado corto no sale a la red', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(cabys(BASE, 'ma', 20)).rejects.toMatchObject({ status: 400 });
    expect(f).not.toHaveBeenCalled();
  });

  it('sin URL base configurada falla', async () => {
    await expect(cabys('', 'masaje', 20)).rejects.toBeInstanceOf(HaciendaPublicaError);
  });

  it('Hacienda caída → 502 con X-Error-Cause', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(503, '', { 'X-Error-Cause': 'mantenimiento' })));
    await expect(cabys(BASE, 'masaje', 20)).rejects.toMatchObject({ status: 502, message: 'Hacienda respondió 503: mantenimiento' });
  });
});

describe('contribuyente', () => {
  it('normaliza nombre, régimen, situación y actividades', async () => {
    const f = vi.fn().mockResolvedValue(respuesta(200, {
      nombre: 'PERSONA DE PRUEBA', tipoIdentificacion: '01',
      regimen: { codigo: 1, descripcion: 'Régimen General' },
      situacion: { moroso: 'NO', omiso: 'SI', estado: 'Inscrito', administracionTributaria: 'San José' },
      actividades: [{ estado: 'A', tipo: 'P', codigo: '869901', descripcion: 'Fisioterapia' }]
    }));
    vi.stubGlobal('fetch', f);
    const r = await contribuyente(BASE, '2-1000-42005');
    expect(f.mock.calls[0][0]).toBe('https://publica.prueba/fe/ae?identificacion=2100042005');
    expect(r).toEqual({
      nombre: 'PERSONA DE PRUEBA', tipoIdentificacion: '01',
      regimen: { codigo: '1', descripcion: 'Régimen General' },
      situacion: { moroso: false, omiso: true, estado: 'Inscrito', administracionTributaria: 'San José' },
      actividades: [{ codigo: '869901', descripcion: 'Fisioterapia', estado: 'A', tipo: 'P' }]
    });
  });

  it.each(['12345678', '1234567890123', 'ABC123456'])('identificación inválida %s → 400 sin llamar', async (id) => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(contribuyente(BASE, id)).rejects.toMatchObject({ status: 400 });
    expect(f).not.toHaveBeenCalled();
  });

  it('404 → no encontrado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(404, { code: 404 })));
    await expect(contribuyente(BASE, '310112345678')).rejects.toMatchObject({ status: 404 });
  });
});

describe('tipoCambio', () => {
  it('normaliza dólar compra/venta y euro', async () => {
    const f = vi.fn().mockResolvedValue(respuesta(200, {
      dolar: { venta: { fecha: '2026-11-26 00:00:00', valor: 512.3 }, compra: { fecha: '2026-11-26 00:00:00', valor: 505.1 } },
      euro: { fecha: '2026-11-26 00:00:00', dolares: 1.05, colones: 537.9 }
    }));
    vi.stubGlobal('fetch', f);
    const r = await tipoCambio(BASE);
    expect(f.mock.calls[0][0]).toBe('https://publica.prueba/indicadores/tc');
    expect(r).toEqual({
      dolar: { compra: { fecha: '2026-11-26 00:00:00', valor: 505.1 }, venta: { fecha: '2026-11-26 00:00:00', valor: 512.3 } },
      euro: { fecha: '2026-11-26 00:00:00', dolares: 1.05, colones: 537.9 }
    });
  });

  it('respuesta sin dólar ni euro → 502', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(200, {})));
    await expect(tipoCambio(BASE)).rejects.toMatchObject({ status: 502 });
  });
});

describe('exoneracion', () => {
  it('404 de Hacienda → «no encontrada»', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(404, { code: 404, status: 'Information no available for the search' })));
    const p = exoneracion(BASE, 'AL-00020402-24');
    await expect(p).rejects.toBeInstanceOf(HaciendaPublicaError);
    await expect(p).rejects.toMatchObject({ status: 404 });
    await expect(p).rejects.toThrow(/no encontrada/);
  });

  it('existente: campos conocidos más la respuesta cruda', async () => {
    const cuerpo = { numeroDocumento: 'AL-00020402-24', identificacion: '3101123456', porcentajeExoneracion: 100, fechaEmision: '2024-01-01', fechaVencimiento: '2027-01-01', cabys: ['9310210150420'], tipoDocumento: { codigo: '03', descripcion: 'Autorización' }, nombreInstitucion: 'Ministerio', extra: 'x' };
    const f = vi.fn().mockResolvedValue(respuesta(200, cuerpo));
    vi.stubGlobal('fetch', f);
    const r = await exoneracion(BASE, 'AL-00020402-24');
    expect(f.mock.calls[0][0]).toBe('https://publica.prueba/fe/ex?autorizacion=AL-00020402-24');
    expect(r).toMatchObject({ numeroDocumento: 'AL-00020402-24', porcentajeExoneracion: 100, cabys: ['9310210150420'], tipoDocumento: 'Autorización', nombreInstitucion: 'Ministerio' });
    expect(r.crudo).toEqual(cuerpo);
  });

  it.each(['', 'a', 'AL 0002', '<script>', 'AL/0002/24', 'A'.repeat(41)])('autorización inválida %j → 400 sin llamar', async (a) => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(exoneracion(BASE, a)).rejects.toMatchObject({ status: 400 });
    expect(f).not.toHaveBeenCalled();
  });
});
