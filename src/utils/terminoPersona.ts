// Perfil Legal: la tabla `pacientes` guarda clientes; solo cambia el texto visible.
export function terminoPersona(perfil?: string) {
  return perfil === 'Legal'
    ? { singular: 'Cliente', plural: 'Clientes', minuscula: 'cliente', minusculaPlural: 'clientes' }
    : { singular: 'Paciente', plural: 'Pacientes', minuscula: 'paciente', minusculaPlural: 'pacientes' };
}
