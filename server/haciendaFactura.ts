// Generador de XML "Factura Electrónica" v4.4 de Hacienda Costa Rica.
//
// Estructura y catálogos verificados contra el XSD oficial
// (https://atv.hacienda.go.cr/ATV/ComprobanteElectronico/docs/esquemas/2024/v4.4/FacturaElectronica_V4.4.xsd)
// y la resolución MH-DGT-RES-0027-2024 / MH-DGT-RES-0001-2025 (v4.4 obligatoria desde el
// 1 de setiembre de 2025). Los códigos de CodigoTarifaIVA por debajo de 13% (00.5%, exenta,
// 0% sin derecho a crédito) NO se pudieron confirmar contra el XSD en esta sesión — antes de
// facturar con esas tarifas en producción, verificar el catálogo "Códigos de Tarifa de IVA" del
// PDF oficial "ANEXOS Y ESTRUCTURAS_V4.4.pdf".
//
// Import exclusivo del servidor.

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
 * Catálogo "Código de Tarifa de IVA". 01/02/03/04/08 confirmados contra fuentes cruzadas
 * (0%, 1%, 2%, 4%, 13% general). 09 (0.5%) y 10 (exenta) no confirmados contra el PDF oficial
 * en esta sesión — no se usan aquí salvo el caso 0% general, que usa "01".
 */
function mapearCodigoTarifaIva(porcentajeIva: number): string {
  if (porcentajeIva >= 12.5) return "08"; // 13% general
  if (porcentajeIva >= 3.5) return "04"; // 4%
  if (porcentajeIva >= 1.5) return "03"; // 2%
  if (porcentajeIva >= 0.5) return "02"; // 1%
  return "01"; // 0%
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

export interface ResumenCalculado {
  totalServGravados: number;
  totalServExentos: number;
  totalGravado: number;
  totalExento: number;
  totalVenta: number;
  totalVentaNeta: number;
  totalImpuesto: number;
  totalComprobante: number;
}

export function calcularResumen(lineas: LineaFacturaCalculada[]): ResumenCalculado {
  const gravadas = lineas.filter(l => l.porcentajeIva > 0);
  const exentas = lineas.filter(l => l.porcentajeIva === 0);
  const totalServGravados = redondear(gravadas.reduce((s, l) => s + l.subTotal, 0), 5);
  const totalServExentos = redondear(exentas.reduce((s, l) => s + l.subTotal, 0), 5);
  const totalVenta = redondear(lineas.reduce((s, l) => s + l.subTotal, 0), 5);
  const totalImpuesto = redondear(lineas.reduce((s, l) => s + l.montoIva, 0), 5);
  return {
    totalServGravados,
    totalServExentos,
    totalGravado: totalServGravados,
    totalExento: totalServExentos,
    totalVenta,
    totalVentaNeta: totalVenta,
    totalImpuesto,
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
 */
export function generarClaveNumerica(cedulaEmisor: string, consecutivo: string, fecha: Date, situacion = "1"): string {
  const dd = fecha.getDate().toString().padStart(2, "0");
  const mm = (fecha.getMonth() + 1).toString().padStart(2, "0");
  const yy = (fecha.getFullYear() % 100).toString().padStart(2, "0");
  const cedula12 = limpiarIdentificacion(cedulaEmisor).padStart(12, "0").slice(-12);
  const codigoSeguridad = Math.floor(Math.random() * 1e8).toString().padStart(8, "0");
  return `506${dd}${mm}${yy}${cedula12}${consecutivo}${situacion}${codigoSeguridad}`;
}

/** Costa Rica no observa horario de verano: UTC-06:00 todo el año. */
export function fechaEmisionCR(fecha: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${fecha.getUTCFullYear()}-${pad(fecha.getUTCMonth() + 1)}-${pad(fecha.getUTCDate())}T${pad(fecha.getUTCHours())}:${pad(fecha.getUTCMinutes())}:${pad(fecha.getUTCSeconds())}-06:00`;
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
 * <InformacionReferencia> que se agrega después). Evita duplicar esta plantilla dos veces. */
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
  <CondicionVenta>${condicionVenta}</CondicionVenta>
  <DetalleServicio>${lineasXml}
  </DetalleServicio>
  <ResumenFactura>
    <CodigoTipoMoneda>
      <CodigoMoneda>CRC</CodigoMoneda>
      <TipoCambio>${fmtDinero(1)}</TipoCambio>
    </CodigoTipoMoneda>
    <TotalServGravados>${fmtDinero(resumen.totalServGravados)}</TotalServGravados>
    <TotalServExentos>${fmtDinero(resumen.totalServExentos)}</TotalServExentos>
    <TotalGravado>${fmtDinero(resumen.totalGravado)}</TotalGravado>
    <TotalExento>${fmtDinero(resumen.totalExento)}</TotalExento>
    <TotalVenta>${fmtDinero(resumen.totalVenta)}</TotalVenta>
    <TotalDescuentos>${fmtDinero(0)}</TotalDescuentos>
    <TotalVentaNeta>${fmtDinero(resumen.totalVentaNeta)}</TotalVentaNeta>
    <TotalImpuesto>${fmtDinero(resumen.totalImpuesto)}</TotalImpuesto>
    <MedioPago>
      <TipoMedioPago>${medioPago}</TipoMedioPago>
      <TotalMedioPago>${fmtDinero(resumen.totalComprobante)}</TotalMedioPago>
    </MedioPago>
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
  fechaEmision: Date; // fecha de emisión del documento referenciado
  codigo: string; // catálogo "Código de referencia" — '01' = Anula documento de referencia
  razon: string; // texto libre explicando el motivo
}

export interface DatosNotaCreditoXml extends DatosFacturaXml {
  referencia: InformacionReferenciaFactura;
}

/**
 * Construye el XML sin firmar de una Nota de Crédito Electrónica v4.4 — usada aquí únicamente
 * para anular una Factura Electrónica ya emitida (referencia.codigo = '01').
 *
 * El orden y nombres de campos de <InformacionReferencia> (TipoDoc/Numero/FechaEmision/Codigo/
 * Razon, después de </ResumenFactura>) se armaron cruzando fuentes públicas — el sitio de
 * Hacienda bloqueó el acceso automatizado al XSD oficial en esta sesión, así que esto NO quedó
 * verificado contra el XSD como sí lo está el resto de este archivo (ver comentario al inicio).
 * Antes de usar en producción: generar una Nota de Crédito de prueba contra el ambiente SANDBOX
 * de Hacienda y confirmar que la acepte.
 */
export function construirXmlNotaCredito(datos: DatosNotaCreditoXml): string {
  const { referencia } = datos;
  return `<?xml version="1.0" encoding="UTF-8"?>
<NotaCreditoElectronica xmlns="${NAMESPACE_NOTA_CREDITO}" xmlns:ds="${NAMESPACE_DS}">
${construirCuerpoComprobante(datos)}
  <InformacionReferencia>
    <TipoDoc>${referencia.tipoDocumento}</TipoDoc>
    <Numero>${referencia.numero}</Numero>
    <FechaEmision>${fechaEmisionCR(referencia.fechaEmision)}</FechaEmision>
    <Codigo>${referencia.codigo}</Codigo>
    <Razon>${escapeXml(referencia.razon)}</Razon>
  </InformacionReferencia>
</NotaCreditoElectronica>`;
}
