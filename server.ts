import express from "express";
import https from "https";
import { randomBytes } from "crypto";
import path from "path";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { encryptSecret, decryptSecret } from "./server/crypto";
import {
  createSessionToken,
  verifySessionToken,
  passwordMatches,
  hashPassword,
  isBcryptHash,
  isSaasAdmin,
  readCookie,
  serializeSessionCookie,
  generateNumericPassword,
  SESSION_MAX_AGE_SECONDS,
  type SessionPayload
} from "./server/auth";
import { idCompaniaPlataforma, establecerIdCompaniaPlataforma, idPlataformaDesdeParametros, esCompaniaPlataforma, CLAVE_ID_COMPANIA_PLATAFORMA, MENSAJE_PLATAFORMA_SIN_COMPROBANTES } from "./server/companiaPlataforma";
import { crearCacheUsuarios, decidirAccesoContador, sesionDesdeUsuario, type UsuarioVigente } from "./server/accesoContador";
import { politicaDesdeParametros, validarNuevaContrasena, crearLimiteIntentos } from "./server/contrasena";
import { obtenerCertificadoHttps } from "./server/httpsCert";
import { verificarLlaveP12, firmarXadesEpes, type PoliticaFirma } from "./server/haciendaSigner";
import {
  calcularLineas,
  calcularResumen,
  limpiarCodigoActividad,
  limpiarIdentificacion,
  codigoActividadValido,
  generarConsecutivo,
  generarClaveNumerica,
  fechaEmisionCR,
  construirXmlComprobante,
  errorSucursalTerminal,
  desglosarClaveOConsecutivo,
  validarMediosPago,
  cuadrarMediosPago,
  recortarDetalle,
  receptorDesdeXml,
  RAZON_MAX,
  type EmisorFactura,
  type ReceptorFactura,
  type LineaFacturaInput,
  type MedioPagoComprobante,
  type ResumenCalculado
} from "./server/haciendaFactura";
import { obtenerTokenHaciendaConVigencia, enviarFacturaHacienda, consultarEstadoHacienda, esperarResolucionHacienda, resolverEndpointsHacienda, listarComprobantesEmitidos, formatoEmisorHacienda, crearCacheTokensHacienda, claveCacheToken } from "./server/haciendaApi";
import type { AmbienteHacienda, EstadoHaciendaResultado, EndpointsHacienda, ParametrosSondeo } from "./server/haciendaApi";
import { identificacionReceptorValida, decidirTipoComprobante, tipoDocReferencia, codigoEnCatalogo, codigosDe, CATALOGOS_SIN_BD, problemasEmisor, problemasTransmision, errorDetalle, validarTercero, errorLongitudReceptor, LARGOS_RECEPTOR, type EntradaCatalogo, type TipoCatalogo } from "./server/haciendaReglas";
import { calcularProximoIntento, decidirAccionCola, clasificarRespuestaEnvio, estadoTrasConsultaCola, estadoSinRespuesta, bloqueoMinimoSeg, correoReclamable, type ParametrosCola } from "./server/haciendaCola";
import { cabys as buscarCabysHacienda, contribuyente as consultarContribuyente, tipoCambio as consultarTipoCambio, exoneracion as consultarExoneracion, HaciendaPublicaError, type TipoCambio } from "./server/haciendaPublica";
import { fechaCR, fechaHoraCR, sumarDiasCR } from "./src/utils/fechaCR";
import { errorIdentificacion, soloDigitosIdentificacion } from "./src/utils/identificacion";
import { errorDatosFiscalesAlta } from "./src/utils/datosFiscales";
import { ivaEfectivo, precioConIva } from "./src/utils/precios";
import { normalizarWhatsapp, normalizarMensajeWhatsapp, WhatsappInvalidoError } from "./src/utils/whatsapp";
import { normalizarModalidad, servicioCompatible } from "./src/utils/modalidad";
import { serviciosDefectoParaPerfil } from "./server/serviciosDefecto";
import { parsearFacturaProveedorXML } from "./server/xmlProveedorParser";
import type { CompaniaSmtpConfig } from "./src/data/mockData";
import { sendMail, createTransportFromConfig } from "./server/mailer";
import type { AdjuntoEmail } from "./server/mailer";
import { adjuntoIcsParaPaciente, eventoDesdeCita, generarCalendarioIcs } from "./server/ics";
import { generarPdfDesdeHtml } from "./server/pdf";
import { renderFacturaPdf, renderConsultaPacientePdf } from "./server/pdfTemplates";
import { renderCitaEmail, renderCitaEmailProfesional, renderConsultaEmail, renderFacturaEmail, renderAccountStatusEmail, renderAvisoSuspensionMoraEmail, renderNuevaEmpresaEmail, renderPasswordResetEmail, renderRecordatorioDocumentosEmail, renderSmtpTestEmail } from "./server/emailTemplates";
import { crearServicioErp, registrarRutasErp } from "./server/erpServicio";
import { cambiaronDatosSuscriptor } from "./server/erpIntegracion";
import { calcularTiempoTrasladoMinutos, TrasladoNoCalculableError } from "./server/googleMaps";
import { tocaRecordatorio } from "./server/recordatoriosCasos";
import { slotLibre, haySolapeConCitas, minutosDesdeMedianoche, validarTransicionEstado, esFechaHoraValida, fechaHoraEsPasada, esEstadoActivo, ESTADOS_CITA } from "./server/citasReglas";
import { calcularImpuestoRenta, validarParametrosRenta } from "./server/impuestoRenta";
import type { ParametrosRenta } from "./server/impuestoRenta";
import { recolectarComprobantes, verificarConexionImap, listarCarpetas, carpetasDe } from "./server/correoProveedores";
import type { ConfigImap, AvanceCarpeta } from "./server/correoProveedores";
import type { Company, Patient, Cita, Consultation, CalendarBlock, CompanyPayment, HorarioAtencion, HorarioDomicilio, DiaSemana, Servicio, Factura, CuentaCobrar, PagoCuentaCobrar, Proveedor, CuentaPagar, PagoCuentaPagar, ReporteD104, ReporteD101, GastosManualesAnuales, PorcentajeDieta, PlantillaDieta, CasoLegal, DocumentoCaso, NotificationLog, CompaniaImapConfig } from "./src/data/mockData";
import { DEFAULT_HORARIO_ATENCION } from "./src/data/mockData";
import { createServer as createViteServer } from "vite";
import {
  defaultCompanies,
  defaultUsers,
  defaultPatients,
  defaultConsultations,
  defaultCitas,
  defaultSmtpConfigs,
  defaultNotificationLogs,
  defaultCalendarBlocks,
  defaultCompanyPayments,
  defaultServicios,
  defaultFacturas,
  defaultPorcentajesDieta,
  defaultPlantillasDieta
} from "./src/data/mockData";
import { COSTA_RICA_PROVINCIAS } from "./src/data/costaRicaLocations";

dotenv.config();

// --- MySQL Setup & In-Memory Fallbacks ---
let pool: mysql.Pool | null = null;
let dbConnected = false;
let dbError: string | null = null;

// Dual-mode Storage Fallback variables if MySQL is offline
let localCompanies = [...defaultCompanies];
let localUsers = [...defaultUsers];
let localPatients = [...defaultPatients];
let localConsultations = [...defaultConsultations];
let localCitas = [...defaultCitas];
let localSmtpConfigs = [...defaultSmtpConfigs];
let localLogs = [...defaultNotificationLogs];
let localCalendarBlocks = [...defaultCalendarBlocks];
let localPorcentajesDieta: PorcentajeDieta[] = [...defaultPorcentajesDieta];
let localPlantillasDieta: PlantillaDieta[] = [...defaultPlantillasDieta];
let localCompanyPayments: CompanyPayment[] = [...defaultCompanyPayments];
let localServicios: Servicio[] = [...defaultServicios];
let localFacturas: Factura[] = [...defaultFacturas];
let localCuentasCobrar: Omit<CuentaCobrar, "pagos">[] = [];
let localCxcPagos: PagoCuentaCobrar[] = [];
let localProveedores: Proveedor[] = [];
let localCuentasPagar: Omit<CuentaPagar, "pagos">[] = [];
let localCxpPagos: PagoCuentaPagar[] = [];
interface LocalGastosManuales extends GastosManualesAnuales { idCompania: number; anio: number; }
let localGastosManuales: LocalGastosManuales[] = [];
interface LocalCierreFiscal { id: number; idCompania: number; tipo: "D104" | "D101"; periodo: string; datos: ReporteD104 | ReporteD101; creadoPor: string | null; creadoEn: string; }
let localCierresFiscales: LocalCierreFiscal[] = [];
let localParametrosRenta: ParametrosRenta[] = [];
let localCasos: Omit<CasoLegal, "documentos">[] = [];
let localDocumentosCaso: DocumentoCaso[] = [];

interface LocalHaciendaConfig {
  idCompania: number;
  ambiente: 'SANDBOX' | 'PRODUCCION' | 'PRUEBAS_LOCAL';
  usuarioAtv: string;
  passwordAtvCifrado: string;
  certificadoP12Cifrado: string;
  certificadoPinCifrado: string;
  certificadoNombreArchivo: string | null;
  certificadoVenceEn: string | null;
  ultimoConsecutivo: number;
  ultimoConsecutivoNc: number;
  ultimoConsecutivoNd: number;
  ultimoConsecutivoTe: number;
  // Sucursal (3 dígitos) y terminal (5) del consecutivo, y numeración mínima por tipo de documento.
  sucursal: string;
  terminal: string;
  numeracionMinimaFe: number;
  numeracionMinimaNc: number;
  numeracionMinimaNd: number;
  numeracionMinimaTe: number;
  correoAutomatico: boolean;
  configVerificada: boolean;
  configVerificadaEn: string | null;
}
let localHaciendaConfigs: LocalHaciendaConfig[] = [];
// Terceros a los que se factura por paciente (modo sin BD).
interface LocalReceptorFactura { id: number; idCompania: number; idPaciente: number; tipoIdentificacion: string; numero: string; nombre: string; correo: string | null; telefono: string | null; codigoActividad: string | null; creadoEn: string; }
let localReceptoresFactura: LocalReceptorFactura[] = [];

type CredencialesAtv = { ambiente: AmbienteHacienda; usuarioAtv: string; passwordAtv: string };
type CertificadoEmpresa = { p12Base64: string; pin: string };

/** Montos con 5 decimales, la precisión de los comprobantes de Hacienda. */
function redondearMonto(n: number): number {
  return Math.round(n * 100000) / 100000;
}


async function setupDatabase() {
  const host = process.env.DB_HOST;
  const port = parseInt(process.env.DB_PORT || "");
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD || "";
  const database = process.env.DB_NAME;

  try {
    console.log(`[MySQL] Conectando al servidor en ${host}:${port} como usuario ${user}...`);
    
    // Create connection to create database if not exists
    const initConn = await mysql.createConnection({
      host,
      port,
      user,
      password,
      connectTimeout: 5000
    });

    console.log(`[MySQL] Creando la base de datos '${database}' si no existe...`);
    await initConn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

    // El servidor tenía max_allowed_packet en el default de MySQL (1MB) — muy poco para un
    // UPDATE con el logo de empresa como data URL base64 (ver CompanySettings.tsx), que fallaba
    // en silencio. SET GLOBAL no sobrevive un reinicio de MySQL (no tenemos acceso al my.cnf del
    // servidor remoto) y — importante — tampoco actualiza el valor de sesión de conexiones que
    // ya estaban abiertas al momento de ejecutarlo. Por eso se aplica aquí, en initConn, ANTES de
    // crear el pool: así toda conexión del pool nace después del cambio y lo hereda de una vez,
    // sin arriesgarse a que quede una conexión reciclada anclada al límite viejo de 1MB.
    try {
      await initConn.query(`SET GLOBAL max_allowed_packet = 16777216`);
    } catch (err: any) {
      console.warn(`[MySQL] No se pudo elevar max_allowed_packet (¿faltan privilegios?): ${err.message}`);
    }

    await initConn.end();

    // Reconnect to the database itself with multipleStatements enabled
    pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 5000,
      multipleStatements: true,
      // Sin esto, mysql2 devuelve las columnas DECIMAL como string (p.ej. "1200.00") — rompe
      // cualquier .toLocaleString()/aritmética directa en el frontend sobre montos de
      // facturas/CXC/CXP. Los montos de esta app caben muy por debajo de Number.MAX_SAFE_INTEGER,
      // así que no hay riesgo real de pérdida de precisión de punto flotante.
      decimalNumbers: true
    });

    console.log(`[MySQL] Conexión establecida con éxito a '${database}'.`);

    console.log(`[MySQL] Verificando y poblando catálogo de ubicaciones (provincia/cantón/distrito) si está vacío...`);
    await seedUbicaciones();

    console.log(`[MySQL] Verificando y poblando datos de prueba si están vacíos...`);
    await seedDefaultData();

    dbConnected = true;
    dbError = null;
    console.log("[MySQL] ¡Todo el tratamiento de la base de datos MySQL se configuró con éxito!");
  } catch (err: any) {
    dbConnected = false;
    dbError = err.message || String(err);
    console.error("⚠️ [MySQL] No se pudo conectar a la base de datos externa:", dbError);
    console.log("[MySQL] La aplicación continuará ejecutándose utilizando almacenamiento simulado en memoria/Local.");
  }
}

// El esquema (CREATE TABLE / ALTER TABLE ... ADD COLUMN IF NOT EXISTS) que antes vivía en
// createTables() ya se aplicó por completo a la base de datos de producción (verificado
// 2026-08-05) y se retiró del proyecto a pedido explícito — la definición completa sigue
// disponible en el historial de git de este archivo si algún día hace falta reconstruir el
// esquema desde cero (backup restaurado, entorno nuevo, etc.).

// Siembra provincias/cantones/distritos desde COSTA_RICA_PROVINCIAS (fuente ya cotejada contra
// Registro Nacional/IGN/SNITCR, INEC y el catálogo v4.4 de Hacienda — ver comentario al inicio de
// src/data/costaRicaLocations.ts) si la tabla está vacía. id de cantón = provincia+código propio
// (p.ej. "101"), id de distrito = cantón+código propio (p.ej. "10101") — mismo esquema que
// POS-RESTAURANTE, y coincide con la convención de cantonId/distritoId que Patient ya usaba.
async function seedUbicaciones() {
  if (!pool) return;

  const [provRows] = await pool.query("SELECT COUNT(*) as count FROM cr_provincias");
  if ((provRows as any)[0].count > 0) return;

  console.log("[MySQL] Sembrando catálogo de provincias/cantones/distritos...");
  for (const provincia of COSTA_RICA_PROVINCIAS) {
    await pool.query("INSERT INTO cr_provincias (codigo, nombre) VALUES (?, ?)", [provincia.codigo, provincia.nombre]);
    for (const canton of provincia.cantones) {
      const cantonId = `${provincia.codigo}${canton.codigo}`;
      await pool.query(
        "INSERT INTO cr_cantones (id, provinciaCodigo, codigo, nombre) VALUES (?, ?, ?, ?)",
        [cantonId, provincia.codigo, canton.codigo, canton.nombre]
      );
      for (const distrito of canton.distritos) {
        const distritoId = `${cantonId}${distrito.codigo}`;
        await pool.query(
          "INSERT INTO cr_distritos (id, cantonId, codigo, nombre) VALUES (?, ?, ?, ?)",
          [distritoId, cantonId, distrito.codigo, distrito.nombre]
        );
      }
    }
  }
  console.log("[MySQL] Catálogo de ubicaciones sembrado con éxito.");
}

async function seedDefaultData() {
  if (!pool) return;

  const [companiesRows] = await pool.query("SELECT COUNT(*) as count FROM companias");
  if ((companiesRows as any)[0].count === 0) {
    console.log("[MySQL] Seeding default companies...");
    for (const c of defaultCompanies) {
      await pool.query(
        "INSERT INTO companias (id, nombreComercial, razonSocial, tipoIdentificacion, identificacion, correoEmisor, ivaPorDefecto, colorPrimario, colorSidebar, logoUrl, actividadEconomica, perfilCompania) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [c.id, c.nombreComercial, c.razonSocial, c.tipoIdentificacion, c.identificacion, c.correoEmisor, c.ivaPorDefecto, c.colorPrimario, c.colorSidebar, c.logoUrl, c.actividadEconomica, c.perfilCompania]
      );
    }
  }

  const [usersRows] = await pool.query("SELECT COUNT(*) as count FROM usuarios");
  if ((usersRows as any)[0].count === 0) {
    console.log("[MySQL] Seeding default users...");
    for (const u of defaultUsers) {
      await pool.query(
        "INSERT INTO usuarios (id, idCompania, nombre, usuario, correo, contrasena, rol) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [u.id, u.idCompania, u.nombre, u.usuario, u.correo, u.contrasena, u.rol]
      );
    }
  }

  const [patientsRows] = await pool.query("SELECT COUNT(*) as count FROM pacientes");
  if ((patientsRows as any)[0].count === 0) {
    console.log("[MySQL] Seeding default patients...");
    for (const p of defaultPatients) {
      await pool.query(
        "INSERT INTO pacientes (id, idCompania, nombreCompleto, fechaNacimiento, edad, ocupacion, correoElectronico, situacionVivienda, tipoIdentificacion, identificacion, telefono, provinciaId, cantonId, distritoId, otrasSenas, diabetes, hipertension, gastritis, estrenimiento, alergiasAlimentarias, fracturas, esguinces, cirugiasOrtopedicas, actividadFisica) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [p.id, p.idCompania, p.nombreCompleto, p.fechaNacimiento, p.edad, p.ocupacion, p.correoElectronico, p.situacionVivienda, p.tipoIdentificacion, p.identificacion, p.telefono, p.provinciaId, p.cantonId, p.distritoId, p.otrasSenas, p.diabetes ? 1 : 0, p.hipertension ? 1 : 0, p.gastritis ? 1 : 0, p.estrenimiento ? 1 : 0, p.alergiasAlimentarias, p.fracturas, p.esguinces, p.cirugiasOrtopedicas, p.actividadFisica]
      );
    }
  }

  const [consultationsRows] = await pool.query("SELECT COUNT(*) as count FROM consultas");
  if ((consultationsRows as any)[0].count === 0) {
    console.log("[MySQL] Seeding default consultations...");
    for (const con of defaultConsultations) {
      await pool.query(
        "INSERT INTO consultas (id, idPaciente, idCompania, fecha, tipo, motivo, horasSueno, compromiso, anotacionesGenerales) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [con.id, con.idPaciente, con.idCompania, con.fecha, con.tipo, con.motivo, con.horasSueno, con.compromiso, con.anotacionesGenerales]
      );
    }
  }

  const [citasRows] = await pool.query("SELECT COUNT(*) as count FROM citas");
  if ((citasRows as any)[0].count === 0) {
    console.log("[MySQL] Seeding default appointments...");
    for (const ct of defaultCitas) {
      await pool.query(
        "INSERT INTO citas (id, idCompania, idPaciente, idUsuarioNutricionista, idConsulta, fechaHora, duracionMinutos, estadoCita, notas, confirmacionEnviadaEn, recordatorioEnviadoEn, cancelacionEnviadaEn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [ct.id, ct.idCompania, ct.idPaciente, ct.idUsuarioNutricionista, ct.idConsulta || null, ct.fechaHora, ct.duracionMinutos, ct.estadoCita, ct.notas || '', ct.confirmacionEnviadaEn || null, ct.recordatorioEnviadoEn || null, ct.cancelacionEnviadaEn || null]
      );
    }
  }

  const [smtpRows] = await pool.query("SELECT COUNT(*) as count FROM compania_smtp_config");
  if ((smtpRows as any)[0].count === 0) {
    console.log("[MySQL] Seeding default SMTP configs...");
    for (const s of defaultSmtpConfigs) {
      await pool.query(
        "INSERT INTO compania_smtp_config (id, idCompania, proveedor, smtpHost, smtpPort, smtpSeguridad, smtpUsuario, smtpPasswordCifrado, remitenteNombre, remitenteCorreo, recordatorioHorasAntes, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [s.id, s.idCompania, s.proveedor, s.smtpHost, s.smtpPort, s.smtpSeguridad, s.smtpUsuario, s.smtpPasswordCifrado, s.remitenteNombre, s.remitenteCorreo, s.recordatorioHorasAntes, s.activo ? 1 : 0]
      );
    }
  }

  const [logRows] = await pool.query("SELECT COUNT(*) as count FROM notification_logs");
  if ((logRows as any)[0].count === 0) {
    console.log("[MySQL] Seeding default notification logs...");
    for (const l of defaultNotificationLogs) {
      await pool.query(
        "INSERT INTO notification_logs (id, idCompania, idCita, tipo, destinatario, asunto, cuerpo, enviadoEn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [l.id, l.idCompania, l.idCita, l.tipo, l.destinatario, l.asunto, l.cuerpo, l.enviadoEn]
      );
    }
  }
}

const DIAS_SEMANA: Array<keyof HorarioAtencion> = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];

function horarioDelDia(horario: HorarioAtencion | string | null | undefined, fecha: string): { abre: string | null; cierra: string | null } {
  // mysql2 puede devolver la columna JSON como string sin parsear según el
  // driver/versión; se acepta ambas formas aquí en vez de asumir una.
  const parsed = typeof horario === "string" ? JSON.parse(horario) : horario;
  const efectivo: HorarioAtencion = parsed || DEFAULT_HORARIO_ATENCION;
  const diaSemana = DIAS_SEMANA[new Date(`${fecha}T00:00:00`).getDay()];
  return efectivo[diaSemana];
}

// Tramos de atención de un día para un tipo de visita. Para DOMICILIO, si la empresa configuró un
// horario propio (algún tramo en la semana) se usa ese (puede ser [] = sin atención ese día); en
// cualquier otro caso se usa el horario de atención general (un único tramo, o [] si cerrado).
function tramosDelDia(
  company: { horarioAtencion?: HorarioAtencion | string | null; horarioDomicilio?: HorarioDomicilio | null } | undefined,
  fecha: string,
  tipoVisita: "CONSULTORIO" | "DOMICILIO"
): Array<{ abre: string; cierra: string }> {
  const hd = company?.horarioDomicilio;
  if (tipoVisita === "DOMICILIO" && hd && HORARIO_DIAS.some(d => (hd[d]?.length ?? 0) > 0)) {
    const diaSemana = DIAS_SEMANA[new Date(`${fecha}T00:00:00`).getDay()];
    return [...(hd[diaSemana] ?? [])].sort((a, b) => (a.abre < b.abre ? -1 : a.abre > b.abre ? 1 : 0));
  }
  const { abre, cierra } = horarioDelDia(company?.horarioAtencion, fecha);
  return abre && cierra ? [{ abre, cierra }] : [];
}

function generarSlotsCandidatos(tramos: Array<{ abre: string; cierra: string }>): string[] {
  const slots = new Set<string>();
  for (const { abre, cierra } of tramos) {
    let [h, m] = abre.split(":").map(Number);
    const [hFin, mFin] = cierra.split(":").map(Number);
    while (h < hFin || (h === hFin && m < mFin)) {
      slots.add(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      m += 30;
      if (m >= 60) { m -= 60; h += 1; }
    }
  }
  return [...slots].sort();
}

const DURACION_POR_TIPO_VISITA: Record<"CONSULTORIO" | "DOMICILIO", number> = {
  CONSULTORIO: 45,
  DOMICILIO: 60
};

// slotLibre / haySolapeConCitas / validarTransicionEstado viven en server/citasReglas.ts (puras y
// con tests). Las citas CANCELADAS no ocupan agenda.

// Error con código HTTP para abortar POST /api/citas desde dentro de la transacción.
class CitaError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Campos de contacto de un paciente existente que están vacíos y que la solicitud pública puede
// completar. Nunca devuelve campos que ya tienen valor (columnas fijas: seguras para SQL).
function camposVaciosDelPaciente(existente: any, enviado: any): Record<string, any> {
  const resultado: Record<string, any> = {};
  for (const campo of ["nombreCompleto", "correoElectronico", "telefono", "tipoIdentificacion", "fechaNacimiento"]) {
    const actual = existente?.[campo];
    const vacio = actual == null || (typeof actual === "string" && actual.trim() === "");
    const nuevo = enviado?.[campo];
    if (vacio && typeof nuevo === "string" && nuevo.trim() !== "") resultado[campo] = nuevo.trim();
  }
  return resultado;
}

// Un paciente nuevo sí necesita todos sus datos de contacto (uno existente no los envía).
function validarDatosPacienteNuevo(pac: any): void {
  for (const campo of ["identificacion", "nombreCompleto", "correoElectronico", "telefono", "tipoIdentificacion", "fechaNacimiento"]) {
    if (typeof pac?.[campo] !== "string" || pac[campo].trim() === "") {
      throw new CitaError(400, "Faltan datos del paciente: nombre, correo, teléfono y fecha de nacimiento son obligatorios.");
    }
  }
}

// Límite por IP en memoria para la consulta pública de pacientes por cédula (anti-enumeración).
const CONSULTA_PACIENTE_MAX = 20;
const CONSULTA_PACIENTE_VENTANA_MS = 15 * 60 * 1000;
const consultasPacientePorIp = new Map<string, { desde: number; cuenta: number }>();
function excedeLimiteConsultaPaciente(ip: string): boolean {
  const ahora = Date.now();
  if (consultasPacientePorIp.size > 5000) {
    for (const [k, v] of consultasPacientePorIp) if (ahora - v.desde > CONSULTA_PACIENTE_VENTANA_MS) consultasPacientePorIp.delete(k);
  }
  const e = consultasPacientePorIp.get(ip);
  if (!e || ahora - e.desde > CONSULTA_PACIENTE_VENTANA_MS) {
    consultasPacientePorIp.set(ip, { desde: ahora, cuenta: 1 });
    return false;
  }
  e.cuenta += 1;
  return e.cuenta > CONSULTA_PACIENTE_MAX;
}

// `ownIdColumn` es obligatorio a propósito: antes esta función adivinaba probando
// id_usuario/id_paciente/id_consulta/id_cita/id_servicio/id_factura/id_compania en un orden
// fijo y usaba la primera que no fuera null. Eso rompía cualquier tabla que tuviera SU PROPIA
// pk y ADEMÁS una FK hacia otra tabla con nombre anterior en esa lista — p.ej. una fila de
// `consultas` trae tanto `id_consulta` (su pk real) como `id_paciente` (FK al paciente); como
// `id_paciente` se probaba antes, `.id` terminaba siendo el id del PACIENTE, no el de la
// consulta (bug real: "Reabrir Consulta" fallaba con 404 en la segunda llamada porque el
// frontend mandaba el id equivocado). Al exigir la columna aquí, TypeScript obliga a declarar
// explícitamente cuál es la pk propia de cada tabla en cada punto de uso.
function normalizeRow(row: any, ownIdColumn: string): any {
  if (!row) return row;
  const copy = { ...row };

  if (copy[ownIdColumn] != null && copy.id == null) copy.id = copy[ownIdColumn];

  // Tras la Fase 5 ya no hay columnas duplicadas que traducir: cada concepto vive en una sola
  // columna, con el nombre camelCase que usa la app. Lo único que sigue haciendo esta función es
  // exponer la pk propia de cada tabla (que sí conserva su nombre snake_case) como `.id`.

  return copy;
}

// --- Normalización Fase 2: evaluacion_antropometrica/bioquimica/dietetica ---
// Estas 3 tablas legadas de ConsultorioDB_schema.sql calzan campo por campo (mismo nombre) con
// lo que la app ya guardaba como JSON en consultas.evaluacionAntropometrica/Bioquimica/Dietetica
// — por eso no hace falta traducir nombres, solo mover el storage de columna JSON a tabla propia.
// `porcentaje_grasa_corporal` se agregó en Fase 3: es el único campo del antiguo JSON
// consultas.antropometria que no existía ya aquí ("Grasa Corporal (%)" del formulario es un
// input distinto de "Grasa Balanza (%)" → porcentaje_grasa_balanza). Los otros 8 campos de ese
// JSON eran duplicados literales de columnas de esta tabla — ver reconstruirEvaluaciones.
const EVAL_ANTROPOMETRICA_COLS = ['peso', 'talla', 'imc', 'c_muneca', 'porcentaje_grasa_balanza',
  'porcentaje_grasa_corporal', 'grasa_visceral',
  'porcentaje_agua', 'masa_muscular', 'kg_magros', 'masa_osea', 'tmb', 'edad_metabolica', 'cintura',
  'circunferencia_abdominal', 'pliegue_triceps', 'pliegue_subescapular', 'pliegue_biceps', 'pliegue_cresta_iliaca',
  'pliegue_supraespinal', 'pliegue_abdominal', 'pliegue_muslo_medio', 'pliegue_pierna_medial',
  'perimetro_brazo_relajado', 'perimetro_brazo_contraido'];
const EVAL_BIOQUIMICA_COLS = ['indice_homa', 'hb1ac_glicosilada', 'vit_d', 'glicemia', 'insulinemia', 'hematocrito',
  'hemoglobina', 'albumina', 'acido_urico', 'trigliceridos', 'colesterol_total', 'colesterol_hdl', 'colesterol_ldl',
  'intolerancias_alimentarias', 'alergias'];
const EVAL_DIETETICA_COLS = ['tiempos_comida', 'lugar_consumo', 'quien_prepara', 'calificacion_apetito', 'tipo_grasas',
  'coccion_asado', 'coccion_fritura', 'coccion_hervido', 'coccion_plancha', 'coccion_vapor', 'coccion_freidora_aire',
  'agrega_sal', 'consume_azucar', 'utiliza_edulcorante', 'dietas_anteriores', 'consume_agua', 'cantidad_agua',
  'alimentos_no_consume', 'alimentos_preferidos'];
const EVAL_DIETETICA_BOOL_COLS = new Set(['coccion_asado', 'coccion_fritura', 'coccion_hervido', 'coccion_plancha',
  'coccion_vapor', 'coccion_freidora_aire', 'agrega_sal', 'consume_azucar', 'utiliza_edulcorante', 'consume_agua']);

// --- Normalización Fase 2b: composicion_segmentada ---
// Tabla legada EAV: "Grasa" y "Musculo" son dos filas separadas (tipo_medicion), no un objeto
// con ambos como en el JSON — de ahí los dos alias de JOIN (cg/cm) en vez de uno solo.
const COMPOSICION_COLS = ['total', 'mano_izquierda', 'mano_derecha', 'pierna_derecha', 'pierna_izquierda', 'tronco'];

// --- Normalización Fase 2c: estilo_vida ---
// La tabla legada originalmente tenía PRIMARY KEY (id_paciente) — un registro por paciente para
// siempre — pero la app guarda esto por consulta (verificado: una consulta nueva no hereda el
// estiloVida de una anterior). Se alteró la tabla (ver .scratch/apply_fase2c.cjs) para tener
// UNIQUE KEY (id_consulta) en su lugar, preservando el comportamiento actual exacto.
const ESTILO_VIDA_COLS = ['realiza_ejercicio', 'tiempo_entrenar', 'hace_cuanto_entrena', 'hora_entreno',
  'tipo_ejercicio', 'frecuencia_ejercicio_semana', 'duracion_ejercicio', 'suplementos', 'consume_alcohol',
  'tipo_alcohol', 'frecuencia_alcohol', 'cantidad_alcohol', 'fuma', 'frecuencia_fumado', 'cantidad_fumado'];
const ESTILO_VIDA_BOOL_COLS = new Set(['realiza_ejercicio', 'consume_alcohol', 'fuma']);

// --- Normalización Fase 2d: dietas_recetas ---
// A diferencia de las 3 evaluaciones (mismo nombre de campo), aquí sí hay que traducir: la tabla
// legada usa comida_1_desayuno/etc. (nombres del esquema original) donde el JSON usa
// desayuno/etc. prescripcionCalorica/macros no tenían columna en absoluto — se agregaron 12
// columnas nuevas (ver .scratch/apply_fase2d.cjs) porque esos dos sub-objetos se sumaron a
// `dieta` en una sesión posterior a la creación del esquema legado.
const DIETA_COMIDA_MAP: [string, string][] = [
  ['totalCalorias', 'total_calorias'], ['desayuno', 'comida_1_desayuno'], ['meriendaManana', 'comida_2_merienda_manana'],
  ['almuerzo', 'comida_3_almuerzo'], ['meriendaTarde', 'comida_4_merienda_tarde'], ['cena', 'comida_5_cena'],
  ['indicaciones', 'indicaciones_adicionales']
];
const DIETA_PRESCRIPCION_MAP: [string, string][] = [
  ['formula', 'formula'], ['tmb', 'tmb'], ['diasDescanso', 'dias_descanso'], ['diasEntrenamiento', 'dias_entrenamiento'],
  ['factorActividadDescanso', 'factor_actividad_descanso'], ['factorActividadEntreno', 'factor_actividad_entreno'],
  ['promedioMantenimiento', 'promedio_mantenimiento'], ['direccion', 'direccion'], ['porcentaje', 'porcentaje']
];
const DIETA_MACRO_MAP: [string, string][] = [
  ['carbohidratosPct', 'macro_carbohidratos_pct'], ['proteinasPct', 'macro_proteinas_pct'], ['grasasPct', 'macro_grasas_pct']
];

// --- Normalización Fase 2e: fisioterapia_evaluaciones ---
// Sin tabla legada equivalente — se creó una tabla nueva (ver .scratch/apply_fase2e.cjs). A
// diferencia de las 3 evaluaciones de Fase 2 (mismo nombre de campo), aquí sí hay que traducir
// camelCase → snake_case porque es una tabla propia de esta app, no heredada.
const FISIOTERAPIA_MAP: [string, string][] = [
  ['mecanismoLesion', 'mecanismo_lesion'], ['diagnosticoMedico', 'diagnostico_medico'], ['evaDolor', 'eva_dolor'],
  ['zonaDolor', 'zona_dolor'], ['tipoDolor', 'tipo_dolor'], ['factoresAgravantes', 'factores_agravantes'],
  ['factoresAtenuantes', 'factores_atenuantes'], ['posturaObservaciones', 'postura_observaciones'],
  ['palpacionHallazgos', 'palpacion_hallazgos'], ['romMedido', 'rom_medido'], ['fuerzaDaniels', 'fuerza_daniels'],
  ['pruebasEspeciales', 'pruebas_especiales'], ['agentesFisicos', 'agentes_fisicos'], ['terapiaManual', 'terapia_manual'],
  ['ejercicioTerapeutico', 'ejercicio_terapeutico'], ['sesionesSugeridas', 'sesiones_sugeridas'],
  ['soapSubjetivo', 'soap_subjetivo'], ['soapObjetivo', 'soap_objetivo'], ['soapAnalisis', 'soap_analisis'],
  ['soapPlan', 'soap_plan']
];

const CONSULTA_EVAL_SELECT = [
  'c.*',
  ...EVAL_ANTROPOMETRICA_COLS.map(col => `ea.${col} AS ea_${col}`),
  ...EVAL_BIOQUIMICA_COLS.map(col => `eb.${col} AS eb_${col}`),
  ...EVAL_DIETETICA_COLS.map(col => `ed.${col} AS ed_${col}`),
  ...COMPOSICION_COLS.map(col => `cg.${col} AS cg_${col}`), 'cg.calificacion_grasa AS cg_calificacion_grasa',
  ...COMPOSICION_COLS.map(col => `cm.${col} AS cm_${col}`),
  ...ESTILO_VIDA_COLS.map(col => `ev.${col} AS ev_${col}`),
  ...[...DIETA_COMIDA_MAP, ...DIETA_PRESCRIPCION_MAP, ...DIETA_MACRO_MAP].map(([, col]) => `dr.${col} AS dr_${col}`),
  ...FISIOTERAPIA_MAP.map(([, col]) => `fi.${col} AS fi_${col}`)
].join(', ');

const CONSULTA_EVAL_JOIN = "LEFT JOIN evaluacion_antropometrica ea ON ea.id_consulta = c.id_consulta " +
  "LEFT JOIN evaluacion_bioquimica eb ON eb.id_consulta = c.id_consulta " +
  "LEFT JOIN evaluacion_dietetica ed ON ed.id_consulta = c.id_consulta " +
  "LEFT JOIN composicion_segmentada cg ON cg.id_consulta = c.id_consulta AND cg.tipo_medicion = 'Grasa' " +
  "LEFT JOIN composicion_segmentada cm ON cm.id_consulta = c.id_consulta AND cm.tipo_medicion = 'Musculo' " +
  "LEFT JOIN estilo_vida ev ON ev.id_consulta = c.id_consulta " +
  "LEFT JOIN dietas_recetas dr ON dr.id_consulta = c.id_consulta " +
  "LEFT JOIN fisioterapia_evaluaciones fi ON fi.id_consulta = c.id_consulta";

// Reconstruye los objetos anidados que el frontend espera a partir de las columnas con
// prefijo (ea_/eb_/ed_/cg_/cm_/ev_/dr_/fi_) que trae una fila leída con CONSULTA_EVAL_SELECT + CONSULTA_EVAL_JOIN.
// Devuelve `undefined` para el objeto completo si la consulta no tiene fila en esa tabla hija
// (LEFT JOIN sin match trae todas sus columnas en NULL) — mismo comportamiento que un JSON `null`.
function reconstruirEvaluaciones(row: any): {
  evaluacionAntropometrica: any; evaluacionBioquimica: any; evaluacionDietetica: any; composicionSegmentada: any; estiloVida: any; dieta: any; fisioterapia: any; antropometria: any;
} {
  const pick = (prefix: string, cols: string[], boolCols?: Set<string>) => {
    const hasAny = cols.some(c => row[`${prefix}_${c}`] != null);
    if (!hasAny) return undefined;
    const obj: any = {};
    for (const c of cols) {
      const v = row[`${prefix}_${c}`];
      obj[c] = boolCols?.has(c) ? (v == null ? undefined : Boolean(v)) : v;
    }
    return obj;
  };
  const grasa = pick('cg', [...COMPOSICION_COLS, 'calificacion_grasa']);
  const musculo = pick('cm', COMPOSICION_COLS);

  const pickMapped = (prefix: string, map: [string, string][]) => {
    const hasAny = map.some(([, col]) => row[`${prefix}_${col}`] != null);
    if (!hasAny) return undefined;
    const obj: any = {};
    for (const [jsonKey, col] of map) obj[jsonKey] = row[`${prefix}_${col}`];
    return obj;
  };
  const dietaBase = pickMapped('dr', DIETA_COMIDA_MAP);
  const dieta = dietaBase ? {
    ...dietaBase,
    prescripcionCalorica: pickMapped('dr', DIETA_PRESCRIPCION_MAP),
    macros: pickMapped('dr', DIETA_MACRO_MAP)
  } : undefined;

  // `antropometria` (Fase 3) no tiene tabla propia: es una vista derivada de las mismas columnas
  // de evaluacion_antropometrica que ya trae el JOIN. Antes era una columna JSON aparte que
  // duplicaba 8 de estos 9 campos y podía divergir; ahora ambas formas leen la misma fila.
  const ea = pick('ea', EVAL_ANTROPOMETRICA_COLS);
  const antropometria = ea ? {
    peso: ea.peso,
    talla: ea.talla,
    imc: ea.imc,
    grasaCorporal: ea.porcentaje_grasa_corporal,
    grasaVisceral: ea.grasa_visceral,
    masaMuscular: ea.masa_muscular,
    masaOsea: ea.masa_osea,
    cintura: ea.cintura,
    abdominal: ea.circunferencia_abdominal
  } : undefined;

  return {
    evaluacionAntropometrica: ea,
    evaluacionBioquimica: pick('eb', EVAL_BIOQUIMICA_COLS),
    evaluacionDietetica: pick('ed', EVAL_DIETETICA_COLS, EVAL_DIETETICA_BOOL_COLS),
    composicionSegmentada: (grasa || musculo) ? { grasa, musculo } : undefined,
    estiloVida: pick('ev', ESTILO_VIDA_COLS, ESTILO_VIDA_BOOL_COLS),
    dieta,
    fisioterapia: pickMapped('fi', FISIOTERAPIA_MAP),
    antropometria
  };
}

// Upsert/borrado de las 3 evaluaciones dentro de la misma transacción que guarda `consultas` —
// si con.evaluacionXxx viene null/ausente se borra la fila (equivalente a guardar JSON `null`).
async function guardarEvaluacionesConsulta(connection: any, idConsulta: number, con: any): Promise<void> {
  const ea = con.evaluacionAntropometrica;
  if (ea) {
    await connection.query(
      `INSERT INTO evaluacion_antropometrica (id_consulta, ${EVAL_ANTROPOMETRICA_COLS.join(', ')})
       VALUES (?, ${EVAL_ANTROPOMETRICA_COLS.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${EVAL_ANTROPOMETRICA_COLS.map(c => `${c} = VALUES(${c})`).join(', ')}`,
      [idConsulta, ...EVAL_ANTROPOMETRICA_COLS.map(c => {
        // "Grasa Corporal (%)" es el único campo del antiguo JSON que no estaba ya en esta tabla.
        // El formulario lo manda dentro de con.antropometria, así que esa forma tiene precedencia:
        // es la que el usuario edita. Se acepta también dentro de evaluacionAntropometrica para no
        // atarnos a esa forma, pero como fallback — si ganara, un round-trip leer→modificar→guardar
        // reescribiría el valor viejo que el GET devolvió, descartando el cambio del usuario.
        // Los otros 8 campos de con.antropometria se ignoran: duplican columnas de esta tabla.
        if (c === 'porcentaje_grasa_corporal') {
          return con.antropometria?.grasaCorporal ?? ea.porcentaje_grasa_corporal ?? null;
        }
        return ea[c] ?? null;
      })]
    );
  } else {
    await connection.query("DELETE FROM evaluacion_antropometrica WHERE id_consulta = ?", [idConsulta]);
  }

  const eb = con.evaluacionBioquimica;
  if (eb) {
    await connection.query(
      `INSERT INTO evaluacion_bioquimica (id_consulta, ${EVAL_BIOQUIMICA_COLS.join(', ')})
       VALUES (?, ${EVAL_BIOQUIMICA_COLS.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${EVAL_BIOQUIMICA_COLS.map(c => `${c} = VALUES(${c})`).join(', ')}`,
      [idConsulta, ...EVAL_BIOQUIMICA_COLS.map(c => eb[c] ?? null)]
    );
  } else {
    await connection.query("DELETE FROM evaluacion_bioquimica WHERE id_consulta = ?", [idConsulta]);
  }

  const ed = con.evaluacionDietetica;
  if (ed) {
    await connection.query(
      `INSERT INTO evaluacion_dietetica (id_consulta, ${EVAL_DIETETICA_COLS.join(', ')})
       VALUES (?, ${EVAL_DIETETICA_COLS.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${EVAL_DIETETICA_COLS.map(c => `${c} = VALUES(${c})`).join(', ')}`,
      [idConsulta, ...EVAL_DIETETICA_COLS.map(c => {
        const v = ed[c];
        return typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? null);
      })]
    );
  } else {
    await connection.query("DELETE FROM evaluacion_dietetica WHERE id_consulta = ?", [idConsulta]);
  }

  const cs = con.composicionSegmentada;
  const grasa = cs?.grasa;
  if (grasa) {
    await connection.query(
      `INSERT INTO composicion_segmentada (id_consulta, tipo_medicion, ${COMPOSICION_COLS.join(', ')}, calificacion_grasa)
       VALUES (?, 'Grasa', ${COMPOSICION_COLS.map(() => '?').join(', ')}, ?)
       ON DUPLICATE KEY UPDATE ${COMPOSICION_COLS.map(c => `${c} = VALUES(${c})`).join(', ')}, calificacion_grasa = VALUES(calificacion_grasa)`,
      [idConsulta, ...COMPOSICION_COLS.map(c => grasa[c] ?? null), grasa.calificacion_grasa ?? null]
    );
  } else {
    await connection.query("DELETE FROM composicion_segmentada WHERE id_consulta = ? AND tipo_medicion = 'Grasa'", [idConsulta]);
  }

  const musculo = cs?.musculo;
  if (musculo) {
    await connection.query(
      `INSERT INTO composicion_segmentada (id_consulta, tipo_medicion, ${COMPOSICION_COLS.join(', ')})
       VALUES (?, 'Musculo', ${COMPOSICION_COLS.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${COMPOSICION_COLS.map(c => `${c} = VALUES(${c})`).join(', ')}`,
      [idConsulta, ...COMPOSICION_COLS.map(c => musculo[c] ?? null)]
    );
  } else {
    await connection.query("DELETE FROM composicion_segmentada WHERE id_consulta = ? AND tipo_medicion = 'Musculo'", [idConsulta]);
  }

  const ev = con.estiloVida;
  if (ev) {
    await connection.query(
      `INSERT INTO estilo_vida (id_paciente, id_consulta, ${ESTILO_VIDA_COLS.join(', ')})
       VALUES (?, ?, ${ESTILO_VIDA_COLS.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${ESTILO_VIDA_COLS.map(c => `${c} = VALUES(${c})`).join(', ')}`,
      [parseInt(con.idPaciente), idConsulta, ...ESTILO_VIDA_COLS.map(c => {
        const v = ev[c];
        return typeof v === 'boolean' ? (v ? 1 : 0) : (v ?? null);
      })]
    );
  } else {
    await connection.query("DELETE FROM estilo_vida WHERE id_consulta = ?", [idConsulta]);
  }

  const dieta = con.dieta;
  if (dieta) {
    const mapaCompleto = [...DIETA_COMIDA_MAP, ...DIETA_PRESCRIPCION_MAP, ...DIETA_MACRO_MAP];
    const cols = mapaCompleto.map(([, col]) => col);
    const valores = mapaCompleto.map(([jsonKey, col]) => {
      const v = col.startsWith('macro_') ? dieta.macros?.[jsonKey]
        : DIETA_PRESCRIPCION_MAP.some(([k]) => k === jsonKey) ? dieta.prescripcionCalorica?.[jsonKey]
        : dieta[jsonKey];
      return v ?? null;
    });
    await connection.query(
      `INSERT INTO dietas_recetas (id_paciente, id_consulta, ${cols.join(', ')})
       VALUES (?, ?, ${cols.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${cols.map(c => `${c} = VALUES(${c})`).join(', ')}`,
      [parseInt(con.idPaciente), idConsulta, ...valores]
    );
  } else {
    await connection.query("DELETE FROM dietas_recetas WHERE id_consulta = ?", [idConsulta]);
  }

  const fisio = con.fisioterapia;
  if (fisio) {
    const cols = FISIOTERAPIA_MAP.map(([, col]) => col);
    const valores = FISIOTERAPIA_MAP.map(([jsonKey]) => fisio[jsonKey] ?? null);
    await connection.query(
      `INSERT INTO fisioterapia_evaluaciones (id_consulta, ${cols.join(', ')})
       VALUES (?, ${cols.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${cols.map(c => `${c} = VALUES(${c})`).join(', ')}`,
      [idConsulta, ...valores]
    );
  } else {
    await connection.query("DELETE FROM fisioterapia_evaluaciones WHERE id_consulta = ?", [idConsulta]);
  }
}

// --- Normalización Fase 2e: compania_horario_atencion ---
// Sin tabla legada. A diferencia de las tablas de consultas, `companias` se lee en 17 sitios
// distintos de este archivo pero solo 2 consumen horarioAtencion — por eso esto NO se integra al
// JOIN genérico de consultas; es un fetch puntual que se llama solo donde hace falta.
const HORARIO_DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'] as const;

async function fetchHorarioAtencionCompania(idCompania: number): Promise<any> {
  if (!pool) return undefined;
  const [rows] = await pool.query("SELECT * FROM compania_horario_atencion WHERE id_compania = ?", [idCompania]);
  const row = (rows as any[])[0];
  if (!row) return undefined;
  const horario: any = {};
  for (const dia of HORARIO_DIAS) {
    horario[dia] = { abre: row[`${dia}_abre`], cierra: row[`${dia}_cierra`] };
  }
  return horario;
}

async function guardarHorarioAtencionCompania(connection: any, idCompania: number, horario: any): Promise<void> {
  if (!horario) {
    await connection.query("DELETE FROM compania_horario_atencion WHERE id_compania = ?", [idCompania]);
    return;
  }
  const cols: string[] = [];
  const valores: any[] = [];
  for (const dia of HORARIO_DIAS) {
    cols.push(`${dia}_abre`, `${dia}_cierra`);
    valores.push(horario[dia]?.abre ?? null, horario[dia]?.cierra ?? null);
  }
  await connection.query(
    `INSERT INTO compania_horario_atencion (id_compania, ${cols.join(', ')})
     VALUES (?, ${cols.map(() => '?').join(', ')})
     ON DUPLICATE KEY UPDATE ${cols.map(c => `${c} = VALUES(${c})`).join(', ')}`,
    [idCompania, ...valores]
  );
}

// --- Horario propio (fraccionado) para citas a domicilio: compania_horario_domicilio ---
// Una fila por tramo (id_compania, dia, abre, cierra). Si la tabla aún no existe (migración sin
// aplicar), la lectura devuelve null y la escritura se omite sin romper el guardado de la empresa.
class HorarioDomicilioInvalidoError extends Error {}

const HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizarHorarioDomicilio(h: any): HorarioDomicilio | null {
  if (h == null) return null;
  if (typeof h !== "object" || Array.isArray(h)) throw new HorarioDomicilioInvalidoError("Horario a domicilio inválido.");
  const resultado = {} as HorarioDomicilio;
  for (const dia of HORARIO_DIAS) {
    const tramosEntrada = h[dia] ?? [];
    if (!Array.isArray(tramosEntrada)) throw new HorarioDomicilioInvalidoError(`Horario a domicilio inválido para ${dia}.`);
    const tramos = tramosEntrada.map((t: any) => ({ abre: String(t?.abre ?? ""), cierra: String(t?.cierra ?? "") }));
    for (const t of tramos) {
      if (!HHMM_REGEX.test(t.abre) || !HHMM_REGEX.test(t.cierra)) {
        throw new HorarioDomicilioInvalidoError(`Horario a domicilio (${dia}): use el formato HH:MM.`);
      }
      if (t.abre >= t.cierra) {
        throw new HorarioDomicilioInvalidoError(`Horario a domicilio (${dia}): la hora de apertura debe ser menor que la de cierre.`);
      }
    }
    tramos.sort((a: any, b: any) => (a.abre < b.abre ? -1 : a.abre > b.abre ? 1 : 0));
    for (let i = 1; i < tramos.length; i++) {
      if (tramos[i].abre < tramos[i - 1].cierra) {
        throw new HorarioDomicilioInvalidoError(`Horario a domicilio (${dia}): los tramos no pueden solaparse.`);
      }
    }
    resultado[dia] = tramos;
  }
  return resultado;
}

async function fetchHorarioDomicilioCompania(idCompania: number): Promise<HorarioDomicilio | null> {
  if (!pool) return null;
  let rows: any[];
  try {
    [rows] = (await pool.query("SELECT dia, abre, cierra FROM compania_horario_domicilio WHERE id_compania = ? ORDER BY abre", [idCompania])) as any;
  } catch (err: any) {
    if (err?.code === "ER_NO_SUCH_TABLE") return null;
    throw err;
  }
  if (rows.length === 0) return null;
  const horario = {} as HorarioDomicilio;
  for (const dia of HORARIO_DIAS) horario[dia] = [];
  for (const row of rows) {
    if ((HORARIO_DIAS as readonly string[]).includes(row.dia)) {
      horario[row.dia as DiaSemana].push({ abre: row.abre, cierra: row.cierra });
    }
  }
  return horario;
}

// `horario` ya debe venir validado con normalizarHorarioDomicilio. null = borrar (usar horario de atención).
async function guardarHorarioDomicilioCompania(idCompania: number, horario: HorarioDomicilio | null): Promise<void> {
  if (!pool) return;
  let connection: any;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
    await connection.query("DELETE FROM compania_horario_domicilio WHERE id_compania = ?", [idCompania]);
    if (horario) {
      for (const dia of HORARIO_DIAS) {
        for (const t of horario[dia] ?? []) {
          await connection.query(
            "INSERT INTO compania_horario_domicilio (id_compania, dia, abre, cierra) VALUES (?, ?, ?, ?)",
            [idCompania, dia, t.abre, t.cierra]
          );
        }
      }
    }
    await connection.commit();
  } catch (err: any) {
    if (connection) { try { await connection.rollback(); } catch { /* sin transacción activa */ } }
    if (err?.code === "ER_NO_SUCH_TABLE") {
      console.warn("[horario-domicilio] La tabla compania_horario_domicilio no existe; se omite el guardado del horario a domicilio. Aplique la migración SQL.");
      return;
    }
    throw err;
  } finally {
    if (connection) connection.release();
  }
}

// --- Normalización Fase 2: factura_lineas ---
// Varios campos de la línea son derivables (ver server/haciendaFactura.ts::calcularLineas:
// subTotal = montoTotal − descuento, baseImponible === subTotal, impuestoNeto === montoIva) — se
// reconstruyen aquí en vez de tener columna propia. `numeroLinea` se deriva del orden de inserción.
function reconstruirLineaFactura(row: any, numeroLinea: number): any {
  const montoTotal = Number(row.monto_total);
  const montoIva = Number(row.monto_iva);
  const montoDescuento = Number(row.monto_descuento) || 0;
  const subTotal = redondearMonto(montoTotal - montoDescuento);
  return {
    idServicio: row.id_servicio,
    tipo: row.tipo,
    codigoCabys: row.codigo_cabys,
    detalle: row.detalle,
    unidadMedida: row.unidad_medida,
    cantidad: row.cantidad,
    precioUnitario: row.precio_unitario,
    porcentajeIva: row.porcentaje_iva,
    codigoTarifaIva: row.codigo_tarifa_iva,
    numeroLinea,
    montoTotal,
    montoDescuento,
    codigoDescuento: row.codigo_descuento ?? null,
    naturalezaDescuento: row.naturaleza_descuento ?? null,
    subTotal,
    baseImponible: subTotal,
    montoIva,
    impuestoNeto: montoIva,
    montoTotalLinea: redondearMonto(subTotal + montoIva)
  };
}

// Trae las líneas de varias facturas de una sola consulta (usado por GET /api/facturas y el
// reporte D-104), agrupadas por id_factura y en el orden en que se insertaron originalmente.
async function fetchLineasPorFactura(idsFactura: number[]): Promise<Map<number, any[]>> {
  const mapa = new Map<number, any[]>();
  if (!pool || idsFactura.length === 0) return mapa;
  const [rows] = await pool.query(
    "SELECT * FROM factura_lineas WHERE id_factura IN (?) ORDER BY id_factura ASC, id_linea ASC",
    [idsFactura]
  );
  for (const row of rows as any[]) {
    if (!mapa.has(row.id_factura)) mapa.set(row.id_factura, []);
    const lista = mapa.get(row.id_factura)!;
    lista.push(reconstruirLineaFactura(row, lista.length + 1));
  }
  return mapa;
}

// Inserta en lote las líneas calculadas de una factura/nota de crédito recién creada, dentro de
// la misma transacción que el INSERT de `facturas`.
async function guardarLineasFactura(connection: any, idFactura: number, lineas: any[]): Promise<void> {
  if (lineas.length === 0) return;
  const placeholders = lineas.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const valores: any[] = [];
  for (const l of lineas) {
    valores.push(
      idFactura, l.idServicio ?? null, l.tipo, l.detalle, l.unidadMedida, l.codigoCabys ?? null,
      l.cantidad, l.precioUnitario, l.porcentajeIva, l.codigoTarifaIva, l.montoIva, l.montoTotal,
      Number(l.montoDescuento) || 0, Number(l.montoDescuento) > 0 ? l.codigoDescuento ?? null : null, Number(l.montoDescuento) > 0 ? l.naturalezaDescuento ?? null : null
    );
  }
  await connection.query(
    `INSERT INTO factura_lineas
      (id_factura, id_servicio, tipo, detalle, unidad_medida, codigo_cabys, cantidad, precio_unitario,
       porcentaje_iva, codigo_tarifa_iva, monto_iva, monto_total, monto_descuento, codigo_descuento, naturaleza_descuento)
     VALUES ${placeholders}`,
    valores
  );
}

// --- Normalización Fase 4: cuentas_pagar_lineas ---
// Equivalente del lado de compras de factura_lineas. A diferencia de aquella (tabla legada, todo
// snake_case), esta se creó para esta app y sigue la convención de su hermana cxp_pagos: nombre
// de tabla snake_case, columnas camelCase.

/** Trae los renglones de varias cuentas por pagar de una sola consulta, agrupados por idCuentaPagar. */
async function fetchLineasPorCuentaPagar(idsCuentaPagar: number[]): Promise<Map<number, any[]>> {
  const mapa = new Map<number, any[]>();
  if (!pool || idsCuentaPagar.length === 0) return mapa;
  const [rows] = await pool.query(
    "SELECT * FROM cuentas_pagar_lineas WHERE idCuentaPagar IN (?) ORDER BY idCuentaPagar ASC, id ASC",
    [idsCuentaPagar]
  );
  for (const row of rows as any[]) {
    if (!mapa.has(row.idCuentaPagar)) mapa.set(row.idCuentaPagar, []);
    mapa.get(row.idCuentaPagar)!.push({
      idServicio: row.idServicio,
      nombre: row.nombre,
      cantidad: row.cantidad,
      costoUnitario: row.costoUnitario
    });
  }
  return mapa;
}

/** Inserta en lote los renglones de una cuenta por pagar, dentro de la transacción que la crea. */
async function guardarLineasCuentaPagar(connection: any, idCuentaPagar: number, lineas: any[]): Promise<void> {
  if (!lineas || lineas.length === 0) return;
  const placeholders = lineas.map(() => "(?, ?, ?, ?, ?)").join(", ");
  const valores: any[] = [];
  for (const l of lineas) {
    valores.push(idCuentaPagar, l.idServicio, l.nombre, l.cantidad, l.costoUnitario);
  }
  await connection.query(
    `INSERT INTO cuentas_pagar_lineas (idCuentaPagar, idServicio, nombre, cantidad, costoUnitario)
     VALUES ${placeholders}`,
    valores
  );
}

// --- Reportes fiscales D-104 (IVA mensual) y D-101 (Renta anual) ---
// Funciones puras: reciben datos ya obtenidos (de MySQL o del fallback local) y calculan el
// reporte, para que GET /api/reportes/d104 y POST /api/reportes/d104/cerrar (que necesita
// recalcular para no confiar en lo que mande el cliente) compartan exactamente la misma lógica.

interface TarifaAcumulador { base: number; iva: number; }

function acumularLineasD104(lineas: any[], signo: 1 | -1, acc: { t13: TarifaAcumulador; t4: TarifaAcumulador; t2: TarifaAcumulador; t1: TarifaAcumulador; exento: TarifaAcumulador }) {
  for (const l of lineas || []) {
    const porcentaje = Number(l.porcentajeIva) || 0;
    const base = (Number(l.subTotal) || 0) * signo;
    const iva = (Number(l.montoIva) || 0) * signo;
    if (porcentaje >= 12.5) { acc.t13.base += base; acc.t13.iva += iva; }
    else if (porcentaje >= 3.5) { acc.t4.base += base; acc.t4.iva += iva; }
    else if (porcentaje >= 1.5) { acc.t2.base += base; acc.t2.iva += iva; }
    else if (porcentaje >= 0.5) { acc.t1.base += base; acc.t1.iva += iva; }
    else { acc.exento.base += base; }
  }
}

interface ReporteClientesSesiones {
  resumen: {
    pacientesNuevos: number;
    pacientesAtendidos: number;
    sesionesCompletadas: number;
    tasaAsistencia: number;
  };
  tendenciaMensual: Array<{ mes: string; pacientesNuevos: number; sesionesCompletadas: number }>;
  pacientes: Array<{ idPaciente: number; nombreCompleto: string; sesionesCompletadas: number; esNuevo: boolean }>;
}

function construirReporteClientesSesiones(
  desde: string,
  hasta: string,
  citas: Array<{ idPaciente: number; fechaHora: string; estadoCita: string }>,
  consultas: Array<{ idPaciente: number; fecha: string; estado?: string }>,
  pacientes: Array<{ id: number; nombreCompleto: string }>
): ReporteClientesSesiones {
  const enRango = (fecha: string) => {
    const dia = fecha.slice(0, 10);
    return dia >= desde && dia <= hasta;
  };

  // "Primer contacto" de cada paciente = la fecha más temprana entre su primera cita (de
  // cualquier estado, sin importar el rango) y su primera consulta registrada — cubre tanto
  // al paciente que se agenda normalmente como al que se le crea la consulta directo, sin
  // pasar por la agenda (que antes nunca contaba como "nuevo").
  const primerContactoPorPaciente = new Map<number, string>();
  const registrarPrimerContacto = (idPaciente: number, fecha: string) => {
    const actual = primerContactoPorPaciente.get(idPaciente);
    if (!actual || fecha < actual) primerContactoPorPaciente.set(idPaciente, fecha);
  };
  for (const c of citas) registrarPrimerContacto(c.idPaciente, c.fechaHora);
  for (const c of consultas) registrarPrimerContacto(c.idPaciente, c.fecha);

  const esNuevoEnRango = (idPaciente: number) => {
    const primera = primerContactoPorPaciente.get(idPaciente);
    return primera != null && enRango(primera);
  };

  const consultasCerradasEnRango = consultas.filter(c => c.estado === 'CERRADA' && enRango(c.fecha));
  const citasEnRango = citas.filter(c => enRango(c.fechaHora));

  const sesionesPorPaciente = new Map<number, number>();
  for (const c of consultasCerradasEnRango) {
    sesionesPorPaciente.set(c.idPaciente, (sesionesPorPaciente.get(c.idPaciente) || 0) + 1);
  }

  const completadas = citasEnRango.filter(c => c.estadoCita === 'COMPLETADA').length;
  const elegibles = citasEnRango.filter(c => c.estadoCita === 'COMPLETADA' || c.estadoCita === 'NO_ASISTIO' || c.estadoCita === 'CANCELADA').length;

  const meses: string[] = [];
  const cursor = new Date(desde + 'T00:00:00');
  cursor.setDate(1);
  const fin = new Date(hasta + 'T00:00:00');
  while (cursor <= fin) {
    meses.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`);
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const tendenciaMensual = meses.map(mes => ({
    mes,
    pacientesNuevos: Array.from(primerContactoPorPaciente.values()).filter(f => f.slice(0, 7) === mes && enRango(f)).length,
    sesionesCompletadas: consultasCerradasEnRango.filter(c => c.fecha.slice(0, 7) === mes).length
  }));

  const pacientesDetalle = pacientes
    .map(p => ({
      idPaciente: p.id,
      nombreCompleto: p.nombreCompleto,
      sesionesCompletadas: sesionesPorPaciente.get(p.id) || 0,
      esNuevo: esNuevoEnRango(p.id)
    }))
    .filter(p => p.sesionesCompletadas > 0 || p.esNuevo)
    .sort((a, b) => b.sesionesCompletadas - a.sesionesCompletadas);

  return {
    resumen: {
      pacientesNuevos: pacientes.filter(p => esNuevoEnRango(p.id)).length,
      pacientesAtendidos: sesionesPorPaciente.size,
      sesionesCompletadas: consultasCerradasEnRango.length,
      tasaAsistencia: elegibles > 0 ? Math.round((completadas / elegibles) * 1000) / 10 : 0
    },
    tendenciaMensual,
    pacientes: pacientesDetalle
  };
}

function construirReporteD104(periodo: string, company: Company, facturasMes: any[], notasCreditoMes: any[], notasDebitoMes: any[], creditoFiscal: number, yaCerrado: boolean, fechaCierre: string | null): ReporteD104 {
  const tarifas = {
    t13: { base: 0, iva: 0 }, t4: { base: 0, iva: 0 }, t2: { base: 0, iva: 0 }, t1: { base: 0, iva: 0 }, exento: { base: 0, iva: 0 }
  };
  facturasMes.forEach(f => acumularLineasD104(f.lineas, 1, tarifas));
  notasDebitoMes.forEach(f => acumularLineasD104(f.lineas, 1, tarifas));
  notasCreditoMes.forEach(f => acumularLineasD104(f.lineas, -1, tarifas));

  const debitoFiscal = tarifas.t13.iva + tarifas.t4.iva + tarifas.t2.iva + tarifas.t1.iva;
  const redondear2 = (n: number) => Math.round(n * 100) / 100;

  return {
    periodo,
    regimenSimplificado: !!company.regimenSimplificado,
    tarifas: {
      t13: { base: redondear2(tarifas.t13.base), iva: redondear2(tarifas.t13.iva) },
      t4: { base: redondear2(tarifas.t4.base), iva: redondear2(tarifas.t4.iva) },
      t2: { base: redondear2(tarifas.t2.base), iva: redondear2(tarifas.t2.iva) },
      t1: { base: redondear2(tarifas.t1.base), iva: redondear2(tarifas.t1.iva) },
      exento: { base: redondear2(tarifas.exento.base), iva: 0 }
    },
    debitoFiscal: redondear2(debitoFiscal),
    creditoFiscal: redondear2(creditoFiscal),
    saldoAPagar: redondear2(debitoFiscal - creditoFiscal),
    cantidadFacturas: facturasMes.length,
    cantidadNotasCredito: notasCreditoMes.length,
    cantidadNotasDebito: notasDebitoMes.length,
    yaCerrado,
    fechaCierre
  };
}

function construirReporteD101(anio: number, company: Company, facturasAnio: any[], notasCreditoAnio: any[], notasDebitoAnio: any[], comprasCxPAnio: number, gastosManuales: GastosManualesAnuales, yaCerrado: boolean, fechaCierre: string | null, parametrosRenta: ParametrosRenta | null): ReporteD101 {
  // Una Nota de Débito ACEPTADA es un ingreso adicional y una Nota de Crédito ACEPTADA (parcial o
  // de anulación) lo rebaja — igual que en el D-104, cada una en el año en que se emitió.
  const sumar = (docs: any[], campo: string) => docs.reduce((s, f) => s + (Number(f[campo]) || 0), 0);
  const ventasNetas = sumar(facturasAnio, "subtotal") + sumar(notasDebitoAnio, "subtotal") - sumar(notasCreditoAnio, "subtotal");
  const ivaAnual = sumar(facturasAnio, "totalIva") + sumar(notasDebitoAnio, "totalIva") - sumar(notasCreditoAnio, "totalIva");
  const totalGastosDeducibles = comprasCxPAnio + gastosManuales.alquileres + gastosManuales.servicios + gastosManuales.planilla + gastosManuales.otros;
  const utilidadNeta = Math.max(0, ventasNetas - totalGastosDeducibles);
  // Cédula física (01) y DIMEX (03) son personas físicas; jurídica (02) y NITE (04) tributan como jurídicas.
  const tipoContribuyente: "fisica" | "juridica" = company.tipoIdentificacion === "01" || company.tipoIdentificacion === "03" ? "fisica" : "juridica";
  // Los ingresos brutos (ventas sin IVA) deciden si una persona jurídica califica para la escala reducida.
  let impuestoRenta = 0;
  let tramos: string[] = ["No hay tramos de renta configurados: el administrador SaaS debe registrarlos en Administración SaaS › Tramos de renta."];
  if (parametrosRenta) {
    const calculo = calcularImpuestoRenta(utilidadNeta, tipoContribuyente, ventasNetas, parametrosRenta);
    impuestoRenta = calculo.total;
    tramos = parametrosRenta.anio === anio
      ? calculo.tramos
      : [`No hay tramos registrados para ${anio}: se usaron los del período ${parametrosRenta.anio}. Verifique los vigentes.`, ...calculo.tramos];
  }
  const redondear2 = (n: number) => Math.round(n * 100) / 100;

  return {
    anio,
    regimenSimplificado: !!company.regimenSimplificado,
    tipoContribuyente,
    ventasNetas: redondear2(ventasNetas),
    ivaAnual: redondear2(ivaAnual),
    comprasCxP: redondear2(comprasCxPAnio),
    gastosManuales,
    totalGastosDeducibles: redondear2(totalGastosDeducibles),
    utilidadNeta: redondear2(utilidadNeta),
    impuestoRenta,
    tramos,
    referenciaTramos: parametrosRenta ? `${parametrosRenta.referenciaLegal || 'Tramos registrados'} (período ${parametrosRenta.anio})` : null,
    cantidadFacturas: facturasAnio.length,
    cantidadNotasCredito: notasCreditoAnio.length,
    cantidadNotasDebito: notasDebitoAnio.length,
    yaCerrado,
    fechaCierre
  };
}

// Ensure database setup starts asynchronously (startServer espera esta promesa solo para cargar
// los parámetros del sistema en cuanto la BD está lista; no la bloquea).
const baseDeDatosLista = setupDatabase();

async function startServer() {
  const app = express();
  // Confiar en X-Forwarded-For y X-Forwarded-Proto solo cuando la conexión viene de un proxy en red
  // local o privada, para que req.ip sea la IP real del cliente y req.protocol el del cliente. Un
  // cliente público no puede falsificarlo, porque su IP no es privada.
  app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal']);
  // Límite subido de 100kb (default de Express) a 10mb: el logo de empresa ahora se sube como
  // archivo y viaja como data URL base64 dentro del JSON de POST /api/companies (hasta 2MB
  // crudos ~= 2.7MB en base64, ver CompanySettings.tsx).
  app.use(express.json({ limit: '10mb' }));
  const PORT = Number(process.env.PORT);

  // --- Authentication ---
  // Every route below is protected by requireAuth unless explicitly marked "no auth" (the
  // /api/public/* booking routes, /api/db-status, /api/login and the company-registration
  // branch of POST /api/companies). Session lives in a signed, httpOnly cookie — see
  // server/auth.ts. Handlers read `getSession(req)` and scope data to `session.idCompania`
  // instead of trusting an idCompania the client put in the request body/query.

  async function fetchUserById(id: number): Promise<any | undefined> {
    if (dbConnected && pool) {
      const [rows] = await pool.query("SELECT * FROM usuarios WHERE id_usuario = ?", [id]);
      return (rows as any[]).map(row => normalizeRow(row, 'id_usuario'))[0];
    }
    return localUsers.find(u => u.id === id);
  }

  async function fetchCompanyById(id: number): Promise<Company | undefined> {
    if (dbConnected && pool) {
      const [rows] = await pool.query("SELECT * FROM companias WHERE id_compania = ?", [id]);
      const company = (rows as any[]).map(row => normalizeRow(row, 'id_compania'))[0];
      if (company) {
        company.horarioAtencion = await fetchHorarioAtencionCompania(company.id);
        company.horarioDomicilio = await fetchHorarioDomicilioCompania(company.id);
      }
      return company;
    }
    return localCompanies.find(c => c.id === id);
  }

  // Nombre del servicio de una cita (para el título del .ics); null si no tiene o no existe.
  async function nombreServicioDeCita(idServicio: number | null | undefined, idCompania: number): Promise<string | null> {
    if (!idServicio) return null;
    if (dbConnected && pool) {
      const [rows] = await pool.query("SELECT nombre FROM servicios WHERE id_servicio = ? AND idCompania = ?", [idServicio, idCompania]);
      return (rows as any[])[0]?.nombre ?? null;
    }
    return localServicios.find(s => s.id === idServicio && s.idCompania === idCompania)?.nombre ?? null;
  }

  // El rol viaja en el token firmado (TTL 7 días), así que un usuario desactivado o con el rol
  // cambiado conservaría sus permisos. Por eso se consulta el usuario vigente en la base, con una
  // caché de 60 s por userId (se invalida al guardar el usuario en POST /api/users).
  const cacheUsuariosVigentes = crearCacheUsuarios(60_000);

  async function cargarUsuarioVigente(id: number): Promise<UsuarioVigente | null> {
    const enCache = cacheUsuariosVigentes.get(id);
    if (enCache !== undefined) return enCache;
    let vigente: UsuarioVigente | null = null;
    if (dbConnected && pool) {
      const [rows] = await pool.query("SELECT id_usuario, rol, idCompania, activo, sesionVersion FROM usuarios WHERE id_usuario = ?", [id]);
      const r = (rows as any[])[0];
      if (r) vigente = { id: r.id_usuario, rol: r.rol, idCompania: r.idCompania, activo: !!r.activo, sesionVersion: Number(r.sesionVersion) || 0 };
    } else {
      const u = localUsers.find(x => x.id === id);
      if (u) vigente = { id: u.id, rol: u.rol as UsuarioVigente["rol"], idCompania: u.idCompania, activo: u.activo !== false, sesionVersion: Number((u as any).sesionVersion) || 0 };
    }
    cacheUsuariosVigentes.set(id, vigente);
    return vigente;
  }

  // Resuelve la sesión una sola vez por petición /api: token válido + usuario vigente en la base.
  // getSession() devuelve el resultado (rol e idCompania de la BASE, no del token).
  app.use("/api", async (req, res, next) => {
    // Mantiene al día el id de la empresa de plataforma (parametros_sistema, caché de 60 s) antes
    // de cualquier isSaasAdmin()/esCompaniaPlataforma() de la petición. No lanza errores.
    await leerParametrosSistema();
    const token = readCookie(req.headers.cookie, "cc_session");
    const payload = token ? verifySessionToken(token) : null;
    (req as any).sesionResuelta = true;
    (req as any).session = null;
    if (!payload) return next();
    try {
      const vigente = await cargarUsuarioVigente(payload.userId);
      const sesion = sesionDesdeUsuario(vigente, payload.sv);
      if (!sesion) {
        // Usuario inexistente, desactivado o con la contraseña cambiada después de emitir este
        // token (otra versión de sesión): se limpia la cookie, igual que el logout.
        (req as any).sesionRevocada = true;
        return next();
      }
      (req as any).session = sesion as SessionPayload;
      next();
    } catch (err) {
      console.error("[Auth] No se pudo validar el usuario vigente:", err);
      res.status(503).json({ error: "No se pudo validar la sesión. Intente de nuevo." });
    }
  });

  function getSession(req: express.Request): SessionPayload | null {
    if ((req as any).sesionResuelta) return ((req as any).session as SessionPayload | null) ?? null;
    const token = readCookie(req.headers.cookie, "cc_session");
    if (!token) return null;
    return verifySessionToken(token);
  }

  function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const session = getSession(req);
    if (!session) {
      if ((req as any).sesionRevocada) res.setHeader("Set-Cookie", serializeSessionCookie("", 0));
      return res.status(401).json({ error: "No autenticado. Inicie sesión de nuevo." });
    }
    (req as any).session = session as SessionPayload;
    next();
  }

  function requireSaasAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
    const session = (req as any).session as SessionPayload | undefined;
    if (!isSaasAdmin(session)) {
      return res.status(403).json({ error: "No autorizado." });
    }
    next();
  }

  // Roles que un usuario puede tener (lista blanca para validar el body de POST /api/users).
  const ROLES_USUARIO = ["Administrador", "Profesional", "Contador"];

  // --- Rol 'Contador': acceso de solo lectura a lo financiero, SIN datos clínicos ---
  // Lista blanca (todo lo que no esté aquí responde 403). Se aplica a cualquier petición con
  // sesión de Contador, antes de llegar a las rutas. Rutas reales de server.ts permitidas:
  //   GET  /api/me, /api/db-status, /api/companies (ya filtra por la empresa de la sesión),
  //        /api/servicios, /api/facturas, /api/cxc, /api/cxp, /api/proveedores,
  //        /api/reportes/{clientes-sesiones,d104,d101,cierres}, /api/parametros-renta,
  //        /api/hacienda-config/:idCompania (solo banderas, nunca llave ni PIN),
  //        /api/facturas-correo y /api/facturas-correo/:id/xml,
  //        /api/hacienda/{cabys,cabys/sugeridos,tipo-cambio,comprobantes} y
  //        /api/hacienda/{contribuyente,exoneracion,comprobantes}/:valor (consultas fiscales)
  //   POST /api/logout, /api/facturas/:id/reenviar-correo,
  //        /api/users (solo para Mi perfil: el handler limita a no administradores a editarse a
  //        sí mismos sin cambiar rol/empresa/estado, y nunca pueden crear usuarios)
  //   Públicas sin sesión (cualquier método): /api/login, /api/forgot-password, /api/public/*
  // Quedan bloqueados, entre otros: pacientes, consultas, casos/expedientes, citas, calendario,
  // dietas, plantillas, notificaciones, usuarios (GET), SMTP, IMAP config, hacienda firmar y
  // config POST, crear/anular facturas, notas de crédito/débito, pagos CxC/CxP y cierres.
  // La lista blanca vive en server/accesoContador.ts. Express enruta sin distinguir mayúsculas y
  // minúsculas, así que la ruta se normaliza (minúsculas, sin barra final, decodificada si trae %)
  // antes de compararla: si no, GET /API/patients se saltaría el filtro y llegaría al handler.
  // El rol sale de la base (ver resolución de sesión arriba), no del token.
  app.use((req, res, next) => {
    const session = getSession(req);
    if (!session || session.rol !== "Contador") return next();
    const decision = decidirAccesoContador(req.method, req.path);
    if (decision === "invalida") {
      return res.status(400).json({ error: "Ruta no válida." });
    }
    if (decision === "prohibido") {
      return res.status(403).json({ error: "Su rol (Contador) no tiene acceso a esta sección." });
    }
    next();
  });
  function sessionOf(req: express.Request): SessionPayload {
    return (req as any).session as SessionPayload;
  }

  function canAccessCompany(session: SessionPayload, idCompania: number): boolean {
    return isSaasAdmin(session) || session.idCompania === idCompania;
  }

  // Los hashes de contraseña nunca deben llegar al navegador, ni siquiera los de otro
  // colaborador de la misma empresa (bcrypt es lento, no infranqueable).
  function sanitizeUser(u: any): any {
    if (!u) return u;
    // El calendarioToken es una credencial (suscripción ICS): solo lo ve su dueño en /api/mi-calendario.
    const { contrasena, calendarioToken, ...safeUser } = u;
    return safeUser;
  }

  // Banderas para el navegador (login y GET /api/me): el id de la empresa de plataforma no se
  // calcula en el cliente, sale de parametros_sistema aquí en el servidor.
  function banderasPlataforma(u: Pick<SessionPayload, "idCompania" | "rol">): { esSaasAdmin: boolean; esCompaniaPlataforma: boolean } {
    return {
      esSaasAdmin: isSaasAdmin({ userId: 0, idCompania: Number(u.idCompania), rol: u.rol }),
      esCompaniaPlataforma: esCompaniaPlataforma(u.idCompania)
    };
  }

  app.post("/api/login", async (req, res) => {
    try {
      const usuario = String(req.body?.usuario || "").trim().toLowerCase();
      const password = String(req.body?.password || "");
      if (!usuario || !password) {
        return res.status(400).json({ error: "Usuario y contraseña son requeridos." });
      }

      let user: any;
      if (dbConnected && pool) {
        const [rows] = await pool.query(
          "SELECT * FROM usuarios WHERE LOWER(usuario) = ? OR LOWER(correo) = ?",
          [usuario, usuario]
        );
        user = (rows as any[]).map(row => normalizeRow(row, 'id_usuario'))[0];
      } else {
        user = localUsers.find(u => u.usuario.trim().toLowerCase() === usuario);
      }

      if (!user || !passwordMatches(user.contrasena, password)) {
        return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
      }
      if (user.activo === false) {
        return res.status(403).json({ error: "Este usuario está inactivo. Contacte a su administrador." });
      }

      const company = await fetchCompanyById(user.idCompania);
      if (company?.estadoSaas === "PENDIENTE") {
        return res.status(403).json({ error: "Esta cuenta está pendiente de aprobación. Un administrador se pondrá en contacto pronto." });
      }
      if (company?.estadoSaas === "SUSPENDIDA") {
        return res.status(403).json({ error: "Esta cuenta se encuentra suspendida. Contacte al administrador de la plataforma." });
      }

      // Migración oportunista: las contraseñas de datos de prueba antiguos quedan en texto
      // plano hasta el primer login exitoso, momento en el que se reemplazan por un hash bcrypt.
      if (!isBcryptHash(user.contrasena)) {
        const upgraded = hashPassword(password);
        if (dbConnected && pool) {
          await pool.query("UPDATE usuarios SET contrasena = ? WHERE id_usuario = ?", [upgraded, user.id]);
        } else {
          localUsers = localUsers.map(u => u.id === user.id ? { ...u, contrasena: upgraded } : u);
        }
        user.contrasena = upgraded;
      }

      const token = createSessionToken({ userId: user.id, idCompania: user.idCompania, rol: user.rol, sv: Number(user.sesionVersion) || 0 });
      res.setHeader("Set-Cookie", serializeSessionCookie(token, SESSION_MAX_AGE_SECONDS));

      res.json({ user: sanitizeUser(user), company, ...banderasPlataforma(user) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/logout", (req, res) => {
    res.setHeader("Set-Cookie", serializeSessionCookie("", 0));
    res.json({ success: true });
  });

  // --- Utilidades de "olvidé mi contraseña" (límite de frecuencia en memoria y enmascarado) ---
  const FORGOT_USUARIO_VENTANA_MS = 5 * 60 * 1000;   // 1 envío por usuario cada 5 minutos
  const FORGOT_IP_VENTANA_MS = 15 * 60 * 1000;       // 10 solicitudes por IP cada 15 minutos
  const FORGOT_IP_MAX = 10;
  const forgotUsuarioUltimoEnvio = new Map<number | string, number>();
  const forgotIpSolicitudes = new Map<string, number[]>();

  // Elimina entradas vencidas para que los Map no crezcan indefinidamente.
  function limpiarForgotPassword(ahora: number) {
    for (const [id, t] of forgotUsuarioUltimoEnvio) {
      if (ahora - t >= FORGOT_USUARIO_VENTANA_MS) forgotUsuarioUltimoEnvio.delete(id);
    }
    for (const [ip, marcas] of forgotIpSolicitudes) {
      const vigentes = marcas.filter(t => ahora - t < FORGOT_IP_VENTANA_MS);
      if (vigentes.length === 0) forgotIpSolicitudes.delete(ip);
      else forgotIpSolicitudes.set(ip, vigentes);
    }
  }

  // Registra la solicitud de la IP y devuelve true si ya superó el máximo de la ventana.
  function forgotPasswordIpLimitada(ip: string): boolean {
    const ahora = Date.now();
    limpiarForgotPassword(ahora);
    const marcas = forgotIpSolicitudes.get(ip) || [];
    if (marcas.length >= FORGOT_IP_MAX) return true;
    marcas.push(ahora);
    forgotIpSolicitudes.set(ip, marcas);
    return false;
  }

  // Devuelve true si a este usuario ya se le envió una clave hace menos de 5 minutos; si no,
  // reserva el cupo (así dos solicitudes simultáneas no envían dos correos).
  function forgotPasswordUsuarioLimitado(idUsuario: number | string): boolean {
    const ahora = Date.now();
    const ultimo = forgotUsuarioUltimoEnvio.get(idUsuario);
    if (ultimo !== undefined && ahora - ultimo < FORGOT_USUARIO_VENTANA_MS) return true;
    forgotUsuarioUltimoEnvio.set(idUsuario, ahora);
    return false;
  }

  // Enmascara un correo para los registros: el***@gmail.com
  function enmascararCorreo(correo: string): string {
    const [local, dominio] = String(correo).split("@");
    if (!dominio) return "***";
    return `${local.slice(0, 2)}***@${dominio}`;
  }

  // Identificador (usuario o correo) truncado para los registros.
  function truncarIdentificador(identificador: string): string {
    return identificador.includes("@")
      ? enmascararCorreo(identificador)
      : `${identificador.slice(0, 3)}${identificador.length > 3 ? "***" : ""}`;
  }

  // Restablecimiento de contraseña — pública (sin sesión) por definición: el usuario que la pide
  // no puede iniciar sesión. Genera una contraseña temporal de 8 dígitos y la envía SOLO al
  // correo ya registrado para esa cuenta (nunca a uno que mande el cliente en el body, para que
  // esto no sirva para secuestrar cuentas ajenas). La respuesta es siempre el mismo mensaje
  // genérico, exista o no ese usuario/correo, para no permitir enumerar cuentas válidas.
  app.post("/api/forgot-password", async (req, res) => {
    const respuestaGenerica = { message: "Si el usuario existe, se envió un correo con una contraseña temporal." };
    try {
      const identificador = String(req.body?.usuario || "").trim().toLowerCase();
      if (!identificador) {
        return res.status(400).json({ error: "Indique su usuario o correo." });
      }

      // Límite por IP: cuenta toda solicitud, exista o no el usuario.
      if (forgotPasswordIpLimitada(req.ip || "desconocida")) {
        console.warn(`[ForgotPassword] Límite por IP superado (ip=${req.ip}); no se procesa la solicitud.`);
        return res.json(respuestaGenerica);
      }

      let user: any;
      if (dbConnected && pool) {
        const [rows] = await pool.query(
          "SELECT * FROM usuarios WHERE LOWER(usuario) = ? OR LOWER(correo) = ?",
          [identificador, identificador]
        );
        user = (rows as any[]).map(row => normalizeRow(row, 'id_usuario'))[0];
      } else {
        user = localUsers.find(u => u.usuario.trim().toLowerCase() === identificador || u.correo.trim().toLowerCase() === identificador);
      }

      if (!user || !user.correo) {
        console.warn(`[ForgotPassword] ${!user ? "Sin coincidencia de usuario" : `Usuario id=${user.id} sin correo registrado`} para el identificador "${truncarIdentificador(identificador)}".`);
        return res.json(respuestaGenerica);
      }

      // Límite por usuario: se responde igual de genérico (sin enviar ni cambiar nada).
      if (forgotPasswordUsuarioLimitado(user.id)) {
        console.warn(`[ForgotPassword] Límite por usuario superado (usuario id=${user.id}, ip=${req.ip}); no se envía nada.`);
        return res.json(respuestaGenerica);
      }

      // El correo se envía SIEMPRE a través del SMTP de la empresa de plataforma (id en
      // parametros_sistema) — no del SMTP de la empresa del usuario, que en la práctica casi nunca
      // está configurado por cada clínica. `company` (la empresa real del usuario) se sigue
      // usando para el nombre que aparece en el correo, solo cambia el transporte SMTP.
      const SMTP_COMPANIA_PLATAFORMA = idCompaniaPlataforma();
      const company = await fetchCompanyById(user.idCompania);
      let smtpConfig: CompaniaSmtpConfig | undefined;
      if (dbConnected && pool) {
        const [smtpRows] = await pool.query("SELECT * FROM compania_smtp_config WHERE idCompania = ?", [SMTP_COMPANIA_PLATAFORMA]);
        const smtpRow = (smtpRows as any[])[0];
        smtpConfig = smtpRow ? { ...smtpRow, activo: !!smtpRow.activo } : undefined;
      } else {
        smtpConfig = localSmtpConfigs.find(s => s.idCompania === SMTP_COMPANIA_PLATAFORMA);
      }

      if (!company || !smtpConfig || !smtpConfig.activo) {
        // No hay forma de avisarle a esta cuenta por correo — no se revela esto al cliente
        // (evitaría la protección contra enumeración de arriba), solo se registra en el servidor.
        console.error(`[ForgotPassword] No se pudo enviar contraseña temporal a "${user.usuario}": SMTP no configurado/activo para la empresa de plataforma (idCompania=${SMTP_COMPANIA_PLATAFORMA}).`);
        return res.json(respuestaGenerica);
      }

      // Primero se envía el correo y SOLO si el SMTP lo acepta se guarda el hash: si el envío
      // falla, la contraseña actual del usuario queda intacta (no se bloquea la cuenta con una
      // clave que nunca recibió).
      const nuevaContrasena = generateNumericPassword(8);
      const hash = hashPassword(nuevaContrasena);

      const rendered = renderPasswordResetEmail({ company, user, nuevaContrasena });
      let envio;
      try {
        envio = await sendMail(smtpConfig, { to: user.correo, subject: rendered.subject, html: rendered.html, text: rendered.text });
      } catch (err: any) {
        console.error("[ForgotPassword] Fallo SMTP al enviar a usuario id=" + user.id + ":", err.code, err.responseCode, err.message);
        // El envío falló: se libera el cupo para que pueda reintentar sin esperar 5 minutos.
        forgotUsuarioUltimoEnvio.delete(user.id);
        return res.json(respuestaGenerica);
      }

      // Restablecer también sube la versión de sesión: cualquier sesión abierta con la clave
      // anterior (p. ej. en un equipo perdido) deja de valer.
      if (dbConnected && pool) {
        await pool.query("UPDATE usuarios SET contrasena = ?, sesionVersion = sesionVersion + 1 WHERE id_usuario = ?", [hash, user.id]);
      } else {
        localUsers = localUsers.map(u => u.id === user.id ? { ...u, contrasena: hash, sesionVersion: (Number((u as any).sesionVersion) || 0) + 1 } as any : u);
      }
      cacheUsuariosVigentes.invalidate(user.id);

      console.log(`[ForgotPassword] Contraseña temporal enviada: usuario id=${user.id}, destinatario=${enmascararCorreo(user.correo)}, messageId=${envio.messageId}, accepted=${JSON.stringify(envio.accepted.map(enmascararCorreo))}, rejected=${JSON.stringify(envio.rejected.map(enmascararCorreo))}`);

      res.json(respuestaGenerica);
    } catch (err: any) {
      console.error("[ForgotPassword] Error:", err);
      res.status(500).json({ error: "No se pudo procesar la solicitud. Intente de nuevo." });
    }
  });

  app.get("/api/me", async (req, res) => {
    const session = getSession(req);
    if (!session) return res.status(401).json({ error: "No autenticado." });

    const user = await fetchUserById(session.userId);
    if (!user || user.activo === false) return res.status(401).json({ error: "No autenticado." });
    const company = await fetchCompanyById(session.idCompania);

    res.json({ user: sanitizeUser(user), company, ...banderasPlataforma(session) });
  });

  // --- Parámetros del sistema (tabla parametros_sistema; caché de 60 s) ---
  let cacheParametros: { filas: Array<{ clave: string; valor: string }>; expira: number } | null = null;
  // Se lee en cada petición /api: al vencer la caché, las peticiones simultáneas comparten una sola consulta.
  let lecturaParametrosEnCurso: Promise<Array<{ clave: string; valor: string }>> | null = null;
  function leerParametrosSistema(): Promise<Array<{ clave: string; valor: string }>> {
    if (cacheParametros && cacheParametros.expira > Date.now()) return Promise.resolve(cacheParametros.filas);
    if (!lecturaParametrosEnCurso) {
      lecturaParametrosEnCurso = leerParametrosSistemaDeBd().finally(() => { lecturaParametrosEnCurso = null; });
    }
    return lecturaParametrosEnCurso;
  }

  async function leerParametrosSistemaDeBd(): Promise<Array<{ clave: string; valor: string }>> {
    let filas: Array<{ clave: string; valor: string }> = [];
    if (dbConnected && pool) {
      try {
        const [rows] = await pool.query("SELECT clave, valor FROM parametros_sistema");
        filas = (rows as any[]).map(r => ({ clave: String(r.clave), valor: String(r.valor) }));
      } catch (err: any) {
        // Fallo transitorio o tabla ausente: NO se guarda en caché (si se guardara la lista vacía,
        // la facturación quedaría sin URLs de Hacienda durante 60 s). Se usa la última lectura
        // buena si existe; si no, la lista vacía solo para esta petición.
        console.warn("[Parametros] No se pudieron leer parametros_sistema:", err?.code || err?.message);
        return cacheParametros?.filas ?? [];
      }
      aplicarIdCompaniaPlataforma(filas);
    }
    cacheParametros = { filas, expira: Date.now() + 60_000 };
    return filas;
  }

  // Id de la empresa de plataforma: se aplica en cada lectura buena de parametros_sistema. Si el
  // parámetro falta o es inválido se conserva el vigente (al arrancar, el valor de arranque de
  // server/companiaPlataforma.ts) y se avisa una sola vez en el registro.
  let avisoIdPlataformaFaltante = false;
  function aplicarIdCompaniaPlataforma(filas: Array<{ clave: string; valor: string }>) {
    const id = idPlataformaDesdeParametros(filas);
    if (id === null) {
      if (!avisoIdPlataformaFaltante) {
        console.warn(`[Parametros] Falta o es inválido «${CLAVE_ID_COMPANIA_PLATAFORMA}»; se usa la empresa de plataforma ${idCompaniaPlataforma()}. Aplique docs/sql/2026-11-26-saas-compania-plataforma.sql.`);
        avisoIdPlataformaFaltante = true;
      }
      return;
    }
    avisoIdPlataformaFaltante = false;
    if (id !== idCompaniaPlataforma()) console.log(`[Parametros] Empresa de plataforma: ${id}.`);
    establecerIdCompaniaPlataforma(id);
  }

  /** Descarta la caché de parametros_sistema (tras guardar parámetros desde un panel). */
  function invalidarCacheParametros() {
    cacheParametros = null;
  }

  // Carga inicial en cuanto la BD está lista (antes de eso pudo quedar en caché la lista vacía
  // del modo sin conexión, por eso se descarta la caché).
  baseDeDatosLista.then(() => {
    cacheParametros = null;
    return leerParametrosSistema();
  }).catch(err => console.error("[Parametros] Carga inicial fallida:", err));

  /** Valor de un parámetro del sistema (undefined si no existe), con la misma caché de 60 s. */
  async function parametro(clave: string): Promise<string | undefined> {
    return (await leerParametrosSistema()).find(p => p.clave === clave)?.valor;
  }

  class ParametroFaltanteError extends Error {}

  /** Entero positivo obligatorio de parametros_sistema; si falta o no es válido, ParametroFaltanteError. */
  async function parametroEntero(clave: string): Promise<number> {
    const n = parseInt((await parametro(clave)) ?? "", 10);
    if (!Number.isInteger(n) || n < 1) throw new ParametroFaltanteError(`Falta configurar el parámetro del sistema «${clave}».`);
    return n;
  }

  /** Texto obligatorio de parametros_sistema; si falta, ParametroFaltanteError. */
  async function parametroRequerido(clave: string): Promise<string> {
    const v = ((await parametro(clave)) ?? "").trim();
    if (!v) throw new ParametroFaltanteError(`Falta configurar el parámetro del sistema «${clave}».`);
    return v;
  }

  /** URLs del IdP y de recepción y client_id del ambiente, leídos de parametros_sistema. */
  async function endpointsHaciendaPara(ambiente: AmbienteHacienda): Promise<EndpointsHacienda> {
    const filas = await leerParametrosSistema();
    return resolverEndpointsHacienda(ambiente, clave => filas.find(p => p.clave === clave)?.valor);
  }

  const limiteIntentosContrasena = crearLimiteIntentos();

  // Política vigente, para que la pantalla muestre los requisitos reales (vienen de la BD).
  app.get("/api/me/politica-contrasena", requireAuth, async (_req, res) => {
    const p = politicaDesdeParametros(await leerParametrosSistema());
    res.json({ minLongitud: p.minLongitud, requiereLetrasYNumeros: p.requiereLetrasYNumeros });
  });

  // Cambio de contraseña por el propio usuario: exige la actual, valida la nueva con la política de
  // la BD y sube la versión de sesión (cierra las demás sesiones). La sesión actual se renueva.
  app.post("/api/me/contrasena", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      const actual = String(req.body?.actual ?? "");
      const nueva = String(req.body?.nueva ?? "");
      const politica = politicaDesdeParametros(await leerParametrosSistema());

      if (limiteIntentosContrasena.bloqueado(session.userId, politica)) {
        return res.status(429).json({ error: `Demasiados intentos fallidos. Espere ${politica.ventanaMin} minutos e intente de nuevo.` });
      }
      if (!actual) return res.status(400).json({ error: "Indique su contraseña actual." });

      const user = await fetchUserById(session.userId);
      if (!user || user.activo === false) return res.status(401).json({ error: "No autenticado." });
      if (!passwordMatches(user.contrasena, actual)) {
        limiteIntentosContrasena.registrarFallo(session.userId);
        console.warn(`[CambioContrasena] Contraseña actual incorrecta (usuario id=${session.userId}).`);
        return res.status(400).json({ error: "La contraseña actual no es correcta." });
      }

      const motivo = validarNuevaContrasena(nueva, politica);
      if (motivo) return res.status(400).json({ error: motivo });
      if (passwordMatches(user.contrasena, nueva)) {
        return res.status(400).json({ error: "La contraseña nueva debe ser distinta de la actual." });
      }

      const hash = hashPassword(nueva);
      let nuevaVersion: number;
      if (dbConnected && pool) {
        await pool.query("UPDATE usuarios SET contrasena = ?, sesionVersion = sesionVersion + 1 WHERE id_usuario = ?", [hash, session.userId]);
        const [rows] = await pool.query("SELECT sesionVersion FROM usuarios WHERE id_usuario = ?", [session.userId]);
        nuevaVersion = Number((rows as any[])[0]?.sesionVersion) || 0;
      } else {
        nuevaVersion = (Number((user as any).sesionVersion) || 0) + 1;
        localUsers = localUsers.map(u => u.id === session.userId ? { ...u, contrasena: hash, sesionVersion: nuevaVersion } as any : u);
      }
      cacheUsuariosVigentes.invalidate(session.userId);
      limiteIntentosContrasena.limpiar(session.userId);

      // Token nuevo con la versión vigente: este dispositivo sigue conectado, los demás no.
      const token = createSessionToken({ userId: session.userId, idCompania: session.idCompania, rol: session.rol, sv: nuevaVersion });
      res.setHeader("Set-Cookie", serializeSessionCookie(token, SESSION_MAX_AGE_SECONDS));
      console.log(`[CambioContrasena] Contraseña actualizada (usuario id=${session.userId}); otras sesiones cerradas.`);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[CambioContrasena] Error:", err);
      res.status(500).json({ error: "No se pudo cambiar la contraseña. Intente de nuevo." });
    }
  });

  // DB Connection Status Endpoint
  app.get("/api/db-status", (req, res) => {
    // Público: solo el estado, nunca host, puerto, base ni el texto del error.
    res.json({ connected: dbConnected });
  });

  // --- API Routes for Database Management (Dual Mode) ---

  // 1. Companies
  app.get("/api/companies", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (dbConnected && pool) {
        const [rows] = isSaasAdmin(session)
          ? await pool.query("SELECT * FROM companias")
          : await pool.query("SELECT * FROM companias WHERE id_compania = ?", [session.idCompania]);
        const companias = (rows as any[]).map(row => normalizeRow(row, 'id_compania'));
        await Promise.all(companias.map(async c => {
          c.horarioAtencion = await fetchHorarioAtencionCompania(c.id);
          c.horarioDomicilio = await fetchHorarioDomicilioCompania(c.id);
        }));
        res.json(companias);
      } else {
        res.json(isSaasAdmin(session) ? localCompanies : localCompanies.filter(c => c.id === session.idCompania));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/companies", async (req, res) => {
    try {
      const c = req.body;

      // Editing an existing company requires being its Administrador (or the SaaS admin) — a
      // missing c.id is the public self-registration flow (new clinic signup) and stays open.
      if (c.id) {
        const session = getSession(req);
        const authorized = !!session && (isSaasAdmin(session) || (session.idCompania === parseInt(c.id) && session.rol === "Administrador"));
        if (!authorized) {
          return res.status(403).json({ error: "No autorizado para modificar esta empresa." });
        }
      }

      // Alta (autorregistro): datos fiscales completos y válidos desde el inicio, porque son los que
      // usa el ERP para facturar la suscripción. La identificación se guarda solo con dígitos.
      if (!c.id) {
        const problemaAlta = errorDatosFiscalesAlta(c);
        if (problemaAlta) return res.status(400).json({ error: problemaAlta });
        c.identificacion = soloDigitosIdentificacion(c.identificacion);
        c.razonSocial = String(c.razonSocial).trim();
        c.correoEmisor = String(c.correoEmisor).trim();
      }

      // Campos comerciales del SaaS (estado, límite de usuarios, cuota y vencimiento): solo los fija el
      // SaaS admin. En el autorregistro público la empresa nace PENDIENTE con el límite configurado, y el
      // Administrador de una clínica no puede cambiar los suyos (se conservan los guardados).
      const puedeEditarCamposSaas = !!c.id && isSaasAdmin(getSession(req));
      const camposSaasDeAlta = async () => ({
        estadoSaas: "PENDIENTE" as Company["estadoSaas"],
        maxUsuarios: await parametroEntero("saas_max_usuarios_defecto"),
        montoMensual: null,
        proximoVencimiento: null
      });

      // Plazos de crédito (Parámetros contables): si no vienen se conserva el guardado o el predeterminado de la BD.
      const plazoOpcional = (v: any) => (v == null || v === "" ? null : Number(v));
      const plazoClientes = plazoOpcional(c.plazoCreditoClientesDias);
      const plazoProveedores = plazoOpcional(c.plazoCreditoProveedoresDias);
      if ([plazoClientes, plazoProveedores].some(v => v != null && !(Number.isInteger(v) && v > 0))) {
        return res.status(400).json({ error: "Los plazos de crédito deben ser un número entero de días mayor que cero." });
      }

      // Horario de citas a domicilio: undefined = no viene (se conserva), null = usar horario de atención.
      let horarioDomicilioNormalizado: HorarioDomicilio | null | undefined;
      try {
        horarioDomicilioNormalizado = c.horarioDomicilio === undefined ? undefined : normalizarHorarioDomicilio(c.horarioDomicilio);
      } catch (err: any) {
        if (err instanceof HorarioDomicilioInvalidoError) return res.status(400).json({ error: err.message });
        throw err;
      }

      // Reservas en línea por tipo de visita: undefined = no viene (se conserva lo guardado / el predeterminado).
      const flagReserva = (v: any) => (v === undefined || v === null ? null : (v ? 1 : 0));
      const reservaConsultorio = flagReserva(c.reservaAutoConsultorio);
      const reservaDomicilio = flagReserva(c.reservaAutoDomicilio);
      const whatsappProvisto = c.whatsappReservas !== undefined;
      const mensajeProvisto = c.mensajeWhatsappReservas !== undefined;
      let whatsappNormalizado: string | null = null;
      try {
        whatsappNormalizado = normalizarWhatsapp(c.whatsappReservas);
      } catch (err: any) {
        if (err instanceof WhatsappInvalidoError) return res.status(400).json({ error: err.message });
        throw err;
      }
      const mensajeWhatsapp = normalizarMensajeWhatsapp(c.mensajeWhatsappReservas);
      if (whatsappProvisto) c.whatsappReservas = whatsappNormalizado;
      if (mensajeProvisto) c.mensajeWhatsappReservas = mensajeWhatsapp;

      if (dbConnected && pool) {
        if (c.id) {
          const [exists] = await pool.query("SELECT * FROM companias WHERE id_compania = ?", [c.id]);
          if ((exists as any).length > 0) {
            if (!puedeEditarCamposSaas) {
              const actual = (exists as any[])[0];
              c.estadoSaas = actual.estadoSaas;
              c.maxUsuarios = actual.maxUsuarios;
              c.montoMensual = actual.montoMensual;
              c.proximoVencimiento = actual.proximoVencimiento;
            }
            await pool.query(
              "UPDATE companias SET reservaAutoConsultorio = COALESCE(?, reservaAutoConsultorio), reservaAutoDomicilio = COALESCE(?, reservaAutoDomicilio), whatsappReservas = IF(?, ?, whatsappReservas), mensajeWhatsappReservas = IF(?, ?, mensajeWhatsappReservas), nombreComercial = ?, razonSocial = ?, tipoIdentificacion = ?, identificacion = ?, correoEmisor = ?, ivaPorDefecto = ?, colorPrimario = ?, colorSidebar = ?, logoUrl = ?, actividadEconomica = ?, perfilCompania = ?, estadoSaas = ?, maxUsuarios = ?, montoMensual = ?, proximoVencimiento = ?, requiereConfirmacionCitas = ?, provincia = ?, canton = ?, distrito = ?, otrasSenas = ?, regimenSimplificado = ?, plazoCreditoClientesDias = COALESCE(?, plazoCreditoClientesDias), plazoCreditoProveedoresDias = COALESCE(?, plazoCreditoProveedoresDias) WHERE id_compania = ?",
              [
                reservaConsultorio, reservaDomicilio, whatsappProvisto ? 1 : 0, whatsappNormalizado, mensajeProvisto ? 1 : 0, mensajeWhatsapp,
                c.nombreComercial, c.razonSocial, c.tipoIdentificacion, c.identificacion, c.correoEmisor, parseFloat(c.ivaPorDefecto), c.colorPrimario, c.colorSidebar, c.logoUrl, c.actividadEconomica, c.perfilCompania,
                c.estadoSaas, c.maxUsuarios, c.montoMensual != null ? c.montoMensual : null, c.proximoVencimiento || null, c.requiereConfirmacionCitas ? 1 : 0,
                c.provincia || null, c.canton || null, c.distrito || null, c.otrasSenas || null, c.regimenSimplificado ? 1 : 0,
                plazoClientes, plazoProveedores,
                c.id
              ]
            );
            await guardarHorarioAtencionCompania(pool, c.id, c.horarioAtencion);
            if (horarioDomicilioNormalizado !== undefined) await guardarHorarioDomicilioCompania(c.id, horarioDomicilioNormalizado);
            // Integración con el ERP: si cambió un dato que el ERP conoce del suscriptor, se le envía
            // (en segundo plano; nunca hace fallar el guardado).
            const antes = (exists as any[])[0];
            const idEditada = Number(c.id);
            if (!esCompaniaPlataforma(idEditada)) {
              if (antes.estadoSaas !== c.estadoSaas) erpServicio.alCambiarEstadoSaas(idEditada, c.estadoSaas).catch(() => {});
              else if (cambiaronDatosSuscriptor(antes, c)) erpServicio.solicitarSincronizacion(idEditada);
            }
            return res.json(c);
          }
        }
        if (!puedeEditarCamposSaas) Object.assign(c, await camposSaasDeAlta());
        else if (!c.maxUsuarios) c.maxUsuarios = (await camposSaasDeAlta()).maxUsuarios;
        const [result] = await pool.query(
          "INSERT INTO companias (nombreComercial, razonSocial, tipoIdentificacion, identificacion, correoEmisor, ivaPorDefecto, colorPrimario, colorSidebar, logoUrl, actividadEconomica, perfilCompania, estadoSaas, maxUsuarios, montoMensual, proximoVencimiento, requiereConfirmacionCitas, provincia, canton, distrito, otrasSenas, regimenSimplificado, plazoCreditoClientesDias, plazoCreditoProveedoresDias, reservaAutoConsultorio, reservaAutoDomicilio, whatsappReservas, mensajeWhatsappReservas) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, DEFAULT(plazoCreditoClientesDias)), COALESCE(?, DEFAULT(plazoCreditoProveedoresDias)), COALESCE(?, 1), COALESCE(?, 1), ?, ?)",
          [
            c.nombreComercial, c.razonSocial, c.tipoIdentificacion, c.identificacion, c.correoEmisor, parseFloat(c.ivaPorDefecto), c.colorPrimario, c.colorSidebar, c.logoUrl, c.actividadEconomica, c.perfilCompania,
            c.estadoSaas || 'PENDIENTE', c.maxUsuarios, c.montoMensual != null ? c.montoMensual : null, c.proximoVencimiento || null, c.requiereConfirmacionCitas ? 1 : 0,
            c.provincia || null, c.canton || null, c.distrito || null, c.otrasSenas || null, c.regimenSimplificado ? 1 : 0,
            plazoClientes, plazoProveedores,
            reservaConsultorio, reservaDomicilio, whatsappNormalizado, mensajeWhatsapp
          ]
        );
        c.id = (result as any).insertId;
        await guardarHorarioAtencionCompania(pool, c.id, c.horarioAtencion);
        if (horarioDomicilioNormalizado !== undefined) await guardarHorarioDomicilioCompania(c.id, horarioDomicilioNormalizado);

        // Servicios por defecto según el colegio profesional correspondiente
        // (Fisioterapia/Nutrición/Ambas únicamente — Spa no aplica).
        for (const s of serviciosDefectoParaPerfil(c.perfilCompania)) {
          await pool.query(
            "INSERT INTO servicios (idCompania, nombre, precio, porcentajeIva, duracionMinutos, codigoCabys, unidadMedida, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [c.id, s.nombre, s.precio, s.porcentajeIva, s.duracionMinutos, s.codigoCabys, s.unidadMedida, s.activo ? 1 : 0]
          );
        }

        // Avisar a los administradores de la empresa de plataforma de que
        // hay una empresa nueva pendiente de revisión/aprobación. Best-effort:
        // un fallo de correo no debe impedir que la empresa quede creada.
        const idPlataforma = idCompaniaPlataforma();
        if (c.id !== idPlataforma) {
          try {
            const [platRows] = await pool.query("SELECT * FROM companias WHERE id_compania = ?", [idPlataforma]);
            const platformCompany: Company | undefined = (platRows as any[]).map(row => normalizeRow(row, 'id_compania'))[0];
            const [smtpRows] = await pool.query("SELECT * FROM compania_smtp_config WHERE idCompania = ?", [idPlataforma]);
            const smtpRow = (smtpRows as any[])[0];
            const platformSmtp: CompaniaSmtpConfig | undefined = smtpRow ? { ...smtpRow, activo: !!smtpRow.activo } : undefined;
            const [adminRows] = await pool.query("SELECT * FROM usuarios WHERE idCompania = ? AND rol = 'Administrador'", [idPlataforma]);
            const adminUsers = (adminRows as any[]).map(row => normalizeRow(row, 'id_usuario'));

            if (platformCompany && platformSmtp && platformSmtp.activo && adminUsers.length > 0) {
              const rendered = renderNuevaEmpresaEmail({ platformCompany, nuevaEmpresa: c });
              for (const admin of adminUsers) {
                if (admin.correo) {
                  await sendMail(platformSmtp, { to: admin.correo, subject: rendered.subject, html: rendered.html, text: rendered.text });
                }
              }
            } else {
              console.log("[SaaS] Notificación de nueva empresa omitida (sin SMTP de plataforma activo o sin administradores destinatarios).");
            }
          } catch (mailErr: any) {
            console.error("[SaaS] Error enviando correo de nueva empresa a administradores de plataforma:", mailErr.message || mailErr);
          }
        }

        res.json(c);
      } else {
        if (horarioDomicilioNormalizado !== undefined) c.horarioDomicilio = horarioDomicilioNormalizado;
        const actualLocal = c.id ? localCompanies.find(item => item.id === Number(c.id)) : undefined;
        if (!puedeEditarCamposSaas) {
          if (actualLocal) {
            c.estadoSaas = actualLocal.estadoSaas;
            c.maxUsuarios = actualLocal.maxUsuarios;
            c.montoMensual = actualLocal.montoMensual;
            c.proximoVencimiento = actualLocal.proximoVencimiento;
          } else {
            Object.assign(c, await camposSaasDeAlta());
          }
        }
        if (c.id) {
          localCompanies = localCompanies.map(item => item.id === c.id ? c : item);
        } else {
          c.id = Math.max(0, ...localCompanies.map(item => item.id)) + 1;
          localCompanies.push(c);
          for (const s of serviciosDefectoParaPerfil(c.perfilCompania)) {
            localServicios.push({ ...s, id: Math.max(0, ...localServicios.map(item => item.id)) + 1, idCompania: c.id });
          }
        }
        res.json(c);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /** Datos para los correos de la plataforma a una empresa: empresa y SMTP de la plataforma y el
   * primer Administrador de la empresa destino. */
  async function correoPlataformaPara(companyId: number): Promise<{ platformCompany?: Company; platformSmtp?: CompaniaSmtpConfig; adminUser?: any }> {
    const idPlataforma = idCompaniaPlataforma();
    if (dbConnected && pool) {
      const [platRows] = await pool.query("SELECT * FROM companias WHERE id_compania = ?", [idPlataforma]);
      const platformCompany = (platRows as any[]).map(row => normalizeRow(row, 'id_compania'))[0];
      const [smtpRows] = await pool.query("SELECT * FROM compania_smtp_config WHERE idCompania = ?", [idPlataforma]);
      const smtpRow = (smtpRows as any[])[0];
      const platformSmtp = smtpRow ? { ...smtpRow, activo: !!smtpRow.activo } : undefined;
      const [userRows] = await pool.query("SELECT * FROM usuarios WHERE idCompania = ? AND rol = 'Administrador' LIMIT 1", [companyId]);
      const adminUser = (userRows as any[]).map(row => normalizeRow(row, 'id_usuario'))[0];
      return { platformCompany, platformSmtp, adminUser };
    }
    return {
      platformCompany: localCompanies.find(c => c.id === idPlataforma),
      platformSmtp: localSmtpConfigs.find(s => s.idCompania === idPlataforma),
      adminUser: localUsers.find(u => u.idCompania === companyId && u.rol === "Administrador")
    };
  }

  class EmpresaNoEncontradaError extends Error {}

  /**
   * Cambia el estado SaaS de una empresa y avisa por correo al aprobar/suspender/reactivar. Lo usan
   * POST /api/companies/:id/estado-saas y la suspensión automática por mora (integración ERP).
   * Después pide sincronizar la empresa con el ERP (en segundo plano, nunca hace fallar el cambio).
   */
  async function cambiarEstadoSaas(companyId: number, nuevoEstado: Company["estadoSaas"]): Promise<Company> {
    let company: Company | undefined;
    let estadoAnterior: Company["estadoSaas"] | undefined;

    if (dbConnected && pool) {
      const [rows] = await pool.query("SELECT * FROM companias WHERE id_compania = ?", [companyId]);
      company = (rows as any[]).map(row => normalizeRow(row, 'id_compania'))[0];
      if (!company) throw new EmpresaNoEncontradaError("Empresa no encontrada.");
      estadoAnterior = company.estadoSaas;
      await pool.query("UPDATE companias SET estadoSaas = ? WHERE id_compania = ?", [nuevoEstado, companyId]);
      company.estadoSaas = nuevoEstado;
    } else {
      company = localCompanies.find(c => c.id === companyId);
      if (!company) throw new EmpresaNoEncontradaError("Empresa no encontrada.");
      estadoAnterior = company.estadoSaas;
      company.estadoSaas = nuevoEstado;
      localCompanies = localCompanies.map(c => c.id === companyId ? company! : c);
    }

    if (nuevoEstado === "ACTIVA" || nuevoEstado === "SUSPENDIDA") {
      try {
        const { platformCompany, platformSmtp, adminUser } = await correoPlataformaPara(companyId);
        if (platformCompany && platformSmtp && platformSmtp.activo && adminUser && adminUser.correo) {
          const rendered = renderAccountStatusEmail({
            platformCompany,
            tenantCompany: company,
            nuevoEstado,
            estadoAnterior: estadoAnterior || "PENDIENTE"
          });
          await sendMail(platformSmtp, { to: adminUser.correo, subject: rendered.subject, html: rendered.html, text: rendered.text });
        } else {
          console.log("[SaaS] Notificación de estado omitida (sin SMTP de plataforma activo o sin usuario administrador destinatario).");
        }
      } catch (mailErr: any) {
        console.error("[SaaS] Error enviando correo de notificación de estado:", mailErr.message || mailErr);
      }
    }

    // Integración con el ERP: activo = (estado ACTIVA). Reactivar abre un periodo de mora nuevo.
    if (!esCompaniaPlataforma(companyId)) {
      await erpServicio.alCambiarEstadoSaas(companyId, nuevoEstado).catch(err => console.error("[ERP] Tras cambiar el estado SaaS:", err?.message || err));
    }
    return company;
  }

  app.post("/api/companies/:id/estado-saas", requireAuth, requireSaasAdmin, async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      const nuevoEstado = req.body.estadoSaas as Company["estadoSaas"];
      if (nuevoEstado !== "ACTIVA" && nuevoEstado !== "SUSPENDIDA" && nuevoEstado !== "PENDIENTE") {
        return res.status(400).json({ error: "estadoSaas inválido." });
      }
      // La empresa de plataforma nunca se suspende (dejaría sin acceso a la administración SaaS).
      if (esCompaniaPlataforma(companyId) && nuevoEstado !== "ACTIVA") {
        return res.status(400).json({ error: "La empresa de plataforma no se puede suspender ni dejar pendiente." });
      }
      res.json(await cambiarEstadoSaas(companyId, nuevoEstado));
    } catch (err: any) {
      if (err instanceof EmpresaNoEncontradaError) return res.status(404).json({ error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  // --- Integración con el ERP ELROTECH (facturación de las suscripciones) ---
  // Reglas y cliente HTTPS en server/erpIntegracion.ts; BD, job y rutas en server/erpServicio.ts.
  const erpServicio = crearServicioErp({
    pool: () => (dbConnected && pool ? pool : null),
    leerParametros: leerParametrosSistema,
    invalidarParametros: invalidarCacheParametros,
    esCompaniaPlataforma: id => esCompaniaPlataforma(id),
    idCompaniaPlataforma,
    cifrar: encryptSecret,
    descifrar: decryptSecret,
    cambiarEstadoSaas: (id, estado) => cambiarEstadoSaas(id, estado),
    enviarAvisoMora: async (idCompania, info) => {
      if (!dbConnected || !pool) return "sin-destino";
      const [rows] = await pool.query("SELECT * FROM companias WHERE id_compania = ?", [idCompania]);
      const tenantCompany: Company | undefined = (rows as any[]).map(row => normalizeRow(row, 'id_compania'))[0];
      const { platformCompany, platformSmtp, adminUser } = await correoPlataformaPara(idCompania);
      if (!tenantCompany || !platformCompany || !platformSmtp || !platformSmtp.activo || !adminUser?.correo) return "sin-destino";
      const rendered = renderAvisoSuspensionMoraEmail({ platformCompany, tenantCompany, ...info });
      await sendMail(platformSmtp, { to: adminUser.correo, subject: rendered.subject, html: rendered.html, text: rendered.text });
      return "enviado";
    }
  });
  registrarRutasErp(app, erpServicio, { requireAuth, requireSaasAdmin, idUsuario: req => sessionOf(req).userId });

  app.get("/api/companies/:id/pagos", requireAuth, requireSaasAdmin, async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM pagos_empresa WHERE idCompania = ? ORDER BY fecha DESC", [companyId]);
        res.json(rows);
      } else {
        res.json(localCompanyPayments.filter(p => p.idCompania === companyId).sort((a, b) => b.fecha.localeCompare(a.fecha)));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/companies/:id/pagos", requireAuth, requireSaasAdmin, async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      const p = req.body;

      if (dbConnected && pool) {
        const [result] = await pool.query(
          "INSERT INTO pagos_empresa (idCompania, fecha, monto, notas, registradoPor) VALUES (?, ?, ?, ?, ?)",
          [companyId, p.fecha, parseFloat(p.monto), p.notas || null, p.registradoPor || null]
        );
        p.id = (result as any).insertId;
        p.idCompania = companyId;

        if (p.montoMensual != null || p.proximoVencimiento != null) {
          await pool.query(
            "UPDATE companias SET montoMensual = COALESCE(?, montoMensual), proximoVencimiento = COALESCE(?, proximoVencimiento) WHERE id_compania = ?",
            [p.montoMensual != null ? parseFloat(p.montoMensual) : null, p.proximoVencimiento || null, companyId]
          );
          // La cuota la factura el ERP: si cambió, se le envía (en segundo plano).
          if (p.montoMensual != null) erpServicio.solicitarSincronizacion(companyId);
        }
      } else {
        p.id = Math.max(0, ...localCompanyPayments.map(item => item.id)) + 1;
        p.idCompania = companyId;
        localCompanyPayments.push(p);

        if (p.montoMensual != null || p.proximoVencimiento != null) {
          localCompanies = localCompanies.map(c => c.id === companyId
            ? { ...c, montoMensual: p.montoMensual != null ? p.montoMensual : c.montoMensual, proximoVencimiento: p.proximoVencimiento || c.proximoVencimiento }
            : c);
        }
      }

      res.json(p);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Users
  app.get("/api/users", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (dbConnected && pool) {
        const [rows] = isSaasAdmin(session)
          ? await pool.query("SELECT * FROM usuarios")
          : await pool.query("SELECT * FROM usuarios WHERE idCompania = ?", [session.idCompania]);
        res.json((rows as any[]).map(row => normalizeRow(row, 'id_usuario')).map(sanitizeUser));
      } else {
        res.json((isSaasAdmin(session) ? localUsers : localUsers.filter(u => u.idCompania === session.idCompania)).map(sanitizeUser));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const u = req.body;
      // Invalida la caché de sesión vigente del usuario editado (rol/activo pudieron cambiar).
      const idUsuarioEditado = parseInt(u?.id);
      if (Number.isFinite(idUsuarioEditado)) {
        res.on("finish", () => cacheUsuariosVigentes.invalidate(idUsuarioEditado));
        cacheUsuariosVigentes.invalidate(idUsuarioEditado);
      }
      const sessionUsuarios = getSession(req);
      // Solo el SaaS admin (o el alta pública de la primera empresa, sin sesión) elige la empresa
      // desde el body. Con sesión de empresa, el idCompania es SIEMPRE el de la sesión: así un
      // administrador no puede mover ni crear usuarios en otra empresa.
      const idCompania = sessionUsuarios && !isSaasAdmin(sessionUsuarios)
        ? sessionUsuarios.idCompania
        : parseInt(u.idCompania);
      u.idCompania = idCompania;
      // Quien puede cambiar rol/activo: SaaS admin o Administrador de esta empresa.
      const esAdminDeEmpresa = !!sessionUsuarios && (
        isSaasAdmin(sessionUsuarios) ||
        (sessionUsuarios.idCompania === idCompania && sessionUsuarios.rol === "Administrador")
      );

      let totalUsuariosCompania = 0;
      let maxUsuarios = 5;
      if (dbConnected && pool) {
        const [companyRows] = await pool.query("SELECT maxUsuarios FROM companias WHERE id_compania = ?", [idCompania]);
        const companyRow = (companyRows as any[])[0];
        if (companyRow) maxUsuarios = companyRow.maxUsuarios;
        const [countRows] = await pool.query("SELECT COUNT(*) as count FROM usuarios WHERE idCompania = ?", [idCompania]);
        totalUsuariosCompania = (countRows as any)[0].count;
      } else {
        const company = localCompanies.find(c => c.id === idCompania);
        if (company) maxUsuarios = company.maxUsuarios;
        totalUsuariosCompania = localUsers.filter(item => item.idCompania === idCompania).length;
      }

      // Editing an existing user, or adding staff to a company that already has at least one
      // user, requires auth (that company's own Administrador, the user themself, or the SaaS
      // admin). Creating the very first user of a brand-new company stays open — that's the
      // public self-registration flow's founding admin (see POST /api/companies immediately
      // before it, in the same flow).
      if (u.id || totalUsuariosCompania > 0) {
        const session = sessionUsuarios;
        const authorized = !!session && (
          isSaasAdmin(session) ||
          (u.id && session.userId === parseInt(u.id)) ||
          (session.idCompania === idCompania && session.rol === "Administrador")
        );
        if (!authorized) {
          return res.status(403).json({ error: "No autorizado." });
        }
      }

      // El rol solo se toma del body al crear o cuando edita un administrador; en la auto-edición
      // de un no administrador se ignora (más abajo), pero cuando se usa debe ser un rol válido.
      if ((!u.id || esAdminDeEmpresa) && !ROLES_USUARIO.includes(u.rol)) {
        return res.status(400).json({ error: "Rol no válido." });
      }
      // Un no administrador nunca crea usuarios ni cae al INSERT con un id suyo: evita escalar
      // privilegios creando una fila nueva con el rol que él elija.
      if (u.id && !esAdminDeEmpresa && !(sessionUsuarios && sessionUsuarios.userId === parseInt(u.id))) {
        return res.status(403).json({ error: "No autorizado." });
      }

      if (!u.id) {
        // Solo se valida el límite al CREAR un usuario nuevo, no al editar uno existente.
        const activosActuales = dbConnected && pool
          ? ((await pool.query("SELECT COUNT(*) as count FROM usuarios WHERE idCompania = ? AND activo = 1", [idCompania]))[0] as any)[0].count
          : localUsers.filter(item => item.idCompania === idCompania && item.activo).length;

        if (activosActuales >= maxUsuarios) {
          return res.status(400).json({ error: `Límite de usuarios alcanzado (máximo ${maxUsuarios}).` });
        }

        // El usuario de login es global (POST /api/login lo busca sin acotar por empresa), así
        // que debe ser único en todo el sistema, no solo dentro de esta empresa.
        const usuarioNormalizado = String(u.usuario || "").trim().toLowerCase();
        const yaExiste = dbConnected && pool
          ? ((await pool.query("SELECT id_usuario FROM usuarios WHERE LOWER(usuario) = ?", [usuarioNormalizado]))[0] as any).length > 0
          : localUsers.some(item => item.usuario.trim().toLowerCase() === usuarioNormalizado);
        if (yaExiste) {
          return res.status(400).json({ error: "El nombre de usuario ya se encuentra registrado." });
        }
      }

      // La contraseña PROPIA solo se cambia con POST /api/me/contrasena, que exige la actual. Antes
      // esta ruta aceptaba una nueva sin verificar nada: con una sesión abierta (equipo ajeno o
      // robado) cualquiera podía cambiarla y adueñarse de la cuenta.
      const esAutoEdicion = !!u.id && !!sessionUsuarios && Number(u.id) === sessionUsuarios.userId;
      if (esAutoEdicion && u.contrasena && String(u.contrasena).trim()) {
        return res.status(400).json({ error: "Para cambiar su contraseña use Mi perfil → Cambiar contraseña." });
      }
      // Si un administrador asigna la contraseña de OTRO usuario, se cierran las sesiones abiertas
      // de ese usuario (sube su versión de sesión).
      const cambiaContrasenaAjena = !esAutoEdicion && !!u.id && !!(u.contrasena && String(u.contrasena).trim());

      if (dbConnected && pool) {
        if (u.id) {
          // Scoped by idCompania too — an id that only collides by coincidence (never a real
          // edit of this tenant's own record) must fall through to INSERT below instead of
          // overwriting another company's user.
          const [exists] = await pool.query("SELECT * FROM usuarios WHERE id_usuario = ? AND idCompania = ?", [u.id, idCompania]);
          const existingRow = (exists as any[])[0];
          if (!existingRow && !esAdminDeEmpresa) {
            // Auto-edición de un no administrador sin fila vigente: nunca se convierte en INSERT.
            return res.status(403).json({ error: "No autorizado." });
          }
          if (existingRow) {
            // Un no administrador (auto-edición desde Mi perfil) conserva lo que ya tiene en la
            // base para rol, empresa, estado y usuario de acceso; el body no puede cambiarlos.
            const rolFinal = esAdminDeEmpresa ? u.rol : existingRow.rol;
            const activoFinal = esAdminDeEmpresa ? (u.activo ? 1 : 0) : (existingRow.activo ? 1 : 0);
            const usuarioFinal = esAdminDeEmpresa ? u.usuario : existingRow.usuario;
            const idCompaniaFinal = esAdminDeEmpresa ? idCompania : existingRow.idCompania;
            // Un `contrasena` vacío significa "no está cambiando la contraseña" (el cliente ya
            // no recibe hashes de contraseña en ninguna respuesta, así que un guardado que solo
            // cambia p.ej. `activo` llega sin este campo) — se conserva el hash existente en ese
            // caso en vez de sobreescribirlo con un valor vacío.
            const contrasenaFinal = u.contrasena && String(u.contrasena).trim()
              ? hashPassword(String(u.contrasena).trim())
              : existingRow.contrasena;
            await pool.query(
              "UPDATE usuarios SET idCompania = ?, nombre = ?, usuario = ?, correo = ?, contrasena = ?, rol = ?, activo = ?, ubicacionDireccion = ?, ubicacionLat = ?, ubicacionLng = ?, maxTiempoTrasladoMinutos = ?, sesionVersion = sesionVersion + ? WHERE id_usuario = ?",
              [idCompaniaFinal, u.nombre, usuarioFinal, u.correo, contrasenaFinal, rolFinal, activoFinal, u.ubicacionDireccion || null, u.ubicacionLat != null ? parseFloat(u.ubicacionLat) : null, u.ubicacionLng != null ? parseFloat(u.ubicacionLng) : null, u.maxTiempoTrasladoMinutos || 45, cambiaContrasenaAjena ? 1 : 0, u.id]
            );
            const { contrasena, ...safeUser } = u;
            return res.json({ ...safeUser, idCompania: idCompaniaFinal, rol: rolFinal, activo: !!activoFinal, usuario: usuarioFinal });
          }
        }
        const contrasenaNueva = hashPassword(String(u.contrasena || "").trim());
        const [result] = await pool.query(
          "INSERT INTO usuarios (idCompania, nombre, usuario, correo, contrasena, rol, activo, ubicacionDireccion, ubicacionLat, ubicacionLng, maxTiempoTrasladoMinutos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [parseInt(u.idCompania), u.nombre, u.usuario, u.correo, contrasenaNueva, u.rol, u.activo === false ? 0 : 1, u.ubicacionDireccion || null, u.ubicacionLat != null ? parseFloat(u.ubicacionLat) : null, u.ubicacionLng != null ? parseFloat(u.ubicacionLng) : null, u.maxTiempoTrasladoMinutos || 45]
        );
        u.id = (result as any).insertId;
        u.activo = u.activo === false ? false : true;
        const { contrasena, ...safeUser } = u;
        res.json(safeUser);
      } else {
        if (u.id) {
          const existing = localUsers.find(item => item.id === u.id && item.idCompania === idCompania);
          if (!existing) {
            return res.status(403).json({ error: "No autorizado." });
          }
          const merged = {
            ...u,
            // Misma regla que en MySQL: un no administrador no cambia rol, empresa, estado ni usuario.
            ...(esAdminDeEmpresa ? {} : { rol: existing.rol, idCompania: existing.idCompania, activo: existing.activo, usuario: existing.usuario }),
            contrasena: u.contrasena && String(u.contrasena).trim() ? hashPassword(String(u.contrasena).trim()) : existing?.contrasena
          };
          localUsers = localUsers.map(item => item.id === u.id ? merged : item);
          const { contrasena, ...safeUser } = merged;
          return res.json(safeUser);
        } else {
          u.id = Math.max(0, ...localUsers.map(item => item.id)) + 1;
          u.activo = u.activo === false ? false : true;
          u.contrasena = hashPassword(String(u.contrasena || "").trim());
          localUsers.push(u);
        }
        const { contrasena, ...safeUser } = u;
        res.json(safeUser);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Patients
  app.get("/api/patients", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM pacientes WHERE idCompania = ? AND activo = 1", [session.idCompania]);
        const formatted = (rows as any[]).map(row => {
          const norm = normalizeRow(row, 'id_paciente');
          return {
            ...norm,
            diabetes: !!norm.diabetes,
            hipertension: !!norm.hipertension,
            gastritis: !!norm.gastritis,
            estrenimiento: !!norm.estrenimiento
          };
        });
        res.json(formatted);
      } else {
        res.json(localPatients.filter(p => p.idCompania === session.idCompania && p.activo !== false));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/patients", requireAuth, async (req, res) => {
    try {
      const p = req.body;
      p.idCompania = sessionOf(req).idCompania;
      if (dbConnected && pool) {
        if (p.id) {
          // Scoped by idCompania too — see comment on the equivalent usuarios check above.
          const [exists] = await pool.query("SELECT * FROM pacientes WHERE id_paciente = ? AND idCompania = ?", [p.id, parseInt(p.idCompania)]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE pacientes SET idCompania = ?, nombreCompleto = ?, fechaNacimiento = ?, edad = ?, sexo = ?, ocupacion = ?, correoElectronico = ?, situacionVivienda = ?, tipoIdentificacion = ?, identificacion = ?, telefono = ?, provinciaId = ?, cantonId = ?, distritoId = ?, otrasSenas = ?, diabetes = ?, hipertension = ?, gastritis = ?, estrenimiento = ?, alergiasAlimentarias = ?, fracturas = ?, esguinces = ?, cirugiasOrtopedicas = ?, actividadFisica = ? WHERE id_paciente = ?",
              [
                parseInt(p.idCompania), p.nombreCompleto, p.fechaNacimiento, parseInt(p.edad), p.sexo || null, p.ocupacion, p.correoElectronico, p.situacionVivienda, p.tipoIdentificacion, p.identificacion, p.telefono, parseInt(p.provinciaId), parseInt(p.cantonId), parseInt(p.distritoId), p.otrasSenas, p.diabetes ? 1 : 0, p.hipertension ? 1 : 0, p.gastritis ? 1 : 0, p.estrenimiento ? 1 : 0, p.alergiasAlimentarias, p.fracturas, p.esguinces, p.cirugiasOrtopedicas, p.actividadFisica,
                p.id
              ]
            );
            return res.json(p);
          }
        }
        const [result] = await pool.query(
          "INSERT INTO pacientes (idCompania, nombreCompleto, fechaNacimiento, edad, sexo, ocupacion, correoElectronico, situacionVivienda, tipoIdentificacion, identificacion, telefono, provinciaId, cantonId, distritoId, otrasSenas, diabetes, hipertension, gastritis, estrenimiento, alergiasAlimentarias, fracturas, esguinces, cirugiasOrtopedicas, actividadFisica) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            parseInt(p.idCompania), p.nombreCompleto, p.fechaNacimiento, parseInt(p.edad), p.sexo || null, p.ocupacion, p.correoElectronico, p.situacionVivienda, p.tipoIdentificacion, p.identificacion, p.telefono, parseInt(p.provinciaId), parseInt(p.cantonId), parseInt(p.distritoId), p.otrasSenas, p.diabetes ? 1 : 0, p.hipertension ? 1 : 0, p.gastritis ? 1 : 0, p.estrenimiento ? 1 : 0, p.alergiasAlimentarias, p.fracturas, p.esguinces, p.cirugiasOrtopedicas, p.actividadFisica
          ]
        );
        p.id = (result as any).insertId;
        res.json(p);
      } else {
        if (p.id) {
          localPatients = localPatients.map(item => item.id === p.id ? p : item);
        } else {
          p.id = Math.max(0, ...localPatients.map(item => item.id)) + 1;
          localPatients.push(p);
        }
        res.json(p);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Soft-delete: nunca se borra la fila (conserva el historial de consultas/facturas
  // enlazadas al paciente) — solo se marca activo = 0 y GET /api/patients deja de listarlo.
  app.delete("/api/patients/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const idCompania = sessionOf(req).idCompania;
      if (dbConnected && pool) {
        const [result] = await pool.query(
          "UPDATE pacientes SET activo = 0 WHERE id_paciente = ? AND idCompania = ?",
          [id, idCompania]
        );
        if ((result as any).affectedRows === 0) {
          return res.status(404).json({ error: "Paciente no encontrado." });
        }
        res.json({ success: true });
      } else {
        const idx = localPatients.findIndex(p => p.id === id && p.idCompania === idCompania);
        if (idx === -1) return res.status(404).json({ error: "Paciente no encontrado." });
        localPatients[idx] = { ...localPatients[idx], activo: false };
        res.json({ success: true });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Consultations
  app.get("/api/consultations", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (dbConnected && pool) {
        const [rows] = await pool.query(
          `SELECT ${CONSULTA_EVAL_SELECT} FROM consultas c ${CONSULTA_EVAL_JOIN} WHERE c.idCompania = ? AND c.activo = 1`,
          [session.idCompania]
        );
        const formatted = (rows as any[]).map(row => {
          const norm = normalizeRow(row, 'id_consulta');
          const evaluaciones = reconstruirEvaluaciones(row);
          return {
            ...norm,
            // `norm.estado` es la columna legada tinyint(1) de ConsultorioDB_schema.sql (sin
            // relación con esto) — se pisa explícitamente con la columna real estadoConsulta.
            estado: norm.estadoConsulta,
            ...evaluaciones
          };
        });
        res.json(formatted);
      } else {
        res.json(localConsultations.filter(c => c.idCompania === session.idCompania && c.activo !== false));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/consultations", requireAuth, async (req, res) => {
    try {
      const con = req.body;
      con.idCompania = sessionOf(req).idCompania;
      if (con.dieta?.macros) {
        const m = con.dieta.macros;
        const pctValores = [m.carbohidratosPct, m.proteinasPct, m.grasasPct];
        if (pctValores.some(v => v != null && (v < 0 || v > 100))) {
          return res.status(400).json({ error: "Cada porcentaje de macronutrientes debe estar entre 0 y 100." });
        }
        if (pctValores.every(v => v != null) && pctValores.reduce((s, v) => s + (v as number), 0) !== 100) {
          return res.status(400).json({ error: "Carbohidratos + proteínas + grasas deben sumar 100% cuando los tres tienen valor." });
        }
      }
      if (dbConnected && pool) {
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          if (con.id) {
            // Scoped by idCompania too — see comment on the equivalent usuarios check above.
            const [exists] = await connection.query("SELECT id_consulta FROM consultas WHERE id_consulta = ? AND idCompania = ?", [con.id, parseInt(con.idCompania)]);
            if ((exists as any).length > 0) {
              await connection.query(
                "UPDATE consultas SET idPaciente = ?, idCompania = ?, fecha = ?, tipo = ?, motivo = ?, horasSueno = ?, compromiso = ?, anotacionesGenerales = ?, estadoConsulta = ? WHERE id_consulta = ?",
                [
                  parseInt(con.idPaciente), parseInt(con.idCompania), con.fecha, con.tipo, con.motivo, parseFloat(con.horasSueno), parseInt(con.compromiso), con.anotacionesGenerales,
                  con.estado || 'ABIERTA',
                  con.id
                ]
              );
              await guardarEvaluacionesConsulta(connection, con.id, con);
              await connection.commit();
              return res.json(con);
            }
          }
          const [result] = await connection.query(
            "INSERT INTO consultas (idPaciente, idCompania, fecha, tipo, motivo, horasSueno, compromiso, anotacionesGenerales, estadoConsulta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
              parseInt(con.idPaciente), parseInt(con.idCompania), con.fecha, con.tipo, con.motivo, parseFloat(con.horasSueno), parseInt(con.compromiso), con.anotacionesGenerales,
              con.estado || 'ABIERTA'
            ]
          );
          con.id = (result as any).insertId;
          await guardarEvaluacionesConsulta(connection, con.id, con);
          await connection.commit();
          res.json(con);
        } catch (err) {
          await connection.rollback();
          throw err;
        } finally {
          connection.release();
        }
      } else {
        if (con.id) {
          localConsultations = localConsultations.map(item => item.id === con.id ? con : item);
        } else {
          con.id = Math.max(0, ...localConsultations.map(item => item.id)) + 1;
          localConsultations.push(con);
        }
        res.json(con);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/consultations/:id/estado", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      const id = parseInt(req.params.id);
      const estado = req.body.estado;
      if (estado !== 'ABIERTA' && estado !== 'CERRADA') {
        return res.status(400).json({ error: "Estado inválido. Use 'ABIERTA' o 'CERRADA'." });
      }
      if (dbConnected && pool) {
        const [result] = await pool.query(
          "UPDATE consultas SET estadoConsulta = ? WHERE id_consulta = ? AND idCompania = ?",
          [estado, id, session.idCompania]
        );
        if ((result as any).affectedRows === 0) {
          return res.status(404).json({ error: "Consulta no encontrada." });
        }
        const [rows] = await pool.query(`SELECT ${CONSULTA_EVAL_SELECT} FROM consultas c ${CONSULTA_EVAL_JOIN} WHERE c.id_consulta = ?`, [id]);
        const row = (rows as any[])[0];
        if (!row) return res.status(404).json({ error: "Consulta no encontrada." });
        const norm = normalizeRow(row, 'id_consulta');
        const evaluaciones = reconstruirEvaluaciones(row);
        res.json({
          ...norm,
          // `norm.estado` es la columna legada tinyint(1) de ConsultorioDB_schema.sql (sin
          // relación con esto) — se pisa explícitamente con la columna real estadoConsulta.
          estado: norm.estadoConsulta,
          ...evaluaciones
        });
      } else {
        const idx = localConsultations.findIndex(c => c.id === id && c.idCompania === session.idCompania);
        if (idx === -1) return res.status(404).json({ error: "Consulta no encontrada." });
        localConsultations[idx] = { ...localConsultations[idx], estado };
        res.json(localConsultations[idx]);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Soft-delete: nunca se borra la fila (conserva el historial clínico) — solo se marca
  // activo = 0 y GET /api/consultations deja de listarla.
  app.delete("/api/consultations/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const idCompania = sessionOf(req).idCompania;
      if (dbConnected && pool) {
        const [result] = await pool.query(
          "UPDATE consultas SET activo = 0 WHERE id_consulta = ? AND idCompania = ?",
          [id, idCompania]
        );
        if ((result as any).affectedRows === 0) {
          return res.status(404).json({ error: "Consulta no encontrada." });
        }
        res.json({ success: true });
      } else {
        const idx = localConsultations.findIndex(c => c.id === id && c.idCompania === idCompania);
        if (idx === -1) return res.status(404).json({ error: "Consulta no encontrada." });
        localConsultations[idx] = { ...localConsultations[idx], activo: false };
        res.json({ success: true });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Citas (Appointments)
  app.get("/api/citas", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM citas WHERE idCompania = ?", [session.idCompania]);
        res.json((rows as any[]).map(row => normalizeRow(row, 'id')));
      } else {
        res.json(localCitas.filter(c => c.idCompania === session.idCompania));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/citas", requireAuth, async (req, res) => {
    try {
      const ct = req.body ?? {};
      const idCompania: number = sessionOf(req).idCompania;
      ct.idCompania = idCompania;
      const idCitaBody = ct.id ? parseInt(ct.id) : null;
      const idPaciente = parseInt(ct.idPaciente);
      const idProf = parseInt(ct.idUsuarioNutricionista);
      const duracion = parseInt(ct.duracionMinutos);
      const idServicio = ct.idServicio ? parseInt(ct.idServicio) : null;
      const estado = ct.estadoCita;
      const tipoVisita = ct.tipoVisita === "DOMICILIO" ? "DOMICILIO" : "CONSULTORIO";

      if (!ESTADOS_CITA.includes(estado)) return res.status(400).json({ error: "Estado de cita inválido." });
      if (!esFechaHoraValida(ct.fechaHora)) return res.status(400).json({ error: "Fecha y hora de la cita inválidas." });
      if (!idPaciente || !idProf) return res.status(400).json({ error: "Falta el paciente o el profesional de la cita." });
      if (!(duracion > 0)) return res.status(400).json({ error: "La duración de la cita no es válida." });
      if (ct.idServicio && !idServicio) return res.status(400).json({ error: "Servicio inválido." });
      const profesionalCita = await fetchUserById(idProf);
      if (profesionalCita?.rol === "Contador") return res.status(400).json({ error: "El usuario seleccionado no puede atender citas." });
      const fecha: string = ct.fechaHora.slice(0, 10);

      // Reglas de agenda (transición de estado, fecha pasada, solape con otras citas del profesional).
      const validarAgendaCita = (existing: any, citasDelDia: any[], facturada: boolean) => {
        const errTransicion = validarTransicionEstado(existing ? existing.estadoCita : null, estado, { facturada });
        if (errTransicion) throw new CitaError(400, errTransicion);
        if (!esEstadoActivo(estado)) return; // registrar/editar en el pasado es válido si ya está cerrada/cancelada
        const pasoAActivo = !existing || !esEstadoActivo(existing.estadoCita);
        const fechaCambio = !existing || String(existing.fechaHora).slice(0, 16) !== ct.fechaHora;
        if ((pasoAActivo || fechaCambio) && fechaHoraEsPasada(ct.fechaHora)) {
          throw new CitaError(400, "No se puede programar ni confirmar una cita en una fecha y hora pasada.");
        }
        const cambioSlot = pasoAActivo || fechaCambio
          || Number(existing.idUsuarioNutricionista) !== idProf
          || Number(existing.duracionMinutos) !== duracion;
        if (cambioSlot && haySolapeConCitas({
          candidatoInicioMin: minutosDesdeMedianoche(ct.fechaHora.slice(11)),
          duracionMin: duracion,
          fecha,
          citasDelDia,
          excluirId: existing ? existing.id : null
        })) {
          throw new CitaError(409, "Este profesional ya tiene otra cita en ese horario. Elija otra fecha u hora.");
        }
      };

      const db = dbConnected && pool ? pool : null;

      // Fase 1 (sin bloqueo): pertenencia a la empresa de la sesión y cita actual.
      let profesional: any;
      let pacienteOk = false;
      let servicioOk = true;
      let existingPre: any;
      if (db) {
        const [uRows] = await db.query("SELECT * FROM usuarios WHERE id_usuario = ? AND idCompania = ?", [idProf, idCompania]);
        profesional = (uRows as any[]).map(r => normalizeRow(r, "id_usuario"))[0];
        const [pRows] = await db.query("SELECT id_paciente FROM pacientes WHERE id_paciente = ? AND idCompania = ?", [idPaciente, idCompania]);
        pacienteOk = (pRows as any[]).length > 0;
        if (idServicio) {
          const [sRows] = await db.query("SELECT id_servicio FROM servicios WHERE id_servicio = ? AND idCompania = ?", [idServicio, idCompania]);
          servicioOk = (sRows as any[]).length > 0;
        }
        if (idCitaBody) {
          const [eRows] = await db.query("SELECT * FROM citas WHERE id = ? AND idCompania = ?", [idCitaBody, idCompania]);
          existingPre = (eRows as any[])[0];
        }
      } else {
        profesional = localUsers.find(u => u.id === idProf && u.idCompania === idCompania);
        pacienteOk = localPatients.some(p => p.id === idPaciente && p.idCompania === idCompania);
        if (idServicio) servicioOk = localServicios.some(s => s.id === idServicio && s.idCompania === idCompania);
        if (idCitaBody) existingPre = localCitas.find(c => c.id === idCitaBody && c.idCompania === idCompania);
      }
      if (!profesional) return res.status(400).json({ error: "El profesional no pertenece a esta empresa." });
      if (!pacienteOk) return res.status(400).json({ error: "El paciente no pertenece a esta empresa." });
      if (!servicioOk) return res.status(400).json({ error: "El servicio no pertenece a esta empresa." });

      // Reagendar una cita a domicilio: recalcular el traslado (misma lógica que la ruta pública).
      // Si no se puede calcular se conserva el valor anterior. Excederlo se permite (personal
      // interno) pero se devuelve una advertencia.
      let advertencia: string | undefined;
      const latPac = ct.pacienteLat != null ? parseFloat(ct.pacienteLat) : NaN;
      const lngPac = ct.pacienteLng != null ? parseFloat(ct.pacienteLng) : NaN;
      const reagendada = !!existingPre && (String(existingPre.fechaHora).slice(0, 16) !== ct.fechaHora || Number(existingPre.idUsuarioNutricionista) !== idProf);
      if (tipoVisita === "DOMICILIO" && esEstadoActivo(estado) && reagendada && !isNaN(latPac) && !isNaN(lngPac)
          && profesional.ubicacionLat != null && profesional.ubicacionLng != null) {
        try {
          let citasPrevias: any[];
          if (db) {
            const [r] = await db.query("SELECT * FROM citas WHERE idUsuarioNutricionista = ? AND fechaHora LIKE ? AND estadoCita <> 'CANCELADA'", [idProf, `${fecha}%`]);
            citasPrevias = r as any[];
          } else {
            citasPrevias = localCitas.filter(c => c.idUsuarioNutricionista === idProf && c.fechaHora.startsWith(fecha) && c.estadoCita !== "CANCELADA");
          }
          const citaAnterior = citasPrevias
            .filter(c => c.id !== existingPre.id && c.fechaHora < ct.fechaHora)
            .sort((a, b) => (a.fechaHora < b.fechaHora ? 1 : -1))[0];
          let origenLat = parseFloat(profesional.ubicacionLat);
          let origenLng = parseFloat(profesional.ubicacionLng);
          if (citaAnterior && citaAnterior.tipoVisita === "DOMICILIO" && citaAnterior.pacienteLat != null && citaAnterior.pacienteLng != null) {
            origenLat = parseFloat(citaAnterior.pacienteLat);
            origenLng = parseFloat(citaAnterior.pacienteLng);
          }
          const tiempo = await calcularTiempoTrasladoMinutos({ origenLat, origenLng, destinoLat: latPac, destinoLng: lngPac });
          ct.tiempoTrasladoMinutos = tiempo;
          const maxTraslado = profesional.maxTiempoTrasladoMinutos != null ? Number(profesional.maxTiempoTrasladoMinutos) : null;
          if (maxTraslado != null && tiempo > maxTraslado) {
            advertencia = `El tiempo de traslado estimado (${tiempo} min) supera el máximo que este profesional acepta (${maxTraslado} min).`;
          }
        } catch (err: any) {
          // TrasladoNoCalculableError, sin API key o falla de red: se conserva el traslado anterior.
          console.warn("No se pudo recalcular el traslado de la cita reagendada:", err?.message || err);
        }
      }

      const valores = [
        idCompania, idPaciente, idProf, ct.idConsulta || null, idServicio, ct.fechaHora, duracion, estado, ct.notas || "",
        tipoVisita, ct.direccionDomicilio || null,
        ct.pacienteLat != null ? parseFloat(ct.pacienteLat) : null,
        ct.pacienteLng != null ? parseFloat(ct.pacienteLng) : null,
        ct.tiempoTrasladoMinutos != null ? parseInt(ct.tiempoTrasladoMinutos) : null
      ];

      if (db) {
        // Fase 2: transacción con lock sobre el profesional (siempre existe; ver POST /api/public/citas)
        // para que dos solicitudes simultáneas no agenden doble.
        const connection = await db.getConnection();
        try {
          await connection.beginTransaction();
          await connection.query("SELECT id_usuario FROM usuarios WHERE id_usuario = ? FOR UPDATE", [idProf]);

          let existing: any;
          if (idCitaBody) {
            const [eRows] = await connection.query("SELECT * FROM citas WHERE id = ? AND idCompania = ?", [idCitaBody, idCompania]);
            existing = (eRows as any[])[0];
          }
          const [cRows] = await connection.query("SELECT * FROM citas WHERE idUsuarioNutricionista = ? AND fechaHora LIKE ? AND estadoCita <> 'CANCELADA'", [idProf, `${fecha}%`]);
          let facturada = false;
          if (existing && existing.estadoCita === "COMPLETADA" && estado === "CANCELADA") {
            const [fRows] = await connection.query("SELECT id_factura FROM facturas WHERE idCita = ? AND idCompania = ? AND estado IN ('ACEPTADA', 'ENVIADA') LIMIT 1", [existing.id, idCompania]);
            facturada = (fRows as any[]).length > 0;
          }
          validarAgendaCita(existing, cRows as any[], facturada);

          // confirmacionEnviadaEn / recordatorioEnviadoEn / cancelacionEnviadaEn son columnas sin uso:
          // ya no se tocan (quedan como estén en la base).
          if (existing) {
            await connection.query(
              "UPDATE citas SET idCompania = ?, idPaciente = ?, idUsuarioNutricionista = ?, idConsulta = ?, idServicio = ?, fechaHora = ?, duracionMinutos = ?, estadoCita = ?, notas = ?, tipoVisita = ?, direccionDomicilio = ?, pacienteLat = ?, pacienteLng = ?, tiempoTrasladoMinutos = ? WHERE id = ?",
              [...valores, existing.id]
            );
            ct.id = existing.id;
          } else {
            const [result] = await connection.query(
              "INSERT INTO citas (idCompania, idPaciente, idUsuarioNutricionista, idConsulta, idServicio, fechaHora, duracionMinutos, estadoCita, notas, tipoVisita, direccionDomicilio, pacienteLat, pacienteLng, tiempoTrasladoMinutos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              valores
            );
            ct.id = (result as any).insertId;
          }
          await connection.commit();
        } catch (err) {
          try { await connection.rollback(); } catch { /* conexión ya caída */ }
          throw err;
        } finally {
          connection.release();
        }
      } else {
        const existing = idCitaBody ? localCitas.find(c => c.id === idCitaBody && c.idCompania === idCompania) : undefined;
        const citasDelDia = localCitas.filter(c => c.idUsuarioNutricionista === idProf && c.fechaHora.startsWith(fecha) && c.estadoCita !== "CANCELADA");
        const facturada = !!existing && existing.estadoCita === "COMPLETADA" && estado === "CANCELADA"
          && localFacturas.some(f => f.idCita === existing.id && f.idCompania === idCompania && (f.estado === "ACEPTADA" || f.estado === "ENVIADA"));
        validarAgendaCita(existing, citasDelDia, facturada);
        if (existing) {
          ct.id = existing.id;
          localCitas = localCitas.map(item => item.id === existing.id ? ct : item);
        } else {
          ct.id = Math.max(0, ...localCitas.map(item => item.id)) + 1;
          localCitas.push(ct);
        }
      }
      res.json(advertencia ? { ...ct, advertencia } : ct);
    } catch (err: any) {
      if (err instanceof CitaError) return res.status(err.status).json({ error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  // Las citas nunca se eliminan (ver POST /api/citas) — solo cambian de
  // estadoCita a CANCELADA, para conservar el historial. Por eso no existe
  // un DELETE /api/citas/:id.

  // 9. Calendar Blocks (specialist agenda blocking)
  app.get("/api/calendar-blocks", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM calendar_blocks WHERE idCompania = ?", [session.idCompania]);
        res.json(rows);
      } else {
        res.json(localCalendarBlocks.filter(b => b.idCompania === session.idCompania));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/calendar-blocks", requireAuth, async (req, res) => {
    try {
      const b = req.body;
      b.idCompania = sessionOf(req).idCompania;
      if (dbConnected && pool) {
        if (b.id) {
          // Scoped by idCompania too — see comment on the equivalent usuarios check above.
          const [exists] = await pool.query("SELECT id FROM calendar_blocks WHERE id = ? AND idCompania = ?", [b.id, parseInt(b.idCompania)]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE calendar_blocks SET idCompania = ?, idUsuarioNutricionista = ?, fechaInicio = ?, fechaFin = ?, horaInicio = ?, horaFin = ?, motivo = ? WHERE id = ?",
              [parseInt(b.idCompania), parseInt(b.idUsuarioNutricionista), b.fechaInicio, b.fechaFin, b.horaInicio || null, b.horaFin || null, b.motivo || '', b.id]
            );
            return res.json(b);
          }
        }
        const [result] = await pool.query(
          "INSERT INTO calendar_blocks (idCompania, idUsuarioNutricionista, fechaInicio, fechaFin, horaInicio, horaFin, motivo) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [parseInt(b.idCompania), parseInt(b.idUsuarioNutricionista), b.fechaInicio, b.fechaFin, b.horaInicio || null, b.horaFin || null, b.motivo || '']
        );
        b.id = (result as any).insertId;
        res.json(b);
      } else {
        if (b.id) {
          localCalendarBlocks = localCalendarBlocks.map(item => item.id === b.id ? b : item);
        } else {
          b.id = Math.max(0, ...localCalendarBlocks.map(item => item.id)) + 1;
          localCalendarBlocks.push(b);
        }
        res.json(b);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/calendar-blocks/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const idCompania = sessionOf(req).idCompania;
      if (dbConnected && pool) {
        await pool.query("DELETE FROM calendar_blocks WHERE id = ? AND idCompania = ?", [id, idCompania]);
        res.json({ success: true });
      } else {
        localCalendarBlocks = localCalendarBlocks.filter(item => !(item.id === id && item.idCompania === idCompania));
        res.json({ success: true });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/porcentajes-dieta", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM compania_porcentajes_dieta WHERE idCompania = ?", [session.idCompania]);
        res.json(rows);
      } else {
        res.json(localPorcentajesDieta.filter(p => p.idCompania === session.idCompania));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/porcentajes-dieta", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (session.rol !== "Administrador" && !isSaasAdmin(session)) {
        return res.status(403).json({ error: "Solo un Administrador puede modificar los porcentajes de la empresa." });
      }
      const p = req.body;
      p.idCompania = session.idCompania;
      const porcentajeNum = parseFloat(p.porcentaje);
      if (!Number.isFinite(porcentajeNum) || porcentajeNum < 0 || porcentajeNum > 100) {
        return res.status(400).json({ error: "porcentaje debe ser un número entre 0 y 100" });
      }
      p.porcentaje = porcentajeNum;
      if (dbConnected && pool) {
        if (p.id) {
          const [exists] = await pool.query("SELECT id FROM compania_porcentajes_dieta WHERE id = ? AND idCompania = ?", [p.id, parseInt(p.idCompania)]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE compania_porcentajes_dieta SET idCompania = ?, porcentaje = ? WHERE id = ?",
              [parseInt(p.idCompania), p.porcentaje, p.id]
            );
            return res.json(p);
          }
        }
        const [result] = await pool.query(
          "INSERT INTO compania_porcentajes_dieta (idCompania, porcentaje) VALUES (?, ?)",
          [parseInt(p.idCompania), p.porcentaje]
        );
        p.id = (result as any).insertId;
        res.json(p);
      } else {
        if (p.id) {
          localPorcentajesDieta = localPorcentajesDieta.map(item => item.id === p.id ? p : item);
        } else {
          p.id = Math.max(0, ...localPorcentajesDieta.map(item => item.id)) + 1;
          localPorcentajesDieta.push(p);
        }
        res.json(p);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/porcentajes-dieta/:id", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (session.rol !== "Administrador" && !isSaasAdmin(session)) {
        return res.status(403).json({ error: "Solo un Administrador puede modificar los porcentajes de la empresa." });
      }
      const id = parseInt(req.params.id);
      const idCompania = session.idCompania;
      if (dbConnected && pool) {
        await pool.query("DELETE FROM compania_porcentajes_dieta WHERE id = ? AND idCompania = ?", [id, idCompania]);
        res.json({ success: true });
      } else {
        localPorcentajesDieta = localPorcentajesDieta.filter(item => !(item.id === id && item.idCompania === idCompania));
        res.json({ success: true });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Perfil Legal: casos y documentos (spec 2026-10-19-perfil-legal-casos-documentos) ---
  // El cliente es una fila de `pacientes`; de cada documento solo se guarda dónde está físicamente.

  const formatearCaso = (row: any, documentos: DocumentoCaso[]): CasoLegal => ({
    ...row,
    recordatorioCadaDias: Number(row.recordatorioCadaDias) || 0,
    notas: row.notas || '',
    documentos: documentos.filter(d => d.idCaso === row.id).map(d => ({ ...d, notas: d.notas || '' }))
  });

  async function fetchCasos(filtro: { idCompania?: number; idCaso?: number; soloAbiertos?: boolean }): Promise<CasoLegal[]> {
    if (dbConnected && pool) {
      const condiciones: string[] = [];
      const params: any[] = [];
      if (filtro.idCompania != null) { condiciones.push("idCompania = ?"); params.push(filtro.idCompania); }
      if (filtro.idCaso != null) { condiciones.push("id = ?"); params.push(filtro.idCaso); }
      if (filtro.soloAbiertos) condiciones.push("estado = 'ABIERTO'");
      const where = condiciones.length ? ` WHERE ${condiciones.join(" AND ")}` : "";
      const [rows] = await pool.query(`SELECT * FROM casos_legales${where} ORDER BY id DESC`, params);
      const casos = rows as any[];
      if (casos.length === 0) return [];
      const [docRows] = await pool.query("SELECT * FROM documentos_caso WHERE idCaso IN (?) ORDER BY id", [casos.map(c => c.id)]);
      return casos.map(c => formatearCaso(c, docRows as DocumentoCaso[]));
    }
    return localCasos
      .filter(c => (filtro.idCompania == null || c.idCompania === filtro.idCompania)
        && (filtro.idCaso == null || c.id === filtro.idCaso)
        && (!filtro.soloAbiertos || c.estado === 'ABIERTO'))
      .sort((a, b) => b.id - a.id)
      .map(c => formatearCaso(c, localDocumentosCaso));
  }

  // Motivos por los que un recordatorio no puede salir (sin correo, sin SMTP...): el envío manual
  // los devuelve como 400 y el proceso automático simplemente salta ese caso.
  class RecordatorioNoEnviable extends Error {}

  async function enviarRecordatorioCaso(caso: CasoLegal): Promise<NotificationLog> {
    const pendientes = caso.documentos.filter(d => d.estado === 'PENDIENTE');
    if (pendientes.length === 0) throw new RecordatorioNoEnviable("El caso no tiene documentos pendientes.");
    const company = await fetchCompanyById(caso.idCompania);
    if (!company) throw new RecordatorioNoEnviable("Empresa no encontrada.");
    let cliente: Patient | undefined;
    let smtpConfig: CompaniaSmtpConfig | undefined;
    if (dbConnected && pool) {
      const [pacienteRows] = await pool.query("SELECT * FROM pacientes WHERE id_paciente = ? AND idCompania = ?", [caso.idPaciente, caso.idCompania]);
      cliente = (pacienteRows as any[]).map(row => normalizeRow(row, 'id_paciente'))[0];
      const [smtpRows] = await pool.query("SELECT * FROM compania_smtp_config WHERE idCompania = ?", [caso.idCompania]);
      const smtpRow = (smtpRows as any[])[0];
      smtpConfig = smtpRow ? { ...smtpRow, activo: !!smtpRow.activo } : undefined;
    } else {
      cliente = localPatients.find(p => p.id === caso.idPaciente && p.idCompania === caso.idCompania);
      smtpConfig = localSmtpConfigs.find(s => s.idCompania === caso.idCompania);
    }
    if (!cliente) throw new RecordatorioNoEnviable("Cliente no encontrado.");
    if (!cliente.correoElectronico) throw new RecordatorioNoEnviable("El cliente no tiene un correo electrónico registrado.");
    if (!smtpConfig || !smtpConfig.activo) throw new RecordatorioNoEnviable("Las notificaciones SMTP no están activas para esta empresa.");

    const rendered = renderRecordatorioDocumentosEmail({ company, patient: cliente, caso, pendientes });
    await sendMail(smtpConfig, { to: cliente.correoElectronico, subject: rendered.subject, html: rendered.html, text: rendered.text });

    const enviadoEn = new Date().toISOString();
    const log: NotificationLog = {
      id: 0,
      idCompania: caso.idCompania,
      idCita: null,
      idConsulta: null,
      tipo: "DOCUMENTOS",
      destinatario: cliente.correoElectronico,
      asunto: rendered.subject,
      cuerpo: rendered.text,
      enviadoEn
    };
    if (dbConnected && pool) {
      await pool.query("UPDATE casos_legales SET ultimoRecordatorioEn = ? WHERE id = ?", [enviadoEn, caso.id]);
      const [result] = await pool.query(
        "INSERT INTO notification_logs (idCompania, idCita, idConsulta, tipo, destinatario, asunto, cuerpo, enviadoEn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [log.idCompania, null, null, log.tipo, log.destinatario, log.asunto, log.cuerpo, log.enviadoEn]
      );
      log.id = (result as any).insertId;
    } else {
      localCasos = localCasos.map(c => c.id === caso.id ? { ...c, ultimoRecordatorioEn: enviadoEn } : c);
      log.id = Math.max(0, ...localLogs.map((item: any) => item.id)) + 1;
      localLogs.push(log as any);
    }
    return log;
  }

  let procesandoRecordatorios = false;
  async function procesarRecordatoriosCasos() {
    if (!dbConnected || !pool || procesandoRecordatorios) return;
    procesandoRecordatorios = true;
    try {
      const ahora = new Date();
      for (const caso of await fetchCasos({ soloAbiertos: true })) {
        // La empresa de plataforma no es una clínica: nunca se le envían recordatorios.
        if (esCompaniaPlataforma(caso.idCompania)) continue;
        const pendientes = caso.documentos.filter(d => d.estado === 'PENDIENTE').length;
        if (!tocaRecordatorio(caso, pendientes, ahora)) continue;
        try {
          await enviarRecordatorioCaso(caso);
        } catch (err) {
          // Un fallo no marca ultimoRecordatorioEn: se reintenta en la pasada siguiente.
          if (!(err instanceof RecordatorioNoEnviable)) console.error(`[Recordatorios] Falló el caso ${caso.id}:`, err);
        }
      }
    } catch (err) {
      console.error("[Recordatorios] No se pudo procesar la pasada:", err);
    } finally {
      procesandoRecordatorios = false;
    }
  }

  app.get("/api/casos", requireAuth, async (req, res) => {
    try {
      res.json(await fetchCasos({ idCompania: sessionOf(req).idCompania }));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/casos", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      const b = req.body || {};
      const titulo = String(b.titulo || '').trim().slice(0, 150);
      const idPaciente = parseInt(b.idPaciente);
      const estado: CasoLegal['estado'] = b.estado === 'CERRADO' ? 'CERRADO' : 'ABIERTO';
      const recordatorioCadaDias = Number(b.recordatorioCadaDias);
      if (!titulo) return res.status(400).json({ error: "El título del caso es obligatorio." });
      if (!Number.isInteger(recordatorioCadaDias) || recordatorioCadaDias < 0 || recordatorioCadaDias > 365) {
        return res.status(400).json({ error: "El recordatorio debe ser un número de días entre 0 y 365 (0 = sin recordatorio)." });
      }
      const clienteValido = dbConnected && pool
        ? ((await pool.query("SELECT id_paciente FROM pacientes WHERE id_paciente = ? AND idCompania = ? AND activo = 1", [idPaciente, idCompania]))[0] as any[]).length > 0
        : localPatients.some(p => p.id === idPaciente && p.idCompania === idCompania && p.activo !== false);
      if (!clienteValido) return res.status(400).json({ error: "Seleccione un cliente válido de la empresa." });

      const datos = {
        idPaciente,
        numeroExpediente: String(b.numeroExpediente || '').trim().slice(0, 60),
        titulo,
        materia: String(b.materia || '').trim().slice(0, 100),
        estado,
        ubicacionFisica: String(b.ubicacionFisica || '').trim().slice(0, 150),
        recordatorioCadaDias,
        notas: String(b.notas || '')
      };
      const id = parseInt(b.id);
      const existente = Number.isInteger(id) ? (await fetchCasos({ idCompania, idCaso: id }))[0] : undefined;
      let idCaso: number;
      if (dbConnected && pool) {
        if (existente) {
          await pool.query(
            "UPDATE casos_legales SET idPaciente = ?, numeroExpediente = ?, titulo = ?, materia = ?, estado = ?, ubicacionFisica = ?, recordatorioCadaDias = ?, notas = ? WHERE id = ? AND idCompania = ?",
            [datos.idPaciente, datos.numeroExpediente, datos.titulo, datos.materia, datos.estado, datos.ubicacionFisica, datos.recordatorioCadaDias, datos.notas, existente.id, idCompania]
          );
          idCaso = existente.id;
        } else {
          const [result] = await pool.query(
            "INSERT INTO casos_legales (idCompania, idPaciente, numeroExpediente, titulo, materia, estado, ubicacionFisica, recordatorioCadaDias, notas, creadoEn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [idCompania, datos.idPaciente, datos.numeroExpediente, datos.titulo, datos.materia, datos.estado, datos.ubicacionFisica, datos.recordatorioCadaDias, datos.notas, new Date().toISOString()]
          );
          idCaso = (result as any).insertId;
        }
      } else if (existente) {
        localCasos = localCasos.map(c => c.id === existente.id ? { ...c, ...datos } : c);
        idCaso = existente.id;
      } else {
        idCaso = Math.max(0, ...localCasos.map(c => c.id)) + 1;
        localCasos.push({ id: idCaso, idCompania, ...datos, ultimoRecordatorioEn: null, creadoEn: new Date().toISOString() });
      }
      res.json((await fetchCasos({ idCompania, idCaso }))[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/casos/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const idCompania = sessionOf(req).idCompania;
      if (dbConnected && pool) {
        // documentos_caso se borran en cascada (FK)
        await pool.query("DELETE FROM casos_legales WHERE id = ? AND idCompania = ?", [id, idCompania]);
      } else if (localCasos.some(c => c.id === id && c.idCompania === idCompania)) {
        localCasos = localCasos.filter(c => c.id !== id);
        localDocumentosCaso = localDocumentosCaso.filter(d => d.idCaso !== id);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/casos/:id/documentos", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      const idCaso = parseInt(req.params.id);
      const caso = (await fetchCasos({ idCompania, idCaso }))[0];
      if (!caso) return res.status(404).json({ error: "Caso no encontrado." });
      const b = req.body || {};
      const nombre = String(b.nombre || '').trim().slice(0, 150);
      if (!nombre) return res.status(400).json({ error: "El nombre del documento es obligatorio." });
      const esFecha = (v: any) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
      if (b.fechaLimite && !esFecha(b.fechaLimite)) return res.status(400).json({ error: "La fecha límite no es válida." });
      const estado: DocumentoCaso['estado'] = b.estado === 'RECIBIDO' ? 'RECIBIDO' : 'PENDIENTE';
      const datos = {
        nombre,
        estado,
        folio: String(b.folio || '').trim().slice(0, 60),
        fechaLimite: esFecha(b.fechaLimite) ? b.fechaLimite as string : null,
        fechaRecibido: estado === 'RECIBIDO' ? (esFecha(b.fechaRecibido) ? b.fechaRecibido as string : fechaCR()) : null,
        notas: String(b.notas || '')
      };
      const existente = caso.documentos.find(d => d.id === parseInt(b.id));
      if (dbConnected && pool) {
        if (existente) {
          await pool.query(
            "UPDATE documentos_caso SET nombre = ?, estado = ?, folio = ?, fechaLimite = ?, fechaRecibido = ?, notas = ? WHERE id = ? AND idCaso = ?",
            [datos.nombre, datos.estado, datos.folio, datos.fechaLimite, datos.fechaRecibido, datos.notas, existente.id, idCaso]
          );
        } else {
          await pool.query(
            "INSERT INTO documentos_caso (idCaso, nombre, estado, folio, fechaLimite, fechaRecibido, notas) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [idCaso, datos.nombre, datos.estado, datos.folio, datos.fechaLimite, datos.fechaRecibido, datos.notas]
          );
        }
      } else if (existente) {
        localDocumentosCaso = localDocumentosCaso.map(d => d.id === existente.id ? { ...d, ...datos } : d);
      } else {
        localDocumentosCaso.push({ id: Math.max(0, ...localDocumentosCaso.map(d => d.id)) + 1, idCaso, ...datos });
      }
      res.json((await fetchCasos({ idCompania, idCaso }))[0]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/documentos-caso/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const idCompania = sessionOf(req).idCompania;
      if (dbConnected && pool) {
        await pool.query(
          "DELETE d FROM documentos_caso d JOIN casos_legales c ON c.id = d.idCaso WHERE d.id = ? AND c.idCompania = ?",
          [id, idCompania]
        );
      } else {
        const doc = localDocumentosCaso.find(d => d.id === id);
        if (doc && localCasos.some(c => c.id === doc.idCaso && c.idCompania === idCompania)) {
          localDocumentosCaso = localDocumentosCaso.filter(d => d.id !== id);
        }
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/casos/:id/recordatorio", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      const idCaso = parseInt(req.params.id);
      const caso = (await fetchCasos({ idCompania, idCaso }))[0];
      if (!caso) return res.status(404).json({ error: "Caso no encontrado." });
      const log = await enviarRecordatorioCaso(caso);
      res.json({ log, caso: (await fetchCasos({ idCompania, idCaso }))[0] });
    } catch (err: any) {
      if (err instanceof RecordatorioNoEnviable) return res.status(400).json({ error: err.message });
      console.error("Error enviando recordatorio de documentos:", err);
      res.status(500).json({ error: err.message || "No se pudo enviar el recordatorio." });
    }
  });

  app.get("/api/plantillas-dieta", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM plantillas_dieta WHERE idCompania = ?", [session.idCompania]);
        res.json(rows);
      } else {
        res.json(localPlantillasDieta.filter(p => p.idCompania === session.idCompania));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/plantillas-dieta", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (session.rol !== "Administrador" && !isSaasAdmin(session)) {
        return res.status(403).json({ error: "Solo un Administrador puede modificar las plantillas de dieta de la empresa." });
      }
      const p = req.body;
      p.idCompania = session.idCompania;
      const caloriaMin = parseInt(p.caloriaMin);
      const caloriaMax = parseInt(p.caloriaMax);
      if (!Number.isFinite(caloriaMin) || !Number.isFinite(caloriaMax) || caloriaMin < 0 || caloriaMax <= caloriaMin) {
        return res.status(400).json({ error: "El rango de calorías no es válido (el máximo debe ser mayor que el mínimo)." });
      }
      p.caloriaMin = caloriaMin;
      p.caloriaMax = caloriaMax;
      const parsePct = (v: any): number | null => {
        if (v == null || String(v).trim() === '') return null;
        const n = parseInt(v);
        return Number.isFinite(n) ? n : null;
      };
      p.carbohidratosPct = parsePct(p.carbohidratosPct);
      p.proteinasPct = parsePct(p.proteinasPct);
      p.grasasPct = parsePct(p.grasasPct);
      const pctValores = [p.carbohidratosPct, p.proteinasPct, p.grasasPct];
      if (pctValores.some(v => v != null && (v < 0 || v > 100))) {
        return res.status(400).json({ error: "Cada porcentaje debe estar entre 0 y 100." });
      }
      if (pctValores.every(v => v != null) && pctValores.reduce((s, v) => s + (v as number), 0) !== 100) {
        return res.status(400).json({ error: "Carbohidratos + proteínas + grasas deben sumar 100% cuando los tres tienen valor." });
      }
      if (dbConnected && pool) {
        if (p.id) {
          const [exists] = await pool.query("SELECT id FROM plantillas_dieta WHERE id = ? AND idCompania = ?", [p.id, parseInt(p.idCompania)]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE plantillas_dieta SET idCompania = ?, nombre = ?, direccion = ?, caloriaMin = ?, caloriaMax = ?, carbohidratosPct = ?, proteinasPct = ?, grasasPct = ?, desayuno = ?, meriendaManana = ?, almuerzo = ?, meriendaTarde = ?, cena = ?, indicaciones = ? WHERE id = ?",
              [parseInt(p.idCompania), p.nombre, p.direccion, p.caloriaMin, p.caloriaMax, p.carbohidratosPct, p.proteinasPct, p.grasasPct, p.desayuno || '', p.meriendaManana || '', p.almuerzo || '', p.meriendaTarde || '', p.cena || '', p.indicaciones || '', p.id]
            );
            return res.json(p);
          }
        }
        const [result] = await pool.query(
          "INSERT INTO plantillas_dieta (idCompania, nombre, direccion, caloriaMin, caloriaMax, carbohidratosPct, proteinasPct, grasasPct, desayuno, meriendaManana, almuerzo, meriendaTarde, cena, indicaciones) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [parseInt(p.idCompania), p.nombre, p.direccion, p.caloriaMin, p.caloriaMax, p.carbohidratosPct, p.proteinasPct, p.grasasPct, p.desayuno || '', p.meriendaManana || '', p.almuerzo || '', p.meriendaTarde || '', p.cena || '', p.indicaciones || '']
        );
        p.id = (result as any).insertId;
        res.json(p);
      } else {
        if (p.id) {
          localPlantillasDieta = localPlantillasDieta.map(item => item.id === p.id ? p : item);
        } else {
          p.id = Math.max(0, ...localPlantillasDieta.map(item => item.id)) + 1;
          localPlantillasDieta.push(p);
        }
        res.json(p);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/plantillas-dieta/:id", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (session.rol !== "Administrador" && !isSaasAdmin(session)) {
        return res.status(403).json({ error: "Solo un Administrador puede modificar las plantillas de dieta de la empresa." });
      }
      const id = parseInt(req.params.id);
      const idCompania = session.idCompania;
      if (dbConnected && pool) {
        await pool.query("DELETE FROM plantillas_dieta WHERE id = ? AND idCompania = ?", [id, idCompania]);
        res.json({ success: true });
      } else {
        localPlantillasDieta = localPlantillasDieta.filter(item => !(item.id === id && item.idCompania === idCompania));
        res.json({ success: true });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 10. Servicios (catálogo de servicios/tarifas por empresa, con IVA opcional
  // por servicio que cae al ivaPorDefecto de la empresa cuando es NULL)
  app.get("/api/servicios", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM servicios WHERE idCompania = ?", [session.idCompania]);
        res.json((rows as any[]).map(row => normalizeRow(row, 'id_servicio')));
      } else {
        res.json(localServicios.filter(s => s.idCompania === session.idCompania));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/servicios", requireAuth, async (req, res) => {
    try {
      const s = req.body;
      s.idCompania = sessionOf(req).idCompania;
      const tipo = s.tipo === 'ARTICULO' ? 'ARTICULO' : 'SERVICIO';
      const stockMinimo = tipo === 'ARTICULO' && s.stockMinimo != null && String(s.stockMinimo).trim() !== '' ? parseInt(s.stockMinimo) : null;
      const costoUnitario = tipo === 'ARTICULO' && s.costoUnitario != null && String(s.costoUnitario).trim() !== '' ? parseFloat(s.costoUnitario) : null;
      const codigoBarras = tipo === 'ARTICULO' ? (s.codigoBarras || null) : null;
      // La modalidad solo aplica a SERVICIO; un ARTICULO siempre queda en 'AMBOS'. Valor ausente/ inválido => 'AMBOS'.
      const modalidad = tipo === 'SERVICIO' ? normalizarModalidad(s.modalidad) : 'AMBOS';

      if (dbConnected && pool) {
        if (s.id) {
          // Scoped by idCompania too — see comment on the equivalent usuarios check above.
          // `stock` NUNCA se toca aquí — solo POST /api/servicios/:id/ajustar-stock puede
          // cambiarlo, para que cada cambio de existencias quede en movimientos_inventario en
          // vez de poder sobreescribirse en silencio desde este formulario genérico.
          const [exists] = await pool.query("SELECT id_servicio FROM servicios WHERE id_servicio = ? AND idCompania = ?", [s.id, parseInt(s.idCompania)]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE servicios SET idCompania = ?, nombre = ?, precio = ?, porcentajeIva = ?, duracionMinutos = ?, codigoCabys = ?, unidadMedida = ?, activo = ?, tipo = ?, stockMinimo = ?, costoUnitario = ?, codigoBarras = ?, modalidad = ? WHERE id_servicio = ?",
              [parseInt(s.idCompania), s.nombre, parseFloat(s.precio), s.porcentajeIva != null ? parseFloat(s.porcentajeIva) : null, parseInt(s.duracionMinutos) || 0, s.codigoCabys || null, s.unidadMedida || 'Sp', s.activo ? 1 : 0, tipo, stockMinimo, costoUnitario, codigoBarras, modalidad, s.id]
            );
            const [refreshed] = await pool.query("SELECT * FROM servicios WHERE id_servicio = ?", [s.id]);
            return res.json(normalizeRow((refreshed as any[])[0], 'id_servicio'));
          }
        }

        const stockInicial = tipo === 'ARTICULO' ? (parseInt(s.stock) || 0) : null;
        const [result] = await pool.query(
          "INSERT INTO servicios (idCompania, nombre, precio, porcentajeIva, duracionMinutos, codigoCabys, unidadMedida, activo, tipo, stock, stockMinimo, costoUnitario, codigoBarras, modalidad) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [parseInt(s.idCompania), s.nombre, parseFloat(s.precio), s.porcentajeIva != null ? parseFloat(s.porcentajeIva) : null, parseInt(s.duracionMinutos) || 0, s.codigoCabys || null, s.unidadMedida || 'Sp', s.activo === false ? 0 : 1, tipo, stockInicial, stockMinimo, costoUnitario, codigoBarras, modalidad]
        );
        s.id = (result as any).insertId;

        if (tipo === 'ARTICULO' && stockInicial) {
          await pool.query(
            "INSERT INTO movimientos_inventario (idCompania, idServicio, tipo, cantidad, stockResultante, referencia, notas, creadoPor, creadoEn) VALUES (?, ?, 'AJUSTE', ?, ?, ?, ?, ?, ?)",
            [s.idCompania, s.id, stockInicial, stockInicial, null, 'Existencia inicial', null, new Date().toISOString()]
          );
        }

        const [created] = await pool.query("SELECT * FROM servicios WHERE id_servicio = ?", [s.id]);
        res.json(normalizeRow((created as any[])[0], 'id_servicio'));
      } else {
        s.tipo = tipo;
        s.stockMinimo = stockMinimo;
        s.costoUnitario = costoUnitario;
        s.codigoBarras = codigoBarras;
        s.modalidad = modalidad;
        if (s.id && localServicios.some(item => item.id === s.id)) {
          const existente = localServicios.find(item => item.id === s.id)!;
          s.stock = existente.stock; // igual que en modo MySQL: el stock no se toca aquí
          localServicios = localServicios.map(item => item.id === s.id ? s : item);
        } else {
          s.id = Math.max(0, ...localServicios.map(item => item.id)) + 1;
          s.stock = tipo === 'ARTICULO' ? (parseInt(s.stock) || 0) : null;
          localServicios.push(s);
        }
        res.json(s);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Ajuste manual de existencias (conteo físico, merma, corrección) — el único camino para
  // cambiar `stock` en un ARTICULO ya creado, así que cada cambio queda en
  // movimientos_inventario con motivo y usuario. `nuevoStock` es el valor absoluto resultante
  // (no un delta), para que la UI muestre "existencias actuales" y no tenga que rastrear el
  // último valor conocido.
  app.post("/api/servicios/:id/ajustar-stock", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const session = sessionOf(req);
      const nuevoStock = parseInt(req.body.nuevoStock);
      const notas = req.body.notas ? String(req.body.notas).slice(0, 255) : null;
      if (!Number.isFinite(nuevoStock) || nuevoStock < 0) {
        return res.status(400).json({ error: "La nueva existencia debe ser un número entero mayor o igual a cero." });
      }

      if (dbConnected && pool) {
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          const [rows] = await connection.query("SELECT * FROM servicios WHERE id_servicio = ? AND idCompania = ? FOR UPDATE", [id, session.idCompania]);
          const servicio = (rows as any[]).map(row => normalizeRow(row, 'id_servicio'))[0];
          if (!servicio) {
            await connection.rollback();
            return res.status(404).json({ error: "Artículo no encontrado." });
          }
          if (servicio.tipo !== 'ARTICULO') {
            await connection.rollback();
            return res.status(400).json({ error: "Solo los artículos (no los servicios) tienen existencias." });
          }
          const stockAnterior = servicio.stock || 0;
          const delta = nuevoStock - stockAnterior;

          await connection.query("UPDATE servicios SET stock = ? WHERE id_servicio = ?", [nuevoStock, id]);
          if (delta !== 0) {
            await connection.query(
              "INSERT INTO movimientos_inventario (idCompania, idServicio, tipo, cantidad, stockResultante, referencia, notas, creadoPor, creadoEn) VALUES (?, ?, 'AJUSTE', ?, ?, ?, ?, ?, ?)",
              [session.idCompania, id, delta, nuevoStock, null, notas, null, new Date().toISOString()]
            );
          }
          await connection.commit();
          res.json({ id, stock: nuevoStock });
        } catch (err) {
          await connection.rollback();
          throw err;
        } finally {
          connection.release();
        }
      } else {
        const servicio = localServicios.find(s => s.id === id && s.idCompania === session.idCompania);
        if (!servicio) return res.status(404).json({ error: "Artículo no encontrado." });
        if (servicio.tipo !== 'ARTICULO') return res.status(400).json({ error: "Solo los artículos (no los servicios) tienen existencias." });
        servicio.stock = nuevoStock;
        res.json({ id, stock: nuevoStock });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/movimientos-inventario", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      const idServicio = req.query.idServicio ? parseInt(req.query.idServicio as string) : null;
      if (dbConnected && pool) {
        const [rows] = idServicio
          ? await pool.query("SELECT * FROM movimientos_inventario WHERE idCompania = ? AND idServicio = ? ORDER BY id DESC LIMIT 200", [session.idCompania, idServicio])
          : await pool.query("SELECT * FROM movimientos_inventario WHERE idCompania = ? ORDER BY id DESC LIMIT 200", [session.idCompania]);
        res.json(rows);
      } else {
        res.json([]);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Rellena los servicios por defecto del colegio profesional correspondiente para una
  // empresa ya existente (Fisioterapia/Nutrición/Ambas). Idempotente: no duplica servicios
  // cuyo nombre ya exista para esa empresa. No hace nada para Spa (perfilCompania sin colegio).
  app.post("/api/companies/:id/servicios-defecto", requireAuth, async (req, res) => {
    try {
      const idCompania = parseInt(req.params.id);
      const session = sessionOf(req);
      if (!isSaasAdmin(session) && !(session.idCompania === idCompania && session.rol === "Administrador")) {
        return res.status(403).json({ error: "No autorizado." });
      }
      let company: Company | undefined;
      let existentes: Servicio[];
      if (dbConnected && pool) {
        const [companyRows] = await pool.query("SELECT * FROM companias WHERE id_compania = ?", [idCompania]);
        company = (companyRows as any[]).map(row => normalizeRow(row, 'id_compania'))[0];
        const [servicioRows] = await pool.query("SELECT * FROM servicios WHERE idCompania = ?", [idCompania]);
        existentes = (servicioRows as any[]).map(row => normalizeRow(row, 'id_servicio'));
      } else {
        company = localCompanies.find(c => c.id === idCompania);
        existentes = localServicios.filter(s => s.idCompania === idCompania);
      }
      if (!company) return res.status(404).json({ error: "Empresa no encontrada." });

      const nombresExistentes = new Set(existentes.map(s => s.nombre));
      const porAgregar = serviciosDefectoParaPerfil(company.perfilCompania).filter(s => !nombresExistentes.has(s.nombre));

      const agregados: Servicio[] = [];
      for (const s of porAgregar) {
        if (dbConnected && pool) {
          const [result] = await pool.query(
            "INSERT INTO servicios (idCompania, nombre, precio, porcentajeIva, duracionMinutos, codigoCabys, unidadMedida, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [idCompania, s.nombre, s.precio, s.porcentajeIva, s.duracionMinutos, s.codigoCabys, s.unidadMedida, s.activo ? 1 : 0]
          );
          agregados.push({ ...s, id: (result as any).insertId, idCompania });
        } else {
          const nuevo = { ...s, id: Math.max(0, ...localServicios.map(item => item.id)) + 1, idCompania };
          localServicios.push(nuevo);
          agregados.push(nuevo);
        }
      }

      res.json({ agregados });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 10. Hacienda Digital Signature Config
  // Columnas de numeración por tipo de documento: último usado y numeración mínima (piso para una
  // empresa que viene de otro sistema: el siguiente número es max(último, mínimo) + 1).
  const NUMERACION_POR_TIPO = {
    "01": { ultimo: "ultimo_consecutivo", minimo: "numeracion_minima_fe", local: "ultimoConsecutivo", localMin: "numeracionMinimaFe", nombre: "Facturas" },
    "02": { ultimo: "ultimo_consecutivo_nd", minimo: "numeracion_minima_nd", local: "ultimoConsecutivoNd", localMin: "numeracionMinimaNd", nombre: "Notas de Débito" },
    "03": { ultimo: "ultimo_consecutivo_nc", minimo: "numeracion_minima_nc", local: "ultimoConsecutivoNc", localMin: "numeracionMinimaNc", nombre: "Notas de Crédito" },
    "04": { ultimo: "ultimo_consecutivo_te", minimo: "numeracion_minima_te", local: "ultimoConsecutivoTe", localMin: "numeracionMinimaTe", nombre: "Tiquetes" }
  } as const;
  type TipoNumeracion = keyof typeof NUMERACION_POR_TIPO;
  const esTipoNumeracion = (t: unknown): t is TipoNumeracion => typeof t === "string" && t in NUMERACION_POR_TIPO;
  const INT_MAX_COLUMNA = 2147483647;

  function vistaConfigVacia(idCompania: number) {
    // Sin fila todavía: los valores por omisión reales son los DEFAULT de las columnas (la fila se
    // crea al guardar o al emitir el primer comprobante).
    return {
      idCompania, ambiente: 'SANDBOX', usuarioAtv: '', tienePasswordAtv: false,
      tieneCertificado: false, certificadoNombreArchivo: null, certificadoVenceEn: null,
      ultimoConsecutivo: 0, ultimoConsecutivoNc: 0, ultimoConsecutivoNd: 0, ultimoConsecutivoTe: 0,
      sucursal: null, terminal: null, numeracionMinimaFe: 0, numeracionMinimaNc: 0, numeracionMinimaNd: 0, numeracionMinimaTe: 0,
      correoAutomatico: true, configVerificada: false, configVerificadaEn: null
    };
  }

  /** Lo que ve la pantalla de configuración (nunca la llave, el PIN ni la contraseña). */
  async function vistaConfigHacienda(idCompania: number): Promise<any> {
    if (dbConnected && pool) {
      const [rows] = await pool.query("SELECT * FROM compania_hacienda_config WHERE id_compania = ?", [idCompania]);
      const row = (rows as any[])[0];
      if (!row) return vistaConfigVacia(idCompania);
      return {
        idCompania: row.id_compania,
        ambiente: row.ambiente,
        usuarioAtv: row.usuario_atv || '',
        tienePasswordAtv: !!row.password_atv_enc,
        tieneCertificado: !!row.certificado_p12_enc,
        certificadoNombreArchivo: row.certificado_nombre_archivo,
        certificadoVenceEn: row.certificado_vence_en ? new Date(row.certificado_vence_en).toISOString().split('T')[0] : null,
        ultimoConsecutivo: row.ultimo_consecutivo || 0,
        ultimoConsecutivoNc: row.ultimo_consecutivo_nc || 0,
        ultimoConsecutivoNd: row.ultimo_consecutivo_nd || 0,
        ultimoConsecutivoTe: row.ultimo_consecutivo_te || 0,
        sucursal: row.sucursal ?? null,
        terminal: row.terminal ?? null,
        numeracionMinimaFe: row.numeracion_minima_fe || 0,
        numeracionMinimaNc: row.numeracion_minima_nc || 0,
        numeracionMinimaNd: row.numeracion_minima_nd || 0,
        numeracionMinimaTe: row.numeracion_minima_te || 0,
        correoAutomatico: row.correo_automatico == null ? true : !!row.correo_automatico,
        configVerificada: !!row.config_verificada,
        configVerificadaEn: row.config_verificada_en ? new Date(row.config_verificada_en).toISOString() : null
      };
    }
    const row = localHaciendaConfigs.find(c => c.idCompania === idCompania);
    if (!row) return vistaConfigVacia(idCompania);
    const { passwordAtvCifrado, certificadoP12Cifrado, certificadoPinCifrado, ...resto } = row;
    return { ...resto, tienePasswordAtv: !!passwordAtvCifrado, tieneCertificado: !!certificadoP12Cifrado };
  }

  app.get("/api/hacienda-config/:idCompania", requireAuth, async (req, res) => {
    try {
      const idCompania = parseInt(req.params.idCompania);
      if (!canAccessCompany(sessionOf(req), idCompania)) {
        return res.status(403).json({ error: "No autorizado." });
      }
      res.json(await vistaConfigHacienda(idCompania));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const AMBIENTES_HACIENDA = ["SANDBOX", "PRODUCCION", "PRUEBAS_LOCAL"];

  app.post("/api/hacienda-config", requireAuth, async (req, res) => {
    try {
      const b = req.body;
      const idCompania = parseInt(b.idCompania);
      const session = sessionOf(req);
      if (!canAccessCompany(session, idCompania)) {
        return res.status(403).json({ error: "No autorizado." });
      }
      // Credenciales ATV, certificado de firma, ambiente y numeración deciden qué se le declara a
      // Hacienda en nombre de la empresa: solo un Administrador los cambia (antes, cualquier usuario).
      if (session.rol !== "Administrador" && !isSaasAdmin(session)) {
        return res.status(403).json({ error: "Solo un usuario Administrador puede cambiar la configuración de Hacienda." });
      }
      if (!AMBIENTES_HACIENDA.includes(b.ambiente)) {
        return res.status(400).json({ error: "Ambiente de Hacienda inválido." });
      }

      // Corrección manual de numeración (del POS): fijar el último consecutivo YA emitido ante
      // Hacienda cuando esta empresa facturó antes con otro sistema bajo la misma sucursal/terminal
      // y Hacienda rechaza con "el documento ya fue emitido". Solo puede SUBIR: bajarlo volvería a
      // emitir números que Hacienda ya tiene. Solo un Administrador.
      const correccionConsecutivos: Array<{ columna: string; campo: "ultimoConsecutivo" | "ultimoConsecutivoNc" | "ultimoConsecutivoNd" | "ultimoConsecutivoTe"; valor: number }> = [];
      for (const [campo, columna] of [["ultimoConsecutivo", "ultimo_consecutivo"], ["ultimoConsecutivoNc", "ultimo_consecutivo_nc"], ["ultimoConsecutivoNd", "ultimo_consecutivo_nd"], ["ultimoConsecutivoTe", "ultimo_consecutivo_te"]] as const) {
        if (b[campo] == null || String(b[campo]).trim() === "") continue;
        const valor = Number(b[campo]);
        // Tope de las columnas INT de compania_hacienda_config (con STRICT_TRANS_TABLES, un valor
        // mayor falla el UPDATE después de haber guardado el resto de la configuración).
        if (!Number.isInteger(valor) || valor < 0 || valor > INT_MAX_COLUMNA) {
          return res.status(400).json({ error: "El último consecutivo debe ser un número entero entre 0 y 2147483647." });
        }
        correccionConsecutivos.push({ columna, campo, valor });
      }

      // Numeración mínima por tipo (piso): se puede fijar libremente porque el siguiente número es
      // max(último, mínimo) + 1 — bajarla nunca reutiliza un número ya emitido.
      const minimos: Array<{ columna: string; campo: "numeracionMinimaFe" | "numeracionMinimaNc" | "numeracionMinimaNd" | "numeracionMinimaTe"; valor: number }> = [];
      for (const tipo of Object.keys(NUMERACION_POR_TIPO) as TipoNumeracion[]) {
        const { minimo, localMin } = NUMERACION_POR_TIPO[tipo];
        if (b[localMin] == null || String(b[localMin]).trim() === "") continue;
        const valor = Number(b[localMin]);
        if (!Number.isInteger(valor) || valor < 0 || valor > INT_MAX_COLUMNA) {
          return res.status(400).json({ error: "La numeración mínima debe ser un número entero entre 0 y 2147483647." });
        }
        minimos.push({ columna: minimo, campo: localMin, valor });
      }

      // Sucursal y terminal del consecutivo (opcionales: sin valor se conserva lo guardado).
      const sucursal = b.sucursal != null && String(b.sucursal).trim() !== "" ? String(b.sucursal).trim() : null;
      const terminal = b.terminal != null && String(b.terminal).trim() !== "" ? String(b.terminal).trim() : null;
      if (sucursal != null && !/^\d{3}$/.test(sucursal)) return res.status(400).json({ error: "La sucursal debe tener exactamente 3 dígitos (ej. 001)." });
      if (terminal != null && !/^\d{5}$/.test(terminal)) return res.status(400).json({ error: "La terminal debe tener exactamente 5 dígitos (ej. 00001)." });
      if (sucursal != null && Number(sucursal) === 0) return res.status(400).json({ error: "La sucursal no puede ser 000." });
      if (terminal != null && Number(terminal) === 0) return res.status(400).json({ error: "La terminal no puede ser 00000." });
      const correoAutomatico = typeof b.correoAutomatico === "boolean" ? b.correoAutomatico : null;

      let existing: { passwordAtvCifrado: string; certificadoP12Cifrado: string; certificadoPinCifrado: string; certificadoNombreArchivo: string | null; ambiente: string | null; usuarioAtv: string | null } | undefined;

      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT ambiente, usuario_atv, password_atv_enc, certificado_p12_enc, certificado_password_enc, certificado_nombre_archivo FROM compania_hacienda_config WHERE id_compania = ?", [idCompania]);
        const row = (rows as any[])[0];
        if (row) {
          existing = {
            passwordAtvCifrado: row.password_atv_enc ? row.password_atv_enc.toString() : '',
            certificadoP12Cifrado: row.certificado_p12_enc ? row.certificado_p12_enc.toString() : '',
            certificadoPinCifrado: row.certificado_password_enc ? row.certificado_password_enc.toString() : '',
            certificadoNombreArchivo: row.certificado_nombre_archivo,
            ambiente: row.ambiente ?? null,
            usuarioAtv: row.usuario_atv ?? null
          };
        }
      } else {
        const row = localHaciendaConfigs.find(c => c.idCompania === idCompania);
        if (row) {
          existing = {
            passwordAtvCifrado: row.passwordAtvCifrado,
            certificadoP12Cifrado: row.certificadoP12Cifrado,
            certificadoPinCifrado: row.certificadoPinCifrado,
            certificadoNombreArchivo: row.certificadoNombreArchivo,
            ambiente: row.ambiente,
            usuarioAtv: row.usuarioAtv
          };
        }
      }

      const cambiaPassword = !!(b.passwordAtv && String(b.passwordAtv).trim());
      const cambiaCertificado = !!(b.certificadoP12Base64 && String(b.certificadoP12Base64).trim());
      const cambiaPin = !!(b.certificadoPin && String(b.certificadoPin).trim());

      const passwordAtvCifrado = cambiaPassword
        ? encryptSecret(String(b.passwordAtv).trim())
        : (existing?.passwordAtvCifrado || '');

      const certificadoP12Cifrado = cambiaCertificado
        ? encryptSecret(String(b.certificadoP12Base64).trim())
        : (existing?.certificadoP12Cifrado || '');

      const certificadoPinCifrado = cambiaPin
        ? encryptSecret(String(b.certificadoPin).trim())
        : (existing?.certificadoPinCifrado || '');

      const certificadoNombreArchivo = b.certificadoNombreArchivo || existing?.certificadoNombreArchivo || null;

      let certificadoVenceEn: string | null = null;
      if (certificadoP12Cifrado && certificadoPinCifrado) {
        try {
          const p12Base64 = decryptSecret(certificadoP12Cifrado);
          const pin = decryptSecret(certificadoPinCifrado);
          const info = verificarLlaveP12(p12Base64, pin);
          certificadoVenceEn = info.validoHasta.split('T')[0];
        } catch (err: any) {
          return res.status(400).json({ error: err.message });
        }
      }

      // Cambió algo de lo que comprueba «Probar configuración»: la verificación anterior ya no vale.
      const reiniciaVerificacion = !existing || cambiaPassword || cambiaCertificado || cambiaPin
        || existing.ambiente !== b.ambiente || (existing.usuarioAtv || '') !== (b.usuarioAtv || '');

      if (dbConnected && pool) {
        const [exists] = await pool.query("SELECT id_compania FROM compania_hacienda_config WHERE id_compania = ?", [idCompania]);
        if ((exists as any).length > 0) {
          await pool.query(
            "UPDATE compania_hacienda_config SET ambiente = ?, usuario_atv = ?, password_atv_enc = ?, certificado_p12_enc = ?, certificado_password_enc = ?, certificado_nombre_archivo = ?, certificado_vence_en = ? WHERE id_compania = ?",
            [b.ambiente, b.usuarioAtv || '', passwordAtvCifrado, certificadoP12Cifrado, certificadoPinCifrado, certificadoNombreArchivo, certificadoVenceEn, idCompania]
          );
        } else {
          await pool.query(
            "INSERT INTO compania_hacienda_config (id_compania, ambiente, usuario_atv, password_atv_enc, certificado_p12_enc, certificado_password_enc, certificado_nombre_archivo, certificado_vence_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [idCompania, b.ambiente, b.usuarioAtv || '', passwordAtvCifrado, certificadoP12Cifrado, certificadoPinCifrado, certificadoNombreArchivo, certificadoVenceEn]
          );
        }
        if (sucursal != null) await pool.query("UPDATE compania_hacienda_config SET sucursal = ? WHERE id_compania = ?", [sucursal, idCompania]);
        if (terminal != null) await pool.query("UPDATE compania_hacienda_config SET terminal = ? WHERE id_compania = ?", [terminal, idCompania]);
        if (correoAutomatico != null) await pool.query("UPDATE compania_hacienda_config SET correo_automatico = ? WHERE id_compania = ?", [correoAutomatico ? 1 : 0, idCompania]);
        for (const m of minimos) await pool.query(`UPDATE compania_hacienda_config SET ${m.columna} = ? WHERE id_compania = ?`, [m.valor, idCompania]);
        if (reiniciaVerificacion) await pool.query("UPDATE compania_hacienda_config SET config_verificada = 0, config_verificada_en = NULL WHERE id_compania = ?", [idCompania]);
        for (const c of correccionConsecutivos) {
          await pool.query(`UPDATE compania_hacienda_config SET ${c.columna} = GREATEST(${c.columna}, ?) WHERE id_compania = ?`, [c.valor, idCompania]);
        }
      } else {
        const cfg = configLocalHacienda(idCompania);
        Object.assign(cfg, {
          ambiente: b.ambiente, usuarioAtv: b.usuarioAtv || '',
          passwordAtvCifrado, certificadoP12Cifrado, certificadoPinCifrado,
          certificadoNombreArchivo, certificadoVenceEn
        });
        if (sucursal != null) cfg.sucursal = sucursal;
        if (terminal != null) cfg.terminal = terminal;
        if (correoAutomatico != null) cfg.correoAutomatico = correoAutomatico;
        for (const m of minimos) cfg[m.campo] = m.valor;
        if (reiniciaVerificacion) { cfg.configVerificada = false; cfg.configVerificadaEn = null; }
        for (const c of correccionConsecutivos) cfg[c.campo] = Math.max(cfg[c.campo], c.valor);
      }
      // Credenciales o ambiente nuevos: el token del IdP en caché ya no corresponde.
      cacheTokens.invalidarEmpresa(idCompania);

      res.json(await vistaConfigHacienda(idCompania));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sube la numeración desde una clave (50 dígitos) o un consecutivo (20) pegado de otro sistema:
  // el contador de ese tipo de documento queda en GREATEST(actual, pegado), así el siguiente
  // comprobante nunca repite un número que Hacienda ya tiene. Solo sube. Solo Administrador.
  app.post("/api/hacienda-config/ajustar-numeracion", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (session.rol !== "Administrador" && !isSaasAdmin(session)) {
        return res.status(403).json({ error: "Solo un usuario Administrador puede ajustar la numeración." });
      }
      const idCompania = session.idCompania;
      const desglose = desglosarClaveOConsecutivo(String(req.body?.texto ?? ""));
      if (!desglose) {
        return res.status(400).json({ error: "Pegue una clave de 50 dígitos o un consecutivo de 20 dígitos." });
      }
      if (!esTipoNumeracion(desglose.tipoDocumento)) {
        return res.status(400).json({ error: `El tipo de documento ${desglose.tipoDocumento} no se emite desde este sistema (solo 01, 02, 03 y 04).` });
      }
      if (desglose.secuencial > INT_MAX_COLUMNA) {
        return res.status(400).json({ error: "El número consecutivo pegado es demasiado grande." });
      }
      const company = await fetchCompanyById(idCompania);
      if (desglose.cedulaEmisor12 && company && limpiarIdentificacion(company.identificacion).padStart(12, "0").slice(-12) !== desglose.cedulaEmisor12) {
        return res.status(400).json({ error: "La clave pegada es de otro emisor (la cédula no coincide con la de esta empresa)." });
      }
      const vista = await vistaConfigHacienda(idCompania);
      const sucursalActual = vista.sucursal, terminalActual = vista.terminal;
      if (sucursalActual && terminalActual && (sucursalActual !== desglose.sucursal || terminalActual !== desglose.terminal)) {
        return res.status(400).json({ error: `Ese consecutivo es de la sucursal ${desglose.sucursal}, terminal ${desglose.terminal}, y esta empresa emite con la sucursal ${sucursalActual}, terminal ${terminalActual}. Con otra sucursal o terminal la numeración no choca; si esta empresa debe usar esa, cámbiela primero.` });
      }
      const n = NUMERACION_POR_TIPO[desglose.tipoDocumento];
      if (dbConnected && pool) {
        await pool.query("INSERT IGNORE INTO compania_hacienda_config (id_compania) VALUES (?)", [idCompania]);
        await pool.query(`UPDATE compania_hacienda_config SET ${n.ultimo} = GREATEST(${n.ultimo}, ?) WHERE id_compania = ?`, [desglose.secuencial, idCompania]);
      } else {
        const cfg = configLocalHacienda(idCompania);
        cfg[n.local] = Math.max(cfg[n.local], desglose.secuencial);
      }
      console.log(`[Hacienda] Numeración de ${n.nombre} ajustada con un número pegado (empresa ${idCompania}, usuario ${session.userId}): mínimo ${desglose.secuencial}.`);
      res.json({ tipoDocumento: desglose.tipoDocumento, nombre: n.nombre, secuencialPegado: desglose.secuencial, config: await vistaConfigHacienda(idCompania) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  async function cargarCertificadoEmpresa(idCompania: number): Promise<{ p12Base64: string; pin: string } | null> {
    let certificadoP12Cifrado: string | undefined;
    let certificadoPinCifrado: string | undefined;

    if (dbConnected && pool) {
      const [rows] = await pool.query("SELECT certificado_p12_enc, certificado_password_enc FROM compania_hacienda_config WHERE id_compania = ?", [idCompania]);
      const row = (rows as any[])[0];
      certificadoP12Cifrado = row?.certificado_p12_enc ? row.certificado_p12_enc.toString() : undefined;
      certificadoPinCifrado = row?.certificado_password_enc ? row.certificado_password_enc.toString() : undefined;
    } else {
      const row = localHaciendaConfigs.find(c => c.idCompania === idCompania);
      certificadoP12Cifrado = row?.certificadoP12Cifrado || undefined;
      certificadoPinCifrado = row?.certificadoPinCifrado || undefined;
    }

    if (!certificadoP12Cifrado || !certificadoPinCifrado) return null;

    return {
      p12Base64: decryptSecret(certificadoP12Cifrado),
      pin: decryptSecret(certificadoPinCifrado)
    };
  }

  app.post("/api/hacienda/verificar-certificado", requireAuth, async (req, res) => {
    try {
      const idCompania = parseInt(req.body.idCompania);
      if (!canAccessCompany(sessionOf(req), idCompania)) {
        return res.status(403).json({ error: "No autorizado." });
      }
      const cert = await cargarCertificadoEmpresa(idCompania);
      if (!cert) {
        return res.status(400).json({ error: "No se ha configurado un certificado criptográfico (.p12) para esta empresa." });
      }
      const info = verificarLlaveP12(cert.p12Base64, cert.pin);
      res.json(info);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // Firma un XML arbitrario con el certificado legal de la empresa. Ninguna pantalla lo usa; queda
  // solo para Administrador mientras se decide si se elimina.
  app.post("/api/hacienda/firmar", requireAuth, async (req, res) => {
    try {
      const idCompania = parseInt(req.body.idCompania);
      const session = sessionOf(req);
      if (!canAccessCompany(session, idCompania)) {
        return res.status(403).json({ error: "No autorizado." });
      }
      if (session.rol !== "Administrador" && !isSaasAdmin(session)) {
        return res.status(403).json({ error: "Solo un usuario Administrador puede firmar con el certificado de la empresa." });
      }
      if (esCompaniaPlataforma(idCompania)) {
        return res.status(403).json({ error: MENSAJE_PLATAFORMA_SIN_COMPROBANTES });
      }
      const xml = req.body.xml;
      if (!xml || typeof xml !== 'string') {
        return res.status(400).json({ error: "Falta el XML a firmar." });
      }
      const cert = await cargarCertificadoEmpresa(idCompania);
      if (!cert) {
        return res.status(400).json({ error: "No se ha configurado un certificado criptográfico (.p12) para esta empresa." });
      }
      const xmlFirmado = await firmarXadesEpes(xml, cert.p12Base64, cert.pin, (await parametrosFacturacion()).politicaFirma);
      res.json({ xmlFirmado });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  async function cargarCredencialesAtv(idCompania: number): Promise<CredencialesAtv | null> {
    if (dbConnected && pool) {
      const [rows] = await pool.query("SELECT ambiente, usuario_atv, password_atv_enc FROM compania_hacienda_config WHERE id_compania = ?", [idCompania]);
      const row = (rows as any[])[0];
      if (!row || !row.usuario_atv || !row.password_atv_enc) return null;
      return { ambiente: row.ambiente, usuarioAtv: row.usuario_atv, passwordAtv: decryptSecret(row.password_atv_enc.toString()) };
    } else {
      const row = localHaciendaConfigs.find(c => c.idCompania === idCompania);
      if (!row || !row.usuarioAtv || !row.passwordAtvCifrado) return null;
      return { ambiente: row.ambiente, usuarioAtv: row.usuarioAtv, passwordAtv: decryptSecret(row.passwordAtvCifrado) };
    }
  }

  // Modo sin BD: la configuración de Hacienda solo existía si alguien la guardó, y los contadores
  // de consecutivo viven en ella — sin esto, facturar sin haberla guardado reventaba con un
  // "cannot read properties of undefined". Sucursal/terminal: los mismos DEFAULT de las columnas.
  function configLocalHacienda(idCompania: number): LocalHaciendaConfig {
    let cfg = localHaciendaConfigs.find(c => c.idCompania === idCompania);
    if (!cfg) {
      cfg = {
        idCompania, ambiente: "PRUEBAS_LOCAL", usuarioAtv: "", passwordAtvCifrado: "", certificadoP12Cifrado: "", certificadoPinCifrado: "",
        certificadoNombreArchivo: null, certificadoVenceEn: null, ultimoConsecutivo: 0, ultimoConsecutivoNc: 0, ultimoConsecutivoNd: 0,
        ultimoConsecutivoTe: 0, sucursal: "001", terminal: "00001", numeracionMinimaFe: 0, numeracionMinimaNc: 0, numeracionMinimaNd: 0,
        numeracionMinimaTe: 0, correoAutomatico: true, configVerificada: false, configVerificadaEn: null
      };
      localHaciendaConfigs.push(cfg);
    }
    return cfg;
  }

  // Prefijo de mensajeError de un comprobante en ERROR cuyo envío se cortó sin poder confirmar si
  // Hacienda lo recibió. La cola lo sigue CONSULTANDO (nunca lo reenvía) y, mientras una Nota esté
  // así o en cola, no se emiten más Notas ni se anula la factura que referencia: si Hacienda sí la
  // tiene, emitir otra la duplicaría (ver notaEnEnvioIncierto).
  const MARCA_ENVIO_INCIERTO = "Envío incierto:";

  // Una sola operación a la vez sobre la misma factura (anular, Nota de Crédito, Nota de Débito) o
  // la misma consulta (facturarla). Entre revisar el estado y guardar el resultado pasan varios
  // segundos de transmisión y sondeo a Hacienda; dos solicitudes simultáneas —un doble clic, dos
  // pestañas— pasaban las dos la revisión y transmitían dos Notas de Crédito, que ante Hacienda ya
  // no se pueden retirar. Un candado en memoria basta: el servidor corre como un solo proceso pm2
  // (y la cola en segundo plano reclama cada fila con un UPDATE condicional, ver procesarColaHacienda).
  const operacionesEnCurso = new Set<string>();
  const candadoPorFactura = (req: any) => `factura:${parseInt(req.params.id)}`;
  const candadoPorConsulta = (req: any) => req.body?.idConsulta != null ? `consulta:${parseInt(req.body.idConsulta)}` : null;
  function unaOperacionALaVez(clave: (req: any) => string | null, handler: (req: any, res: any) => Promise<any>) {
    return async (req: any, res: any) => {
      const candado = clave(req);
      if (candado && operacionesEnCurso.has(candado)) {
        return res.status(409).json({ error: "Ya hay otra operación en curso sobre esta factura. Espere a que termine y revise el resultado antes de reintentar." });
      }
      if (candado) operacionesEnCurso.add(candado);
      try {
        await handler(req, res);
      } finally {
        if (candado) operacionesEnCurso.delete(candado);
      }
    };
  }

  // ======================= Emisión: guardar primero, transmitir después =======================
  // Cada comprobante se numera, se firma UNA vez y se guarda (estado PENDIENTE, con su clave y su
  // XML firmado) en la misma transacción; después se intenta transmitir una vez en la misma
  // solicitud (casi siempre el usuario ve el estado final de inmediato) y, si no se pudo, lo sigue
  // la cola en segundo plano. Así un comprobante que Hacienda aceptó nunca se pierde por un INSERT
  // local fallido (antes se transmitía primero y se guardaba después).

  interface ParametrosFacturacion {
    sondeo: ParametrosSondeo;
    fetchTimeoutMs: number;
    politicaFirma: PoliticaFirma;
    cola: ParametrosCola & { intervaloSeg: number; lote: number; bloqueoSeg: number };
    tokenMargenSeg: number;
    unidadServicio: string;
    unidadMercancia: string;
    codigoDescuentoDefecto: string;
    toleranciaMedioPago: number;
    mediosPagoMax: number;
    detalleMin: number;
    detalleMax: number;
    condicionesExigenReceptor: string[];
    /** Reintentos de una transacción de emisión ante un interbloqueo de MySQL (ER_LOCK_DEADLOCK). */
    transaccionReintentos: number;
    /** Segundos tras los cuales un envío automático de correo "en curso" se considera caído. */
    correoBloqueoSeg: number;
  }

  // Modo SIN base de datos (demostración en memoria): no existe parametros_sistema y nada se
  // transmite a Hacienda (los endpoints también salen de la BD). Con BD todos estos valores son
  // OBLIGATORIOS en parametros_sistema (docs/sql/2026-11-27-facturacion-robusta.sql los siembra).
  // La política de firma queda vacía a propósito: sin BD no se firma.
  const PARAMETROS_FACTURACION_SIN_BD: ParametrosFacturacion = {
    sondeo: { intentos: 4, esperaMs: 2000, plazoMs: 12000, consultaTimeoutMs: 5000 },
    fetchTimeoutMs: 20000,
    politicaFirma: { url: "", hashSha256: "" },
    cola: { intervaloSeg: 60, lote: 20, bloqueoSeg: 300, backoffBaseSeg: 60, backoffMaxSeg: 3600, maxIntentos: 12 },
    tokenMargenSeg: 60,
    unidadServicio: "Sp",
    unidadMercancia: "Unid",
    codigoDescuentoDefecto: "07",
    toleranciaMedioPago: 0.01,
    mediosPagoMax: 4,
    detalleMin: 3,
    detalleMax: 200,
    condicionesExigenReceptor: ["02"],
    transaccionReintentos: 3,
    correoBloqueoSeg: 600
  };
  let margenTokenSeg = PARAMETROS_FACTURACION_SIN_BD.tokenMargenSeg;
  let avisoBloqueoCorto = false;

  /** Número (puede ser decimal y 0) obligatorio de parametros_sistema. */
  async function parametroDecimal(clave: string): Promise<number> {
    const n = Number(((await parametro(clave)) ?? "").trim());
    if (((await parametro(clave)) ?? "").trim() === "" || !Number.isFinite(n) || n < 0) throw new ParametroFaltanteError(`Falta configurar el parámetro del sistema «${clave}».`);
    return n;
  }

  async function parametrosFacturacion(): Promise<ParametrosFacturacion> {
    if (!dbConnected || !pool) return PARAMETROS_FACTURACION_SIN_BD;
    const [intentos, esperaMs, plazoMs, consultaTimeoutMs, fetchTimeoutMs, url, hash, intervaloSeg, lote, bloqueoConfigurado, backoffBaseSeg, backoffMaxSeg, maxIntentos,
      tokenMargenSeg, unidadServicio, unidadMercancia, codigoDescuentoDefecto, toleranciaMedioPago, mediosPagoMax, detalleMin, detalleMax, condiciones,
      transaccionReintentos, correoBloqueoSeg] = await Promise.all([
      parametroEntero("hacienda_sondeo_intentos"), parametroEntero("hacienda_sondeo_espera_ms"), parametroEntero("hacienda_sondeo_plazo_ms"),
      parametroEntero("hacienda_consulta_timeout_ms"), parametroEntero("hacienda_fetch_timeout_ms"),
      parametroRequerido("hacienda_politica_firma_url"), parametroRequerido("hacienda_politica_firma_hash"),
      parametroEntero("hacienda_cola_intervalo_seg"), parametroEntero("hacienda_cola_lote"), parametroEntero("hacienda_cola_bloqueo_seg"),
      parametroEntero("hacienda_cola_backoff_base_seg"), parametroEntero("hacienda_cola_backoff_max_seg"), parametroEntero("hacienda_cola_max_intentos"),
      parametroEntero("hacienda_token_margen_seg"), parametroRequerido("hacienda_unidad_medida_servicio"), parametroRequerido("hacienda_unidad_medida_mercancia"),
      parametroRequerido("hacienda_codigo_descuento_defecto"), parametroDecimal("hacienda_medio_pago_tolerancia"), parametroEntero("hacienda_medios_pago_max"),
      parametroEntero("hacienda_detalle_min"), parametroEntero("hacienda_detalle_max"), parametroRequerido("hacienda_condiciones_exigen_receptor"),
      parametroEntero("hacienda_transaccion_reintentos"), parametroEntero("hacienda_correo_bloqueo_seg")
    ]);
    margenTokenSeg = tokenMargenSeg;
    // El reclamo de un comprobante debe durar más que un ciclo completo (token + envío + sondeo +
    // consulta): si no, otro proceso podría tomarlo a mitad del envío. Se usa el mayor y se avisa.
    const bloqueo = bloqueoMinimoSeg(bloqueoConfigurado, fetchTimeoutMs, plazoMs);
    if (bloqueo.ajustado && !avisoBloqueoCorto) {
      console.warn(`[Hacienda] hacienda_cola_bloqueo_seg (${bloqueoConfigurado}) es menor que un ciclo de envío; se usa ${bloqueo.seg}.`);
      avisoBloqueoCorto = true;
    }
    const bloqueoSeg = bloqueo.seg;
    return {
      sondeo: { intentos, esperaMs, plazoMs, consultaTimeoutMs },
      fetchTimeoutMs,
      politicaFirma: { url, hashSha256: hash },
      cola: { intervaloSeg, lote, bloqueoSeg, backoffBaseSeg, backoffMaxSeg, maxIntentos },
      tokenMargenSeg, unidadServicio, unidadMercancia, codigoDescuentoDefecto, toleranciaMedioPago, mediosPagoMax, detalleMin, detalleMax,
      condicionesExigenReceptor: condiciones.split(",").map(c => c.trim()).filter(Boolean),
      transaccionReintentos, correoBloqueoSeg
    };
  }

  /**
   * Transacción de emisión con reintento acotado ante un interbloqueo de MySQL (1213): la función
   * se vuelve a ejecutar completa (reserva de consecutivo, firma, INSERT), porque el rollback deshizo
   * todo y todavía nada salió hacia Hacienda.
   */
  async function enTransaccion<T>(fn: (connection: any) => Promise<T>): Promise<T> {
    const intentosMax = (await parametrosFacturacion()).transaccionReintentos;
    for (let intento = 1; ; intento++) {
      const connection = await pool!.getConnection();
      try {
        await connection.beginTransaction();
        const resultado = await fn(connection);
        await connection.commit();
        return resultado;
      } catch (err: any) {
        await connection.rollback().catch(() => {});
        const interbloqueo = err?.errno === 1213 || err?.code === "ER_LOCK_DEADLOCK";
        if (!interbloqueo || intento >= intentosMax) throw err;
        console.warn(`[Hacienda] Interbloqueo en la transacción de emisión; reintento ${intento + 1} de ${intentosMax}.`);
      } finally {
        connection.release();
      }
    }
  }

  /** Lease (reclamo) en segundos enteros: calza igual en DATETIME y DATETIME(3). */
  const nuevaLease = (bloqueoSeg: number) => new Date(Math.ceil((Date.now() + bloqueoSeg * 1000) / 1000) * 1000);

  /**
   * Reclama un comprobante para trabajarlo (cola, «Consultar estado», anular): UPDATE condicional
   * que solo gana si nadie lo tiene reclamado y (si se indica) sigue en el estado leído. Devuelve la
   * lease o null si otro proceso lo tiene.
   */
  async function reclamarDocumento(id: number, estadoLeido?: string): Promise<Date | null> {
    const p = await parametrosFacturacion();
    const lease = nuevaLease(p.cola.bloqueoSeg);
    const ahora = new Date();
    if (dbConnected && pool) {
      const [r] = await pool.query(
        `UPDATE facturas SET hacienda_procesando_hasta = ? WHERE id_factura = ? AND (hacienda_procesando_hasta IS NULL OR hacienda_procesando_hasta < ?)${estadoLeido ? " AND estado = ?" : ""}`,
        estadoLeido ? [lease, id, ahora, estadoLeido] : [lease, id, ahora]
      );
      return (r as any).affectedRows === 1 ? lease : null;
    }
    const local: any = localFacturas.find(f => f.id === id);
    if (!local) return null;
    const actual = local.haciendaProcesandoHasta ? new Date(local.haciendaProcesandoHasta) : null;
    if (actual && actual.getTime() >= ahora.getTime()) return null;
    if (estadoLeido && local.estado !== estadoLeido) return null;
    local.haciendaProcesandoHasta = lease;
    return lease;
  }

  // Catálogos de Hacienda (condición de venta, medios de pago, códigos de descuento) en la tabla
  // hacienda_catalogos; caché de 60 s como parametros_sistema.
  let cacheCatalogos: { filas: EntradaCatalogo[]; expira: number } | null = null;
  async function catalogosHacienda(): Promise<EntradaCatalogo[]> {
    if (!dbConnected || !pool) return CATALOGOS_SIN_BD;
    if (cacheCatalogos && cacheCatalogos.expira > Date.now()) return cacheCatalogos.filas;
    let filas: EntradaCatalogo[];
    try {
      const [rows] = await pool.query("SELECT tipo, codigo, descripcion, orden FROM hacienda_catalogos WHERE activo = 1 ORDER BY tipo, orden, codigo");
      filas = (rows as any[]).map(r => ({ tipo: String(r.tipo) as TipoCatalogo, codigo: String(r.codigo), descripcion: String(r.descripcion), orden: Number(r.orden) || 0 }));
    } catch (err: any) {
      if (cacheCatalogos) return cacheCatalogos.filas;
      throw new ParametroFaltanteError(`No se pudieron leer los catálogos de Hacienda (hacienda_catalogos): aplique docs/sql/2026-11-27-facturacion-robusta.sql. (${err?.code || err?.message})`);
    }
    if (filas.length === 0) throw new ParametroFaltanteError("El catálogo hacienda_catalogos está vacío: aplique docs/sql/2026-11-27-facturacion-robusta.sql.");
    cacheCatalogos = { filas, expira: Date.now() + 60_000 };
    return filas;
  }

  // Token del IdP en caché por (empresa, ambiente, usuario ATV) hasta expires_in − margen.
  const cacheTokens = crearCacheTokensHacienda({ margenSeg: () => margenTokenSeg });

  async function tokenHacienda(idCompania: number, credenciales: CredencialesAtv, endpoints: EndpointsHacienda, timeoutMs: number): Promise<string> {
    const clave = claveCacheToken(idCompania, credenciales.ambiente, credenciales.usuarioAtv);
    const enCache = cacheTokens.obtener(clave);
    if (enCache) return enCache;
    const nuevo = await obtenerTokenHaciendaConVigencia(endpoints, credenciales.usuarioAtv, credenciales.passwordAtv, timeoutMs);
    cacheTokens.guardar(clave, nuevo);
    return nuevo.token;
  }

  function invalidarTokenHacienda(idCompania: number, credenciales: CredencialesAtv) {
    cacheTokens.invalidar(claveCacheToken(idCompania, credenciales.ambiente, credenciales.usuarioAtv));
  }

  /** Token para una consulta puntual (rutas de consulta); un 401 posterior lo invalida. */
  async function tokenParaConsulta(idCompania: number, credenciales: CredencialesAtv, endpoints: EndpointsHacienda): Promise<string> {
    const p = await parametrosFacturacion();
    return tokenHacienda(idCompania, credenciales, endpoints, p.fetchTimeoutMs);
  }

  // --- Receptor: copia (snapshot) guardada en cada comprobante ---
  interface ReceptorSnapshot {
    tipoIdentificacion: string | null;
    identificacion: string | null;
    nombre: string;
    correo: string | null;
    codigoActividad: string | null;
    esTercero: boolean;
  }

  /** Lee una columna de una fila de BD (snake_case) o del objeto en memoria (camelCase). */
  const leerCampo = (doc: any, snake: string, camel: string): any => (doc && doc[snake] !== undefined ? doc[snake] : doc?.[camel]);

  function receptorDesdePaciente(p: any): ReceptorSnapshot {
    return {
      tipoIdentificacion: p?.tipoIdentificacion ?? null,
      identificacion: p?.identificacion ? String(p.identificacion) : null,
      nombre: String(p?.nombreCompleto ?? ""),
      correo: p?.correoElectronico || null,
      codigoActividad: null,
      esTercero: false
    };
  }

  /** Receptor guardado en el comprobante; null en comprobantes anteriores a la copia (usar el paciente). */
  function receptorGuardado(doc: any): ReceptorSnapshot | null {
    if (doc?.receptorSnapshot) return doc.receptorSnapshot;
    if (doc && doc.receptor_nombre != null) {
      return {
        tipoIdentificacion: doc.receptor_tipo_id ?? null,
        identificacion: doc.receptor_numero ?? null,
        nombre: String(doc.receptor_nombre),
        correo: doc.receptor_correo ?? null,
        codigoActividad: doc.receptor_actividad ?? null,
        esTercero: !!Number(doc.receptor_es_tercero ?? 0)
      };
    }
    return null;
  }

  /** Bloque <Receptor> del XML: solo con identificación costarricense válida (nunca EXT → 03). */
  function receptorParaXml(r: ReceptorSnapshot | null): ReceptorFactura | null {
    if (!r || !identificacionReceptorValida(r.tipoIdentificacion, r.identificacion)) return null;
    return {
      nombre: r.nombre,
      tipoIdentificacion: String(r.tipoIdentificacion),
      identificacion: limpiarIdentificacion(String(r.identificacion)),
      correoElectronico: r.correo || undefined,
      codigoActividad: r.codigoActividad && /^\d{6}$/.test(r.codigoActividad) ? r.codigoActividad : undefined
    };
  }

  function emisorDe(company: Company): EmisorFactura {
    return {
      nombre: company.razonSocial, nombreComercial: company.nombreComercial,
      tipoIdentificacion: company.tipoIdentificacion, identificacion: company.identificacion,
      correoElectronico: company.correoEmisor, provincia: company.provincia, canton: company.canton,
      distrito: company.distrito, otrasSenas: company.otrasSenas,
      // Solo un comprobante que NO se transmite (SIMULADA) puede llegar aquí sin código válido: las
      // validaciones previas (problemasEmisor) lo exigen antes de numerar uno real.
      codigoActividad: codigoActividadValido(company.actividadEconomica) ?? limpiarCodigoActividad(company.actividadEconomica)
    };
  }

  /**
   * Reserva el siguiente consecutivo del tipo de documento DENTRO de la transacción de emisión
   * (FOR UPDATE sobre la fila de configuración; upsert si la empresa nunca guardó su configuración).
   * Usa la sucursal/terminal y la numeración mínima de la empresa. Si la transacción se revierte, el
   * número no se pierde.
   */
  async function reservarConsecutivo(connection: any | null, idCompania: number, tipoDocumento: TipoNumeracion): Promise<string> {
    const n = NUMERACION_POR_TIPO[tipoDocumento];
    if (connection) {
      // Primero el SELECT ... FOR UPDATE; la fila solo se crea si falta (antes: INSERT IGNORE y luego
      // FOR UPDATE, que con dos emisiones simultáneas podía interbloquearse). Un interbloqueo que
      // igual ocurra se reintenta completo (enTransaccion).
      const consulta = `SELECT ${n.ultimo} AS ultimo, ${n.minimo} AS minimo, sucursal, terminal FROM compania_hacienda_config WHERE id_compania = ? FOR UPDATE`;
      let [rows] = await connection.query(consulta, [idCompania]);
      if ((rows as any[]).length === 0) {
        await connection.query("INSERT INTO compania_hacienda_config (id_compania) VALUES (?) ON DUPLICATE KEY UPDATE id_compania = id_compania", [idCompania]);
        [rows] = await connection.query(consulta, [idCompania]);
      }
      const row = (rows as any[])[0];
      const siguiente = Math.max(Number(row?.ultimo) || 0, Number(row?.minimo) || 0) + 1;
      await connection.query(`UPDATE compania_hacienda_config SET ${n.ultimo} = ? WHERE id_compania = ?`, [siguiente, idCompania]);
      return generarConsecutivo(siguiente, String(row?.sucursal ?? ""), String(row?.terminal ?? ""), tipoDocumento);
    }
    const cfg = configLocalHacienda(idCompania);
    const siguiente = Math.max(cfg[n.local], cfg[n.localMin]) + 1;
    cfg[n.local] = siguiente;
    return generarConsecutivo(siguiente, cfg.sucursal, cfg.terminal, tipoDocumento);
  }

  /** Datos de configuración que validan una emisión (sin secretos). */
  async function estadoConfigEmision(idCompania: number): Promise<{ certificadoVenceEn: string | null; correoAutomatico: boolean }> {
    const vista = await vistaConfigHacienda(idCompania);
    return { certificadoVenceEn: vista.certificadoVenceEn ?? null, correoAutomatico: vista.correoAutomatico !== false };
  }

  interface DocumentoNuevo {
    idCompania: number;
    idCita: number | null;
    idConsulta: number | null;
    idPaciente: number;
    tipoDocumento: string;
    clave: string;
    consecutivo: string;
    fechaEmision: string;
    ambiente: string;
    lineas: any[];
    resumen: ResumenCalculado;
    estado: string;
    mensajeError: string | null;
    condicionVenta: string;
    plazoCredito: number | null;
    mediosPago: MedioPagoComprobante[];
    montoRecibido: number | null;
    idFacturaReferencia: number | null;
    motivoAnulacion: string | null;
    xmlFirmado: string | null;
    receptor: ReceptorSnapshot;
    correoCopiaPaciente: boolean;
    notaEfecto: "ANULACION" | "CREDITO" | "DEBITO" | null;
    procesandoHasta: Date | null;
  }

  /** INSERT del comprobante y sus líneas (en la transacción de emisión). Devuelve el id. */
  async function insertarDocumento(connection: any | null, d: DocumentoNuevo): Promise<number> {
    const medioPrincipal = d.mediosPago[0]?.tipo ?? "01";
    const creadaEn = new Date().toISOString();
    if (connection) {
      const [result] = await connection.query(
        `INSERT INTO facturas (idCompania, idCita, id_consulta, idPaciente, clave, consecutivo, fechaEmision, ambiente, subtotal, totalIva, total, estado, mensajeError, creadaEn,
          condicionVenta, tipoDocumento, idFacturaReferencia, motivoAnulacion, medioPago, montoRecibido, plazoCredito, xml_firmado, respuesta_hacienda,
          receptor_tipo_id, receptor_numero, receptor_nombre, receptor_correo, receptor_actividad, receptor_es_tercero, correo_copia_paciente,
          medios_pago, total_descuentos, hacienda_intentos, hacienda_post_realizado, hacienda_procesando_hasta, nota_efecto, efectos_aplicados, hacienda_origen_legado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, 0)`,
        [d.idCompania, d.idCita, d.idConsulta, d.idPaciente, d.clave, d.consecutivo, d.fechaEmision, d.ambiente, d.resumen.totalVentaNeta, d.resumen.totalImpuesto, d.resumen.totalComprobante,
          d.estado, d.mensajeError, creadaEn, d.condicionVenta, d.tipoDocumento, d.idFacturaReferencia, d.motivoAnulacion, medioPrincipal, d.montoRecibido, d.plazoCredito, d.xmlFirmado,
          d.receptor.tipoIdentificacion, d.receptor.identificacion, recortarDetalle(d.receptor.nombre, LARGOS_RECEPTOR.nombre), d.receptor.correo, d.receptor.codigoActividad, d.receptor.esTercero ? 1 : 0, d.correoCopiaPaciente ? 1 : 0,
          JSON.stringify(d.mediosPago), d.resumen.totalDescuentos, d.procesandoHasta, d.notaEfecto, d.notaEfecto ? 0 : 1]
      );
      const id = (result as any).insertId;
      await guardarLineasFactura(connection, id, d.lineas);
      return id;
    }
    const id = Math.max(0, ...localFacturas.map(f => f.id)) + 1;
    localFacturas.push({
      id, idCompania: d.idCompania, idCita: d.idCita, idConsulta: d.idConsulta, idPaciente: d.idPaciente, clave: d.clave, consecutivo: d.consecutivo,
      fechaEmision: d.fechaEmision, ambiente: d.ambiente as any, lineas: d.lineas, subtotal: d.resumen.totalVentaNeta, totalIva: d.resumen.totalImpuesto,
      total: d.resumen.totalComprobante, estado: d.estado as any, mensajeError: d.mensajeError, creadaEn, condicionVenta: d.condicionVenta,
      tipoDocumento: d.tipoDocumento as any, idFacturaReferencia: d.idFacturaReferencia, motivoAnulacion: d.motivoAnulacion, medioPago: medioPrincipal,
      montoRecibido: d.montoRecibido, plazoCredito: d.plazoCredito,
      ...({
        xmlFirmado: d.xmlFirmado, respuestaHacienda: null, receptorSnapshot: d.receptor, correoCopiaPaciente: d.correoCopiaPaciente,
        mediosPago: d.mediosPago, totalDescuentos: d.resumen.totalDescuentos, haciendaIntentos: 0, haciendaPostRealizado: false,
        haciendaProcesandoHasta: d.procesandoHasta, notaEfecto: d.notaEfecto, efectosAplicados: !d.notaEfecto
      } as any)
    });
    return id;
  }

  interface CambiosEnvio {
    estado?: string;
    mensajeError?: string | null;
    respuestaHacienda?: string | null;
    intentos?: number;
    consultas?: number;
    proximoIntento?: Date | null;
    ultimoIntento?: Date | null;
    errorDetalle?: string | null;
    postRealizado?: boolean;
    liberar?: boolean;
  }

  /**
   * Persiste el resultado de un intento de transmisión. undefined = no tocar ese campo.
   * Con `lease` la escritura solo se aplica si este proceso SIGUE teniendo el reclamo (si venció y
   * otro lo tomó, no pisa lo que el otro escribió). Devuelve si se aplicó.
   */
  async function guardarCambiosEnvio(id: number, c: CambiosEnvio, lease?: Date | null): Promise<boolean> {
    const errorDetalle = c.errorDetalle == null ? c.errorDetalle : String(c.errorDetalle).slice(0, 1000);
    if (dbConnected && pool) {
      const sets: string[] = [];
      const valores: any[] = [];
      const poner = (col: string, v: any) => { sets.push(`${col} = ?`); valores.push(v); };
      if (c.estado !== undefined) poner("estado", c.estado);
      if (c.mensajeError !== undefined) poner("mensajeError", c.mensajeError);
      if (c.respuestaHacienda) poner("respuesta_hacienda", c.respuestaHacienda);
      if (c.intentos !== undefined) poner("hacienda_intentos", c.intentos);
      if (c.consultas !== undefined) poner("hacienda_consultas", c.consultas);
      if (c.proximoIntento !== undefined) poner("hacienda_proximo_intento", c.proximoIntento);
      if (c.ultimoIntento !== undefined) poner("hacienda_ultimo_intento", c.ultimoIntento);
      if (errorDetalle !== undefined) poner("hacienda_error_detalle", errorDetalle);
      if (c.postRealizado !== undefined) poner("hacienda_post_realizado", c.postRealizado ? 1 : 0);
      if (c.liberar) sets.push("hacienda_procesando_hasta = NULL");
      if (sets.length === 0) return true;
      valores.push(id);
      if (lease) valores.push(lease);
      const [r] = await pool.query(`UPDATE facturas SET ${sets.join(", ")} WHERE id_factura = ?${lease ? " AND hacienda_procesando_hasta = ?" : ""}`, valores);
      return (r as any).affectedRows === 1;
    }
    const local: any = localFacturas.find(f => f.id === id);
    if (!local) return false;
    if (lease && !(local.haciendaProcesandoHasta && new Date(local.haciendaProcesandoHasta).getTime() === lease.getTime())) return false;
    if (c.consultas !== undefined) local.haciendaConsultas = c.consultas;
    if (c.estado !== undefined) local.estado = c.estado;
    if (c.mensajeError !== undefined) local.mensajeError = c.mensajeError;
    if (c.respuestaHacienda) local.respuestaHacienda = c.respuestaHacienda;
    if (c.intentos !== undefined) local.haciendaIntentos = c.intentos;
    if (c.proximoIntento !== undefined) local.haciendaProximoIntento = c.proximoIntento;
    if (c.ultimoIntento !== undefined) local.haciendaUltimoIntento = c.ultimoIntento;
    if (errorDetalle !== undefined) local.haciendaErrorDetalle = errorDetalle;
    if (c.postRealizado !== undefined) local.haciendaPostRealizado = c.postRealizado;
    if (c.liberar) local.haciendaProcesandoHasta = null;
    return true;
  }

  /** Forma que recibe el navegador: sin XML ni MensajeHacienda (pesan KB) y con nombres camelCase. */
  function documentoParaCliente(doc: any, lineas?: any[]): any {
    if (!doc) return doc;
    const { xml_firmado, respuesta_hacienda, xmlFirmado, respuestaHacienda, receptorSnapshot, ...resto } = doc;
    const snap = receptorGuardado(doc);
    const fecha = (v: any) => (v == null ? null : v instanceof Date ? v.toISOString() : String(v));
    let mediosPago: any = leerCampo(doc, "medios_pago", "mediosPago");
    if (typeof mediosPago === "string") {
      try { mediosPago = JSON.parse(mediosPago); } catch { mediosPago = null; }
    }
    return {
      ...resto,
      idConsulta: doc.idConsulta ?? doc.id_consulta ?? null,
      lineas: lineas ?? (typeof doc.lineas === "string" ? JSON.parse(doc.lineas) : doc.lineas) ?? [],
      receptorNombre: snap?.nombre ?? doc.receptorNombre ?? null,
      receptorIdentificacion: snap?.identificacion ?? doc.receptorIdentificacion ?? null,
      receptorTipoIdentificacion: snap?.tipoIdentificacion ?? doc.receptorTipoIdentificacion ?? null,
      receptorCorreo: snap?.correo ?? null,
      receptorActividad: snap?.codigoActividad ?? null,
      receptorEsTercero: snap?.esTercero ?? false,
      correoCopiaPaciente: !!Number(leerCampo(doc, "correo_copia_paciente", "correoCopiaPaciente") ?? 0),
      mediosPago: Array.isArray(mediosPago) ? mediosPago : null,
      totalDescuentos: Number(leerCampo(doc, "total_descuentos", "totalDescuentos") ?? 0),
      haciendaIntentos: Number(leerCampo(doc, "hacienda_intentos", "haciendaIntentos") ?? 0),
      haciendaConsultas: Number(leerCampo(doc, "hacienda_consultas", "haciendaConsultas") ?? 0),
      haciendaProximoIntento: fecha(leerCampo(doc, "hacienda_proximo_intento", "haciendaProximoIntento")),
      haciendaUltimoIntento: fecha(leerCampo(doc, "hacienda_ultimo_intento", "haciendaUltimoIntento")),
      haciendaErrorDetalle: leerCampo(doc, "hacienda_error_detalle", "haciendaErrorDetalle") ?? null,
      correoEnviado: Number(leerCampo(doc, "correo_enviado", "correoEnviado") ?? 0) === 1,
      correoEnviadoEn: fecha(leerCampo(doc, "correo_enviado_en", "correoEnviadoEn")),
      correoError: leerCampo(doc, "correo_error", "correoError") ?? null
    };
  }

  /** Firma con la política de parametros_sistema. Lanza si falla (nada salió todavía del servidor). */
  async function firmarComprobante(xml: string, cert: CertificadoEmpresa, p: ParametrosFacturacion): Promise<string> {
    return firmarXadesEpes(xml, cert.p12Base64, cert.pin, p.politicaFirma);
  }

  /** Prefijo del aviso de un comprobante que Hacienda recibió y todavía no resuelve tras muchas consultas. */
  const AVISO_HACIENDA_NO_RESPONDE = "Hacienda aún no responde sobre este comprobante";

  /**
   * Un ciclo de transmisión de un comprobante ya guardado (lo usan el intento sincrónico y la cola).
   * Quien llama ya tiene el reclamo (`lease`); toda escritura es condicional a seguir teniéndolo.
   * Nunca firma: transmite el XML firmado guardado. Nunca reenvía lo que pudo haber llegado:
   * consulta por la clave y solo reenvía si Hacienda dice que no lo tiene (y nunca solo en un
   * comprobante anterior a la cola). El POST va precedido de una marca compare-and-set: dos
   * procesos nunca envían la misma clave, aunque un reclamo venza. Nunca lanza.
   */
  async function ejecutarCicloEnvio(id: number, lease: Date): Promise<void> {
    let estadoAnterior = "";
    let estadoNuevo = "";
    let p: ParametrosFacturacion | null = null;
    let intentos = 0;
    let consultas = 0;
    let accion: ReturnType<typeof decidirAccionCola> = "NINGUNA";
    try {
      const doc = await cargarFacturaPorId(id);
      if (!doc) return;
      estadoAnterior = String(doc.estado);
      estadoNuevo = estadoAnterior;
      p = await parametrosFacturacion();
      const pp = p;
      const ahora = new Date();
      intentos = Number(leerCampo(doc, "hacienda_intentos", "haciendaIntentos")) || 0;
      consultas = Number(leerCampo(doc, "hacienda_consultas", "haciendaConsultas")) || 0;
      const postRealizado = !!Number(leerCampo(doc, "hacienda_post_realizado", "haciendaPostRealizado") ?? 0);
      const legado = !!Number(leerCampo(doc, "hacienda_origen_legado", "haciendaOrigenLegado") ?? 0);
      // ¿Pudo haber llegado un POST anterior de esta clave? (un comprobante legado no lleva registro)
      const postPrevio = legado || !!leerCampo(doc, "hacienda_ultimo_post", "haciendaUltimoPost");
      const xmlFirmado: string | null = leerCampo(doc, "xml_firmado", "xmlFirmado") ?? null;
      accion = decidirAccionCola({ estado: estadoAnterior, postRealizado, intentos, tieneXmlFirmado: !!xmlFirmado }, pp.cola.maxIntentos);
      const enCola = estadoAnterior === "PENDIENTE";

      const guardar = async (c: CambiosEnvio): Promise<boolean> => {
        const ok = await guardarCambiosEnvio(id, { ...c, liberar: true }, lease);
        if (ok && c.estado) estadoNuevo = c.estado;
        return ok;
      };
      // Falla de ENVÍO (nada llegó a Hacienda): cuenta como intento de envío, con espera creciente.
      const falloEnvio = (mensaje: string, detalle: string, extra: CambiosEnvio = {}) => guardar({
        intentos: intentos + 1, ultimoIntento: ahora, proximoIntento: calcularProximoIntento(intentos + 1, ahora, pp.cola),
        errorDetalle: detalle, ...(enCola || extra.estado ? { mensajeError: mensaje } : {}), ...extra
      });
      // Consulta sin respuesta útil: NUNCA se agota. Tras maxIntentos consultas se avisa en pantalla
      // (y un PENDIENTE cuyo POST pudo llegar pasa a ERROR con la marca de envío incierto).
      const sinRespuesta = (detalle: string, mensajeEnCola?: string) => {
        const n = consultas + 1;
        const r = estadoSinRespuesta(estadoAnterior, n, pp.cola.maxIntentos);
        const mensaje = r.aviso === "ENVIO_INCIERTO"
          ? `${MARCA_ENVIO_INCIERTO} no se pudo confirmar si Hacienda recibió este comprobante (${detalle}). El sistema lo seguirá consultando; no lo vuelva a emitir.`
          : r.aviso === "HACIENDA_NO_RESPONDE"
          ? `${AVISO_HACIENDA_NO_RESPONDE} (${n} consultas). El sistema lo seguirá consultando.`
          : enCola ? mensajeEnCola : undefined;
        return guardar({
          consultas: n, ultimoIntento: ahora, proximoIntento: calcularProximoIntento(n, ahora, pp.cola), errorDetalle: detalle,
          ...(r.estado !== estadoAnterior ? { estado: r.estado } : {}), ...(mensaje ? { mensajeError: mensaje } : {})
        });
      };
      const falloPrevio = (mensaje: string, detalle: string) => accion === "CONSULTAR" ? sinRespuesta(detalle, mensaje) : falloEnvio(mensaje, detalle);

      if (accion === "NINGUNA") { await guardar({}); return; }
      if (accion === "AGOTADO") {
        const ultimo = leerCampo(doc, "hacienda_error_detalle", "haciendaErrorDetalle");
        await guardar({ estado: "ERROR", proximoIntento: null, mensajeError: `No se pudo transmitir a Hacienda después de ${intentos} intentos${ultimo ? ` (${ultimo})` : ""}. Corrija la configuración y use «Reintentar envío».` });
        return;
      }
      // La empresa de plataforma nunca transmite (también desde la cola).
      if (esCompaniaPlataforma(doc.idCompania)) {
        await guardar({ ...(enCola ? { estado: "ERROR" } : {}), mensajeError: MENSAJE_PLATAFORMA_SIN_COMPROBANTES, proximoIntento: null });
        return;
      }
      const company = await fetchCompanyById(doc.idCompania);
      if (!company) { await falloPrevio("En cola: no se encontró la empresa.", "Empresa no encontrada"); return; }
      const credenciales = await cargarCredencialesAtv(doc.idCompania);
      if (!credenciales) { await falloPrevio("En cola: la empresa no tiene credenciales ATV configuradas. Se reintentará automáticamente.", "Sin credenciales ATV"); return; }
      if (credenciales.ambiente !== doc.ambiente) {
        await falloPrevio(`En cola: el comprobante es de ${doc.ambiente} y la empresa está configurada en ${credenciales.ambiente}. Vuelva a ese ambiente para transmitirlo.`, "Ambiente distinto");
        return;
      }
      let endpoints: EndpointsHacienda;
      let token: string;
      try {
        endpoints = await endpointsHaciendaPara(credenciales.ambiente);
        token = await tokenHacienda(doc.idCompania, credenciales, endpoints, pp.fetchTimeoutMs);
      } catch (err: any) {
        const detalle = err?.name === "TimeoutError" ? "tiempo de espera agotado" : (err?.message || String(err));
        await falloPrevio(`En cola: no se pudo iniciar sesión en Hacienda (${detalle}). Se reintentará automáticamente.`, detalle);
        return;
      }

      // Estado y mensaje según lo que dijo Hacienda en una consulta. El mensaje sigue las MISMAS
      // reglas que «Consultar estado» (estadoTrasConsulta): aviso de notas viejas cuyos efectos no se
      // aplicaron, efectos a revertir si se rechaza una nota ya aplicada, saldo a favor.
      const aplicarConsulta = async (consulta: EstadoHaciendaResultado, docBase: any = doc) => {
        const r = estadoTrasConsultaCola(consulta.estado, { legado });
        if (r.estado === null) {
          if (consulta.httpStatus === 401 || consulta.httpStatus === 403) invalidarTokenHacienda(doc.idCompania, credenciales);
          return sinRespuesta(consulta.detalleMensaje || "Consulta sin respuesta", "En cola: no se pudo consultar a Hacienda. Se reintentará automáticamente.");
        }
        const base: CambiosEnvio = { consultas: consultas + 1, ultimoIntento: ahora, respuestaHacienda: consulta.respuestaXmlBase64 };
        if (r.revisionManual) {
          return guardar({ ...base, estado: "ERROR", postRealizado: false, proximoIntento: null, errorDetalle: "Hacienda no tiene esta clave",
            mensajeError: "Comprobante anterior a la cola automática: Hacienda no tiene registro de esta clave. No se reenvía solo: revíselo y anúlelo (no requiere Nota de Crédito) o use «Reintentar envío»." });
        }
        if (r.estado === "PENDIENTE") {
          // Hacienda no lo tiene: el MISMO XML firmado se reenvía en el siguiente ciclo.
          return guardar({ ...base, estado: "PENDIENTE", postRealizado: false, proximoIntento: ahora, errorDetalle: "Hacienda no tiene esta clave",
            mensajeError: "En cola: Hacienda no tiene registro de este comprobante; se reenviará el mismo comprobante firmado." });
        }
        let mensaje = estadoTrasConsulta(docBase, consulta).mensajeError;
        if (r.estado === "ENVIADA") {
          const n = consultas + 1;
          if (mensaje && (mensaje.startsWith("En cola") || mensaje.startsWith(MARCA_ENVIO_INCIERTO) || mensaje.startsWith(AVISO_HACIENDA_NO_RESPONDE))) mensaje = null;
          const aviso = estadoSinRespuesta("ENVIADA", n, pp.cola.maxIntentos).aviso === "HACIENDA_NO_RESPONDE";
          return guardar({ ...base, estado: "ENVIADA", postRealizado: true, proximoIntento: calcularProximoIntento(n, ahora, pp.cola), errorDetalle: null,
            mensajeError: aviso && !mensaje ? `${AVISO_HACIENDA_NO_RESPONDE} (${n} consultas). El sistema lo seguirá consultando.` : mensaje });
        }
        return guardar({ ...base, estado: r.estado, postRealizado: true, proximoIntento: null, errorDetalle: null, mensajeError: mensaje });
      };

      if (accion === "CONSULTAR") {
        await aplicarConsulta(await consultarEstadoHacienda(endpoints, token, doc.clave, pp.fetchTimeoutMs));
        return;
      }

      // ENVIAR. Marca compare-and-set ANTES del POST: solo envía el proceso que la gana (estado
      // PENDIENTE, sin POST previo, con el reclamo vigente). Si el proceso muere a mitad, el
      // siguiente ciclo consulta la clave en vez de reenviar a ciegas.
      let marcado = false;
      if (dbConnected && pool) {
        const [r] = await pool.query(
          "UPDATE facturas SET hacienda_post_realizado = 1, hacienda_ultimo_post = ? WHERE id_factura = ? AND estado = 'PENDIENTE' AND hacienda_post_realizado = 0 AND hacienda_procesando_hasta = ?",
          [ahora, id, lease]
        );
        marcado = (r as any).affectedRows === 1;
      } else {
        const local: any = localFacturas.find(f => f.id === id);
        if (local && local.estado === "PENDIENTE" && !local.haciendaPostRealizado && local.haciendaProcesandoHasta && new Date(local.haciendaProcesandoHasta).getTime() === lease.getTime()) {
          local.haciendaPostRealizado = true;
          local.haciendaUltimoPost = ahora;
          marcado = true;
        }
      }
      if (!marcado) return; // otro proceso lo tomó o cambió: no se envía ni se toca nada

      const receptorXml = receptorParaXml(receptorGuardado(doc));
      let envio: Awaited<ReturnType<typeof enviarFacturaHacienda>> | null = null;
      let errorRed: any = null;
      try {
        envio = await enviarFacturaHacienda({
          endpoints, token, clave: doc.clave, fechaEmisionIso: doc.fechaEmision,
          tipoIdentificacionEmisor: company.tipoIdentificacion, cedulaEmisor: limpiarIdentificacion(company.identificacion),
          tipoIdentificacionReceptor: receptorXml?.tipoIdentificacion, cedulaReceptor: receptorXml?.identificacion,
          xmlFirmado: xmlFirmado as string, timeoutMs: pp.fetchTimeoutMs
        });
      } catch (err: any) {
        errorRed = err;
      }
      const clase = envio ? clasificarRespuestaEnvio(envio.status ?? null, envio.causa ?? null, { postPrevio }) : "INCIERTO";
      // Rechazo de la recepción (un 4xx sobre el contenido): reenviar el mismo XML no puede
      // funcionar, así que queda como RECHAZADA y se ofrece «Reintentar con clave nueva».
      const rechazoRecepcion = (detalle: string) => guardar({
        estado: "RECHAZADA", postRealizado: false, intentos: intentos + 1, ultimoIntento: ahora, proximoIntento: null, errorDetalle: detalle,
        mensajeError: `Hacienda rechazó la recepción del comprobante: ${detalle}. Corrija la causa y use «Reintentar con clave nueva».`
      });
      if (clase === "TOKEN_INVALIDO") {
        invalidarTokenHacienda(doc.idCompania, credenciales);
        await falloEnvio(`En cola: Hacienda no aceptó la sesión (${envio?.mensaje}). Se reintentará automáticamente.`, envio?.mensaje || "401", { postRealizado: false });
        return;
      }
      if (clase === "RECHAZO_RECEPCION") { await rechazoRecepcion(envio?.mensaje || "sin detalle"); return; }
      if (clase === "INCIERTO" || clase === "CONSULTAR_ANTES_DE_RECHAZAR") {
        const detalleCorte = errorRed ? (errorRed?.name === "TimeoutError" ? "tiempo de espera agotado" : errorRed?.message || String(errorRed)) : (envio?.mensaje || "sin respuesta");
        const consulta = await esperarResolucionHacienda(endpoints, token, doc.clave, pp.sondeo);
        if (consulta.estado === "no_encontrado") {
          // Un 4xx y Hacienda confirma que no lo tiene: rechazo real de la recepción.
          if (clase === "CONSULTAR_ANTES_DE_RECHAZAR") { await rechazoRecepcion(detalleCorte); return; }
          await falloEnvio(`En cola: el envío falló (${detalleCorte}) y Hacienda confirmó que no lo recibió. Se reintentará con el mismo comprobante firmado.`, detalleCorte, { postRealizado: false });
          return;
        }
        if (consulta.estado === "error") {
          await falloEnvio(`${MARCA_ENVIO_INCIERTO} se cortó la comunicación al enviarlo (${detalleCorte}) y no se pudo confirmar si Hacienda lo recibió. El sistema lo seguirá consultando; no lo vuelva a emitir.`, detalleCorte, { estado: "ERROR", postRealizado: true });
          return;
        }
        await aplicarConsulta(consulta);
        return;
      }
      // RECIBIDO o YA_RECIBIDO (clave repetida: ya lo tiene). Se escribe ENVIADA y, si es una Nota,
      // se aplican sus efectos de inmediato (no al final del sondeo).
      const okEnviada = await guardarCambiosEnvio(id, { estado: "ENVIADA", intentos: intentos + 1, consultas: 0, ultimoIntento: ahora, errorDetalle: null, mensajeError: null }, lease);
      if (!okEnviada) return;
      estadoNuevo = "ENVIADA";
      await aplicarEfectosNota(id);
      const docEnviada = (await cargarFacturaPorId(id)) ?? { ...doc, estado: "ENVIADA" };
      const consulta = await esperarResolucionHacienda(endpoints, token, doc.clave, pp.sondeo);
      if (consulta.estado === "no_encontrado" || consulta.estado === "error") {
        // Recién recibido: todavía no aparece o no se pudo consultar. Sigue ENVIADA; la cola consulta.
        await guardar({ postRealizado: true, consultas: 0, proximoIntento: calcularProximoIntento(1, ahora, pp.cola) });
        return;
      }
      consultas = 0;
      await aplicarConsulta(consulta, docEnviada);
    } catch (err: any) {
      // Una excepción determinística no debe repetirse en cada vuelta: cuenta como intento (de envío
      // o de consulta, según lo que tocaba) y espera según el backoff.
      const detalle = err?.message || String(err);
      console.error(`[Hacienda] Error en el ciclo de envío del comprobante ${id}:`, detalle);
      const ahora = new Date();
      const n = (accion === "CONSULTAR" ? consultas : intentos) + 1;
      await guardarCambiosEnvio(id, {
        ...(accion === "CONSULTAR" ? { consultas: n } : { intentos: n }), ultimoIntento: ahora,
        ...(p ? { proximoIntento: calcularProximoIntento(n, ahora, p.cola) } : {}), errorDetalle: detalle, liberar: true
      }, lease).catch(() => {});
    } finally {
      if (estadoNuevo && estadoNuevo !== estadoAnterior) await trasCambioDeEstado(id, estadoAnterior, estadoNuevo);
    }
  }

  /**
   * Efectos de un cambio de estado (intento sincrónico, cola o «Consultar estado»):
   * - una Nota que Hacienda recibió aplica sus efectos (inventario, CxC, anulación) una sola vez;
   * - un comprobante que queda ACEPTADO se envía por correo al receptor (si la empresa lo tiene activo).
   * Nunca lanza.
   */
  async function trasCambioDeEstado(id: number, antes: string, despues: string): Promise<void> {
    try {
      if (despues === "ENVIADA" || despues === "ACEPTADA") await aplicarEfectosNota(id);
      if (despues === "ACEPTADA" && antes !== "ACEPTADA") {
        // En segundo plano: el correo (PDF + SMTP) no debe demorar la respuesta de la emisión.
        void enviarCorreoComprobante(id, true).catch(err => console.warn(`[Correo] Envío automático del comprobante ${id} falló:`, err?.message || err));
      }
    } catch (err: any) {
      console.error(`[Hacienda] Error aplicando efectos del comprobante ${id}:`, err?.message || err);
    }
  }

  /**
   * Efectos locales de una Nota recibida por Hacienda (ENVIADA/ACEPTADA), aplicados UNA vez: la
   * bandera efectos_aplicados pasa de 0 a 1 con un UPDATE condicional dentro de la misma transacción.
   * Si el proceso se cae antes, la cola barre las notas recibidas con efectos pendientes.
   */
  async function aplicarEfectosNota(idNota: number): Promise<void> {
    const nota: any = await cargarFacturaPorId(idNota);
    if (!nota || (nota.tipoDocumento !== "02" && nota.tipoDocumento !== "03")) return;
    if (nota.estado !== "ENVIADA" && nota.estado !== "ACEPTADA") return;
    const efecto = leerCampo(nota, "nota_efecto", "notaEfecto");
    const aplicados = leerCampo(nota, "efectos_aplicados", "efectosAplicados");
    if (!efecto || aplicados === undefined || !!Number(aplicados) || aplicados === true) return;
    const factura = await cargarFacturaPorId(nota.idFacturaReferencia);
    if (!factura || factura.idCompania !== nota.idCompania) return;
    const lineas = await lineasDeFactura(nota);
    const motivo = String(nota.motivoAnulacion || "");
    const total = Number(nota.total) || 0;
    let saldoAFavor = 0;
    const aplicar = async (connection: any | null) => {
      if (efecto === "ANULACION") {
        await aplicarAnulacion(connection, factura, lineas, motivo);
      } else if (efecto === "CREDITO") {
        await moverStockPorNota(connection, factura.idCompania, lineas, 1, `Nota de Crédito ${nota.consecutivo} sobre ${factura.consecutivo}`, motivo);
        if (factura.condicionVenta === "02") saldoAFavor = await ajustarCxcPorNota(connection, factura, -total);
      } else if (efecto === "DEBITO") {
        await moverStockPorNota(connection, factura.idCompania, lineas, -1, `Nota de Débito ${nota.consecutivo} sobre ${factura.consecutivo}`, motivo);
        if (factura.condicionVenta === "02") await ajustarCxcPorNota(connection, factura, total);
      }
    };
    try {
      if (dbConnected && pool) {
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          const [r] = await connection.query("UPDATE facturas SET efectos_aplicados = 1 WHERE id_factura = ? AND efectos_aplicados = 0 AND estado IN ('ENVIADA', 'ACEPTADA')", [idNota]);
          if ((r as any).affectedRows !== 1) {
            await connection.rollback();
            return;
          }
          await aplicar(connection);
          await connection.commit();
        } catch (err) {
          await connection.rollback().catch(() => {});
          throw err;
        } finally {
          connection.release();
        }
      } else {
        if (nota.efectosAplicados) return;
        nota.efectosAplicados = true;
        await aplicar(null);
      }
    } catch (err: any) {
      await guardarCambiosEnvio(idNota, { mensajeError: `Hacienda recibió esta nota, pero no se pudo aplicar su efecto en inventario/cuenta por cobrar (${err?.message || err}): ajústelo a mano.` });
      return;
    }
    if (saldoAFavor > 0) {
      await guardarCambiosEnvio(idNota, { mensajeError: `${MARCA_SALDO_A_FAVOR} ₡${saldoAFavor.toLocaleString("es-CR")} — lo acreditado superó lo que quedaba por cobrar de la factura. Devuélvalo fuera del sistema.` });
    } else if (nota.mensajeError === AVISO_EFECTOS_NO_APLICADOS) {
      await guardarCambiosEnvio(idNota, { mensajeError: null });
    }
  }

  /** Intento sincrónico después de guardar (con el reclamo `lease`): devuelve el comprobante actualizado. */
  async function transmitirYRecargar(id: number, lease: Date): Promise<any> {
    await ejecutarCicloEnvio(id, lease);
    const doc = await cargarFacturaPorId(id);
    return documentoParaCliente(doc, doc ? await lineasDeFactura(doc) : []);
  }

  // --- Cola en segundo plano ---
  let colaEnCurso = false;

  /**
   * Toma un lote de comprobantes por transmitir o consultar y procesa cada uno. Cada fila se
   * RECLAMA con un UPDATE condicional (affectedRows === 1): dos procesos nunca trabajan la misma.
   * Se saltan las empresas que no están ACTIVA y la empresa de plataforma. Solo con BD. Además
   * barre las Notas recibidas cuyos efectos quedaron sin aplicar y los correos automáticos que un
   * proceso caído dejó "en curso".
   */
  async function procesarColaHacienda(): Promise<void> {
    if (colaEnCurso || !dbConnected || !pool) return;
    colaEnCurso = true;
    try {
      const p = await parametrosFacturacion();
      const ahora = new Date();
      const [rows] = await pool.query(
        `SELECT f.id_factura FROM facturas f JOIN companias c ON c.id_compania = f.idCompania
          WHERE (f.estado IN ('PENDIENTE', 'ENVIADA') OR (f.estado = 'ERROR' AND f.hacienda_post_realizado = 1))
            AND f.ambiente IN ('SANDBOX', 'PRODUCCION') AND f.xml_firmado IS NOT NULL
            AND (f.hacienda_proximo_intento IS NULL OR f.hacienda_proximo_intento <= ?)
            AND (f.hacienda_procesando_hasta IS NULL OR f.hacienda_procesando_hasta < ?)
            AND c.estadoSaas = 'ACTIVA' AND f.idCompania <> ?
          ORDER BY f.hacienda_proximo_intento IS NOT NULL, f.hacienda_proximo_intento, f.id_factura
          LIMIT ?`,
        [ahora, ahora, idCompaniaPlataforma(), p.cola.lote]
      );
      for (const r of rows as any[]) {
        const lease = nuevaLease(p.cola.bloqueoSeg);
        const [reclamo] = await pool.query(
          `UPDATE facturas SET hacienda_procesando_hasta = ? WHERE id_factura = ?
            AND (hacienda_procesando_hasta IS NULL OR hacienda_procesando_hasta < ?)
            AND estado IN ('PENDIENTE', 'ENVIADA', 'ERROR')`,
          [lease, r.id_factura, new Date()]
        );
        if ((reclamo as any).affectedRows !== 1) continue;
        await ejecutarCicloEnvio(r.id_factura, lease);
      }

      // Notas que Hacienda recibió y cuyos efectos no se aplicaron (el proceso se cayó en medio).
      const [notas] = await pool.query(
        `SELECT id_factura FROM facturas WHERE tipoDocumento IN ('02', '03') AND estado IN ('ENVIADA', 'ACEPTADA')
            AND efectos_aplicados = 0 AND nota_efecto IS NOT NULL LIMIT ?`,
        [p.cola.lote]
      );
      for (const n of notas as any[]) await aplicarEfectosNota(n.id_factura);

      // Correos automáticos "en curso" con un reclamo vencido: el proceso que los tomó se cayó.
      const [correos] = await pool.query(
        `SELECT id_factura FROM facturas WHERE estado = 'ACEPTADA' AND correo_enviado = 2
            AND (correo_reclamado_en IS NULL OR correo_reclamado_en < ?) LIMIT ?`,
        [new Date(Date.now() - p.correoBloqueoSeg * 1000), p.cola.lote]
      );
      for (const c of correos as any[]) {
        await enviarCorreoComprobante(c.id_factura, true).catch(err => console.warn(`[Correo] Reenvío automático del comprobante ${c.id_factura} falló:`, err?.message || err));
      }
    } catch (err: any) {
      console.error("[Hacienda] Cola de transmisión:", err?.message || err);
    } finally {
      colaEnCurso = false;
    }
  }

  /** Programa la cola con el intervalo vigente de parametros_sistema (se relee en cada vuelta). */
  async function programarColaHacienda(): Promise<void> {
    await procesarColaHacienda();
    let intervaloSeg = PARAMETROS_FACTURACION_SIN_BD.cola.intervaloSeg;
    try {
      intervaloSeg = (await parametrosFacturacion()).cola.intervaloSeg;
    } catch (err: any) {
      console.warn("[Hacienda] Cola: parámetros incompletos, se reintenta con el intervalo por omisión:", err?.message || err);
    }
    setTimeout(() => { programarColaHacienda().catch(() => {}); }, intervaloSeg * 1000);
  }

  /** "Efectivo ₡5 000,00 · Tarjeta ₡3 000,00" con las descripciones del catálogo de la BD. */
  async function textoMediosPago(doc: any): Promise<string | null> {
    if (doc.condicionVenta === "02") return null;
    let catalogo: EntradaCatalogo[] = [];
    try { catalogo = await catalogosHacienda(); } catch { /* sin catálogo se muestran los códigos */ }
    const nombre = (tipo: string) => catalogo.find(e => e.tipo === "MEDIO_PAGO" && e.codigo === tipo)?.descripcion ?? tipo;
    const medios: MedioPagoComprobante[] = Array.isArray(doc.mediosPago) && doc.mediosPago.length > 0 ? doc.mediosPago : [{ tipo: doc.medioPago || "01", monto: Number(doc.total) }];
    if (medios.length === 1) return nombre(medios[0].tipo);
    return medios.map(m => `${nombre(m.tipo)} ₡${Number(m.monto).toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join(" · ");
  }

  // --- Correo del comprobante (manual y automático al quedar ACEPTADO) ---

  /**
   * Envía el comprobante por correo al receptor: PDF + XML firmado + MensajeHacienda (lo que haya).
   * El destinatario es el correo del receptor guardado en el comprobante (el paciente o el tercero
   * a quien se facturó), con copia al paciente si se pidió. `automatico`: solo comprobantes
   * ACEPTADOS reales (nunca PRUEBAS_LOCAL/SIMULADA), una sola vez, si la empresa lo tiene activo;
   * nunca lanza por falta de correo o SMTP: lo anota en correo_error.
   */
  async function enviarCorreoComprobante(id: number, automatico: boolean): Promise<any> {
    const falla = (mensaje: string, status = 400) => Object.assign(new Error(mensaje), { status });
    const factura: any = await cargarFacturaPorId(id);
    if (!factura) throw falla("Factura no encontrada.", 404);
    const idCompania = factura.idCompania;

    if (automatico) {
      if (factura.estado !== "ACEPTADA" || factura.ambiente === "PRUEBAS_LOCAL" || esCompaniaPlataforma(idCompania)) return null;
      // Un comprobante anterior a la cola que se resuelve ahora no dispara un correo sorpresa.
      if (Number(leerCampo(factura, "hacienda_origen_legado", "haciendaOrigenLegado") ?? 0)) return null;
      const { correoAutomatico } = await estadoConfigEmision(idCompania);
      if (!correoAutomatico) return null;
    }

    factura.lineas = await lineasDeFactura(factura);
    // Estas dos conservan el nombre snake_case del esquema original de Hacienda; se exponen en
    // camelCase aquí, que es el único punto que las consume (los adjuntos del correo).
    factura.xmlFirmado = factura.xmlFirmado ?? factura.xml_firmado ?? null;
    factura.respuestaHacienda = factura.respuestaHacienda ?? factura.respuesta_hacienda ?? null;

    let company: Company | undefined;
    let paciente: Patient | undefined;
    let smtpConfig: CompaniaSmtpConfig | undefined;
    if (dbConnected && pool) {
      company = await fetchCompanyById(idCompania);
      const [pacienteRows] = await pool.query("SELECT * FROM pacientes WHERE id_paciente = ? AND idCompania = ?", [factura.idPaciente, idCompania]);
      paciente = (pacienteRows as any[]).map(row => normalizeRow(row, 'id_paciente'))[0];
      const [smtpRows] = await pool.query("SELECT * FROM compania_smtp_config WHERE idCompania = ?", [idCompania]);
      const smtpRow = (smtpRows as any[])[0];
      smtpConfig = smtpRow ? { ...smtpRow, activo: !!smtpRow.activo } : undefined;
    } else {
      company = localCompanies.find(c => c.id === idCompania);
      paciente = localPatients.find(p => p.id === factura.idPaciente && p.idCompania === idCompania);
      smtpConfig = localSmtpConfigs.find(s => s.idCompania === idCompania);
    }
    if (!company) throw falla("Empresa no encontrada.", 404);
    const receptor = receptorGuardado(factura) ?? (paciente ? receptorDesdePaciente(paciente) : null);
    const destino = receptor?.correo || (!receptor?.esTercero ? paciente?.correoElectronico : null) || null;
    const copiaPaciente = !!Number(leerCampo(factura, "correo_copia_paciente", "correoCopiaPaciente") ?? 0)
      && paciente?.correoElectronico && paciente.correoElectronico !== destino ? paciente.correoElectronico : null;

    const anotarError = async (mensaje: string) => {
      if (dbConnected && pool) await pool.query("UPDATE facturas SET correo_enviado = 0, correo_error = ? WHERE id_factura = ?", [mensaje.slice(0, 500), id]);
      else Object.assign(factura, { correoEnviado: 0, correoError: mensaje });
    };
    const problema = !receptor ? "No se encontró el receptor del comprobante."
      : !destino ? (receptor.esTercero ? "El receptor (tercero) no tiene un correo electrónico registrado." : "El paciente no tiene un correo electrónico registrado.")
      : (!smtpConfig || !smtpConfig.activo) ? "Las notificaciones SMTP no están activas para esta empresa." : null;
    if (problema) {
      if (automatico) { await anotarError(problema); return null; }
      throw falla(problema);
    }

    // Envío automático: se reclama con un UPDATE condicional (0 → 2 "en curso") para no enviarlo dos veces.
    // El reclamo lleva fecha: si el proceso que lo tomó se cae, la cola lo recupera cuando vence
    // hacienda_correo_bloqueo_seg (correoReclamable). En operación normal se envía una sola vez.
    if (automatico) {
      const { correoBloqueoSeg } = await parametrosFacturacion();
      const ahora = new Date();
      if (dbConnected && pool) {
        const [r] = await pool.query(
          `UPDATE facturas SET correo_enviado = 2, correo_reclamado_en = ? WHERE id_factura = ?
             AND (correo_enviado = 0 OR (correo_enviado = 2 AND (correo_reclamado_en IS NULL OR correo_reclamado_en < ?)))`,
          [ahora, id, new Date(ahora.getTime() - correoBloqueoSeg * 1000)]
        );
        if ((r as any).affectedRows !== 1) return null;
      } else {
        const local: any = localFacturas.find(f => f.id === id);
        if (!local || !correoReclamable(Number(local.correoEnviado) || 0, local.correoReclamadoEn ? new Date(local.correoReclamadoEn) : null, ahora, correoBloqueoSeg)) return null;
        local.correoEnviado = 2;
        local.correoReclamadoEn = ahora;
      }
    }

    // Lo que ven la plantilla y el PDF: el receptor real (paciente o tercero) y, si es un tercero,
    // el nombre del paciente atendido.
    const receptorPlantilla = { ...(paciente || {}), nombreCompleto: receptor!.nombre, identificacion: receptor!.identificacion || "", correoElectronico: destino } as Patient;
    const vista = documentoParaCliente(factura, factura.lineas);
    const facturaPlantilla = { ...vista, pacienteNombre: receptor!.esTercero ? paciente?.nombreCompleto ?? null : null, mediosPagoTexto: await textoMediosPago(vista) };
    const rendered = renderFacturaEmail({ company, patient: receptorPlantilla, factura: facturaPlantilla });

    // Adjuntos: el PDF va siempre, incluso en facturas simuladas — es el comprobante que el
    // receptor archiva. Los dos XML solo si existen (el firmado y el MensajeHacienda).
    try {
      const adjuntosFactura: AdjuntoEmail[] = [];
      const pdfFactura = await generarPdfDesdeHtml(renderFacturaPdf({ company, patient: receptorPlantilla, factura: facturaPlantilla }), `comprobante ${factura.consecutivo}`);
      if (pdfFactura) adjuntosFactura.push({ filename: `comprobante-${factura.consecutivo}.pdf`, content: pdfFactura, contentType: "application/pdf" });
      if (factura.xmlFirmado) adjuntosFactura.push({ filename: `comprobante-${factura.consecutivo}.xml`, content: factura.xmlFirmado, contentType: "application/xml" });
      if (factura.respuestaHacienda) {
        // Hacienda la devuelve en base64; se adjunta ya decodificada para que se pueda abrir.
        adjuntosFactura.push({ filename: `respuesta-hacienda-${factura.consecutivo}.xml`, content: Buffer.from(factura.respuestaHacienda, "base64"), contentType: "application/xml" });
      }
      await sendMail(smtpConfig!, {
        to: destino!,
        ...(copiaPaciente ? { cc: copiaPaciente } : {}),
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        attachments: adjuntosFactura
      });
    } catch (err: any) {
      await anotarError(`No se pudo enviar el correo: ${err?.message || err}`);
      if (automatico) return null;
      throw err;
    }

    if (dbConnected && pool) {
      await pool.query("UPDATE facturas SET correo_enviado = 1, correo_enviado_en = ?, correo_error = NULL WHERE id_factura = ?", [new Date(), id]);
    } else {
      const local: any = localFacturas.find(f => f.id === id);
      if (local) Object.assign(local, { correoEnviado: 1, correoEnviadoEn: new Date().toISOString(), correoError: null });
    }

    const log: any = {
      idCompania,
      idCita: null,
      idConsulta: null,
      tipo: "FACTURA",
      destinatario: copiaPaciente ? `${destino}, ${copiaPaciente}` : destino,
      asunto: rendered.subject,
      cuerpo: rendered.text,
      enviadoEn: new Date().toISOString()
    };
    if (dbConnected && pool) {
      const [result] = await pool.query(
        "INSERT INTO notification_logs (idCompania, idCita, idConsulta, tipo, destinatario, asunto, cuerpo, enviadoEn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [log.idCompania, log.idCita, log.idConsulta, log.tipo, log.destinatario, log.asunto, log.cuerpo, log.enviadoEn]
      );
      log.id = (result as any).insertId;
    } else {
      log.id = Math.max(0, ...localLogs.map(item => item.id), 0) + 1;
      localLogs.push(log);
    }
    return log;
  }

  // --- Consultas a Hacienda (API pública y comprobantes emitidos) ---
  // Todo acotado a la empresa de la sesión; las URLs y límites salen de parametros_sistema.

  /** Responde un error de las consultas a Hacienda con el código adecuado y un mensaje legible. */
  function responderErrorHacienda(res: express.Response, err: any, contexto: string) {
    if (err instanceof HaciendaPublicaError) return res.status(err.status).json({ error: err.message });
    if (err instanceof ParametroFaltanteError) return res.status(503).json({ error: err.message });
    console.error(`[Hacienda] ${contexto}:`, err?.message || err);
    return res.status(500).json({ error: `No se pudo completar la consulta (${err?.message || err}).` });
  }

  async function buscarCabysNormalizado(q: string) {
    const [base, max] = await Promise.all([parametroRequerido("hacienda_api_publica_url"), parametroEntero("hacienda_cabys_resultados_max")]);
    return buscarCabysHacienda(base, q, max);
  }

  // Proxy al catálogo oficial CABYS de Hacienda (evita CORS desde el navegador). Lo consume el
  // formulario de servicios de CompanySettings: devuelve un ARREGLO [{codigo, descripcion, impuesto}]
  // (ese archivo acepta un arreglo) y, como antes, [] ante términos cortos o fallas de Hacienda.
  app.get("/api/cabys", requireAuth, async (req, res) => {
    try {
      const q = String(req.query.q ?? "").trim();
      if (!q) return res.json([]);
      res.json((await buscarCabysNormalizado(q)).items);
    } catch (err: any) {
      if (err instanceof HaciendaPublicaError) return res.json([]);
      responderErrorHacienda(res, err, "Búsqueda CABYS");
    }
  });

  // Igual que /api/cabys pero con los errores visibles: { total, items: [{codigo, descripcion, impuesto}] }.
  app.get("/api/hacienda/cabys", requireAuth, async (req, res) => {
    try {
      res.json(await buscarCabysNormalizado(String(req.query.q ?? "")));
    } catch (err: any) {
      responderErrorHacienda(res, err, "Búsqueda CABYS");
    }
  });

  // CABYS sugeridos según el perfil de la empresa de la sesión, más los generales.
  app.get("/api/hacienda/cabys/sugeridos", requireAuth, async (req, res) => {
    try {
      if (!dbConnected || !pool) return res.json([]);
      const company = await fetchCompanyById(sessionOf(req).idCompania);
      const perfil = company?.perfilCompania;
      // 'Ambas' ve los dos perfiles; Spa o Legal solo los generales.
      const perfiles: string[] = perfil === "Ambas" ? ["Fisioterapia", "Nutrición"] : perfil === "Fisioterapia" || perfil === "Nutrición" ? [perfil] : [];
      perfiles.push("General");
      const [rows] = await pool.query(
        `SELECT codigo, descripcion, impuesto, perfil FROM cabys_sugeridos WHERE activo = 1 AND perfil IN (?) ORDER BY perfil = 'General', perfil, orden, id`,
        [perfiles]
      );
      res.json((rows as any[]).map(r => ({
        codigo: String(r.codigo),
        descripcion: String(r.descripcion),
        impuesto: r.impuesto == null ? null : Number(r.impuesto),
        perfil: String(r.perfil)
      })));
    } catch (err: any) {
      responderErrorHacienda(res, err, "CABYS sugeridos");
    }
  });

  app.get("/api/hacienda/contribuyente/:identificacion", requireAuth, async (req, res) => {
    try {
      res.json(await consultarContribuyente(await parametroRequerido("hacienda_api_publica_url"), req.params.identificacion));
    } catch (err: any) {
      responderErrorHacienda(res, err, "Consulta de contribuyente");
    }
  });

  // El tipo de cambio es el mismo para todas las empresas y cambia una vez al día: caché en memoria
  // por los minutos de hacienda_tipo_cambio_cache_min (parametros_sistema).
  let cacheTipoCambio: { datos: TipoCambio; consultadoEn: string; expira: number } | null = null;
  app.get("/api/hacienda/tipo-cambio", requireAuth, async (_req, res) => {
    try {
      if (!cacheTipoCambio || cacheTipoCambio.expira <= Date.now()) {
        const [base, minutos] = await Promise.all([parametroRequerido("hacienda_api_publica_url"), parametroEntero("hacienda_tipo_cambio_cache_min")]);
        const datos = await consultarTipoCambio(base);
        cacheTipoCambio = { datos, consultadoEn: new Date().toISOString(), expira: Date.now() + minutos * 60_000 };
      }
      res.json({ ...cacheTipoCambio.datos, consultadoEn: cacheTipoCambio.consultadoEn });
    } catch (err: any) {
      responderErrorHacienda(res, err, "Tipo de cambio");
    }
  });

  app.get("/api/hacienda/exoneracion/:autorizacion", requireAuth, async (req, res) => {
    try {
      res.json(await consultarExoneracion(await parametroRequerido("hacienda_api_publica_url"), req.params.autorizacion));
    } catch (err: any) {
      responderErrorHacienda(res, err, "Consulta de exoneración");
    }
  });

  /**
   * Credenciales y endpoints de Hacienda de la empresa de la sesión para consultar comprobantes.
   * Solo Administrador o Contador de la empresa. Responde y devuelve null si no se puede seguir.
   */
  async function prepararConsultaComprobantes(req: express.Request, res: express.Response): Promise<{ credenciales: CredencialesAtv; endpoints: EndpointsHacienda; idCompania: number } | null> {
    const session = sessionOf(req);
    if (session.rol !== "Administrador" && session.rol !== "Contador") {
      res.status(403).json({ error: "Solo un Administrador o un Contador de la empresa puede consultar los comprobantes en Hacienda." });
      return null;
    }
    const idCompania = session.idCompania;
    const credenciales = await cargarCredencialesAtv(idCompania);
    if (!credenciales) {
      res.status(400).json({ error: "La empresa no tiene configurado el usuario y la contraseña ATV de Hacienda (Personalizar Clínica → Hacienda)." });
      return null;
    }
    if (credenciales.ambiente === "PRUEBAS_LOCAL") {
      res.status(400).json({ error: "La empresa está en ambiente de pruebas locales: sus comprobantes nunca se envían a Hacienda, así que no hay nada que consultar.", ambiente: credenciales.ambiente });
      return null;
    }
    try {
      return { credenciales, endpoints: await endpointsHaciendaPara(credenciales.ambiente), idCompania };
    } catch (err: any) {
      res.status(503).json({ error: err.message, ambiente: credenciales.ambiente });
      return null;
    }
  }

  // Comprobantes emitidos por la empresa según Hacienda, cruzados con las facturas locales.
  app.get("/api/hacienda/comprobantes", requireAuth, async (req, res) => {
    try {
      const prep = await prepararConsultaComprobantes(req, res);
      if (!prep) return;
      const { credenciales, endpoints, idCompania } = prep;
      const ambiente = credenciales.ambiente;

      const offsetCrudo = parseInt(String(req.query.offset ?? "0"), 10);
      const offset = Number.isInteger(offsetCrudo) && offsetCrudo >= 0 ? offsetCrudo : 0;
      const limit = await parametroEntero("hacienda_comprobantes_limite");

      const company = await fetchCompanyById(idCompania);
      const emisor = formatoEmisorHacienda(company?.tipoIdentificacion, company?.identificacion);
      if (!emisor) {
        return res.status(400).json({ error: "La identificación de la empresa no es válida para consultar en Hacienda (revise el tipo y el número de identificación).", ambiente });
      }

      let token: string;
      try {
        token = await tokenParaConsulta(idCompania, credenciales, endpoints);
      } catch (err: any) {
        return res.status(502).json({ error: `No se pudo iniciar sesión en Hacienda con el usuario ATV de la empresa (${err.message}).`, ambiente });
      }

      const lista = await listarComprobantesEmitidos({ token, ambiente, emisor, offset, limit, endpoints, timeoutMs: (await parametrosFacturacion()).fetchTimeoutMs });
      if (lista.errorCausa) {
        return res.status(502).json({ error: lista.errorCausa, ambiente });
      }

      // Cruce con las facturas locales de la MISMA empresa por clave.
      const claves = lista.items.map(i => i.clave);
      const locales = new Map<string, { id: number; consecutivo: string; total: number; estado: string; receptorNombre: string | null }>();
      if (claves.length > 0) {
        if (dbConnected && pool) {
          const [rows] = await pool.query(
            "SELECT f.id_factura, f.clave, f.consecutivo, f.total, f.estado, p.nombreCompleto AS receptorNombre FROM facturas f LEFT JOIN pacientes p ON p.id_paciente = f.idPaciente AND p.idCompania = f.idCompania WHERE f.idCompania = ? AND f.clave IN (?)",
            [idCompania, claves]
          );
          for (const r of rows as any[]) {
            locales.set(String(r.clave), { id: r.id_factura, consecutivo: String(r.consecutivo), total: Number(r.total), estado: String(r.estado), receptorNombre: r.receptorNombre ?? null });
          }
        } else {
          for (const f of localFacturas.filter(f => f.idCompania === idCompania && claves.includes(f.clave))) {
            const pac = localPatients.find(p => p.id === f.idPaciente && p.idCompania === idCompania);
            locales.set(f.clave, { id: f.id, consecutivo: f.consecutivo, total: Number(f.total), estado: f.estado, receptorNombre: pac?.nombreCompleto ?? null });
          }
        }
      }

      res.json({
        ambiente,
        offset,
        limit,
        total: lista.total ?? null,
        items: lista.items.map(i => ({ ...i, local: locales.get(i.clave) ?? null }))
      });
    } catch (err: any) {
      responderErrorHacienda(res, err, "Comprobantes emitidos");
    }
  });

  // Estado de un comprobante en Hacienda (solo consulta: no cambia nada en el sistema).
  app.get("/api/hacienda/comprobantes/:clave", requireAuth, async (req, res) => {
    try {
      const clave = String(req.params.clave || "");
      if (!/^\d{50}$/.test(clave)) return res.status(400).json({ error: "La clave del comprobante debe tener 50 dígitos." });
      const prep = await prepararConsultaComprobantes(req, res);
      if (!prep) return;
      const { credenciales, endpoints } = prep;

      let consulta: EstadoHaciendaResultado;
      try {
        const token = await tokenParaConsulta(prep.idCompania, credenciales, endpoints);
        consulta = await consultarEstadoHacienda(endpoints, token, clave, (await parametrosFacturacion()).fetchTimeoutMs);
        if (consulta.httpStatus === 401 || consulta.httpStatus === 403) invalidarTokenHacienda(prep.idCompania, credenciales);
      } catch (err: any) {
        return res.status(502).json({ error: `No se pudo consultar a Hacienda en este momento (${err.message}). Intente de nuevo en unos minutos.`, ambiente: credenciales.ambiente });
      }
      if (consulta.estado === "error") {
        return res.status(502).json({ error: `No se pudo consultar a Hacienda en este momento${consulta.detalleMensaje ? ` (${consulta.detalleMensaje})` : ""}. Intente de nuevo en unos minutos.`, ambiente: credenciales.ambiente });
      }
      res.json({ clave, ambiente: credenciales.ambiente, estado: consulta.estado, detalleMensaje: consulta.detalleMensaje });
    } catch (err: any) {
      responderErrorHacienda(res, err, "Estado de comprobante");
    }
  });

  // 10.1 Facturas (Factura Electrónica / Tiquete Electrónico v4.4) — siempre acotadas a la empresa
  // de la sesión; se ignora cualquier idCompania que venga en el query/body para evitar que una
  // empresa lea o facture a nombre de otra.

  // Catálogos de Hacienda para los selectores del navegador (condición de venta, medios de pago,
  // códigos de descuento) y los parámetros que el formulario necesita para validar antes de enviar.
  app.get("/api/hacienda/catalogos", requireAuth, async (_req, res) => {
    try {
      const [catalogo, p] = await Promise.all([catalogosHacienda(), parametrosFacturacion()]);
      const de = (tipo: TipoCatalogo) => catalogo.filter(e => e.tipo === tipo).map(e => ({ codigo: e.codigo, descripcion: e.descripcion }));
      res.json({
        condicionesVenta: de("CONDICION_VENTA"),
        mediosPago: de("MEDIO_PAGO"),
        codigosDescuento: de("CODIGO_DESCUENTO"),
        codigoDescuentoDefecto: p.codigoDescuentoDefecto,
        toleranciaMedioPago: p.toleranciaMedioPago,
        mediosPagoMax: p.mediosPagoMax,
        condicionesExigenReceptor: p.condicionesExigenReceptor
      });
    } catch (err: any) {
      responderErrorHacienda(res, err, "Catálogos de Hacienda");
    }
  });

  app.get("/api/facturas", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      if (dbConnected && pool) {
        // Sin xml_firmado ni respuesta_hacienda: pesan varios KB por fila y la pantalla no los usa.
        const [rows] = await pool.query(
          // Receptor visible para el Contador (que no carga pacientes): SOLO nombre e identificación
          // (la copia guardada en el comprobante o, en los anteriores, la del paciente, con el JOIN
          // acotado a la misma empresa). Nada clínico.
          `SELECT f.id_factura, f.id_consulta, f.idCompania, f.idCita, f.idPaciente, f.clave, f.consecutivo, f.fechaEmision, f.ambiente, f.subtotal, f.totalIva, f.total,
                  f.estado, f.mensajeError, f.creadaEn, f.condicionVenta, f.tipoDocumento, f.idFacturaReferencia, f.motivoAnulacion, f.medioPago, f.montoRecibido, f.plazoCredito,
                  f.receptor_tipo_id, f.receptor_numero, f.receptor_nombre, f.receptor_correo, f.receptor_actividad, f.receptor_es_tercero, f.correo_copia_paciente,
                  f.medios_pago, f.total_descuentos, f.hacienda_intentos, f.hacienda_consultas, f.hacienda_proximo_intento, f.hacienda_ultimo_intento, f.hacienda_error_detalle,
                  f.correo_enviado, f.correo_enviado_en, f.correo_error,
                  p.nombreCompleto AS receptorNombre, p.identificacion AS receptorIdentificacion, p.tipoIdentificacion AS receptorTipoIdentificacion, p.nombreCompleto AS pacienteNombre
             FROM facturas f LEFT JOIN pacientes p ON p.id_paciente = f.idPaciente AND p.idCompania = f.idCompania WHERE f.idCompania = ?`,
          [idCompania]
        );
        const facturas = (rows as any[]).map(row => normalizeRow(row, 'id_factura'));
        const lineasPorFactura = await fetchLineasPorFactura(facturas.map(f => f.id_factura));
        res.json(facturas.map(r => documentoParaCliente(r, lineasPorFactura.get(r.id_factura) || [])));
      } else {
        res.json(localFacturas.filter(f => f.idCompania === idCompania).map((f: any) => {
          const pac = localPatients.find(p => p.id === f.idPaciente && p.idCompania === idCompania);
          return documentoParaCliente({ ...f, receptorNombre: pac?.nombreCompleto ?? null, receptorIdentificacion: pac?.identificacion ?? null, receptorTipoIdentificacion: pac?.tipoIdentificacion ?? null, pacienteNombre: pac?.nombreCompleto ?? null });
        }));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Terceros a los que un paciente pide facturar (paciente_receptores_factura) ---

  async function pacienteDeEmpresa(idPaciente: number, idCompania: number): Promise<Patient | undefined> {
    if (!Number.isInteger(idPaciente)) return undefined;
    if (dbConnected && pool) {
      const [rows] = await pool.query("SELECT * FROM pacientes WHERE id_paciente = ? AND idCompania = ?", [idPaciente, idCompania]);
      return (rows as any[]).map(row => normalizeRow(row, 'id_paciente'))[0];
    }
    return localPatients.find(p => p.id === idPaciente && p.idCompania === idCompania);
  }

  async function receptoresDePaciente(idCompania: number, idPaciente: number): Promise<LocalReceptorFactura[]> {
    if (dbConnected && pool) {
      const [rows] = await pool.query("SELECT id, idCompania, idPaciente, tipoIdentificacion, numero, nombre, correo, telefono, codigoActividad, creadoEn FROM paciente_receptores_factura WHERE idCompania = ? AND idPaciente = ? ORDER BY nombre", [idCompania, idPaciente]);
      return (rows as any[]).map(r => ({ ...r, creadoEn: r.creadoEn instanceof Date ? r.creadoEn.toISOString() : String(r.creadoEn) }));
    }
    return localReceptoresFactura.filter(r => r.idCompania === idCompania && r.idPaciente === idPaciente);
  }

  /** Crea o actualiza (por número) un tercero del paciente. Devuelve el id. */
  async function guardarReceptorDePaciente(connection: any | null, idCompania: number, idPaciente: number, t: { tipoIdentificacion: string; numero: string; nombre: string; correo: string | null; telefono: string | null; codigoActividad: string | null }): Promise<number> {
    if (dbConnected && pool) {
      const db = connection || pool;
      const [result] = await db.query(
        `INSERT INTO paciente_receptores_factura (idCompania, idPaciente, tipoIdentificacion, numero, nombre, correo, telefono, codigoActividad, creadoEn)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), tipoIdentificacion = VALUES(tipoIdentificacion), nombre = VALUES(nombre), correo = VALUES(correo), telefono = VALUES(telefono), codigoActividad = VALUES(codigoActividad)`,
        [idCompania, idPaciente, t.tipoIdentificacion, t.numero, t.nombre, t.correo, t.telefono, t.codigoActividad, new Date()]
      );
      return (result as any).insertId;
    }
    const existente = localReceptoresFactura.find(r => r.idCompania === idCompania && r.idPaciente === idPaciente && r.numero === t.numero);
    if (existente) { Object.assign(existente, t); return existente.id; }
    const id = Math.max(0, ...localReceptoresFactura.map(r => r.id)) + 1;
    localReceptoresFactura.push({ id, idCompania, idPaciente, ...t, creadoEn: new Date().toISOString() });
    return id;
  }

  app.get("/api/pacientes/:id/receptores-factura", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      const paciente = await pacienteDeEmpresa(parseInt(req.params.id), idCompania);
      if (!paciente) return res.status(404).json({ error: "Paciente no encontrado." });
      res.json(await receptoresDePaciente(idCompania, paciente.id));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/pacientes/:id/receptores-factura", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      const paciente = await pacienteDeEmpresa(parseInt(req.params.id), idCompania);
      if (!paciente) return res.status(404).json({ error: "Paciente no encontrado." });
      const v = validarTercero(req.body, { paraGuardar: true });
      if ("error" in v) return res.status(400).json({ error: v.error });
      const id = await guardarReceptorDePaciente(null, idCompania, paciente.id, v.tercero);
      res.json((await receptoresDePaciente(idCompania, paciente.id)).find(r => r.id === id) ?? { id, ...v.tercero });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/pacientes/:id/receptores-factura/:idReceptor", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      const idPaciente = parseInt(req.params.id);
      const idReceptor = parseInt(req.params.idReceptor);
      if (dbConnected && pool) {
        const [r] = await pool.query("DELETE FROM paciente_receptores_factura WHERE id = ? AND idCompania = ? AND idPaciente = ?", [idReceptor, idCompania, idPaciente]);
        if ((r as any).affectedRows === 0) return res.status(404).json({ error: "Tercero no encontrado." });
      } else {
        const antes = localReceptoresFactura.length;
        localReceptoresFactura = localReceptoresFactura.filter(r => !(r.id === idReceptor && r.idCompania === idCompania && r.idPaciente === idPaciente));
        if (localReceptoresFactura.length === antes) return res.status(404).json({ error: "Tercero no encontrado." });
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Receptor del comprobante: el paciente (por omisión) o un tercero (nuevo o guardado). El paciente
   * sigue ligado al comprobante (idPaciente) por el expediente clínico; el receptor se copia.
   */
  async function resolverReceptor(entrada: any, paciente: Patient, idCompania: number): Promise<{ error: string } | { snapshot: ReceptorSnapshot; guardarTercero: TerceroParaGuardar | null }> {
    if (!entrada || entrada.modo !== "TERCERO") return { snapshot: receptorDesdePaciente(paciente), guardarTercero: null };
    let datos: any = entrada;
    if (entrada.idReceptorGuardado != null && String(entrada.idReceptorGuardado) !== "") {
      const guardado = (await receptoresDePaciente(idCompania, paciente.id)).find(r => r.id === parseInt(entrada.idReceptorGuardado));
      if (!guardado) return { error: "El tercero guardado no existe para este paciente." };
      datos = guardado;
    }
    // Un tercero que se va a guardar (nuevo) necesita número aunque sea extranjero: se distinguen por él.
    const v = validarTercero(datos, { paraGuardar: entrada.guardar === true && entrada.idReceptorGuardado == null });
    if ("error" in v) return { error: v.error };
    const t = v.tercero;
    return {
      snapshot: { tipoIdentificacion: t.tipoIdentificacion, identificacion: t.numero || null, nombre: t.nombre, correo: t.correo, codigoActividad: t.codigoActividad, esTercero: true },
      guardarTercero: entrada.guardar === true && entrada.idReceptorGuardado == null ? t : null
    };
  }
  type TerceroParaGuardar = { tipoIdentificacion: string; numero: string; nombre: string; correo: string | null; telefono: string | null; codigoActividad: string | null };

  app.post("/api/facturas", requireAuth, unaOperacionALaVez(candadoPorConsulta, async (req, res) => {
    try {
      const body = req.body || {};
      const idCompania = sessionOf(req).idCompania;
      const idCita = body.idCita != null ? parseInt(body.idCita) : null;
      const idConsulta = body.idConsulta != null ? parseInt(body.idConsulta) : null;
      const idPaciente = parseInt(body.idPaciente);
      const condicionVenta = String(body.condicionVenta || "01");
      const montoRecibidoBody = body.montoRecibido != null && String(body.montoRecibido).trim() !== '' ? parseFloat(body.montoRecibido) : null;
      const modoPrueba = body.modoPrueba === true;
      const lineasBody: Array<{ idServicio: number; cantidad: number; descuento?: number }> = Array.isArray(body.lineas) ? body.lineas : [];

      if (lineasBody.length === 0) {
        return res.status(400).json({ error: "Agregue al menos un servicio a facturar." });
      }
      const [p, catalogo] = await Promise.all([parametrosFacturacion(), catalogosHacienda()]);
      if (!codigoEnCatalogo(catalogo, "CONDICION_VENTA", condicionVenta)) {
        return res.status(400).json({ error: "Condición de venta inválida: no está en el catálogo de Hacienda." });
      }

      // La consulta y la cita deben ser de esta empresa (antes se aceptaba cualquier id del body).
      if (dbConnected && pool) {
        if (idConsulta != null) {
          const [c] = await pool.query("SELECT id_consulta FROM consultas WHERE id_consulta = ? AND idCompania = ?", [idConsulta, idCompania]);
          if ((c as any[]).length === 0) return res.status(404).json({ error: "Consulta no encontrada." });
        }
        if (idCita != null) {
          const [c] = await pool.query("SELECT id FROM citas WHERE id = ? AND idCompania = ?", [idCita, idCompania]);
          if ((c as any[]).length === 0) return res.status(404).json({ error: "Cita no encontrada." });
        }
      }

      // `facturas.id_consulta` es una columna heredada con un UNIQUE KEY (uq_facturas_consulta):
      // impide facturar dos veces la misma consulta. Chequeo aquí para un mensaje claro; el UNIQUE
      // queda como red de seguridad ante una carrera (capturado más abajo como ER_DUP_ENTRY).
      if (idConsulta != null) {
        if (dbConnected && pool) {
          const [yaFacturada] = await pool.query("SELECT id_factura FROM facturas WHERE id_consulta = ?", [idConsulta]);
          if ((yaFacturada as any[]).length > 0) {
            return res.status(409).json({ error: "Esta consulta ya fue facturada." });
          }
        } else if (localFacturas.some(f => f.idConsulta === idConsulta)) {
          return res.status(409).json({ error: "Esta consulta ya fue facturada." });
        }
      }

      const company = await fetchCompanyById(idCompania);
      // El paciente SIEMPRE de la empresa de la sesión (antes se cargaba por id sin acotar).
      const paciente = await pacienteDeEmpresa(idPaciente, idCompania);
      let serviciosDisponibles: Servicio[];
      if (dbConnected && pool) {
        const [servicioRows] = await pool.query("SELECT * FROM servicios WHERE idCompania = ?", [idCompania]);
        serviciosDisponibles = (servicioRows as any[]).map(row => normalizeRow(row, 'id_servicio'));
      } else {
        serviciosDisponibles = localServicios.filter(s => s.idCompania === idCompania);
      }

      if (!company) return res.status(404).json({ error: "Empresa no encontrada." });
      if (!paciente) return res.status(404).json({ error: "Paciente no encontrado." });

      // Receptor y tipo de comprobante: lo decide el servidor (Factura 01 con receptor identificado;
      // si no, Tiquete 04 sin <Receptor>). Nunca se confía en lo que diga el navegador.
      const receptorResuelto = await resolverReceptor(body.receptor, paciente, idCompania);
      if ("error" in receptorResuelto) return res.status(400).json({ error: receptorResuelto.error });
      const receptor = receptorResuelto.snapshot;
      const errLargo = errorLongitudReceptor(receptor);
      if (errLargo) return res.status(400).json({ error: errLargo });
      const decision = decidirTipoComprobante(receptor, condicionVenta, p.condicionesExigenReceptor);
      if (decision.error) return res.status(400).json({ error: decision.error });
      const tipoDocumento = decision.tipoDocumento;
      const nombreComprobante = tipoDocumento === "04" ? "Tiquete" : "Factura";
      const correoCopiaPaciente = receptor.esTercero && body.copiaPaciente === true;

      // Plazo de crédito: el elegido en la factura o, si no viene, el de la empresa (Personalizar › Parámetros contables).
      const plazoCredito = condicionVenta === "02" ? Number(body.plazoCreditoDias ?? company.plazoCreditoClientesDias) : null;
      if (condicionVenta === "02" && !(Number.isInteger(plazoCredito) && (plazoCredito as number) > 0)) {
        return res.status(400).json({ error: "Indique un plazo de crédito en días (número entero mayor que cero)." });
      }
      if (!company.provincia || !company.canton || !company.distrito || !company.otrasSenas) {
        return res.status(400).json({ error: "Configure la ubicación fiscal de la empresa (provincia/cantón/distrito/señas) en Configuración de Empresa antes de facturar." });
      }

      const cert = await cargarCertificadoEmpresa(idCompania);
      const credenciales = await cargarCredencialesAtv(idCompania);

      // El modo prueba (por factura, o por ambiente de empresa PRUEBAS_LOCAL) nunca firma ni
      // envía nada a Hacienda — así que tampoco exige certificado ni credenciales ATV.
      const omitirEnvioHacienda = modoPrueba || credenciales?.ambiente === "PRUEBAS_LOCAL";

      // La empresa de plataforma puede tener datos de demostración, pero nunca emite ante Hacienda
      // (un comprobante de prueba que no sale del servidor sí se permite).
      if (!omitirEnvioHacienda && esCompaniaPlataforma(idCompania)) {
        return res.status(403).json({ error: MENSAJE_PLATAFORMA_SIN_COMPROBANTES });
      }

      // Validaciones previas a la transmisión, ANTES de reservar un consecutivo.
      if (!omitirEnvioHacienda) {
        const { certificadoVenceEn } = await estadoConfigEmision(idCompania);
        const problemas = [
          ...problemasEmisor(company),
          ...problemasTransmision({ tieneCertificado: !!cert, certificadoVenceEn, tieneCredencialesAtv: !!credenciales }, fechaCR())
        ];
        if (problemas.length > 0) return res.status(400).json({ error: problemas.join(" "), problemas });
      }

      // Líneas: servicio de la empresa, CABYS, cantidad, existencias, descuento y <Detalle>.
      const codigoDescuento = String(body.codigoDescuento || p.codigoDescuentoDefecto);
      const naturalezaDescuento = body.naturalezaDescuento ? recortarDetalle(String(body.naturalezaDescuento), 80) : null;
      const lineasInput: Array<LineaFacturaInput & { idServicio: number; tipo: string }> = [];
      for (const l of lineasBody) {
        const servicio = serviciosDisponibles.find(s => s.id === parseInt(l.idServicio as any));
        if (!servicio) return res.status(400).json({ error: `Servicio ${l.idServicio} no encontrado.` });
        if (!servicio.codigoCabys) return res.status(400).json({ error: `El servicio "${servicio.nombre}" no tiene un código CABYS configurado — asígnelo en Configuración de Empresa antes de facturar.` });
        const cantidad = parseFloat((l.cantidad as any) || 1);
        if (!Number.isFinite(cantidad) || cantidad <= 0) return res.status(400).json({ error: `La cantidad de "${servicio.nombre}" debe ser mayor a 0.` });
        if (servicio.tipo === 'ARTICULO' && (servicio.stock || 0) < cantidad) {
          return res.status(400).json({ error: `Existencias insuficientes de "${servicio.nombre}" (disponible: ${servicio.stock || 0}, solicitado: ${cantidad}).` });
        }
        const descuento = l.descuento != null && String(l.descuento).trim() !== "" ? Number(l.descuento) : 0;
        const bruto = cantidad * Number(servicio.precio);
        if (!Number.isFinite(descuento) || descuento < 0) return res.status(400).json({ error: `El descuento de "${servicio.nombre}" no es válido.` });
        if (descuento > bruto + 1e-6) return res.status(400).json({ error: `El descuento de "${servicio.nombre}" no puede superar el monto de la línea (₡${bruto.toFixed(2)}).` });
        const detalle = recortarDetalle(servicio.nombre, p.detalleMax);
        const errDetalle = errorDetalle(detalle, p.detalleMin, p.detalleMax);
        if (errDetalle) return res.status(400).json({ error: `${errDetalle} Cambie el nombre del servicio en Configuración de Empresa.` });
        lineasInput.push({
          codigoCabys: servicio.codigoCabys,
          detalle,
          unidadMedida: servicio.unidadMedida || (servicio.tipo === 'ARTICULO' ? p.unidadMercancia : p.unidadServicio),
          cantidad,
          precioUnitario: servicio.precio,
          porcentajeIva: servicio.porcentajeIva != null ? servicio.porcentajeIva : company.ivaPorDefecto,
          montoDescuento: descuento > 0 ? descuento : 0,
          codigoDescuento: descuento > 0 ? codigoDescuento : null,
          naturalezaDescuento: descuento > 0 ? naturalezaDescuento : null,
          idServicio: servicio.id,
          tipo: servicio.tipo || 'SERVICIO'
        });
      }
      if (lineasInput.some(l => (l.montoDescuento || 0) > 0)) {
        if (!codigoEnCatalogo(catalogo, "CODIGO_DESCUENTO", codigoDescuento)) return res.status(400).json({ error: "Código de descuento inválido: no está en el catálogo de Hacienda." });
        if (codigoDescuento === "99" && !naturalezaDescuento) return res.status(400).json({ error: "Con el código de descuento «Otros» indique la naturaleza del descuento." });
      }

      const lineasCalculadas = calcularLineas(lineasInput).map((l, i) => ({ ...l, idServicio: lineasInput[i].idServicio, tipo: lineasInput[i].tipo }));
      const resumen = calcularResumen(lineasCalculadas);
      if (resumen.totalComprobante <= 0) return res.status(400).json({ error: "El total del comprobante debe ser mayor que cero." });

      // Medios de pago: varios (efectivo + tarjeta + SINPE…), su suma debe ser el total. Se omiten a crédito.
      let mediosPago: MedioPagoComprobante[] = [];
      if (condicionVenta !== "02") {
        const pedidos: MedioPagoComprobante[] = Array.isArray(body.mediosPago) && body.mediosPago.length > 0
          ? body.mediosPago.map((m: any) => ({ tipo: String(m?.tipo ?? ""), monto: Number(m?.monto), otros: m?.otros ? String(m.otros).slice(0, 100) : null }))
          : [{ tipo: String(body.medioPago || "01"), monto: resumen.totalComprobante }];
        const errMedios = validarMediosPago(pedidos, resumen.totalComprobante, { codigosValidos: codigosDe(catalogo, "MEDIO_PAGO"), tolerancia: p.toleranciaMedioPago, maximo: p.mediosPagoMax });
        if (errMedios) return res.status(400).json({ error: errMedios });
        mediosPago = cuadrarMediosPago(pedidos, resumen.totalComprobante);
      }
      // El vuelto solo tiene sentido si parte se pagó en efectivo.
      const montoRecibido = mediosPago.some(m => m.tipo === "01") ? montoRecibidoBody : null;

      const ambiente = credenciales?.ambiente ?? "PRUEBAS_LOCAL";
      const mensajeSimulada = modoPrueba && credenciales?.ambiente !== "PRUEBAS_LOCAL"
        ? "Modo prueba activado para este comprobante — no se envió a Hacienda."
        : "Ambiente de pruebas locales — no se envió a Hacienda.";
      // El intento sincrónico "reclama" la fila desde el INSERT: la cola no la toma mientras tanto.
      const procesandoHasta = omitirEnvioHacienda ? null : nuevaLease(p.cola.bloqueoSeg);

      // Numerar, firmar UNA vez y guardar, todo en la misma transacción: reserva de consecutivo (FOR
      // UPDATE), existencias, XML firmado, comprobante PENDIENTE, líneas y CxC. Si algo local falla
      // se revierte todo (incluido el consecutivo) y nada salió todavía hacia Hacienda.
      const armarYGuardar = async (connection: any | null): Promise<number> => {
        const consecutivo = await reservarConsecutivo(connection, idCompania, tipoDocumento);
        for (const l of lineasCalculadas) {
          if (l.tipo !== 'ARTICULO' || !l.idServicio) continue;
          if (connection) {
            const [servicioRows] = await connection.query("SELECT stock FROM servicios WHERE id_servicio = ? AND idCompania = ? FOR UPDATE", [l.idServicio, idCompania]);
            const stockActual = (servicioRows as any[])[0]?.stock || 0;
            if (stockActual < l.cantidad) {
              throw Object.assign(new Error(`Existencias insuficientes de "${l.detalle}" (disponible: ${stockActual}, solicitado: ${l.cantidad}).`), { status: 409 });
            }
            const stockResultante = stockActual - l.cantidad;
            await connection.query("UPDATE servicios SET stock = ? WHERE id_servicio = ?", [stockResultante, l.idServicio]);
            await connection.query(
              "INSERT INTO movimientos_inventario (idCompania, idServicio, tipo, cantidad, stockResultante, referencia, notas, creadoPor, creadoEn) VALUES (?, ?, 'VENTA', ?, ?, ?, ?, ?, ?)",
              [idCompania, l.idServicio, -l.cantidad, stockResultante, `${nombreComprobante} ${consecutivo}`, null, null, new Date().toISOString()]
            );
          } else {
            // Igual que en la BD: sin esto el modo memoria nunca descontaba existencias al facturar.
            const servicio = localServicios.find(s => s.id === l.idServicio);
            if (servicio) servicio.stock = (servicio.stock || 0) - l.cantidad;
          }
        }

        const fechaEmision = new Date();
        const clave = generarClaveNumerica(company.identificacion, consecutivo, fechaEmision);
        const xml = construirXmlComprobante(tipoDocumento, {
          clave, consecutivo, fechaEmision, emisor: emisorDe(company), receptor: receptorParaXml(receptor),
          condicionVenta, mediosPago, plazoCredito, lineas: lineasCalculadas, resumen, detalleMax: p.detalleMax
        });
        let xmlFirmado: string | null = null;
        if (!omitirEnvioHacienda) {
          try {
            xmlFirmado = await firmarComprobante(xml, cert!, p);
          } catch (err: any) {
            throw Object.assign(new Error(`No se pudo firmar el comprobante: ${err.message}`), { status: 400 });
          }
        }
        const fechaEmisionTexto = fechaEmisionCR(fechaEmision);
        const id = await insertarDocumento(connection, {
          idCompania, idCita, idConsulta, idPaciente, tipoDocumento, clave, consecutivo, fechaEmision: fechaEmisionTexto, ambiente,
          lineas: lineasCalculadas, resumen, estado: omitirEnvioHacienda ? "SIMULADA" : "PENDIENTE", mensajeError: omitirEnvioHacienda ? mensajeSimulada : null,
          condicionVenta, plazoCredito, mediosPago, montoRecibido, idFacturaReferencia: null, motivoAnulacion: null, xmlFirmado,
          receptor, correoCopiaPaciente, notaEfecto: null, procesandoHasta
        });

        // CXC automática: toda venta a crédito genera una cuenta por cobrar por el total —
        // independiente de lo que resuelva Hacienda: la obligación de pago es un hecho de negocio.
        if (condicionVenta === "02") {
          const fechaEmisionSolo = fechaEmisionTexto.split("T")[0];
          const fechaVencimiento = sumarDiasCR(fechaEmisionSolo, plazoCredito as number);
          if (connection) {
            await connection.query(
              "INSERT INTO cuentas_cobrar (idCompania, idFactura, facturaConsecutivo, idPaciente, fechaEmision, fechaVencimiento, plazoDias, montoTotal, saldoPendiente, estado, creadaEn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)",
              [idCompania, id, consecutivo, idPaciente, fechaEmisionSolo, fechaVencimiento, plazoCredito, resumen.totalComprobante, resumen.totalComprobante, new Date().toISOString()]
            );
          } else {
            localCuentasCobrar.push({
              id: Math.max(0, ...localCuentasCobrar.map(c => c.id), 0) + 1,
              idCompania, idFactura: id, facturaConsecutivo: consecutivo, idPaciente,
              fechaEmision: fechaEmisionSolo, fechaVencimiento, plazoDias: plazoCredito as number,
              montoTotal: resumen.totalComprobante, saldoPendiente: resumen.totalComprobante,
              estado: "PENDIENTE", creadaEn: new Date().toISOString()
            });
          }
        }
        if (receptorResuelto.guardarTercero) await guardarReceptorDePaciente(connection, idCompania, idPaciente, receptorResuelto.guardarTercero);
        return id;
      };

      let id: number;
      if (dbConnected && pool) {
        try {
          id = await enTransaccion(armarYGuardar);
        } catch (err: any) {
          // Red de seguridad ante una carrera entre dos solicitudes para la misma consulta.
          if (err.code === "ER_DUP_ENTRY" && idConsulta != null) {
            return res.status(409).json({ error: "Esta consulta ya fue facturada." });
          }
          if (err.status) return res.status(err.status).json({ error: err.message });
          throw err;
        }
      } else {
        try {
          id = await armarYGuardar(null);
        } catch (err: any) {
          if (err.status) return res.status(err.status).json({ error: err.message });
          throw err;
        }
      }

      if (omitirEnvioHacienda) {
        const doc = await cargarFacturaPorId(id);
        return res.json(documentoParaCliente(doc, await lineasDeFactura(doc)));
      }
      // Ya está guardado (PENDIENTE, con su XML firmado): un intento de transmisión ahora mismo. Si
      // no se resuelve, la cola lo sigue en segundo plano.
      res.json(await transmitirYRecargar(id, procesandoHasta as Date));
    } catch (err: any) {
      console.error("[Hacienda] Error generando comprobante:", err?.message || err);
      if (err instanceof ParametroFaltanteError) return res.status(503).json({ error: err.message });
      res.status(500).json({ error: err.message });
    }
  }));

  async function cargarFacturaPorId(id: number): Promise<any | undefined> {
    if (!Number.isInteger(id)) return undefined;
    if (dbConnected && pool) {
      const [rows] = await pool.query("SELECT * FROM facturas WHERE id_factura = ?", [id]);
      return (rows as any[]).map(row => normalizeRow(row, 'id_factura'))[0];
    }
    return localFacturas.find(f => f.id === id);
  }

  async function lineasDeFactura(factura: any): Promise<any[]> {
    if (!factura) return [];
    if (dbConnected && pool) return (await fetchLineasPorFactura([factura.id])).get(factura.id) || [];
    return typeof factura.lineas === "string" ? JSON.parse(factura.lineas) : (factura.lineas || []);
  }

  // Empresa y paciente de un comprobante: el paciente SIEMPRE acotado a la empresa (antes se
  // cargaba por id sin acotar).
  async function cargarEmpresaYPaciente(idCompania: number, idPaciente: number): Promise<{ company?: Company; paciente?: Patient }> {
    return { company: await fetchCompanyById(idCompania), paciente: await pacienteDeEmpresa(idPaciente, idCompania) };
  }

  // Cuánto se acreditó ya de cada servicio en Notas de Crédito previas sobre esta factura. Las que
  // Hacienda nunca recibió (ERROR) o rechazó no acreditaron nada, así que no cuentan; las que están
  // en cola (PENDIENTE) sí, por prudencia (mientras tanto se bloquean otras notas, ver notaEnEnvioIncierto).
  // `db`: conexión de una transacción en curso (lecturas dentro del mismo bloqueo).
  async function cantidadesAcreditadas(idFactura: number, db?: any): Promise<Map<number, number>> {
    let notas: any[];
    if (dbConnected && pool) {
      const [rows] = await (db || pool).query("SELECT * FROM facturas WHERE idFacturaReferencia = ? AND tipoDocumento = '03' AND estado NOT IN ('ERROR', 'RECHAZADA')", [idFactura]);
      notas = (rows as any[]).map(row => normalizeRow(row, 'id_factura'));
    } else {
      notas = localFacturas.filter(f => f.idFacturaReferencia === idFactura && f.tipoDocumento === "03" && f.estado !== "ERROR" && f.estado !== "RECHAZADA");
    }
    const lineas = dbConnected && pool
      ? Array.from((await fetchLineasPorFactura(notas.map(n => n.id))).values()).flat()
      : notas.flatMap(n => (typeof n.lineas === "string" ? JSON.parse(n.lineas) : n.lineas));
    const acreditado = new Map<number, number>();
    for (const l of lineas) {
      if (l.idServicio == null) continue;
      acreditado.set(l.idServicio, (acreditado.get(l.idServicio) || 0) + Number(l.cantidad));
    }
    return acreditado;
  }

  // Notas (de Crédito o Débito) que referencian una factura.
  async function notasDeFactura(idFactura: number, db?: any): Promise<any[]> {
    if (dbConnected && pool) {
      const [rows] = await (db || pool).query("SELECT id_factura, consecutivo, tipoDocumento, estado, mensajeError, nota_efecto, efectos_aplicados FROM facturas WHERE idFacturaReferencia = ?", [idFactura]);
      return (rows as any[]).map(row => normalizeRow(row, 'id_factura'));
    }
    return localFacturas.filter(f => f.idFacturaReferencia === idFactura);
  }

  /** Nota que Hacienda recibió pero cuyos efectos locales todavía no se aplicaron. */
  const notaConEfectosPendientes = (n: any) => (n.estado === "ENVIADA" || n.estado === "ACEPTADA")
    && !!leerCampo(n, "nota_efecto", "notaEfecto") && !Number(leerCampo(n, "efectos_aplicados", "efectosAplicados") ?? 1);

  // Una Nota en cola (PENDIENTE) o con envío incierto puede terminar recibida por Hacienda: mientras
  // tanto no se emite otra ni se anula la factura.
  function notaEnEnvioIncierto(notas: any[]): any | undefined {
    return notas.find(n => n.estado === "PENDIENTE" || (n.estado === "ERROR" && String(n.mensajeError || "").startsWith(MARCA_ENVIO_INCIERTO)) || notaConEfectosPendientes(n));
  }

  function mensajeEnvioIncierto(nota: any): string {
    if (notaConEfectosPendientes(nota)) {
      return `La nota ${nota.consecutivo} de esta factura ya fue recibida por Hacienda y sus efectos (inventario, cuenta por cobrar) se están aplicando. Espere unos minutos antes de emitir otra nota o anular.`;
    }
    return nota.estado === "PENDIENTE"
      ? `La nota ${nota.consecutivo} de esta factura todavía está en cola de envío a Hacienda: espere a que se resuelva (o use «Consultar estado») antes de emitir otra nota o anular.`
      : `La nota ${nota.consecutivo} de esta factura tiene un envío incierto: use «Consultar estado» sobre ella antes de emitir otra nota o anular. Si Hacienda sí la recibió, emitir otra la duplicaría.`;
  }

  // Cert + credenciales reales para transmitir una Nota. Se valida ANTES de reservar el consecutivo
  // para no quemar numeración por un problema de configuración. La Nota va al mismo ambiente en que
  // se emitió la factura: una clave de SANDBOX no existe en PRODUCCIÓN, y Hacienda rechazaría la
  // Nota para siempre.
  async function exigirConfigHacienda(idCompania: number, ambienteFactura: string, company?: Company): Promise<{ cert: CertificadoEmpresa; credenciales: CredencialesAtv }> {
    const credenciales = await cargarCredencialesAtv(idCompania);
    const cert = await cargarCertificadoEmpresa(idCompania);
    const { certificadoVenceEn } = await estadoConfigEmision(idCompania);
    const problemas = [
      ...(company ? problemasEmisor(company) : []),
      ...problemasTransmision({ tieneCertificado: !!cert, certificadoVenceEn, tieneCredencialesAtv: !!credenciales }, fechaCR())
    ];
    if (problemas.length > 0) throw Object.assign(new Error(problemas.join(" ")), { status: 400 });
    if (credenciales!.ambiente === "PRUEBAS_LOCAL") {
      throw Object.assign(new Error("La empresa está en ambiente de pruebas locales: no se puede transmitir una Nota sobre un comprobante que Hacienda aceptó."), { status: 400 });
    }
    if (credenciales!.ambiente !== ambienteFactura) {
      throw Object.assign(new Error(`El comprobante se emitió en ${ambienteFactura} y la empresa está configurada en ${credenciales!.ambiente}: cualquier Nota sobre él tiene que ir al ambiente original.`), { status: 409 });
    }
    return { cert: cert!, credenciales: credenciales! };
  }

  // Efectos locales de anular: reponer existencias, anular la CxC pendiente, marcar la factura y
  // soltar su consulta para que se pueda volver a facturar bien (id_consulta es UNIQUE: mientras la
  // factura anulada la conservara, esa consulta quedaba imposible de facturar de nuevo).
  //
  // El cambio a ANULADA es condicional (`estado <> 'ANULADA'`) y va primero: si otra anulación de la
  // misma factura ya entró, esta no repone existencias por segunda vez.
  async function aplicarAnulacion(connection: any | null, factura: any, lineasARestituir: any[], motivo: string): Promise<void> {
    const yaAnulada = () => Object.assign(new Error("Esta factura ya fue anulada."), { status: 409 });
    if (connection) {
      const [resultado] = await connection.query(
        "UPDATE facturas SET estado = 'ANULADA', motivoAnulacion = ?, id_consulta = NULL WHERE id_factura = ? AND estado <> 'ANULADA'",
        [motivo, factura.id]
      );
      if ((resultado as any).affectedRows === 0) throw yaAnulada();
      // Si ya estaba PAGADA se deja intacta: el cobro ya ocurrió, es un hecho histórico.
      await connection.query("UPDATE cuentas_cobrar SET estado = 'ANULADA' WHERE idFactura = ? AND estado = 'PENDIENTE'", [factura.id]);
    } else {
      const original = localFacturas.find(f => f.id === factura.id);
      if (original?.estado === "ANULADA") throw yaAnulada();
      if (original) {
        original.estado = "ANULADA";
        original.motivoAnulacion = motivo;
        original.idConsulta = null;
      }
      const cxc = localCuentasCobrar.find(c => c.idFactura === factura.id && c.estado === "PENDIENTE");
      if (cxc) cxc.estado = "ANULADA";
    }
    await moverStockPorNota(connection, factura.idCompania, lineasARestituir, 1, `Anulación ${factura.tipoDocumento === "04" ? "tiquete" : "factura"} ${factura.consecutivo}`, motivo);
  }

  // Una pestaña abierta antes de quitar la casilla "Modo prueba" de las Notas todavía la muestra; si
  // se ignorara en silencio, quien la marcó transmitiría una Nota real creyendo que era de prueba.
  const MENSAJE_SIN_MODO_PRUEBA = "Las Notas de Crédito y Débito ya no tienen modo prueba: siempre se transmiten a Hacienda. Recargue la página e intente de nuevo.";

  const AVISO_EFECTOS_NO_APLICADOS ="Hacienda sí recibió esta nota, pero al emitirla se dio por fallida y su efecto en inventario y cuenta por cobrar no se aplicó: ajústelo a mano.";

  const esTipoNota = (tipo: any) => tipo === "02" || tipo === "03";

  // Qué estado y mensaje le corresponden a un comprobante según lo que Hacienda respondió al
  // consultarlo. Lo comparten POST /api/facturas/:id/estado y /anular (que consulta antes de anular
  // una factura en ERROR), para que los dos lleguen siempre a la misma conclusión.
  function estadoTrasConsulta(factura: any, consulta: EstadoHaciendaResultado): { estado: string; mensajeError: string | null } {
    let estado: string = factura.estado;
    let mensajeError: string | null = factura.mensajeError ?? null;
    const sinResolver = factura.estado === "ERROR" || factura.estado === "PENDIENTE";
    // Notas del modelo nuevo (con nota_efecto): sus efectos los aplica aplicarEfectosNota al quedar
    // recibidas, así que el aviso de "ajústelo a mano" solo aplica a las anteriores.
    const notaDeModeloViejo = esTipoNota(factura.tipoDocumento) && !leerCampo(factura, "nota_efecto", "notaEfecto");
    if (consulta.estado === "aceptado") {
      estado = "ACEPTADA";
      mensajeError = null;
    } else if (consulta.estado === "rechazado") {
      estado = "RECHAZADA";
      mensajeError = consulta.detalleMensaje || "Hacienda rechazó el comprobante.";
    } else if ((consulta.estado === "recibido" || consulta.estado === "procesando") && sinResolver) {
      // Sí le llegó, aunque el envío se reportó como fallido (o seguía en cola).
      estado = "ENVIADA";
      mensajeError = null;
    } else if (consulta.estado === "no_encontrado" && factura.estado === "PENDIENTE") {
      mensajeError = "Todavía no ha llegado a Hacienda: sigue en cola de envío y se transmitirá automáticamente.";
    } else if (consulta.estado === "no_encontrado" && factura.estado === "ERROR") {
      mensajeError = !esTipoNota(factura.tipoDocumento)
        ? "Hacienda no tiene registro de este comprobante: nunca le llegó. Anúlelo (no requiere Nota de Crédito) y vuelva a facturar, o use «Reintentar envío»."
        : "Hacienda no tiene registro de esta nota: nunca le llegó, y por eso no se aplicó. Vuelva a emitirla o use «Reintentar envío».";
    }
    // Una Nota vieja que se dio por fallida al emitirla nunca aplicó sus efectos. Si Hacienda sí la
    // tiene, se avisa — y el aviso se conserva en las consultas siguientes.
    if (notaDeModeloViejo && (estado === "ACEPTADA" || estado === "ENVIADA")
        && (factura.estado === "ERROR" || factura.mensajeError === AVISO_EFECTOS_NO_APLICADOS)) {
      mensajeError = AVISO_EFECTOS_NO_APLICADOS;
    }
    // El saldo a favor anotado al emitir una Nota de Crédito sigue siendo cierto cuando Hacienda la acepta.
    if (estado === "ACEPTADA" && mensajeError === null && String(factura.mensajeError || "").startsWith(MARCA_SALDO_A_FAVOR)) {
      mensajeError = factura.mensajeError;
    }
    // Una Nota ENVIADA ya aplicó sus efectos. Si Hacienda la rechaza después, esos efectos quedaron
    // sin comprobante que los respalde: se avisa.
    if (esTipoNota(factura.tipoDocumento) && factura.estado === "ENVIADA" && estado === "RECHAZADA" && Number(leerCampo(factura, "efectos_aplicados", "efectosAplicados") ?? 1)) {
      mensajeError = `${mensajeError} — Al emitirla ya se habían aplicado sus efectos (inventario, cuenta por cobrar${factura.tipoDocumento === "03" ? " y, si era de anulación, la anulación de la factura" : ""}): reviértalos a mano.`;
    }
    // ANULADA se conserva: la anulación ya ocurrió y Hacienda solo informa del comprobante original.
    if (factura.estado === "ANULADA") {
      estado = "ANULADA";
      mensajeError = factura.mensajeError ?? null;
    }
    return { estado, mensajeError };
  }

  /**
   * Guarda lo que se supo al consultar a Hacienda fuera de la cola («Consultar estado», anular).
   * Quien llama debe tener el reclamo (`lease`, ver reclamarDocumento): la escritura solo se aplica
   * si lo sigue teniendo, así nunca pisa lo que la cola escribió en paralelo. Libera el reclamo.
   */
  async function guardarEstadoConsultado(id: number, estado: string, mensajeError: string | null, respuestaXmlBase64: string | null, estadoHacienda: EstadoHaciendaResultado["estado"] | undefined, lease: Date, liberar = true): Promise<boolean> {
    // Si Hacienda lo tiene, la cola solo debe consultarlo; si confirmó que no lo tiene, se puede reenviar.
    const postRealizado = estadoHacienda === "no_encontrado" ? false
      : estadoHacienda && estadoHacienda !== "error" ? true : undefined;
    return guardarCambiosEnvio(id, { estado, mensajeError, respuestaHacienda: respuestaXmlBase64, postRealizado, liberar, ...(estado === "ACEPTADA" || estado === "RECHAZADA" ? { proximoIntento: null } : {}) }, lease);
  }

  const MENSAJE_EN_PROCESO = "El sistema está transmitiendo o consultando este comprobante en este momento. Intente de nuevo en unos segundos.";

  // Anula una Factura o Tiquete Electrónico. Son tres efectos independientes (mismo criterio que el
  // POS): reponer existencias y anular la CxC pendiente siempre, y emitir la Nota de Crédito
  // (código '01') SOLO si Hacienda ACEPTÓ el comprobante. Una NC sobre algo que Hacienda nunca
  // aceptó (SIMULADA, RECHAZADA, ERROR) la haría rechazar también.
  app.post("/api/facturas/:id/anular", requireAuth, unaOperacionALaVez(candadoPorFactura, async (req, res) => {
    let leaseAnulacion: Date | null = null;
    try {
      const id = parseInt(req.params.id);
      const session = sessionOf(req);
      // El POS exige autorización de administrador para anular: es irreversible ante Hacienda.
      if (session.rol !== "Administrador" && !isSaasAdmin(session)) {
        return res.status(403).json({ error: "Solo un usuario Administrador puede anular facturas." });
      }
      const motivo = String(req.body.motivo || "").trim().slice(0, RAZON_MAX);
      if (!motivo) {
        return res.status(400).json({ error: "Indique el motivo de la anulación." });
      }

      const factura = await cargarFacturaPorId(id);
      if (!factura) return res.status(404).json({ error: "Factura no encontrada." });
      if (!canAccessCompany(session, factura.idCompania)) {
        return res.status(403).json({ error: "No autorizado." });
      }
      // Anular emite una Nota de Crédito ante Hacienda: la empresa de plataforma no emite comprobantes.
      if (esCompaniaPlataforma(factura.idCompania)) {
        return res.status(403).json({ error: MENSAJE_PLATAFORMA_SIN_COMPROBANTES });
      }
      if (factura.tipoDocumento && factura.tipoDocumento !== "01" && factura.tipoDocumento !== "04") {
        return res.status(400).json({ error: "Solo se pueden anular Facturas y Tiquetes Electrónicos (no Notas de Crédito/Débito)." });
      }
      if (factura.estado === "ANULADA") {
        return res.status(400).json({ error: "Esta factura ya fue anulada." });
      }
      // ENVIADA/PENDIENTE: Hacienda lo está procesando o está en cola de envío. Anularlo sin NC
      // dejaría viva ante Hacienda una factura que luego acepte; emitir NC sobre algo no aceptado
      // la haría rechazar.
      if (factura.estado === "ENVIADA" || factura.estado === "PENDIENTE") {
        return res.status(409).json({ error: factura.estado === "PENDIENTE"
          ? "Este comprobante está en cola de envío a Hacienda. Espere a que se resuelva (o use «Consultar estado») y anúlelo cuando quede aceptado o rechazado."
          : "Hacienda todavía está procesando esta factura. Use «Consultar estado» y anúlela cuando quede aceptada o rechazada." });
      }

      const idCompania = factura.idCompania;
      const credenciales = await cargarCredencialesAtv(idCompania);
      const ambienteActual = credenciales?.ambiente ?? "PRUEBAS_LOCAL";

      // Ambiente: las claves de SANDBOX y de PRODUCCIÓN viven en sistemas distintos de Hacienda.
      const esPruebaDeSandbox = factura.ambiente === "SANDBOX" && ambienteActual !== "SANDBOX";
      if (factura.ambiente === "PRODUCCION" && ambienteActual !== "PRODUCCION" && (factura.estado === "ACEPTADA" || factura.estado === "ERROR")) {
        return res.status(409).json({ error: `Esta factura se emitió en PRODUCCIÓN y la empresa está configurada en ${ambienteActual}. Vuelva a configurar el ambiente de Producción para anularla ante Hacienda.` });
      }

      const notas = await notasDeFactura(factura.id);
      const incierta = notaEnEnvioIncierto(notas);
      if (incierta) return res.status(409).json({ error: mensajeEnvioIncierto(incierta) });
      // Una Nota de Débito vigente es otro comprobante ante Hacienda: anular la factura no la anula,
      // pero sí anularía la cuenta por cobrar que incluye su monto.
      const debitosVigentes = notas.filter(n => n.tipoDocumento === "02" && (n.estado === "ACEPTADA" || n.estado === "ENVIADA"));
      if (debitosVigentes.length > 0 && !esPruebaDeSandbox) {
        return res.status(409).json({ error: `Esta factura tiene Notas de Débito vigentes ante Hacienda (${debitosVigentes.map(n => n.consecutivo).join(", ")}). Anularla las dejaría válidas mientras el sistema anula la cuenta por cobrar, y el sistema todavía no emite Notas de Crédito sobre Notas de Débito. Corrija la factura con Notas de Crédito parciales.` });
      }

      // ERROR puede ser "nunca le llegó a Hacienda" o "sí le llegó y se cortó la respuesta". Antes de
      // anularla sin Nota de Crédito se le pregunta.
      if (factura.estado === "ERROR" && credenciales && credenciales.ambiente === factura.ambiente) {
        // Se reclama el comprobante (la cola puede estar consultándolo) y el reclamo se conserva
        // hasta terminar la anulación: así la cola no lo toca entre la consulta y la anulación.
        leaseAnulacion = await reclamarDocumento(factura.id, "ERROR");
        if (!leaseAnulacion) return res.status(409).json({ error: MENSAJE_EN_PROCESO });
        let consulta;
        try {
          const endpoints = await endpointsHaciendaPara(credenciales.ambiente);
          const token = await tokenParaConsulta(idCompania, credenciales, endpoints);
          consulta = await consultarEstadoHacienda(endpoints, token, factura.clave, (await parametrosFacturacion()).fetchTimeoutMs);
          if (consulta.httpStatus === 401 || consulta.httpStatus === 403) invalidarTokenHacienda(idCompania, credenciales);
        } catch (err: any) {
          return res.status(503).json({ error: `No se pudo confirmar con Hacienda si recibió esta factura (${err.message}). Intente de nuevo en unos minutos.` });
        }
        if (consulta.estado === "error") {
          return res.status(503).json({ error: `No se pudo confirmar con Hacienda si recibió esta factura${consulta.detalleMensaje ? ` (${consulta.detalleMensaje})` : ""}. Intente de nuevo en unos minutos.` });
        }
        const sincronizado = estadoTrasConsulta(factura, consulta);
        if (!(await guardarEstadoConsultado(factura.id, sincronizado.estado, sincronizado.mensajeError, consulta.respuestaXmlBase64, consulta.estado, leaseAnulacion, false))) {
          return res.status(409).json({ error: MENSAJE_EN_PROCESO });
        }
        if (sincronizado.estado !== "ERROR") await trasCambioDeEstado(factura.id, "ERROR", sincronizado.estado);
        factura.estado = sincronizado.estado;
        factura.mensajeError = sincronizado.mensajeError;
        if (factura.estado === "ENVIADA") {
          return res.status(409).json({ error: "Hacienda sí recibió esta factura y todavía la está procesando. Use «Consultar estado» y anúlela cuando quede aceptada o rechazada." });
        }
      }

      const { company, paciente } = await cargarEmpresaYPaciente(idCompania, factura.idPaciente);
      if (!company) return res.status(404).json({ error: "Empresa no encontrada." });
      if (!paciente) return res.status(404).json({ error: "Paciente no encontrado." });

      // Lo que falta por acreditar de cada línea. Si ya hubo Notas de Crédito parciales, la de
      // anulación cubre solo el resto.
      const lineasOriginales = await lineasDeFactura(factura);
      const pendientePorServicio = factura.estado === "ACEPTADA" ? await cantidadesAcreditadas(factura.id) : new Map<number, number>();
      const lineasPorAcreditar: any[] = [];
      for (const l of lineasOriginales) {
        const yaAcreditada = l.idServicio != null ? Math.min(Number(l.cantidad), pendientePorServicio.get(l.idServicio) || 0) : 0;
        if (l.idServicio != null) pendientePorServicio.set(l.idServicio, (pendientePorServicio.get(l.idServicio) || 0) - yaAcreditada);
        const cantidad = Math.round((Number(l.cantidad) - yaAcreditada) * 1000) / 1000;
        if (cantidad > 0) lineasPorAcreditar.push(lineaParaNota(l, cantidad));
      }

      const facturaAnulada = { ...documentoParaCliente(factura, lineasOriginales), estado: "ANULADA", motivoAnulacion: motivo, idConsulta: null };
      const emiteNotaCredito = factura.estado === "ACEPTADA" && !esPruebaDeSandbox && lineasPorAcreditar.length > 0;

      if (!emiteNotaCredito) {
        // Sin Nota de Crédito: el comprobante nunca fue válido ante Hacienda (o sus Notas de Crédito
        // parciales ya lo acreditaron completo). Solo los efectos locales.
        if (dbConnected && pool) {
          const connection = await pool.getConnection();
          try {
            await connection.beginTransaction();
            await aplicarAnulacion(connection, factura, lineasPorAcreditar, motivo);
            await connection.commit();
          } catch (err) {
            await connection.rollback();
            throw err;
          } finally {
            connection.release();
          }
        } else {
          await aplicarAnulacion(null, factura, lineasPorAcreditar, motivo);
        }
        return res.json({ factura: facturaAnulada, notaCredito: null });
      }

      const p = await parametrosFacturacion();
      const { cert, credenciales: credencialesReales } = await exigirConfigHacienda(idCompania, factura.ambiente, company);
      const lineasNc = calcularLineas(lineasPorAcreditar).map((l, i) => ({ ...l, idServicio: lineasPorAcreditar[i].idServicio, tipo: lineasPorAcreditar[i].tipo }));
      const resumen = calcularResumen(lineasNc);

      // La anulación (inventario, CxC, factura ANULADA) se aplica cuando Hacienda recibe la Nota:
      // en esta misma solicitud o, si queda en cola, cuando la cola la confirme (aplicarEfectosNota).
      const notaCredito = await emitirNota({
        tipoDocumento: "03", factura, company, paciente, lineas: lineasNc, resumen, motivo, codigoReferencia: "01", notaEfecto: "ANULACION",
        medioPago: factura.medioPago || "01", cert, credenciales: credencialesReales, p
      });
      const r = resultadoNota(notaCredito);
      if (r === "FALLIDA") {
        return res.status(502).json({ error: mensajeNotaNoTransmitida("Nota de Crédito de anulación", notaCredito, "El comprobante NO fue anulado"), notaCredito });
      }
      if (r === "EN_COLA") {
        return res.json({ factura: documentoParaCliente(factura, lineasOriginales), notaCredito, aviso: avisoNotaEnCola("Nota de Crédito de anulación", notaCredito, "El comprobante se anulará") });
      }
      res.json({ factura: facturaAnulada, notaCredito });
    } catch (err: any) {
      console.error("[Hacienda] Error anulando factura:", err?.message || err);
      res.status(err.status || (err instanceof ParametroFaltanteError ? 503 : 500)).json({ error: err.message });
    } finally {
      if (leaseAnulacion) await guardarCambiosEnvio(parseInt(req.params.id), { liberar: true }, leaseAnulacion).catch(() => {});
    }
  }));

  /** Línea de una Nota a partir de una línea original, con el descuento prorrateado a la cantidad. */
  function lineaParaNota(original: any, cantidad: number): LineaFacturaInput & { idServicio: number | null; tipo: string } {
    const cantidadOriginal = Number(original.cantidad) || cantidad;
    const descuentoOriginal = Number(original.montoDescuento) || 0;
    const descuento = descuentoOriginal > 0 ? Math.round(descuentoOriginal * (cantidad / cantidadOriginal) * 100000) / 100000 : 0;
    return {
      codigoCabys: original.codigoCabys, detalle: original.detalle, unidadMedida: original.unidadMedida, cantidad,
      precioUnitario: Number(original.precioUnitario), porcentajeIva: Number(original.porcentajeIva),
      montoDescuento: descuento, codigoDescuento: descuento > 0 ? original.codigoDescuento ?? null : null,
      naturalezaDescuento: descuento > 0 ? original.naturalezaDescuento ?? null : null,
      idServicio: original.idServicio ?? null, tipo: original.tipo
    };
  }

  /** OK = Hacienda la recibió (efectos aplicados); EN_COLA = se sigue intentando; FALLIDA = rechazada o error. */
  function resultadoNota(nota: any): "OK" | "EN_COLA" | "FALLIDA" {
    if (nota?.estado === "ENVIADA" || nota?.estado === "ACEPTADA") return "OK";
    if (nota?.estado === "PENDIENTE" || (nota?.estado === "ERROR" && String(nota.mensajeError || "").startsWith(MARCA_ENVIO_INCIERTO))) return "EN_COLA";
    return "FALLIDA";
  }

  function avisoNotaEnCola(nombre: string, nota: any, consecuencia: string): string {
    return `La ${nombre} ${nota.consecutivo} quedó guardada y en cola de envío a Hacienda (${nota.mensajeError || "sin respuesta todavía"}). ${consecuencia} y se aplicarán sus efectos en inventario y cuenta por cobrar en cuanto Hacienda la reciba; no la vuelva a emitir.`;
  }

  function mensajeNotaNoTransmitida(nombre: string, nota: any, consecuencia: string): string {
    const motivo = nota.estado === "RECHAZADA" ? `Hacienda rechazó la ${nombre}` : `Hacienda no recibió la ${nombre}`;
    return `${motivo}: ${nota.mensajeError || "sin detalle"}. ${consecuencia}: no se tocó el inventario ni la cuenta por cobrar. Corrija el problema y use «Reintentar con clave nueva» sobre la nota, o emita otra.`;
  }

  // Carga el comprobante original + empresa + paciente + líneas ya guardadas — validación y datos
  // compartidos entre /nota-credito y /nota-debito (ambos ajustan, total o parcial, una Factura o
  // Tiquete Electrónico ya emitido; a diferencia de /anular, ninguno cambia su estado).
  async function cargarFacturaParaAjuste(req: any, res: any): Promise<{ factura: any; company: Company; paciente: Patient; lineasOriginales: any[] } | null> {
    const factura = await cargarFacturaPorId(parseInt(req.params.id));
    if (!factura) { res.status(404).json({ error: "Factura no encontrada." }); return null; }
    if (!canAccessCompany(sessionOf(req), factura.idCompania)) { res.status(403).json({ error: "No autorizado." }); return null; }
    // Las Notas siempre se transmiten a Hacienda: la empresa de plataforma no emite comprobantes.
    if (esCompaniaPlataforma(factura.idCompania)) { res.status(403).json({ error: MENSAJE_PLATAFORMA_SIN_COMPROBANTES }); return null; }
    if (factura.tipoDocumento !== "01" && factura.tipoDocumento !== "04") { res.status(400).json({ error: "Solo se pueden ajustar Facturas y Tiquetes Electrónicos (no otras Notas de Crédito/Débito)." }); return null; }
    // Solo ACEPTADA: una Nota referencia el comprobante por su clave, y si Hacienda todavía no lo
    // aceptó —o termina rechazándolo— rechaza también la Nota.
    if (factura.estado !== "ACEPTADA") {
      res.status(400).json({ error: factura.estado === "ENVIADA" || factura.estado === "PENDIENTE"
        ? "Hacienda todavía no resuelve este comprobante. Use «Consultar estado» y emita la Nota cuando quede aceptado."
        : "Solo se pueden ajustar comprobantes que Hacienda aceptó." });
      return null;
    }
    const incierta = notaEnEnvioIncierto(await notasDeFactura(factura.id));
    if (incierta) { res.status(409).json({ error: mensajeEnvioIncierto(incierta) }); return null; }

    const { company, paciente } = await cargarEmpresaYPaciente(factura.idCompania, factura.idPaciente);
    if (!company) { res.status(404).json({ error: "Empresa no encontrada." }); return null; }
    if (!paciente) { res.status(404).json({ error: "Paciente no encontrado." }); return null; }

    return { factura, company, paciente, lineasOriginales: await lineasDeFactura(factura) };
  }

  /**
   * Numera, firma y guarda una Nota de Crédito ('03') o Débito ('02') como PENDIENTE en una sola
   * transacción, y la transmite una vez. Siempre se transmite de verdad (sin "modo prueba").
   *
   * Sus efectos locales (inventario, CxC, anular la factura) se aplican SOLO cuando Hacienda la
   * recibe (ENVIADA/ACEPTADA), una sola vez (efectos_aplicados), en esta solicitud o desde la cola.
   * Si Hacienda la rechaza, nada cambia y se puede reintentar con clave nueva.
   *
   * El receptor de la Nota es SIEMPRE la copia guardada en el comprobante original (si se facturó
   * a un tercero, la Nota también va a ese tercero); <TipoDocIR> es el tipo del original (01 o 04).
   */
  async function emitirNota(params: {
    tipoDocumento: "02" | "03";
    factura: any;
    company: Company;
    paciente: Patient;
    lineas: any[];
    resumen: ResumenCalculado;
    motivo: string;
    codigoReferencia: "01" | "02";
    notaEfecto: "ANULACION" | "CREDITO" | "DEBITO";
    medioPago: string;
    cert: CertificadoEmpresa;
    credenciales: CredencialesAtv;
    p: ParametrosFacturacion;
  }): Promise<any> {
    const { tipoDocumento, factura, company, paciente, lineas, resumen, motivo, codigoReferencia, notaEfecto, medioPago, cert, credenciales, p } = params;
    const receptor = receptorDeOriginal(factura, paciente);
    const condicionVenta = factura.condicionVenta || "01";
    const plazoCredito = condicionVenta === "02" ? factura.plazoCredito ?? null : null;
    const mediosPago: MedioPagoComprobante[] = condicionVenta === "02" ? [] : [{ tipo: medioPago, monto: resumen.totalComprobante }];
    const procesandoHasta = nuevaLease(p.cola.bloqueoSeg);

    const armar = async (connection: any | null): Promise<number> => {
      if (connection) {
        // El comprobante original se bloquea mientras se emite la Nota: dos Notas (o una Nota y un
        // reintento con clave nueva) sobre el mismo original quedan en serie, y se revisa de nuevo
        // que no haya otra en cola o con efectos pendientes.
        const [orig] = await connection.query("SELECT estado FROM facturas WHERE id_factura = ? FOR UPDATE", [factura.id]);
        if ((orig as any[])[0]?.estado !== "ACEPTADA") throw Object.assign(new Error("El comprobante original cambió de estado mientras tanto; recargue la página."), { status: 409 });
        const incierta = notaEnEnvioIncierto(await notasDeFactura(factura.id, connection));
        if (incierta) throw Object.assign(new Error(mensajeEnvioIncierto(incierta)), { status: 409 });
      }
      const consecutivo = await reservarConsecutivo(connection, factura.idCompania, tipoDocumento);
      const fechaEmision = new Date();
      const clave = generarClaveNumerica(company.identificacion, consecutivo, fechaEmision);
      const xml = construirXmlComprobante(tipoDocumento, {
        clave, consecutivo, fechaEmision, emisor: emisorDe(company), receptor: receptorParaXml(receptor),
        condicionVenta, mediosPago, plazoCredito, lineas, resumen, detalleMax: p.detalleMax,
        referencia: { tipoDocumento: tipoDocReferencia(factura.tipoDocumento), numero: factura.clave, fechaEmision: factura.fechaEmision, codigo: codigoReferencia, razon: motivo }
      });
      let xmlFirmado: string;
      try {
        xmlFirmado = await firmarComprobante(xml, cert, p);
      } catch (err: any) {
        throw Object.assign(new Error(`No se pudo firmar la nota: ${err.message}`), { status: 400 });
      }
      return insertarDocumento(connection, {
        idCompania: factura.idCompania, idCita: null, idConsulta: null, idPaciente: factura.idPaciente, tipoDocumento, clave, consecutivo,
        fechaEmision: fechaEmisionCR(fechaEmision), ambiente: credenciales.ambiente, lineas, resumen, estado: "PENDIENTE", mensajeError: null,
        condicionVenta, plazoCredito, mediosPago, montoRecibido: null, idFacturaReferencia: factura.id, motivoAnulacion: motivo, xmlFirmado,
        receptor, correoCopiaPaciente: !!Number(leerCampo(factura, "correo_copia_paciente", "correoCopiaPaciente") ?? 0), notaEfecto, procesandoHasta
      });
    };

    const id = dbConnected && pool ? await enTransaccion(armar) : await armar(null);
    return transmitirYRecargar(id, procesandoHasta);
  }

  /**
   * Receptor de una Nota: la copia guardada en el comprobante original; si el original es anterior a
   * esa copia, el receptor que quedó en su XML firmado (aunque los datos del paciente hayan cambiado
   * después); y solo si no hay XML, el paciente.
   */
  function receptorDeOriginal(factura: any, paciente: Patient): ReceptorSnapshot {
    const guardado = receptorGuardado(factura);
    if (guardado) return guardado;
    const desdeXml = receptorDesdeXml(leerCampo(factura, "xml_firmado", "xmlFirmado"));
    if (desdeXml.encontrado) {
      if (!desdeXml.receptor) return { tipoIdentificacion: null, identificacion: null, nombre: paciente?.nombreCompleto ?? "", correo: paciente?.correoElectronico || null, codigoActividad: null, esTercero: false };
      const r = desdeXml.receptor;
      return { tipoIdentificacion: r.tipoIdentificacion, identificacion: r.identificacion, nombre: r.nombre, correo: r.correoElectronico ?? null, codigoActividad: r.codigoActividad ?? null, esTercero: false };
    }
    return receptorDesdePaciente(paciente);
  }

  // Ajuste de la CxC de una factura a crédito por una Nota (montos en colones, `delta` > 0 aumenta).
  // - Nota de Débito: suma al total y al saldo; una cuenta ya PAGADA vuelve a PENDIENTE (el
  //   paciente vuelve a deber), y si la factura nunca tuvo CxC se le crea una.
  // - Nota de Crédito parcial: resta (sin bajar de 0); si el saldo llega a 0 queda PAGADA. Solo
  //   sobre una cuenta PENDIENTE: si ya estaba pagada, lo acreditado es una devolución de dinero que
  //   se hace fuera del sistema.
  // Devuelve el saldo a favor del paciente: lo acreditado que excede lo que todavía debía.
  async function ajustarCxcPorNota(connection: any | null, factura: any, delta: number): Promise<number> {
    const redondear = redondearMonto;
    let cuenta: any;
    if (connection) {
      const [rows] = await connection.query("SELECT * FROM cuentas_cobrar WHERE idFactura = ? FOR UPDATE", [factura.id]);
      cuenta = (rows as any[])[0];
    } else {
      cuenta = localCuentasCobrar.find(c => c.idFactura === factura.id);
    }

    if (!cuenta) {
      if (delta <= 0) return 0;
      const fechaEmision = fechaCR();
      const nueva = {
        idCompania: factura.idCompania, idFactura: factura.id, facturaConsecutivo: factura.consecutivo, idPaciente: factura.idPaciente,
        fechaEmision, fechaVencimiento: sumarDiasCR(fechaEmision, factura.plazoCredito), plazoDias: factura.plazoCredito,
        montoTotal: redondear(delta), saldoPendiente: redondear(delta), estado: "PENDIENTE" as const, creadaEn: new Date().toISOString()
      };
      if (connection) {
        await connection.query(
          "INSERT INTO cuentas_cobrar (idCompania, idFactura, facturaConsecutivo, idPaciente, fechaEmision, fechaVencimiento, plazoDias, montoTotal, saldoPendiente, estado, creadaEn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)",
          [nueva.idCompania, nueva.idFactura, nueva.facturaConsecutivo, nueva.idPaciente, nueva.fechaEmision, nueva.fechaVencimiento, nueva.plazoDias, nueva.montoTotal, nueva.saldoPendiente, nueva.creadaEn]
        );
      } else {
        localCuentasCobrar.push({ id: Math.max(0, ...localCuentasCobrar.map(c => c.id), 0) + 1, ...nueva });
      }
      return 0;
    }
    if (cuenta.estado === "ANULADA") return 0;

    let montoTotal = Number(cuenta.montoTotal);
    let saldoPendiente = Number(cuenta.saldoPendiente);
    let estado = cuenta.estado;
    let saldoAFavor = 0;
    if (delta > 0) {
      montoTotal = redondear(montoTotal + delta);
      saldoPendiente = redondear(saldoPendiente + delta);
      estado = "PENDIENTE";
    } else if (estado === "PENDIENTE") {
      saldoAFavor = Math.max(0, redondear(-delta - saldoPendiente));
      montoTotal = Math.max(0, redondear(montoTotal + delta));
      saldoPendiente = Math.max(0, redondear(saldoPendiente + delta));
      if (saldoPendiente <= 0) estado = "PAGADA";
    } else {
      // Cuenta ya PAGADA: todo lo acreditado es dinero que hay que devolverle al paciente.
      return redondear(-delta);
    }

    if (connection) {
      await connection.query("UPDATE cuentas_cobrar SET montoTotal = ?, saldoPendiente = ?, estado = ? WHERE id = ?", [montoTotal, saldoPendiente, estado, cuenta.id]);
    } else {
      Object.assign(cuenta, { montoTotal, saldoPendiente, estado });
    }
    return saldoAFavor;
  }

  const MARCA_SALDO_A_FAVOR = "Saldo a favor del paciente:";

  // Mueve existencias de las líneas ARTICULO de una Nota: `signo` +1 repone (Nota de Crédito), −1
  // descuenta (Nota de Débito, que es una entrega adicional). También la usa la anulación.
  //
  // No se recorta a 0: el kardex (movimientos_inventario) tiene que cuadrar con el stock.
  async function moverStockPorNota(connection: any | null, idCompania: number, lineas: any[], signo: 1 | -1, referencia: string, motivo: string): Promise<void> {
    for (const l of lineas) {
      if (l.tipo !== "ARTICULO" || !l.idServicio) continue;
      if (connection) {
        const [servicioRows] = await connection.query("SELECT stock FROM servicios WHERE id_servicio = ? AND idCompania = ? FOR UPDATE", [l.idServicio, idCompania]);
        if ((servicioRows as any[]).length === 0) continue;
        const stockResultante = (Number((servicioRows as any[])[0]?.stock) || 0) + signo * Number(l.cantidad);
        await connection.query("UPDATE servicios SET stock = ? WHERE id_servicio = ?", [stockResultante, l.idServicio]);
        await connection.query(
          `INSERT INTO movimientos_inventario (idCompania, idServicio, tipo, cantidad, stockResultante, referencia, notas, creadoPor, creadoEn) VALUES (?, ?, '${signo > 0 ? "DEVOLUCION_VENTA" : "VENTA"}', ?, ?, ?, ?, ?, ?)`,
          [idCompania, l.idServicio, signo * Number(l.cantidad), stockResultante, referencia, motivo, null, new Date().toISOString()]
        );
      } else {
        const servicio = localServicios.find(s => s.id === l.idServicio && s.idCompania === idCompania);
        if (servicio) servicio.stock = (servicio.stock || 0) + signo * Number(l.cantidad);
      }
    }
  }

  // Nota de Crédito PARCIAL (o total sin marcar la factura como ANULADA): corrige el monto de un
  // comprobante ya emitido acreditando cantidades específicas de sus líneas originales. Código de
  // referencia '02' ("Corrige monto") — nunca '01' (reservado a anulación total vía /anular).
  app.post("/api/facturas/:id/nota-credito", requireAuth, unaOperacionALaVez(candadoPorFactura, async (req, res) => {
    try {
      // Una Nota de Crédito "parcial" puede acreditar todo lo vendido: repone existencias y salda la
      // deuda igual que anular. Exige lo mismo que anular, o sería la forma de saltarse ese permiso.
      const session = sessionOf(req);
      if (session.rol !== "Administrador" && !isSaasAdmin(session)) {
        return res.status(403).json({ error: "Solo un usuario Administrador puede emitir Notas de Crédito." });
      }
      if (req.body.modoPrueba === true) return res.status(400).json({ error: MENSAJE_SIN_MODO_PRUEBA });
      const motivo = String(req.body.motivo || "").trim().slice(0, RAZON_MAX);
      if (!motivo) return res.status(400).json({ error: "Indique el motivo de la Nota de Crédito." });
      const lineasBody: Array<{ idServicio: number; cantidad: number }> = req.body.lineas || [];
      if (lineasBody.length === 0) return res.status(400).json({ error: "Seleccione al menos una línea a acreditar." });

      const datos = await cargarFacturaParaAjuste(req, res);
      if (!datos) return;
      const { factura, company, paciente, lineasOriginales } = datos;
      const idCompania = factura.idCompania;
      const p = await parametrosFacturacion();
      const { cert, credenciales } = await exigirConfigHacienda(idCompania, factura.ambiente, company);

      // Hacienda exige que la suma de ajustes nunca supere el comprobante original.
      const acreditadoPorServicio = await cantidadesAcreditadas(factura.id);
      const lineasInput: any[] = [];
      for (const pedida of lineasBody) {
        const idServicio = parseInt(pedida.idServicio as any);
        const cantidad = parseFloat(pedida.cantidad as any);
        if (!Number.isFinite(cantidad) || cantidad <= 0) return res.status(400).json({ error: "Cada línea a acreditar debe tener una cantidad mayor a 0." });
        const originales = lineasOriginales.filter((l: any) => l.idServicio === idServicio);
        if (originales.length === 0) return res.status(400).json({ error: `El comprobante original no tiene una línea con el servicio ${idServicio}.` });
        const original = originales[0];
        const vendido = originales.reduce((s: number, l: any) => s + Number(l.cantidad), 0);
        const yaAcreditado = acreditadoPorServicio.get(idServicio) || 0;
        const disponible = vendido - yaAcreditado;
        if (cantidad > disponible + 1e-9) {
          return res.status(400).json({ error: `"${original.detalle}": solo quedan ${disponible} unidad(es) por acreditar (ya se acreditaron ${yaAcreditado} de ${vendido}).` });
        }
        // Lo pedido en esta misma nota también cuenta.
        acreditadoPorServicio.set(idServicio, yaAcreditado + cantidad);
        lineasInput.push(lineaParaNota(original, cantidad));
      }

      const lineasCalculadas = calcularLineas(lineasInput).map((l, i) => ({ ...l, idServicio: lineasInput[i].idServicio, tipo: lineasInput[i].tipo }));
      const resumen = calcularResumen(lineasCalculadas);

      const notaCredito = await emitirNota({
        tipoDocumento: "03", factura, company, paciente, lineas: lineasCalculadas, resumen, motivo, codigoReferencia: "02", notaEfecto: "CREDITO",
        medioPago: factura.medioPago || "01", cert, credenciales, p
      });
      const r = resultadoNota(notaCredito);
      if (r === "FALLIDA") {
        return res.status(502).json({ error: mensajeNotaNoTransmitida("Nota de Crédito", notaCredito, "No se acreditó nada"), notaCredito });
      }
      res.json(r === "EN_COLA" ? { ...notaCredito, aviso: avisoNotaEnCola("Nota de Crédito", notaCredito, "Lo acreditado") } : notaCredito);
    } catch (err: any) {
      console.error("[Hacienda] Error emitiendo Nota de Crédito parcial:", err?.message || err);
      res.status(err.status || (err instanceof ParametroFaltanteError ? 503 : 500)).json({ error: err.message });
    }
  }));

  // Nota de Débito (total o parcial): agrega un cargo adicional sobre un comprobante ya emitido.
  // Las líneas son nuevas — se toman del catálogo VIGENTE de servicios, igual que POST /api/facturas.
  app.post("/api/facturas/:id/nota-debito", requireAuth, unaOperacionALaVez(candadoPorFactura, async (req, res) => {
    try {
      // Mismo permiso que Notas de Crédito y anular: es un comprobante irreversible ante Hacienda
      // que además mueve inventario y cuentas por cobrar (antes no se exigía).
      const session = sessionOf(req);
      if (session.rol !== "Administrador" && !isSaasAdmin(session)) {
        return res.status(403).json({ error: "Solo un usuario Administrador puede emitir Notas de Débito." });
      }
      if (req.body.modoPrueba === true) return res.status(400).json({ error: MENSAJE_SIN_MODO_PRUEBA });
      const motivo = String(req.body.motivo || "").trim().slice(0, RAZON_MAX);
      if (!motivo) return res.status(400).json({ error: "Indique el motivo de la Nota de Débito." });
      const lineasBody: Array<{ idServicio: number; cantidad: number }> = req.body.lineas || [];
      if (lineasBody.length === 0) return res.status(400).json({ error: "Agregue al menos un servicio a debitar." });
      const medioPago = String(req.body.medioPago || "01");
      const [p, catalogo] = await Promise.all([parametrosFacturacion(), catalogosHacienda()]);
      if (!codigoEnCatalogo(catalogo, "MEDIO_PAGO", medioPago)) return res.status(400).json({ error: "Medio de pago inválido: no está en el catálogo de Hacienda." });

      const datos = await cargarFacturaParaAjuste(req, res);
      if (!datos) return;
      const { factura, company, paciente } = datos;
      const idCompania = factura.idCompania;
      const { cert, credenciales } = await exigirConfigHacienda(idCompania, factura.ambiente, company);

      let serviciosDisponibles: Servicio[];
      if (dbConnected && pool) {
        const [servicioRows] = await pool.query("SELECT * FROM servicios WHERE idCompania = ?", [idCompania]);
        serviciosDisponibles = (servicioRows as any[]).map(row => normalizeRow(row, 'id_servicio'));
      } else {
        serviciosDisponibles = localServicios.filter(s => s.idCompania === idCompania);
      }

      const lineasInput: any[] = [];
      // Se chequea contra lo pedido en TODAS las líneas del mismo artículo, y antes de transmitir.
      const pedidoPorArticulo = new Map<number, number>();
      for (const l of lineasBody) {
        const servicio = serviciosDisponibles.find(s => s.id === parseInt(l.idServicio as any));
        if (!servicio) return res.status(400).json({ error: `Servicio ${l.idServicio} no encontrado.` });
        if (!servicio.codigoCabys) return res.status(400).json({ error: `El servicio "${servicio.nombre}" no tiene un código CABYS configurado.` });
        const cantidad = parseFloat((l.cantidad as any) || 1);
        if (!Number.isFinite(cantidad) || cantidad <= 0) return res.status(400).json({ error: `La cantidad de "${servicio.nombre}" debe ser mayor a 0.` });
        const pedido = (pedidoPorArticulo.get(servicio.id) || 0) + cantidad;
        pedidoPorArticulo.set(servicio.id, pedido);
        if (servicio.tipo === 'ARTICULO' && (servicio.stock || 0) < pedido) {
          return res.status(400).json({ error: `Existencias insuficientes de "${servicio.nombre}" (disponible: ${servicio.stock || 0}, solicitado: ${pedido}).` });
        }
        const detalle = recortarDetalle(servicio.nombre, p.detalleMax);
        const errDetalle = errorDetalle(detalle, p.detalleMin, p.detalleMax);
        if (errDetalle) return res.status(400).json({ error: errDetalle });
        lineasInput.push({
          codigoCabys: servicio.codigoCabys, detalle, unidadMedida: servicio.unidadMedida || (servicio.tipo === 'ARTICULO' ? p.unidadMercancia : p.unidadServicio),
          cantidad, precioUnitario: servicio.precio,
          porcentajeIva: servicio.porcentajeIva != null ? servicio.porcentajeIva : company.ivaPorDefecto,
          idServicio: servicio.id, tipo: servicio.tipo || 'SERVICIO'
        });
      }

      const lineasCalculadas = calcularLineas(lineasInput).map((l, i) => ({ ...l, idServicio: lineasInput[i].idServicio, tipo: lineasInput[i].tipo }));
      const resumen = calcularResumen(lineasCalculadas);

      const notaDebito = await emitirNota({
        tipoDocumento: "02", factura, company, paciente, lineas: lineasCalculadas, resumen, motivo, codigoReferencia: "02", notaEfecto: "DEBITO",
        medioPago, cert, credenciales, p
      });
      const r = resultadoNota(notaDebito);
      if (r === "FALLIDA") {
        return res.status(502).json({ error: mensajeNotaNoTransmitida("Nota de Débito", notaDebito, "No se cargó nada"), notaDebito });
      }
      res.json(r === "EN_COLA" ? { ...notaDebito, aviso: avisoNotaEnCola("Nota de Débito", notaDebito, "El cargo") } : notaDebito);
    } catch (err: any) {
      console.error("[Hacienda] Error emitiendo Nota de Débito:", err?.message || err);
      res.status(err.status || (err instanceof ParametroFaltanteError ? 503 : 500)).json({ error: err.message });
    }
  }));

  // Vuelve a CONSULTAR a Hacienda el estado de un comprobante. Nunca lo reenvía. Sirve para uno
  // ENVIADO que no resolvió durante el sondeo, uno en ERROR que quizás sí le llegó, o uno en cola.
  app.post("/api/facturas/:id/estado", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const factura = await cargarFacturaPorId(id);
      if (!factura) return res.status(404).json({ error: "Factura no encontrada." });
      if (!canAccessCompany(sessionOf(req), factura.idCompania)) {
        return res.status(403).json({ error: "No autorizado." });
      }
      if (factura.estado === "SIMULADA") {
        return res.status(400).json({ error: "Este comprobante es de prueba: nunca se envió a Hacienda." });
      }

      const credenciales = await cargarCredencialesAtv(factura.idCompania);
      if (!credenciales) return res.status(400).json({ error: "No hay credenciales ATV configuradas para esta empresa." });
      if (credenciales.ambiente === "PRUEBAS_LOCAL") {
        return res.status(400).json({ error: "La empresa está en ambiente de pruebas locales: no hay nada que consultar en Hacienda." });
      }
      // Las credenciales de SANDBOX y PRODUCCIÓN son distintas y cada ambiente solo conoce sus claves.
      if (factura.ambiente && credenciales.ambiente !== factura.ambiente) {
        return res.status(400).json({ error: `Este comprobante se emitió en ${factura.ambiente} y la empresa está configurada en ${credenciales.ambiente}: no se puede consultar con estas credenciales.` });
      }

      // Se reclama el comprobante en el estado leído: si la cola lo está trabajando, no se toca.
      const lease = await reclamarDocumento(id, factura.estado);
      if (!lease) return res.status(409).json({ error: MENSAJE_EN_PROCESO });

      let consulta: EstadoHaciendaResultado;
      try {
        const endpoints = await endpointsHaciendaPara(credenciales.ambiente);
        const token = await tokenParaConsulta(factura.idCompania, credenciales, endpoints);
        consulta = await consultarEstadoHacienda(endpoints, token, factura.clave, (await parametrosFacturacion()).fetchTimeoutMs);
        if (consulta.httpStatus === 401 || consulta.httpStatus === 403) invalidarTokenHacienda(factura.idCompania, credenciales);
      } catch (err: any) {
        await guardarCambiosEnvio(id, { liberar: true }, lease);
        return res.status(502).json({ error: `No se pudo consultar a Hacienda en este momento (${err.message}). Intente de nuevo en unos minutos.` });
      }
      if (consulta.estado === "error") {
        await guardarCambiosEnvio(id, { liberar: true }, lease);
        return res.status(502).json({ error: `No se pudo consultar a Hacienda en este momento${consulta.detalleMensaje ? ` (${consulta.detalleMensaje})` : ""}. Intente de nuevo en unos minutos.` });
      }

      let { estado: nuevoEstado, mensajeError } = estadoTrasConsulta(factura, consulta);
      // Un estado final (ACEPTADA/RECHAZADA) nunca retrocede por una consulta.
      if ((factura.estado === "ACEPTADA" || factura.estado === "RECHAZADA") && nuevoEstado !== factura.estado) {
        nuevoEstado = factura.estado;
        mensajeError = factura.mensajeError ?? null;
      }
      // Un comprobante anterior a la cola que Hacienda no tiene no se debe reenviar solo.
      const guardado = await guardarEstadoConsultado(id, nuevoEstado, mensajeError, consulta.respuestaXmlBase64, consulta.estado, lease);
      if (!guardado) return res.status(409).json({ error: MENSAJE_EN_PROCESO });
      if (nuevoEstado !== factura.estado) await trasCambioDeEstado(id, factura.estado, nuevoEstado);

      const actualizada = await cargarFacturaPorId(id);
      res.json({ id, estado: actualizada?.estado ?? nuevoEstado, mensajeError: actualizada?.mensajeError ?? mensajeError, estadoHacienda: consulta.estado, factura: documentoParaCliente(actualizada, await lineasDeFactura(actualizada)) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Vuelve a poner en cola un comprobante en ERROR (agotó los intentos automáticos o Hacienda no lo
  // recibió). Transmite el MISMO XML firmado: nunca lo vuelve a firmar. Si su envío fue incierto,
  // primero se consulta la clave (ver ejecutarCicloEnvio). Solo Administrador.
  app.post("/api/facturas/:id/reintentar-envio", requireAuth, unaOperacionALaVez(candadoPorFactura, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (session.rol !== "Administrador" && !isSaasAdmin(session)) {
        return res.status(403).json({ error: "Solo un usuario Administrador puede reintentar el envío." });
      }
      const id = parseInt(req.params.id);
      const doc = await cargarFacturaPorId(id);
      if (!doc) return res.status(404).json({ error: "Comprobante no encontrado." });
      if (!canAccessCompany(session, doc.idCompania)) return res.status(403).json({ error: "No autorizado." });
      if (esCompaniaPlataforma(doc.idCompania)) return res.status(403).json({ error: MENSAJE_PLATAFORMA_SIN_COMPROBANTES });
      if (doc.estado !== "ERROR") return res.status(400).json({ error: "Solo se puede reintentar el envío de un comprobante en ERROR." });
      if (!leerCampo(doc, "xml_firmado", "xmlFirmado")) return res.status(400).json({ error: "Este comprobante no tiene XML firmado guardado: emítalo de nuevo." });
      const p = await parametrosFacturacion();
      // Un solo UPDATE condicional reclama la fila y la devuelve a la cola: solo gana si sigue en
      // ERROR y nadie la tiene reclamada. Si su POST pudo haber llegado, sigue en ERROR (la cola solo
      // consulta); si no, vuelve a PENDIENTE. El administrador decide: ya no se trata como legado.
      const lease = nuevaLease(p.cola.bloqueoSeg);
      let reclamado = false;
      if (dbConnected && pool) {
        const [r] = await pool.query(
          `UPDATE facturas SET estado = IF(hacienda_post_realizado = 1, 'ERROR', 'PENDIENTE'), hacienda_intentos = 0, hacienda_consultas = 0,
             hacienda_proximo_intento = NULL, hacienda_error_detalle = NULL, hacienda_origen_legado = 0, hacienda_procesando_hasta = ?
           WHERE id_factura = ? AND estado = 'ERROR' AND (hacienda_procesando_hasta IS NULL OR hacienda_procesando_hasta < ?)`,
          [lease, id, new Date()]
        );
        reclamado = (r as any).affectedRows === 1;
      } else {
        const local: any = localFacturas.find(f => f.id === id);
        const libre = !local?.haciendaProcesandoHasta || new Date(local.haciendaProcesandoHasta).getTime() < Date.now();
        if (local && local.estado === "ERROR" && libre) {
          Object.assign(local, { estado: local.haciendaPostRealizado ? "ERROR" : "PENDIENTE", haciendaIntentos: 0, haciendaConsultas: 0, haciendaProximoIntento: null, haciendaErrorDetalle: null, haciendaOrigenLegado: false, haciendaProcesandoHasta: lease });
          reclamado = true;
        }
      }
      if (!reclamado) return res.status(409).json({ error: MENSAJE_EN_PROCESO });
      res.json(await transmitirYRecargar(id, lease));
    } catch (err: any) {
      res.status(err instanceof ParametroFaltanteError ? 503 : 500).json({ error: err.message });
    }
  }));

  // Reintento con CLAVE NUEVA de un comprobante RECHAZADO (se corrigió la causa: datos de la
  // empresa, del receptor, CABYS…): consecutivo nuevo, clave nueva y FechaEmision nueva (reusar la
  // fecha vieja provoca el error -53), se vuelve a firmar y se transmite. La clave, el consecutivo y
  // la respuesta rechazados quedan en factura_historial_rechazos para auditoría. Solo Administrador.
  app.post("/api/facturas/:id/reintentar-clave-nueva", requireAuth, unaOperacionALaVez(candadoPorFactura, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (session.rol !== "Administrador" && !isSaasAdmin(session)) {
        return res.status(403).json({ error: "Solo un usuario Administrador puede reintentar un comprobante rechazado." });
      }
      const id = parseInt(req.params.id);
      const doc = await cargarFacturaPorId(id);
      if (!doc) return res.status(404).json({ error: "Comprobante no encontrado." });
      if (!canAccessCompany(session, doc.idCompania)) return res.status(403).json({ error: "No autorizado." });
      if (esCompaniaPlataforma(doc.idCompania)) return res.status(403).json({ error: MENSAJE_PLATAFORMA_SIN_COMPROBANTES });
      if (doc.estado !== "RECHAZADA") return res.status(400).json({ error: "Solo se puede reintentar con clave nueva un comprobante que Hacienda rechazó." });
      const tipoOriginal = String(doc.tipoDocumento);
      if (!esTipoNumeracion(tipoOriginal)) return res.status(400).json({ error: "Tipo de comprobante no soportado." });
      const esNota = esTipoNota(tipoOriginal);
      const notaEfecto = leerCampo(doc, "nota_efecto", "notaEfecto");
      if (esNota && !notaEfecto) {
        return res.status(409).json({ error: "Esta nota es anterior al reintento automático y su efecto no se puede reconstruir: emita una nota nueva." });
      }

      const idCompania = doc.idCompania;
      const [p, { company, paciente }] = await Promise.all([parametrosFacturacion(), cargarEmpresaYPaciente(idCompania, doc.idPaciente)]);
      if (!company) return res.status(404).json({ error: "Empresa no encontrada." });
      const { cert, credenciales } = await exigirConfigHacienda(idCompania, doc.ambiente, company);

      // Receptor: la copia guardada (o el paciente en comprobantes viejos). Factura/Tiquete se
      // vuelve a decidir: un rechazo por receptor sin identificación válida pasa a Tiquete.
      const receptor = receptorGuardado(doc) ?? (paciente ? receptorDesdePaciente(paciente) : null);
      if (!receptor) return res.status(404).json({ error: "No se encontró el receptor del comprobante." });
      let tipoNuevo: TipoNumeracion = tipoOriginal;
      if (!esNota) {
        const decision = decidirTipoComprobante(receptor, doc.condicionVenta || "01", p.condicionesExigenReceptor);
        if (decision.error) return res.status(400).json({ error: decision.error });
        tipoNuevo = decision.tipoDocumento;
      }

      let referencia: any = undefined;
      if (esNota) {
        const original = await cargarFacturaPorId(doc.idFacturaReferencia);
        if (!original || original.idCompania !== idCompania) return res.status(404).json({ error: "No se encontró el comprobante que referencia esta nota." });
        referencia = { tipoDocumento: tipoDocReferencia(original.tipoDocumento), numero: original.clave, fechaEmision: original.fechaEmision, codigo: notaEfecto === "ANULACION" ? "01" : "02", razon: String(doc.motivoAnulacion || "") };
      }

      const lineasGuardadas = await lineasDeFactura(doc);
      const lineasInput = lineasGuardadas.map((l: any) => lineaParaNota(l, Number(l.cantidad)));
      const lineas = calcularLineas(lineasInput).map((l, i) => ({ ...l, idServicio: lineasInput[i].idServicio, tipo: lineasInput[i].tipo }));
      const resumen = calcularResumen(lineas);
      const condicionVenta = doc.condicionVenta || "01";
      let medios: MedioPagoComprobante[] = [];
      if (condicionVenta !== "02") {
        const guardados = documentoParaCliente(doc).mediosPago as MedioPagoComprobante[] | null;
        medios = cuadrarMediosPago(guardados && guardados.length > 0 ? guardados : [{ tipo: doc.medioPago || "01", monto: resumen.totalComprobante }], resumen.totalComprobante);
      }
      const plazoCredito = condicionVenta === "02" ? doc.plazoCredito ?? null : null;
      const xmlViejo = leerCampo(doc, "xml_firmado", "xmlFirmado") ?? null;
      const respuestaVieja = leerCampo(doc, "respuesta_hacienda", "respuestaHacienda") ?? null;

      const lease = nuevaLease(p.cola.bloqueoSeg);
      const rehacer = async (connection: any | null) => {
        if (connection) {
          const [rows] = await connection.query("SELECT estado FROM facturas WHERE id_factura = ? FOR UPDATE", [id]);
          if ((rows as any[])[0]?.estado !== "RECHAZADA") throw Object.assign(new Error("El comprobante cambió de estado mientras tanto; recargue la página."), { status: 409 });
        }
        // Una Nota se revisa de nuevo DENTRO del bloqueo: el original sigue aceptado (no anulado),
        // no hay otra nota en cola, incierta o con efectos pendientes, y lo acreditado no supera
        // el comprobante original (pudo haber otras Notas de Crédito desde el rechazo).
        if (esNota) await verificarReintentoNota(connection, doc, notaEfecto, lineas);
        if (connection) {
          await connection.query(
            "INSERT INTO factura_historial_rechazos (id_factura, idCompania, tipoDocumento, clave, consecutivo, fechaEmision, mensajeError, respuesta_hacienda, xml_firmado, reemplazadaEn, reemplazadaPor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [id, idCompania, tipoOriginal, doc.clave, doc.consecutivo, doc.fechaEmision, doc.mensajeError ?? null, respuestaVieja, xmlViejo, new Date(), session.userId]
          );
        }
        const consecutivo = await reservarConsecutivo(connection, idCompania, tipoNuevo);
        const fechaEmision = new Date();
        const clave = generarClaveNumerica(company.identificacion, consecutivo, fechaEmision);
        const xml = construirXmlComprobante(tipoNuevo, {
          clave, consecutivo, fechaEmision, emisor: emisorDe(company), receptor: receptorParaXml(receptor),
          condicionVenta, mediosPago: medios, plazoCredito, lineas, resumen, detalleMax: p.detalleMax, referencia
        });
        let xmlFirmado: string;
        try {
          xmlFirmado = await firmarComprobante(xml, cert, p);
        } catch (err: any) {
          throw Object.assign(new Error(`No se pudo firmar el comprobante: ${err.message}`), { status: 400 });
        }
        const fechaTexto = fechaEmisionCR(fechaEmision);
        if (connection) {
          await connection.query(
            `UPDATE facturas SET tipoDocumento = ?, clave = ?, consecutivo = ?, fechaEmision = ?, xml_firmado = ?, respuesta_hacienda = NULL, estado = 'PENDIENTE', mensajeError = NULL,
               medios_pago = ?, hacienda_intentos = 0, hacienda_consultas = 0, hacienda_post_realizado = 0, hacienda_ultimo_post = NULL, hacienda_origen_legado = 0,
               hacienda_proximo_intento = NULL, hacienda_error_detalle = NULL, hacienda_procesando_hasta = ?,
               correo_enviado = 0, correo_reclamado_en = NULL, correo_error = NULL WHERE id_factura = ?`,
            [tipoNuevo, clave, consecutivo, fechaTexto, xmlFirmado, JSON.stringify(medios), lease, id]
          );
          await connection.query("UPDATE cuentas_cobrar SET facturaConsecutivo = ? WHERE idFactura = ?", [consecutivo, id]);
        } else {
          const local: any = localFacturas.find(f => f.id === id);
          local.historialRechazos = [...(local.historialRechazos || []), { tipoDocumento: tipoOriginal, clave: doc.clave, consecutivo: doc.consecutivo, fechaEmision: doc.fechaEmision, mensajeError: doc.mensajeError ?? null, reemplazadaEn: new Date().toISOString(), reemplazadaPor: session.userId }];
          Object.assign(local, { tipoDocumento: tipoNuevo, clave, consecutivo, fechaEmision: fechaTexto, xmlFirmado, respuestaHacienda: null, estado: "PENDIENTE", mensajeError: null, mediosPago: medios, haciendaIntentos: 0, haciendaConsultas: 0, haciendaPostRealizado: false, haciendaUltimoPost: null, haciendaOrigenLegado: false, haciendaProximoIntento: null, haciendaErrorDetalle: null, haciendaProcesandoHasta: lease, correoEnviado: 0, correoError: null });
          const cxc = localCuentasCobrar.find(c => c.idFactura === id);
          if (cxc) cxc.facturaConsecutivo = consecutivo;
        }
      };
      try {
        if (dbConnected && pool) await enTransaccion(rehacer);
        else await rehacer(null);
      } catch (err: any) {
        if (err.status) return res.status(err.status).json({ error: err.message });
        throw err;
      }
      console.log(`[Hacienda] Comprobante ${id} reintentado con clave nueva (rechazada: ${doc.clave}) por el usuario ${session.userId}.`);
      res.json(await transmitirYRecargar(id, lease));
    } catch (err: any) {
      console.error("[Hacienda] Error reintentando con clave nueva:", err?.message || err);
      res.status(err.status || (err instanceof ParametroFaltanteError ? 503 : 500)).json({ error: err.message });
    }
  }));

  /**
   * Revisión de un reintento con clave nueva de una Nota (dentro de la transacción, con el original
   * bloqueado): lanza un error 409 con el motivo si ya no se puede.
   */
  async function verificarReintentoNota(connection: any | null, nota: any, notaEfecto: string, lineasNota: any[]): Promise<void> {
    const falla = (mensaje: string) => Object.assign(new Error(mensaje), { status: 409 });
    let estadoOriginal: string | undefined;
    if (connection) {
      const [rows] = await connection.query("SELECT estado FROM facturas WHERE id_factura = ? AND idCompania = ? FOR UPDATE", [nota.idFacturaReferencia, nota.idCompania]);
      estadoOriginal = (rows as any[])[0]?.estado;
    } else {
      estadoOriginal = localFacturas.find(f => f.id === nota.idFacturaReferencia && f.idCompania === nota.idCompania)?.estado;
    }
    if (!estadoOriginal) throw falla("No se encontró el comprobante que referencia esta nota.");
    if (estadoOriginal === "ANULADA") throw falla("El comprobante original ya está anulado: esta nota ya no se puede reintentar.");
    if (estadoOriginal !== "ACEPTADA") throw falla(`El comprobante original está ${estadoOriginal}: esta nota ya no se puede reintentar.`);
    const hermanas = (await notasDeFactura(nota.idFacturaReferencia, connection)).filter(n => n.id !== nota.id);
    const incierta = notaEnEnvioIncierto(hermanas);
    if (incierta) throw falla(mensajeEnvioIncierto(incierta));
    if (notaEfecto === "CREDITO" || notaEfecto === "ANULACION") {
      // Esta nota está RECHAZADA, así que cantidadesAcreditadas ya no la cuenta.
      const acreditado = await cantidadesAcreditadas(nota.idFacturaReferencia, connection);
      const original = await cargarFacturaPorId(nota.idFacturaReferencia);
      const vendido = new Map<number, number>();
      for (const l of await lineasDeFactura(original)) if (l.idServicio != null) vendido.set(l.idServicio, (vendido.get(l.idServicio) || 0) + Number(l.cantidad));
      const pedido = new Map<number, { cantidad: number; detalle: string }>();
      for (const l of lineasNota) {
        if (l.idServicio == null) continue;
        const actual = pedido.get(l.idServicio);
        pedido.set(l.idServicio, { cantidad: (actual?.cantidad || 0) + Number(l.cantidad), detalle: l.detalle });
      }
      for (const [idServicio, { cantidad, detalle }] of pedido) {
        const disponible = (vendido.get(idServicio) || 0) - (acreditado.get(idServicio) || 0);
        if (cantidad > disponible + 1e-9) {
          throw falla(`"${detalle}": desde el rechazo se acreditó más de este servicio y solo quedan ${Math.max(0, disponible)} unidad(es) por acreditar. Esta nota ya no se puede reintentar; emita una nota nueva por lo que falte.`);
        }
      }
    }
  }

  // Historial de claves rechazadas de un comprobante (auditoría del reintento con clave nueva).
  app.get("/api/facturas/:id/historial-rechazos", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const doc = await cargarFacturaPorId(id);
      if (!doc) return res.status(404).json({ error: "Comprobante no encontrado." });
      if (!canAccessCompany(sessionOf(req), doc.idCompania)) return res.status(403).json({ error: "No autorizado." });
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT id, tipoDocumento, clave, consecutivo, fechaEmision, mensajeError, reemplazadaEn FROM factura_historial_rechazos WHERE id_factura = ? AND idCompania = ? ORDER BY id", [id, doc.idCompania]);
        return res.json(rows);
      }
      res.json((doc as any).historialRechazos || []);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Envía por correo el comprobante ya emitido al receptor (el paciente o el tercero a quien se
  // facturó, con copia al paciente si se pidió): PDF, XML firmado y MensajeHacienda de Hacienda
  // cuando existen (ver enviarCorreoComprobante). Sin columna idFactura dedicada en
  // notification_logs; el consecutivo queda en el asunto/cuerpo del log.
  app.post("/api/facturas/:id/reenviar-correo", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const factura = await cargarFacturaPorId(id);
      if (!factura) return res.status(404).json({ error: "Factura no encontrada." });
      if (!canAccessCompany(sessionOf(req), factura.idCompania)) {
        return res.status(403).json({ error: "No autorizado." });
      }
      res.json(await enviarCorreoComprobante(id, false));
    } catch (err: any) {
      console.error("Error reenviando comprobante por correo:", err?.message || err);
      res.status(err.status || 500).json({ error: err.message || "No se pudo reenviar el comprobante por correo." });
    }
  });

  // «Probar configuración» de Hacienda: verifica localmente el .p12 y su PIN (sujeto, vigencia) y
  // hace un inicio de sesión REAL en el IdP de Hacienda con el usuario ATV (solo pide un token; no
  // envía ningún comprobante). Guarda config_verificada y la fecha. Solo Administrador.
  app.post("/api/hacienda/probar-configuracion", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (session.rol !== "Administrador" && !isSaasAdmin(session)) {
        return res.status(403).json({ error: "Solo un usuario Administrador puede probar la configuración de Hacienda." });
      }
      const idCompania = session.idCompania;
      if (esCompaniaPlataforma(idCompania)) return res.status(403).json({ error: MENSAJE_PLATAFORMA_SIN_COMPROBANTES });
      const problemas: string[] = [];
      const avisos: string[] = [];
      let certificado: any = null;
      let idp: any = null;

      const company = await fetchCompanyById(idCompania);
      if (company) problemas.push(...problemasEmisor(company));

      const cert = await cargarCertificadoEmpresa(idCompania);
      if (!cert) {
        problemas.push("No hay certificado de firma (.p12) cargado.");
      } else {
        try {
          certificado = verificarLlaveP12(cert.p12Base64, cert.pin);
          if (certificado.expirado) problemas.push(`El certificado no está vigente (válido del ${certificado.validoDesde.slice(0, 10)} al ${certificado.validoHasta.slice(0, 10)}).`);
          const cedula = limpiarIdentificacion(company?.identificacion || "");
          if (cedula && !limpiarIdentificacion(certificado.sujeto).includes(cedula)) {
            avisos.push("El sujeto del certificado no parece contener la identificación de la empresa: confirme que el .p12 es de este emisor.");
          }
        } catch (err: any) {
          problemas.push(err.message);
        }
      }

      const credenciales = await cargarCredencialesAtv(idCompania);
      if (!credenciales) {
        problemas.push("Faltan el usuario y la contraseña ATV.");
      } else if (credenciales.ambiente === "PRUEBAS_LOCAL") {
        idp = { ok: false, omitido: true, ambiente: credenciales.ambiente, mensaje: "Ambiente de pruebas locales: no se inicia sesión en Hacienda." };
      } else {
        try {
          const p = await parametrosFacturacion();
          const endpoints = await endpointsHaciendaPara(credenciales.ambiente);
          const t = await obtenerTokenHaciendaConVigencia(endpoints, credenciales.usuarioAtv, credenciales.passwordAtv, p.fetchTimeoutMs);
          cacheTokens.guardar(claveCacheToken(idCompania, credenciales.ambiente, credenciales.usuarioAtv), t);
          idp = { ok: true, ambiente: credenciales.ambiente, expiraEnSeg: t.expiraEnSeg };
        } catch (err: any) {
          const detalle = err?.name === "TimeoutError" ? "tiempo de espera agotado" : err?.message || String(err);
          idp = { ok: false, ambiente: credenciales.ambiente, mensaje: detalle };
          problemas.push(`No se pudo iniciar sesión en Hacienda con el usuario ATV (${detalle}).`);
        }
      }

      const ok = problemas.length === 0 && !!idp?.ok;
      const verificadaEn = ok ? new Date() : null;
      if (dbConnected && pool) {
        await pool.query("INSERT IGNORE INTO compania_hacienda_config (id_compania) VALUES (?)", [idCompania]);
        await pool.query("UPDATE compania_hacienda_config SET config_verificada = ?, config_verificada_en = ? WHERE id_compania = ?", [ok ? 1 : 0, verificadaEn, idCompania]);
      } else {
        const cfg = configLocalHacienda(idCompania);
        cfg.configVerificada = ok;
        cfg.configVerificadaEn = verificadaEn ? verificadaEn.toISOString() : null;
      }
      res.json({ ok, problemas, avisos, certificado, idp, verificadaEn: verificadaEn ? verificadaEn.toISOString() : null });
    } catch (err: any) {
      res.status(err instanceof ParametroFaltanteError ? 503 : 500).json({ error: err.message });
    }
  });

  // CXC (Cuentas por Cobrar) — se crean automáticamente al facturar a crédito (ver
  // POST /api/facturas) y se revierten al anular esa factura (ver POST /api/facturas/:id/anular).
  // Esta ruta solo lista + aplica abonos; no hay creación manual porque en esta app una cuenta
  // por cobrar siempre nace de una factura real, nunca de un monto suelto.
  app.get("/api/cxc", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      if (dbConnected && pool) {
        // receptorNombre/receptorIdentificacion: el Contador no carga pacientes; solo esos dos campos, misma empresa.
        const [cuentas] = await pool.query("SELECT c.*, p.nombreCompleto AS receptorNombre, p.identificacion AS receptorIdentificacion FROM cuentas_cobrar c LEFT JOIN pacientes p ON p.id_paciente = c.idPaciente AND p.idCompania = c.idCompania WHERE c.idCompania = ? ORDER BY c.fechaEmision DESC", [idCompania]);
        const [pagos] = await pool.query("SELECT * FROM cxc_pagos WHERE idCompania = ? ORDER BY fecha ASC", [idCompania]);
        const pagosPorCuenta = new Map<number, any[]>();
        for (const p of pagos as any[]) {
          if (!pagosPorCuenta.has(p.idCuentaCobrar)) pagosPorCuenta.set(p.idCuentaCobrar, []);
          pagosPorCuenta.get(p.idCuentaCobrar)!.push(p);
        }
        res.json((cuentas as any[]).map(c => ({ ...c, pagos: pagosPorCuenta.get(c.id) || [] })));
      } else {
        res.json(localCuentasCobrar
          .filter(c => c.idCompania === idCompania)
          .map(c => {
            const pac = localPatients.find(p => p.id === c.idPaciente && p.idCompania === idCompania);
            return { ...c, receptorNombre: pac?.nombreCompleto ?? null, receptorIdentificacion: pac?.identificacion ?? null, pagos: localCxcPagos.filter(p => p.idCuentaCobrar === c.id) };
          }));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cxc/:id/pagos", requireAuth, async (req, res) => {
    try {
      const idCuentaCobrar = parseInt(req.params.id);
      const session = sessionOf(req);
      const monto = parseFloat(req.body.monto);
      const medioPago = String(req.body.medioPago || "01");
      const referencia = req.body.referencia ? String(req.body.referencia).slice(0, 150) : null;
      if (!Number.isFinite(monto) || monto <= 0) {
        return res.status(400).json({ error: "El monto del abono debe ser mayor a cero." });
      }

      if (dbConnected && pool) {
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          const [rows] = await connection.query("SELECT * FROM cuentas_cobrar WHERE id = ? AND idCompania = ? FOR UPDATE", [idCuentaCobrar, session.idCompania]);
          const cuenta = (rows as any[])[0];
          if (!cuenta) {
            await connection.rollback();
            return res.status(404).json({ error: "Cuenta por cobrar no encontrada." });
          }
          if (cuenta.estado !== "PENDIENTE") {
            await connection.rollback();
            return res.status(400).json({ error: `Esta cuenta ya está ${cuenta.estado === "PAGADA" ? "pagada" : "anulada"}.` });
          }
          if (monto > parseFloat(cuenta.saldoPendiente)) {
            await connection.rollback();
            return res.status(400).json({ error: `El abono (₡${monto}) no puede superar el saldo pendiente (₡${cuenta.saldoPendiente}).` });
          }

          const nuevoSaldo = Math.round((parseFloat(cuenta.saldoPendiente) - monto) * 100000) / 100000;
          const nuevoEstado = nuevoSaldo <= 0 ? "PAGADA" : "PENDIENTE";
          const fecha = fechaCR();

          await connection.query("UPDATE cuentas_cobrar SET saldoPendiente = ?, estado = ? WHERE id = ?", [nuevoSaldo, nuevoEstado, idCuentaCobrar]);
          const [result] = await connection.query(
            "INSERT INTO cxc_pagos (idCompania, idCuentaCobrar, fecha, monto, medioPago, referencia, registradoPor, creadoEn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [session.idCompania, idCuentaCobrar, fecha, monto, medioPago, referencia, null, new Date().toISOString()]
          );

          await connection.commit();
          res.json({ id: idCuentaCobrar, saldoPendiente: nuevoSaldo, estado: nuevoEstado, pago: { id: (result as any).insertId, fecha, monto, medioPago, referencia } });
        } catch (err) {
          await connection.rollback();
          throw err;
        } finally {
          connection.release();
        }
      } else {
        const cuenta = localCuentasCobrar.find(c => c.id === idCuentaCobrar && c.idCompania === session.idCompania);
        if (!cuenta) return res.status(404).json({ error: "Cuenta por cobrar no encontrada." });
        if (cuenta.estado !== "PENDIENTE") {
          return res.status(400).json({ error: `Esta cuenta ya está ${cuenta.estado === "PAGADA" ? "pagada" : "anulada"}.` });
        }
        if (monto > cuenta.saldoPendiente) {
          return res.status(400).json({ error: `El abono (₡${monto}) no puede superar el saldo pendiente (₡${cuenta.saldoPendiente}).` });
        }
        cuenta.saldoPendiente = Math.round((cuenta.saldoPendiente - monto) * 100000) / 100000;
        cuenta.estado = cuenta.saldoPendiente <= 0 ? "PAGADA" : "PENDIENTE";
        const fecha = fechaCR();
        const pago: PagoCuentaCobrar = {
          id: Math.max(0, ...localCxcPagos.map(p => p.id)) + 1,
          idCompania: session.idCompania,
          idCuentaCobrar,
          fecha,
          monto,
          medioPago,
          referencia,
          registradoPor: null,
          creadoEn: new Date().toISOString()
        };
        localCxcPagos.push(pago);
        res.json({ id: idCuentaCobrar, saldoPendiente: cuenta.saldoPendiente, estado: cuenta.estado, pago });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- CXP (Cuentas por Pagar) ---

  app.get("/api/proveedores", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM proveedores WHERE idCompania = ? ORDER BY nombre ASC", [idCompania]);
        res.json(rows);
      } else {
        res.json(localProveedores.filter(p => p.idCompania === idCompania));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/proveedores", requireAuth, async (req, res) => {
    try {
      const p = req.body;
      const idCompania = sessionOf(req).idCompania;
      if (!p.identificacion || !p.nombre) {
        return res.status(400).json({ error: "Indique identificación y nombre del proveedor." });
      }
      const problemaIdentificacion = errorIdentificacion(p.tipoIdentificacion || "02", String(p.identificacion));
      if (problemaIdentificacion) return res.status(400).json({ error: problemaIdentificacion });

      if (dbConnected && pool) {
        if (p.id) {
          const [exists] = await pool.query("SELECT id FROM proveedores WHERE id = ? AND idCompania = ?", [p.id, idCompania]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE proveedores SET tipoIdentificacion = ?, identificacion = ?, nombre = ?, correo = ?, telefono = ?, direccion = ?, activo = ? WHERE id = ? AND idCompania = ?",
              [p.tipoIdentificacion || "02", p.identificacion, p.nombre, p.correo || null, p.telefono || null, p.direccion || null, p.activo === false ? 0 : 1, p.id, idCompania]
            );
            return res.json({ ...p, idCompania });
          }
        }
        const [result] = await pool.query(
          "INSERT INTO proveedores (idCompania, tipoIdentificacion, identificacion, nombre, correo, telefono, direccion, activo, creadoEn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [idCompania, p.tipoIdentificacion || "02", p.identificacion, p.nombre, p.correo || null, p.telefono || null, p.direccion || null, p.activo === false ? 0 : 1, new Date().toISOString()]
        );
        res.json({ ...p, id: (result as any).insertId, idCompania });
      } else {
        if (p.id && localProveedores.some(item => item.id === p.id)) {
          localProveedores = localProveedores.map(item => item.id === p.id ? { ...p, idCompania } : item);
        } else {
          p.id = Math.max(0, ...localProveedores.map(item => item.id), 0) + 1;
          p.idCompania = idCompania;
          p.creadoEn = new Date().toISOString();
          localProveedores.push(p);
        }
        res.json(p);
      }
    } catch (err: any) {
      if (err.code === "ER_DUP_ENTRY") {
        return res.status(400).json({ error: "Ya existe un proveedor con esa identificación." });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/cxp", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      if (dbConnected && pool) {
        const [cuentas] = await pool.query("SELECT * FROM cuentas_pagar WHERE idCompania = ? ORDER BY fechaRegistro DESC", [idCompania]);
        const [pagos] = await pool.query("SELECT * FROM cxp_pagos WHERE idCompania = ? ORDER BY fecha ASC", [idCompania]);
        const pagosPorCuenta = new Map<number, any[]>();
        for (const p of pagos as any[]) {
          if (!pagosPorCuenta.has(p.idCuentaPagar)) pagosPorCuenta.set(p.idCuentaPagar, []);
          pagosPorCuenta.get(p.idCuentaPagar)!.push(p);
        }
        const lineasPorCuenta = await fetchLineasPorCuentaPagar((cuentas as any[]).map(c => c.id));
        res.json((cuentas as any[]).map(c => ({
          ...c,
          lineas: lineasPorCuenta.get(c.id) || [],
          pagos: pagosPorCuenta.get(c.id) || []
        })));
      } else {
        res.json(localCuentasPagar
          .filter(c => c.idCompania === idCompania)
          .map(c => ({ ...c, pagos: localCxpPagos.filter(p => p.idCuentaPagar === c.id) })));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Registra una cuenta por pagar. Dos modos: "monto global" (esServicio=true, un gasto sin
  // renglones — alquiler, planilla, honorarios) o "detallado" (esServicio=false, líneas de
  // artículos que SÍ alimentan inventario: incrementa stock, actualiza costoUnitario al costo de
  // esta compra, y registra el movimiento — misma transacción atómica que el descuento de stock
  // en POST /api/facturas, para no desincronizar inventario si dos compras concurrentes tocan el
  // mismo artículo).
  // Plazo de pago a proveedores configurado en la empresa (Personalizar › Parámetros contables).
  async function plazoProveedoresEmpresa(idCompania: number): Promise<number | null> {
    if (dbConnected && pool) {
      const [rows] = await pool.query("SELECT plazoCreditoProveedoresDias FROM companias WHERE id_compania = ?", [idCompania]);
      const v = (rows as any[])[0]?.plazoCreditoProveedoresDias;
      return v != null ? Number(v) : null;
    }
    return localCompanies.find(c => c.id === idCompania)?.plazoCreditoProveedoresDias ?? null;
  }

  app.post("/api/cxp", requireAuth, async (req, res) => {
    try {
      const body = req.body;
      const idCompania = sessionOf(req).idCompania;
      const idProveedor = parseInt(body.idProveedor);
      const esServicio = !!body.esServicio;
      // 0 = compra de contado (antes `|| 30` la convertía en 30 días de crédito)
      const plazoDias = body.plazoDias == null || body.plazoDias === "" ? await plazoProveedoresEmpresa(idCompania) : Number(body.plazoDias);
      if (!(Number.isInteger(plazoDias) && (plazoDias as number) >= 0)) {
        return res.status(400).json({ error: "Indique el plazo de crédito en días (0 si es de contado)." });
      }
      const numeroFacturaProveedor = body.numeroFacturaProveedor ? String(body.numeroFacturaProveedor).slice(0, 100) : null;
      const notas = body.notas ? String(body.notas).slice(0, 255) : null;
      const ivaAcreditable = body.ivaAcreditable != null ? parseFloat(body.ivaAcreditable) : 0;
      if (!Number.isFinite(ivaAcreditable) || ivaAcreditable < 0) {
        return res.status(400).json({ error: "El IVA acreditable debe ser un monto válido (0 o mayor)." });
      }

      let proveedor: Proveedor | undefined;
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM proveedores WHERE id = ? AND idCompania = ?", [idProveedor, idCompania]);
        proveedor = (rows as any[])[0];
      } else {
        proveedor = localProveedores.find(p => p.id === idProveedor && p.idCompania === idCompania);
      }
      if (!proveedor) return res.status(404).json({ error: "Proveedor no encontrado." });

      const fechaRegistro = fechaCR();
      const fechaVencimiento = sumarDiasCR(fechaRegistro, plazoDias);

      let lineasFinal: Array<{ idServicio: number; nombre: string; cantidad: number; costoUnitario: number }> = [];
      let montoTotal: number;
      let lineasBody: Array<{ idServicio: number; cantidad: number; costoUnitario: number }> = [];

      if (esServicio) {
        montoTotal = parseFloat(body.montoTotal);
        if (!Number.isFinite(montoTotal) || montoTotal <= 0) {
          return res.status(400).json({ error: "Indique un monto total válido." });
        }
        if (ivaAcreditable > montoTotal) {
          return res.status(400).json({ error: "El IVA acreditable no puede ser mayor que el monto total de la factura." });
        }
      } else {
        lineasBody = body.lineas || [];
        if (lineasBody.length === 0) {
          return res.status(400).json({ error: "Agregue al menos un artículo, o marque esta compra como un gasto sin inventario." });
        }
        montoTotal = 0;
        for (const l of lineasBody) {
          const cantidad = parseFloat(l.cantidad as any);
          const costoUnitario = parseFloat(l.costoUnitario as any);
          if (!Number.isFinite(cantidad) || cantidad <= 0 || !Number.isFinite(costoUnitario) || costoUnitario < 0) {
            return res.status(400).json({ error: "Cada línea necesita una cantidad y un costo unitario válidos." });
          }
          montoTotal += cantidad * costoUnitario;
        }
        // Lo que se le debe al proveedor es el costo (sin IVA) MÁS el IVA de su factura — igual que
        // una compra importada desde XML, cuyo total es el TotalComprobante. Antes la deuda quedaba
        // sin el IVA, y el D-101 (que deduce montoTotal − ivaAcreditable) no podía cuadrar.
        montoTotal = Math.round((montoTotal + ivaAcreditable) * 100000) / 100000;

        if (!dbConnected || !pool) {
          for (const l of lineasBody) {
            const idServicio = parseInt(l.idServicio as any);
            const cantidad = parseFloat(l.cantidad as any);
            const costoUnitario = parseFloat(l.costoUnitario as any);
            const servicio = localServicios.find(s => s.id === idServicio && s.idCompania === idCompania);
            if (!servicio) return res.status(400).json({ error: `Artículo ${idServicio} no encontrado.` });
            if (servicio.tipo !== "ARTICULO") return res.status(400).json({ error: `"${servicio.nombre}" es un servicio, no un artículo.` });
            servicio.stock = (servicio.stock || 0) + cantidad;
            servicio.costoUnitario = costoUnitario;
            lineasFinal.push({ idServicio, nombre: servicio.nombre, cantidad, costoUnitario });
          }
        }
      }

      const creadaEn = new Date().toISOString();

      if (dbConnected && pool) {
        // Existencias, movimientos de inventario, la cuenta por pagar y sus renglones van todos
        // en la misma transacción. Antes el inventario se confirmaba por separado y la CXP se
        // insertaba después, así que un fallo al guardarla dejaba el stock ya sumado sin ninguna
        // cuenta que lo respaldara.
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();

          for (const l of lineasBody) {
            const idServicio = parseInt(l.idServicio as any);
            const cantidad = parseFloat(l.cantidad as any);
            const costoUnitario = parseFloat(l.costoUnitario as any);
            const [rows] = await connection.query("SELECT * FROM servicios WHERE id_servicio = ? AND idCompania = ? FOR UPDATE", [idServicio, idCompania]);
            const servicio = (rows as any[]).map(row => normalizeRow(row, 'id_servicio'))[0];
            if (!servicio) {
              await connection.rollback();
              return res.status(400).json({ error: `Artículo ${idServicio} no encontrado.` });
            }
            if (servicio.tipo !== "ARTICULO") {
              await connection.rollback();
              return res.status(400).json({ error: `"${servicio.nombre}" es un servicio, no un artículo — no tiene existencias que alimentar.` });
            }
            const stockResultante = (servicio.stock || 0) + cantidad;
            await connection.query("UPDATE servicios SET stock = ?, costoUnitario = ? WHERE id_servicio = ?", [stockResultante, costoUnitario, idServicio]);
            await connection.query(
              "INSERT INTO movimientos_inventario (idCompania, idServicio, tipo, cantidad, stockResultante, referencia, notas, creadoPor, creadoEn) VALUES (?, ?, 'COMPRA', ?, ?, ?, ?, ?, ?)",
              [idCompania, idServicio, cantidad, stockResultante, `Compra a ${proveedor.nombre}${numeroFacturaProveedor ? ` (${numeroFacturaProveedor})` : ""}`, notas, null, creadaEn]
            );
            lineasFinal.push({ idServicio, nombre: servicio.nombre, cantidad, costoUnitario });
          }

          const [result] = await connection.query(
            "INSERT INTO cuentas_pagar (idCompania, idProveedor, numeroFacturaProveedor, esServicio, fechaRegistro, fechaVencimiento, plazoDias, montoTotal, saldoPendiente, estado, ivaAcreditable, notas, creadaEn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?, ?, ?)",
            [idCompania, idProveedor, numeroFacturaProveedor, esServicio ? 1 : 0, fechaRegistro, fechaVencimiento, plazoDias, montoTotal, montoTotal, ivaAcreditable, notas, creadaEn]
          );
          const idCuentaPagar = (result as any).insertId;
          await guardarLineasCuentaPagar(connection, idCuentaPagar, lineasFinal);

          await connection.commit();

          res.json({
            id: idCuentaPagar, idCompania, idProveedor, numeroFacturaProveedor, esServicio, lineas: lineasFinal,
            fechaRegistro, fechaVencimiento, plazoDias, montoTotal, saldoPendiente: montoTotal, estado: "PENDIENTE", ivaAcreditable, notas,
            creadaEn, pagos: []
          });
        } catch (err) {
          await connection.rollback();
          throw err;
        } finally {
          connection.release();
        }
      } else {
        const nueva: any = {
          id: Math.max(0, ...localCuentasPagar.map(c => c.id), 0) + 1,
          idCompania, idProveedor, numeroFacturaProveedor, esServicio, lineas: lineasFinal,
          fechaRegistro, fechaVencimiento, plazoDias, montoTotal, saldoPendiente: montoTotal, estado: "PENDIENTE", ivaAcreditable, notas,
          creadaEn: new Date().toISOString()
        };
        localCuentasPagar.push(nueva);
        res.json({ ...nueva, pagos: [] });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/cxp/:id/pagos", requireAuth, async (req, res) => {
    try {
      const idCuentaPagar = parseInt(req.params.id);
      const session = sessionOf(req);
      const monto = parseFloat(req.body.monto);
      const medioPago = String(req.body.medioPago || "03");
      const referencia = req.body.referencia ? String(req.body.referencia).slice(0, 150) : null;
      if (!Number.isFinite(monto) || monto <= 0) {
        return res.status(400).json({ error: "El monto del abono debe ser mayor a cero." });
      }

      if (dbConnected && pool) {
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          const [rows] = await connection.query("SELECT * FROM cuentas_pagar WHERE id = ? AND idCompania = ? FOR UPDATE", [idCuentaPagar, session.idCompania]);
          const cuenta = (rows as any[])[0];
          if (!cuenta) {
            await connection.rollback();
            return res.status(404).json({ error: "Cuenta por pagar no encontrada." });
          }
          if (cuenta.estado !== "PENDIENTE") {
            await connection.rollback();
            return res.status(400).json({ error: `Esta cuenta ya está ${cuenta.estado === "PAGADA" ? "pagada" : "anulada"}.` });
          }
          if (monto > parseFloat(cuenta.saldoPendiente)) {
            await connection.rollback();
            return res.status(400).json({ error: `El abono (₡${monto}) no puede superar el saldo pendiente (₡${cuenta.saldoPendiente}).` });
          }

          const nuevoSaldo = Math.round((parseFloat(cuenta.saldoPendiente) - monto) * 100000) / 100000;
          const nuevoEstado = nuevoSaldo <= 0 ? "PAGADA" : "PENDIENTE";
          const fecha = fechaCR();

          await connection.query("UPDATE cuentas_pagar SET saldoPendiente = ?, estado = ? WHERE id = ?", [nuevoSaldo, nuevoEstado, idCuentaPagar]);
          const [result] = await connection.query(
            "INSERT INTO cxp_pagos (idCompania, idCuentaPagar, fecha, monto, medioPago, referencia, registradoPor, creadoEn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [session.idCompania, idCuentaPagar, fecha, monto, medioPago, referencia, null, new Date().toISOString()]
          );

          await connection.commit();
          res.json({ id: idCuentaPagar, saldoPendiente: nuevoSaldo, estado: nuevoEstado, pago: { id: (result as any).insertId, fecha, monto, medioPago, referencia } });
        } catch (err) {
          await connection.rollback();
          throw err;
        } finally {
          connection.release();
        }
      } else {
        const cuenta = localCuentasPagar.find(c => c.id === idCuentaPagar && c.idCompania === session.idCompania);
        if (!cuenta) return res.status(404).json({ error: "Cuenta por pagar no encontrada." });
        if (cuenta.estado !== "PENDIENTE") {
          return res.status(400).json({ error: `Esta cuenta ya está ${cuenta.estado === "PAGADA" ? "pagada" : "anulada"}.` });
        }
        if (monto > cuenta.saldoPendiente) {
          return res.status(400).json({ error: `El abono (₡${monto}) no puede superar el saldo pendiente (₡${cuenta.saldoPendiente}).` });
        }
        cuenta.saldoPendiente = Math.round((cuenta.saldoPendiente - monto) * 100000) / 100000;
        cuenta.estado = cuenta.saldoPendiente <= 0 ? "PAGADA" : "PENDIENTE";
        const fecha = fechaCR();
        const pago: PagoCuentaPagar = {
          id: Math.max(0, ...localCxpPagos.map(p => p.id), 0) + 1,
          idCompania: session.idCompania,
          idCuentaPagar,
          fecha,
          monto,
          medioPago,
          referencia,
          registradoPor: null,
          creadoEn: new Date().toISOString()
        };
        localCxpPagos.push(pago);
        res.json({ id: idCuentaPagar, saldoPendiente: cuenta.saldoPendiente, estado: cuenta.estado, pago });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Importa una compra directamente desde el XML de Factura/Tiquete Electrónico que entrega el
  // proveedor: matchea/crea el proveedor por identificación, y — si `alimentaInventario` — crea o
  // actualiza artículos incrementando stock, o si no, la registra como compra de servicios sin
  // tocar inventario. El IVA real de la factura (ver server/xmlProveedorParser.ts) completa
  // `ivaAcreditable` (crédito fiscal del D-104) en vez de pedírselo al usuario a mano.
  //
  // Todo —proveedor nuevo, inventario, cuenta por pagar y pago de contado— va en UNA transacción.
  // Antes el inventario se confirmaba aparte, y un fallo al guardar la CxP dejaba el stock sumado
  // sin ninguna cuenta que lo respaldara.
  app.post("/api/cxp/importar-xml", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      const xmlTexto = String(req.body.xmlTexto || "");
      const alimentaInventario = !!req.body.alimentaInventario;
      if (!xmlTexto.trim()) return res.status(400).json({ error: "No se recibió contenido de XML." });

      let parsed;
      try {
        parsed = parsearFacturaProveedorXML(xmlTexto);
      } catch (err: any) {
        return res.status(400).json({ error: err.message || "No se pudo leer el archivo XML." });
      }

      const redondear = redondearMonto;
      // Recortadas una sola vez a lo que admiten las columnas (servicios.nombre /
      // cuentas_pagar_lineas.nombre VARCHAR(150), servicios.codigoBarras VARCHAR(50)), para que la
      // ruta con BD y la de memoria guarden exactamente lo mismo.
      const lineasXml = parsed.lineas.map(l => ({
        ...l,
        nombre: l.nombre.slice(0, 150),
        codigoComercial: l.codigoComercial ? l.codigoComercial.slice(0, 50) : null
      }));
      const numeroFacturaProveedor = (parsed.numeroFacturaProv || "").slice(0, 100) || null;
      const fechaRegistro = parsed.fechaEmision ? parsed.fechaEmision.slice(0, 10) : fechaCR();
      const esContado = parsed.condicionVenta === "01";
      // Si el XML de crédito no trae <PlazoCredito>, se usa el plazo de proveedores de la empresa.
      const plazoDias = esContado ? 0 : Math.max(1, parsed.plazoDias || (await plazoProveedoresEmpresa(idCompania)) || 1);
      const fechaVencimiento = sumarDiasCR(fechaRegistro, plazoDias);
      const montoTotal = redondear(parsed.montoTotal);
      // Crédito fiscal (D-104): solo lo da una Factura Electrónica emitida a nombre de esta empresa.
      // Un Tiquete, o una factura a otra cédula, no lo da — su IVA es parte del costo (y entonces el
      // D-101 lo deduce entero, porque deduce montoTotal − ivaAcreditable).
      const empresa = await fetchCompanyById(idCompania);
      const cedulaEmpresa = empresa ? limpiarIdentificacion(empresa.identificacion) : "";
      const motivoSinCredito = parsed.tipoComprobante === "04"
        ? "es un Tiquete Electrónico"
        : parsed.receptorIdentificacion !== cedulaEmpresa
          ? `la factura está a nombre de ${parsed.receptorIdentificacion ? `la cédula ${parsed.receptorIdentificacion}` : "nadie (sin receptor)"}, no de la empresa`
          : null;
      const ivaAcreditable = motivoSinCredito ? 0 : redondear(lineasXml.reduce((sum, l) => sum + l.montoIva, 0));
      const avisoCreditoFiscal = motivoSinCredito ? `Sin crédito fiscal: ${motivoSinCredito}. Su IVA queda como parte del costo.` : null;
      const notas = [
        parsed.moneda !== "CRC" ? `Importada desde XML (${parsed.moneda}, tipo de cambio ${parsed.tipoCambio})` : "Importada desde XML",
        avisoCreditoFiscal
      ].filter(Boolean).join(". ").slice(0, 255);
      const creadaEn = new Date().toISOString();
      const UNIDADES_VALIDAS = new Set(["Sp", "Spe", "St", "Os", "h", "Unid"]);
      const esDelProveedor = (p: Proveedor) => p.identificacion.replace(/[^0-9]/g, "") === parsed.proveedor.identificacion;
      // Costo efectivo: la base después del descuento entre la cantidad (no el precio de lista).
      const costoDe = (linea: typeof lineasXml[number]) => redondear(linea.subtotal / linea.cantidad);
      const normalizarNombre = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

      // El artículo que corresponde a una línea del XML. Por código comercial primero; sin él, por
      // CABYS + misma descripción. Antes era solo por CABYS, que es la categoría tributaria y NO es
      // único por producto: dos artículos distintos con el mismo CABYS (dos medicamentos, dos tipos
      // de guante) terminaban fusionados en uno solo con el stock de ambos. El código comercial suele
      // ser el SKU interno del proveedor ("100", "001"), que se repite entre proveedores, así que
      // también se exige el mismo CABYS para no fusionar productos de proveedores distintos.
      const buscarArticulo = (articulos: any[], linea: typeof lineasXml[number]) => {
        if (linea.codigoComercial) {
          const porCodigo = articulos.find(a => a.codigoBarras && a.codigoBarras === linea.codigoComercial && a.codigoCabys === linea.codigoCabys);
          if (porCodigo) return porCodigo;
        }
        return articulos.find(a => a.codigoCabys === linea.codigoCabys && normalizarNombre(a.nombre || "") === normalizarNombre(linea.nombre));
      };
      const mensajeDuplicada = (proveedorNombre: string, total: number) =>
        `La factura ${numeroFacturaProveedor} de ${proveedorNombre} ya está registrada como cuenta por pagar (₡${Number(total).toLocaleString("es-CR")}). No se importó de nuevo para no duplicar el inventario ni la deuda.`;

      let proveedor: Proveedor | undefined;
      const lineasFinal: Array<{ idServicio: number; nombre: string; cantidad: number; costoUnitario: number }> = [];
      let cxpCreada: CuentaPagar;

      if (dbConnected && pool) {
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();

          // 1. Proveedor por identificación (dentro de esta empresa). Se bloquea su fila para que dos
          // importaciones simultáneas del mismo XML no pasen las dos el chequeo de duplicado.
          const [provRows] = await connection.query("SELECT * FROM proveedores WHERE idCompania = ?", [idCompania]);
          proveedor = (provRows as Proveedor[]).find(esDelProveedor);
          if (proveedor) {
            await connection.query("SELECT id FROM proveedores WHERE id = ? FOR UPDATE", [proveedor.id]);
            // 2. ¿Ya está registrada? La misma factura puede llegar dos veces o haberse tecleado a
            // mano antes; importarla otra vez sumaría el stock, la deuda y el IVA acreditable de nuevo.
            // Lectura con FOR UPDATE a propósito: en REPEATABLE READ una lectura normal ve la foto
            // tomada al inicio de la transacción, así que la segunda de dos importaciones simultáneas
            // no vería la cuenta que la primera acaba de confirmar y la duplicaría.
            if (numeroFacturaProveedor) {
              const [dup] = await connection.query(
                "SELECT montoTotal FROM cuentas_pagar WHERE idCompania = ? AND idProveedor = ? AND numeroFacturaProveedor = ? AND estado != 'ANULADA' LIMIT 1 FOR UPDATE",
                [idCompania, proveedor.id, numeroFacturaProveedor]
              );
              if ((dup as any[]).length > 0) {
                await connection.rollback();
                return res.status(409).json({ error: mensajeDuplicada(proveedor.nombre, (dup as any[])[0].montoTotal) });
              }
            }
          } else {
            const [result] = await connection.query(
              "INSERT INTO proveedores (idCompania, tipoIdentificacion, identificacion, nombre, correo, telefono, direccion, activo, creadoEn) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)",
              [idCompania, parsed.proveedor.tipoIdentificacion, parsed.proveedor.identificacion, parsed.proveedor.nombre, parsed.proveedor.correo, parsed.proveedor.telefono, parsed.proveedor.direccion, creadaEn]
            );
            proveedor = { id: (result as any).insertId, idCompania, tipoIdentificacion: parsed.proveedor.tipoIdentificacion, identificacion: parsed.proveedor.identificacion, nombre: parsed.proveedor.nombre, correo: parsed.proveedor.correo, telefono: parsed.proveedor.telefono, direccion: parsed.proveedor.direccion, activo: true, creadoEn: creadaEn };
          }

          // 3. Inventario: crear/actualizar artículos e incrementar stock.
          if (alimentaInventario) {
            const [servRows] = await connection.query("SELECT * FROM servicios WHERE idCompania = ? AND tipo = 'ARTICULO' FOR UPDATE", [idCompania]);
            const articulos = (servRows as any[]).map(row => normalizeRow(row, 'id_servicio'));
            for (const linea of lineasXml) {
              const costo = costoDe(linea);
              const existente = buscarArticulo(articulos, linea);
              let idServicio: number;
              let stockResultante: number;
              if (existente) {
                idServicio = existente.id;
                stockResultante = (Number(existente.stock) || 0) + linea.cantidad;
                existente.stock = stockResultante;
                await connection.query("UPDATE servicios SET stock = ?, costoUnitario = ? WHERE id_servicio = ?", [stockResultante, costo, idServicio]);
              } else {
                const unidadMedida = UNIDADES_VALIDAS.has(linea.unidadMedida) ? linea.unidadMedida : "Unid";
                const [result] = await connection.query(
                  "INSERT INTO servicios (idCompania, nombre, precio, porcentajeIva, duracionMinutos, codigoCabys, unidadMedida, activo, tipo, stock, stockMinimo, costoUnitario, codigoBarras) VALUES (?, ?, ?, ?, 0, ?, ?, 1, 'ARTICULO', ?, 0, ?, ?)",
                  [idCompania, linea.nombre, costo, linea.porcentajeIva, linea.codigoCabys, unidadMedida, linea.cantidad, costo, linea.codigoComercial]
                );
                idServicio = (result as any).insertId;
                stockResultante = linea.cantidad;
                // Una segunda línea del mismo artículo en este mismo XML lo encuentra en vez de duplicarlo.
                articulos.push({ id: idServicio, nombre: linea.nombre, codigoCabys: linea.codigoCabys, codigoBarras: linea.codigoComercial, stock: stockResultante });
              }
              await connection.query(
                "INSERT INTO movimientos_inventario (idCompania, idServicio, tipo, cantidad, stockResultante, referencia, notas, creadoPor, creadoEn) VALUES (?, ?, 'COMPRA', ?, ?, ?, ?, ?, ?)",
                [idCompania, idServicio, linea.cantidad, stockResultante, `Importado de XML — Factura proveedor ${numeroFacturaProveedor || ""}`, null, null, creadaEn]
              );
              lineasFinal.push({ idServicio, nombre: linea.nombre, cantidad: linea.cantidad, costoUnitario: costo });
            }
          }

          // 4. La cuenta por pagar — ya Pagada si la venta fue de contado (para no perder el
          // historial de compras), Pendiente con el plazo indicado si fue a crédito.
          const [result] = await connection.query(
            "INSERT INTO cuentas_pagar (idCompania, idProveedor, numeroFacturaProveedor, esServicio, fechaRegistro, fechaVencimiento, plazoDias, montoTotal, saldoPendiente, estado, ivaAcreditable, notas, creadaEn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [idCompania, proveedor.id, numeroFacturaProveedor, alimentaInventario ? 0 : 1, fechaRegistro, fechaVencimiento, plazoDias, montoTotal, esContado ? 0 : montoTotal, esContado ? "PAGADA" : "PENDIENTE", ivaAcreditable, notas, creadaEn]
          );
          const idCuentaPagar = (result as any).insertId;
          await guardarLineasCuentaPagar(connection, idCuentaPagar, lineasFinal);

          const pagos: PagoCuentaPagar[] = [];
          if (esContado) {
            const [pagoResult] = await connection.query(
              "INSERT INTO cxp_pagos (idCompania, idCuentaPagar, fecha, monto, medioPago, referencia, registradoPor, creadoEn) VALUES (?, ?, ?, ?, '01', NULL, NULL, ?)",
              [idCompania, idCuentaPagar, fechaRegistro, montoTotal, creadaEn]
            );
            pagos.push({ id: (pagoResult as any).insertId, idCompania, idCuentaPagar, fecha: fechaRegistro, monto: montoTotal, medioPago: "01", referencia: null, registradoPor: null, creadoEn: creadaEn });
          }
          await connection.commit();

          cxpCreada = {
            id: idCuentaPagar, idCompania, idProveedor: proveedor.id, numeroFacturaProveedor, esServicio: !alimentaInventario, lineas: lineasFinal,
            fechaRegistro, fechaVencimiento, plazoDias, montoTotal, saldoPendiente: esContado ? 0 : montoTotal, estado: esContado ? "PAGADA" : "PENDIENTE",
            ivaAcreditable, notas, creadaEn, pagos
          };
        } catch (err: any) {
          await connection.rollback();
          if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ error: "Otro usuario registró este proveedor al mismo tiempo. Vuelva a importar el archivo." });
          }
          throw err;
        } finally {
          connection.release();
        }
      } else {
        proveedor = localProveedores.find(p => p.idCompania === idCompania && esDelProveedor(p));
        if (proveedor && numeroFacturaProveedor) {
          const dup = localCuentasPagar.find(c => c.idCompania === idCompania && c.idProveedor === proveedor!.id && c.numeroFacturaProveedor === numeroFacturaProveedor && c.estado !== "ANULADA");
          if (dup) return res.status(409).json({ error: mensajeDuplicada(proveedor.nombre, dup.montoTotal) });
        }
        if (!proveedor) {
          proveedor = {
            id: Math.max(0, ...localProveedores.map(p => p.id), 0) + 1, idCompania,
            tipoIdentificacion: parsed.proveedor.tipoIdentificacion, identificacion: parsed.proveedor.identificacion, nombre: parsed.proveedor.nombre,
            correo: parsed.proveedor.correo, telefono: parsed.proveedor.telefono, direccion: parsed.proveedor.direccion, activo: true, creadoEn: creadaEn
          };
          localProveedores.push(proveedor);
        }
        if (alimentaInventario) {
          const articulos = localServicios.filter(s => s.idCompania === idCompania && s.tipo === "ARTICULO");
          for (const linea of lineasXml) {
            const costo = costoDe(linea);
            const existente: any = buscarArticulo(articulos, linea);
            if (existente) {
              existente.stock = (existente.stock || 0) + linea.cantidad;
              existente.costoUnitario = costo;
              lineasFinal.push({ idServicio: existente.id, nombre: linea.nombre, cantidad: linea.cantidad, costoUnitario: costo });
            } else {
              const nuevo: any = {
                id: Math.max(0, ...localServicios.map(s => s.id), 0) + 1, idCompania, nombre: linea.nombre, precio: costo,
                porcentajeIva: linea.porcentajeIva, duracionMinutos: 0, codigoCabys: linea.codigoCabys,
                unidadMedida: UNIDADES_VALIDAS.has(linea.unidadMedida) ? linea.unidadMedida : "Unid",
                activo: true, tipo: "ARTICULO", stock: linea.cantidad, stockMinimo: 0, costoUnitario: costo, codigoBarras: linea.codigoComercial
              };
              localServicios.push(nuevo);
              articulos.push(nuevo);
              lineasFinal.push({ idServicio: nuevo.id, nombre: nuevo.nombre, cantidad: linea.cantidad, costoUnitario: costo });
            }
          }
        }
        const nueva: any = {
          id: Math.max(0, ...localCuentasPagar.map(c => c.id), 0) + 1, idCompania, idProveedor: proveedor.id, numeroFacturaProveedor,
          esServicio: !alimentaInventario, lineas: lineasFinal, fechaRegistro, fechaVencimiento, plazoDias, montoTotal,
          saldoPendiente: esContado ? 0 : montoTotal, estado: esContado ? "PAGADA" : "PENDIENTE", ivaAcreditable, notas, creadaEn
        };
        localCuentasPagar.push(nueva);
        const pagos: PagoCuentaPagar[] = [];
        if (esContado) {
          const pago: PagoCuentaPagar = { id: Math.max(0, ...localCxpPagos.map(p => p.id), 0) + 1, idCompania, idCuentaPagar: nueva.id, fecha: fechaRegistro, monto: montoTotal, medioPago: "01", referencia: null, registradoPor: null, creadoEn: creadaEn };
          localCxpPagos.push(pago);
          pagos.push(pago);
        }
        cxpCreada = { ...nueva, pagos };
      }

      res.json({ cxp: cxpCreada, proveedor, articulosAfectados: lineasFinal.length, avisoCreditoFiscal });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5b. Reportes Fiscales D-104 (IVA mensual) / D-101 (Renta anual)

  // Qué facturas existen ante Hacienda: las ACEPTADAS, y las ANULADAS que Hacienda sí había aceptado
  // — esas cuentan como venta y su Nota de Crédito la resta por separado en su propio período. Una
  // factura ANULADA sin ninguna Nota de Crédito que la referencie se anuló localmente porque Hacienda
  // nunca la aceptó (ver POST /api/facturas/:id/anular): declararla sería declarar una venta que
  // fiscalmente no existe, sin nada que la compense.
  // Además, solo cuenta lo emitido en PRODUCCIÓN (filtro aparte en cada consulta): lo de SANDBOX son
  // pruebas sin efecto fiscal y antes se sumaba a la declaración.
  const SQL_FACTURA_DECLARABLE = "(f.estado = 'ACEPTADA' OR (f.estado = 'ANULADA' AND EXISTS (SELECT 1 FROM facturas nc WHERE nc.idCompania = f.idCompania AND nc.idFacturaReferencia = f.id_factura AND nc.tipoDocumento = '03')))";
  const esFacturaDeclarableLocal = (f: Factura) =>
    f.estado === "ACEPTADA" || (f.estado === "ANULADA" && localFacturas.some(nc => nc.idFacturaReferencia === f.id && nc.tipoDocumento === "03"));

  // Comprobantes de PRODUCCIÓN del período que Hacienda todavía no resolvió (ENVIADA, o ERROR que
  // pudo haberle llegado). Si se cierra así, uno que después quede aceptado nunca se declara en su
  // período; por eso el cierre los muestra y pide confirmación explícita.
  async function comprobantesSinResolver(idCompania: number, prefijoPeriodo: string): Promise<Array<{ consecutivo: string; tipoDocumento: string; estado: string }>> {
    if (dbConnected && pool) {
      const [rows] = await pool.query(
        "SELECT consecutivo, tipoDocumento, estado FROM facturas WHERE idCompania = ? AND ambiente = 'PRODUCCION' AND fechaEmision LIKE ? AND estado IN ('PENDIENTE', 'ENVIADA', 'ERROR', 'FIRMADA') ORDER BY fechaEmision",
        [idCompania, `${prefijoPeriodo}%`]
      );
      return rows as any[];
    }
    return localFacturas
      .filter(f => f.idCompania === idCompania && f.ambiente === "PRODUCCION" && f.fechaEmision.startsWith(prefijoPeriodo) && ["ENVIADA", "ERROR", "FIRMADA"].includes(f.estado))
      .map(f => ({ consecutivo: f.consecutivo, tipoDocumento: f.tipoDocumento, estado: f.estado }));
  }

  function mensajePendientesCierre(pendientes: Array<{ consecutivo: string; estado: string }>): string {
    return `Hay ${pendientes.length} comprobante(s) del período que Hacienda todavía no resolvió (${pendientes.slice(0, 5).map(p => `${p.consecutivo} ${p.estado}`).join(", ")}${pendientes.length > 5 ? "…" : ""}). Verifique su estado antes de cerrar: si alguno queda aceptado después del cierre, no se habrá declarado.`;
  }

  async function obtenerDatosD104(idCompania: number, periodo: string) {
    if (dbConnected && pool) {
      const [companyRows] = await pool.query("SELECT * FROM companias WHERE id_compania = ?", [idCompania]);
      const company: Company | undefined = (companyRows as any[]).map(row => normalizeRow(row, 'id_compania'))[0];
      if (!company) return null;

      const [facturaRows] = await pool.query(
        `SELECT f.id_factura FROM facturas f WHERE f.idCompania = ? AND f.tipoDocumento IN ('01', '04') AND f.fechaEmision LIKE ? AND f.ambiente = 'PRODUCCION' AND ${SQL_FACTURA_DECLARABLE}`,
        [idCompania, `${periodo}%`]
      );
      const [ncRows] = await pool.query(
        "SELECT id_factura FROM facturas WHERE idCompania = ? AND tipoDocumento = '03' AND fechaEmision LIKE ? AND ambiente = 'PRODUCCION' AND estado = 'ACEPTADA'",
        [idCompania, `${periodo}%`]
      );
      // Nota de Débito: no hay flujo de anulación para ella (a diferencia de la factura, que
      // puede quedar ANULADA y seguir contando en D-104 porque la Nota de Crédito ya la neteó) —
      // solo se declara cuando Hacienda la aceptó.
      const [ndRows] = await pool.query(
        "SELECT id_factura FROM facturas WHERE idCompania = ? AND tipoDocumento = '02' AND fechaEmision LIKE ? AND ambiente = 'PRODUCCION' AND estado = 'ACEPTADA'",
        [idCompania, `${periodo}%`]
      );
      const idsFacturaYNotas = [...(facturaRows as any[]).map(r => r.id_factura), ...(ncRows as any[]).map(r => r.id_factura), ...(ndRows as any[]).map(r => r.id_factura)];
      const lineasPorFactura = await fetchLineasPorFactura(idsFacturaYNotas);
      const facturasMes = (facturaRows as any[]).map(r => ({ ...r, lineas: lineasPorFactura.get(r.id_factura) || [] }));
      const notasCreditoMes = (ncRows as any[]).map(r => ({ ...r, lineas: lineasPorFactura.get(r.id_factura) || [] }));
      const notasDebitoMes = (ndRows as any[]).map(r => ({ ...r, lineas: lineasPorFactura.get(r.id_factura) || [] }));

      const [cxpRows] = await pool.query(
        "SELECT COALESCE(SUM(ivaAcreditable), 0) AS total FROM cuentas_pagar WHERE idCompania = ? AND fechaRegistro LIKE ? AND estado != 'ANULADA'",
        [idCompania, `${periodo}%`]
      );
      const creditoFiscal = Number((cxpRows as any[])[0]?.total) || 0;

      const [cierreRows] = await pool.query("SELECT * FROM cierres_fiscales WHERE idCompania = ? AND tipo = 'D104' AND periodo = ?", [idCompania, periodo]);
      const cierre = (cierreRows as any[])[0];

      return { company, facturasMes, notasCreditoMes, notasDebitoMes, creditoFiscal, yaCerrado: !!cierre, fechaCierre: cierre ? cierre.creadoEn : null };
    } else {
      const company = localCompanies.find(c => c.id === idCompania);
      if (!company) return null;
      const facturasMes = localFacturas.filter(f => f.idCompania === idCompania && (f.tipoDocumento === "01" || f.tipoDocumento === "04") && f.fechaEmision.startsWith(periodo) && f.ambiente === "PRODUCCION" && esFacturaDeclarableLocal(f));
      const notasCreditoMes = localFacturas.filter(f => f.idCompania === idCompania && f.tipoDocumento === "03" && f.fechaEmision.startsWith(periodo) && f.ambiente === "PRODUCCION" && f.estado === "ACEPTADA");
      const notasDebitoMes = localFacturas.filter(f => f.idCompania === idCompania && f.tipoDocumento === "02" && f.fechaEmision.startsWith(periodo) && f.ambiente === "PRODUCCION" && f.estado === "ACEPTADA");
      const creditoFiscal = localCuentasPagar.filter(c => c.idCompania === idCompania && c.fechaRegistro.startsWith(periodo) && c.estado !== "ANULADA").reduce((s, c) => s + (c.ivaAcreditable || 0), 0);
      const cierre = localCierresFiscales.find(c => c.idCompania === idCompania && c.tipo === "D104" && c.periodo === periodo);
      return { company, facturasMes, notasCreditoMes, notasDebitoMes, creditoFiscal, yaCerrado: !!cierre, fechaCierre: cierre ? cierre.creadoEn : null };
    }
  }

  app.get("/api/reportes/clientes-sesiones", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      const desde = String(req.query.desde || "");
      const hasta = String(req.query.hasta || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
        return res.status(400).json({ error: "Parámetros desde/hasta inválidos. Use el formato YYYY-MM-DD." });
      }
      let citas: Array<{ idPaciente: number; fechaHora: string; estadoCita: string }>;
      let consultas: Array<{ idPaciente: number; fecha: string; estado?: string }>;
      let pacientes: Array<{ id: number; nombreCompleto: string }>;
      if (dbConnected && pool) {
        const [citasRows] = await pool.query("SELECT idPaciente, fechaHora, estadoCita FROM citas WHERE idCompania = ?", [idCompania]);
        citas = (citasRows as any[]).map(row => normalizeRow(row, 'id'));
        const [consultasRows] = await pool.query("SELECT idPaciente, fecha, estadoConsulta FROM consultas WHERE idCompania = ? AND activo = 1", [idCompania]);
        consultas = (consultasRows as any[]).map(row => normalizeRow(row, 'id_consulta')).map(c => ({ idPaciente: c.idPaciente, fecha: c.fecha, estado: c.estadoConsulta }));
        const [pacientesRows] = await pool.query("SELECT id_paciente, nombreCompleto FROM pacientes WHERE idCompania = ? AND activo = 1", [idCompania]);
        pacientes = (pacientesRows as any[]).map(row => normalizeRow(row, 'id_paciente')).map(p => ({ id: p.id, nombreCompleto: p.nombreCompleto }));
      } else {
        citas = localCitas.filter(c => c.idCompania === idCompania).map(c => ({ idPaciente: c.idPaciente, fechaHora: c.fechaHora, estadoCita: c.estadoCita }));
        consultas = localConsultations.filter(c => c.idCompania === idCompania && c.activo !== false).map(c => ({ idPaciente: c.idPaciente, fecha: c.fecha, estado: c.estado }));
        pacientes = localPatients.filter(p => p.idCompania === idCompania && p.activo !== false).map(p => ({ id: p.id, nombreCompleto: p.nombreCompleto }));
      }
      res.json(construirReporteClientesSesiones(desde, hasta, citas, consultas, pacientes));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/reportes/d104", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      const periodo = String(req.query.periodo || "");
      if (!/^\d{4}-\d{2}$/.test(periodo)) return res.status(400).json({ error: "Periodo inválido. Use el formato YYYY-MM." });
      const datos = await obtenerDatosD104(idCompania, periodo);
      if (!datos) return res.status(404).json({ error: "Empresa no encontrada." });
      res.json(construirReporteD104(periodo, datos.company, datos.facturasMes, datos.notasCreditoMes, datos.notasDebitoMes, datos.creditoFiscal, datos.yaCerrado, datos.fechaCierre));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/reportes/d104/cerrar", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      const periodo = String(req.body.periodo || "");
      if (!/^\d{4}-\d{2}$/.test(periodo)) return res.status(400).json({ error: "Periodo inválido. Use el formato YYYY-MM." });
      const datos = await obtenerDatosD104(idCompania, periodo);
      if (!datos) return res.status(404).json({ error: "Empresa no encontrada." });
      if (datos.yaCerrado) return res.status(409).json({ error: `Ya existe un cierre D-104 para el período ${periodo}.` });
      const pendientesD104 = await comprobantesSinResolver(idCompania, periodo);
      if (pendientesD104.length > 0 && req.body.confirmarPendientes !== true) {
        return res.status(409).json({ error: mensajePendientesCierre(pendientesD104), pendientes: pendientesD104 });
      }

      const creadoEn = new Date().toISOString();
      const reporte = { ...construirReporteD104(periodo, datos.company, datos.facturasMes, datos.notasCreditoMes, datos.notasDebitoMes, datos.creditoFiscal, true, creadoEn) };

      if (dbConnected && pool) {
        try {
          await pool.query(
            "INSERT INTO cierres_fiscales (idCompania, tipo, periodo, datos, creadoPor, creadoEn) VALUES (?, 'D104', ?, ?, NULL, ?)",
            [idCompania, periodo, JSON.stringify(reporte), creadoEn]
          );
        } catch (err: any) {
          if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: `Ya existe un cierre D-104 para el período ${periodo}.` });
          throw err;
        }
      } else {
        if (localCierresFiscales.some(c => c.idCompania === idCompania && c.tipo === "D104" && c.periodo === periodo)) {
          return res.status(409).json({ error: `Ya existe un cierre D-104 para el período ${periodo}.` });
        }
        localCierresFiscales.push({ id: Math.max(0, ...localCierresFiscales.map(c => c.id), 0) + 1, idCompania, tipo: "D104", periodo, datos: reporte, creadoPor: null, creadoEn });
      }

      res.json(reporte);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  const filaAParametrosRenta = (r: any): ParametrosRenta => ({
    anio: Number(r.anio),
    escalaFisica: typeof r.escalaFisica === "string" ? JSON.parse(r.escalaFisica) : r.escalaFisica,
    escalaJuridica: typeof r.escalaJuridica === "string" ? JSON.parse(r.escalaJuridica) : r.escalaJuridica,
    topeIngresosEscalaReducida: Number(r.topeIngresosEscalaReducida),
    tarifaGeneralJuridica: Number(r.tarifaGeneralJuridica),
    referenciaLegal: r.referenciaLegal || "",
    actualizadoEn: r.actualizadoEn || null
  });

  // Tramos del período pedido; si Hacienda aún no publicó (o nadie registró) los de ese año, los del
  // período más reciente anterior — el D-101 lo advierte. Sin ninguno registrado devuelve null.
  async function obtenerParametrosRenta(anio: number): Promise<ParametrosRenta | null> {
    if (dbConnected && pool) {
      const [rows] = await pool.query(
        "SELECT * FROM parametros_renta ORDER BY (anio <= ?) DESC, ABS(anio - ?) ASC LIMIT 1",
        [anio, anio]
      );
      const fila = (rows as any[])[0];
      return fila ? filaAParametrosRenta(fila) : null;
    }
    const ordenados = [...localParametrosRenta].sort((a, b) => Number(b.anio <= anio) - Number(a.anio <= anio) || Math.abs(a.anio - anio) - Math.abs(b.anio - anio));
    return ordenados[0] || null;
  }

  app.get("/api/parametros-renta", requireAuth, async (_req, res) => {
    try {
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM parametros_renta ORDER BY anio DESC");
        return res.json((rows as any[]).map(filaAParametrosRenta));
      }
      res.json([...localParametrosRenta].sort((a, b) => b.anio - a.anio));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Los tramos son nacionales (iguales para todas las empresas): solo el administrador SaaS los mantiene.
  app.put("/api/parametros-renta/:anio", requireAuth, requireSaasAdmin, async (req, res) => {
    try {
      const b = req.body || {};
      const escala = (e: any) => Array.isArray(e) ? e.map((t: any) => [t?.[0] == null || t?.[0] === "" ? null : Number(t[0]), Number(t?.[1])] as [number | null, number]) : [];
      const p: ParametrosRenta = {
        anio: parseInt(req.params.anio),
        escalaFisica: escala(b.escalaFisica),
        escalaJuridica: escala(b.escalaJuridica),
        topeIngresosEscalaReducida: Number(b.topeIngresosEscalaReducida),
        tarifaGeneralJuridica: Number(b.tarifaGeneralJuridica),
        referenciaLegal: String(b.referenciaLegal || "").trim().slice(0, 255),
        actualizadoEn: new Date().toISOString()
      };
      const problema = validarParametrosRenta(p);
      if (problema) return res.status(400).json({ error: problema });

      if (dbConnected && pool) {
        await pool.query(
          "INSERT INTO parametros_renta (anio, escalaFisica, escalaJuridica, topeIngresosEscalaReducida, tarifaGeneralJuridica, referenciaLegal, actualizadoEn) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE escalaFisica = VALUES(escalaFisica), escalaJuridica = VALUES(escalaJuridica), topeIngresosEscalaReducida = VALUES(topeIngresosEscalaReducida), tarifaGeneralJuridica = VALUES(tarifaGeneralJuridica), referenciaLegal = VALUES(referenciaLegal), actualizadoEn = VALUES(actualizadoEn)",
          [p.anio, JSON.stringify(p.escalaFisica), JSON.stringify(p.escalaJuridica), p.topeIngresosEscalaReducida, p.tarifaGeneralJuridica, p.referenciaLegal, p.actualizadoEn]
        );
      } else {
        localParametrosRenta = [...localParametrosRenta.filter(x => x.anio !== p.anio), p];
      }
      res.json(p);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  async function obtenerDatosD101(idCompania: number, anio: number) {
    const anioStr = String(anio);
    if (dbConnected && pool) {
      const [companyRows] = await pool.query("SELECT * FROM companias WHERE id_compania = ?", [idCompania]);
      const company: Company | undefined = (companyRows as any[]).map(row => normalizeRow(row, 'id_compania'))[0];
      if (!company) return null;

      // Mismo criterio que el D-104: la venta cuenta en el año en que se facturó y su Nota de
      // Crédito resta en el año en que se emitió. Antes el D-101 solo sumaba las facturas que
      // seguían ACEPTADAS e ignoraba las Notas de Crédito, así que una NC parcial nunca rebajaba el
      // ingreso, y anular en enero una factura de diciembre la sacaba del año ya cerrado.
      const [facturaRows] = await pool.query(
        `SELECT f.id_factura, f.subtotal, f.totalIva FROM facturas f WHERE f.idCompania = ? AND f.tipoDocumento IN ('01', '04') AND f.fechaEmision LIKE ? AND f.ambiente = 'PRODUCCION' AND ${SQL_FACTURA_DECLARABLE}`,
        [idCompania, `${anioStr}%`]
      );
      const facturasAnio = facturaRows as any[];

      const [ncRows] = await pool.query(
        "SELECT id_factura, subtotal, totalIva FROM facturas WHERE idCompania = ? AND tipoDocumento = '03' AND fechaEmision LIKE ? AND ambiente = 'PRODUCCION' AND estado = 'ACEPTADA'",
        [idCompania, `${anioStr}%`]
      );
      const notasCreditoAnio = ncRows as any[];

      const [ndRows] = await pool.query(
        "SELECT id_factura, subtotal, totalIva FROM facturas WHERE idCompania = ? AND tipoDocumento = '02' AND fechaEmision LIKE ? AND ambiente = 'PRODUCCION' AND estado = 'ACEPTADA'",
        [idCompania, `${anioStr}%`]
      );
      const notasDebitoAnio = ndRows as any[];

      // Lo deducible de una compra es su costo SIN IVA: el IVA acreditable ya se recupera como
      // crédito fiscal en el D-104, y deducirlo también aquí lo contaba dos veces (corrección del
      // POS de restaurante, d104Compras.ts). Lo que el proveedor cobra sin IVA propio sí queda deducible.
      const [cxpRows] = await pool.query(
        "SELECT COALESCE(SUM(montoTotal - ivaAcreditable), 0) AS total FROM cuentas_pagar WHERE idCompania = ? AND fechaRegistro LIKE ? AND estado != 'ANULADA'",
        [idCompania, `${anioStr}%`]
      );
      const comprasCxPAnio = Number((cxpRows as any[])[0]?.total) || 0;

      const [gmRows] = await pool.query("SELECT * FROM d101_gastos_manuales WHERE idCompania = ? AND anio = ?", [idCompania, anio]);
      const gm = (gmRows as any[])[0];
      const gastosManuales: GastosManualesAnuales = gm
        ? { alquileres: Number(gm.alquileres), servicios: Number(gm.servicios), planilla: Number(gm.planilla), otros: Number(gm.otros) }
        : { alquileres: 0, servicios: 0, planilla: 0, otros: 0 };

      const [cierreRows] = await pool.query("SELECT * FROM cierres_fiscales WHERE idCompania = ? AND tipo = 'D101' AND periodo = ?", [idCompania, anioStr]);
      const cierre = (cierreRows as any[])[0];

      return { company, facturasAnio, notasCreditoAnio, notasDebitoAnio, comprasCxPAnio, gastosManuales, yaCerrado: !!cierre, fechaCierre: cierre ? cierre.creadoEn : null, parametrosRenta: await obtenerParametrosRenta(anio) };
    } else {
      const company = localCompanies.find(c => c.id === idCompania);
      if (!company) return null;
      const facturasAnio = localFacturas.filter(f => f.idCompania === idCompania && (f.tipoDocumento === "01" || f.tipoDocumento === "04") && f.fechaEmision.startsWith(anioStr) && f.ambiente === "PRODUCCION" && esFacturaDeclarableLocal(f));
      const notasCreditoAnio = localFacturas.filter(f => f.idCompania === idCompania && f.tipoDocumento === "03" && f.fechaEmision.startsWith(anioStr) && f.ambiente === "PRODUCCION" && f.estado === "ACEPTADA");
      const notasDebitoAnio = localFacturas.filter(f => f.idCompania === idCompania && f.tipoDocumento === "02" && f.fechaEmision.startsWith(anioStr) && f.ambiente === "PRODUCCION" && f.estado === "ACEPTADA");
      const comprasCxPAnio = localCuentasPagar.filter(c => c.idCompania === idCompania && c.fechaRegistro.startsWith(anioStr) && c.estado !== "ANULADA").reduce((s, c) => s + c.montoTotal - (c.ivaAcreditable || 0), 0);
      const gm = localGastosManuales.find(g => g.idCompania === idCompania && g.anio === anio);
      const gastosManuales: GastosManualesAnuales = gm
        ? { alquileres: gm.alquileres, servicios: gm.servicios, planilla: gm.planilla, otros: gm.otros }
        : { alquileres: 0, servicios: 0, planilla: 0, otros: 0 };
      const cierre = localCierresFiscales.find(c => c.idCompania === idCompania && c.tipo === "D101" && c.periodo === anioStr);
      return { company, facturasAnio, notasCreditoAnio, notasDebitoAnio, comprasCxPAnio, gastosManuales, yaCerrado: !!cierre, fechaCierre: cierre ? cierre.creadoEn : null, parametrosRenta: await obtenerParametrosRenta(anio) };
    }
  }

  app.get("/api/reportes/d101", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      const anio = parseInt(String(req.query.anio || ""));
      if (!Number.isFinite(anio) || anio < 2000 || anio > 2100) return res.status(400).json({ error: "Año inválido." });
      const datos = await obtenerDatosD101(idCompania, anio);
      if (!datos) return res.status(404).json({ error: "Empresa no encontrada." });
      res.json(construirReporteD101(anio, datos.company, datos.facturasAnio, datos.notasCreditoAnio, datos.notasDebitoAnio, datos.comprasCxPAnio, datos.gastosManuales, datos.yaCerrado, datos.fechaCierre, datos.parametrosRenta));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/reportes/d101-gastos-manuales", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      const anio = parseInt(req.body.anio);
      if (!Number.isFinite(anio) || anio < 2000 || anio > 2100) return res.status(400).json({ error: "Año inválido." });
      const gastos: GastosManualesAnuales = {
        alquileres: Math.max(0, parseFloat(req.body.alquileres) || 0),
        servicios: Math.max(0, parseFloat(req.body.servicios) || 0),
        planilla: Math.max(0, parseFloat(req.body.planilla) || 0),
        otros: Math.max(0, parseFloat(req.body.otros) || 0)
      };

      const yaCerrado = dbConnected && pool
        ? ((await pool.query("SELECT id FROM cierres_fiscales WHERE idCompania = ? AND tipo = 'D101' AND periodo = ?", [idCompania, String(anio)]))[0] as any[]).length > 0
        : localCierresFiscales.some(c => c.idCompania === idCompania && c.tipo === "D101" && c.periodo === String(anio));
      if (yaCerrado) return res.status(400).json({ error: `El año ${anio} ya tiene una liquidación de Renta presentada — sus gastos ya no se pueden editar.` });

      if (dbConnected && pool) {
        await pool.query(
          "INSERT INTO d101_gastos_manuales (idCompania, anio, alquileres, servicios, planilla, otros, actualizadoEn) VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE alquileres = VALUES(alquileres), servicios = VALUES(servicios), planilla = VALUES(planilla), otros = VALUES(otros), actualizadoEn = VALUES(actualizadoEn)",
          [idCompania, anio, gastos.alquileres, gastos.servicios, gastos.planilla, gastos.otros, new Date().toISOString()]
        );
      } else {
        const existing = localGastosManuales.find(g => g.idCompania === idCompania && g.anio === anio);
        if (existing) Object.assign(existing, gastos);
        else localGastosManuales.push({ idCompania, anio, ...gastos });
      }

      res.json(gastos);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/reportes/d101/cerrar", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      const anio = parseInt(req.body.anio);
      if (!Number.isFinite(anio) || anio < 2000 || anio > 2100) return res.status(400).json({ error: "Año inválido." });
      const datos = await obtenerDatosD101(idCompania, anio);
      if (!datos) return res.status(404).json({ error: "Empresa no encontrada." });
      if (datos.yaCerrado) return res.status(409).json({ error: `Ya existe una liquidación de Renta para el año ${anio}.` });
      const pendientesD101 = await comprobantesSinResolver(idCompania, String(anio));
      if (pendientesD101.length > 0 && req.body.confirmarPendientes !== true) {
        return res.status(409).json({ error: mensajePendientesCierre(pendientesD101), pendientes: pendientesD101 });
      }

      const creadoEn = new Date().toISOString();
      const reporte = construirReporteD101(anio, datos.company, datos.facturasAnio, datos.notasCreditoAnio, datos.notasDebitoAnio, datos.comprasCxPAnio, datos.gastosManuales, true, creadoEn, datos.parametrosRenta);

      if (dbConnected && pool) {
        try {
          await pool.query(
            "INSERT INTO cierres_fiscales (idCompania, tipo, periodo, datos, creadoPor, creadoEn) VALUES (?, 'D101', ?, ?, NULL, ?)",
            [idCompania, String(anio), JSON.stringify(reporte), creadoEn]
          );
        } catch (err: any) {
          if (err.code === "ER_DUP_ENTRY") return res.status(409).json({ error: `Ya existe una liquidación de Renta para el año ${anio}.` });
          throw err;
        }
      } else {
        if (localCierresFiscales.some(c => c.idCompania === idCompania && c.tipo === "D101" && c.periodo === String(anio))) {
          return res.status(409).json({ error: `Ya existe una liquidación de Renta para el año ${anio}.` });
        }
        localCierresFiscales.push({ id: Math.max(0, ...localCierresFiscales.map(c => c.id), 0) + 1, idCompania, tipo: "D101", periodo: String(anio), datos: reporte, creadoPor: null, creadoEn });
      }

      res.json(reporte);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/reportes/cierres", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      const tipo = req.query.tipo === "D101" ? "D101" : "D104";
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM cierres_fiscales WHERE idCompania = ? AND tipo = ? ORDER BY periodo DESC", [idCompania, tipo]);
        res.json((rows as any[]).map(r => ({ ...r, datos: typeof r.datos === "string" ? JSON.parse(r.datos) : r.datos })));
      } else {
        res.json(localCierresFiscales.filter(c => c.idCompania === idCompania && c.tipo === tipo).sort((a, b) => b.periodo.localeCompare(a.periodo)));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. SMTP Configs
  app.get("/api/smtp-configs", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      let rows: CompaniaSmtpConfig[];
      if (dbConnected && pool) {
        const [dbRows] = await pool.query("SELECT * FROM compania_smtp_config WHERE idCompania = ?", [idCompania]);
        rows = (dbRows as any[]).map(row => ({ ...row, activo: !!row.activo }));
      } else {
        rows = localSmtpConfigs.filter(c => c.idCompania === idCompania);
      }
      const sanitized = rows.map(row => ({
        ...row,
        smtpPasswordCifrado: "",
        tieneContrasena: !!row.smtpPasswordCifrado
      }));
      res.json(sanitized);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/smtp-configs", requireAuth, async (req, res) => {
    try {
      const s = req.body;
      const idCompania = sessionOf(req).idCompania;

      let existingPassword = "";
      if (dbConnected && pool) {
        const [existingRows] = await pool.query("SELECT smtpPasswordCifrado FROM compania_smtp_config WHERE idCompania = ?", [idCompania]);
        existingPassword = (existingRows as any[])[0]?.smtpPasswordCifrado || "";
      } else {
        existingPassword = localSmtpConfigs.find(c => c.idCompania === idCompania)?.smtpPasswordCifrado || "";
      }

      const smtpPasswordCifrado = s.smtpPassword && String(s.smtpPassword).trim()
        ? encryptSecret(String(s.smtpPassword).trim())
        : existingPassword;

      if (dbConnected && pool) {
        const [exists] = await pool.query("SELECT id FROM compania_smtp_config WHERE idCompania = ?", [idCompania]);
        let responseId: number;
        if ((exists as any).length > 0) {
          await pool.query(
            "UPDATE compania_smtp_config SET proveedor = ?, smtpHost = ?, smtpPort = ?, smtpSeguridad = ?, smtpUsuario = ?, smtpPasswordCifrado = ?, remitenteNombre = ?, remitenteCorreo = ?, recordatorioHorasAntes = ?, activo = ? WHERE idCompania = ?",
            [s.provider || s.proveedor, s.smtpHost, parseInt(s.smtpPort), s.smtpSeguridad, s.smtpUsuario, smtpPasswordCifrado, s.remitenteNombre, s.remitenteCorreo, parseInt(s.recordatorioHorasAntes), s.activo ? 1 : 0, idCompania]
          );
          responseId = (exists as any)[0].id;
        } else {
          const [result] = await pool.query(
            "INSERT INTO compania_smtp_config (idCompania, proveedor, smtpHost, smtpPort, smtpSeguridad, smtpUsuario, smtpPasswordCifrado, remitenteNombre, remitenteCorreo, recordatorioHorasAntes, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [idCompania, s.provider || s.proveedor, s.smtpHost, parseInt(s.smtpPort), s.smtpSeguridad, s.smtpUsuario, smtpPasswordCifrado, s.remitenteNombre, s.remitenteCorreo, parseInt(s.recordatorioHorasAntes), s.activo ? 1 : 0]
          );
          responseId = (result as any).insertId;
        }
        res.json({
          id: responseId,
          idCompania,
          proveedor: s.provider || s.proveedor,
          smtpHost: s.smtpHost,
          smtpPort: parseInt(s.smtpPort),
          smtpSeguridad: s.smtpSeguridad,
          smtpUsuario: s.smtpUsuario,
          remitenteNombre: s.remitenteNombre,
          remitenteCorreo: s.remitenteCorreo,
          recordatorioHorasAntes: parseInt(s.recordatorioHorasAntes),
          activo: !!s.activo,
          smtpPasswordCifrado: "",
          tieneContrasena: !!smtpPasswordCifrado
        });
      } else {
        const index = localSmtpConfigs.findIndex(item => item.idCompania === idCompania);
        const stored: CompaniaSmtpConfig = {
          id: index !== -1 ? localSmtpConfigs[index].id : Math.max(0, ...localSmtpConfigs.map(item => item.id)) + 1,
          idCompania,
          proveedor: s.proveedor,
          smtpHost: s.smtpHost,
          smtpPort: parseInt(s.smtpPort),
          smtpSeguridad: s.smtpSeguridad,
          smtpUsuario: s.smtpUsuario,
          smtpPasswordCifrado,
          remitenteNombre: s.remitenteNombre,
          remitenteCorreo: s.remitenteCorreo,
          recordatorioHorasAntes: parseInt(s.recordatorioHorasAntes),
          activo: !!s.activo
        };
        if (index !== -1) {
          localSmtpConfigs[index] = stored;
        } else {
          localSmtpConfigs.push(stored);
        }
        res.json({ ...stored, smtpPasswordCifrado: "", tieneContrasena: !!smtpPasswordCifrado });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Prueba de la configuración SMTP: verifica la conexión/credenciales y envía un correo de
  // prueba ÚNICAMENTE al correo del usuario de la sesión (leído de la BD, nunca del body),
  // para que el endpoint no pueda usarse como relay de correo.
  app.post("/api/smtp-configs/probar", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      const idCompania = parseInt(req.body?.idCompania);
      if (!Number.isInteger(idCompania)) {
        return res.status(400).json({ ok: false, error: "Indique la empresa a probar." });
      }
      if (!isSaasAdmin(session) && !(session.rol === "Administrador" && canAccessCompany(session, idCompania))) {
        return res.status(403).json({ ok: false, error: "No autorizado." });
      }

      let smtpConfig: CompaniaSmtpConfig | undefined;
      let correoDestino = "";
      if (dbConnected && pool) {
        const [smtpRows] = await pool.query("SELECT * FROM compania_smtp_config WHERE idCompania = ?", [idCompania]);
        const smtpRow = (smtpRows as any[])[0];
        smtpConfig = smtpRow ? { ...smtpRow, activo: !!smtpRow.activo } : undefined;
        const [userRows] = await pool.query("SELECT correo FROM usuarios WHERE id_usuario = ?", [session.userId]);
        correoDestino = String((userRows as any[])[0]?.correo || "").trim();
      } else {
        smtpConfig = localSmtpConfigs.find(s => s.idCompania === idCompania);
        correoDestino = String(localUsers.find(u => u.id === session.userId)?.correo || "").trim();
      }

      if (!smtpConfig || !smtpConfig.smtpHost || !smtpConfig.smtpPasswordCifrado) {
        return res.status(400).json({ ok: false, error: "Guarde primero la configuración SMTP (servidor, usuario y contraseña) de esta empresa." });
      }
      if (!correoDestino) {
        return res.status(400).json({ ok: false, error: "Su usuario no tiene un correo registrado para recibir la prueba." });
      }
      const company = await fetchCompanyById(idCompania);
      if (!company) {
        return res.status(404).json({ ok: false, error: "Empresa no encontrada." });
      }

      const detalleError = (err: any) =>
        [err?.code, err?.responseCode, err?.response || err?.message].filter(Boolean).join(" ");

      try {
        await createTransportFromConfig(smtpConfig).verify();
      } catch (err: any) {
        console.error("[SmtpProbar] Fallo verify:", err.code, err.responseCode, err.message);
        return res.json({ ok: false, error: `No se pudo conectar/autenticar con el servidor SMTP: ${detalleError(err)}` });
      }

      try {
        const rendered = renderSmtpTestEmail({ company });
        const envio = await sendMail(smtpConfig, { to: correoDestino, subject: rendered.subject, html: rendered.html, text: rendered.text });
        res.json({ ok: true, messageId: envio.messageId, accepted: envio.accepted, rejected: envio.rejected });
      } catch (err: any) {
        console.error("[SmtpProbar] Fallo envío:", err.code, err.responseCode, err.message);
        res.json({ ok: false, error: `El servidor SMTP rechazó el envío: ${detalleError(err)}` });
      }
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  // --- CxP: facturas de proveedor recibidas por correo (spec 2026-10-19-cxp-lectura-correo) ---
  // Portado del ERP-Elrotech. La bandeja no crea cuentas por pagar: Importar reutiliza
  // POST /api/cxp/importar-xml con el XML guardado y luego marca el comprobante como IMPORTADA.
  // Sin modo en memoria: la bandeja y el buzón viven solo en la BD.

  const sinBdCorreo = (res: express.Response) =>
    res.status(503).json({ error: "La lectura de correo necesita la base de datos conectada." });

  async function cargarImapConfig(idCompania: number): Promise<any | undefined> {
    const [rows] = await pool!.query("SELECT * FROM compania_imap_config WHERE idCompania = ?", [idCompania]);
    return (rows as any[])[0];
  }

  const configImapDe = (row: any): ConfigImap => ({
    imapHost: row.imapHost || "",
    imapPort: Number(row.imapPort) || 0,
    imapSeguro: !!row.imapSeguro,
    imapUsuario: row.imapUsuario || "",
    imapPassword: row.imapPasswordCifrado ? decryptSecret(row.imapPasswordCifrado) : "",
    imapCarpeta: row.imapCarpeta || "INBOX"
  });

  // Lo único que viaja al navegador: nunca la contraseña, solo si existe.
  const imapConfigPublica = (row: any): CompaniaImapConfig => ({
    imapHost: row?.imapHost || "",
    imapPort: Number(row?.imapPort) || 993,
    imapSeguro: row ? !!row.imapSeguro : true,
    imapUsuario: row?.imapUsuario || "",
    imapCarpeta: row?.imapCarpeta || "INBOX",
    activo: !!row?.activo,
    verificadaEn: row?.verificadaEn || null,
    tieneContrasena: !!row?.imapPasswordCifrado
  });

  app.get("/api/imap-config", requireAuth, async (req, res) => {
    try {
      if (!dbConnected || !pool) return sinBdCorreo(res);
      res.json(imapConfigPublica(await cargarImapConfig(sessionOf(req).idCompania)));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/imap-config", requireAuth, async (req, res) => {
    try {
      if (!dbConnected || !pool) return sinBdCorreo(res);
      const idCompania = sessionOf(req).idCompania;
      const b = req.body || {};
      const imapHost = String(b.imapHost || "").trim().slice(0, 255);
      const imapUsuario = String(b.imapUsuario || "").trim().slice(0, 255);
      const imapSeguro = b.imapSeguro !== false;
      const imapPort = parseInt(b.imapPort) || (imapSeguro ? 993 : 143);
      if (imapPort < 1 || imapPort > 65535) return res.status(400).json({ error: "El puerto IMAP no es válido." });
      const imapCarpeta = carpetasDe(b.imapCarpeta).join(", ").slice(0, 500);
      const activo = !!b.activo;

      const previo = await cargarImapConfig(idCompania);
      const passwordNueva = String(b.imapPassword || "").trim();
      const imapPasswordCifrado = passwordNueva ? encryptSecret(passwordNueva) : (previo?.imapPasswordCifrado || null);
      if (activo && (!imapHost || !imapUsuario || !imapPasswordCifrado)) {
        return res.status(400).json({ error: "Para activar la lectura indique servidor, usuario y contraseña del buzón." });
      }
      // Otro buzón (host o usuario distinto): su avance no sirve y se relee la ventana completa.
      // Cambiar cualquier credencial obliga a volver a probar la conexión.
      const otroBuzon = !previo || previo.imapHost !== imapHost || previo.imapUsuario !== imapUsuario;
      const credencialesCambiaron = otroBuzon || !!passwordNueva || Number(previo.imapPort) !== imapPort || !!previo.imapSeguro !== imapSeguro;

      if (previo) {
        await pool.query(
          "UPDATE compania_imap_config SET imapHost = ?, imapPort = ?, imapSeguro = ?, imapUsuario = ?, imapPasswordCifrado = ?, imapCarpeta = ?, activo = ?, avance = IF(?, NULL, avance), verificadaEn = IF(?, NULL, verificadaEn) WHERE idCompania = ?",
          [imapHost, imapPort, imapSeguro ? 1 : 0, imapUsuario, imapPasswordCifrado, imapCarpeta, activo ? 1 : 0, otroBuzon ? 1 : 0, credencialesCambiaron ? 1 : 0, idCompania]
        );
      } else {
        await pool.query(
          "INSERT INTO compania_imap_config (idCompania, imapHost, imapPort, imapSeguro, imapUsuario, imapPasswordCifrado, imapCarpeta, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [idCompania, imapHost, imapPort, imapSeguro ? 1 : 0, imapUsuario, imapPasswordCifrado, imapCarpeta, activo ? 1 : 0]
        );
      }
      res.json(imapConfigPublica(await cargarImapConfig(idCompania)));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/imap-config/probar", requireAuth, async (req, res) => {
    try {
      if (!dbConnected || !pool) return sinBdCorreo(res);
      const idCompania = sessionOf(req).idCompania;
      const row = await cargarImapConfig(idCompania);
      if (!row?.imapHost || !row?.imapUsuario || !row?.imapPasswordCifrado) {
        return res.status(400).json({ error: "Guarde primero el servidor, usuario y contraseña del buzón." });
      }
      try {
        await verificarConexionImap(configImapDe(row));
      } catch (err: any) {
        await pool.query("UPDATE compania_imap_config SET verificadaEn = NULL WHERE idCompania = ?", [idCompania]);
        return res.status(400).json({ error: err.message || "No se pudo conectar al buzón." });
      }
      const verificadaEn = new Date().toISOString();
      await pool.query("UPDATE compania_imap_config SET verificadaEn = ? WHERE idCompania = ?", [verificadaEn, idCompania]);
      res.json({ verificadaEn });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/imap-config/carpetas", requireAuth, async (req, res) => {
    try {
      if (!dbConnected || !pool) return sinBdCorreo(res);
      const row = await cargarImapConfig(sessionOf(req).idCompania);
      if (!row?.imapHost || !row?.imapUsuario || !row?.imapPasswordCifrado) {
        return res.status(400).json({ error: "Guarde primero el servidor, usuario y contraseña del buzón." });
      }
      try {
        res.json(await listarCarpetas(configImapDe(row)));
      } catch (err: any) {
        res.status(502).json({ error: err.message || "No se pudieron listar las carpetas del buzón." });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Sin la columna `xml` (LONGTEXT): solo metadatos. El XML se pide uno por uno al importar.
  app.get("/api/facturas-correo", requireAuth, async (req, res) => {
    try {
      if (!dbConnected || !pool) return sinBdCorreo(res);
      const params: any[] = [sessionOf(req).idCompania];
      const estado = String(req.query.estado || "");
      let filtro = "";
      if (["PENDIENTE", "IMPORTADA", "DESCARTADA"].includes(estado)) {
        filtro = " AND estado = ?";
        params.push(estado);
      }
      const [rows] = await pool.query(
        `SELECT id, tipoDocumento, clave, numeroConsecutivo, fechaEmision, emisorNombre, emisorIdentificacion, montoTotal,
                moneda, tipoCambio, remitente, asunto, fechaCorreo, nombreArchivo, estado, idCuentaPagar, motivoDescarte, procesadoEn
           FROM facturas_proveedor_correo WHERE idCompania = ?${filtro}
          ORDER BY fechaCorreo DESC, id DESC LIMIT 300`,
        params
      );
      res.json((rows as any[]).map(r => ({ ...r, montoTotal: Number(r.montoTotal), tipoCambio: Number(r.tipoCambio) })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/facturas-correo/:id/xml", requireAuth, async (req, res) => {
    try {
      if (!dbConnected || !pool) return sinBdCorreo(res);
      const [rows] = await pool.query("SELECT xml FROM facturas_proveedor_correo WHERE id = ? AND idCompania = ?", [parseInt(req.params.id), sessionOf(req).idCompania]);
      const fila = (rows as any[])[0];
      if (!fila) return res.status(404).json({ error: "El comprobante no existe en la bandeja." });
      res.json({ xml: fila.xml });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Cierra el ciclo de un comprobante: IMPORTADA (con la CxP que creó el importador) o DESCARTADA.
  app.post("/api/facturas-correo/:id/estado", requireAuth, async (req, res) => {
    try {
      if (!dbConnected || !pool) return sinBdCorreo(res);
      const idCompania = sessionOf(req).idCompania;
      const { estado, idCuentaPagar, motivoDescarte } = req.body || {};
      if (estado !== "IMPORTADA" && estado !== "DESCARTADA") {
        return res.status(400).json({ error: "Estado inválido: solo IMPORTADA o DESCARTADA." });
      }
      let idCxp: number | null = null;
      if (estado === "IMPORTADA") {
        idCxp = parseInt(idCuentaPagar);
        const [cxpRows] = await pool.query("SELECT id FROM cuentas_pagar WHERE id = ? AND idCompania = ?", [idCxp, idCompania]);
        if ((cxpRows as any[]).length === 0) return res.status(400).json({ error: "Falta la cuenta por pagar asociada al comprobante importado." });
      }
      // Solo avanza desde PENDIENTE: si dos pestañas lo procesan a la vez, la segunda se entera acá.
      const [result] = await pool.query(
        "UPDATE facturas_proveedor_correo SET estado = ?, idCuentaPagar = ?, motivoDescarte = ?, procesadoEn = ? WHERE id = ? AND idCompania = ? AND estado = 'PENDIENTE'",
        [estado, idCxp, estado === "DESCARTADA" ? (String(motivoDescarte || "").slice(0, 500) || null) : null, new Date().toISOString(), parseInt(req.params.id), idCompania]
      );
      if ((result as any).affectedRows !== 1) {
        return res.status(409).json({ error: "Ese comprobante ya había sido procesado." });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Empresas cuyo buzón se está revisando ahora: el proceso automático y el botón "Revisar correo
  // ahora" no deben abrir dos sesiones IMAP simultáneas (varios proveedores de correo lo rechazan).
  const buzonesEnRevision = new Set<number>();

  // ¿La compra ya está registrada (importada a mano o tecleada)? Mismo criterio que el importador
  // usa para rechazar duplicados: consecutivo del proveedor + su cédula, sin contar anuladas.
  async function buscarCxPExistente(idCompania: number, numeroConsecutivo: string, emisorIdentificacion: string): Promise<number | null> {
    if (!numeroConsecutivo) return null;
    const [rows] = await pool!.query(
      `SELECT c.id FROM cuentas_pagar c JOIN proveedores p ON p.id = c.idProveedor
        WHERE c.idCompania = ? AND c.numeroFacturaProveedor = ? AND c.estado != 'ANULADA'
          AND REPLACE(REPLACE(p.identificacion, '-', ''), ' ', '') = ?
        LIMIT 1`,
      [idCompania, numeroConsecutivo.slice(0, 100), emisorIdentificacion]
    );
    return (rows as any[])[0]?.id ?? null;
  }

  async function revisarBuzonEmpresa(idCompania: number, row: any) {
    if (buzonesEnRevision.has(idCompania)) throw new Error("Ya hay una revisión del buzón en curso para esta empresa.");
    buzonesEnRevision.add(idCompania);
    try {
      const empresa = await fetchCompanyById(idCompania);
      let avance: Record<string, AvanceCarpeta> = {};
      try { avance = row.avance ? JSON.parse(row.avance) : {}; } catch { /* ilegible: se relee la ventana, que es recuperable */ }

      const resultado = await recolectarComprobantes(configImapDe(row), { avance, identificacionEmpresa: empresa?.identificacion || "" });

      let nuevos = 0;
      let yaRegistrados = 0;
      let falloAlgunGuardado = false;
      for (const c of resultado.comprobantes) {
        try {
          // Una compra que ya está en CxP entra YA importada: queda el rastro del correo pero nadie
          // la ve como pendiente ni puede registrarla dos veces.
          const cxpExistente = await buscarCxPExistente(idCompania, c.meta.numeroConsecutivo, c.meta.emisorIdentificacion);
          const ahora = new Date().toISOString();
          const [insert] = await pool!.query(
            `INSERT IGNORE INTO facturas_proveedor_correo
               (idCompania, tipoDocumento, clave, numeroConsecutivo, fechaEmision, emisorNombre, emisorIdentificacion, montoTotal,
                moneda, tipoCambio, remitente, asunto, fechaCorreo, nombreArchivo, xml, estado, idCuentaPagar, procesadoEn, creadoEn)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              idCompania, c.meta.tipoDocumento, c.meta.clave, c.meta.numeroConsecutivo.slice(0, 100), c.meta.fechaEmision.slice(0, 50),
              (c.meta.emisorNombre || "Proveedor sin nombre").slice(0, 150), c.meta.emisorIdentificacion.slice(0, 30), c.meta.total,
              c.meta.moneda.slice(0, 3), c.meta.tipoCambio, c.remitente.slice(0, 255), c.asunto.slice(0, 500), c.fechaCorreo.toISOString(),
              c.nombreArchivo.slice(0, 255), c.xml, cxpExistente ? "IMPORTADA" : "PENDIENTE", cxpExistente, cxpExistente ? ahora : null, ahora
            ]
          );
          // 0 = ya estaba en la bandeja (correo reenviado o buzón releído).
          if ((insert as any).affectedRows === 1) {
            if (cxpExistente) yaRegistrados++; else nuevos++;
          }
        } catch (err: any) {
          falloAlgunGuardado = true;
          console.error(`[CORREO PROVEEDORES] No se pudo guardar el comprobante ${c.meta.clave} de la empresa ${idCompania}:`, err.message || err);
        }
      }

      // El avance solo se guarda si TODO el lote quedó guardado: releer un correo es gratis,
      // saltárselo lo pierde para siempre.
      if (!falloAlgunGuardado && Object.keys(resultado.avance).length > 0) {
        await pool!.query("UPDATE compania_imap_config SET avance = ? WHERE idCompania = ?", [JSON.stringify(resultado.avance), idCompania]);
      }
      for (const f of resultado.carpetasConError) {
        console.error(`[CORREO PROVEEDORES] Empresa ${idCompania}: no se pudo revisar la carpeta "${f.carpeta}": ${f.error}`);
      }
      return {
        nuevos,
        yaRegistrados,
        revisados: resultado.mensajesRevisados,
        descartados: resultado.descartados,
        buzonAlDia: resultado.buzonAlDia,
        carpetasConError: resultado.carpetasConError
      };
    } finally {
      buzonesEnRevision.delete(idCompania);
    }
  }

  app.post("/api/facturas-correo/revisar-ahora", requireAuth, async (req, res) => {
    try {
      if (!dbConnected || !pool) return sinBdCorreo(res);
      const idCompania = sessionOf(req).idCompania;
      const row = await cargarImapConfig(idCompania);
      if (!row?.imapHost || !row?.imapUsuario || !row?.imapPasswordCifrado) {
        return res.status(400).json({ error: "Esta empresa no tiene configurado el buzón de correo entrante. Configúrelo en Personalizar → Correo entrante." });
      }
      try {
        res.json(await revisarBuzonEmpresa(idCompania, row));
      } catch (err: any) {
        console.error(`[CORREO PROVEEDORES] Revisión manual fallida para la empresa ${idCompania}:`, err.message || err);
        res.status(502).json({ error: err.message || "No se pudo revisar el buzón de correo." });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  let revisandoCorreos = false;
  // Empresa por empresa: un buzón que falla (credencial vencida, servidor caído) no frena a los demás.
  async function procesarCorreosProveedores() {
    if (!dbConnected || !pool || revisandoCorreos) return;
    revisandoCorreos = true;
    try {
      const [filas] = await pool.query(
        `SELECT i.* FROM compania_imap_config i JOIN companias c ON c.id_compania = i.idCompania
          WHERE i.activo = 1 AND c.estadoSaas = 'ACTIVA'
            AND i.imapHost <> '' AND i.imapUsuario <> '' AND i.imapPasswordCifrado IS NOT NULL
            AND i.verificadaEn IS NOT NULL
            AND i.idCompania <> ?`,
        // La empresa de plataforma no es una clínica: su buzón (si lo tuviera) no se revisa.
        [idCompaniaPlataforma()]
      );
      for (const row of filas as any[]) {
        try {
          const r = await revisarBuzonEmpresa(row.idCompania, row);
          if (r.nuevos > 0 || r.yaRegistrados > 0) {
            console.log(`[CORREO PROVEEDORES] Empresa ${row.idCompania}: ${r.nuevos} comprobante(s) nuevo(s), ${r.yaRegistrados} ya registrado(s) (de ${r.revisados} correo(s)).`);
          }
        } catch (err: any) {
          if (err?.esAutenticacion) {
            // Insistir con credenciales malas puede hacer que el proveedor bloquee la cuenta.
            try {
              await pool.query("UPDATE compania_imap_config SET verificadaEn = NULL WHERE idCompania = ?", [row.idCompania]);
            } catch (errBd: any) {
              console.error(`[CORREO PROVEEDORES] Empresa ${row.idCompania}: no se pudo pausar la revisión:`, errBd?.message || errBd);
            }
            console.warn(`[CORREO PROVEEDORES] Empresa ${row.idCompania}: credenciales rechazadas; se pausa la revisión automática hasta volver a probar la conexión.`);
          } else {
            console.error(`[CORREO PROVEEDORES] Falla revisando el buzón de la empresa ${row.idCompania}: ${err?.message || err}`);
          }
        }
      }
    } catch (err) {
      console.error("[CORREO PROVEEDORES] No se pudo procesar la pasada:", err);
    } finally {
      revisandoCorreos = false;
    }
  }

  // 7. Notification Logs
  app.get("/api/notification-logs", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM notification_logs WHERE idCompania = ?", [idCompania]);
        res.json(rows);
      } else {
        res.json(localLogs.filter(l => l.idCompania === idCompania));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/notification-logs", requireAuth, async (req, res) => {
    try {
      const l = req.body;
      l.idCompania = sessionOf(req).idCompania;
      if (dbConnected && pool) {
        const [result] = await pool.query(
          "INSERT INTO notification_logs (idCompania, idCita, tipo, destinatario, asunto, cuerpo, enviadoEn) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [parseInt(l.idCompania), parseInt(l.idCita), l.tipo, l.destinatario, l.asunto, l.cuerpo, l.enviadoEn]
        );
        l.id = (result as any).insertId;
        res.json(l);
      } else {
        l.id = Math.max(0, ...localLogs.map(item => item.id)) + 1;
        localLogs.push(l);
        res.json(l);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 8. Real-time notification sending (Cita + Consulta)
  app.post("/api/notifications/send", requireAuth, async (req: express.Request, res: express.Response) => {
    try {
      const body = req.body;
      const idCompania = sessionOf(req).idCompania;

      let company: Company | undefined;
      let smtpConfig: CompaniaSmtpConfig | undefined;

      if (dbConnected && pool) {
        const [companyRows] = await pool.query("SELECT * FROM companias WHERE id_compania = ?", [idCompania]);
        company = (companyRows as any[]).map(row => normalizeRow(row, 'id_compania'))[0];
        const [smtpRows] = await pool.query("SELECT * FROM compania_smtp_config WHERE idCompania = ?", [idCompania]);
        const smtpRow = (smtpRows as any[])[0];
        smtpConfig = smtpRow ? { ...smtpRow, activo: !!smtpRow.activo } : undefined;
      } else {
        company = localCompanies.find(c => c.id === idCompania);
        smtpConfig = localSmtpConfigs.find(s => s.idCompania === idCompania);
      }

      if (!company) {
        return res.status(400).json({ error: "Empresa no encontrada." });
      }
      if (!smtpConfig || !smtpConfig.activo) {
        return res.status(400).json({ error: "Las notificaciones SMTP no están activas para esta empresa." });
      }

      async function fetchPatientById(id: number): Promise<Patient | undefined> {
        if (dbConnected && pool) {
          const [rows] = await pool.query("SELECT * FROM pacientes WHERE id_paciente = ? AND idCompania = ?", [id, idCompania]);
          return (rows as any[]).map(row => normalizeRow(row, 'id_paciente'))[0];
        }
        return localPatients.find(p => p.id === id && p.idCompania === idCompania);
      }

      async function fetchCitaById(id: number): Promise<Cita | undefined> {
        if (dbConnected && pool) {
          // Note: unlike pacientes/consultas, the dynamically-created `citas` table (see CREATE TABLE
          // IF NOT EXISTS citas above) has no `id_cita` column at all -- its real PK is just `id`.
          // Querying "id_cita" here throws "Unknown column 'id_cita'" (verified live), so we only match on `id`.
          const [rows] = await pool.query("SELECT * FROM citas WHERE id = ? AND idCompania = ?", [id, idCompania]);
          return (rows as any[]).map(row => normalizeRow(row, 'id'))[0];
        }
        return localCitas.find(c => c.id === id && c.idCompania === idCompania);
      }

      async function fetchConsultationById(id: number): Promise<Consultation | undefined> {
        if (dbConnected && pool) {
          const [rows] = await pool.query(`SELECT ${CONSULTA_EVAL_SELECT} FROM consultas c ${CONSULTA_EVAL_JOIN} WHERE c.id_consulta = ? AND c.idCompania = ?`, [id, idCompania]);
          const rawRow = (rows as any[])[0];
          if (!rawRow) return undefined;
          const row = normalizeRow(rawRow, 'id_consulta');
          const evaluaciones = reconstruirEvaluaciones(rawRow);
          return {
            ...row,
            ...evaluaciones
          };
        }
        return localConsultations.find(c => c.id === id && c.idCompania === idCompania);
      }

      let rendered;
      const adjuntos: AdjuntoEmail[] = [];
      let idCita: number | null = null;
      let idConsulta: number | null = null;
      let destinatario: string;
      let tipoLog: string;

      if (body.tipo === "CITA") {
        const idPaciente = parseInt(body.patient?.id);
        const idCitaBody = parseInt(body.cita?.id);
        if (!idPaciente || !idCitaBody) {
          return res.status(400).json({ error: "Falta el identificador del paciente o de la cita." });
        }
        const tipoNotif = body.tipoNotif;
        if (tipoNotif !== "CONFIRMACION" && tipoNotif !== "CANCELACION" && tipoNotif !== "MODIFICACION") {
          return res.status(400).json({ error: "tipoNotif inválido." });
        }
        const patient = await fetchPatientById(idPaciente);
        const cita = await fetchCitaById(idCitaBody);
        if (!patient || !cita) {
          return res.status(404).json({ error: "Paciente o cita no encontrados." });
        }
        const servicioCita = await nombreServicioDeCita(cita.idServicio, idCompania);
        rendered = renderCitaEmail({ company, patient, cita, tipoNotif, servicio: servicioCita });
        // .ics para el calendario del paciente: REQUEST crea/actualiza y CANCEL elimina (mismo UID).
        // Si algo falla al generarlo, el correo sale igual sin adjunto.
        try {
          adjuntos.push(adjuntoIcsParaPaciente(cita, {
            nombreClinica: company.nombreComercial,
            servicio: servicioCita,
            cancelar: tipoNotif === "CANCELACION"
          }));
        } catch (err) {
          console.error("No se pudo generar el .ics de la cita:", err);
        }
        idCita = cita.id;
        destinatario = patient.correoElectronico;
        tipoLog = tipoNotif;
      } else if (body.tipo === "CONSULTA") {
        const idPaciente = parseInt(body.patient?.id);
        const idConsultaBody = parseInt(body.consultation?.id);
        if (!idPaciente || !idConsultaBody) {
          return res.status(400).json({ error: "Falta el identificador del paciente o de la consulta." });
        }
        const patient = await fetchPatientById(idPaciente);
        const consultation = await fetchConsultationById(idConsultaBody);
        if (!patient || !consultation) {
          return res.status(404).json({ error: "Paciente o consulta no encontrados." });
        }
        rendered = renderConsultaEmail({ company, patient, consultation });
        // Documento para el paciente: plan e indicaciones para seguir en casa. Si el PDF no se
        // puede generar, el correo sale igual sin adjunto (ver server/pdf.ts).
        const pdfConsulta = await generarPdfDesdeHtml(
          renderConsultaPacientePdf({ company, patient, consultation }),
          `consulta ${consultation.id}`
        );
        if (pdfConsulta) {
          const etiqueta = consultation.tipo === "Fisioterapia" ? "plan-terapia" : "plan-nutricional";
          adjuntos.push({ filename: `${etiqueta}-${consultation.fecha}.pdf`, content: pdfConsulta, contentType: "application/pdf" });
        }
        idConsulta = consultation.id;
        destinatario = patient.correoElectronico;
        tipoLog = "CONSULTA";
      } else {
        return res.status(400).json({ error: "Tipo de notificación inválido." });
      }

      await sendMail(smtpConfig, { to: destinatario, subject: rendered.subject, html: rendered.html, text: rendered.text, attachments: adjuntos });

      const log: any = {
        idCompania,
        idCita,
        idConsulta,
        tipo: tipoLog,
        destinatario,
        asunto: rendered.subject,
        cuerpo: rendered.text,
        enviadoEn: new Date().toISOString()
      };

      if (dbConnected && pool) {
        const [result] = await pool.query(
          "INSERT INTO notification_logs (idCompania, idCita, idConsulta, tipo, destinatario, asunto, cuerpo, enviadoEn) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [log.idCompania, log.idCita, log.idConsulta, log.tipo, log.destinatario, log.asunto, log.cuerpo, log.enviadoEn]
        );
        log.id = (result as any).insertId;
      } else {
        log.id = Math.max(0, ...localLogs.map(item => item.id), 0) + 1;
        localLogs.push(log);
      }

      res.json(log);
    } catch (err: any) {
      console.error("Error enviando notificación:", err);
      res.status(500).json({ error: err.message || "No se pudo enviar la notificación." });
    }
  });

  // --- Sincronización con el calendario del teléfono (suscripción ICS por profesional) ---
  // El token (32 bytes aleatorios en hex) ES la credencial de la URL pública; se guarda en
  // usuarios.calendarioToken y nunca viaja en otras respuestas (ver sanitizeUser).

  function urlCalendario(req: express.Request, token: string): string {
    // Con `trust proxy`, req.protocol ya refleja el esquema del cliente.
    const host = req.get("x-forwarded-host") || req.get("host");
    return `${req.protocol}://${host}/api/public/calendario/${token}.ics`;
  }

  async function leerConfigCalendario(idUsuario: number): Promise<{ token: string | null; nombreCompleto: boolean }> {
    if (dbConnected && pool) {
      const [rows] = await pool.query("SELECT calendarioToken, calendarioNombreCompleto FROM usuarios WHERE id_usuario = ?", [idUsuario]);
      const r = (rows as any[])[0];
      return { token: r?.calendarioToken ?? null, nombreCompleto: !!r?.calendarioNombreCompleto };
    }
    const u: any = localUsers.find(x => x.id === idUsuario);
    return { token: u?.calendarioToken ?? null, nombreCompleto: !!u?.calendarioNombreCompleto };
  }

  function respuestaCalendario(req: express.Request, cfg: { token: string | null; nombreCompleto: boolean }) {
    return cfg.token
      ? { activo: true, url: urlCalendario(req, cfg.token), nombreCompleto: cfg.nombreCompleto }
      : { activo: false, nombreCompleto: cfg.nombreCompleto };
  }

  app.get("/api/mi-calendario", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (session.rol === "Contador") return res.status(403).json({ error: "Su rol no tiene acceso a esta sección." });
      res.json(respuestaCalendario(req, await leerConfigCalendario(session.userId)));
    } catch (err: any) {
      console.error("Error leyendo la configuración del calendario:", err);
      res.status(500).json({ error: "No se pudo leer la configuración del calendario." });
    }
  });

  app.post("/api/mi-calendario", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (session.rol === "Contador") return res.status(403).json({ error: "Su rol no tiene acceso a esta sección." });
      const accion = req.body?.accion;
      if (accion !== "generar" && accion !== "regenerar" && accion !== "desactivar") {
        return res.status(400).json({ error: "Acción no válida." });
      }
      const actual = await leerConfigCalendario(session.userId);
      const nombreCompleto = typeof req.body?.nombreCompleto === "boolean" ? req.body.nombreCompleto : actual.nombreCompleto;
      // "generar" conserva el enlace vigente (sirve también para cambiar solo el interruptor de privacidad).
      const token = accion === "desactivar" ? null : accion === "generar" && actual.token ? actual.token : randomBytes(32).toString("hex");

      if (dbConnected && pool) {
        await pool.query("UPDATE usuarios SET calendarioToken = ?, calendarioNombreCompleto = ? WHERE id_usuario = ?", [token, nombreCompleto ? 1 : 0, session.userId]);
      } else {
        const u: any = localUsers.find(x => x.id === session.userId);
        if (u) { u.calendarioToken = token; u.calendarioNombreCompleto = nombreCompleto; }
      }
      res.json(respuestaCalendario(req, { token, nombreCompleto }));
    } catch (err: any) {
      console.error("Error actualizando la configuración del calendario:", err);
      res.status(500).json({ error: "No se pudo actualizar la configuración del calendario." });
    }
  });

  // Límites en memoria, 30 peticiones cada 15 minutos:
  // - por token, para tokens válidos (cada teléfono suscrito consulta su propio enlace);
  // - por IP, solo para peticiones con token inválido o inexistente (anti-enumeración).
  // Así una IP compartida por muchos teléfonos legítimos no bloquea a nadie.
  const CALENDARIO_MAX = 30;
  const CALENDARIO_VENTANA_MS = 15 * 60 * 1000;
  const calendarioLimites = new Map<string, { desde: number; cuenta: number }>();
  function excedeLimiteCalendario(clave: string): boolean {
    const ahora = Date.now();
    if (calendarioLimites.size > 5000) {
      for (const [k, v] of calendarioLimites) if (ahora - v.desde > CALENDARIO_VENTANA_MS) calendarioLimites.delete(k);
    }
    const e = calendarioLimites.get(clave);
    if (!e || ahora - e.desde > CALENDARIO_VENTANA_MS) {
      calendarioLimites.set(clave, { desde: ahora, cuenta: 1 });
      return false;
    }
    e.cuenta += 1;
    return e.cuenta > CALENDARIO_MAX;
  }
  const limiteCalendarioPorIp = (req: express.Request) => excedeLimiteCalendario(`ip:${req.ip || "desconocida"}`);

  // Público, sin sesión: el token de la URL es la credencial. Nunca incluye notas clínicas.
  app.get("/api/public/calendario/:archivo", async (req, res) => {
    try {
      const demasiadas = () => res.status(429).type("text/plain").send("Demasiadas solicitudes.");
      const m = /^([0-9a-f]{64})\.ics$/.exec(req.params.archivo);
      if (!m) {
        if (limiteCalendarioPorIp(req)) return demasiadas();
        return res.status(404).end();
      }
      const token = m[1];

      let user: any;
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM usuarios WHERE calendarioToken = ?", [token]);
        user = (rows as any[]).map(row => normalizeRow(row, "id_usuario"))[0];
      } else {
        user = localUsers.find((u: any) => u.calendarioToken === token);
      }
      // Comparación exacta (la collation de MySQL no distingue mayúsculas), usuario activo y no Contador.
      if (!user || user.calendarioToken !== token || !user.activo || user.rol === "Contador") {
        if (limiteCalendarioPorIp(req)) return demasiadas();
        return res.status(404).end();
      }
      if (excedeLimiteCalendario(`token:${token}`)) return demasiadas();

      const hoy = fechaCR();
      const desde = `${sumarDiasCR(hoy, -30)}T00:00`;
      const hasta = `${sumarDiasCR(hoy, 180)}T23:59`;
      const ahoraLocal = fechaHoraCR().slice(0, 16);

      let nombreClinica = "Consultorio";
      let filas: any[];
      if (dbConnected && pool) {
        const [companyRows] = await pool.query("SELECT nombreComercial FROM companias WHERE id_compania = ?", [user.idCompania]);
        nombreClinica = (companyRows as any[])[0]?.nombreComercial || nombreClinica;
        // Solo se seleccionan columnas necesarias: `notas` queda fuera a propósito.
        const [rows] = await pool.query(
          `SELECT c.id, c.fechaHora, c.duracionMinutos, c.estadoCita, c.tipoVisita, c.direccionDomicilio,
                  p.nombreCompleto AS pacienteNombre, p.telefono AS pacienteTelefono, s.nombre AS servicioNombre
             FROM citas c
             LEFT JOIN pacientes p ON p.id_paciente = c.idPaciente
             LEFT JOIN servicios s ON s.id_servicio = c.idServicio
            WHERE c.idUsuarioNutricionista = ? AND c.idCompania = ?
              AND c.fechaHora >= ? AND c.fechaHora <= ?
              AND NOT (c.estadoCita = 'CANCELADA' AND c.fechaHora < ?)
            ORDER BY c.fechaHora`,
          [user.id, user.idCompania, desde, hasta, ahoraLocal]
        );
        filas = rows as any[];
      } else {
        nombreClinica = localCompanies.find(c => c.id === user.idCompania)?.nombreComercial || nombreClinica;
        filas = localCitas
          .filter(c => c.idUsuarioNutricionista === user.id && c.idCompania === user.idCompania
            && c.fechaHora >= desde && c.fechaHora <= hasta
            && !(c.estadoCita === "CANCELADA" && c.fechaHora < ahoraLocal))
          .map(c => {
            const p = localPatients.find(x => x.id === c.idPaciente);
            const s = c.idServicio ? localServicios.find(x => x.id === c.idServicio) : undefined;
            return { ...c, pacienteNombre: p?.nombreCompleto, pacienteTelefono: p?.telefono, servicioNombre: s?.nombre };
          });
      }

      const ahora = new Date();
      const eventos = filas.map(f => eventoDesdeCita(f, {
        audiencia: "PROFESIONAL",
        nombreClinica,
        servicio: f.servicioNombre,
        nombrePaciente: f.pacienteNombre,
        telefonoPaciente: f.pacienteTelefono,
        nombreCompleto: !!user.calendarioNombreCompleto,
        ahora
      }));

      res.setHeader("Content-Type", "text/calendar; charset=utf-8");
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("Content-Disposition", 'inline; filename="citas.ics"');
      res.send(generarCalendarioIcs({ nombreCalendario: `Citas - ${nombreClinica}`, eventos }));
    } catch (err: any) {
      console.error("Error generando el calendario ICS:", err);
      res.status(500).end();
    }
  });

  // --- Public Booking Routes (no auth) ---

  // Reserva automática por tipo de visita (tinyint en MySQL, boolean en memoria). Sin dato = activa.
  const reservaAutoActiva = (company: Company | undefined, tipoVisita: "CONSULTORIO" | "DOMICILIO"): boolean => {
    if (!company) return true;
    const valor = tipoVisita === "DOMICILIO" ? company.reservaAutoDomicilio : company.reservaAutoConsultorio;
    return valor == null ? true : !!valor;
  };
  const ERROR_SOLO_WHATSAPP = "Esta clínica recibe solicitudes de este tipo de cita por WhatsApp.";
  const ERROR_SERVICIO_INCOMPATIBLE = "El servicio elegido no está disponible para este tipo de cita.";
  // La empresa de plataforma responde igual que una clínica que no existe.
  const ERROR_CLINICA_NO_ENCONTRADA = "Clínica no encontrada.";

  app.get("/api/public/config", (req, res) => {
    res.json({ googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "" });
  });

  app.get("/api/public/clinicas", async (req, res) => {
    try {
      let companies: Company[];
      if (dbConnected && pool) {
        // La empresa de plataforma (administración SaaS) nunca se ofrece como clínica.
        const [rows] = await pool.query("SELECT * FROM companias WHERE estadoSaas = 'ACTIVA' AND id_compania <> ?", [idCompaniaPlataforma()]);
        companies = (rows as any[]).map(row => normalizeRow(row, 'id_compania'));
      } else {
        companies = localCompanies.filter(c => c.estadoSaas === "ACTIVA" && !esCompaniaPlataforma(c.id));
      }
      res.json(companies.map(c => ({
        id: c.id,
        nombreComercial: c.nombreComercial,
        perfilCompania: c.perfilCompania,
        logoUrl: c.logoUrl,
        colorPrimario: c.colorPrimario,
        colorSidebar: c.colorSidebar,
        // Solo lo necesario para la reserva en línea; el resto de la configuración de la empresa no se expone.
        reservaAutoConsultorio: c.reservaAutoConsultorio == null ? true : !!c.reservaAutoConsultorio,
        reservaAutoDomicilio: c.reservaAutoDomicilio == null ? true : !!c.reservaAutoDomicilio,
        whatsappReservas: c.whatsappReservas || null,
        mensajeWhatsappReservas: c.mensajeWhatsappReservas || null
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/public/clinicas/:id/profesionales", async (req, res) => {
    try {
      const idCompania = parseInt(req.params.id);
      if (esCompaniaPlataforma(idCompania)) return res.status(404).json({ error: ERROR_CLINICA_NO_ENCONTRADA });
      let users: any[];
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM usuarios WHERE idCompania = ? AND activo = 1 AND rol <> 'Contador'", [idCompania]);
        users = (rows as any[]).map(row => normalizeRow(row, 'id_usuario'));
      } else {
        users = localUsers.filter(u => u.idCompania === idCompania && u.activo && u.rol !== "Contador");
      }
      res.json(users.map(u => ({
        id: u.id,
        nombre: u.nombre,
        rol: u.rol,
        aceptaDomicilio: u.ubicacionLat != null && u.ubicacionLng != null
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/public/clinicas/:id/servicios", async (req, res) => {
    try {
      const idCompania = parseInt(req.params.id);
      if (esCompaniaPlataforma(idCompania)) return res.status(404).json({ error: ERROR_CLINICA_NO_ENCONTRADA });
      let servicios: Servicio[];
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM servicios WHERE idCompania = ? AND activo = 1", [idCompania]);
        servicios = (rows as any[]).map(row => normalizeRow(row, 'id_servicio'));
      } else {
        servicios = localServicios.filter(s => s.idCompania === idCompania && s.activo);
      }
      // El IVA de la empresa no se expone: solo el precio final calculado por servicio.
      const compania = await fetchCompanyById(idCompania);
      const ivaDefecto = compania ? compania.ivaPorDefecto : 0;
      res.json(servicios.map(s => ({
        id: s.id,
        nombre: s.nombre,
        precio: s.precio,
        precioConIva: precioConIva(s.precio, ivaEfectivo(s, ivaDefecto)),
        duracionMinutos: s.duracionMinutos,
        modalidad: normalizarModalidad(s.modalidad)
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/public/clinicas/:id/pacientes/:identificacion", async (req, res) => {
    try {
      // Sin autenticación: se limita por IP (anti-enumeración de cédulas) y solo se revela
      // el primer nombre, nunca datos de contacto.
      if (excedeLimiteConsultaPaciente(req.ip || req.socket.remoteAddress || "desconocida")) {
        return res.status(429).json({ error: "Demasiadas consultas. Intente de nuevo en unos minutos." });
      }
      const idCompania = parseInt(req.params.id);
      if (esCompaniaPlataforma(idCompania)) return res.status(404).json({ error: ERROR_CLINICA_NO_ENCONTRADA });
      const identificacion = req.params.identificacion;
      let patient: Patient | undefined;
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM pacientes WHERE idCompania = ? AND identificacion = ?", [idCompania, identificacion]);
        patient = (rows as any[]).map(row => normalizeRow(row, 'id_paciente'))[0];
      } else {
        patient = localPatients.find(p => p.idCompania === idCompania && p.identificacion === identificacion);
      }
      if (!patient) return res.status(404).json({ error: "Paciente no encontrado." });
      res.json({ existe: true, nombre: (patient.nombreCompleto || "").trim().split(/\s+/)[0] || "" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/public/disponibilidad", async (req, res) => {
    try {
      const idUsuario = parseInt(req.query.idUsuario as string);
      const fecha = req.query.fecha as string;
      const tipoVisita = (req.query.tipoVisita as string) === "DOMICILIO" ? "DOMICILIO" : "CONSULTORIO";

      let user: any;
      let company: Company | undefined;
      let citasDelDia: any[];
      let bloqueosDelDia: CalendarBlock[];

      if (dbConnected && pool) {
        const [userRows] = await pool.query("SELECT * FROM usuarios WHERE id_usuario = ?", [idUsuario]);
        user = (userRows as any[]).map(row => normalizeRow(row, 'id_usuario'))[0];
        // Los usuarios de la empresa de plataforma no atienden citas.
        if (!user || esCompaniaPlataforma(user.idCompania)) return res.status(404).json({ error: "Profesional no encontrado." });

        const [companyRows] = await pool.query("SELECT * FROM companias WHERE id_compania = ?", [user.idCompania]);
        company = (companyRows as any[]).map(row => normalizeRow(row, 'id_compania'))[0];
        if (company) {
          company.horarioAtencion = await fetchHorarioAtencionCompania(company.id);
          company.horarioDomicilio = await fetchHorarioDomicilioCompania(company.id);
        }

        const [citaRows] = await pool.query("SELECT * FROM citas WHERE idUsuarioNutricionista = ? AND fechaHora LIKE ? AND estadoCita <> 'CANCELADA'", [idUsuario, `${fecha}%`]);
        citasDelDia = citaRows as any[];

        const [blockRows] = await pool.query("SELECT * FROM calendar_blocks WHERE idUsuarioNutricionista = ?", [idUsuario]);
        bloqueosDelDia = blockRows as any[];
      } else {
        user = localUsers.find(u => u.id === idUsuario);
        if (!user || esCompaniaPlataforma(user.idCompania)) return res.status(404).json({ error: "Profesional no encontrado." });
        company = localCompanies.find(c => c.id === user.idCompania);
        citasDelDia = localCitas.filter(c => c.idUsuarioNutricionista === idUsuario && c.fechaHora.startsWith(fecha) && c.estadoCita !== "CANCELADA");
        bloqueosDelDia = localCalendarBlocks.filter(b => b.idUsuarioNutricionista === idUsuario);
      }

      if (!reservaAutoActiva(company, tipoVisita)) return res.status(403).json({ error: ERROR_SOLO_WHATSAPP });

      const tramos = tramosDelDia(company, fecha, tipoVisita);
      if (tramos.length === 0) return res.json([]);

      let duracionMin = DURACION_POR_TIPO_VISITA[tipoVisita];
      if (req.query.idServicio) {
        const idServicio = parseInt(req.query.idServicio as string);
        let servicio: Servicio | undefined;
        if (dbConnected && pool) {
          const [servicioRows] = await pool.query("SELECT * FROM servicios WHERE id_servicio = ? AND idCompania = ? AND activo = 1", [idServicio, user.idCompania]);
          servicio = (servicioRows as any[]).map(row => normalizeRow(row, 'id_servicio'))[0];
        } else {
          servicio = localServicios.find(s => s.id === idServicio && s.idCompania === user.idCompania && s.activo);
        }
        if (servicio) {
          if (!servicioCompatible(servicio.modalidad, tipoVisita)) return res.status(400).json({ error: ERROR_SERVICIO_INCOMPATIBLE });
          duracionMin = servicio.duracionMinutos;
        }
      }
      const candidatos = generarSlotsCandidatos(tramos);
      const libres = candidatos.filter(hora => slotLibre({
        candidatoInicioMin: minutosDesdeMedianoche(hora),
        duracionMin,
        citasDelDia,
        bloqueosDelDia,
        fecha,
        horaCandidato: hora,
        tramos
      }));

      res.json(libres);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/public/citas", async (req, res) => {
    try {
      const body = req.body;
      const idCompania = parseInt(body.idCompania);
      if (esCompaniaPlataforma(idCompania)) return res.status(404).json({ error: ERROR_CLINICA_NO_ENCONTRADA });
      const idUsuarioNutricionista = parseInt(body.idUsuarioNutricionista);
      const tipoVisita: "CONSULTORIO" | "DOMICILIO" = body.tipoVisita === "DOMICILIO" ? "DOMICILIO" : "CONSULTORIO";
      if (!esFechaHoraValida(body.fechaHora)) return res.status(400).json({ error: "Fecha y hora de la cita inválidas." });
      const fechaHora = body.fechaHora as string;
      if (fechaHoraEsPasada(fechaHora)) return res.status(400).json({ error: "No se puede agendar una cita en una fecha y hora pasada." });
      if (!body.paciente || typeof body.paciente !== "object") return res.status(400).json({ error: "Faltan los datos del paciente." });
      const fecha = fechaHora.split("T")[0];
      const hora = fechaHora.split("T")[1];

      let user: any;
      let company: Company | undefined;
      if (dbConnected && pool) {
        const [userRows] = await pool.query("SELECT * FROM usuarios WHERE id_usuario = ?", [idUsuarioNutricionista]);
        user = (userRows as any[]).map(row => normalizeRow(row, 'id_usuario'))[0];
        const [companyRows] = await pool.query("SELECT * FROM companias WHERE id_compania = ?", [idCompania]);
        company = (companyRows as any[]).map(row => normalizeRow(row, 'id_compania'))[0];
        if (company) {
          company.horarioAtencion = await fetchHorarioAtencionCompania(company.id);
          company.horarioDomicilio = await fetchHorarioDomicilioCompania(company.id);
        }
      } else {
        user = localUsers.find(u => u.id === idUsuarioNutricionista);
        company = localCompanies.find(c => c.id === idCompania);
      }
      if (!user) return res.status(404).json({ error: "Profesional no encontrado." });
      // El profesional debe pertenecer a la empresa indicada y estar activo.
      if (user.idCompania !== idCompania || !user.activo || user.rol === "Contador") {
        return res.status(400).json({ error: "El profesional seleccionado no está disponible en esta empresa." });
      }

      if (!reservaAutoActiva(company, tipoVisita)) return res.status(403).json({ error: ERROR_SOLO_WHATSAPP });

      // La duración viene del servicio elegido (si el negocio tiene catálogo
      // configurado); si no se eligió servicio, cae al valor fijo por tipo de
      // visita de siempre.
      let duracionMinutos = DURACION_POR_TIPO_VISITA[tipoVisita];
      let idServicio: number | null = null;
      if (body.idServicio) {
        idServicio = parseInt(body.idServicio);
        let servicio: Servicio | undefined;
        if (dbConnected && pool) {
          const [servicioRows] = await pool.query("SELECT * FROM servicios WHERE id_servicio = ? AND idCompania = ? AND activo = 1", [idServicio, idCompania]);
          servicio = (servicioRows as any[]).map(row => normalizeRow(row, 'id_servicio'))[0];
        } else {
          servicio = localServicios.find(s => s.id === idServicio && s.idCompania === idCompania && s.activo);
        }
        if (!servicio) {
          return res.status(400).json({ error: "Servicio no encontrado o inactivo." });
        }
        if (!servicioCompatible(servicio.modalidad, tipoVisita)) {
          return res.status(400).json({ error: ERROR_SERVICIO_INCOMPATIBLE });
        }
        duracionMinutos = servicio.duracionMinutos;
      }

      let tiempoTrasladoMinutos: number | null = null;
      if (tipoVisita === "DOMICILIO") {
        if (user.ubicacionLat == null || user.ubicacionLng == null) {
          return res.status(400).json({ error: "Este profesional no tiene ubicación configurada para visitas a domicilio." });
        }
        const pacienteLat = parseFloat(body.pacienteLat);
        const pacienteLng = parseFloat(body.pacienteLng);

        // El traslado se calcula desde la cita inmediatamente anterior de ese
        // mismo día: si esa cita fue a domicilio, el especialista viaja desde
        // la ubicación de ese cliente anterior (no desde su base); solo si no
        // hay cita previa a domicilio se usa la ubicación del especialista.
        let origenLat = parseFloat(user.ubicacionLat);
        let origenLng = parseFloat(user.ubicacionLng);
        let citasDelDiaPrevias: any[];
        if (dbConnected && pool) {
          const [citaRows] = await pool.query("SELECT * FROM citas WHERE idUsuarioNutricionista = ? AND fechaHora LIKE ? AND estadoCita <> 'CANCELADA'", [idUsuarioNutricionista, `${fecha}%`]);
          citasDelDiaPrevias = citaRows as any[];
        } else {
          citasDelDiaPrevias = localCitas.filter(c => c.idUsuarioNutricionista === idUsuarioNutricionista && c.fechaHora.startsWith(fecha) && c.estadoCita !== "CANCELADA");
        }
        const citaAnterior = citasDelDiaPrevias
          .filter(c => c.fechaHora < fechaHora)
          .sort((a, b) => (a.fechaHora < b.fechaHora ? 1 : -1))[0];
        if (citaAnterior && citaAnterior.tipoVisita === "DOMICILIO" && citaAnterior.pacienteLat != null && citaAnterior.pacienteLng != null) {
          origenLat = parseFloat(citaAnterior.pacienteLat);
          origenLng = parseFloat(citaAnterior.pacienteLng);
        }

        try {
          // mysql2 devuelve columnas DECIMAL como strings, no numbers — forzar
          // parseFloat aquí (mismo patrón ya usado en este archivo para
          // ivaPorDefecto) para no interpolar un string sin validar en la URL.
          tiempoTrasladoMinutos = await calcularTiempoTrasladoMinutos({
            origenLat,
            origenLng,
            destinoLat: pacienteLat,
            destinoLng: pacienteLng
          });
        } catch (err: any) {
          if (err instanceof TrasladoNoCalculableError) {
            return res.status(400).json({ error: err.message });
          }
          throw err;
        }
        if (tiempoTrasladoMinutos > user.maxTiempoTrasladoMinutos) {
          return res.status(400).json({
            error: `El tiempo de traslado estimado (${tiempoTrasladoMinutos} min) supera el máximo que este profesional acepta (${user.maxTiempoTrasladoMinutos} min).`
          });
        }
      }

      const pac = body.paciente;
      let paciente: Patient | undefined;
      let nuevaCita: any;

      if (dbConnected && pool) {
        // Todo el bloque de re-verificación + inserción va en una sola transacción: sin esto,
        // dos solicitudes casi simultáneas para el mismo horario podían pasar ambas el chequeo
        // de disponibilidad antes de que cualquiera insertara, agendando doble al profesional
        // (condición de carrera "check-then-insert").
        //
        // El lock se toma sobre la fila de `usuarios` del profesional (que siempre existe), NO
        // sobre `citas` — se verificó empíricamente contra esta base (MariaDB 10.4) que un
        // `SELECT ... FOR UPDATE` sobre `citas` con cero filas coincidentes (el caso exacto de
        // dos personas compitiendo por un horario libre) no toma ningún bloqueo de rango/gap:
        // una segunda transacción concurrente pasaba igual, sin esperar. Bloquear una fila que
        // siempre existe evita depender de ese comportamiento de gap-locking.
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();

          await connection.query("SELECT id_usuario FROM usuarios WHERE id_usuario = ? FOR UPDATE", [idUsuarioNutricionista]);

          const [citaRows] = await connection.query("SELECT * FROM citas WHERE idUsuarioNutricionista = ? AND fechaHora LIKE ? AND estadoCita <> 'CANCELADA'", [idUsuarioNutricionista, `${fecha}%`]);
          const citasDelDia = citaRows as any[];
          const [blockRows] = await connection.query("SELECT * FROM calendar_blocks WHERE idUsuarioNutricionista = ?", [idUsuarioNutricionista]);
          const bloqueosDelDia = blockRows as any[];

          const libre = slotLibre({
            candidatoInicioMin: minutosDesdeMedianoche(hora),
            duracionMin: duracionMinutos,
            citasDelDia,
            bloqueosDelDia,
            fecha,
            horaCandidato: hora,
            tramos: tramosDelDia(company, fecha, tipoVisita)
          });
          if (!libre) {
            // El release lo hace el finally (antes se liberaba aquí también: doble release).
            await connection.rollback();
            return res.status(409).json({ error: "Ese horario ya no está disponible. Por favor escoja otro." });
          }

          // Buscar o crear paciente por cédula
          const [existing] = await connection.query("SELECT * FROM pacientes WHERE idCompania = ? AND identificacion = ?", [idCompania, pac.identificacion]);
          paciente = (existing as any[]).map(row => normalizeRow(row, 'id_paciente'))[0];

          if (!paciente) {
            validarDatosPacienteNuevo(pac);
            const nuevoPaciente: any = {
              idCompania,
              nombreCompleto: pac.nombreCompleto,
              fechaNacimiento: pac.fechaNacimiento,
              edad: (() => {
                const nacimiento = new Date(pac.fechaNacimiento);
                const hoy = new Date();
                let edad = hoy.getFullYear() - nacimiento.getFullYear();
                const m = hoy.getMonth() - nacimiento.getMonth();
                if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
                return isNaN(edad) ? 0 : edad;
              })(),
              ocupacion: "",
              correoElectronico: pac.correoElectronico,
              situacionVivienda: "SOLO",
              tipoIdentificacion: pac.tipoIdentificacion,
              identificacion: pac.identificacion,
              telefono: pac.telefono,
              provinciaId: 1,
              cantonId: 101,
              distritoId: 10101,
              otrasSenas: tipoVisita === "DOMICILIO" ? (body.direccionDomicilio || "") : "",
              diabetes: false,
              hipertension: false,
              gastritis: false,
              estrenimiento: false,
              alergiasAlimentarias: "",
              fracturas: "",
              esguinces: "",
              cirugiasOrtopedicas: "",
              actividadFisica: ""
            };

            const [result] = await connection.query(
              "INSERT INTO pacientes (idCompania, nombreCompleto, fechaNacimiento, edad, ocupacion, correoElectronico, situacionVivienda, tipoIdentificacion, identificacion, telefono, provinciaId, cantonId, distritoId, otrasSenas, diabetes, hipertension, gastritis, estrenimiento, alergiasAlimentarias, fracturas, esguinces, cirugiasOrtopedicas, actividadFisica) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [
                nuevoPaciente.idCompania, nuevoPaciente.nombreCompleto, nuevoPaciente.fechaNacimiento, nuevoPaciente.edad, nuevoPaciente.ocupacion, nuevoPaciente.correoElectronico, nuevoPaciente.situacionVivienda, nuevoPaciente.tipoIdentificacion, nuevoPaciente.identificacion, nuevoPaciente.telefono, nuevoPaciente.provinciaId, nuevoPaciente.cantonId, nuevoPaciente.distritoId, nuevoPaciente.otrasSenas, 0, 0, 0, 0, nuevoPaciente.alergiasAlimentarias, nuevoPaciente.fracturas, nuevoPaciente.esguinces, nuevoPaciente.cirugiasOrtopedicas, nuevoPaciente.actividadFisica
              ]
            );
            nuevoPaciente.id = (result as any).insertId;
            paciente = nuevoPaciente;
          } else {
            // Paciente existente (endpoint SIN autenticación): NO se sobrescriben sus datos de
            // contacto — si no, cualquiera con una cédula podría cambiar el correo y recibir sus
            // notificaciones. Solo se completan campos que estén vacíos. Las notificaciones de
            // la cita van siempre al correo REGISTRADO.
            const vacios = camposVaciosDelPaciente(paciente, pac);
            const columnas = Object.keys(vacios);
            if (columnas.length > 0) {
              await connection.query(
                `UPDATE pacientes SET ${columnas.map(c => `${c} = ?`).join(", ")} WHERE id_paciente = ? AND idCompania = ?`,
                [...columnas.map(c => vacios[c]), paciente.id, idCompania]
              );
              paciente = { ...paciente, ...vacios };
            }
          }

          nuevaCita = {
            idCompania,
            idPaciente: paciente!.id,
            idUsuarioNutricionista,
            idConsulta: null,
            idServicio,
            fechaHora,
            duracionMinutos,
            estadoCita: company?.requiereConfirmacionCitas ? "PROGRAMADA" : "CONFIRMADA",
            notas: "",
            tipoVisita,
            direccionDomicilio: tipoVisita === "DOMICILIO" ? body.direccionDomicilio : null,
            pacienteLat: tipoVisita === "DOMICILIO" ? parseFloat(body.pacienteLat) : null,
            pacienteLng: tipoVisita === "DOMICILIO" ? parseFloat(body.pacienteLng) : null,
            tiempoTrasladoMinutos
          };

          const [result] = await connection.query(
            "INSERT INTO citas (idCompania, idPaciente, idUsuarioNutricionista, idConsulta, idServicio, fechaHora, duracionMinutos, estadoCita, notas, tipoVisita, direccionDomicilio, pacienteLat, pacienteLng, tiempoTrasladoMinutos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [nuevaCita.idCompania, nuevaCita.idPaciente, nuevaCita.idUsuarioNutricionista, nuevaCita.idConsulta, nuevaCita.idServicio, nuevaCita.fechaHora, nuevaCita.duracionMinutos, nuevaCita.estadoCita, nuevaCita.notas, nuevaCita.tipoVisita, nuevaCita.direccionDomicilio, nuevaCita.pacienteLat, nuevaCita.pacienteLng, nuevaCita.tiempoTrasladoMinutos]
          );
          nuevaCita.id = (result as any).insertId;

          await connection.commit();
        } catch (err) {
          await connection.rollback();
          throw err;
        } finally {
          connection.release();
        }
      } else {
        // Modo local (sin MySQL): un solo proceso Node operando sobre arreglos en memoria sin
        // await entre el chequeo y la escritura — no hay ventana real de condición de carrera
        // que una transacción pudiera cerrar aquí.
        const citasDelDia: any[] = localCitas.filter(c => c.idUsuarioNutricionista === idUsuarioNutricionista && c.fechaHora.startsWith(fecha));
        const bloqueosDelDia = localCalendarBlocks.filter(b => b.idUsuarioNutricionista === idUsuarioNutricionista);

        const libre = slotLibre({
          candidatoInicioMin: minutosDesdeMedianoche(hora),
          duracionMin: duracionMinutos,
          citasDelDia,
          bloqueosDelDia,
          fecha,
          horaCandidato: hora,
          tramos: tramosDelDia(company, fecha, tipoVisita)
        });
        if (!libre) {
          return res.status(409).json({ error: "Ese horario ya no está disponible. Por favor escoja otro." });
        }

        paciente = localPatients.find(p => p.idCompania === idCompania && p.identificacion === pac.identificacion);

        if (!paciente) {
          validarDatosPacienteNuevo(pac);
          const nuevoPaciente: any = {
            idCompania,
            nombreCompleto: pac.nombreCompleto,
            fechaNacimiento: pac.fechaNacimiento,
            edad: (() => {
              const nacimiento = new Date(pac.fechaNacimiento);
              const hoy = new Date();
              let edad = hoy.getFullYear() - nacimiento.getFullYear();
              const m = hoy.getMonth() - nacimiento.getMonth();
              if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) edad--;
              return isNaN(edad) ? 0 : edad;
            })(),
            ocupacion: "",
            correoElectronico: pac.correoElectronico,
            situacionVivienda: "SOLO",
            tipoIdentificacion: pac.tipoIdentificacion,
            identificacion: pac.identificacion,
            telefono: pac.telefono,
            provinciaId: 1,
            cantonId: 101,
            distritoId: 10101,
            otrasSenas: tipoVisita === "DOMICILIO" ? (body.direccionDomicilio || "") : "",
            diabetes: false,
            hipertension: false,
            gastritis: false,
            estrenimiento: false,
            alergiasAlimentarias: "",
            fracturas: "",
            esguinces: "",
            cirugiasOrtopedicas: "",
            actividadFisica: ""
          };
          nuevoPaciente.id = Math.max(0, ...localPatients.map(p => p.id)) + 1;
          localPatients.push(nuevoPaciente);
          paciente = nuevoPaciente;
        } else {
          // Igual que en MySQL: no se sobrescriben datos de contacto, solo se completan los vacíos.
          const vacios = camposVaciosDelPaciente(paciente, pac);
          if (Object.keys(vacios).length > 0) {
            const idx = localPatients.findIndex(p => p.id === paciente!.id);
            if (idx !== -1) localPatients[idx] = { ...localPatients[idx], ...vacios };
            paciente = { ...paciente, ...vacios };
          }
        }

        nuevaCita = {
          idCompania,
          idPaciente: paciente!.id,
          idUsuarioNutricionista,
          idConsulta: null,
          idServicio,
          fechaHora,
          duracionMinutos,
          estadoCita: company?.requiereConfirmacionCitas ? "PROGRAMADA" : "CONFIRMADA",
          notas: "",
          tipoVisita,
          direccionDomicilio: tipoVisita === "DOMICILIO" ? body.direccionDomicilio : null,
          pacienteLat: tipoVisita === "DOMICILIO" ? parseFloat(body.pacienteLat) : null,
          pacienteLng: tipoVisita === "DOMICILIO" ? parseFloat(body.pacienteLng) : null,
          tiempoTrasladoMinutos
        };
        nuevaCita.id = Math.max(0, ...localCitas.map(c => c.id)) + 1;
        localCitas.push(nuevaCita);
      }

      // Confirmación por correo al cliente y notificación al especialista.
      // Best-effort: un fallo de correo no debe impedir que la cita quede
      // creada, así que los errores solo se registran en consola.
      try {
        let smtpConfig: CompaniaSmtpConfig | undefined;
        if (dbConnected && pool) {
          const [smtpRows] = await pool.query("SELECT * FROM compania_smtp_config WHERE idCompania = ?", [idCompania]);
          const smtpRow = (smtpRows as any[])[0];
          smtpConfig = smtpRow ? { ...smtpRow, activo: !!smtpRow.activo } : undefined;
        } else {
          smtpConfig = localSmtpConfigs.find(s => s.idCompania === idCompania);
        }

        if (company && smtpConfig && smtpConfig.activo) {
          const servicioCita = await nombreServicioDeCita(idServicio, idCompania);
          const correoCliente = renderCitaEmail({ company, patient: paciente!, cita: nuevaCita, tipoNotif: "CONFIRMACION", servicio: servicioCita, profesional: user.nombre });
          const correoEspecialista = renderCitaEmailProfesional({ company, professional: user, patient: paciente!, cita: nuevaCita, servicio: servicioCita });

          const adjuntosCliente: AdjuntoEmail[] = [];
          try {
            adjuntosCliente.push(adjuntoIcsParaPaciente(nuevaCita, {
              nombreClinica: company.nombreComercial,
              servicio: await nombreServicioDeCita(idServicio, idCompania),
              cancelar: false
            }));
          } catch (err) {
            console.error("No se pudo generar el .ics de la cita:", err);
          }

          await sendMail(smtpConfig, { to: paciente!.correoElectronico, subject: correoCliente.subject, html: correoCliente.html, text: correoCliente.text, attachments: adjuntosCliente });
          await sendMail(smtpConfig, { to: user.correo, subject: correoEspecialista.subject, html: correoEspecialista.html, text: correoEspecialista.text });

          const enviadoEn = new Date().toISOString();
          const logsAEnviar = [
            { destinatario: paciente!.correoElectronico, asunto: correoCliente.subject, cuerpo: correoCliente.text },
            { destinatario: user.correo, asunto: correoEspecialista.subject, cuerpo: correoEspecialista.text }
          ];
          for (const l of logsAEnviar) {
            if (dbConnected && pool) {
              await pool.query(
                "INSERT INTO notification_logs (idCompania, idCita, tipo, destinatario, asunto, cuerpo, enviadoEn) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [idCompania, nuevaCita.id, "CONFIRMACION", l.destinatario, l.asunto, l.cuerpo, enviadoEn]
              );
            } else {
              localLogs.push({
                id: Math.max(0, ...localLogs.map((item: any) => item.id), 0) + 1,
                idCompania,
                idCita: nuevaCita.id,
                tipo: "CONFIRMACION",
                destinatario: l.destinatario,
                asunto: l.asunto,
                cuerpo: l.cuerpo,
                enviadoEn
              } as any);
            }
          }
        }
      } catch (mailErr: any) {
        console.error("Error enviando correos de confirmación de cita pública:", mailErr);
      }

      res.json(nuevaCita);
    } catch (err: any) {
      if (err instanceof CitaError) return res.status(err.status).json({ error: err.message });
      res.status(500).json({ error: err.message });
    }
  });

  // Serve Vite in development, or compiled static files in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: express.Request, res: express.Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const { cert, key } = obtenerCertificadoHttps();
  https.createServer({ cert, key }, app).listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor HTTPS corriendo en el puerto ${PORT}`);
  });

  // Recordatorios de documentos pendientes (perfil Legal). Solo en producción: el .env de
  // desarrollo apunta a la misma BD, y un `npm run dev` junto a pm2 enviaría cada correo doble.
  if (process.env.NODE_ENV === "production") {
    setTimeout(procesarRecordatoriosCasos, 60_000);
    setInterval(procesarRecordatoriosCasos, 60 * 60_000);
    // Facturas de proveedor por correo: cada 5 min; del otro lado hay un servidor IMAP ajeno y una
    // factura que llega a la bandeja unos minutos después no le cambia el día a nadie.
    setTimeout(procesarCorreosProveedores, 90_000);
    setInterval(procesarCorreosProveedores, 5 * 60_000);
    // Cola de transmisión a Hacienda (comprobantes PENDIENTE / ENVIADA / envío incierto). El
    // intervalo sale de parametros_sistema (hacienda_cola_intervalo_seg) y se relee en cada vuelta.
    baseDeDatosLista.then(() => setTimeout(() => { programarColaHacienda().catch(() => {}); }, 30_000));
    // Integración con el ERP: reintenta sincronizaciones pendientes, refresca estados de cuenta y
    // aplica la suspensión por mora. Intervalo y activación en parametros_sistema (erp_sync_*).
    baseDeDatosLista.then(() => setTimeout(() => { erpServicio.programarJob().catch(() => {}); }, 120_000));
  }
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
});

