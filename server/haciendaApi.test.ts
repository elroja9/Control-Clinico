import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  consultarEstadoHacienda, esperarResolucionHacienda, extraerDetalleMensajeHacienda, enviarFacturaHacienda,
  obtenerTokenHacienda, resolverEndpointsHacienda, formatoEmisorHacienda, listarComprobantesEmitidos,
  HaciendaApiError, type EndpointsHacienda
} from './haciendaApi';

const CLAVE = '5'.repeat(50);
// Endpoints inyectados: en producción salen de parametros_sistema (ver resolverEndpointsHacienda).
const ENDPOINTS: EndpointsHacienda = {
  idpTokenUrl: 'https://idp.prueba/token',
  clientId: 'cliente-prueba',
  recepcionUrl: 'https://recepcion.prueba/v1'
};
const respuesta = (status: number, body: unknown = '', headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
const mensajeHacienda = (detalle: string) =>
  Buffer.from(`<MensajeHacienda><DetalleMensaje>${detalle}</DetalleMensaje></MensajeHacienda>`).toString('base64');

afterEach(() => vi.unstubAllGlobals());

describe('resolverEndpointsHacienda', () => {
  const PARAMETROS: Record<string, string> = {
    hacienda_idp_url_sandbox: 'https://idp/sandbox',
    hacienda_idp_url_produccion: 'https://idp/prod',
    hacienda_client_id_sandbox: 'api-stag',
    hacienda_client_id_produccion: 'api-prod',
    hacienda_recepcion_url_sandbox: 'https://rec/sandbox/',
    hacienda_recepcion_url_produccion: 'https://rec/prod'
  };
  const leer = (c: string) => PARAMETROS[c];

  it('toma los parámetros del ambiente (y quita la barra final de recepción)', () => {
    expect(resolverEndpointsHacienda('SANDBOX', leer)).toEqual({ idpTokenUrl: 'https://idp/sandbox', clientId: 'api-stag', recepcionUrl: 'https://rec/sandbox' });
    expect(resolverEndpointsHacienda('PRODUCCION', leer)).toEqual({ idpTokenUrl: 'https://idp/prod', clientId: 'api-prod', recepcionUrl: 'https://rec/prod' });
  });

  it('PRUEBAS_LOCAL no necesita parámetros (nunca llama a Hacienda)', () => {
    expect(resolverEndpointsHacienda('PRUEBAS_LOCAL', () => undefined)).toEqual({ idpTokenUrl: '', clientId: '', recepcionUrl: '' });
  });

  it('un parámetro ausente o vacío falla antes de salir a la red, nombrando la clave', () => {
    expect(() => resolverEndpointsHacienda('PRODUCCION', c => (c === 'hacienda_client_id_produccion' ? '  ' : PARAMETROS[c]))).toThrow(HaciendaApiError);
    expect(() => resolverEndpointsHacienda('SANDBOX', c => (c === 'hacienda_idp_url_sandbox' ? undefined : PARAMETROS[c]))).toThrow('hacienda_idp_url_sandbox');
  });
});

describe('obtenerTokenHacienda', () => {
  it('usa la URL del IdP y el client_id inyectados', async () => {
    const f = vi.fn().mockResolvedValue(respuesta(200, { access_token: 'tok' }));
    vi.stubGlobal('fetch', f);
    expect(await obtenerTokenHacienda(ENDPOINTS, 'usuario', 'clave')).toBe('tok');
    expect(f.mock.calls[0][0]).toBe('https://idp.prueba/token');
    const body = new URLSearchParams(f.mock.calls[0][1].body);
    expect(body.get('client_id')).toBe('cliente-prueba');
    expect(body.get('grant_type')).toBe('password');
  });

  it('sin access_token lanza', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(200, {})));
    await expect(obtenerTokenHacienda(ENDPOINTS, 'u', 'c')).rejects.toThrow(HaciendaApiError);
  });
});

