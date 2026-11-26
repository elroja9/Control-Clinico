// Generador de XML "Factura Electrónica"/"Tiquete Electrónico"/"Nota de Crédito"/"Nota de Débito"
// v4.4 de Hacienda Costa Rica.
//
// Estructura, catálogos y nombres de campo verificados textualmente contra el documento oficial
// "ANEXOS Y ESTRUCTURAS_V4.4.pdf" (descargado de https://www.hacienda.go.cr/docs/ANEXOS_Y_ESTRUCTURAS_V4.4.pdf,
// 99 páginas) y la resolución MH-DGT-RES-0027-2024 / MH-DGT-RES-0001-2025 (v4.4 obligatoria
// desde el 1 de setiembre de 2025) — incluye el catálogo completo "Código de Tarifa de IVA"
// (Nota 8.1), "Condiciones de la Venta" (Nota 5), "Medios de Pago" (Nota 6), "Código de
// Referencia" (Nota 9), y la estructura completa de ResumenFactura/InformacionReferencia. Lo
// único que sigue sin confirmarse contra un envío real es la aceptación efectiva por parte de
// Hacienda (ver comentario en server/haciendaApi.ts) — probar en SANDBOX antes de producción.
//
// Import exclusivo del servidor.

import { randomInt } from "node:crypto";
import { fechaHoraCR } from "../src/utils/fechaCR";

export interface EmisorFactura {
  nombre: string;
  nombreComercial: string;
  tipoIdentificacion: string; // '01'..'04'
  identificacion: string; // solo dígitos
  correoElectronico: string;
  provincia: string;
  canton: string;
  distrito: string;
  otrasSenas: string;
  codigoActividad: string; // 6 dígitos
}

export interface ReceptorFactura {
  nombre: string;
  tipoIdentificacion: string;
  identificacion: string; // solo dígitos
  correoElectronico?: string;
  /** CodigoActividadReceptor (6 dígitos), opcional: va en la raíz del comprobante, no en <Receptor>. */
  codigoActividad?: string;
}

export interface LineaFacturaInput {
  codigoCabys: string; // 13 dígitos
  detalle: string;
  unidadMedida: string; // 'Sp' | 'Spe' | 'St' | 'Unid'...
  cantidad: number;
  precioUnitario: number;
  porcentajeIva: number; // ej: 13, 4, 2, 1, 0
  /** Descuento de la línea en colones (0 o ausente = sin descuento). No puede superar MontoTotal. */
  montoDescuento?: number;
  /** Catálogo "Código del descuento" de v4.4 (se guarda en hacienda_catalogos). */
  codigoDescuento?: string | null;
  /** Texto obligatorio cuando el código de descuento es "99" (otros). */
  naturalezaDescuento?: string | null;
}

export interface LineaFacturaCalculada extends LineaFacturaInput {
  numeroLinea: number;
  codigoTarifaIva: string;
  montoTotal: number;
  montoDescuento: number;
  subTotal: number;
  baseImponible: number;
  montoIva: number;
  impuestoNeto: number;
  montoTotalLinea: number;
}

/**
 * Catálogo "Código de Tarifa de IVA" (Nota 8.1, verificado textualmente contra
 * ANEXOS_Y_ESTRUCTURAS_V4.4.pdf, página 71 de 99, sección "Notas sobre el Anexo 1"):
 *   01 Tarifa 0% (Artículo 32, num 1, RLIVA) — SOLO transacciones específicas con derecho a
 *      crédito pleno (ventas a la CCSS, municipalidades, etc.), NO un "0% genérico".
 *   02 Tarifa reducida 1%      03 Tarifa reducida 2%      04 Tarifa reducida 4%
 *   05/06/07 Transitorio 0%/4%/8% — uso exclusivo en Notas de Crédito/Débito, no aplica aquí.
 *   08 Tarifa general 13%      09 Tarifa reducida 0.5%
 *   10 Tarifa Exenta (Ley 9635, Art. 8)
 *   11 Tarifa 0% sin derecho a crédito (no sujeto)
 *
 * Corrección importante: la versión anterior de esta función mapeaba TODO porcentaje 0% al
 * código "01", que en realidad es una categoría legal angosta (ventas a CCSS/municipalidades).
 * Los servicios de salud exentos de esta clínica (Art. 9 Ley IVA) corresponden al código "10"
 * (Tarifa Exenta), no al "01" — se corrige el valor por defecto de 0% a "10" porque es el caso
 * real de este negocio; si alguna vez se factura una venta que sí califica bajo el artículo 32
 * num. 1 RLIVA, debe codificarse aparte (no hay forma de distinguirlo hoy solo con el %).
 */
function mapearCodigoTarifaIva(porcentajeIva: number): string {
  if (porcentajeIva >= 12.5) return "08"; // 13% general
  if (porcentajeIva >= 3.5) return "04"; // 4%
  if (porcentajeIva >= 1.5) return "03"; // 2%
  if (porcentajeIva >= 0.75) return "02"; // 1%
  if (porcentajeIva >= 0.25) return "09"; // 0.5%
  return "10"; // 0% → Exenta (ver comentario arriba)
}

