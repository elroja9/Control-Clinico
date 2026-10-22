// Largo de la identificación según el catálogo de Hacienda (sin guiones). Compartido por el
// navegador y el servidor. Una cédula mal digitada hace que la factura del proveedor no calce con
// la empresa y se pierda el crédito fiscal.
const DIGITOS_POR_TIPO: Record<string, number[]> = { '01': [9], '02': [10], '03': [11, 12], '04': [10] };

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
