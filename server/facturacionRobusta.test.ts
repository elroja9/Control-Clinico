import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  calcularLineas, calcularResumen, construirXmlFactura, construirXmlTiquete, construirXmlNotaCredito, construirXmlComprobante,
  generarConsecutivo, generarClaveNumerica, codigoSeguridadClave, desglosarClaveOConsecutivo, errorSucursalTerminal,
  validarMediosPago, cuadrarMediosPago, codigoActividadValido, recortarDetalle, type LineaFacturaInput
} from './haciendaFactura';
import {
  identificacionReceptorValida, decidirTipoComprobante, tipoDocReferencia, codigoEnCatalogo, codigosDe, CATALOGOS_SIN_BD,
  problemasEmisor, problemasTransmision, errorDetalle, validarTercero, type EntradaCatalogo
} from './haciendaReglas';
import { calcularProximoIntento, decidirAccionCola, clasificarRespuestaEnvio, esClaveYaRecibida, estadoTrasConsultaCola } from './haciendaCola';
import { crearCacheTokensHacienda, claveCacheToken, obtenerTokenHaciendaConVigencia, enviarFacturaHacienda, consultarEstadoHacienda, type EndpointsHacienda } from './haciendaApi';

afterEach(() => vi.unstubAllGlobals());

const EMISOR = { nombre: 'Clínica S.A.', nombreComercial: 'Clínica', tipoIdentificacion: '02', identificacion: '3101123456', correoElectronico: 'a@b.cr', provincia: '1', canton: '01', distrito: '01', otrasSenas: 'Del parque 100 m', codigoActividad: '869001' };

const linea = (over: Partial<LineaFacturaInput>): LineaFacturaInput => ({
  codigoCabys: '9310100000100', detalle: 'Consulta', unidadMedida: 'Sp', cantidad: 1, precioUnitario: 10000, porcentajeIva: 13, ...over
});

const datosBase = (lineasInput: LineaFacturaInput[] = [linea({})]) => {
  const lineas = calcularLineas(lineasInput);
  return {
    clave: '5'.repeat(50),
    consecutivo: generarConsecutivo(1, '001', '00001', '01'),
    fechaEmision: new Date('2026-09-30T15:00:00Z'),
    emisor: EMISOR,
    receptor: { nombre: 'Paciente', tipoIdentificacion: '01', identificacion: '101110111' } as any,
    condicionVenta: '01',
    lineas,
    resumen: calcularResumen(lineas)
  };
};

const valor = (xml: string, etiqueta: string): number => Number((xml.match(new RegExp(`<${etiqueta}>([^<]+)</${etiqueta}>`)) || [])[1]);

describe('Tiquete Electrónico (04)', () => {
  it('usa el namespace v4.4 de tiquete y omite <Receptor> completo si no hay identificación', () => {
    const xml = construirXmlTiquete({ ...datosBase(), receptor: null });
    expect(xml).toContain('<TiqueteElectronico xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/tiqueteElectronico"');
    expect(xml).not.toContain('<Receptor>');
    expect(xml).toContain('</TiqueteElectronico>');
  });

  it('con receptor identificado sí lleva <Receptor> con su <Identificacion>', () => {
    const xml = construirXmlTiquete(datosBase());
    expect(xml).toMatch(/<Receptor>[\s\S]*<Identificacion>[\s\S]*<Numero>101110111<\/Numero>/);
  });

  it('una Factura Electrónica sin receptor no se puede construir', () => {
    expect(() => construirXmlFactura({ ...datosBase(), receptor: null })).toThrow(/Tiquete/);
  });

  it('un <Receptor> sin identificación nunca se emite', () => {
    expect(() => construirXmlTiquete({ ...datosBase(), receptor: { nombre: 'X', tipoIdentificacion: '01', identificacion: '' } })).toThrow(/identificación/);
  });

  it('una nota sobre un tiquete lleva TipoDocIR 04', () => {
    expect(tipoDocReferencia('04')).toBe('04');
    expect(tipoDocReferencia('01')).toBe('01');
    const xml = construirXmlNotaCredito({
      ...datosBase(), receptor: null,
      referencia: { tipoDocumento: tipoDocReferencia('04'), numero: '6'.repeat(50), fechaEmision: '2026-09-30T09:00:00-06:00', codigo: '01', razon: 'Anulación' }
    });
    expect(xml).toContain('<TipoDocIR>04</TipoDocIR>');
    expect(xml).not.toContain('<Receptor>');
  });

  it('construirXmlComprobante despacha por tipo de documento', () => {
    expect(construirXmlComprobante('04', { ...datosBase(), receptor: null })).toContain('<TiqueteElectronico');
    expect(construirXmlComprobante('01', datosBase())).toContain('<FacturaElectronica');
    expect(() => construirXmlComprobante('03', datosBase())).toThrow(/referencia/);
  });
});

