// Reglas de negocio de la emisión de comprobantes, sin E/S (se prueban aisladas):
// - qué comprobante corresponde (Factura 01 o Tiquete 04) según el receptor y la condición de venta,
// - validación de catálogos de Hacienda guardados en BD (hacienda_catalogos),
// - validaciones previas a la transmisión (datos del emisor, certificado, credenciales ATV).
//
// Import exclusivo del servidor.

import { codigoActividadValido, limpiarIdentificacion } from "./haciendaFactura";

/** Largo de la identificación costarricense por tipo (catálogo de Hacienda). EXT/pasaporte no es válido. */
const DIGITOS_POR_TIPO: Record<string, number[]> = { "01": [9], "02": [10], "03": [11, 12], "04": [10] };

/** true si (tipo, número) es una identificación que Hacienda acepta en <Receptor>. */
export function identificacionReceptorValida(tipo: string | null | undefined, numero: string | null | undefined): boolean {
  const permitidos = DIGITOS_POR_TIPO[String(tipo ?? "")];
  if (!permitidos) return false;
  const crudo = String(numero ?? "");
  if (/[^\d\s-]/.test(crudo)) return false;
  return permitidos.includes(limpiarIdentificacion(crudo).length);
}

export interface ReceptorPropuesto {
  tipoIdentificacion: string | null | undefined;
  identificacion: string | null | undefined;
}

export interface DecisionComprobante {
  tipoDocumento: "01" | "04";
  /** true si el receptor lleva identificación válida (va el bloque <Receptor>). */
  receptorValido: boolean;
  /** Presente si no se puede emitir con estos datos (p. ej. crédito sin receptor identificado). */
  error?: string;
}

/**
 * Regla del servidor (nunca se confía en lo que diga el navegador):
 * - receptor con identificación costarricense válida (01 física 9, 02 jurídica 10, 03 DIMEX 11-12,
 *   04 NITE 10) → Factura Electrónica (01);
 * - sin identificación válida (pasaporte/EXT, sin cédula) → Tiquete Electrónico (04), sin <Receptor>;
 * - una condición de venta que exige receptor identificado (crédito: `condicionesQueExigenReceptor`,
 *   de parametros_sistema) sin identificación válida → error.
 * Un tipo "EXT" nunca se transforma en DIMEX "03" (antes se hacía y Hacienda lo rechazaba).
 */
export function decidirTipoComprobante(receptor: ReceptorPropuesto | null, condicionVenta: string, condicionesQueExigenReceptor: string[]): DecisionComprobante {
  const valido = !!receptor && identificacionReceptorValida(receptor.tipoIdentificacion, receptor.identificacion);
  if (valido) return { tipoDocumento: "01", receptorValido: true };
  if (condicionesQueExigenReceptor.includes(condicionVenta)) {
    return {
      tipoDocumento: "04",
      receptorValido: false,
      error: "Una venta a crédito necesita una Factura Electrónica con un receptor identificado (cédula física, jurídica, DIMEX o NITE). Corrija la identificación o facture a un tercero."
    };
  }
  return { tipoDocumento: "04", receptorValido: false };
}

/** Tipo de documento de referencia (<TipoDocIR>) para una nota sobre `tipoDocumentoOriginal`. */
export function tipoDocReferencia(tipoDocumentoOriginal: string | null | undefined): string {
  return tipoDocumentoOriginal === "04" ? "04" : "01";
}

// --- Catálogos (hacienda_catalogos) ---

export type TipoCatalogo = "CONDICION_VENTA" | "MEDIO_PAGO" | "CODIGO_DESCUENTO";

export interface EntradaCatalogo {
  tipo: TipoCatalogo;
  codigo: string;
  descripcion: string;
  orden: number;
}

/** Códigos activos de un tipo de catálogo. */
export function codigosDe(catalogo: EntradaCatalogo[], tipo: TipoCatalogo): string[] {
  return catalogo.filter(e => e.tipo === tipo).map(e => e.codigo);
}

