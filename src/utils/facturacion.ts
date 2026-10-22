import { fechaCR } from './fechaCR';

// Catálogo de medios de pago de Hacienda (nota 6 del anexo v4.4) — lo que viaja en <TipoMedioPago>.
export const MEDIO_PAGO_HACIENDA: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Tarjeta',
  '03': 'Cheque',
  '04': 'Transferencia',
  '06': 'SINPE Móvil'
};

// Abonos de CxC/CxP: códigos internos (no van a Hacienda) que ya están guardados con este significado.
export const MEDIO_PAGO_ABONO: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Tarjeta',
  '03': 'Transferencia / SINPE',
  '04': 'Cheque'
};

export function colones(n: number): string {
  return `₡${n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "2026-10-05" → "05/10/2026" */
export function fechaCorta(ymd: string): string {
  const [a, m, d] = ymd.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : ymd;
}

/** Texto de plazo de una cuenta pendiente: "vence hoy", "vence en 3 días", "vencida hace 5 días". */
export function plazoVencimiento(fechaVencimiento: string): { texto: string; vencida: boolean } {
  const dias = Math.round((Date.parse(`${fechaVencimiento}T00:00:00Z`) - Date.parse(`${fechaCR()}T00:00:00Z`)) / 86_400_000);
  if (dias === 0) return { texto: 'vence hoy', vencida: false };
  if (dias > 0) return { texto: `vence en ${dias} día${dias === 1 ? '' : 's'}`, vencida: false };
  return { texto: `vencida hace ${-dias} día${dias === -1 ? '' : 's'}`, vencida: true };
}
