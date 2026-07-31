import { DOMParser } from "@xmldom/xmldom";

// Lee (no genera) el XML de una Factura o Tiquete Electrónico que un PROVEEDOR entrega al vender
// — usado por POST /api/cxp/importar-xml para registrar una compra sin re-teclear proveedor ni
// artículos a mano. El parseo corre en el SERVIDOR (no en el navegador como en la referencia
// POS-RESTAURANTE): esta app nunca confía en datos "ya parseados" que mande el cliente para algo
// que va a crear proveedores, mover inventario o registrar una cuenta por pagar.

export interface LineaFacturaProveedor {
  codigoCabys: string;
  codigoComercial: string | null;
  nombre: string;
  cantidad: number;
  unidadMedida: string;
  precioUnitario: number;
  porcentajeIva: number;
  montoIva: number;
  total: number;
}

export interface FacturaProveedorParseada {
  proveedor: {
    nombre: string;
    tipoIdentificacion: "01" | "02" | "03" | "04";
    identificacion: string;
    telefono: string | null;
    correo: string | null;
    direccion: string | null;
  };
  numeroFacturaProv: string;
  fechaEmision: string;
  condicionVenta: "01" | "02";
  plazoDias: number | null;
  lineas: LineaFacturaProveedor[];
  montoTotal: number;
}

function textoDe(padre: Element | null, tag: string): string {
  if (!padre) return "";
  return padre.getElementsByTagName(tag)[0]?.textContent?.trim() || "";
}

export function parsearFacturaProveedorXML(xmlTexto: string): FacturaProveedorParseada {
  const doc = new DOMParser().parseFromString(xmlTexto, "application/xml");

  const raiz = doc.documentElement;
  if (!raiz || (raiz.tagName !== "FacturaElectronica" && raiz.tagName !== "TiqueteElectronico")) {
    throw new Error("El archivo no es una Factura o Tiquete Electrónico (se esperaba <FacturaElectronica> o <TiqueteElectronico> como elemento raíz).");
  }

  const emisorEl = doc.getElementsByTagName("Emisor")[0] || null;
  if (!emisorEl) throw new Error("El XML no tiene un nodo <Emisor> — no se puede identificar al proveedor.");

  const identificacionEmisorEl = emisorEl.getElementsByTagName("Identificacion")[0] || null;
  const identificacion = textoDe(identificacionEmisorEl, "Numero").replace(/[^0-9]/g, "");
  if (!identificacion) throw new Error("El XML no trae la identificación (cédula) del proveedor emisor.");

  const tipoIdentificacionRaw = textoDe(identificacionEmisorEl, "Tipo");
  const tipoIdentificacion = (["01", "02", "03", "04"] as const).includes(tipoIdentificacionRaw as any)
    ? (tipoIdentificacionRaw as "01" | "02" | "03" | "04")
    : "02";

  const telefonoEl = emisorEl.getElementsByTagName("Telefono")[0] || null;

  const proveedor = {
    nombre: textoDe(emisorEl, "Nombre") || "Proveedor sin nombre",
    tipoIdentificacion,
    identificacion,
    telefono: textoDe(telefonoEl, "NumTelefono") || null,
    correo: textoDe(emisorEl, "CorreoElectronico") || null,
    direccion: textoDe(emisorEl.getElementsByTagName("Ubicacion")[0] || null, "OtrasSenas") || null
  };

  const numeroFacturaProv = textoDe(raiz, "NumeroConsecutivo");
  const fechaEmision = textoDe(raiz, "FechaEmision");
  const condicionVenta: "01" | "02" = textoDe(raiz, "CondicionVenta") === "02" ? "02" : "01";
  const plazoCreditoRaw = textoDe(raiz, "PlazoCredito");
  const plazoDias = plazoCreditoRaw ? parseInt(plazoCreditoRaw, 10) : null;

  const lineaElements = Array.from(doc.getElementsByTagName("LineaDetalle"));
  if (lineaElements.length === 0) throw new Error("El XML no tiene ninguna línea de detalle (<LineaDetalle>).");

  const lineas: LineaFacturaProveedor[] = lineaElements.map((lineaEl, index) => {
    const numLinea = index + 1;
    const codigoCabys = textoDe(lineaEl, "CodigoCABYS");
    if (!codigoCabys) throw new Error(`La línea ${numLinea} del XML no trae código CABYS.`);

    const cantidad = parseFloat(textoDe(lineaEl, "Cantidad"));
    if (!cantidad || cantidad <= 0) throw new Error(`La línea ${numLinea} (CABYS ${codigoCabys}) no trae una cantidad válida.`);

    const precioUnitario = parseFloat(textoDe(lineaEl, "PrecioUnitario"));
    if (!Number.isFinite(precioUnitario) || precioUnitario < 0) throw new Error(`La línea ${numLinea} (CABYS ${codigoCabys}) no trae un precio unitario válido.`);

    const codigoComercialEl = lineaEl.getElementsByTagName("CodigoComercial")[0] || null;
    const impuestoEl = lineaEl.getElementsByTagName("Impuesto")[0] || null;
    const tarifaStr = textoDe(impuestoEl, "Tarifa");
    const montoIvaStr = textoDe(impuestoEl, "Monto");
    const totalStr = textoDe(lineaEl, "MontoTotalLinea");
    const subtotalCalc = cantidad * precioUnitario;

    return {
      codigoCabys,
      codigoComercial: textoDe(codigoComercialEl, "Codigo") || null,
      nombre: textoDe(lineaEl, "Detalle") || `CABYS ${codigoCabys}`,
      cantidad,
      unidadMedida: textoDe(lineaEl, "UnidadMedida") || "Unid",
      precioUnitario,
      porcentajeIva: tarifaStr ? parseFloat(tarifaStr) : 0,
      montoIva: montoIvaStr ? parseFloat(montoIvaStr) : 0,
      total: totalStr ? parseFloat(totalStr) : subtotalCalc
    };
  });

  const resumenEl = doc.getElementsByTagName("ResumenFactura")[0] || null;
  const montoTotalStr = textoDe(resumenEl, "TotalComprobante");
  const montoTotal = montoTotalStr ? parseFloat(montoTotalStr) : lineas.reduce((sum, l) => sum + l.total, 0);

  return { proveedor, numeroFacturaProv, fechaEmision, condicionVenta, plazoDias, lineas, montoTotal };
}