/** CABYS: los códigos que inician en 0-4 son mercancías; 5-9 son servicios (Nota, página 50-52
 * de ANEXOS_Y_ESTRUCTURAS_V4.4.pdf) — el desglose de ResumenFactura exige reportar cada total
 * en el bucket correcto (TotalServ* vs TotalMercancias*), no alcanza con TotalGravado/Exento. */
export function esMercanciaPorCabys(codigoCabys: string): boolean {
  return /^[0-4]/.test(codigoCabys);
}

// mysql2 devuelve columnas DECIMAL como strings, no numbers (mismo patrón documentado en
// server.ts) — precioUnitario/porcentajeIva llegan aquí tal cual vienen de la fila de la BD.
// Number(valor) al inicio evita que "+" haga concatenación de strings en vez de suma.
export function redondear(valor: number, decimales: number): number {
  const factor = Math.pow(10, decimales);
  return Math.round((Number(valor) + Number.EPSILON) * factor) / factor;
}

function fmtDinero(valor: number): string {
  return redondear(valor, 5).toFixed(5);
}

function fmtCantidad(valor: number): string {
  return redondear(valor, 3).toFixed(3);
}

function fmtTarifa(valor: number): string {
  return redondear(valor, 2).toFixed(2);
}

/**
 * Montos de cada línea, todos redondeados a 5 decimales ANTES de usarse en el siguiente cálculo
 * (Hacienda recalcula con los valores impresos en el XML, no con los internos):
 *   MontoTotal = Cantidad × PrecioUnitario (bruto)
 *   SubTotal = MontoTotal − MontoDescuento = BaseImponible
 *   Impuesto = SubTotal × tarifa;  ImpuestoNeto = Impuesto (no hay exoneraciones)
 *   MontoTotalLinea = SubTotal + ImpuestoNeto
 */
export function calcularLineas(lineas: LineaFacturaInput[]): LineaFacturaCalculada[] {
  return lineas.map((l, idx) => {
    const montoTotal = redondear(Number(l.cantidad) * Number(l.precioUnitario), 5);
    const descuentoPedido = Math.max(0, Number(l.montoDescuento) || 0);
    const montoDescuento = redondear(Math.min(descuentoPedido, montoTotal), 5);
    const subTotal = redondear(montoTotal - montoDescuento, 5);
    const baseImponible = subTotal;
    const montoIva = redondear(baseImponible * (Number(l.porcentajeIva) / 100), 5);
    const impuestoNeto = montoIva;
    const montoTotalLinea = redondear(subTotal + impuestoNeto, 5);
    return {
      ...l,
      numeroLinea: idx + 1,
      codigoTarifaIva: mapearCodigoTarifaIva(Number(l.porcentajeIva)),
      montoTotal,
      montoDescuento,
      subTotal,
      baseImponible,
      montoIva,
      impuestoNeto,
      montoTotalLinea
    };
  });
}

export interface DesgloseImpuestoCalculado {
  codigoTarifaIva: string;
  monto: number;
}

export interface ResumenCalculado {
  totalServGravados: number;
  totalServExentos: number;
  totalMercanciasGravadas: number;
  totalMercanciasExentas: number;
  totalGravado: number;
  totalExento: number;
  totalExonerado: number; // siempre 0: la app no modela exoneraciones (ver comentario abajo)
  totalNoSujeto: number; // siempre 0: no se emiten líneas con tarifa 01/11 (no sujeto)
  totalVenta: number;
  totalDescuentos: number;
  totalVentaNeta: number;
  totalImpuesto: number;
  totalImpAsumEmisorFabrica: number; // siempre 0: la app no asume impuestos por el emisor
  totalIVADevuelto: number; // siempre 0, ver comentario abajo
  totalOtrosCargos: number; // siempre 0: la app no emite <OtrosCargos>
  desgloseImpuesto: DesgloseImpuestoCalculado[];
  totalComprobante: number;
}

/**
 * Campos de ResumenFactura verificados en orden y condición contra
 * ANEXOS_Y_ESTRUCTURAS_V4.4.pdf, páginas 49-56 de 99 ("Resumen del comprobante").
 *
 * TotalServGravados/Exentos vs TotalMercanciasGravadas/Exentas: suma del MontoTotal (BRUTO, antes
 * de descuentos) de cada línea, clasificada como mercancía (CABYS 0-4) o servicio (CABYS 5-9),
 * cruzado con gravada (porcentajeIva > 0) vs exenta (código de tarifa 10). Así:
 *   TotalVenta = TotalGravado + TotalExento + TotalExonerado + TotalNoSujeto  (bruto)
 *   TotalDescuentos = Σ MontoDescuento
 *   TotalVentaNeta = TotalVenta − TotalDescuentos   (el POS calculaba esto mal)
 *   TotalImpuesto = Σ ImpuestoNeto de las líneas   (errores -54/-488 si no cuadra)
 *   TotalComprobante = TotalVentaNeta + TotalImpuesto + TotalOtrosCargos − TotalIVADevuelto
 *
 * TotalExonerado/TotalNoSujeto quedan en 0 porque esta app no modela exoneraciones ni ventas "no
 * sujetas" (tarifas 01/11 de la nota 8.1) — si nunca se emiten esas tarifas, estos campos son
 * legítimamente cero, no se omiten (varias validaciones de Hacienda asumen su presencia).
 *
 * TotalDesgloseImpuesto es un nodo NUEVO en v4.4: repite por cada tarifa de IVA usada en el
 * detalle el monto total cobrado. Se omite por completo si todas las líneas son exentas.
 *
 * TotalIVADevuelto es el beneficio de "IVA devuelto" para servicios de salud pagados con tarjeta
 * (obligatorio solo en ese caso específico, con una fórmula propia). Se deja en 0 deliberadamente:
 * dejar 0 es siempre válido (equivale a no reclamar el beneficio).
 */
