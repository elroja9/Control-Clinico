import { describe, it, expect } from 'vitest';
import { baseDesdePrecioConIva, ivaEfectivo, precioConIva } from './precios';
import { calcularLineas } from '../../server/haciendaFactura';

describe('ivaEfectivo', () => {
  it('usa el IVA del servicio o el de la empresa si es null', () => {
    expect(ivaEfectivo({ porcentajeIva: 4 }, 13)).toBe(4);
    expect(ivaEfectivo({ porcentajeIva: 0 }, 13)).toBe(0);
    expect(ivaEfectivo({ porcentajeIva: null }, 13)).toBe(13);
    expect(ivaEfectivo({}, '13')).toBe(13);
  });
});

describe('ida y vuelta precio con IVA -> base -> facturación', () => {
  const ivas = [13, 4, 2, 1, 0];
  const totales = [25000, 15000, 9999.99];

  for (const iva of ivas) {
    for (const total of totales) {
      it(`total ${total} con IVA ${iva}%`, () => {
        const base = baseDesdePrecioConIva(total, iva);
        // Máximo 5 decimales
        expect(Math.abs(base * 1e5 - Math.round(base * 1e5))).toBeLessThan(1e-6);

        const [linea] = calcularLineas([{
          codigoCabys: '9311100000000', detalle: 'x', unidadMedida: 'Sp',
          cantidad: 1, precioUnitario: base, porcentajeIva: iva
        }]);
        // La factura, a 2 decimales, coincide con el precio con IVA mostrado
        expect(linea.montoTotalLinea.toFixed(2)).toBe(total.toFixed(2));
        // y el desglose cuadra con precioConIva
        expect(precioConIva(base, iva)).toBe(total);
      });
    }
  }

  it('25000 con 13% da exactamente 25000.00', () => {
    const base = baseDesdePrecioConIva(25000, 13);
    const [l] = calcularLineas([{
      codigoCabys: '9311100000000', detalle: 'x', unidadMedida: 'Sp',
      cantidad: 1, precioUnitario: base, porcentajeIva: 13
    }]);
    expect(l.montoTotalLinea.toFixed(2)).toBe('25000.00');
  });
});
