import { colones } from './facturacion';

// `precio` de un servicio es la BASE sin IVA (hasta 5 decimales). Estas utilidades convierten
// entre base y precio final (con IVA) con la misma convención de redondeo que la facturación.

function redondear(valor: number, decimales: number): number {
  const factor = Math.pow(10, decimales);
  return Math.round((Number(valor) + Number.EPSILON) * factor) / factor;
}

/** IVA aplicable al servicio: el propio si lo tiene, si no el de la empresa. */
export function ivaEfectivo(
  servicio: { porcentajeIva?: number | string | null },
  ivaPorDefecto: number | string | null | undefined
): number {
  const propio = servicio.porcentajeIva;
  if (propio != null && propio !== '' && Number.isFinite(Number(propio))) return Number(propio);
  const defecto = Number(ivaPorDefecto);
  return Number.isFinite(defecto) ? defecto : 0;
}

/** Precio final (base + IVA) redondeado a 2 decimales, para mostrar. */
export function precioConIva(base: number | string, iva: number): number {
  return redondear(Number(base) * (1 + Number(iva) / 100), 2);
}

/** Base sin IVA a partir del precio final, redondeada a 5 decimales (la precisión de la BD). */
export function baseDesdePrecioConIva(total: number | string, iva: number): number {
  return redondear(Number(total) / (1 + Number(iva) / 100), 5);
}

/** Formato de colones del proyecto (₡1.234,56). */
export function formatearColones(monto: number): string {
  return colones(Number(monto));
}