export function calcularResumen(lineas: LineaFacturaCalculada[]): ResumenCalculado {
  const esGravada = (l: LineaFacturaCalculada) => l.codigoTarifaIva !== "10";
  const esServicio = (l: LineaFacturaCalculada) => !esMercanciaPorCabys(l.codigoCabys);

  const sumaMontoTotal = (pred: (l: LineaFacturaCalculada) => boolean) =>
    redondear(lineas.filter(pred).reduce((s, l) => s + Number(l.montoTotal), 0), 5);

  const totalServGravados = sumaMontoTotal(l => esServicio(l) && esGravada(l));
  const totalServExentos = sumaMontoTotal(l => esServicio(l) && !esGravada(l));
  const totalMercanciasGravadas = sumaMontoTotal(l => !esServicio(l) && esGravada(l));
  const totalMercanciasExentas = sumaMontoTotal(l => !esServicio(l) && !esGravada(l));
  const totalGravado = redondear(totalServGravados + totalMercanciasGravadas, 5);
  const totalExento = redondear(totalServExentos + totalMercanciasExentas, 5);
  const totalExonerado = 0;
  const totalNoSujeto = 0;

  const totalVenta = redondear(totalGravado + totalExento + totalExonerado + totalNoSujeto, 5);
  const totalDescuentos = redondear(lineas.reduce((s, l) => s + Number(l.montoDescuento || 0), 0), 5);
  const totalVentaNeta = redondear(totalVenta - totalDescuentos, 5);
  const totalImpuesto = redondear(lineas.reduce((s, l) => s + Number(l.impuestoNeto), 0), 5);
  const totalOtrosCargos = 0;
  const totalIVADevuelto = 0;

  const desglosePorTarifa = new Map<string, number>();
  for (const l of lineas.filter(esGravada)) {
    desglosePorTarifa.set(l.codigoTarifaIva, (desglosePorTarifa.get(l.codigoTarifaIva) || 0) + Number(l.montoIva));
  }
  const desgloseImpuesto = Array.from(desglosePorTarifa.entries()).map(([codigoTarifaIva, monto]) => ({
    codigoTarifaIva,
    monto: redondear(monto, 5)
  }));

  return {
    totalServGravados,
    totalServExentos,
    totalMercanciasGravadas,
    totalMercanciasExentas,
    totalGravado,
    totalExento,
    totalExonerado,
    totalNoSujeto,
    totalVenta,
    totalDescuentos,
    totalVentaNeta,
    totalImpuesto,
    totalImpAsumEmisorFabrica: 0,
    totalIVADevuelto,
    totalOtrosCargos,
    desgloseImpuesto,
    totalComprobante: redondear(totalVentaNeta + totalImpuesto + totalOtrosCargos - totalIVADevuelto, 5)
  };
}

/**
 * Código de actividad económica (6 dígitos) de un texto que puede traer una descripción, ej.
 * "869001 (Fisioterapia)". Devuelve null si no hay 6 dígitos: antes se rellenaba con ceros y se
 * enviaba "000000", que Hacienda rechaza — ahora se valida antes de emitir.
 */
export function codigoActividadValido(actividadEconomica: string | null | undefined): string | null {
  const m = String(actividadEconomica ?? "").match(/\d{6}/);
  return m ? m[0] : null;
}

/** Extrae los primeros 6 dígitos de un código de actividad económica (compatibilidad). */
export function limpiarCodigoActividad(actividadEconomica: string): string {
  const digitos = (String(actividadEconomica ?? "").match(/\d+/) || ["000000"])[0];
  return digitos.padEnd(6, "0").slice(0, 6);
}

export function limpiarIdentificacion(identificacion: string): string {
  return String(identificacion ?? "").replace(/\D/g, "");
}

/** Sucursal de 3 dígitos y terminal de 5 (parte del consecutivo). Devuelve el error o null. */
export function errorSucursalTerminal(sucursal: string, terminal: string): string | null {
  if (!/^\d{3}$/.test(String(sucursal ?? ""))) return "La sucursal debe tener exactamente 3 dígitos (ej. 001).";
  if (!/^\d{5}$/.test(String(terminal ?? ""))) return "La terminal debe tener exactamente 5 dígitos (ej. 00001).";
  if (Number(sucursal) === 0) return "La sucursal no puede ser 000.";
  if (Number(terminal) === 0) return "La terminal no puede ser 00000.";
  return null;
}

