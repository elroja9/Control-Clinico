import { describe, it, expect } from 'vitest';
import {
  configErpDesdeParametros, validarEntradaConfigErp, errorUrlErp, construirSuscriptor, codigoActividadDe,
  cambiaronDatosSuscriptor, motivoOmitirSincronizacion, validarEstadoCuenta, resumenParaGuardar, decidirMora,
  diasHastaSuspension, generarReferenciaAdelantado, elegirReferenciaAdelantado, errorMesesAdelantado,
  mensajeErrorHttp, errorDeRed, urlEndpointErp, pistaClave, PARAMETROS_ERP, type CompaniaParaErp, type EntradaMora
} from './erpIntegracion';

const filasCompletas = [
  { clave: 'erp_url', valor: 'https://erp.ejemplo.com/' },
  { clave: 'erp_ruta_api', valor: '/api/integraciones/v1' },
  { clave: 'erp_sync_activo', valor: '1' },
  { clave: 'erp_sync_intervalo_min', valor: '30' },
  { clave: 'erp_timeout_ms', valor: '15000' },
  { clave: 'erp_mora_dias_suspension', valor: '0' },
  { clave: 'erp_mora_dias_aviso', valor: '5' },
  { clave: 'erp_adelantado_meses_max', valor: '12' },
  { clave: 'erp_adelantado_ventana_seg', valor: '120' },
  { clave: 'erp_respuesta_max_bytes', valor: '2097152' }
];

describe('configErpDesdeParametros', () => {
  it('lee todos los parámetros y quita la barra final de la URL', () => {
    const { config, faltantes } = configErpDesdeParametros(filasCompletas);
    expect(faltantes).toEqual([]);
    expect(config.url).toBe('https://erp.ejemplo.com');
    expect(config.syncActivo).toBe(true);
    expect(config.moraDiasSuspension).toBe(0); // 0 = desactivado es válido
    expect(urlEndpointErp(config, '/salud')).toBe('https://erp.ejemplo.com/api/integraciones/v1/salud');
  });

  it('lista los faltantes en vez de inventar valores', () => {
    const { faltantes } = configErpDesdeParametros(filasCompletas.filter(f => f.clave !== 'erp_sync_intervalo_min' && f.clave !== 'erp_sync_activo'));
    expect(faltantes).toContain('erp_sync_intervalo_min');
    expect(faltantes).toContain('erp_sync_activo');
  });

  it('rechaza un intervalo cero o con texto', () => {
    const filas = filasCompletas.map(f => f.clave === 'erp_sync_intervalo_min' ? { ...f, valor: '0' } : f.clave === 'erp_timeout_ms' ? { ...f, valor: 'abc' } : f);
    expect(configErpDesdeParametros(filas).faltantes).toEqual(['erp_sync_intervalo_min', 'erp_timeout_ms']);
  });
});

describe('validarEntradaConfigErp', () => {
  const base = { url: 'https://erp.ejemplo.com', syncActivo: true, syncIntervaloMin: 30, timeoutMs: 15000, moraDiasSuspension: 30, moraDiasAviso: 5 };

  it('acepta una configuración válida sin tocar la clave ni la CA', () => {
    const r = validarEntradaConfigErp(base);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.cambios.apiKey).toBeUndefined();
      expect(r.cambios.caPem).toBeUndefined();
      expect(r.cambios.parametros.find(p => p.clave === PARAMETROS_ERP.syncActivo)?.valor).toBe('1');
    }
  });

  it('exige https y rangos válidos', () => {
    const r = validarEntradaConfigErp({ ...base, url: 'http://erp.ejemplo.com', syncIntervaloMin: 0, moraDiasAviso: -1 });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.errores.join(' ')).toMatch(/https/);
    expect(errorUrlErp('https://user:pw@erp.ejemplo.com')).toMatch(/usuario/);
    expect(errorUrlErp('https://erp.ejemplo.com/?x=1')).toMatch(/parámetros/);
  });

  it('la clave es solo escritura: vacía conserva, texto reemplaza, borrar la quita', () => {
    const conserva = validarEntradaConfigErp({ ...base, apiKey: '   ' });
    expect(conserva.ok && conserva.cambios.apiKey).toBeUndefined();
    const nueva = validarEntradaConfigErp({ ...base, apiKey: 'ck_live_0123456789abcdef' });
    expect(nueva.ok && nueva.cambios.apiKey).toBe('ck_live_0123456789abcdef');
    const borra = validarEntradaConfigErp({ ...base, borrarApiKey: true });
    expect(borra.ok && borra.cambios.apiKey).toBeNull();
    expect(validarEntradaConfigErp({ ...base, apiKey: 'corta' }).ok).toBe(false);
  });

  it('valida el PEM de la CA y permite quitarla', () => {
    expect(validarEntradaConfigErp({ ...base, caPem: 'no es un certificado' }).ok).toBe(false);
    const quita = validarEntradaConfigErp({ ...base, caPem: '' });
    expect(quita.ok && quita.cambios.caPem).toBeNull();
  });

  it('la pista de la clave nunca la revela completa', () => {
    expect(pistaClave('ck_live_0123456789abcdef')).toBe('cdef');
    expect(pistaClave('corta')).toBe('');
  });
});

