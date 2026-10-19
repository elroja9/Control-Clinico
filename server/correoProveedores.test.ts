import { describe, it, expect } from 'vitest';
import { extraerMetadatosComprobante, esCompraDeLaEmpresa, partesXmlDelMensaje, carpetasDe } from './correoProveedores';

const CLAVE = '50619102600310123456700100001010000000123100000001';
const EMPRESA = '3101445566';

function comprobante(raiz: string, opciones: { receptor?: string | null; moneda?: string; tipoCambio?: string; total?: string } = {}) {
  const receptor = opciones.receptor === null ? '' :
    `<Receptor><Nombre>FisioNutri</Nombre><Identificacion><Tipo>02</Tipo><Numero>${opciones.receptor ?? '3-101-445566'}</Numero></Identificacion></Receptor>`;
  const moneda = opciones.moneda
    ? `<CodigoTipoMoneda><CodigoMoneda>${opciones.moneda}</CodigoMoneda><TipoCambio>${opciones.tipoCambio ?? ''}</TipoCambio></CodigoTipoMoneda>`
    : '';
  return `﻿<?xml version="1.0" encoding="utf-8"?>
<${raiz} xmlns="https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/x">
  <Clave>${CLAVE}</Clave>
  <NumeroConsecutivo>00100001010000000123</NumeroConsecutivo>
  <FechaEmision>2026-10-10T09:00:00-06:00</FechaEmision>
  <Emisor><Nombre>Distribuidora Médica S.A.</Nombre><Identificacion><Tipo>02</Tipo><Numero>3-101-234567</Numero></Identificacion></Emisor>
  ${receptor}
  <ResumenFactura>${moneda}<TotalComprobante>${opciones.total ?? '11300.00'}</TotalComprobante></ResumenFactura>
</${raiz}>`;
}

describe('extraerMetadatosComprobante', () => {
  it('lee una factura electrónica', () => {
    const m = extraerMetadatosComprobante(comprobante('FacturaElectronica'))!;
    expect(m.tipoDocumento).toBe('01');
    expect(m.clave).toBe(CLAVE);
    expect(m.emisorIdentificacion).toBe('3101234567');
    expect(m.receptorIdentificacion).toBe(EMPRESA);
    expect(m.total).toBe(11300);
    expect(m.moneda).toBe('CRC');
  });
  it('lee un tiquete sin receptor', () => {
    const m = extraerMetadatosComprobante(comprobante('TiqueteElectronico', { receptor: null }))!;
    expect(m.tipoDocumento).toBe('04');
    expect(m.receptorIdentificacion).toBe('');
  });
  it('rechaza notas de crédito y débito (el importador no las soporta)', () => {
    expect(extraerMetadatosComprobante(comprobante('NotaCreditoElectronica'))).toBeNull();
    expect(extraerMetadatosComprobante(comprobante('NotaDebitoElectronica'))).toBeNull();
  });
  it('rechaza el MensajeHacienda y XML inválido', () => {
    expect(extraerMetadatosComprobante('<MensajeHacienda><Clave>1</Clave></MensajeHacienda>')).toBeNull();
    expect(extraerMetadatosComprobante('no es xml')).toBeNull();
  });
  it('convierte a colones un comprobante en dólares', () => {
    const m = extraerMetadatosComprobante(comprobante('FacturaElectronica', { moneda: 'USD', tipoCambio: '512.50', total: '100' }))!;
    expect(m.moneda).toBe('USD');
    expect(m.tipoCambio).toBe(512.5);
    expect(m.total).toBe(51250);
  });
});

describe('esCompraDeLaEmpresa', () => {
  const meta = extraerMetadatosComprobante(comprobante('FacturaElectronica'))!;
  it('acepta una factura a nombre de la empresa', () => expect(esCompraDeLaEmpresa(meta, '3-101-445566')).toBe(true));
  it('rechaza una factura a otra cédula', () => expect(esCompraDeLaEmpresa({ ...meta, receptorIdentificacion: '111' }, EMPRESA)).toBe(false));
  it('rechaza las facturas que emitió la propia empresa', () => expect(esCompraDeLaEmpresa({ ...meta, emisorIdentificacion: EMPRESA }, EMPRESA)).toBe(false));
  it('acepta un tiquete (sin receptor) de otro emisor', () => expect(esCompraDeLaEmpresa({ ...meta, receptorIdentificacion: '' }, EMPRESA)).toBe(true));
  it('sin cédula de empresa no acepta nada', () => expect(esCompraDeLaEmpresa(meta, '')).toBe(false));
});

describe('partesXmlDelMensaje', () => {
  it('encuentra XML y ZIP adjuntos e ignora el PDF', () => {
    const estructura = {
      type: 'multipart/mixed',
      childNodes: [
        { part: '1', type: 'text/plain' },
        { part: '2', type: 'application/pdf', dispositionParameters: { filename: 'factura.pdf' } },
        { part: '3', type: 'application/octet-stream', dispositionParameters: { filename: 'FE-123.xml' } },
        { part: '4', type: 'application/zip', parameters: { name: 'paquete.zip' } }
      ]
    };
    expect(partesXmlDelMensaje(estructura)).toEqual([
      { part: '3', nombre: 'FE-123.xml', esZip: false },
      { part: '4', nombre: 'paquete.zip', esZip: true }
    ]);
  });
  it('un correo cuyo cuerpo entero es el XML se pide como parte 1', () => {
    expect(partesXmlDelMensaje({ type: 'application/xml' })).toEqual([{ part: '1', nombre: 'adjunto.xml', esZip: false }]);
  });
  it('sin adjuntos XML no devuelve nada', () => {
    expect(partesXmlDelMensaje({ type: 'multipart/alternative', childNodes: [{ part: '1', type: 'text/html' }] })).toEqual([]);
  });
});

describe('carpetasDe', () => {
  it('separa por coma, recorta y quita duplicados', () => expect(carpetasDe(' INBOX, Facturas ,INBOX,')).toEqual(['INBOX', 'Facturas']));
  it('por defecto INBOX', () => expect(carpetasDe('')).toEqual(['INBOX']));
});