/**
 * Consecutivo (20 dígitos) = sucursal(3) + terminal(5) + tipoDocumento(2) + secuencial(10).
 * tipoDocumento "01" Factura, "02" Nota de Débito, "03" Nota de Crédito, "04" Tiquete.
 */
export function generarConsecutivo(secuencial: number, sucursal: string, terminal: string, tipoDocumento: string): string {
  if (!Number.isInteger(secuencial) || secuencial < 1 || secuencial > 9999999999) {
    throw new Error("El número consecutivo debe estar entre 1 y 9999999999.");
  }
  const error = errorSucursalTerminal(sucursal, terminal);
  if (error) throw new Error(error);
  if (!/^\d{2}$/.test(tipoDocumento)) throw new Error("Tipo de documento inválido.");
  return `${sucursal}${terminal}${tipoDocumento}${secuencial.toString().padStart(10, "0")}`;
}

export interface ConsecutivoDesglosado {
  sucursal: string;
  terminal: string;
  tipoDocumento: string;
  secuencial: number;
  /** Cédula del emisor (12 dígitos con ceros a la izquierda), solo si se pegó una clave completa. */
  cedulaEmisor12: string | null;
}

/**
 * Interpreta una clave numérica de 50 dígitos o un consecutivo de 20 (espacios y guiones se
 * ignoran). Sirve para subir la numeración de una empresa que viene de otro sistema. null si no
 * calza con ninguno de los dos formatos.
 */
export function desglosarClaveOConsecutivo(texto: string): ConsecutivoDesglosado | null {
  const digitos = String(texto ?? "").replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digitos)) return null;
  let consecutivo: string;
  let cedulaEmisor12: string | null = null;
  if (digitos.length === 50) {
    if (!digitos.startsWith("506")) return null;
    cedulaEmisor12 = digitos.slice(9, 21);
    consecutivo = digitos.slice(21, 41);
  } else if (digitos.length === 20) {
    consecutivo = digitos;
  } else {
    return null;
  }
  const secuencial = parseInt(consecutivo.slice(10), 10);
  if (!Number.isInteger(secuencial) || secuencial < 1) return null;
  return { sucursal: consecutivo.slice(0, 3), terminal: consecutivo.slice(3, 8), tipoDocumento: consecutivo.slice(8, 10), secuencial, cedulaEmisor12 };
}

/** Código de seguridad de 8 dígitos de la clave: aleatorio criptográfico (antes Math.random). */
export function codigoSeguridadClave(): string {
  return randomInt(0, 100_000_000).toString().padStart(8, "0");
}

/**
 * Clave numérica (50 dígitos) = país(3, "506") + día+mes+año(6, DDMMYY) + cédula emisor(12) +
 * consecutivo(20) + situación(1) + código de seguridad(8, aleatorio).
 *
 * El DDMMYY es el día en Costa Rica, el mismo de <FechaEmision> (ver fechaEmisionCR).
 */
export function generarClaveNumerica(cedulaEmisor: string, consecutivo: string, fecha: Date, situacion = "1"): string {
  const [yyyy, mm, dd] = fechaHoraCR(fecha).slice(0, 10).split("-");
  const yy = yyyy.slice(-2);
  const cedula12 = limpiarIdentificacion(cedulaEmisor).padStart(12, "0").slice(-12);
  return `506${dd}${mm}${yy}${cedula12}${consecutivo}${situacion}${codigoSeguridadClave()}`;
}

/** Costa Rica no observa horario de verano: UTC-06:00 todo el año (ver fechaHoraCR). */
export function fechaEmisionCR(fecha: Date): string {
  return fechaHoraCR(fecha);
}

const NAMESPACE_BASE = "https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4";
const NAMESPACE_FACTURA = `${NAMESPACE_BASE}/facturaElectronica`;
const NAMESPACE_TIQUETE = `${NAMESPACE_BASE}/tiqueteElectronico`;
const NAMESPACE_NOTA_CREDITO = `${NAMESPACE_BASE}/notaCreditoElectronica`;
const NAMESPACE_NOTA_DEBITO = `${NAMESPACE_BASE}/notaDebitoElectronica`;
const NAMESPACE_DS = "http://www.w3.org/2000/09/xmldsig#";

