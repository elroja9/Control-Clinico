// Modalidad de un servicio: en qué tipo de visita se puede ofrecer.
export type ModalidadServicio = 'CONSULTORIO' | 'DOMICILIO' | 'AMBOS';
export type TipoVisitaCita = 'CONSULTORIO' | 'DOMICILIO';

export const MODALIDADES_SERVICIO: ModalidadServicio[] = ['CONSULTORIO', 'DOMICILIO', 'AMBOS'];

// Valor desconocido o ausente => 'AMBOS'.
export function normalizarModalidad(valor: unknown): ModalidadServicio {
  return MODALIDADES_SERVICIO.includes(valor as ModalidadServicio) ? (valor as ModalidadServicio) : 'AMBOS';
}

export function servicioCompatible(modalidad: unknown, tipoVisita: TipoVisitaCita): boolean {
  const m = normalizarModalidad(modalidad);
  return m === 'AMBOS' || m === tipoVisita;
}