describe('Regla de selección del receptor (Factura 01 vs Tiquete 04)', () => {
  const exigen = ['02'];

  it('identificación costarricense válida → Factura', () => {
    expect(decidirTipoComprobante({ tipoIdentificacion: '01', identificacion: '1-0111-0111' }, '01', exigen)).toEqual({ tipoDocumento: '01', receptorValido: true });
    expect(decidirTipoComprobante({ tipoIdentificacion: '02', identificacion: '3101123456' }, '02', exigen).tipoDocumento).toBe('01');
    expect(decidirTipoComprobante({ tipoIdentificacion: '03', identificacion: '123456789012' }, '01', exigen).tipoDocumento).toBe('01');
    expect(decidirTipoComprobante({ tipoIdentificacion: '04', identificacion: '1234567890' }, '01', exigen).tipoDocumento).toBe('01');
  });

  it('EXT (pasaporte) o sin identificación → Tiquete, nunca DIMEX 03', () => {
    expect(identificacionReceptorValida('EXT', '123456789012')).toBe(false);
    const d = decidirTipoComprobante({ tipoIdentificacion: 'EXT', identificacion: 'AB123456' }, '01', exigen);
    expect(d).toEqual({ tipoDocumento: '04', receptorValido: false });
    expect(decidirTipoComprobante(null, '01', exigen).tipoDocumento).toBe('04');
    expect(decidirTipoComprobante({ tipoIdentificacion: '01', identificacion: '12345' }, '01', exigen).tipoDocumento).toBe('04');
  });

  it('una venta a crédito sin receptor identificado se rechaza', () => {
    const d = decidirTipoComprobante({ tipoIdentificacion: 'EXT', identificacion: 'AB123456' }, '02', exigen);
    expect(d.error).toMatch(/crédito/);
  });

  it('largos por tipo: física 9, jurídica 10, DIMEX 11-12, NITE 10', () => {
    expect(identificacionReceptorValida('01', '12345678')).toBe(false);
    expect(identificacionReceptorValida('02', '310112345')).toBe(false);
    expect(identificacionReceptorValida('03', '12345678901')).toBe(true);
    expect(identificacionReceptorValida('03', '1234567890')).toBe(false);
    expect(identificacionReceptorValida('04', '1234567890')).toBe(true);
    expect(identificacionReceptorValida('01', '1-0111-011a')).toBe(false);
  });
});