function escapeXml(valor: string): string {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Un medio de pago del comprobante (v4.4 admite varios <MedioPago>). */
export interface MedioPagoComprobante {
  tipo: string; // catálogo "Medios de pago" (hacienda_catalogos, tipo MEDIO_PAGO)
  monto: number;
  /** Texto de <MedioPagoOtros>, obligatorio con tipo "99". */
  otros?: string | null;
}

export interface DatosFacturaXml {
  clave: string;
  consecutivo: string;
  fechaEmision: Date;
  emisor: EmisorFactura;
  /** null/undefined = sin bloque <Receptor> (solo permitido en un Tiquete o en Notas sobre un tiquete). */
  receptor?: ReceptorFactura | null;
  condicionVenta: string; // '01' = contado
  /** Compatibilidad: un único medio de pago por el total (se usa si `mediosPago` no viene). */
  medioPago?: string;
  /** Medios de pago con su monto; la suma debe ser el TotalComprobante (ver validarMediosPago). */
  mediosPago?: MedioPagoComprobante[];
  /** Días de <PlazoCredito>, obligatorio con condicionVenta = '02'. */
  plazoCredito?: number | null;
  lineas: LineaFacturaCalculada[];
  resumen: ResumenCalculado;
  /** Máximo de caracteres de <Detalle> (parámetro del sistema); por defecto el del XSD (200). */
  detalleMax?: number;
}

/** <Detalle> del XSD v4.4: maxLength 200. */
export const DETALLE_MAX_XSD = 200;

/** Medios de pago que van al XML: los indicados o, si no hay, uno solo por el total. */
export function mediosPagoEfectivos(datos: Pick<DatosFacturaXml, "medioPago" | "mediosPago" | "condicionVenta">, totalComprobante: number): MedioPagoComprobante[] {
  if (datos.condicionVenta === "02") return [];
  if (datos.mediosPago && datos.mediosPago.length > 0) return datos.mediosPago;
  return [{ tipo: datos.medioPago || "01", monto: totalComprobante }];
}

/**
 * Valida los medios de pago contra el total del comprobante. Devuelve el mensaje de error o null.
 * `codigosValidos` sale del catálogo en BD; `tolerancia` (colones) y `maximo` (el XSD admite 4)
 * de parametros_sistema.
 */
export function validarMediosPago(medios: MedioPagoComprobante[], totalComprobante: number, opciones: { codigosValidos: string[]; tolerancia: number; maximo: number }): string | null {
  if (medios.length === 0) return "Indique al menos un medio de pago.";
  if (medios.length > opciones.maximo) return `Se admiten como máximo ${opciones.maximo} medios de pago por comprobante.`;
  for (const m of medios) {
    if (!opciones.codigosValidos.includes(m.tipo)) return `El medio de pago «${m.tipo}» no está en el catálogo de Hacienda.`;
    if (!Number.isFinite(m.monto) || m.monto <= 0) return "Cada medio de pago debe tener un monto mayor que cero.";
    if (m.tipo === "99" && !String(m.otros ?? "").trim()) return "El medio de pago «Otros» necesita una descripción.";
  }
  const suma = redondear(medios.reduce((s, m) => s + Number(m.monto), 0), 5);
  if (Math.abs(suma - redondear(totalComprobante, 5)) > opciones.tolerancia) {
    return `Los medios de pago suman ₡${suma.toFixed(2)} y el total del comprobante es ₡${redondear(totalComprobante, 2).toFixed(2)}.`;
  }
  return null;
}

/**
 * Ajusta el último medio de pago para que la suma sea exactamente el TotalComprobante (absorbe la
 * diferencia de redondeo ya aceptada por validarMediosPago). Hacienda compara la suma exacta.
 */
export function cuadrarMediosPago(medios: MedioPagoComprobante[], totalComprobante: number): MedioPagoComprobante[] {
  if (medios.length === 0) return medios;
  const copia = medios.map(m => ({ ...m, monto: redondear(m.monto, 5) }));
  const sinUltimo = copia.slice(0, -1).reduce((s, m) => s + m.monto, 0);
  copia[copia.length - 1].monto = redondear(totalComprobante - sinUltimo, 5);
  return copia;
}

/** Recorta un texto libre al largo del XSD sin partir una entidad XML (se escapa después). */
export function recortarDetalle(detalle: string, maximo = DETALLE_MAX_XSD): string {
  return Array.from(String(detalle ?? "").trim()).slice(0, maximo).join("");
}

type TipoRaiz = "FacturaElectronica" | "TiqueteElectronico" | "NotaCreditoElectronica" | "NotaDebitoElectronica";

/** Cuerpo común de los cuatro comprobantes (idéntico de <Clave> a </ResumenFactura>).
 *
 * Orden v4.4 en la raíz: Clave, ProveedorSistemas, CodigoActividadEmisor, CodigoActividadReceptor?,
 * NumeroConsecutivo, FechaEmision, Emisor, Receptor?, CondicionVenta, PlazoCredito?, DetalleServicio,
 * ResumenFactura.
 *
 * <MedioPago> (minOccurs=0 en el XSD v4.4) se omite en ventas a crédito: todavía no se ha pagado
 * nada. Mismo criterio que el POS, que factura a crédito así en producción. */
function construirCuerpoComprobante(datos: DatosFacturaXml, raiz: TipoRaiz): string {
  const { clave, consecutivo, fechaEmision, emisor, receptor, condicionVenta, plazoCredito, lineas, resumen } = datos;
  if (condicionVenta === "02" && !(Number.isInteger(plazoCredito) && (plazoCredito as number) > 0)) {
    throw new Error("Una venta a crédito necesita un plazo de crédito en días mayor que cero.");
  }
  if (raiz === "FacturaElectronica" && !receptor) {
    throw new Error("Una Factura Electrónica necesita un receptor identificado; sin identificación se emite un Tiquete Electrónico.");
  }
  if (receptor && !limpiarIdentificacion(receptor.identificacion)) {
    throw new Error("Si el comprobante lleva <Receptor>, su identificación es obligatoria.");
  }
  const detalleMax = datos.detalleMax ?? DETALLE_MAX_XSD;

  const lineasXml = lineas.map(l => {
    const descuento = l.montoDescuento > 0 ? `
      <Descuento>
        <MontoDescuento>${fmtDinero(l.montoDescuento)}</MontoDescuento>
        <CodigoDescuento>${escapeXml(l.codigoDescuento || "")}</CodigoDescuento>${l.codigoDescuento === "99" ? `
        <CodigoDescuentoOTRO>${escapeXml(recortarDetalle(l.naturalezaDescuento || "", 100))}</CodigoDescuentoOTRO>
        <NaturalezaDescuento>${escapeXml(recortarDetalle(l.naturalezaDescuento || "", 80))}</NaturalezaDescuento>` : ""}
      </Descuento>` : "";
    return `
    <LineaDetalle>
      <NumeroLinea>${l.numeroLinea}</NumeroLinea>
      <CodigoCABYS>${escapeXml(l.codigoCabys)}</CodigoCABYS>
      <Cantidad>${fmtCantidad(l.cantidad)}</Cantidad>
      <UnidadMedida>${escapeXml(l.unidadMedida)}</UnidadMedida>
      <Detalle>${escapeXml(recortarDetalle(l.detalle, detalleMax))}</Detalle>
      <PrecioUnitario>${fmtDinero(l.precioUnitario)}</PrecioUnitario>
      <MontoTotal>${fmtDinero(l.montoTotal)}</MontoTotal>${descuento}
      <SubTotal>${fmtDinero(l.subTotal)}</SubTotal>
      <BaseImponible>${fmtDinero(l.baseImponible)}</BaseImponible>
      <Impuesto>
        <Codigo>01</Codigo>
        <CodigoTarifaIVA>${l.codigoTarifaIva}</CodigoTarifaIVA>
        <Tarifa>${fmtTarifa(l.porcentajeIva)}</Tarifa>
        <Monto>${fmtDinero(l.montoIva)}</Monto>
      </Impuesto>
      <ImpuestoAsumidoEmisorFabrica>${fmtDinero(0)}</ImpuestoAsumidoEmisorFabrica>
      <ImpuestoNeto>${fmtDinero(l.impuestoNeto)}</ImpuestoNeto>
      <MontoTotalLinea>${fmtDinero(l.montoTotalLinea)}</MontoTotalLinea>
    </LineaDetalle>`;
  }).join("");

  const medios = mediosPagoEfectivos(datos, resumen.totalComprobante);
  const mediosXml = medios.map(m => `
    <MedioPago>
      <TipoMedioPago>${escapeXml(m.tipo)}</TipoMedioPago>${m.tipo === "99" ? `
      <MedioPagoOtros>${escapeXml(recortarDetalle(m.otros || "", 100))}</MedioPagoOtros>` : ""}
      <TotalMedioPago>${fmtDinero(m.monto)}</TotalMedioPago>
    </MedioPago>`).join("");

  const actividadReceptor = receptor?.codigoActividad && /^\d{6}$/.test(receptor.codigoActividad)
    ? `\n  <CodigoActividadReceptor>${receptor.codigoActividad}</CodigoActividadReceptor>`
    : "";

  const receptorXml = receptor ? `
  <Receptor>
    <Nombre>${escapeXml(recortarDetalle(receptor.nombre, 100))}</Nombre>
    <Identificacion>
      <Tipo>${escapeXml(receptor.tipoIdentificacion)}</Tipo>
      <Numero>${limpiarIdentificacion(receptor.identificacion)}</Numero>
    </Identificacion>
    ${receptor.correoElectronico ? `<CorreoElectronico>${escapeXml(receptor.correoElectronico)}</CorreoElectronico>` : ""}
  </Receptor>` : "";

  return `  <Clave>${clave}</Clave>
  <ProveedorSistemas>${escapeXml(limpiarIdentificacion(emisor.identificacion).slice(0, 20))}</ProveedorSistemas>
  <CodigoActividadEmisor>${emisor.codigoActividad}</CodigoActividadEmisor>${actividadReceptor}
  <NumeroConsecutivo>${consecutivo}</NumeroConsecutivo>
  <FechaEmision>${fechaEmisionCR(fechaEmision)}</FechaEmision>
  <Emisor>
    <Nombre>${escapeXml(emisor.nombre)}</Nombre>
    <Identificacion>
      <Tipo>${emisor.tipoIdentificacion}</Tipo>
      <Numero>${limpiarIdentificacion(emisor.identificacion)}</Numero>
    </Identificacion>
    ${emisor.nombreComercial ? `<NombreComercial>${escapeXml(emisor.nombreComercial)}</NombreComercial>` : ""}
    <Ubicacion>
      <Provincia>${emisor.provincia}</Provincia>
      <Canton>${emisor.canton}</Canton>
      <Distrito>${emisor.distrito}</Distrito>
      <OtrasSenas>${escapeXml(emisor.otrasSenas)}</OtrasSenas>
    </Ubicacion>
    <CorreoElectronico>${escapeXml(emisor.correoElectronico)}</CorreoElectronico>
  </Emisor>${receptorXml}
  <CondicionVenta>${escapeXml(condicionVenta)}</CondicionVenta>
  ${condicionVenta === "02" ? `<PlazoCredito>${plazoCredito}</PlazoCredito>\n  ` : ""}<DetalleServicio>${lineasXml}
  </DetalleServicio>
  <ResumenFactura>
    <CodigoTipoMoneda>
      <CodigoMoneda>CRC</CodigoMoneda>
      <TipoCambio>${fmtDinero(1)}</TipoCambio>
    </CodigoTipoMoneda>
    <TotalServGravados>${fmtDinero(resumen.totalServGravados)}</TotalServGravados>
    <TotalServExentos>${fmtDinero(resumen.totalServExentos)}</TotalServExentos>
    <TotalServExonerado>${fmtDinero(0)}</TotalServExonerado>
    <TotalServNoSujeto>${fmtDinero(0)}</TotalServNoSujeto>
    <TotalMercanciasGravadas>${fmtDinero(resumen.totalMercanciasGravadas)}</TotalMercanciasGravadas>
    <TotalMercanciasExentas>${fmtDinero(resumen.totalMercanciasExentas)}</TotalMercanciasExentas>
    <TotalMercExonerada>${fmtDinero(0)}</TotalMercExonerada>
    <TotalMercNoSujeta>${fmtDinero(0)}</TotalMercNoSujeta>
    <TotalGravado>${fmtDinero(resumen.totalGravado)}</TotalGravado>
    <TotalExento>${fmtDinero(resumen.totalExento)}</TotalExento>
    <TotalExonerado>${fmtDinero(resumen.totalExonerado)}</TotalExonerado>
    <TotalNoSujeto>${fmtDinero(resumen.totalNoSujeto)}</TotalNoSujeto>
    <TotalVenta>${fmtDinero(resumen.totalVenta)}</TotalVenta>
    <TotalDescuentos>${fmtDinero(resumen.totalDescuentos)}</TotalDescuentos>
    <TotalVentaNeta>${fmtDinero(resumen.totalVentaNeta)}</TotalVentaNeta>${resumen.desgloseImpuesto.length > 0 ? `
    ${resumen.desgloseImpuesto.map(d => `<TotalDesgloseImpuesto>
      <Codigo>01</Codigo>
      <CodigoTarifaIVA>${d.codigoTarifaIva}</CodigoTarifaIVA>
      <TotalMontoImpuesto>${fmtDinero(d.monto)}</TotalMontoImpuesto>
    </TotalDesgloseImpuesto>`).join("\n    ")}` : ""}
    <TotalImpuesto>${fmtDinero(resumen.totalImpuesto)}</TotalImpuesto>
    <TotalImpAsumEmisorFabrica>${fmtDinero(resumen.totalImpAsumEmisorFabrica)}</TotalImpAsumEmisorFabrica>
    <TotalIVADevuelto>${fmtDinero(resumen.totalIVADevuelto)}</TotalIVADevuelto>${mediosXml}
    <TotalComprobante>${fmtDinero(resumen.totalComprobante)}</TotalComprobante>
  </ResumenFactura>`;
}

/** Construye el XML sin firmar de una Factura Electrónica v4.4 (receptor obligatorio). */
export function construirXmlFactura(datos: DatosFacturaXml): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<FacturaElectronica xmlns="${NAMESPACE_FACTURA}" xmlns:ds="${NAMESPACE_DS}">
${construirCuerpoComprobante(datos, "FacturaElectronica")}
</FacturaElectronica>`;
}

/**
 * Construye el XML sin firmar de un Tiquete Electrónico v4.4 (tipo de documento 04): venta a un
 * consumidor final sin identificación costarricense válida (extranjero con pasaporte, cliente que
 * no da su cédula). Si no hay identificación válida se omite <Receptor> COMPLETO: si el bloque va,
 * Hacienda exige <Identificacion> (lección del POS).
 */
export function construirXmlTiquete(datos: DatosFacturaXml): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<TiqueteElectronico xmlns="${NAMESPACE_TIQUETE}" xmlns:ds="${NAMESPACE_DS}">
${construirCuerpoComprobante(datos, "TiqueteElectronico")}
</TiqueteElectronico>`;
}