describe('consultarEstadoHacienda', () => {
  it('404 → no_encontrado (Hacienda no tiene esa clave)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(404)));
    expect((await consultarEstadoHacienda(ENDPOINTS, 't', CLAVE)).estado).toBe('no_encontrado');
  });

  // De "no_encontrado" depende anular sin Nota de Crédito, que es irreversible: cualquier otra
  // respuesta tiene que fallar cerrado.
  it.each([400, 401, 403, 500, 503])('%i → error, nunca no_encontrado', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(status, '', { 'X-Error-Cause': 'causa' })));
    const r = await consultarEstadoHacienda(ENDPOINTS, 't', CLAVE);
    expect(r.estado).toBe('error');
    expect(r.detalleMensaje).toBe('causa');
  });

  it('timeout o red caída → error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('t', 'TimeoutError')));
    expect((await consultarEstadoHacienda(ENDPOINTS, 't', CLAVE)).estado).toBe('error');
  });

  it('un 200 que no se entiende no prueba nada → error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(200, '<html>proxy</html>')));
    expect((await consultarEstadoHacienda(ENDPOINTS, 't', CLAVE)).estado).toBe('error');
  });

  it('rechazado trae el DetalleMensaje decodificado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(200, { 'ind-estado': 'rechazado', 'respuesta-xml': mensajeHacienda('-53 &lt;hora&gt; &amp; otro') })));
    const r = await consultarEstadoHacienda(ENDPOINTS, 't', CLAVE);
    expect(r.estado).toBe('rechazado');
    expect(r.detalleMensaje).toBe('-53 <hora> & otro');
  });

  it('el estado "error" propio de Hacienda es final: se reporta como rechazado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(200, { 'ind-estado': 'error', 'respuesta-xml': mensajeHacienda('No se pudo procesar') })));
    const r = await consultarEstadoHacienda(ENDPOINTS, 't', CLAVE);
    expect(r.estado).toBe('rechazado');
    expect(r.detalleMensaje).toBe('No se pudo procesar');
  });

  it('consulta la URL de recepción inyectada con el Bearer', async () => {
    const f = vi.fn().mockResolvedValue(respuesta(200, { 'ind-estado': 'aceptado' }));
    vi.stubGlobal('fetch', f);
    await consultarEstadoHacienda(ENDPOINTS, 't', CLAVE);
    expect(f.mock.calls[0][0]).toBe(`https://recepcion.prueba/v1/recepcion/${CLAVE}`);
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer t');
  });
});

describe('esperarResolucionHacienda', () => {
  it('se detiene en el primer estado final', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(respuesta(200, { 'ind-estado': 'procesando' }))
      .mockResolvedValueOnce(respuesta(200, { 'ind-estado': 'aceptado' }));
    vi.stubGlobal('fetch', f);
    expect((await esperarResolucionHacienda(ENDPOINTS, 't', CLAVE, { intentos: 4, esperaMs: 0, plazoMs: 12000, consultaTimeoutMs: 5000 })).estado).toBe('aceptado');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('respeta el plazo total aunque queden intentos', async () => {
    // Una Response nueva por llamada: el cuerpo de una Response solo se puede leer una vez, y con
    // mockResolvedValue la 2.ª consulta leía un cuerpo ya consumido (daba "error" en vez de "procesando").
    const f = vi.fn().mockImplementation(async () => respuesta(200, { 'ind-estado': 'procesando' }));
    vi.stubGlobal('fetch', f);
    // La función espera el intervalo ANTES de cada consulta. Con 150 ms de intervalo y 400 ms de
    // plazo caben ~2 consultas (< 4 intentos) y hay ~250 ms de margen si la máquina va cargada
    // (suite en paralelo). Con 30/50 ms la primera espera podía pasarse del plazo: inestable.
    const r = await esperarResolucionHacienda(ENDPOINTS, 't', CLAVE, { intentos: 4, esperaMs: 150, plazoMs: 400, consultaTimeoutMs: 5000 });
    expect(r.estado).toBe('procesando');
    expect(f.mock.calls.length).toBeLessThan(4);
  });
});

describe('enviarFacturaHacienda', () => {
  const envio = { endpoints: ENDPOINTS, token: 't', clave: CLAVE, fechaEmisionIso: 'x', tipoIdentificacionEmisor: '02', cedulaEmisor: '3101123456', xmlFirmado: '<a/>' };

  it('incluye X-Error-Cause cuando Hacienda rechaza la recepción con el cuerpo vacío', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(400, '', { 'X-Error-Cause': 'El comprobante ya fue recibido' })));
    const r = await enviarFacturaHacienda(envio);
    expect(r.aceptadoParaProcesar).toBe(false);
    expect(r.mensaje).toContain('El comprobante ya fue recibido');
  });

  it('202 → aceptado para procesar, contra la URL de recepción inyectada', async () => {
    const f = vi.fn().mockResolvedValue(respuesta(202));
    vi.stubGlobal('fetch', f);
    const r = await enviarFacturaHacienda(envio);
    expect(r.aceptadoParaProcesar).toBe(true);
    expect(f.mock.calls[0][0]).toBe('https://recepcion.prueba/v1/recepcion');
  });
});