describe('Resumen con descuentos e IVA mixto (13, 4, 2, 1 y exento)', () => {
  const lineasInput: LineaFacturaInput[] = [
    linea({ cantidad: 2, precioUnitario: 10000, porcentajeIva: 13, montoDescuento: 2000, codigoDescuento: '07' }),
    linea({ cantidad: 1, precioUnitario: 15000, porcentajeIva: 4 }),
    linea({ codigoCabys: '2345678901234', unidadMedida: 'Unid', cantidad: 3, precioUnitario: 3333.33333, porcentajeIva: 2, montoDescuento: 500, codigoDescuento: '99', naturalezaDescuento: 'Cortesía' }),
    linea({ cantidad: 1, precioUnitario: 5000, porcentajeIva: 1 }),
    linea({ cantidad: 1, precioUnitario: 7000, porcentajeIva: 0 })
  ];
  const lineas = calcularLineas(lineasInput);
  const r = calcularResumen(lineas);

  it('cada línea: SubTotal = MontoTotal − descuento, impuesto sobre el SubTotal', () => {
    expect(lineas[0]).toMatchObject({ montoTotal: 20000, montoDescuento: 2000, subTotal: 18000, baseImponible: 18000, montoIva: 2340, montoTotalLinea: 20340, codigoTarifaIva: '08' });
    expect(lineas[2].montoTotal).toBeCloseTo(9999.99999, 5);
    expect(lineas[2].subTotal).toBeCloseTo(9499.99999, 5);
    expect(lineas[2].montoIva).toBeCloseTo(190, 5);
    expect(lineas[4]).toMatchObject({ codigoTarifaIva: '10', montoIva: 0 });
  });

  it('un descuento mayor que la línea se recorta al MontoTotal', () => {
    const [l] = calcularLineas([linea({ precioUnitario: 1000, montoDescuento: 5000 })]);
    expect(l).toMatchObject({ montoDescuento: 1000, subTotal: 0, montoIva: 0 });
  });

  it('TotalVenta es BRUTO; TotalVentaNeta = TotalVenta − TotalDescuentos', () => {
    expect(r.totalServGravados).toBeCloseTo(40000, 5);
    expect(r.totalServExentos).toBeCloseTo(7000, 5);
    expect(r.totalMercanciasGravadas).toBeCloseTo(9999.99999, 5);
    expect(r.totalVenta).toBeCloseTo(56999.99999, 5);
    expect(r.totalDescuentos).toBeCloseTo(2500, 5);
    expect(r.totalVentaNeta).toBeCloseTo(54499.99999, 5);
  });

  it('TotalImpuesto = Σ ImpuestoNeto y TotalComprobante = TotalVentaNeta + TotalImpuesto', () => {
    const sumaImpuestoNeto = lineas.reduce((s, l) => s + l.impuestoNeto, 0);
    expect(r.totalImpuesto).toBeCloseTo(sumaImpuestoNeto, 5);
    expect(r.totalImpuesto).toBeCloseTo(3180, 5);
    expect(r.totalComprobante).toBeCloseTo(r.totalVentaNeta + r.totalImpuesto, 5);
    expect(r.totalComprobante).toBeCloseTo(lineas.reduce((s, l) => s + l.montoTotalLinea, 0), 5);
    expect(r.desgloseImpuesto.map(d => d.codigoTarifaIva).sort()).toEqual(['02', '03', '04', '08']);
  });

  it('el XML cuadra con los números que imprime (5 decimales) y lleva varios medios de pago', () => {
    const medios = cuadrarMediosPago([{ tipo: '01', monto: 30000 }, { tipo: '02', monto: r.totalComprobante - 30000 }], r.totalComprobante);
    const xml = construirXmlFactura({ ...datosBase(lineasInput), lineas, resumen: r, mediosPago: medios });
    expect(xml).toContain('<TotalDescuentos>2500.00000</TotalDescuentos>');
    expect(valor(xml, 'TotalVentaNeta')).toBeCloseTo(valor(xml, 'TotalVenta') - valor(xml, 'TotalDescuentos'), 5);
    expect(valor(xml, 'TotalComprobante')).toBeCloseTo(valor(xml, 'TotalVentaNeta') + valor(xml, 'TotalImpuesto'), 5);
    expect(xml.match(/<MedioPago>/g)).toHaveLength(2);
    const sumaMedios = Array.from(xml.matchAll(/<TotalMedioPago>([^<]+)<\/TotalMedioPago>/g)).reduce((s, m) => s + Number(m[1]), 0);
    expect(sumaMedios).toBeCloseTo(valor(xml, 'TotalComprobante'), 5);
    // <Descuento> va entre <MontoTotal> y <SubTotal>; el código 99 lleva su naturaleza.
    expect(xml).toMatch(/<MontoTotal>20000\.00000<\/MontoTotal>\s*<Descuento>\s*<MontoDescuento>2000\.00000<\/MontoDescuento>\s*<CodigoDescuento>07<\/CodigoDescuento>\s*<\/Descuento>\s*<SubTotal>18000\.00000<\/SubTotal>/);
    expect(xml).toContain('<NaturalezaDescuento>Cortesía</NaturalezaDescuento>');
    expect(xml.match(/<Descuento>/g)).toHaveLength(2);
  });

  it('a crédito no lleva <MedioPago> aunque vengan medios', () => {
    const xml = construirXmlFactura({ ...datosBase(lineasInput), lineas, resumen: r, condicionVenta: '02', plazoCredito: 30, mediosPago: [{ tipo: '01', monto: r.totalComprobante }] });
    expect(xml).not.toContain('<MedioPago>');
  });
});

