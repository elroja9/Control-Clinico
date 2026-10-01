import { describe, it, expect, vi, afterEach } from 'vitest';
import { consultarEstadoHacienda, esperarResolucionHacienda, extraerDetalleMensajeHacienda, enviarFacturaHacienda } from './haciendaApi';

const CLAVE = '5'.repeat(50);
const respuesta = (status: number, body: unknown = '', headers: Record<string, string> = {}) =>
  new Response(status === 204 ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
const mensajeHacienda = (detalle: string) =>
  Buffer.from(`<MensajeHacienda><DetalleMensaje>${detalle}</DetalleMensaje></MensajeHacienda>`).toString('base64');

afterEach(() => vi.unstubAllGlobals());

describe('consultarEstadoHacienda', () => {
  it('404 → no_encontrado (Hacienda no tiene esa clave)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(404)));
    expect((await consultarEstadoHacienda('SANDBOX', 't', CLAVE)).estado).toBe('no_encontrado');
  });

  // De "no_encontrado" depende anular sin Nota de Crédito, que es irreversible: cualquier otra
  // respuesta tiene que fallar cerrado.
  it.each([400, 401, 403, 500, 503])('%i → error, nunca no_encontrado', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(status, '', { 'X-Error-Cause': 'causa' })));
    const r = await consultarEstadoHacienda('SANDBOX', 't', CLAVE);
    expect(r.estado).toBe('error');
    expect(r.detalleMensaje).toBe('causa');
  });

  it('timeout o red caída → error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('t', 'TimeoutError')));
    expect((await consultarEstadoHacienda('SANDBOX', 't', CLAVE)).estado).toBe('error');
  });

  it('un 200 que no se entiende no prueba nada → error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(200, '<html>proxy</html>')));
    expect((await consultarEstadoHacienda('SANDBOX', 't', CLAVE)).estado).toBe('error');
  });

  it('rechazado trae el DetalleMensaje decodificado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(200, { 'ind-estado': 'rechazado', 'respuesta-xml': mensajeHacienda('-53 &lt;hora&gt; &amp; otro') })));
    const r = await consultarEstadoHacienda('SANDBOX', 't', CLAVE);
    expect(r.estado).toBe('rechazado');
    expect(r.detalleMensaje).toBe('-53 <hora> & otro');
  });

  it('el estado "error" propio de Hacienda es final: se reporta como rechazado', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(200, { 'ind-estado': 'error', 'respuesta-xml': mensajeHacienda('No se pudo procesar') })));
    const r = await consultarEstadoHacienda('SANDBOX', 't', CLAVE);
    expect(r.estado).toBe('rechazado');
    expect(r.detalleMensaje).toBe('No se pudo procesar');
  });

  it('consulta la URL de sandbox corregida', async () => {
    const f = vi.fn().mockResolvedValue(respuesta(200, { 'ind-estado': 'aceptado' }));
    vi.stubGlobal('fetch', f);
    await consultarEstadoHacienda('SANDBOX', 't', CLAVE);
    expect(f.mock.calls[0][0]).toBe(`https://api-sandbox.comprobanteselectronicos.go.cr/recepcion/v1/recepcion/${CLAVE}`);
    expect(f.mock.calls[0][1].headers.Authorization).toBe('Bearer t');
  });
});

describe('esperarResolucionHacienda', () => {
  it('se detiene en el primer estado final', async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(respuesta(200, { 'ind-estado': 'procesando' }))
      .mockResolvedValueOnce(respuesta(200, { 'ind-estado': 'aceptado' }));
    vi.stubGlobal('fetch', f);
    expect((await esperarResolucionHacienda('SANDBOX', 't', CLAVE, 4, 0)).estado).toBe('aceptado');
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('respeta el plazo total aunque queden intentos', async () => {
    const f = vi.fn().mockResolvedValue(respuesta(200, { 'ind-estado': 'procesando' }));
    vi.stubGlobal('fetch', f);
    const r = await esperarResolucionHacienda('SANDBOX', 't', CLAVE, 4, 30, 50);
    expect(r.estado).toBe('procesando');
    expect(f.mock.calls.length).toBeLessThan(4);
  });
});

describe('enviarFacturaHacienda', () => {
  it('incluye X-Error-Cause cuando Hacienda rechaza la recepción con el cuerpo vacío', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(400, '', { 'X-Error-Cause': 'El comprobante ya fue recibido' })));
    const r = await enviarFacturaHacienda({ ambiente: 'SANDBOX', token: 't', clave: CLAVE, fechaEmisionIso: 'x', tipoIdentificacionEmisor: '02', cedulaEmisor: '3101123456', xmlFirmado: '<a/>' });
    expect(r.aceptadoParaProcesar).toBe(false);
    expect(r.mensaje).toContain('El comprobante ya fue recibido');
  });

  it('202 → aceptado para procesar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respuesta(202)));
    const r = await enviarFacturaHacienda({ ambiente: 'SANDBOX', token: 't', clave: CLAVE, fechaEmisionIso: 'x', tipoIdentificacionEmisor: '02', cedulaEmisor: '3101123456', xmlFirmado: '<a/>' });
    expect(r.aceptadoParaProcesar).toBe(true);
  });
});

describe('extraerDetalleMensajeHacienda', () => {
  it('devuelve null sin respuesta', () => {
    expect(extraerDetalleMensajeHacienda(null)).toBeNull();
  });
});
