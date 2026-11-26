// Largo de la identificación según el catálogo de Hacienda (sin guiones). Compartido por el
// navegador y el servidor. Una cédula mal digitada hace que la factura del proveedor no calce con
// la empresa y se pierda el crédito fiscal.
const DIGITOS_POR_TIPO: Record<string, number[]> = { '01': [9], '02': [10], '03': [11, 12], '04': [10] };

export type TipoIdentificacion = '01' | '02' | '03' | '04';

/** Tipos de identificación del catálogo de Hacienda, con su etiqueta para los selectores. */
export const TIPOS_IDENTIFICACION: Array<{ codigo: TipoIdentificacion; etiqueta: string; ayuda: string }> = [
  { codigo: '01', etiqueta: 'Cédula física', ayuda: '9 dígitos, p. ej. 1-0234-0567' },
  { codigo: '02', etiqueta: 'Cédula jurídica', ayuda: '10 dígitos, p. ej. 3-101-123456' },
  { codigo: '03', etiqueta: 'DIMEX', ayuda: '11 o 12 dígitos' },
  { codigo: '04', etiqueta: 'NITE', ayuda: '10 dígitos' }
];

export function esTipoIdentificacion(tipo: unknown): tipo is TipoIdentificacion {
  return typeof tipo === 'string' && Object.prototype.hasOwnProperty.call(DIGITOS_POR_TIPO, tipo);
}

/** La identificación sin guiones ni espacios. */
export function soloDigitosIdentificacion(identificacion: string | null | undefined): string {
  return String(identificacion ?? '').replace(/\D/g, '');
}

/** Mensaje del problema de la identificación, o null si calza con su tipo. */
export function errorIdentificacion(tipo: string, identificacion: string): string | null {
  if (/[^\d\s-]/.test(identificacion)) return 'La identificación solo lleva números (y guiones opcionales).';
  const digitos = identificacion.replace(/\D/g, '').length;
  const permitidos = DIGITOS_POR_TIPO[tipo];
  if (!permitidos) return 'Tipo de identificación inválido.';
  return permitidos.includes(digitos)
    ? null
    : `Una identificación de este tipo lleva ${permitidos.join(' u ')} dígitos; esta tiene ${digitos}.`;
}
