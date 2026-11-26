// Colector IMAP de las facturas electrónicas que los PROVEEDORES envían por correo, para registrar
// la compra en CxP sin tener que subir el XML a mano. Portado de ERP-Elrotech
// (src/correoProveedores.ts). Solo recolecta y clasifica: no crea proveedores ni cuentas por pagar —
// eso lo sigue decidiendo una persona desde la bandeja, con el mismo POST /api/cxp/importar-xml.
//
// Solo servidor: imapflow no corre en el navegador.

import { ImapFlow } from "imapflow";
import { DOMParser } from "@xmldom/xmldom";
import yauzl from "yauzl";

// Un servidor que acepta la conexión y nunca responde no puede dejar colgado el proceso.
const IMAP_TIMEOUT_MS = 30000;

// Techo por pasada (cantidad y tiempo) para que un buzón cargado no se coma la memoria ni deje sin
// turno a las demás empresas: lo que sobre se recoge en la siguiente pasada, que sigue donde quedó.
const MAX_MENSAJES_POR_PASADA = 200;
const PRESUPUESTO_MS_POR_BUZON = 120000;

// Un comprobante de Hacienda ronda 5-15 KB; un "XML" de varios MB no es una factura.
const MAX_XML_BYTES = 2 * 1024 * 1024;

// Ventana máxima hacia atrás, también en la primera corrida: un buzón con años de historia tardaría
// horas y traería compras ya registradas. 45 y no 30: el D-104 se declara hasta el 15 del mes
// siguiente, así que al cerrar el mes hay que alcanzar facturas de los primeros días del anterior.
const DIAS_HACIA_ATRAS = 45;

// Solo lo que el importador de CxP sabe registrar hoy (ver parsearFacturaProveedorXML): las notas de
// crédito/débito del proveedor se ajustan a mano.
const TIPOS_COMPROBANTE: Record<string, "01" | "04"> = {
  FacturaElectronica: "01",
  TiqueteElectronico: "04"
};

export interface ConfigImap {
  imapHost: string;
  imapPort: number;
  imapSeguro: boolean;
  imapUsuario: string;
  imapPassword: string; // ya descifrada
  imapCarpeta: string;
}

export interface MetadatosComprobante {
  tipoDocumento: "01" | "04";
  clave: string; // 50 dígitos — llave natural de deduplicación
  numeroConsecutivo: string;
  fechaEmision: string;
  emisorNombre: string;
  emisorIdentificacion: string;
  receptorIdentificacion: string; // vacío en un Tiquete Electrónico
  total: number; // SIEMPRE en colones (convertido con el <TipoCambio> del comprobante)
  moneda: string;
  tipoCambio: number; // 1 en colones; 0 si viene en otra moneda sin tipo de cambio
}

export interface ComprobanteRecibido {
  uid: number;
  remitente: string;
  asunto: string;
  fechaCorreo: Date;
  nombreArchivo: string;
  xml: string;
  meta: MetadatosComprobante;
}

/** Hasta dónde se leyó UNA carpeta: el UID solo vale dentro de su carpeta y mientras no cambie el UIDVALIDITY. */
export interface AvanceCarpeta {
  uid: number;
  uidValidity: number;
}

export interface ResultadoRecoleccion {
  comprobantes: ComprobanteRecibido[];
  // Un UID solo se da por bueno cuando su correo se procesó COMPLETO: releer un correo no cuesta
  // nada (la clave lo deduplica), saltárselo lo pierde para siempre.
  avance: Record<string, AvanceCarpeta>;
  carpetasRevisadas: string[];
  carpetasConError: { carpeta: string; error: string }[];
  mensajesRevisados: number;
  descartados: number; // XML que no eran una compra de esta empresa (copias propias, acuses, notas)
  buzonAlDia: boolean;
}

function normalizarIdentificacion(valor: string | null | undefined): string {
  return (valor || "").replace(/[^0-9]/g, "");
}

