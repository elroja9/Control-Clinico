import { DOMParser } from "@xmldom/xmldom";

// Lee (no genera) el XML de una Factura o Tiquete Electrónico que un PROVEEDOR entrega al vender
// — usado por POST /api/cxp/importar-xml para registrar una compra sin re-teclear proveedor ni
// artículos a mano. El parseo corre en el SERVIDOR (no en el navegador como en la referencia
// POS-RESTAURANTE): esta app nunca confía en datos "ya parseados" que mande el cliente para algo
// que va a crear proveedores, mover inventario o registrar una cuenta por pagar.
//
// Los montos que devuelve SIEMPRE están en colones: si el comprobante viene en otra moneda, se
// convierten con el <TipoCambio> que el propio comprobante declara (ver `moneda`/`tipoCambio`).

export interface LineaFacturaProveedor {
  codigoCabys: string;
  codigoComercial: string | null;
  nombre: string;
  cantidad: number;
  unidadMedida: string;
  precioUnitario: number;
  porcentajeIva: number; // tarifa del impuesto de IVA de la línea (13, 4, 2, 1, 0...)
  // Base de la línea DESPUÉS del descuento (<SubTotal>) y el IVA que de verdad se pagó. Se leen
  // del XML en vez de derivarlos del total: una línea puede traer descuento y otros impuestos (el
  // específico de bebidas, el selectivo de consumo) que no son IVA ni dan crédito fiscal.
  subtotal: number;
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
  claveHacienda: string;
  numeroFacturaProv: string;
  fechaEmision: string;
  condicionVenta: "01" | "02";
  plazoDias: number | null;
  // Moneda del comprobante ('CRC', 'USD'...) y el tipo de cambio a colones que declaró el
  // proveedor. Solo como rastro: los montos de esta estructura ya vienen en colones.
  moneda: string;
  tipoCambio: number;
  lineas: LineaFacturaProveedor[];
  montoTotal: number;
}

// Códigos de <Impuesto> que son IVA: 01 (general), 07 (cálculo especial, p. ej. cerveza) y 08
// (régimen de bienes usados). Los demás (02 selectivo, 04/05 específicos de bebidas...) no son IVA.
const CODIGOS_IVA = new Set(["01", "07", "08"]);

function textoDe(padre: Element | null, tag: string): string {
  if (!padre) return "";
  return padre.getElementsByTagName(tag)[0]?.textContent?.trim() || "";
}

