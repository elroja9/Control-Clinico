// Generador de XML "Factura Electrónica"/"Nota de Crédito"/"Nota de Débito" v4.4 de Hacienda
// Costa Rica.
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

import { fechaHoraCR } from "../src/utils/fechaCR";

/** Plazo de crédito (en días) usado tanto en el nodo <PlazoCredito> del XML como al calcular el
 * vencimiento de la Cuenta por Cobrar (server.ts) cuando condicionVenta = '02' — una sola fuente
 * de verdad para que ambos nunca queden desincronizados. */
export const PLAZO_CREDITO_DIAS_DEFECTO = 30;

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
}

export interface LineaFacturaInput {
  codigoCabys: string; // 13 dígitos
  detalle: string;
  unidadMedida: string; // 'Sp' | 'Spe' | 'St'
  cantidad: number;
  precioUnitario: number;
  porcentajeIva: number; // ej: 13, 4, 2, 1, 0
}

export interface LineaFacturaCalculada extends LineaFacturaInput {
  numeroLinea: number;
  codigoTarifaIva: string;
  montoTotal: number;
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
function esMercanciaPorCabys(codigoCabys: string): boolean {
  return /^[0-4]/.test(codigoCabys);
}

// mysql2 devuelve columnas DECIMAL como strings, no numbers (mismo patrón documentado en
// server.ts) — precioUnitario/porcentajeIva llegan aquí tal cual vienen de la fila de la BD.
// Number(valor) al inicio evita que "+" haga concatenación de strings en vez de suma.
function redondear(valor: number, decimales: number): number {
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

export function calcularLineas(lineas: LineaFacturaInput[]): LineaFacturaCalculada[] {
  return lineas.map((l, idx) => {
    const montoTotal = redondear(l.cantidad * l.precioUnitario, 5);
    const subTotal = montoTotal; // sin descuentos
    const baseImponible = subTotal;
    const montoIva = redondear(baseImponible * (l.porcentajeIva / 100), 5);
    const impuestoNeto = montoIva;
    const montoTotalLinea = redondear(subTotal + impuestoNeto, 5);
    return {
      ...l,
      numeroLinea: idx + 1,
      codigoTarifaIva: mapearCodigoTarifaIva(l.porcentajeIva),
      montoTotal,
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
  totalVentaNeta: number;
  totalImpuesto: number;
  totalImpAsumEmisorFabrica: number; // siempre 0: la app no asume impuestos por el emisor
  totalIVADevuelto: number; // siempre 0, ver comentario abajo
  desgloseImpuesto: DesgloseImpuestoCalculado[];
  totalComprobante: number;
}

/**
 * Campos de ResumenFactura verificados en orden y condición contra
 * ANEXOS_Y_ESTRUCTURAS_V4.4.pdf, páginas 49-56 de 99 ("Resumen del comprobante").
 *
 * TotalServGravados/Exentos vs TotalMercanciasGravadas/Exentas: el desglose por CABYS es
 * obligatorio ("se rechazará el comprobante" si no cuadra) — no basta con TotalGravado/Exento
 * agregados. Se clasifica cada línea como mercancía (CABYS 0-4) o servicio (CABYS 5-9), cruzado
 * con gravada (porcentajeIva > 0) vs exenta (código de tarifa 10) — ver esMercanciaPorCabys.
 *
 * TotalExonerado/TotalNoSujeto quedan en 0 porque esta app no modela exoneraciones ni ventas "no
 * sujetas" (tarifas 01/11 de la nota 8.1) — si nunca se emiten esas tarifas, estos campos son
 * legítimamente cero, no se omiten (varias validaciones de Hacienda asumen su presencia).
 *
 * TotalDesgloseImpuesto es un nodo NUEVO en v4.4 (no existía en esta implementación): repite por
 * cada tarifa de IVA usada en el detalle el monto total cobrado. Es obligatorio cuando hay líneas
 * gravadas — se omite el nodo por completo si todas las líneas son exentas (nada que desglosar).
 *
 * TotalIVADevuelto es el beneficio de "IVA devuelto" para servicios de salud pagados con tarjeta
 * (obligatorio solo en ese caso específico, con una fórmula propia). Se deja en 0 deliberadamente:
 * activarlo requiere que el negocio decida acogerse al programa y confirmar qué CABYS califican
 * como "servicio de salud" — dejar 0 es siempre válido (equivale a no reclamar el beneficio), a
 * diferencia de calcularlo mal, que sí generaría un comprobante fiscalmente incorrecto.
 */
export function calcularResumen(lineas: LineaFacturaCalculada[]): ResumenCalculado {
  const esGravada = (l: LineaFacturaCalculada) => l.codigoTarifaIva !== "10";
  const esServicio = (l: LineaFacturaCalculada) => !esMercanciaPorCabys(l.codigoCabys);

  const sumaSubtotal = (pred: (l: LineaFacturaCalculada) => boolean) =>
    redondear(lineas.filter(pred).reduce((s, l) => s + l.subTotal, 0), 5);

  const totalServGravados = sumaSubtotal(l => esServicio(l) && esGravada(l));
  const totalServExentos = sumaSubtotal(l => esServicio(l) && !esGravada(l));
  const totalMercanciasGravadas = sumaSubtotal(l => !esServicio(l) && esGravada(l));
  const totalMercanciasExentas = sumaSubtotal(l => !esServicio(l) && !esGravada(l));

  const totalVenta = redondear(lineas.reduce((s, l) => s + l.subTotal, 0), 5);
  const totalImpuesto = redondear(lineas.reduce((s, l) => s + l.montoIva, 0), 5);

  const desglosePorTarifa = new Map<string, number>();
  for (const l of lineas.filter(esGravada)) {
    desglosePorTarifa.set(l.codigoTarifaIva, (desglosePorTarifa.get(l.codigoTarifaIva) || 0) + l.montoIva);
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
    totalGravado: redondear(totalServGravados + totalMercanciasGravadas, 5),
    totalExento: redondear(totalServExentos + totalMercanciasExentas, 5),
    totalExonerado: 0,
    totalNoSujeto: 0,
    totalVenta,
    totalVentaNeta: totalVenta,
    totalImpuesto,
    totalImpAsumEmisorFabrica: 0,
    totalIVADevuelto: 0,
    desgloseImpuesto,
    totalComprobante: redondear(totalVenta + totalImpuesto, 5)
  };
}

/** Extrae los primeros 6 dígitos de un código de actividad económica (el campo hoy también guarda una descripción entre paréntesis, ej. "869001 (Fisioterapia)"). */
export function limpiarCodigoActividad(actividadEconomica: string): string {
  const digitos = (actividadEconomica.match(/\d+/) || ["000000"])[0];
  return digitos.padEnd(6, "0").slice(0, 6);
}

export function limpiarIdentificacion(identificacion: string): string {
  return identificacion.replace(/\D/g, "");
}

/**
 * Consecutivo (20 dígitos) = sucursal(3) + terminal(5) + tipoDocumento(2) + secuencial(10).
 * tipoDocumento "01" = Factura Electrónica.
 */
export function generarConsecutivo(secuencial: number, sucursal = "001", terminal = "00001", tipoDocumento = "01"): string {
  return `${sucursal.padStart(3, "0")}${terminal.padStart(5, "0")}${tipoDocumento}${secuencial.toString().padStart(10, "0")}`;
}

/**
 * Clave numérica (50 dígitos) = país(3, "506") + día+mes+año(6, DDMMYY) + cédula emisor(12) +
 * consecutivo(20) + situación(1) + código de seguridad(8, aleatorio).
 * Orden verificado contra el texto de la resolución oficial (el bloque de fecha va justo
 * después del código de país, antes de la cédula).
 *
 * El DDMMYY es el día en Costa Rica, el mismo de <FechaEmision> (ver fechaEmisionCR). Antes salía
 * de la hora local del servidor mientras <FechaEmision> salía de UTC: de 6 p.m. a medianoche la
 * clave y la fecha del comprobante quedaban en días distintos.
 */
export function generarClaveNumerica(cedulaEmisor: string, consecutivo: string, fecha: Date, situacion = "1"): string {
  const [yyyy, mm, dd] = fechaHoraCR(fecha).slice(0, 10).split("-");
  const yy = yyyy.slice(-2);
  const cedula12 = limpiarIdentificacion(cedulaEmisor).padStart(12, "0").slice(-12);
  const codigoSeguridad = Math.floor(Math.random() * 1e8).toString().padStart(8, "0");
  return `506${dd}${mm}${yy}${cedula12}${consecutivo}${situacion}${codigoSeguridad}`;
}

/** Costa Rica no observa horario de verano: UTC-06:00 todo el año.
 *
 * Antes tomaba la hora UTC y le pegaba "-06:00" sin restarle las 6 horas, así que toda
 * <FechaEmision> salía 6 horas en el futuro. Hacienda rechaza eso con el error -53 ("la hora
 * indicada en la emisión del archivo XML no coincide con la hora oficial", visto en producción en
 * el POS), y el D-104 metía en el mes siguiente lo facturado después de las 6 p.m. del último día. */
export function fechaEmisionCR(fecha: Date): string {
  return fechaHoraCR(fecha);
}

const NAMESPACE_FACTURA = "https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/facturaElectronica";
const NAMESPACE_DS = "http://www.w3.org/2000/09/xmldsig#";

function escapeXml(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface DatosFacturaXml {
  clave: string;
  consecutivo: string;
  fechaEmision: Date;
  emisor: EmisorFactura;
  receptor: ReceptorFactura;
  condicionVenta: string; // '01' = contado
  medioPago: string; // '01' = efectivo, '02' = tarjeta, etc.
  lineas: LineaFacturaCalculada[];
  resumen: ResumenCalculado;
}

/** Cuerpo común a Factura Electrónica y Nota de Crédito Electrónica (idéntico de <Clave> a
 * </ResumenFactura> — solo cambia la etiqueta raíz y, en la Nota de Crédito, el bloque
 * <InformacionReferencia> que se agrega después). Evita duplicar esta plantilla dos veces.
 *
 * <MedioPago> (minOccurs=0 en el XSD v4.4) se omite en ventas a crédito: todavía no se ha pagado
 * nada, así que declarar "01 Efectivo" por el total sería falso. Mismo criterio que el POS, que
 * factura a crédito así en producción. */
function construirCuerpoComprobante(datos: DatosFacturaXml): string {
  const { clave, consecutivo, fechaEmision, emisor, receptor, condicionVenta, medioPago, lineas, resumen } = datos;

  const lineasXml = lineas.map(l => `
    <LineaDetalle>
      <NumeroLinea>${l.numeroLinea}</NumeroLinea>
      <CodigoCABYS>${escapeXml(l.codigoCabys)}</CodigoCABYS>
      <Cantidad>${fmtCantidad(l.cantidad)}</Cantidad>
      <UnidadMedida>${escapeXml(l.unidadMedida)}</UnidadMedida>
      <Detalle>${escapeXml(l.detalle)}</Detalle>
      <PrecioUnitario>${fmtDinero(l.precioUnitario)}</PrecioUnitario>
      <MontoTotal>${fmtDinero(l.montoTotal)}</MontoTotal>
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
    </LineaDetalle>`).join("");

  return `  <Clave>${clave}</Clave>
  <ProveedorSistemas>${escapeXml(limpiarIdentificacion(emisor.identificacion).slice(0, 20))}</ProveedorSistemas>
  <CodigoActividadEmisor>${emisor.codigoActividad}</CodigoActividadEmisor>
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
  </Emisor>
  <Receptor>
    <Nombre>${escapeXml(receptor.nombre)}</Nombre>
    <Identificacion>
      <Tipo>${receptor.tipoIdentificacion}</Tipo>
      <Numero>${limpiarIdentificacion(receptor.identificacion)}</Numero>
    </Identificacion>
    ${receptor.correoElectronico ? `<CorreoElectronico>${escapeXml(receptor.correoElectronico)}</CorreoElectronico>` : ""}
  </Receptor>
  <CondicionVenta>${escapeXml(condicionVenta)}</CondicionVenta>
  ${condicionVenta === "02" ? `<PlazoCredito>${PLAZO_CREDITO_DIAS_DEFECTO}</PlazoCredito>\n  ` : ""}<DetalleServicio>${lineasXml}
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
    <TotalDescuentos>${fmtDinero(0)}</TotalDescuentos>
    <TotalVentaNeta>${fmtDinero(resumen.totalVentaNeta)}</TotalVentaNeta>${resumen.desgloseImpuesto.length > 0 ? `
    ${resumen.desgloseImpuesto.map(d => `<TotalDesgloseImpuesto>
      <Codigo>01</Codigo>
      <CodigoTarifaIVA>${d.codigoTarifaIva}</CodigoTarifaIVA>
      <TotalMontoImpuesto>${fmtDinero(d.monto)}</TotalMontoImpuesto>
    </TotalDesgloseImpuesto>`).join("\n    ")}` : ""}
    <TotalImpuesto>${fmtDinero(resumen.totalImpuesto)}</TotalImpuesto>
    <TotalImpAsumEmisorFabrica>${fmtDinero(resumen.totalImpAsumEmisorFabrica)}</TotalImpAsumEmisorFabrica>
    <TotalIVADevuelto>${fmtDinero(resumen.totalIVADevuelto)}</TotalIVADevuelto>${condicionVenta === "02" ? "" : `
    <MedioPago>
      <TipoMedioPago>${escapeXml(medioPago)}</TipoMedioPago>
      <TotalMedioPago>${fmtDinero(resumen.totalComprobante)}</TotalMedioPago>
    </MedioPago>`}
    <TotalComprobante>${fmtDinero(resumen.totalComprobante)}</TotalComprobante>
  </ResumenFactura>`;
}

/** Construye el XML sin firmar de una Factura Electrónica v4.4. */
export function construirXmlFactura(datos: DatosFacturaXml): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<FacturaElectronica xmlns="${NAMESPACE_FACTURA}" xmlns:ds="${NAMESPACE_DS}">
${construirCuerpoComprobante(datos)}
</FacturaElectronica>`;
}

const NAMESPACE_NOTA_CREDITO = "https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/notaCreditoElectronica";

export interface InformacionReferenciaFactura {
  tipoDocumento: string; // catálogo "Tipo de documento de referencia" — '01' = Factura Electrónica
  numero: string; // clave de 50 dígitos del documento que se referencia
  // Fecha de emisión del documento referenciado. Lo normal es pasar el <FechaEmision> tal cual se
  // guardó (string): así coincide al carácter con el que lleva ese comprobante, aunque se haya
  // emitido con el formato viejo (ver fechaEmisionCR).
  fechaEmision: string | Date;
  codigo: string; // catálogo "Código de referencia" — '01' = Anula documento de referencia
  razon: string; // texto libre explicando el motivo
}

export interface DatosNotaCreditoXml extends DatosFacturaXml {
  referencia: InformacionReferenciaFactura;
}

/** Bloque <InformacionReferencia>, compartido por Nota de Crédito y Nota de Débito — verificado
 * textualmente contra ANEXOS_Y_ESTRUCTURAS_V4.4.pdf, páginas 57-58 de 99 ("Información de
 * referencia"). Corrección importante respecto a la versión anterior: v4.4 renombró dos campos
 * que en v4.3 se llamaban distinto (ver bitácora de cambios del propio PDF, ítem 126): el tipo de
 * documento referenciado es <TipoDocIR> (no <TipoDoc>) y su fecha es <FechaEmisionIR> (no
 * <FechaEmision>, que ya identifica la fecha del propio comprobante en la sección superior). Con
 * los nombres viejos, Hacienda habría rechazado toda Nota de Crédito/Débito emitida hasta ahora. */
// <Razon> admite como máximo 180 caracteres en el XSD v4.4 (maxLength="180"). Uno más largo hace
// rechazar la Nota por esquema — y cada reintento quema un consecutivo.
export const RAZON_MAX = 180;

function construirInformacionReferencia(referencia: InformacionReferenciaFactura): string {
  return `  <InformacionReferencia>
    <TipoDocIR>${referencia.tipoDocumento}</TipoDocIR>
    <Numero>${referencia.numero}</Numero>
    <FechaEmisionIR>${typeof referencia.fechaEmision === "string" ? escapeXml(referencia.fechaEmision) : fechaEmisionCR(referencia.fechaEmision)}</FechaEmisionIR>
    <Codigo>${referencia.codigo}</Codigo>
    <Razon>${escapeXml(referencia.razon.slice(0, RAZON_MAX))}</Razon>
  </InformacionReferencia>`;
}

/** Construye el XML sin firmar de una Nota de Crédito Electrónica v4.4 — anula una Factura
 * Electrónica ya emitida (referencia.codigo = '01', total) o corrige un monto (código '02',
 * parcial, ver server.ts POST /api/facturas/:id/nota-credito). */
export function construirXmlNotaCredito(datos: DatosNotaCreditoXml): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<NotaCreditoElectronica xmlns="${NAMESPACE_NOTA_CREDITO}" xmlns:ds="${NAMESPACE_DS}">
${construirCuerpoComprobante(datos)}
${construirInformacionReferencia(datos.referencia)}
</NotaCreditoElectronica>`;
}

const NAMESPACE_NOTA_DEBITO = "https://cdn.comprobanteselectronicos.go.cr/xml-schemas/v4.4/notaDebitoElectronica";

export interface DatosNotaDebitoXml extends DatosFacturaXml {
  referencia: InformacionReferenciaFactura;
}

/** Construye el XML sin firmar de una Nota de Débito Electrónica v4.4 — agrega un cargo adicional
 * (total o parcial) sobre una Factura Electrónica ya emitida (referencia.codigo = '02', "Corrige
 * monto"). Mismo cuerpo que Factura/Nota de Crédito, solo cambia la etiqueta raíz y el namespace
 * (ver Nota 2, página 64 de 99 de ANEXOS_Y_ESTRUCTURAS_V4.4.pdf). */
export function construirXmlNotaDebito(datos: DatosNotaDebitoXml): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<NotaDebitoElectronica xmlns="${NAMESPACE_NOTA_DEBITO}" xmlns:ds="${NAMESPACE_DS}">
${construirCuerpoComprobante(datos)}
${construirInformacionReferencia(datos.referencia)}
</NotaDebitoElectronica>`;
}