function crearClienteImap(config: ConfigImap): ImapFlow {
  if (!config.imapHost || !config.imapUsuario || !config.imapPassword) {
    throw new Error("Falta configurar el buzón de correo entrante (servidor, usuario o contraseña).");
  }
  // secure = TLS directo (993). Con false, imapflow negocia STARTTLS si el servidor lo ofrece (143):
  // en ninguno de los dos caminos viajan las credenciales en claro.
  const cliente = new ImapFlow({
    host: config.imapHost,
    port: config.imapPort || (config.imapSeguro ? 993 : 143),
    secure: config.imapSeguro,
    auth: { user: config.imapUsuario, pass: config.imapPassword },
    logger: false,
    greetingTimeout: IMAP_TIMEOUT_MS,
    socketTimeout: IMAP_TIMEOUT_MS,
    connectionTimeout: IMAP_TIMEOUT_MS,
    tls: { rejectUnauthorized: true }
  } as any);
  // Sin listener, un 'error' asíncrono del socket (p. ej. ETIMEOUT) tumba todo el proceso Node.
  // La promesa en curso ya se rechaza por su cuenta; aquí solo se evita la excepción no controlada.
  cliente.on('error', (err: any) => console.warn('[CORREO PROVEEDORES] Error de conexión IMAP (' + config.imapHost + '):', err?.code || '', err?.message || err));
  return cliente;
}

/**
 * Traduce un error de imapflow (que casi siempre dice solo "Command failed") a un mensaje claro en
 * español. `esAutenticacion` permite distinguir credenciales rechazadas de una caída pasajera.
 */
export function describirErrorImap(err: any, host?: string): { mensaje: string; esAutenticacion: boolean } {
  const codigo = String(err?.code || "");
  const respuesta = String(err?.responseText || "").trim();
  const texto = String(err?.message || "");
  const nombreHost = String(host || "").toLowerCase();

  const esAutenticacion = !!err?.authenticationFailed
    || /invalid credentials|authenticationfailed/i.test(respuesta)
    || /authenticationfailed/i.test(String(err?.serverResponseCode || ""));
  if (esAutenticacion) {
    let mensaje = "El servidor de correo rechazó el usuario o la contraseña.";
    if (nombreHost.includes("gmail")) {
      mensaje += " En Gmail debe usar una contraseña de aplicación (16 caracteres): active la verificación en 2 pasos y genérela en myaccount.google.com/apppasswords.";
    } else if (nombreHost.includes("outlook") || nombreHost.includes("office365")) {
      mensaje += " En Outlook/Microsoft 365 puede requerirse una contraseña de aplicación (con verificación en 2 pasos) o tener habilitado el acceso IMAP para el buzón.";
    }
    if (respuesta) mensaje += ` (${respuesta})`;
    return { mensaje, esAutenticacion: true };
  }
  if (/ETIMEOUT|ETIMEDOUT/i.test(codigo) || /ETIMEOUT|ETIMEDOUT|Socket timeout/i.test(texto)) {
    return { mensaje: "El servidor de correo no respondió a tiempo (revise servidor y puerto).", esAutenticacion: false };
  }
  if (/ENOTFOUND/i.test(codigo) || /ENOTFOUND/i.test(texto)) {
    return { mensaje: `No se encontró el servidor ${host || "de correo"}.`, esAutenticacion: false };
  }
  if (/ECONNREFUSED/i.test(codigo) || /ECONNREFUSED/i.test(texto)) {
    return { mensaje: "El servidor rechazó la conexión en ese puerto.", esAutenticacion: false };
  }
  if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS|EPROTO|SSL/i.test(codigo) || /certificate|self[- ]signed|wrong version number/i.test(texto)) {
    return { mensaje: "No se pudo establecer una conexión segura con el servidor (certificado TLS inválido o seguridad/puerto incorrectos).", esAutenticacion: false };
  }
  return { mensaje: respuesta || texto || "Error desconocido al conectar con el servidor de correo.", esAutenticacion: false };
}

