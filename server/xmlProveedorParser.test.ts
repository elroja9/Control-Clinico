import { describe, it, expect } from 'vitest';
import { parsearFacturaProveedorXML } from './xmlProveedorParser';

function facturaXml(opciones: { moneda?: string; tipoCambio?: string; lineas: string; total: string; raiz?: string }) {
  const raiz = opciones.raiz || 'FacturaElectronica';
  const moneda = opciones.moneda
    ? `<CodigoTipoMoneda><CodigoMoneda>${opciones.moneda}</CodigoMoneda>${opciones.tipoCambio != null ? `<TipoCambio>${opciones.tipoCambio}</TipoCambio>` : ''}</CodigoTipoMoneda>`
    : '';
  return `<?xml version="1.0" encoding="utf-8"?>
<${raiz} xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica">
  <Clave>50630092600310112345600100001010000000123100000001</Clave>
  <NumeroConsecutivo>00100001010000000123</NumeroConsecutivo>
  <FechaEmision>2026-09-30T10:15:00-06:00</FechaEmision>
  <Emisor>
    <Nombre>Distribuidora S.A.</Nombre>
    <Identificacion><Tipo>02</Tipo><Numero>3101123456</Numero></Identificacion>
    <Ubicacion><Provincia>1</Provincia><Canton>01</Canton><Distrito>01</Distrito><OtrasSenas>San José</OtrasSenas></Ubicacion>
    <CorreoElectronico>ventas@distri.cr</CorreoElectronico>
  </Emisor>
  <CondicionVenta>02</CondicionVenta>
  <PlazoCredito>15</PlazoCredito>
  <DetalleServicio>${opciones.lineas}</DetalleServicio>
  <ResumenFactura>${moneda}<TotalComprobante>${opciones.total}</TotalComprobante></ResumenFactura>
</${raiz}>`;
}

// Cerveza: específico (04) y selectivo (02) ANTES del IVA (07), con descuento. Caso real del POS.
const LINEA_CERVEZA = `
  <LineaDetalle>
    <NumeroLinea>1</NumeroLinea>
    <CodigoCABYS>2213000000100</CodigoCABYS>
    <CodigoComercial><Tipo>01</Tipo><Codigo>7441000000012</Codigo></CodigoComercial>
    <Cantidad>24</Cantidad>
    <UnidadMedida>Unid</UnidadMedida>
    <Detalle>Cerveza lata 350ml</Detalle>
    <PrecioUnitario>1000.00000</PrecioUnitario>
    <MontoTotal>24000.00000</MontoTotal>
    <Descuento><MontoDescuento>2000.00000</MontoDescuento><CodigoDescuento>07</CodigoDescuento></Descuento>
    <SubTotal>22000.00000</SubTotal>
    <Impuesto><Codigo>04</Codigo><Tarifa>4.50</Tarifa><Monto>990.00000</Monto></Impuesto>
    <Impuesto><Codigo>02</Codigo><Tarifa>10.00</Tarifa><Monto>2299.00000</Monto></Impuesto>
    <Impuesto><Codigo>07</Codigo><CodigoTarifaIVA>08</CodigoTarifaIVA><Tarifa>13.00</Tarifa><Monto>3287.87000</Monto></Impuesto>
    <MontoTotalLinea>28576.87000</MontoTotalLinea>
  </LineaDetalle>`;

const LINEA_GUANTES = `
  <LineaDetalle>
    <NumeroLinea>2</NumeroLinea>
    <CodigoCABYS>3929000000100</CodigoCABYS>
    <Cantidad>10</Cantidad>
    <UnidadMedida>Unid</UnidadMedida>
    <Detalle>Guantes de látex</Detalle>
    <PrecioUnitario>500.00000</PrecioUnitario>
    <MontoTotal>5000.00000</MontoTotal>
    <SubTotal>5000.00000</SubTotal>
    <Impuesto><Codigo>01</Codigo><CodigoTarifaIVA>08</CodigoTarifaIVA><Tarifa>13.00</Tarifa><Monto>650.00000</Monto>
      <Exoneracion><MontoExoneracion>150.00000</MontoExoneracion></Exoneracion>
    </Impuesto>
    <MontoTotalLinea>5500.00000</MontoTotalLinea>
  </LineaDetalle>`;

describe('parsearFacturaProveedorXML — IVA real por línea', () => {
  const parsed = parsearFacturaProveedorXML(facturaXml({ lineas: LINEA_CERVEZA + LINEA_GUANTES, total: '34076.87000' }));

  it('toma el impuesto de IVA aunque no sea el primero, ignorando específico y selectivo', () => {
    const cerveza = parsed.lineas[0];
    expect(cerveza.porcentajeIva).toBe(13);
    expect(cerveza.montoIva).toBeCloseTo(3287.87, 5);
    expect(cerveza.subtotal).toBe(22000); // después del descuento
    expect(cerveza.codigoComercial).toBe('7441000000012');
  });

  it('descuenta lo exonerado del IVA acreditable', () => {
    expect(parsed.lineas[1].montoIva).toBeCloseTo(500, 5);
  });

  it('conserva la clave y el consecutivo del proveedor', () => {
    expect(parsed.claveHacienda).toHaveLength(50);
    expect(parsed.numeroFacturaProv).toBe('00100001010000000123');
    expect(parsed.condicionVenta).toBe('02');
    expect(parsed.plazoDias).toBe(15);
    expect(parsed.moneda).toBe('CRC');
  });
});

describe('parsearFacturaProveedorXML — moneda extranjera', () => {
  it('convierte los montos a colones con el tipo de cambio del comprobante', () => {
    const parsed = parsearFacturaProveedorXML(facturaXml({ moneda: 'USD', tipoCambio: '500.00', lineas: LINEA_GUANTES, total: '11.00000' }));
    expect(parsed.moneda).toBe('USD');
    expect(parsed.tipoCambio).toBe(500);
    expect(parsed.montoTotal).toBe(5500);
    expect(parsed.lineas[0].precioUnitario).toBe(250000);
    expect(parsed.lineas[0].montoIva).toBe(250000); // (650 − 150) × 500
  });

  it('se niega a importar un comprobante en dólares sin tipo de cambio', () => {
    expect(() => parsearFacturaProveedorXML(facturaXml({ moneda: 'USD', lineas: LINEA_GUANTES, total: '11' })))
      .toThrow(/tipo de cambio/);
  });
});

describe('parsearFacturaProveedorXML — archivos inválidos', () => {
  it('rechaza un XML mal formado', () => {
    const roto = facturaXml({ lineas: LINEA_GUANTES, total: '5500' }).slice(0, 400);
    expect(() => parsearFacturaProveedorXML(roto)).toThrow(/no es un XML válido/);
  });

  it('rechaza un archivo que no es XML', () => {
    expect(() => parsearFacturaProveedorXML('esto no es un xml')).toThrow();
  });

  it('explica que las Notas de Crédito del proveedor no se importan', () => {
    expect(() => parsearFacturaProveedorXML(facturaXml({ raiz: 'NotaCreditoElectronica', lineas: LINEA_GUANTES, total: '5500' })))
      .toThrow(/Nota de Crédito\/Débito/);
  });
});