describe('Medios de pago', () => {
  const opciones = { codigosValidos: codigosDe(CATALOGOS_SIN_BD, 'MEDIO_PAGO'), tolerancia: 0.01, maximo: 4 };

  it('la suma debe ser el total (con tolerancia)', () => {
    expect(validarMediosPago([{ tipo: '01', monto: 5000 }, { tipo: '06', monto: 5000 }], 10000, opciones)).toBeNull();
    expect(validarMediosPago([{ tipo: '01', monto: 5000 }, { tipo: '02', monto: 4999.995 }], 10000, opciones)).toBeNull();
    expect(validarMediosPago([{ tipo: '01', monto: 5000 }], 10000, opciones)).toMatch(/suman/);
  });

  it('códigos fuera de catálogo, montos no positivos, demasiados medios y «Otros» sin texto', () => {
    expect(validarMediosPago([{ tipo: '88', monto: 10 }], 10, opciones)).toMatch(/catálogo/);
    expect(validarMediosPago([{ tipo: '01', monto: 0 }, { tipo: '02', monto: 10 }], 10, opciones)).toMatch(/mayor que cero/);
    expect(validarMediosPago(Array.from({ length: 5 }, () => ({ tipo: '01', monto: 2 })), 10, opciones)).toMatch(/máximo/);
    expect(validarMediosPago([{ tipo: '99', monto: 10 }], 10, opciones)).toMatch(/descripción/);
    expect(validarMediosPago([], 10, opciones)).toMatch(/al menos/);
  });

  it('cuadrarMediosPago deja la suma exacta en el último medio', () => {
    const m = cuadrarMediosPago([{ tipo: '01', monto: 3333.33 }, { tipo: '02', monto: 6666.67 }], 9999.99999);
    expect(m[1].monto).toBeCloseTo(6666.66999, 5);
    expect(m.reduce((s, x) => s + x.monto, 0)).toBeCloseTo(9999.99999, 5);
  });

  it('<MedioPagoOtros> con el tipo 99', () => {
    const d = datosBase();
    const xml = construirXmlFactura({ ...d, mediosPago: [{ tipo: '99', monto: d.resumen.totalComprobante, otros: 'Canje' }] });
    expect(xml).toMatch(/<TipoMedioPago>99<\/TipoMedioPago>\s*<MedioPagoOtros>Canje<\/MedioPagoOtros>/);
  });
});

describe('CodigoActividadReceptor', () => {
  it('va en la raíz justo después de CodigoActividadEmisor (orden v4.4)', () => {
    const xml = construirXmlFactura({ ...datosBase(), receptor: { nombre: 'Empresa S.A.', tipoIdentificacion: '02', identificacion: '3101999999', codigoActividad: '620100' } });
    expect(xml).toMatch(/<CodigoActividadEmisor>869001<\/CodigoActividadEmisor>\s*<CodigoActividadReceptor>620100<\/CodigoActividadReceptor>\s*<NumeroConsecutivo>/);
    expect(xml.indexOf('<CodigoActividadReceptor>')).toBeLessThan(xml.indexOf('<Receptor>'));
  });

  it('se omite si no viene o no tiene 6 dígitos', () => {
    expect(construirXmlFactura(datosBase())).not.toContain('CodigoActividadReceptor');
    expect(construirXmlFactura({ ...datosBase(), receptor: { nombre: 'X', tipoIdentificacion: '01', identificacion: '101110111', codigoActividad: '12' } })).not.toContain('CodigoActividadReceptor');
  });
});

describe('Consecutivo con sucursal/terminal y numeración desde una clave pegada', () => {
  it('usa la sucursal y la terminal de la empresa', () => {
    expect(generarConsecutivo(57, '002', '00010', '04')).toBe('00200010040000000057');
    expect(generarConsecutivo(1, '001', '00001', '01')).toHaveLength(20);
  });

  it('valida sucursal (3 dígitos) y terminal (5 dígitos)', () => {
    expect(errorSucursalTerminal('001', '00001')).toBeNull();
    expect(errorSucursalTerminal('01', '00001')).toMatch(/sucursal/);
    expect(errorSucursalTerminal('001', '1')).toMatch(/terminal/);
    expect(errorSucursalTerminal('000', '00001')).toMatch(/000/);
    expect(() => generarConsecutivo(1, 'abc', '00001', '01')).toThrow();
    expect(() => generarConsecutivo(0, '001', '00001', '01')).toThrow();
  });

  it('desglosa una clave de 50 dígitos o un consecutivo de 20', () => {
    const consecutivo = generarConsecutivo(1234, '003', '00002', '01');
    const clave = generarClaveNumerica('3-101-123456', consecutivo, new Date('2026-10-01T15:00:00Z'));
    expect(desglosarClaveOConsecutivo(clave)).toEqual({ sucursal: '003', terminal: '00002', tipoDocumento: '01', secuencial: 1234, cedulaEmisor12: '003101123456' });
    expect(desglosarClaveOConsecutivo(`${consecutivo.slice(0, 10)} ${consecutivo.slice(10)}`)).toMatchObject({ tipoDocumento: '01', secuencial: 1234, cedulaEmisor12: null });
    expect(desglosarClaveOConsecutivo('123')).toBeNull();
    expect(desglosarClaveOConsecutivo('x'.repeat(20))).toBeNull();
    expect(desglosarClaveOConsecutivo('00100001010000000000')).toBeNull(); // secuencial 0
  });
});