describe('construirSuscriptor', () => {
  const empresa: CompaniaParaErp = {
    id: 12,
    nombreComercial: 'Clínica Demo',
    razonSocial: '  Clínica Demo S.A. ',
    tipoIdentificacion: '02',
    identificacion: '3-101-123456',
    correoEmisor: 'facturas@demo.cr',
    provincia: '1', canton: '02', distrito: '03',
    otrasSenas: 'Frente al parque',
    actividadEconomica: '869001 (Fisioterapia)',
    estadoSaas: 'ACTIVA',
    montoMensual: '25000.00',
    monedaSuscripcion: 'CRC',
    diaFacturacion: 1
  };

  it('arma el cuerpo del contrato con solo dígitos y activo según el estado', () => {
    const r = construirSuscriptor(empresa);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload).toEqual({
        tipoIdentificacion: '02', identificacion: '3101123456', nombre: 'Clínica Demo S.A.', nombreComercial: 'Clínica Demo',
        correo: 'facturas@demo.cr', provincia: '1', canton: '02', distrito: '03', otrasSenas: 'Frente al parque',
        codigoActividad: '869001', moneda: 'CRC', montoMensual: 25000, diaFacturacion: 1, activo: true
      });
    }
    const suspendida = construirSuscriptor({ ...empresa, estadoSaas: 'SUSPENDIDA' });
    expect(suspendida.ok && suspendida.payload.activo).toBe(false);
  });

  it('omite el código de actividad si el texto no empieza con 6 dígitos', () => {
    expect(codigoActividadDe('Por definir (Spa)')).toBeUndefined();
    expect(codigoActividadDe('8690.01 Fisio')).toBe('869001');
    expect(codigoActividadDe('86900')).toBeUndefined();
    const r = construirSuscriptor({ ...empresa, actividadEconomica: 'Por definir' });
    expect(r.ok && 'codigoActividad' in r.payload).toBe(false);
  });

  it('lista lo que falta: identificación, ubicación, moneda, cuota y día', () => {
    const r = construirSuscriptor({ ...empresa, identificacion: '1-0100-0200', provincia: '', monedaSuscripcion: 'EUR', montoMensual: null, diaFacturacion: 31 });
    expect(r.ok).toBe(false);
    if (r.ok === false) {
      expect(r.errores).toHaveLength(5);
      expect(r.errores[0]).toMatch(/10 dígitos/);
    }
  });

  it('detecta cambios en los datos que conoce el ERP (no en otros campos)', () => {
    expect(cambiaronDatosSuscriptor(empresa, { ...empresa, colorPrimario: '#000' } as any)).toBe(false);
    expect(cambiaronDatosSuscriptor(empresa, { ...empresa, montoMensual: 25000 })).toBe(false);
    expect(cambiaronDatosSuscriptor(empresa, { ...empresa, montoMensual: 30000 })).toBe(true);
    expect(cambiaronDatosSuscriptor(empresa, { ...empresa, correoEmisor: 'otro@demo.cr' })).toBe(true);
    expect(cambiaronDatosSuscriptor({ ...empresa, otrasSenas: null }, { ...empresa, otrasSenas: '' })).toBe(false);
  });
});

describe('motivoOmitirSincronizacion', () => {
  it('nunca sincroniza la empresa de plataforma', () => {
    expect(motivoOmitirSincronizacion({ esPlataforma: true, estadoSaas: 'ACTIVA', montoMensual: 1000, sincronizadaAntes: true })).toBe('plataforma');
  });
  it('omite las pendientes y las sin cuota mientras no estén en el ERP', () => {
    expect(motivoOmitirSincronizacion({ esPlataforma: false, estadoSaas: 'PENDIENTE', montoMensual: 1000, sincronizadaAntes: false })).toBe('pendiente-de-aprobacion');
    expect(motivoOmitirSincronizacion({ esPlataforma: false, estadoSaas: 'ACTIVA', montoMensual: null, sincronizadaAntes: false })).toBe('sin-cuota');
    expect(motivoOmitirSincronizacion({ esPlataforma: false, estadoSaas: 'ACTIVA', montoMensual: 1000, sincronizadaAntes: false })).toBeNull();
  });
  it('una empresa ya dada de alta siempre se envía (la suspensión debe llegar al ERP)', () => {
    expect(motivoOmitirSincronizacion({ esPlataforma: false, estadoSaas: 'SUSPENDIDA', montoMensual: null, sincronizadaAntes: true })).toBeNull();
  });
});