/** true si `codigo` es un código de dos dígitos que existe en el catálogo `tipo`. */
export function codigoEnCatalogo(catalogo: EntradaCatalogo[], tipo: TipoCatalogo, codigo: unknown): codigo is string {
  return typeof codigo === "string" && /^\d{2}$/.test(codigo) && codigosDe(catalogo, tipo).includes(codigo);
}

/**
 * Catálogos oficiales v4.4 para el modo SIN base de datos (demostración en memoria): ahí no existe
 * hacienda_catalogos y tampoco se transmite nada a Hacienda. Con BD SIEMPRE se usan los de la tabla
 * (docs/sql/2026-11-27-facturacion-robusta.sql siembra los mismos valores).
 */
export const CATALOGOS_SIN_BD: EntradaCatalogo[] = [
  { tipo: "CONDICION_VENTA", codigo: "01", descripcion: "Contado", orden: 10 },
  { tipo: "CONDICION_VENTA", codigo: "02", descripcion: "Crédito", orden: 20 },
  { tipo: "MEDIO_PAGO", codigo: "01", descripcion: "Efectivo", orden: 10 },
  { tipo: "MEDIO_PAGO", codigo: "02", descripcion: "Tarjeta", orden: 20 },
  { tipo: "MEDIO_PAGO", codigo: "03", descripcion: "Cheque", orden: 30 },
  { tipo: "MEDIO_PAGO", codigo: "04", descripcion: "Transferencia – depósito bancario", orden: 40 },
  { tipo: "MEDIO_PAGO", codigo: "05", descripcion: "Recaudado por terceros", orden: 50 },
  { tipo: "MEDIO_PAGO", codigo: "06", descripcion: "SINPE Móvil", orden: 60 },
  { tipo: "MEDIO_PAGO", codigo: "07", descripcion: "Plataforma digital", orden: 70 },
  { tipo: "MEDIO_PAGO", codigo: "99", descripcion: "Otros", orden: 990 },
  { tipo: "CODIGO_DESCUENTO", codigo: "07", descripcion: "Descuento comercial", orden: 70 },
  { tipo: "CODIGO_DESCUENTO", codigo: "99", descripcion: "Otros descuentos", orden: 990 }
];

// --- Validaciones previas a la transmisión ---

export interface EmisorParaValidar {
  correoEmisor?: string | null;
  actividadEconomica?: string | null;
  tipoIdentificacion?: string | null;
  identificacion?: string | null;
  razonSocial?: string | null;
  provincia?: string | null;
  canton?: string | null;
  distrito?: string | null;
  otrasSenas?: string | null;
}

const CORREO_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Datos del emisor que van en el XML. Devuelve la lista de problemas (vacía = todo bien), en
 * español y con dónde se corrigen. Se llama ANTES de reservar un consecutivo.
 */
export function problemasEmisor(c: EmisorParaValidar): string[] {
  const problemas: string[] = [];
  if (!String(c.razonSocial ?? "").trim()) problemas.push("Falta la razón social de la empresa (Personalizar › Empresa).");
  if (!identificacionReceptorValida(c.tipoIdentificacion, c.identificacion)) {
    problemas.push("La identificación de la empresa no calza con su tipo (física 9 dígitos, jurídica 10, DIMEX 11-12, NITE 10).");
  }
  if (!CORREO_RE.test(String(c.correoEmisor ?? "").trim())) problemas.push("Falta un correo electrónico válido del emisor (Personalizar › Empresa).");
  if (!codigoActividadValido(c.actividadEconomica)) {
    problemas.push("Falta el código de actividad económica de 6 dígitos de la empresa (Personalizar › Empresa); Hacienda rechaza «000000».");
  }
  if (!/^\d$/.test(String(c.provincia ?? "")) || !/^\d{1,2}$/.test(String(c.canton ?? "")) || !/^\d{1,2}$/.test(String(c.distrito ?? ""))) {
    problemas.push("Configure la ubicación fiscal de la empresa (provincia, cantón y distrito).");
  }
  const senas = String(c.otrasSenas ?? "").trim();
  if (senas.length < 5) problemas.push("Las otras señas de la dirección fiscal deben tener al menos 5 caracteres.");
  return problemas;
}

