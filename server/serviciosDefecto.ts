// Servicios por defecto para nuevas empresas de Fisioterapia/Nutrición/Ambas — Spa/Bienestar
// queda excluido a propósito (esos negocios definen su propio catálogo de servicios, no hay un
// colegio profesional que regule "sesión de sauna").
//
// Fisioterapia: montos tomados del Decreto Ejecutivo N°41691-S ("Arancel de Honorarios Mínimos
// de Profesionales en Terapia Física"), vigente — un intento posterior de volverlo referencial
// (Decreto 43702-MS-MEIC, 2022) fue suspendido judicialmente, así que estos mínimos siguen
// rigiendo. Fuente: Colegio de Terapeutas de Costa Rica (colegiodeterapeutas.cr).
//
// Nutrición: el Colegio de Profesionales en Nutrición (CPN) también tuvo un arancel obligatorio
// (Decreto 37693-S / actualización 2015), pero en 2024 un tribunal NO suspendió el decreto que
// elimina esos mínimos para Nutrición — el monto oficial vigente no se pudo verificar contra una
// fuente primaria confiable. Por eso los servicios de nutrición se crean con precio en 0: la
// empresa debe fijar su propia tarifa, en vez de asumir un monto no verificado.

import type { Servicio } from "../src/data/mockData";

type ServicioDefecto = Omit<Servicio, "id" | "idCompania">;

// Campos de inventario que no aplican a estos servicios por defecto (todos tipo SERVICIO, sin
// existencias) — se comparten por spread en vez de repetirlos en cada literal de abajo.
const SIN_INVENTARIO = { tipo: "SERVICIO" as const, stock: null, stockMinimo: null, costoUnitario: null, codigoBarras: null };

const SERVICIOS_FISIOTERAPIA: ServicioDefecto[] = [
  { ...SIN_INVENTARIO, nombre: "Sesión de Fisioterapia Individual", precio: 15400, porcentajeIva: null, duracionMinutos: 45, codigoCabys: null, unidadMedida: "Sp", activo: true },
  { ...SIN_INVENTARIO, nombre: "Sesión de Fisioterapia Individual (plan 3+ veces/semana)", precio: 12320, porcentajeIva: null, duracionMinutos: 45, codigoCabys: null, unidadMedida: "Sp", activo: true },
  { ...SIN_INVENTARIO, nombre: "Sesión de Fisioterapia a Domicilio", precio: 18500, porcentajeIva: null, duracionMinutos: 60, codigoCabys: null, unidadMedida: "Sp", activo: true },
  { ...SIN_INVENTARIO, nombre: "Sesión de Fisioterapia Grupal (2-5 personas)", precio: 10300, porcentajeIva: null, duracionMinutos: 45, codigoCabys: null, unidadMedida: "Sp", activo: true }
];

const SERVICIOS_NUTRICION: ServicioDefecto[] = [
  { ...SIN_INVENTARIO, nombre: "Consulta Nutricional de Primera Vez", precio: 0, porcentajeIva: null, duracionMinutos: 45, codigoCabys: null, unidadMedida: "Sp", activo: true },
  { ...SIN_INVENTARIO, nombre: "Consulta Nutricional de Seguimiento", precio: 0, porcentajeIva: null, duracionMinutos: 30, codigoCabys: null, unidadMedida: "Sp", activo: true },
  { ...SIN_INVENTARIO, nombre: "Asesoría Nutricional", precio: 0, porcentajeIva: null, duracionMinutos: 30, codigoCabys: null, unidadMedida: "Spe", activo: true }
];

/**
 * Servicios por defecto según el perfil de la empresa. Devuelve [] para 'Spa' (y cualquier
 * perfil que no sea Fisioterapia/Nutrición/Ambas) — a propósito, por instrucción explícita de
 * limitar esto a los colegios de fisioterapia y nutrición únicamente.
 */
export function serviciosDefectoParaPerfil(perfilCompania: string): ServicioDefecto[] {
  if (perfilCompania === "Fisioterapia") return SERVICIOS_FISIOTERAPIA;
  if (perfilCompania === "Nutrición") return SERVICIOS_NUTRICION;
  if (perfilCompania === "Ambas") return [...SERVICIOS_FISIOTERAPIA, ...SERVICIOS_NUTRICION];
  return [];
}