/** Error ya traducido; conserva `esAutenticacion` para que el llamador decida si pausar la revisión. */
function errorImapClaro(err: any, host: string): Error {
  const { mensaje, esAutenticacion } = describirErrorImap(err, host);
  const nuevo: Error & { esAutenticacion?: boolean } = new Error(mensaje);
  nuevo.esAutenticacion = esAutenticacion;
  return nuevo;
}

async function conectarImap(client: ImapFlow, config: ConfigImap): Promise<void> {
  try {
    await client.connect();
  } catch (err: any) {
    throw errorImapClaro(err, config.imapHost);
  }
}

/** Cierra la sesión sin lanzar: si el socket ya murió, fuerza el cierre. */
async function cerrarClienteImap(cliente: ImapFlow): Promise<void> {
  try { await cliente.logout(); } catch { try { (cliente as any).close?.(); } catch { /* ya cerrada */ } }
}

/**
 * Las carpetas a revisar. Se aceptan varias separadas por coma: en Gmail las etiquetas SON carpetas
 * IMAP, y un filtro que archive las facturas bajo "Facturas" las saca del INBOX.
 */
export function carpetasDe(imapCarpeta: string | null | undefined): string[] {
  const carpetas = (imapCarpeta || "INBOX").split(",").map(c => c.trim()).filter(Boolean);
  return Array.from(new Set(carpetas.length > 0 ? carpetas : ["INBOX"]));
}

/** Botón "Probar conexión": confirma credenciales y que cada carpeta exista, sin leer mensajes. */
export async function verificarConexionImap(config: ConfigImap): Promise<void> {
  const client = crearClienteImap(config);
  try {
    await conectarImap(client, config);
    for (const carpeta of carpetasDe(config.imapCarpeta)) {
      try {
        const lock = await client.getMailboxLock(carpeta, { readOnly: true });
        lock.release();
      } catch (err: any) {
        throw new Error(`No se pudo abrir la carpeta "${carpeta}": ${err.message || err}`);
      }
    }
  } finally {
    await cerrarClienteImap(client);
  }
}

/** Las carpetas que el buzón realmente tiene, para elegirlas sin adivinar el nombre exacto. */
export async function listarCarpetas(config: ConfigImap): Promise<{ ruta: string; seleccionable: boolean }[]> {
  const client = crearClienteImap(config);
  try {
    await conectarImap(client, config);
    const lista = await client.list();
    return (lista || [])
      // \Noselect son nodos de agrupación (el "[Gmail]" a secas), no buzones que se puedan abrir.
      .map((b: any) => ({ ruta: b.path as string, seleccionable: !(b.flags?.has?.("\\Noselect") || b.listed === false) }))
      .sort((a, b) => a.ruta.localeCompare(b.ruta));
  } finally {
    await cerrarClienteImap(client);
  }
}

/**
 * Metadatos de un comprobante. null si no es una Factura/Tiquete (típicamente el MensajeHacienda
 * que viaja en el mismo correo, o una nota de crédito) o si no tiene una clave válida.
 */