describe('extraerDetalleMensajeHacienda', () => {
  it('devuelve null sin respuesta', () => {
    expect(extraerDetalleMensajeHacienda(null)).toBeNull();
  });
});

describe('formatoEmisorHacienda', () => {
  it('tipo de 2 dígitos + identificación rellenada a 12', () => {
    expect(formatoEmisorHacienda('02', '3101123456')).toBe('02003101123456');
    expect(formatoEmisorHacienda('01', '1-0234-0567')).toBe('01000102340567');
  });
  it('datos incompletos → null', () => {
    expect(formatoEmisorHacienda('2', '3101123456')).toBeNull();
    expect(formatoEmisorHacienda('02', '1234')).toBeNull();
    expect(formatoEmisorHacienda(null, null)).toBeNull();
  });
});

describe('listarComprobantesEmitidos', () => {
  const base = { token: 't', ambiente: 'SANDBOX' as const, emisor: '02003101123456', offset: 0, limit: 20, endpoints: ENDPOINTS };

  it('PRUEBAS_LOCAL no llama a Hacienda', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await listarComprobantesEmitidos({ ...base, ambiente: 'PRUEBAS_LOCAL' });
    expect(f).not.toHaveBeenCalled();
    expect(r.items).toEqual([]);
    expect(r.errorCausa).toMatch(/pruebas locales/);
  });

  it('arma la URL con offset, limit y emisor, y manda el Bearer', async () => {
    const f = vi.fn().mockResolvedValue(respuesta(200, []));
    vi.stubGlobal('fetch', f);
    await listarComprobantesEmitidos({ ...base, offset: 40 });
    expect(f.mock.calls[0][0]).toBe('https://recepcion.prueba/v1/comprobantes?offset=40&limit=20&emisor=02003101123456');
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer t');
  });

  it('interpreta un arreglo, con ind-estado, fechaEmision y partes como objeto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(200, [
      { clave: CLAVE, fechaEmision: '2026-11-20T10:00:00-06:00', 'ind-estado': 'aceptado', emisor: { nombre: 'Clínica', numeroIdentificacion: '3101123456' }, receptor: '114560789' },
      { sinClave: true }
    ], { 'X-Total-Count': '57' })));
    const r = await listarComprobantesEmitidos(base);
    expect(r.errorCausa).toBeUndefined();
    expect(r.total).toBe(57);
    expect(r.items).toEqual([{ clave: CLAVE, fecha: '2026-11-20T10:00:00-06:00', estado: 'aceptado', emisor: 'Clínica — 3101123456', receptor: '114560789' }]);
  });

  it('interpreta un objeto que contiene el arreglo y el total de Content-Range', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(200, { comprobantes: [{ clave: CLAVE, fecha: '2026-11-20', estado: 'rechazado' }] }, { 'Content-Range': 'items 0-19/245' })));
    const r = await listarComprobantesEmitidos(base);
    expect(r.total).toBe(245);
    expect(r.items[0]).toMatchObject({ clave: CLAVE, fecha: '2026-11-20', estado: 'rechazado', receptor: null });
  });

  it('un error de Hacienda expone X-Error-Cause', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(403, '', { 'X-Error-Cause': 'El header de autorización no ha sido provisto.' })));
    const r = await listarComprobantesEmitidos(base);
    expect(r.items).toEqual([]);
    expect(r.errorCausa).toBe('Hacienda respondió 403: El header de autorización no ha sido provisto.');
  });

  it('red caída o timeout no lanza: vuelve como errorCausa', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('t', 'TimeoutError')));
    const r = await listarComprobantesEmitidos(base);
    expect(r.errorCausa).toMatch(/tiempo de espera/);
  });

  it('emisor mal formado no sale a la red', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const r = await listarComprobantesEmitidos({ ...base, emisor: '3101123456' });
    expect(f).not.toHaveBeenCalled();
    expect(r.errorCausa).toMatch(/14 dígitos/);
  });
});