describe('Código de seguridad de la clave', () => {
  it('8 dígitos aleatorios (crypto.randomInt), clave de 50 dígitos', () => {
    const codigos = new Set(Array.from({ length: 50 }, () => codigoSeguridadClave()));
    for (const c of codigos) expect(c).toMatch(/^\d{8}$/);
    expect(codigos.size).toBeGreaterThan(40);
    const clave = generarClaveNumerica('3101123456', generarConsecutivo(1, '001', '00001', '01'), new Date());
    expect(clave).toMatch(/^506\d{47}$/);
    expect(clave.slice(41, 42)).toBe('1');
  });
});

describe('Catálogos y validaciones previas', () => {
  const catalogo: EntradaCatalogo[] = [
    { tipo: 'CONDICION_VENTA', codigo: '01', descripcion: 'Contado', orden: 1 },
    { tipo: 'MEDIO_PAGO', codigo: '06', descripcion: 'SINPE Móvil', orden: 1 }
  ];

  it('solo acepta códigos de dos dígitos que estén en el catálogo de su tipo', () => {
    expect(codigoEnCatalogo(catalogo, 'CONDICION_VENTA', '01')).toBe(true);
    expect(codigoEnCatalogo(catalogo, 'CONDICION_VENTA', '06')).toBe(false);
    expect(codigoEnCatalogo(catalogo, 'MEDIO_PAGO', '06')).toBe(true);
    expect(codigoEnCatalogo(catalogo, 'MEDIO_PAGO', '6')).toBe(false);
    expect(codigoEnCatalogo(catalogo, 'MEDIO_PAGO', '06<x/>')).toBe(false);
  });

  it('datos del emisor: correo, actividad de 6 dígitos (nunca 000000), identificación, ubicación', () => {
    const ok = { razonSocial: 'Clínica', correoEmisor: 'a@b.cr', actividadEconomica: '869001 (Fisioterapia)', tipoIdentificacion: '02', identificacion: '3-101-123456', provincia: '1', canton: '01', distrito: '01', otrasSenas: 'Del parque 100 m' };
    expect(problemasEmisor(ok)).toEqual([]);
    expect(problemasEmisor({ ...ok, actividadEconomica: '' }).join(' ')).toMatch(/actividad económica/);
    expect(problemasEmisor({ ...ok, correoEmisor: 'sin-arroba' }).join(' ')).toMatch(/correo/);
    expect(problemasEmisor({ ...ok, identificacion: '123' }).join(' ')).toMatch(/identificación/);
    expect(problemasEmisor({ ...ok, provincia: '' }).join(' ')).toMatch(/ubicación/);
    expect(codigoActividadValido('')).toBeNull();
    expect(codigoActividadValido('869001')).toBe('869001');
  });

  it('certificado vencido o ausente y credenciales ATV', () => {
    expect(problemasTransmision({ tieneCertificado: true, certificadoVenceEn: '2027-01-01', tieneCredencialesAtv: true }, '2026-11-27')).toEqual([]);
    expect(problemasTransmision({ tieneCertificado: true, certificadoVenceEn: '2026-11-26', tieneCredencialesAtv: true }, '2026-11-27').join(' ')).toMatch(/venció/);
    expect(problemasTransmision({ tieneCertificado: false, certificadoVenceEn: null, tieneCredencialesAtv: false }, '2026-11-27')).toHaveLength(2);
  });

  it('<Detalle> entre el mínimo y el máximo', () => {
    expect(errorDetalle('Consulta', 3, 200)).toBeNull();
    expect(errorDetalle('ab', 3, 200)).toMatch(/al menos/);
    expect(errorDetalle('x'.repeat(201), 3, 200)).toMatch(/supera/);
    expect(recortarDetalle('  ' + 'á'.repeat(250) + ' ', 200)).toHaveLength(200);
  });

  it('valida los datos de un tercero', () => {
    expect(validarTercero({ tipoIdentificacion: '02', numero: '3-101-999999', nombre: 'Empresa S.A.', correo: 'fact@empresa.cr', codigoActividad: '620100' }))
      .toEqual({ tercero: { tipoIdentificacion: '02', numero: '3101999999', nombre: 'Empresa S.A.', correo: 'fact@empresa.cr', telefono: null, codigoActividad: '620100' } });
    expect(validarTercero({ tipoIdentificacion: '01', numero: '123', nombre: 'Juan' })).toHaveProperty('error');
    expect(validarTercero({ tipoIdentificacion: 'EXT', numero: 'ab123456', nombre: 'John Smith' })).toMatchObject({ tercero: { numero: 'AB123456' } });
    expect(validarTercero({ tipoIdentificacion: '02', numero: '3101999999', nombre: 'Em', correo: '' })).toHaveProperty('error');
    expect(validarTercero({ tipoIdentificacion: '02', numero: '3101999999', nombre: 'Empresa', codigoActividad: '12' })).toHaveProperty('error');
  });
});