export function extraerMetadatosComprobante(xmlTexto: string): MetadatosComprobante | null {
  let errorDeParseo = false;
  let doc: any;
  try {
    // xmldom no lanza ante un XML inválido: lo reporta al errorHandler. Un adjunto corrupto se descarta.
    doc = new DOMParser({
      errorHandler: { warning: () => {}, error: () => { errorDeParseo = true; }, fatalError: () => { errorDeParseo = true; } }
    }).parseFromString(xmlTexto.replace(/^﻿/, ""), "application/xml");
  } catch {
    return null;
  }
  const raiz = doc?.documentElement;
  if (errorDeParseo || !raiz) return null;

  const tipoDocumento = TIPOS_COMPROBANTE[raiz.tagName];
  if (!tipoDocumento) return null;

  const texto = (padre: any, tag: string): string => padre?.getElementsByTagName(tag)[0]?.textContent?.trim() || "";

  const clave = texto(raiz, "Clave").replace(/[^0-9]/g, "");
  if (clave.length !== 50) return null;

  const emisorEl = doc.getElementsByTagName("Emisor")[0];
  const receptorEl = doc.getElementsByTagName("Receptor")[0];
  const resumenEl = doc.getElementsByTagName("ResumenFactura")[0];
  const monedaEl = doc.getElementsByTagName("CodigoTipoMoneda")[0];

  const moneda = (texto(monedaEl, "CodigoMoneda") || "CRC").toUpperCase();
  const tipoCambioRaw = parseFloat(texto(monedaEl, "TipoCambio"));
  // 0 = otra moneda sin tipo de cambio: entra igual a la bandeja (que se vea que llegó) con el monto
  // sin convertir; el importador es quien la rechaza.
  const tipoCambio = moneda !== "CRC" ? (tipoCambioRaw > 0 ? tipoCambioRaw : 0) : 1;
  const totalOriginal = parseFloat(texto(resumenEl, "TotalComprobante")) || 0;
  const total = tipoCambio > 0 ? Math.round(totalOriginal * tipoCambio * 100) / 100 : totalOriginal;

  return {
    tipoDocumento,
    clave,
    numeroConsecutivo: texto(raiz, "NumeroConsecutivo"),
    fechaEmision: texto(raiz, "FechaEmision"),
    emisorNombre: texto(emisorEl, "Nombre"),
    emisorIdentificacion: normalizarIdentificacion(texto(emisorEl?.getElementsByTagName("Identificacion")[0], "Numero")),
    receptorIdentificacion: normalizarIdentificacion(texto(receptorEl?.getElementsByTagName("Identificacion")[0], "Numero")),
    total: Number.isFinite(total) ? total : 0,
    moneda,
    tipoCambio
  };
}

/**
 * ¿Es una COMPRA de esta empresa? Al mismo buzón llegan las copias de las facturas que la empresa
 * emitió; sin este filtro terminarían como cuentas por pagar contra uno mismo.
 */
export function esCompraDeLaEmpresa(meta: MetadatosComprobante, identificacionEmpresa: string): boolean {
  const propia = normalizarIdentificacion(identificacionEmpresa);
  if (!propia) return false;
  if (meta.emisorIdentificacion === propia) return false;
  // Un tiquete no lleva receptor: basta con que el emisor sea otro. Si lo trae, tiene que ser esta
  // empresa (el buzón puede ser compartido).
  if (!meta.receptorIdentificacion) return true;
  return meta.receptorIdentificacion === propia;
}

/** Los .xml dentro de un adjunto .zip (varios proveedores mandan así el par XML+PDF). */
export function extraerXmlDeZip(buffer: Buffer): Promise<{ nombre: string; contenido: Buffer }[]> {
  return new Promise((resolve) => {
    const salida: { nombre: string; contenido: Buffer }[] = [];
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return resolve(salida); // zip corrupto: se descarta el adjunto, no el correo
      zip.on("entry", (entry) => {
        if (!/\.xml$/i.test(entry.fileName) || entry.uncompressedSize > MAX_XML_BYTES) return zip.readEntry();
        zip.openReadStream(entry, (errStream, stream) => {
          if (errStream || !stream) return zip.readEntry();
          const trozos: Buffer[] = [];
          stream.on("data", (c: Buffer) => trozos.push(c));
          stream.on("end", () => {
            salida.push({ nombre: entry.fileName, contenido: Buffer.concat(trozos) });
            zip.readEntry();
          });
          stream.on("error", () => zip.readEntry());
        });
      });
      zip.on("end", () => resolve(salida));
      zip.on("error", () => resolve(salida));
      zip.readEntry();
    });
  });
}

interface ParteAdjunta {
  part: string;
  nombre: string;
  esZip: boolean;
}

/**
 * Las partes del mensaje que son un XML (o un ZIP que podría contenerlo). Un correo sin XML no se
 * descarga; tampoco se bajan los PDF, que pesan 20 veces más y no se usan.
 */