export function parsearFacturaProveedorXML(xmlTexto: string): FacturaProveedorParseada {
  // xmldom no lanza ante un XML mal formado: lo reporta al errorHandler y devuelve lo que alcanzó
  // a leer. Sin esto, un archivo truncado o que no es XML terminaba con un mensaje engañoso
  // ("no tiene <Emisor>") o, peor, importado a medias.
  let errorDeParseo: string | null = null;
  const doc = new DOMParser({
    errorHandler: {
      warning: () => {},
      error: (msg: string) => { errorDeParseo = errorDeParseo || msg; },
      fatalError: (msg: string) => { errorDeParseo = errorDeParseo || msg; }
    }
  }).parseFromString(xmlTexto, "application/xml");
  if (errorDeParseo) {
    throw new Error("El archivo seleccionado no es un XML válido.");
  }

  const raiz = doc.documentElement;
  if (raiz && (raiz.tagName === "NotaCreditoElectronica" || raiz.tagName === "NotaDebitoElectronica")) {
    throw new Error("Este XML es una Nota de Crédito/Débito del proveedor. Por ahora solo se pueden importar Facturas y Tiquetes; ajuste la cuenta por pagar a mano.");
  }
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

  // Moneda y tipo de cambio (<ResumenFactura><CodigoTipoMoneda>). Sin ese bloque el comprobante es
  // en colones. Sin un tipo de cambio válido NO se adivina: importar un comprobante en dólares como
  // si fueran colones metería un costo ~500 veces menor al real (y con él el IVA acreditable).
  const monedaEl = doc.getElementsByTagName("CodigoTipoMoneda")[0] || null;
  const moneda = (textoDe(monedaEl, "CodigoMoneda") || "CRC").toUpperCase();
  const tipoCambioRaw = parseFloat(textoDe(monedaEl, "TipoCambio"));
  const enOtraMoneda = moneda !== "CRC";
  if (enOtraMoneda && !(tipoCambioRaw > 0)) {
    throw new Error(`El comprobante está en ${moneda} pero no trae un tipo de cambio válido (<TipoCambio>), así que no se puede convertir a colones. Regístrelo a mano.`);
  }
  const tipoCambio = enOtraMoneda ? tipoCambioRaw : 1;
  const aColones = (monto: number): number => enOtraMoneda ? Math.round(monto * tipoCambio * 100) / 100 : monto;

  const claveHacienda = textoDe(raiz, "Clave").replace(/[^0-9]/g, "");
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
    const totalStr = textoDe(lineaEl, "MontoTotalLinea");

    // Base después del descuento. <SubTotal> ya la trae; sin él se arma con MontoTotal − descuentos.
    const subtotalStr = textoDe(lineaEl, "SubTotal");
    const montoTotalStr = textoDe(lineaEl, "MontoTotal");
    const descuentos = Array.from(lineaEl.getElementsByTagName("MontoDescuento"))
      .reduce((sum, d) => sum + (parseFloat(d.textContent || "") || 0), 0);
    const subtotal = subtotalStr
      ? parseFloat(subtotalStr)
      : (montoTotalStr ? parseFloat(montoTotalStr) : cantidad * precioUnitario) - descuentos;

    // Una línea puede traer varios <Impuesto> y el IVA no tiene por qué ser el primero (en cerveza
    // va después del específico y el selectivo). Antes se tomaba la tarifa y el monto del PRIMER
    // <Impuesto>, así que esas líneas quedaban con tarifas imposibles (4.5%, 11.66%...) y con el
    // impuesto equivocado como crédito fiscal. Un <Impuesto> sin <Codigo> se toma como IVA. Lo
    // exonerado no se pagó, así que no da crédito.
    const impuestosIva = Array.from(lineaEl.getElementsByTagName("Impuesto")).filter(imp => {
      const codigo = imp.getElementsByTagName("Codigo")[0]?.textContent?.trim();
      return !codigo || CODIGOS_IVA.has(codigo);
    });
    const tarifaStr = impuestosIva.map(imp => textoDe(imp, "Tarifa")).find(t => !!t) || "";
    const porcentajeIva = tarifaStr ? parseFloat(tarifaStr) : 0;
    const montoIva = impuestosIva.reduce((sum, imp) => {
      const montoStr = textoDe(imp, "Monto");
      const monto = montoStr ? parseFloat(montoStr) : subtotal * (porcentajeIva / 100);
      const exonerado = parseFloat(textoDe(imp.getElementsByTagName("Exoneracion")[0] || null, "MontoExoneracion")) || 0;
      return sum + monto - exonerado;
    }, 0);

    return {
      codigoCabys,
      codigoComercial: textoDe(codigoComercialEl, "Codigo") || null,
      nombre: textoDe(lineaEl, "Detalle") || `CABYS ${codigoCabys}`,
      cantidad,
      unidadMedida: textoDe(lineaEl, "UnidadMedida") || "Unid",
      precioUnitario: aColones(precioUnitario),
      porcentajeIva,
      subtotal: aColones(subtotal),
      montoIva: aColones(montoIva),
      total: aColones(totalStr ? parseFloat(totalStr) : subtotal + montoIva)
    };
  });

  const resumenEl = doc.getElementsByTagName("ResumenFactura")[0] || null;
  const montoTotalStr = textoDe(resumenEl, "TotalComprobante");
  // Las líneas ya vienen convertidas, así que el respaldo por suma NO se vuelve a convertir.
  const montoTotal = montoTotalStr ? aColones(parseFloat(montoTotalStr)) : lineas.reduce((sum, l) => sum + l.total, 0);

  return { proveedor, claveHacienda, numeroFacturaProv, fechaEmision, condicionVenta, plazoDias, moneda, tipoCambio, lineas, montoTotal };
}
