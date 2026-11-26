// Validación de los datos fiscales con que nace una empresa en el autorregistro. Compartido por el
// navegador (LoginView) y el servidor (POST /api/companies): son los datos con que el ERP le
// factura la suscripción, así que deben llegar completos y válidos desde el inicio.
import { COSTA_RICA_PROVINCIAS } from '../data/costaRicaLocations';
import { errorIdentificacion, esTipoIdentificacion } from './identificacion';

export interface DatosFiscalesAlta {
  tipoIdentificacion?: unknown;
  identificacion?: unknown;
  razonSocial?: unknown;
  correoEmisor?: unknown;
  provincia?: unknown;
  canton?: unknown;
  distrito?: unknown;
}

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** true si provincia/cantón/distrito existen en el catálogo (códigos INEC de Hacienda). */
export function ubicacionValida(provincia: string, canton: string, distrito: string): boolean {
  const p = COSTA_RICA_PROVINCIAS.find(x => x.codigo === provincia);
  const c = p?.cantones.find(x => x.codigo === canton);
  return !!c?.distritos.some(x => x.codigo === distrito);
}

/** Primer problema de los datos fiscales del alta, o null si están completos. */
export function errorDatosFiscalesAlta(d: DatosFiscalesAlta): string | null {
  const tipo = String(d.tipoIdentificacion ?? '');
  if (!esTipoIdentificacion(tipo)) return 'Seleccione el tipo de identificación.';
  const problema = errorIdentificacion(tipo, String(d.identificacion ?? ''));
  if (problema) return problema;
  const razon = String(d.razonSocial ?? '').trim();
  if (!razon) return 'Indique la razón social (o el nombre completo si es persona física).';
  if (razon.length > 100) return 'La razón social admite como máximo 100 caracteres.';
  const correo = String(d.correoEmisor ?? '').trim();
  if (!CORREO_VALIDO.test(correo) || correo.length > 160) return 'El correo de facturación no es válido.';
  if (!ubicacionValida(String(d.provincia ?? ''), String(d.canton ?? ''), String(d.distrito ?? ''))) {
    return 'Seleccione la provincia, el cantón y el distrito de la empresa.';
  }
  return null;
}