export function partesXmlDelMensaje(nodo: any, acumulado: ParteAdjunta[] = []): ParteAdjunta[] {
  if (!nodo) return acumulado;
  const nombre: string = nodo.dispositionParameters?.filename || nodo.parameters?.name || "";
  const tipo: string = (nodo.type || "").toLowerCase();
  const esXml = /\.xml$/i.test(nombre) || tipo === "application/xml" || tipo === "text/xml";
  const esZip = /\.zip$/i.test(nombre) || tipo === "application/zip" || tipo === "application/x-zip-compressed";
  // `part` falta en la raíz de un multipart, pero también cuando el correo NO es multipart y su
  // cuerpo entero ES el XML: ahí el cuerpo se pide como parte "1".
  const parteId = nodo.part || (!nodo.childNodes?.length ? "1" : "");
  if (parteId && (esXml || esZip)) {
    acumulado.push({ part: parteId, nombre: nombre || (esZip ? "adjunto.zip" : "adjunto.xml"), esZip });
  }
  for (const hijo of nodo.childNodes || []) partesXmlDelMensaje(hijo, acumulado);
  return acumulado;
}

async function leerParte(client: ImapFlow, uid: number, part: string): Promise<Buffer | null> {
  const descarga = await client.download(String(uid), part, { uid: true });
  if (!descarga?.content) return null;
  const trozos: Buffer[] = [];
  let bytes = 0;
  for await (const trozo of descarga.content as any) {
    bytes += trozo.length;
    if (bytes > MAX_XML_BYTES) return null;
    trozos.push(trozo);
  }
  return Buffer.concat(trozos);
}

/**
 * Revisa todas las carpetas configuradas y devuelve los comprobantes de compra nuevos con el avance
 * actualizado. Cada carpeta se abre en SOLO LECTURA: es el correo de trabajo del cliente, así que
 * nada de marcar como leído, mover o borrar. El avance va por UID, nunca por la bandera \Seen.
 */
export async function recolectarComprobantes(
  config: ConfigImap,
  opciones: { avance: Record<string, AvanceCarpeta>; identificacionEmpresa: string }
): Promise<ResultadoRecoleccion> {
  const client = crearClienteImap(config);
  const comprobantes: ComprobanteRecibido[] = [];
  const avance: Record<string, AvanceCarpeta> = { ...opciones.avance };
  const carpetasRevisadas: string[] = [];
  const carpetasConError: { carpeta: string; error: string }[] = [];
  let mensajesRevisados = 0;
  let descartados = 0;
  let buzonAlDia = true;
  // El presupuesto de tiempo es de la EMPRESA, no de cada carpeta.
  const limiteTiempo = Date.now() + PRESUPUESTO_MS_POR_BUZON;

  try {
    await conectarImap(client, config);
    for (const carpeta of carpetasDe(config.imapCarpeta)) {
      if (Date.now() > limiteTiempo) { buzonAlDia = false; break; }
      let lock;
      try {
        lock = await client.getMailboxLock(carpeta, { readOnly: true });
      } catch (err: any) {
        // Una carpeta mal escrita no tumba la revisión de las demás.
        carpetasConError.push({ carpeta, error: String(err.message || err) });
        continue;
      }
      try {
        const r = await revisarCarpeta(client, carpeta, { avance: opciones.avance[carpeta], identificacionEmpresa: opciones.identificacionEmpresa, limiteTiempo });
        comprobantes.push(...r.comprobantes);
        avance[carpeta] = r.avance;
        mensajesRevisados += r.mensajesRevisados;
        descartados += r.descartados;
        if (!r.alDia) buzonAlDia = false;
        carpetasRevisadas.push(carpeta);
      } catch (err: any) {
        carpetasConError.push({ carpeta, error: String(err.message || err) });
      } finally {
        lock.release();
      }
    }
    return { comprobantes, avance, carpetasRevisadas, carpetasConError, mensajesRevisados, descartados, buzonAlDia };
  } finally {
    await cerrarClienteImap(client);
  }
}