export interface InformacionReferenciaFactura {
  tipoDocumento: string; // TipoDocIR: '01' Factura Electrónica, '04' Tiquete Electrónico, ...
  numero: string; // clave de 50 dígitos del documento que se referencia
  // Fecha de emisión del documento referenciado. Lo normal es pasar el <FechaEmision> tal cual se
  // guardó (string): así coincide al carácter con el que lleva ese comprobante.
  fechaEmision: string | Date;
  codigo: string; // catálogo "Código de referencia" — '01' = Anula documento de referencia
  razon: string; // texto libre explicando el motivo
}

export interface DatosNotaCreditoXml extends DatosFacturaXml {
  referencia: InformacionReferenciaFactura;
}

// <Razon> admite como máximo 180 caracteres en el XSD v4.4 (maxLength="180").
export const RAZON_MAX = 180;

/** Bloque <InformacionReferencia> v4.4 (<TipoDocIR>/<FechaEmisionIR>, no los nombres de v4.3). */
function construirInformacionReferencia(referencia: InformacionReferenciaFactura): string {
  return `  <InformacionReferencia>
    <TipoDocIR>${escapeXml(referencia.tipoDocumento)}</TipoDocIR>
    <Numero>${escapeXml(referencia.numero)}</Numero>
    <FechaEmisionIR>${typeof referencia.fechaEmision === "string" ? escapeXml(referencia.fechaEmision) : fechaEmisionCR(referencia.fechaEmision)}</FechaEmisionIR>
    <Codigo>${escapeXml(referencia.codigo)}</Codigo>
    <Razon>${escapeXml(Array.from(referencia.razon).slice(0, RAZON_MAX).join(""))}</Razon>
  </InformacionReferencia>`;
}