describe('estado de cuenta', () => {
  const respuesta = {
    suscriptor: { clientId: 123, activo: true, moneda: 'CRC', montoMensual: 25000, proximaFacturacion: '2026-12-01' },
    resumen: { saldoPendiente: 50000, saldoVencido: 25000, diasMoraMax: 12, alDia: false, monedaSaldo: 'CRC' },
    facturas: [
      { id: 1, consecutivo: '00100001010000000100', fechaEmision: '2026-10-01T08:00:00-06:00', moneda: 'CRC', total: 25000, saldoPendiente: 25000, estadoHacienda: 'Aceptado', pagada: false },
      { id: 2, consecutivo: '00100001010000000123', fechaEmision: '2026-11-01T08:00:00-06:00', moneda: 'CRC', total: 25000, saldoPendiente: 25000, estadoHacienda: 'Pendiente', pagada: false }
    ]
  };

  it('guarda el resumen con la última factura por fecha de emisión', () => {
    expect(resumenParaGuardar(validarEstadoCuenta(respuesta))).toEqual({
      erpSaldoPendiente: 50000,
      erpSaldoVencido: 25000,
      erpDiasMora: 12,
      erpMonedaSaldo: 'CRC',
      erpProximaFacturacion: '2026-12-01',
      erpUltimaFacturaConsecutivo: '00100001010000000123',
      erpUltimaFacturaEstado: 'Pendiente',
      erpUltimaFacturaFecha: '2026-11-01'
    });
  });

  it('al día guarda cero días de mora y sin facturas deja la última en null', () => {
    const r = resumenParaGuardar(validarEstadoCuenta({ ...respuesta, resumen: { ...respuesta.resumen, alDia: true, diasMoraMax: 3 }, facturas: [] }));
    expect(r.erpDiasMora).toBe(0);
    expect(r.erpUltimaFacturaConsecutivo).toBeNull();
    expect(r.erpUltimaFacturaFecha).toBeNull();
  });

  it('no guarda nada si la respuesta no calza con el contrato', () => {
    expect(() => validarEstadoCuenta({ resumen: {}, facturas: [] })).toThrow(/incompleto/);
    expect(() => validarEstadoCuenta({ resumen: respuesta.resumen })).toThrow(/formato/);
    expect(() => validarEstadoCuenta({ ...respuesta, facturas: [{ consecutivo: 'x' }] })).toThrow(/sin id/);
  });
});