describe('Cola de transmisión (decisiones puras)', () => {
  const p = { backoffBaseSeg: 60, backoffMaxSeg: 3600, maxIntentos: 5 };
  const ahora = new Date('2026-11-27T12:00:00Z');

  it('espera exponencial con tope', () => {
    expect(calcularProximoIntento(1, ahora, p).getTime() - ahora.getTime()).toBe(60_000);
    expect(calcularProximoIntento(2, ahora, p).getTime() - ahora.getTime()).toBe(120_000);
    expect(calcularProximoIntento(4, ahora, p).getTime() - ahora.getTime()).toBe(480_000);
    expect(calcularProximoIntento(20, ahora, p).getTime() - ahora.getTime()).toBe(3_600_000);
    expect(calcularProximoIntento(500, ahora, p).getTime() - ahora.getTime()).toBe(3_600_000);
  });

  it('si un POST pudo haber llegado, solo se consulta; se envía solo un PENDIENTE sin POST previo', () => {
    const base = { intentos: 0, tieneXmlFirmado: true };
    expect(decidirAccionCola({ ...base, estado: 'PENDIENTE', postRealizado: false }, 5)).toBe('ENVIAR');
    expect(decidirAccionCola({ ...base, estado: 'PENDIENTE', postRealizado: true }, 5)).toBe('CONSULTAR');
    expect(decidirAccionCola({ ...base, estado: 'ENVIADA', postRealizado: false }, 5)).toBe('CONSULTAR');
    expect(decidirAccionCola({ ...base, estado: 'ERROR', postRealizado: true }, 5)).toBe('CONSULTAR');
    expect(decidirAccionCola({ ...base, estado: 'ERROR', postRealizado: false }, 5)).toBe('NINGUNA');
    expect(decidirAccionCola({ ...base, estado: 'ACEPTADA', postRealizado: true }, 5)).toBe('NINGUNA');
    expect(decidirAccionCola({ ...base, estado: 'PENDIENTE', postRealizado: false, tieneXmlFirmado: false }, 5)).toBe('NINGUNA');
  });

  it('máximo de intentos', () => {
    expect(decidirAccionCola({ estado: 'PENDIENTE', postRealizado: false, intentos: 5, tieneXmlFirmado: true }, 5)).toBe('AGOTADO');
    expect(decidirAccionCola({ estado: 'ENVIADA', postRealizado: true, intentos: 4, tieneXmlFirmado: true }, 5)).toBe('CONSULTAR');
  });

  it('clasifica la respuesta del POST: clave repetida pasa a consultar, 5xx/red es incierto', () => {
    expect(clasificarRespuestaEnvio(202, null)).toBe('RECIBIDO');
    expect(clasificarRespuestaEnvio(400, 'El comprobante con la clave XXX ya fue recibido anteriormente')).toBe('YA_RECIBIDO');
    expect(clasificarRespuestaEnvio(400, 'La clave ya se encuentra registrada')).toBe('YA_RECIBIDO');
    expect(clasificarRespuestaEnvio(400, 'Archivo XML no cumple con el esquema')).toBe('RECHAZO_RECEPCION');
    expect(clasificarRespuestaEnvio(401, null)).toBe('TOKEN_INVALIDO');
    expect(clasificarRespuestaEnvio(503, null)).toBe('INCIERTO');
    expect(clasificarRespuestaEnvio(null, null)).toBe('INCIERTO');
    expect(esClaveYaRecibida(400, '')).toBe(false);
    expect(esClaveYaRecibida(500, 'ya fue recibido')).toBe(false);
  });

  it('reenvía solo cuando Hacienda dice que no tiene la clave', () => {
    expect(estadoTrasConsultaCola('no_encontrado')).toEqual({ estado: 'PENDIENTE', postRealizado: false });
    expect(estadoTrasConsultaCola('procesando')).toEqual({ estado: 'ENVIADA', postRealizado: true });
    expect(estadoTrasConsultaCola('aceptado').estado).toBe('ACEPTADA');
    expect(estadoTrasConsultaCola('rechazado').estado).toBe('RECHAZADA');
    expect(estadoTrasConsultaCola('error')).toEqual({ estado: null, postRealizado: true });
  });
});