/** Una sola carpeta, ya abierta y bloqueada por el llamador. */
async function revisarCarpeta(
  client: ImapFlow,
  carpeta: string,
  opciones: { avance?: AvanceCarpeta; identificacionEmpresa: string; limiteTiempo: number }
): Promise<{ comprobantes: ComprobanteRecibido[]; avance: AvanceCarpeta; mensajesRevisados: number; descartados: number; alDia: boolean }> {
  const comprobantes: ComprobanteRecibido[] = [];
  let mensajesRevisados = 0;
  let descartados = 0;
  let alDia = true;

  const uidValidity = Number((client.mailbox as any)?.uidValidity || 0);
  // Si cambió el UIDVALIDITY la carpeta se recreó y sus UID viejos no significan nada: se relee la ventana.
  const previo = opciones.avance;
  const desdeUid = previo && previo.uidValidity !== 0 && previo.uidValidity === uidValidity ? previo.uid : 0;
  let ultimoUid = desdeUid;

  const desde = new Date();
  desde.setDate(desde.getDate() - DIAS_HACIA_ATRAS);

  // "N:*" siempre devuelve al menos el último mensaje aunque no haya nada más nuevo que N: se filtra a mano.
  const criterio = desdeUid > 0 ? { since: desde, uid: `${desdeUid + 1}:*` } : { since: desde };
  const encontrados = ((await client.search(criterio, { uid: true })) || []) as number[];
  const uids = (desdeUid > 0 ? encontrados.filter(u => u > desdeUid) : encontrados).sort((a, b) => a - b);
  const lote = uids.slice(0, MAX_MENSAJES_POR_PASADA);
  if (lote.length < uids.length) alDia = false;

  // envelope y bodyStructure son baratos (no bajan adjuntos) y deciden qué vale la pena descargar.
  const mensajes: any[] = [];
  if (lote.length > 0) {
    for await (const msg of client.fetch(lote, { uid: true, envelope: true, bodyStructure: true }, { uid: true })) {
      mensajes.push(msg);
    }
  }

  for (const msg of mensajes) {
    if (Date.now() > opciones.limiteTiempo) { alDia = false; break; }
    mensajesRevisados++;

    const partes = partesXmlDelMensaje(msg.bodyStructure);
    if (partes.length === 0) {
      if (msg.uid > ultimoUid) ultimoUid = msg.uid;
      continue;
    }

    let descargaCompleta = true;
    const remitente = msg.envelope?.from?.[0]?.address || "";
    const asunto = msg.envelope?.subject || "(sin asunto)";
    const fechaCorreo = msg.envelope?.date ? new Date(msg.envelope.date) : new Date();

    for (const parte of partes) {
      let candidatos: { nombre: string; contenido: Buffer }[];
      try {
        const bruto = await leerParte(client, msg.uid, parte.part);
        if (!bruto) continue;
        candidatos = parte.esZip ? await extraerXmlDeZip(bruto) : [{ nombre: parte.nombre, contenido: bruto }];
      } catch (err: any) {
        console.error(`[CORREO PROVEEDORES] No se pudo bajar el adjunto ${parte.nombre} (${carpeta} uid ${msg.uid}):`, err.message || err);
        descargaCompleta = false;
        continue;
      }
      for (const candidato of candidatos) {
        // Los comprobantes son UTF-8; sin el BOM porque DOMParser lo toma como contenido antes del prólogo.
        const xml = candidato.contenido.toString("utf8").replace(/^﻿/, "");
        const meta = extraerMetadatosComprobante(xml);
        if (!meta || !esCompraDeLaEmpresa(meta, opciones.identificacionEmpresa)) { descartados++; continue; }
        comprobantes.push({ uid: msg.uid, remitente, asunto, fechaCorreo, nombreArchivo: candidato.nombre, xml, meta });
      }
    }

    if (!descargaCompleta) {
      // Sin avanzar el UID: la próxima pasada vuelve a este mismo correo.
      alDia = false;
      break;
    }
    if (msg.uid > ultimoUid) ultimoUid = msg.uid;
  }

  return { comprobantes, avance: { uid: ultimoUid, uidValidity }, mensajesRevisados, descartados, alDia };
}