/** Nota de Crédito Electrónica v4.4 (anulación '01' o corrección de monto '02'). */
export function construirXmlNotaCredito(datos: DatosNotaCreditoXml): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<NotaCreditoElectronica xmlns="${NAMESPACE_NOTA_CREDITO}" xmlns:ds="${NAMESPACE_DS}">
${construirCuerpoComprobante(datos, "NotaCreditoElectronica")}
${construirInformacionReferencia(datos.referencia)}
</NotaCreditoElectronica>`;
}

export interface DatosNotaDebitoXml extends DatosFacturaXml {
  referencia: InformacionReferenciaFactura;
}

/** Nota de Débito Electrónica v4.4 (cargo adicional, código de referencia '02'). */
export function construirXmlNotaDebito(datos: DatosNotaDebitoXml): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<NotaDebitoElectronica xmlns="${NAMESPACE_NOTA_DEBITO}" xmlns:ds="${NAMESPACE_DS}">
${construirCuerpoComprobante(datos, "NotaDebitoElectronica")}
${construirInformacionReferencia(datos.referencia)}
</NotaDebitoElectronica>`;
}

/** Despacha al constructor según el tipo de documento ('01', '02', '03', '04'). */
export function construirXmlComprobante(tipoDocumento: string, datos: DatosFacturaXml & { referencia?: InformacionReferenciaFactura }): string {
  if (tipoDocumento === "01") return construirXmlFactura(datos);
  if (tipoDocumento === "04") return construirXmlTiquete(datos);
  if (!datos.referencia) throw new Error("Una nota necesita la información de referencia.");
  if (tipoDocumento === "03") return construirXmlNotaCredito(datos as DatosNotaCreditoXml);
  if (tipoDocumento === "02") return construirXmlNotaDebito(datos as DatosNotaDebitoXml);
  throw new Error(`Tipo de documento no soportado: ${tipoDocumento}`);
}