describe('decidirMora', () => {
  const base: EntradaMora = { esPlataforma: false, estadoSaas: 'ACTIVA', diasMora: 0, diasSuspension: 30, diasAviso: 5, avisoEnviado: false, diasDesdeAviso: null };

  it('nunca actúa sobre la empresa de plataforma', () => {
    expect(decidirMora({ ...base, esPlataforma: true, diasMora: 90, avisoEnviado: true, diasDesdeAviso: 30 })).toBe('nada');
  });

  it('desactivada con 0 días', () => {
    expect(decidirMora({ ...base, diasSuspension: 0, diasMora: 90 })).toBe('nada');
  });

  it('avisa una sola vez al entrar en el plazo de aviso', () => {
    expect(decidirMora({ ...base, diasMora: 24 })).toBe('nada');
    expect(decidirMora({ ...base, diasMora: 25 })).toBe('avisar');
    expect(decidirMora({ ...base, diasMora: 26, avisoEnviado: true, diasDesdeAviso: 1 })).toBe('nada');
  });

  it('suspende pasado el umbral y con el plazo del aviso cumplido', () => {
    expect(decidirMora({ ...base, diasMora: 30, avisoEnviado: true, diasDesdeAviso: 5 })).toBe('nada'); // > 30, no >=
    expect(decidirMora({ ...base, diasMora: 31, avisoEnviado: true, diasDesdeAviso: 6 })).toBe('suspender');
  });

  it('si se activa con la mora ya vencida, primero avisa y respeta los días de aviso', () => {
    expect(decidirMora({ ...base, diasMora: 60 })).toBe('avisar');
    expect(decidirMora({ ...base, diasMora: 61, avisoEnviado: true, diasDesdeAviso: 1 })).toBe('nada');
    expect(decidirMora({ ...base, diasMora: 65, avisoEnviado: true, diasDesdeAviso: 5 })).toBe('suspender');
    expect(diasHastaSuspension(30, 5, 60)).toBe(5);
    expect(diasHastaSuspension(30, 5, 25)).toBe(6);
  });

  it('no suspende otra vez una empresa ya suspendida o pendiente', () => {
    expect(decidirMora({ ...base, estadoSaas: 'SUSPENDIDA', diasMora: 90, avisoEnviado: true, diasDesdeAviso: 60 })).toBe('nada');
    expect(decidirMora({ ...base, estadoSaas: 'PENDIENTE', diasMora: 90 })).toBe('nada');
  });

  it('al quedar al día reinicia el aviso; sin estado de cuenta no decide nada', () => {
    expect(decidirMora({ ...base, diasMora: 0, avisoEnviado: true, diasDesdeAviso: 3 })).toBe('reiniciar');
    expect(decidirMora({ ...base, diasMora: 0 })).toBe('nada');
    expect(decidirMora({ ...base, diasMora: null, avisoEnviado: true })).toBe('nada');
  });

  it('con aviso mayor que el umbral avisa desde el primer día de mora', () => {
    expect(decidirMora({ ...base, diasSuspension: 3, diasAviso: 10, diasMora: 1 })).toBe('avisar');
  });
});

describe('facturar por adelantado', () => {
  it('genera referencias únicas con el formato adelantado-<ms>-<aleatorio>', () => {
    expect(generarReferenciaAdelantado(1764200000000, 'A1-b2_c3')).toBe('adelantado-1764200000000-a1b2c3');
    expect(() => generarReferenciaAdelantado(1, '---')).toThrow();
  });

  it('un segundo clic dentro de la ventana reutiliza la referencia', () => {
    const ahora = 1_000_000;
    const previas = [
      { referencia: 'adelantado-1-viejo', meses: 3, creadoEnMs: ahora - 200_000 },
      { referencia: 'adelantado-2-reciente', meses: 3, creadoEnMs: ahora - 30_000 },
      { referencia: 'adelantado-3-otro', meses: 6, creadoEnMs: ahora - 10_000 }
    ];
    let generadas = 0;
    const generar = () => `nueva-${++generadas}`;
    expect(elegirReferenciaAdelantado(previas, 3, ahora, 120, generar)).toEqual({ referencia: 'adelantado-2-reciente', reutilizada: true });
    expect(elegirReferenciaAdelantado(previas, 12, ahora, 120, generar)).toEqual({ referencia: 'nueva-1', reutilizada: false });
    // Fuera de la ventana: referencia nueva.
    expect(elegirReferenciaAdelantado(previas, 3, ahora + 200_000, 120, generar)).toEqual({ referencia: 'nueva-2', reutilizada: false });
  });

  it('valida los meses contra el máximo configurado', () => {
    expect(errorMesesAdelantado(3, 12)).toBeNull();
    expect(errorMesesAdelantado(0, 12)).toMatch(/1 y 12/);
    expect(errorMesesAdelantado(13, 12)).toMatch(/1 y 12/);
    expect(errorMesesAdelantado(1.5, 12)).toMatch(/1 y 12/);
  });
});

describe('errores del ERP en español', () => {
  it('traduce los códigos HTTP del contrato', () => {
    expect(mensajeErrorHttp(401, { error: 'x' })).toMatch(/clave de integración/);
    expect(mensajeErrorHttp(422, { error: 'Identificación inválida', codigo: 'VALIDACION' })).toBe('El ERP rechazó los datos: Identificación inválida');
    expect(mensajeErrorHttp(429, null)).toMatch(/limitó/);
    expect(mensajeErrorHttp(503, null)).toMatch(/HTTP 503/);
    expect(mensajeErrorHttp(302, null)).toMatch(/redirección/);
  });

  it('traduce errores de red y de certificado sin desactivar TLS', () => {
    expect(errorDeRed({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }).tipo).toBe('tls');
    expect(errorDeRed({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT' }).message).toMatch(/CA/);
    expect(errorDeRed({ code: 'ECONNREFUSED' }).message).toMatch(/rechazó/);
    expect(errorDeRed({ code: 'ENOTFOUND' }).message).toMatch(/URL/);
  });
});