export interface ConfigTransmisionParaValidar {
  tieneCertificado: boolean;
  /** 'YYYY-MM-DD' o null si no se conoce. */
  certificadoVenceEn: string | null;
  tieneCredencialesAtv: boolean;
}

/** Certificado y credenciales para transmitir. `hoy` = 'YYYY-MM-DD' (Costa Rica). */
export function problemasTransmision(cfg: ConfigTransmisionParaValidar, hoy: string): string[] {
  const problemas: string[] = [];
  if (!cfg.tieneCertificado) problemas.push("Configure primero la Firma Digital de Hacienda (certificado .p12) en Personalizar › Hacienda.");
  else if (cfg.certificadoVenceEn && cfg.certificadoVenceEn < hoy) {
    problemas.push(`El certificado de firma venció el ${cfg.certificadoVenceEn}: cargue el nuevo .p12 en Personalizar › Hacienda.`);
  }
  if (!cfg.tieneCredencialesAtv) problemas.push("Configure primero el usuario y contraseña ATV de Hacienda en Personalizar › Hacienda.");
  return problemas;
}

/** Valida el texto de <Detalle>: largo entre `min` y `max` tras recortar espacios. */
export function errorDetalle(detalle: string, min: number, max: number): string | null {
  const largo = Array.from(String(detalle ?? "").trim()).length;
  if (largo < min) return `El detalle «${detalle}» debe tener al menos ${min} caracteres.`;
  if (largo > max) return `El detalle «${String(detalle).slice(0, 40)}…» supera los ${max} caracteres que admite Hacienda.`;
  return null;
}

// --- Facturar a un tercero ---

export interface TerceroNormalizado {
  tipoIdentificacion: string; // '01'..'04' o 'EXT' (extranjero sin identificación costarricense)
  numero: string;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  codigoActividad: string | null;
}

/**
 * Valida los datos de un tercero (la empresa donde trabaja el paciente, un familiar...). Con
 * tipo 01-04 la identificación debe calzar con el tipo; 'EXT' (pasaporte) se acepta pero el
 * comprobante sale como Tiquete sin <Receptor>. Devuelve el error o el tercero normalizado.
 */
export function validarTercero(d: any): { error: string } | { tercero: TerceroNormalizado } {
  const tipo = String(d?.tipoIdentificacion ?? "").trim();
  if (!["01", "02", "03", "04", "EXT"].includes(tipo)) return { error: "Tipo de identificación del tercero inválido." };
  const numeroCrudo = String(d?.numero ?? d?.identificacion ?? "").trim();
  let numero: string;
  if (tipo === "EXT") {
    if (!/^[A-Za-z0-9-]{0,20}$/.test(numeroCrudo)) return { error: "El pasaporte o identificación extranjera solo lleva letras, números y guiones (máximo 20)." };
    numero = numeroCrudo.toUpperCase();
  } else {
    if (!identificacionReceptorValida(tipo, numeroCrudo)) return { error: "La identificación del tercero no calza con su tipo (física 9 dígitos, jurídica 10, DIMEX 11-12, NITE 10)." };
    numero = limpiarIdentificacion(numeroCrudo);
  }
  const nombre = String(d?.nombre ?? "").trim();
  if (nombre.length < 3 || nombre.length > 100) return { error: "El nombre o razón social del tercero debe tener entre 3 y 100 caracteres." };
  const correo = String(d?.correo ?? "").trim();
  if (correo && (!CORREO_RE.test(correo) || correo.length > 160)) return { error: "El correo del tercero no es válido." };
  const telefono = String(d?.telefono ?? "").replace(/[\s-]/g, "");
  if (telefono && !/^\+?\d{8,20}$/.test(telefono)) return { error: "El teléfono del tercero debe tener entre 8 y 20 dígitos." };
  const actividad = String(d?.codigoActividad ?? "").trim();
  if (actividad && !/^\d{6}$/.test(actividad)) return { error: "El código de actividad del receptor debe tener 6 dígitos." };
  return { tercero: { tipoIdentificacion: tipo, numero, nombre, correo: correo || null, telefono: telefono || null, codigoActividad: actividad || null } };
}