describe('Caché de tokens del IdP', () => {
  it('vale hasta expires_in − margen', () => {
    let t = 1_000_000;
    const cache = crearCacheTokensHacienda({ margenSeg: () => 60, ahora: () => t });
    const clave = claveCacheToken(5, 'SANDBOX', 'cpf-01');
    cache.guardar(clave, { token: 'tok', expiraEnSeg: 300 });
    expect(cache.obtener(clave)).toBe('tok');
    t += 239_000;
    expect(cache.obtener(clave)).toBe('tok');
    t += 1_000;
    expect(cache.obtener(clave)).toBeNull();
  });

  it('no guarda tokens sin vigencia o con vigencia menor que el margen', () => {
    const cache = crearCacheTokensHacienda({ margenSeg: () => 60, ahora: () => 0 });
    cache.guardar('a', { token: 'x', expiraEnSeg: null });
    cache.guardar('b', { token: 'y', expiraEnSeg: 30 });
    expect(cache.tamano()).toBe(0);
  });

  it('se invalida por clave (401) y por empresa (cambio de credenciales)', () => {
    const cache = crearCacheTokensHacienda({ margenSeg: () => 0, ahora: () => 0 });
    cache.guardar(claveCacheToken(5, 'SANDBOX', 'u'), { token: 'a', expiraEnSeg: 300 });
    cache.guardar(claveCacheToken(5, 'PRODUCCION', 'u'), { token: 'b', expiraEnSeg: 300 });
    cache.guardar(claveCacheToken(55, 'SANDBOX', 'u'), { token: 'c', expiraEnSeg: 300 });
    cache.invalidar(claveCacheToken(5, 'SANDBOX', 'u'));
    expect(cache.obtener(claveCacheToken(5, 'SANDBOX', 'u'))).toBeNull();
    cache.invalidarEmpresa(5);
    expect(cache.obtener(claveCacheToken(5, 'PRODUCCION', 'u'))).toBeNull();
    expect(cache.obtener(claveCacheToken(55, 'SANDBOX', 'u'))).toBe('c');
  });
});

describe('Cliente HTTP: vigencia del token y códigos HTTP', () => {
  const ENDPOINTS: EndpointsHacienda = { idpTokenUrl: 'https://idp.prueba/token', clientId: 'c', recepcionUrl: 'https://rec.prueba/v1' };

  it('lee expires_in del IdP', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'tok', expires_in: 300 }), { status: 200 })));
    expect(await obtenerTokenHaciendaConVigencia(ENDPOINTS, 'u', 'p', 1000)).toEqual({ token: 'tok', expiraEnSeg: 300 });
  });

  it('el envío informa status y X-Error-Cause', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 400, headers: { 'x-error-cause': 'ya fue recibido' } })));
    const r = await enviarFacturaHacienda({ endpoints: ENDPOINTS, token: 't', clave: '5'.repeat(50), fechaEmisionIso: 'x', tipoIdentificacionEmisor: '02', cedulaEmisor: '3101123456', xmlFirmado: '<a/>', timeoutMs: 1000 });
    expect(r).toMatchObject({ aceptadoParaProcesar: false, status: 400, causa: 'ya fue recibido' });
  });

  it('la consulta informa el código HTTP (401 = token vencido)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    expect(await consultarEstadoHacienda(ENDPOINTS, 't', '5'.repeat(50), 1000)).toMatchObject({ estado: 'error', httpStatus: 401 });
  });
});
