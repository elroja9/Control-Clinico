import { describe, it, expect } from 'vitest';
import { fechaEmisionCR, generarClaveNumerica, generarConsecutivo, construirXmlFactura, construirXmlNotaCredito, construirXmlNotaDebito, calcularLineas, calcularResumen, RAZON_MAX } from './haciendaFactura';
import { fechaCR, sumarDiasCR } from '../src/utils/fechaCR';

it('las pruebas corren fuera de UTC-6 (si no, la prueba de la clave no distingue el error viejo)', () => {
  expect(new Date('2026-10-01T02:00:00Z').getTimezoneOffset()).not.toBe(360);
});

describe('fechaEmisionCR', () => {
  it('convierte a hora de Costa Rica en vez de pegarle -06:00 a la hora UTC', () => {
    // 05:03 UTC del 6 de agosto = 23:03 del 5 de agosto en Costa Rica (caso real de la BD).
    expect(fechaEmisionCR(new Date('2026-08-06T05:03:56.206Z'))).toBe('2026-08-05T23:03:56-06:00');
  });

  it('representa el mismo instante que la fecha original', () => {
    const ahora = new Date('2026-09-30T23:59:59.000Z');
    expect(new Date(fechaEmisionCR(ahora)).getTime()).toBe(ahora.getTime());
  });
});

describe('generarClaveNumerica', () => {
  it('usa el día de Costa Rica, el mismo de <FechaEmision>', () => {
    const fecha = new Date('2026-10-01T02:00:00Z'); // 30/09 a las 8 p.m. en Costa Rica
    const clave = generarClaveNumerica('3-101-123456', generarConsecutivo(1), fecha);
    expect(clave).toHaveLength(50);
    expect(clave.slice(0, 9)).toBe('506300926');
    expect(fechaEmisionCR(fecha).slice(0, 10)).toBe('2026-09-30');
  });
});

describe('fechaCR / sumarDiasCR', () => {
  it('después de las 6 p.m. sigue siendo el mismo día en Costa Rica', () => {
    expect(fechaCR(new Date('2026-10-01T01:00:00Z'))).toBe('2026-09-30');
    expect(fechaCR(new Date('2026-10-01T06:00:00Z'))).toBe('2026-10-01');
  });

  it('suma días cruzando meses y años', () => {
    expect(sumarDiasCR('2026-09-30', 30)).toBe('2026-10-30');
    expect(sumarDiasCR('2026-12-15', 30)).toBe('2027-01-14');
  });
});

const base = () => {
  const lineas = calcularLineas([{ codigoCabys: '8610000000000', detalle: 'Consulta', unidadMedida: 'Sp', cantidad: 1, precioUnitario: 10000, porcentajeIva: 4 }]);
  return {
    clave: '5'.repeat(50),
    consecutivo: generarConsecutivo(1),
    fechaEmision: new Date('2026-09-30T15:00:00Z'),
    emisor: { nombre: 'Clinica', nombreComercial: '', tipoIdentificacion: '02', identificacion: '3101123456', correoElectronico: 'a@b.cr', provincia: '1', canton: '01', distrito: '01', otrasSenas: 'x', codigoActividad: '869001' },
    receptor: { nombre: 'Paciente', tipoIdentificacion: '01', identificacion: '101110111' },
    medioPago: '01',
    lineas,
    resumen: calcularResumen(lineas)
  };
};

describe('construirXmlFactura — MedioPago', () => {
  it('se declara en una venta de contado', () => {
    const xml = construirXmlFactura({ ...base(), condicionVenta: '01' });
    expect(xml).toContain('<TipoMedioPago>01</TipoMedioPago>');
    expect(xml).toContain('<FechaEmision>2026-09-30T09:00:00-06:00</FechaEmision>');
  });

  it('se omite en una venta a crédito (todavía no se ha pagado nada)', () => {
    const xml = construirXmlFactura({ ...base(), condicionVenta: '02', plazoCredito: 45 });
    expect(xml).not.toContain('<MedioPago>');
    expect(xml).toContain('<PlazoCredito>45</PlazoCredito>');
  });

  it('rechaza una venta a crédito sin plazo', () => {
    expect(() => construirXmlFactura({ ...base(), condicionVenta: '02' })).toThrow(/plazo de crédito/);
  });
});

describe('Notas de Crédito y Débito — InformacionReferencia', () => {
  // Fecha con el formato viejo (6 h corrida) de una factura ya guardada: debe copiarse tal cual.
  const ref = { tipoDocumento: '01', numero: '5'.repeat(50), fechaEmision: '2026-08-06T05:03:56-06:00', codigo: '01', razon: 'Anulación' };

  it('copia la FechaEmisionIR guardada al carácter y va después de ResumenFactura (XSD v4.4)', () => {
    const xml = construirXmlNotaCredito({ ...base(), condicionVenta: '01', referencia: ref });
    expect(xml).toContain('<FechaEmisionIR>2026-08-06T05:03:56-06:00</FechaEmisionIR>');
    expect(xml.indexOf('</ResumenFactura>')).toBeLessThan(xml.indexOf('<InformacionReferencia>'));
  });

  it('omite MedioPago en la nota de una venta a crédito y lo conserva en contado', () => {
    expect(construirXmlNotaCredito({ ...base(), condicionVenta: '02', plazoCredito: 30, referencia: ref })).not.toContain('<MedioPago>');
    expect(construirXmlNotaDebito({ ...base(), condicionVenta: '01', referencia: { ...ref, codigo: '02' } })).toContain('<MedioPago>');
  });

  it(`recorta <Razon> a ${RAZON_MAX} caracteres (maxLength del XSD)`, () => {
    const xml = construirXmlNotaDebito({ ...base(), condicionVenta: '01', referencia: { ...ref, razon: 'x'.repeat(250) } });
    expect(xml).toContain(`<Razon>${'x'.repeat(RAZON_MAX)}</Razon>`);
  });

  it('escapa los códigos de catálogo dentro del XML que se firma', () => {
    const xml = construirXmlFactura({ ...base(), condicionVenta: '01', medioPago: '01<x/>' });
    expect(xml).toContain('<TipoMedioPago>01&lt;x/&gt;</TipoMedioPago>');
  });
});