function desescaparXml(valor: string): string {
  return valor.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/**
 * Receptor tal como quedó en un comprobante YA FIRMADO (para Notas sobre comprobantes anteriores a
 * la copia del receptor: la Nota debe ir al mismo receptor que el original, aunque los datos del
 * paciente hayan cambiado). `encontrado` = el XML se pudo leer; `receptor` = null si no llevaba
 * bloque <Receptor> (un tiquete sin identificación).
 */
export function receptorDesdeXml(xml: string | null | undefined): { encontrado: boolean; receptor: ReceptorFactura | null } {
  const texto = String(xml ?? "");
  if (!/<(?:\w+:)?NumeroConsecutivo>/.test(texto)) return { encontrado: false, receptor: null };
  const bloque = texto.match(/<(?:\w+:)?Receptor>([\s\S]*?)<\/(?:\w+:)?Receptor>/);
  if (!bloque) return { encontrado: true, receptor: null };
  const campo = (fuente: string, etiqueta: string) => {
    const m = fuente.match(new RegExp(`<(?:\\w+:)?${etiqueta}>([\\s\\S]*?)</(?:\\w+:)?${etiqueta}>`));
    return m ? desescaparXml(m[1].trim()) : "";
  };
  const identificacion = (bloque[1].match(/<(?:\w+:)?Identificacion>([\s\S]*?)<\/(?:\w+:)?Identificacion>/) || [])[1] || "";
  const tipo = campo(identificacion, "Tipo");
  const numero = campo(identificacion, "Numero");
  if (!tipo || !numero) return { encontrado: true, receptor: null };
  const actividad = campo(texto, "CodigoActividadReceptor");
  return {
    encontrado: true,
    receptor: {
      nombre: campo(bloque[1], "Nombre"),
      tipoIdentificacion: tipo,
      identificacion: numero,
      correoElectronico: campo(bloque[1], "CorreoElectronico") || undefined,
      codigoActividad: /^\d{6}$/.test(actividad) ? actividad : undefined
    }
  };
}
