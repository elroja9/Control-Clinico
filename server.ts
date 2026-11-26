import express from "express";
import https from "https";
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
  SAAS_ADMIN_COMPANY_ID,
  type SessionPayload
} from "./server/auth";
import { obtenerCertificadoHttps } from "./server/httpsCert";
import { verificarLlaveP12, firmarXadesEpes } from "./server/haciendaSigner";
import {
  calcularLineas,
  calcularResumen,
  limpiarCodigoActividad,
  limpiarIdentificacion,
  generarConsecutivo,
  generarClaveNumerica,
  fechaEmisionCR,
  construirXmlFactura,
  construirXmlNotaCredito,
  construirXmlNotaDebito,
  RAZON_MAX
} from "./server/haciendaFactura";
import { obtenerTokenHacienda, enviarFacturaHacienda, consultarEstadoHacienda, esperarResolucionHacienda, HACIENDA_FETCH_TIMEOUT_MS } from "./server/haciendaApi";
import type { AmbienteHacienda, EstadoHaciendaResultado } from "./server/haciendaApi";
import { fechaCR, sumarDiasCR } from "./src/utils/fechaCR";
import { errorIdentificacion } from "./src/utils/identificacion";
import { ivaEfectivo, precioConIva } from "./src/utils/precios";
import { serviciosDefectoParaPerfil } from "./server/serviciosDefecto";
import { parsearFacturaProveedorXML } from "./server/xmlProveedorParser";
import type { CompaniaSmtpConfig } from "./src/data/mockData";
import { sendMail, createTransportFromConfig } from "./server/mailer";
import type { AdjuntoEmail } from "./server/mailer";
import { generarPdfDesdeHtml } from "./server/pdf";
import { renderFacturaPdf, renderConsultaPacientePdf } from "./server/pdfTemplates";
import { renderCitaEmail, renderCitaEmailProfesional, renderConsultaEmail, renderFacturaEmail, renderAccountStatusEmail, renderNuevaEmpresaEmail, renderPasswordResetEmail, renderRecordatorioDocumentosEmail, renderSmtpTestEmail } from "./server/emailTemplates";
import { calcularTiempoTrasladoMinutos, TrasladoNoCalculableError } from "./server/googleMaps";
import { tocaRecordatorio } from "./server/recordatoriosCasos";
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
}
let localHaciendaConfigs: LocalHaciendaConfig[] = [];

type CredencialesAtv = { ambiente: AmbienteHacienda; usuarioAtv: string; passwordAtv: string };
type CertificadoEmpresa = { p12Base64: string; pin: string };

/** Montos con 5 decimales, la precisión de los comprobantes de Hacienda. */
function redondearMonto(n: number): number {
  return Math.round(n * 100000) / 100000;
}

// condicionVenta y medioPago llegan del navegador y terminan dentro del XML que se firma con la llave
// de la empresa: solo se aceptan códigos de catálogo de Hacienda (dos dígitos).
function esCodigoCatalogo(valor: unknown): valor is string {
  return typeof valor === "string" && /^\d{2}$/.test(valor);
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

function minutosDesdeMedianoche(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

const DURACION_POR_TIPO_VISITA: Record<"CONSULTORIO" | "DOMICILIO", number> = {
  CONSULTORIO: 45,
  DOMICILIO: 60
};

function slotLibre(params: {
  candidatoInicioMin: number;
  duracionMin: number;
  citasDelDia: Array<{ fechaHora: string; duracionMinutos: number; tipoVisita: string; tiempoTrasladoMinutos: number | null }>;
  bloqueosDelDia: CalendarBlock[];
  fecha: string;
  horaCandidato: string;
  tramos: Array<{ abre: string; cierra: string }>;
}): boolean {
  const { candidatoInicioMin, duracionMin, citasDelDia, bloqueosDelDia, fecha, horaCandidato, tramos } = params;
  const candidatoFinMin = candidatoInicioMin + duracionMin;

  // generarSlotsCandidatos() solo genera horas de INICIO anteriores al cierre — no garantiza
  // que la cita quepa completa antes de cerrar. Sin este chequeo, un servicio de 60 min
  // ofrecía como "libre" un inicio a las 17:30 con cierre a las 18:00 (terminaría a las 18:30,
  // media hora después de cerrado). Verificado contra datos reales: la cita #15 de ELRONUTRI
  // quedó agendada viernes 17:30–18:30 con horario de cierre 18:00.
  // Con horario fraccionado, la cita completa debe caber dentro de UN solo tramo.
  const cabeEnUnTramo = tramos.some(t =>
    candidatoInicioMin >= minutosDesdeMedianoche(t.abre) && candidatoFinMin <= minutosDesdeMedianoche(t.cierra)
  );
  if (!cabeEnUnTramo) return false;
  // El listado de disponibilidad (generarSlotsCandidatos) nunca ofrece horas antes de la
  // apertura, pero POST /api/public/citas reutiliza esta misma función para re-verificar el
  // horario justo antes de guardar — sin este límite inferior, una llamada directa al API (sin
  // pasar por el listado) podía agendar antes de que abra el negocio (cubierto arriba por el
  // límite inferior de cabeEnUnTramo).

  for (const b of bloqueosDelDia) {
    if (fecha < b.fechaInicio || fecha > b.fechaFin) continue;
    if (!b.horaInicio || !b.horaFin) return false;
    if (horaCandidato >= b.horaInicio && horaCandidato < b.horaFin) return false;
  }

  for (const c of citasDelDia) {
    const citaFecha = c.fechaHora.split("T")[0];
    if (citaFecha !== fecha) continue;
    const citaHora = c.fechaHora.split("T")[1];
    const citaInicioMin = minutosDesdeMedianoche(citaHora);
    const padding = c.tipoVisita === "DOMICILIO" ? (c.tiempoTrasladoMinutos || 0) : 0;
    const ocupadoInicio = citaInicioMin - padding;
    const ocupadoFin = citaInicioMin + c.duracionMinutos + padding;
    if (candidatoInicioMin < ocupadoFin && candidatoFinMin > ocupadoInicio) return false;
  }

  return true;
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
// A diferencia de las 3 evaluaciones, varios campos que la app guardaba en el JSON son alias
// exactos de otro (verificado en server/haciendaFactura.ts::calcularLineas: subTotal === montoTotal,
// baseImponible === subTotal, impuestoNeto === montoIva) — se reconstruyen aquí en vez de tener
// columna propia. `numeroLinea` se deriva del orden de inserción (ORDER BY id_linea).
function reconstruirLineaFactura(row: any, numeroLinea: number): any {
  const montoTotal = row.monto_total;
  const montoIva = row.monto_iva;
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
    subTotal: montoTotal,
    baseImponible: montoTotal,
    montoIva,
    impuestoNeto: montoIva,
    montoTotalLinea: montoTotal + montoIva
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
  const placeholders = lineas.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
  const valores: any[] = [];
  for (const l of lineas) {
    valores.push(
      idFactura, l.idServicio ?? null, l.tipo, l.detalle, l.unidadMedida, l.codigoCabys ?? null,
      l.cantidad, l.precioUnitario, l.porcentajeIva, l.codigoTarifaIva, l.montoIva, l.montoTotal
    );
  }
  await connection.query(
    `INSERT INTO factura_lineas
      (id_factura, id_servicio, tipo, detalle, unidad_medida, codigo_cabys, cantidad, precio_unitario,
       porcentaje_iva, codigo_tarifa_iva, monto_iva, monto_total)
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

// Ensure database setup starts asynchronously
setupDatabase();

async function startServer() {
  const app = express();
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

  function getSession(req: express.Request): SessionPayload | null {
    const token = readCookie(req.headers.cookie, "cc_session");
    if (!token) return null;
    return verifySessionToken(token);
  }

  function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    const session = getSession(req);
    if (!session) {
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
    const { contrasena, ...safeUser } = u;
    return safeUser;
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

      const token = createSessionToken({ userId: user.id, idCompania: user.idCompania, rol: user.rol });
      res.setHeader("Set-Cookie", serializeSessionCookie(token, SESSION_MAX_AGE_SECONDS));

      const { contrasena, ...safeUser } = user;
      res.json({ user: safeUser, company });
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

      // El correo se envía SIEMPRE a través del SMTP de la empresa 7 (la empresa de la
      // plataforma) — no del SMTP de la empresa del usuario, que en la práctica casi nunca
      // está configurado por cada clínica. `company` (la empresa real del usuario) se sigue
      // usando para el nombre que aparece en el correo, solo cambia el transporte SMTP.
      const SMTP_COMPANIA_PLATAFORMA = 7;
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

      if (dbConnected && pool) {
        await pool.query("UPDATE usuarios SET contrasena = ? WHERE id_usuario = ?", [hash, user.id]);
      } else {
        localUsers = localUsers.map(u => u.id === user.id ? { ...u, contrasena: hash } : u);
      }

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

    const { contrasena, ...safeUser } = user;
    res.json({ user: safeUser, company });
  });

  // DB Connection Status Endpoint
  app.get("/api/db-status", (req, res) => {
    res.json({
      connected: dbConnected,
      error: dbError,
      server: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME
    });
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

      if (dbConnected && pool) {
        if (c.id) {
          const [exists] = await pool.query("SELECT * FROM companias WHERE id_compania = ?", [c.id]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE companias SET nombreComercial = ?, razonSocial = ?, tipoIdentificacion = ?, identificacion = ?, correoEmisor = ?, ivaPorDefecto = ?, colorPrimario = ?, colorSidebar = ?, logoUrl = ?, actividadEconomica = ?, perfilCompania = ?, estadoSaas = ?, maxUsuarios = ?, montoMensual = ?, proximoVencimiento = ?, requiereConfirmacionCitas = ?, provincia = ?, canton = ?, distrito = ?, otrasSenas = ?, regimenSimplificado = ?, plazoCreditoClientesDias = COALESCE(?, plazoCreditoClientesDias), plazoCreditoProveedoresDias = COALESCE(?, plazoCreditoProveedoresDias) WHERE id_compania = ?",
              [
                c.nombreComercial, c.razonSocial, c.tipoIdentificacion, c.identificacion, c.correoEmisor, parseFloat(c.ivaPorDefecto), c.colorPrimario, c.colorSidebar, c.logoUrl, c.actividadEconomica, c.perfilCompania,
                c.estadoSaas, c.maxUsuarios, c.montoMensual != null ? c.montoMensual : null, c.proximoVencimiento || null, c.requiereConfirmacionCitas ? 1 : 0,
                c.provincia || null, c.canton || null, c.distrito || null, c.otrasSenas || null, c.regimenSimplificado ? 1 : 0,
                plazoClientes, plazoProveedores,
                c.id
              ]
            );
            await guardarHorarioAtencionCompania(pool, c.id, c.horarioAtencion);
            if (horarioDomicilioNormalizado !== undefined) await guardarHorarioDomicilioCompania(c.id, horarioDomicilioNormalizado);
            return res.json(c);
          }
        }
        const [result] = await pool.query(
          "INSERT INTO companias (nombreComercial, razonSocial, tipoIdentificacion, identificacion, correoEmisor, ivaPorDefecto, colorPrimario, colorSidebar, logoUrl, actividadEconomica, perfilCompania, estadoSaas, maxUsuarios, montoMensual, proximoVencimiento, requiereConfirmacionCitas, provincia, canton, distrito, otrasSenas, regimenSimplificado, plazoCreditoClientesDias, plazoCreditoProveedoresDias) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, DEFAULT(plazoCreditoClientesDias)), COALESCE(?, DEFAULT(plazoCreditoProveedoresDias)))",
          [
            c.nombreComercial, c.razonSocial, c.tipoIdentificacion, c.identificacion, c.correoEmisor, parseFloat(c.ivaPorDefecto), c.colorPrimario, c.colorSidebar, c.logoUrl, c.actividadEconomica, c.perfilCompania,
            c.estadoSaas || 'PENDIENTE', c.maxUsuarios || 5, c.montoMensual != null ? c.montoMensual : null, c.proximoVencimiento || null, c.requiereConfirmacionCitas ? 1 : 0,
            c.provincia || null, c.canton || null, c.distrito || null, c.otrasSenas || null, c.regimenSimplificado ? 1 : 0,
            plazoClientes, plazoProveedores
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

        // Avisar a los administradores de la empresa 7 (la plataforma) de que
        // hay una empresa nueva pendiente de revisión/aprobación. Best-effort:
        // un fallo de correo no debe impedir que la empresa quede creada.
        if (c.id !== 7) {
          try {
            const [platRows] = await pool.query("SELECT * FROM companias WHERE id_compania = 7");
            const platformCompany: Company | undefined = (platRows as any[]).map(row => normalizeRow(row, 'id_compania'))[0];
            const [smtpRows] = await pool.query("SELECT * FROM compania_smtp_config WHERE idCompania = 7");
            const smtpRow = (smtpRows as any[])[0];
            const platformSmtp: CompaniaSmtpConfig | undefined = smtpRow ? { ...smtpRow, activo: !!smtpRow.activo } : undefined;
            const [adminRows] = await pool.query("SELECT * FROM usuarios WHERE idCompania = 7 AND rol = 'Administrador'");
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

  app.post("/api/companies/:id/estado-saas", requireAuth, requireSaasAdmin, async (req, res) => {
    try {
      const companyId = parseInt(req.params.id);
      const nuevoEstado = req.body.estadoSaas as Company["estadoSaas"];
      if (nuevoEstado !== "ACTIVA" && nuevoEstado !== "SUSPENDIDA" && nuevoEstado !== "PENDIENTE") {
        return res.status(400).json({ error: "estadoSaas inválido." });
      }

      let company: Company | undefined;
      let estadoAnterior: Company["estadoSaas"] | undefined;

      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM companias WHERE id_compania = ?", [companyId]);
        company = (rows as any[]).map(row => normalizeRow(row, 'id_compania'))[0];
        if (!company) return res.status(404).json({ error: "Empresa no encontrada." });
        estadoAnterior = company.estadoSaas;
        await pool.query("UPDATE companias SET estadoSaas = ? WHERE id_compania = ?", [nuevoEstado, companyId]);
        company.estadoSaas = nuevoEstado;
      } else {
        company = localCompanies.find(c => c.id === companyId);
        if (!company) return res.status(404).json({ error: "Empresa no encontrada." });
        estadoAnterior = company.estadoSaas;
        company.estadoSaas = nuevoEstado;
        localCompanies = localCompanies.map(c => c.id === companyId ? company! : c);
      }

      if (nuevoEstado === "ACTIVA" || nuevoEstado === "SUSPENDIDA") {
        try {
          let platformCompany: Company | undefined;
          let platformSmtp: CompaniaSmtpConfig | undefined;
          let adminUser: any;

          if (dbConnected && pool) {
            const [platRows] = await pool.query("SELECT * FROM companias WHERE id_compania = 7");
            platformCompany = (platRows as any[]).map(row => normalizeRow(row, 'id_compania'))[0];
            const [smtpRows] = await pool.query("SELECT * FROM compania_smtp_config WHERE idCompania = 7");
            const smtpRow = (smtpRows as any[])[0];
            platformSmtp = smtpRow ? { ...smtpRow, activo: !!smtpRow.activo } : undefined;
            const [userRows] = await pool.query("SELECT * FROM usuarios WHERE idCompania = ? AND rol = 'Administrador' LIMIT 1", [companyId]);
            adminUser = (userRows as any[]).map(row => normalizeRow(row, 'id_usuario'))[0];
          } else {
            platformCompany = localCompanies.find(c => c.id === 7);
            platformSmtp = localSmtpConfigs.find(s => s.idCompania === 7);
            adminUser = localUsers.find(u => u.idCompania === companyId && u.rol === "Administrador");
          }

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

      res.json(company);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

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
      const idCompania = parseInt(u.idCompania);

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
        const session = getSession(req);
        const authorized = !!session && (
          isSaasAdmin(session) ||
          (u.id && session.userId === parseInt(u.id)) ||
          (session.idCompania === idCompania && session.rol === "Administrador")
        );
        if (!authorized) {
          return res.status(403).json({ error: "No autorizado." });
        }
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

      if (dbConnected && pool) {
        if (u.id) {
          // Scoped by idCompania too — an id that only collides by coincidence (never a real
          // edit of this tenant's own record) must fall through to INSERT below instead of
          // overwriting another company's user.
          const [exists] = await pool.query("SELECT * FROM usuarios WHERE id_usuario = ? AND idCompania = ?", [u.id, parseInt(u.idCompania)]);
          const existingRow = (exists as any[])[0];
          if (existingRow) {
            // Un `contrasena` vacío significa "no está cambiando la contraseña" (el cliente ya
            // no recibe hashes de contraseña en ninguna respuesta, así que un guardado que solo
            // cambia p.ej. `activo` llega sin este campo) — se conserva el hash existente en ese
            // caso en vez de sobreescribirlo con un valor vacío.
            const contrasenaFinal = u.contrasena && String(u.contrasena).trim()
              ? hashPassword(String(u.contrasena).trim())
              : existingRow.contrasena;
            await pool.query(
              "UPDATE usuarios SET idCompania = ?, nombre = ?, usuario = ?, correo = ?, contrasena = ?, rol = ?, activo = ?, ubicacionDireccion = ?, ubicacionLat = ?, ubicacionLng = ?, maxTiempoTrasladoMinutos = ? WHERE id_usuario = ?",
              [parseInt(u.idCompania), u.nombre, u.usuario, u.correo, contrasenaFinal, u.rol, u.activo ? 1 : 0, u.ubicacionDireccion || null, u.ubicacionLat != null ? parseFloat(u.ubicacionLat) : null, u.ubicacionLng != null ? parseFloat(u.ubicacionLng) : null, u.maxTiempoTrasladoMinutos || 45, u.id]
            );
            const { contrasena, ...safeUser } = u;
            return res.json(safeUser);
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
          const existing = localUsers.find(item => item.id === u.id);
          const merged = {
            ...u,
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
      const ct = req.body;
      ct.idCompania = sessionOf(req).idCompania;
      if (dbConnected && pool) {
        if (ct.id) {
          // Scoped by idCompania too — see comment on the equivalent usuarios check above.
          const [exists] = await pool.query("SELECT * FROM citas WHERE id = ? AND idCompania = ?", [ct.id, parseInt(ct.idCompania)]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE citas SET idCompania = ?, idPaciente = ?, idUsuarioNutricionista = ?, idConsulta = ?, idServicio = ?, fechaHora = ?, duracionMinutos = ?, estadoCita = ?, notas = ?, confirmacionEnviadaEn = ?, recordatorioEnviadoEn = ?, cancelacionEnviadaEn = ?, tipoVisita = ?, direccionDomicilio = ?, pacienteLat = ?, pacienteLng = ?, tiempoTrasladoMinutos = ? WHERE id = ?",
              [parseInt(ct.idCompania), parseInt(ct.idPaciente), parseInt(ct.idUsuarioNutricionista), ct.idConsulta || null, ct.idServicio || null, ct.fechaHora, parseInt(ct.duracionMinutos), ct.estadoCita, ct.notas || '', ct.confirmacionEnviadaEn || null, ct.recordatorioEnviadoEn || null, ct.cancelacionEnviadaEn || null, ct.tipoVisita || 'CONSULTORIO', ct.direccionDomicilio || null, ct.pacienteLat != null ? parseFloat(ct.pacienteLat) : null, ct.pacienteLng != null ? parseFloat(ct.pacienteLng) : null, ct.tiempoTrasladoMinutos != null ? parseInt(ct.tiempoTrasladoMinutos) : null, ct.id]
            );
            return res.json(ct);
          }
        }
        const [result] = await pool.query(
          "INSERT INTO citas (idCompania, idPaciente, idUsuarioNutricionista, idConsulta, idServicio, fechaHora, duracionMinutos, estadoCita, notas, confirmacionEnviadaEn, recordatorioEnviadoEn, cancelacionEnviadaEn, tipoVisita, direccionDomicilio, pacienteLat, pacienteLng, tiempoTrasladoMinutos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [parseInt(ct.idCompania), parseInt(ct.idPaciente), parseInt(ct.idUsuarioNutricionista), ct.idConsulta || null, ct.idServicio || null, ct.fechaHora, parseInt(ct.duracionMinutos), ct.estadoCita, ct.notas || '', ct.confirmacionEnviadaEn || null, ct.recordatorioEnviadoEn || null, ct.cancelacionEnviadaEn || null, ct.tipoVisita || 'CONSULTORIO', ct.direccionDomicilio || null, ct.pacienteLat != null ? parseFloat(ct.pacienteLat) : null, ct.pacienteLng != null ? parseFloat(ct.pacienteLng) : null, ct.tiempoTrasladoMinutos != null ? parseInt(ct.tiempoTrasladoMinutos) : null]
        );
        ct.id = (result as any).insertId;
        res.json(ct);
      } else {
        if (ct.id) {
          localCitas = localCitas.map(item => item.id === ct.id ? ct : item);
        } else {
          ct.id = Math.max(0, ...localCitas.map(item => item.id)) + 1;
          localCitas.push(ct);
        }
        res.json(ct);
      }
    } catch (err: any) {
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

      if (dbConnected && pool) {
        if (s.id) {
          // Scoped by idCompania too — see comment on the equivalent usuarios check above.
          // `stock` NUNCA se toca aquí — solo POST /api/servicios/:id/ajustar-stock puede
          // cambiarlo, para que cada cambio de existencias quede en movimientos_inventario en
          // vez de poder sobreescribirse en silencio desde este formulario genérico.
          const [exists] = await pool.query("SELECT id_servicio FROM servicios WHERE id_servicio = ? AND idCompania = ?", [s.id, parseInt(s.idCompania)]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE servicios SET idCompania = ?, nombre = ?, precio = ?, porcentajeIva = ?, duracionMinutos = ?, codigoCabys = ?, unidadMedida = ?, activo = ?, tipo = ?, stockMinimo = ?, costoUnitario = ?, codigoBarras = ? WHERE id_servicio = ?",
              [parseInt(s.idCompania), s.nombre, parseFloat(s.precio), s.porcentajeIva != null ? parseFloat(s.porcentajeIva) : null, parseInt(s.duracionMinutos) || 0, s.codigoCabys || null, s.unidadMedida || 'Sp', s.activo ? 1 : 0, tipo, stockMinimo, costoUnitario, codigoBarras, s.id]
            );
            const [refreshed] = await pool.query("SELECT * FROM servicios WHERE id_servicio = ?", [s.id]);
            return res.json(normalizeRow((refreshed as any[])[0], 'id_servicio'));
          }
        }

        const stockInicial = tipo === 'ARTICULO' ? (parseInt(s.stock) || 0) : null;
        const [result] = await pool.query(
          "INSERT INTO servicios (idCompania, nombre, precio, porcentajeIva, duracionMinutos, codigoCabys, unidadMedida, activo, tipo, stock, stockMinimo, costoUnitario, codigoBarras) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [parseInt(s.idCompania), s.nombre, parseFloat(s.precio), s.porcentajeIva != null ? parseFloat(s.porcentajeIva) : null, parseInt(s.duracionMinutos) || 0, s.codigoCabys || null, s.unidadMedida || 'Sp', s.activo === false ? 0 : 1, tipo, stockInicial, stockMinimo, costoUnitario, codigoBarras]
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
  app.get("/api/hacienda-config/:idCompania", requireAuth, async (req, res) => {
    try {
      const idCompania = parseInt(req.params.idCompania);
      if (!canAccessCompany(sessionOf(req), idCompania)) {
        return res.status(403).json({ error: "No autorizado." });
      }

      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM compania_hacienda_config WHERE id_compania = ?", [idCompania]);
        const row = (rows as any[])[0];
        if (!row) {
          return res.json({
            idCompania, ambiente: 'SANDBOX', usuarioAtv: '', tienePasswordAtv: false,
            tieneCertificado: false, certificadoNombreArchivo: null, certificadoVenceEn: null,
            ultimoConsecutivo: 0, ultimoConsecutivoNc: 0, ultimoConsecutivoNd: 0
          });
        }
        res.json({
          idCompania: row.id_compania,
          ambiente: row.ambiente,
          usuarioAtv: row.usuario_atv || '',
          tienePasswordAtv: !!row.password_atv_enc,
          tieneCertificado: !!row.certificado_p12_enc,
          certificadoNombreArchivo: row.certificado_nombre_archivo,
          certificadoVenceEn: row.certificado_vence_en ? new Date(row.certificado_vence_en).toISOString().split('T')[0] : null,
          ultimoConsecutivo: row.ultimo_consecutivo || 0,
          ultimoConsecutivoNc: row.ultimo_consecutivo_nc || 0,
          ultimoConsecutivoNd: row.ultimo_consecutivo_nd || 0
        });
      } else {
        const row = localHaciendaConfigs.find(c => c.idCompania === idCompania);
        if (!row) {
          return res.json({
            idCompania, ambiente: 'SANDBOX', usuarioAtv: '', tienePasswordAtv: false,
            tieneCertificado: false, certificadoNombreArchivo: null, certificadoVenceEn: null,
            ultimoConsecutivo: 0, ultimoConsecutivoNc: 0, ultimoConsecutivoNd: 0
          });
        }
        res.json({
          idCompania: row.idCompania,
          ambiente: row.ambiente,
          usuarioAtv: row.usuarioAtv || '',
          tienePasswordAtv: !!row.passwordAtvCifrado,
          tieneCertificado: !!row.certificadoP12Cifrado,
          certificadoNombreArchivo: row.certificadoNombreArchivo,
          certificadoVenceEn: row.certificadoVenceEn,
          ultimoConsecutivo: row.ultimoConsecutivo,
          ultimoConsecutivoNc: row.ultimoConsecutivoNc,
          ultimoConsecutivoNd: row.ultimoConsecutivoNd
        });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

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

      // Corrección manual de numeración (del POS): fijar el último consecutivo YA emitido ante
      // Hacienda cuando esta empresa facturó antes con otro sistema bajo la misma sucursal/terminal
      // y Hacienda rechaza con "el documento ya fue emitido". Solo puede SUBIR: bajarlo volvería a
      // emitir números que Hacienda ya tiene. Solo un Administrador.
      const correccionConsecutivos: Array<{ columna: string; campo: "ultimoConsecutivo" | "ultimoConsecutivoNc" | "ultimoConsecutivoNd"; valor: number }> = [];
      for (const [campo, columna] of [["ultimoConsecutivo", "ultimo_consecutivo"], ["ultimoConsecutivoNc", "ultimo_consecutivo_nc"], ["ultimoConsecutivoNd", "ultimo_consecutivo_nd"]] as const) {
        if (b[campo] == null || String(b[campo]).trim() === "") continue;
        const valor = Number(b[campo]);
        // Tope de las columnas INT de compania_hacienda_config (con STRICT_TRANS_TABLES, un valor
        // mayor falla el UPDATE después de haber guardado el resto de la configuración).
        if (!Number.isInteger(valor) || valor < 0 || valor > 2147483647) {
          return res.status(400).json({ error: "El último consecutivo debe ser un número entero entre 0 y 2147483647." });
        }
        correccionConsecutivos.push({ columna, campo, valor });
      }

      let existing: { passwordAtvCifrado: string; certificadoP12Cifrado: string; certificadoPinCifrado: string; certificadoNombreArchivo: string | null } | undefined;

      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT password_atv_enc, certificado_p12_enc, certificado_password_enc, certificado_nombre_archivo FROM compania_hacienda_config WHERE id_compania = ?", [idCompania]);
        const row = (rows as any[])[0];
        if (row) {
          existing = {
            passwordAtvCifrado: row.password_atv_enc ? row.password_atv_enc.toString() : '',
            certificadoP12Cifrado: row.certificado_p12_enc ? row.certificado_p12_enc.toString() : '',
            certificadoPinCifrado: row.certificado_password_enc ? row.certificado_password_enc.toString() : '',
            certificadoNombreArchivo: row.certificado_nombre_archivo
          };
        }
      } else {
        const row = localHaciendaConfigs.find(c => c.idCompania === idCompania);
        if (row) {
          existing = {
            passwordAtvCifrado: row.passwordAtvCifrado,
            certificadoP12Cifrado: row.certificadoP12Cifrado,
            certificadoPinCifrado: row.certificadoPinCifrado,
            certificadoNombreArchivo: row.certificadoNombreArchivo
          };
        }
      }

      const passwordAtvCifrado = b.passwordAtv && String(b.passwordAtv).trim()
        ? encryptSecret(String(b.passwordAtv).trim())
        : (existing?.passwordAtvCifrado || '');

      const certificadoP12Cifrado = b.certificadoP12Base64 && String(b.certificadoP12Base64).trim()
        ? encryptSecret(String(b.certificadoP12Base64).trim())
        : (existing?.certificadoP12Cifrado || '');

      const certificadoPinCifrado = b.certificadoPin && String(b.certificadoPin).trim()
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
      } else {
        const index = localHaciendaConfigs.findIndex(c => c.idCompania === idCompania);
        const stored: LocalHaciendaConfig = {
          idCompania, ambiente: b.ambiente, usuarioAtv: b.usuarioAtv || '',
          passwordAtvCifrado, certificadoP12Cifrado, certificadoPinCifrado,
          certificadoNombreArchivo, certificadoVenceEn,
          ultimoConsecutivo: index !== -1 ? localHaciendaConfigs[index].ultimoConsecutivo : 0,
          ultimoConsecutivoNc: index !== -1 ? localHaciendaConfigs[index].ultimoConsecutivoNc : 0,
          ultimoConsecutivoNd: index !== -1 ? localHaciendaConfigs[index].ultimoConsecutivoNd : 0
        };
        if (index !== -1) {
          localHaciendaConfigs[index] = stored;
        } else {
          localHaciendaConfigs.push(stored);
        }
      }

      let consecutivos = { ultimoConsecutivo: 0, ultimoConsecutivoNc: 0, ultimoConsecutivoNd: 0 };
      if (dbConnected && pool) {
        for (const c of correccionConsecutivos) {
          await pool.query(`UPDATE compania_hacienda_config SET ${c.columna} = GREATEST(${c.columna}, ?) WHERE id_compania = ?`, [c.valor, idCompania]);
        }
        const [rows] = await pool.query("SELECT ultimo_consecutivo, ultimo_consecutivo_nc, ultimo_consecutivo_nd FROM compania_hacienda_config WHERE id_compania = ?", [idCompania]);
        const row = (rows as any[])[0];
        if (row) consecutivos = { ultimoConsecutivo: row.ultimo_consecutivo || 0, ultimoConsecutivoNc: row.ultimo_consecutivo_nc || 0, ultimoConsecutivoNd: row.ultimo_consecutivo_nd || 0 };
      } else {
        const cfg = configLocalHacienda(idCompania);
        for (const c of correccionConsecutivos) cfg[c.campo] = Math.max(cfg[c.campo], c.valor);
        consecutivos = { ultimoConsecutivo: cfg.ultimoConsecutivo, ultimoConsecutivoNc: cfg.ultimoConsecutivoNc, ultimoConsecutivoNd: cfg.ultimoConsecutivoNd };
      }

      res.json({
        idCompania,
        ambiente: b.ambiente,
        usuarioAtv: b.usuarioAtv || '',
        tienePasswordAtv: !!passwordAtvCifrado,
        tieneCertificado: !!certificadoP12Cifrado,
        certificadoNombreArchivo,
        certificadoVenceEn,
        ...consecutivos
      });
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
      const xml = req.body.xml;
      if (!xml || typeof xml !== 'string') {
        return res.status(400).json({ error: "Falta el XML a firmar." });
      }
      const cert = await cargarCertificadoEmpresa(idCompania);
      if (!cert) {
        return res.status(400).json({ error: "No se ha configurado un certificado criptográfico (.p12) para esta empresa." });
      }
      const xmlFirmado = await firmarXadesEpes(xml, cert.p12Base64, cert.pin);
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
  // "cannot read properties of undefined".
  function configLocalHacienda(idCompania: number): LocalHaciendaConfig {
    let cfg = localHaciendaConfigs.find(c => c.idCompania === idCompania);
    if (!cfg) {
      cfg = {
        idCompania, ambiente: "PRUEBAS_LOCAL", usuarioAtv: "", passwordAtvCifrado: "", certificadoP12Cifrado: "", certificadoPinCifrado: "",
        certificadoNombreArchivo: null, certificadoVenceEn: null, ultimoConsecutivo: 0, ultimoConsecutivoNc: 0, ultimoConsecutivoNd: 0
      };
      localHaciendaConfigs.push(cfg);
    }
    return cfg;
  }

  // Reserva el siguiente consecutivo de Nota de Crédito ('03') o de Débito ('02') en una
  // transacción corta con FOR UPDATE (upsert: sin fila de configuración el UPDATE no hacía nada y
  // todas las notas repetían el 1). Va ANTES de transmitir porque la clave lleva el consecutivo.
  async function reservarConsecutivoNota(idCompania: number, tipoDocumento: "02" | "03"): Promise<number> {
    const columna = tipoDocumento === "03" ? "ultimo_consecutivo_nc" : "ultimo_consecutivo_nd";
    if (dbConnected && pool) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const [rows] = await connection.query(`SELECT ${columna} AS ultimo FROM compania_hacienda_config WHERE id_compania = ? FOR UPDATE`, [idCompania]);
        const siguiente = ((rows as any[])[0]?.ultimo || 0) + 1;
        await connection.query(
          `INSERT INTO compania_hacienda_config (id_compania, ${columna}) VALUES (?, ?) ON DUPLICATE KEY UPDATE ${columna} = VALUES(${columna})`,
          [idCompania, siguiente]
        );
        await connection.commit();
        return siguiente;
      } catch (err) {
        await connection.rollback();
        throw err;
      } finally {
        connection.release();
      }
    }
    const cfg = configLocalHacienda(idCompania);
    if (tipoDocumento === "03") return ++cfg.ultimoConsecutivoNc;
    return ++cfg.ultimoConsecutivoNd;
  }

  // Prefijo de mensajeError de un comprobante en ERROR cuyo envío se cortó sin poder confirmar si
  // Hacienda lo recibió. Mientras una Nota esté así, no se emiten más Notas ni se anula la factura
  // que referencia: si Hacienda sí la tiene, emitir otra la duplicaría (ver notaEnEnvioIncierto).
  const MARCA_ENVIO_INCIERTO = "Envío incierto:";

  // Una sola operación a la vez sobre la misma factura (anular, Nota de Crédito, Nota de Débito) o
  // la misma consulta (facturarla). Entre revisar el estado y guardar el resultado pasan varios
  // segundos de transmisión y sondeo a Hacienda; dos solicitudes simultáneas —un doble clic, dos
  // pestañas— pasaban las dos la revisión y transmitían dos Notas de Crédito, que ante Hacienda ya
  // no se pueden retirar. Un candado en memoria basta: el servidor corre como un solo proceso pm2.
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

  interface ResultadoTransmision {
    estado: "ENVIADA" | "ACEPTADA" | "RECHAZADA" | "ERROR";
    mensajeError: string | null;
    xmlFirmado: string | null;
    respuestaHacienda: string | null;
  }

  // Firma, envía y sondea unos segundos un comprobante ya armado (factura o nota) — el mismo
  // ciclo que hace el POS. Nunca lanza: cualquier falla queda como ERROR con su mensaje, para que
  // quien llama guarde el comprobante igual (la numeración ya está reservada).
  //
  // ENVIADA = Hacienda lo recibió pero no resolvió durante el sondeo. Desde ahí lo único válido es
  // volver a CONSULTAR (POST /api/facturas/:id/estado), nunca reenviarlo: Hacienda rechaza el
  // reenvío de una clave que ya tiene, y el POS llegó a reintentar así durante 7 horas una factura
  // que Hacienda había aceptado desde el primer envío.
  async function transmitirComprobante(params: {
    xmlSinFirmar: string;
    clave: string;
    fechaEmision: string;
    cert: CertificadoEmpresa;
    credenciales: CredencialesAtv;
    company: Company;
    receptor: { tipoIdentificacion: string; identificacion: string };
  }): Promise<ResultadoTransmision> {
    const { xmlSinFirmar, clave, fechaEmision, cert, credenciales, company, receptor } = params;
    const resultado: ResultadoTransmision = { estado: "ERROR", mensajeError: null, xmlFirmado: null, respuestaHacienda: null };
    try {
      // El XML firmado se conserva siempre: es el comprobante que el paciente tiene derecho a
      // recibir y el respaldo ante Hacienda.
      // Hasta aquí (firma, token) nada salió de este servidor: una falla es un ERROR seguro de reintentar.
      resultado.xmlFirmado = await firmarXadesEpes(xmlSinFirmar, cert.p12Base64, cert.pin);
      const token = await obtenerTokenHacienda(credenciales.ambiente, credenciales.usuarioAtv, credenciales.passwordAtv);
      let envio;
      try {
        envio = await enviarFacturaHacienda({
          ambiente: credenciales.ambiente,
          token,
          clave,
          fechaEmisionIso: fechaEmision,
          tipoIdentificacionEmisor: company.tipoIdentificacion,
          cedulaEmisor: limpiarIdentificacion(company.identificacion),
          tipoIdentificacionReceptor: receptor.tipoIdentificacion,
          cedulaReceptor: limpiarIdentificacion(receptor.identificacion),
          xmlFirmado: resultado.xmlFirmado
        });
      } catch (err: any) {
        // Se cortó la comunicación DURANTE el envío (timeout, red): Hacienda pudo haberlo recibido o
        // no. Antes se daba por no recibido, y reintentar emitía un segundo comprobante con otra
        // clave. Se le pregunta por esta clave antes de decidir.
        const consulta = await esperarResolucionHacienda(credenciales.ambiente, token, clave);
        if (consulta.estado === "no_encontrado") {
          resultado.mensajeError = `${err.message || err} — Hacienda confirmó que no lo recibió.`;
          return resultado;
        }
        if (consulta.estado === "error") {
          resultado.mensajeError = `${MARCA_ENVIO_INCIERTO} se cortó la comunicación al enviarlo (${err.message || err}) y no se pudo confirmar si Hacienda lo recibió. Use «Verificar estado» antes de volver a emitirlo.`;
          return resultado;
        }
        envio = { aceptadoParaProcesar: true, location: null, mensaje: null };
        resultado.estado = "ENVIADA";
        resultado.respuestaHacienda = consulta.respuestaXmlBase64;
        if (consulta.estado === "aceptado") resultado.estado = "ACEPTADA";
        if (consulta.estado === "rechazado") {
          resultado.estado = "RECHAZADA";
          resultado.mensajeError = consulta.detalleMensaje || "Hacienda rechazó el comprobante.";
        }
        return resultado;
      }
      if (!envio.aceptadoParaProcesar) {
        resultado.mensajeError = envio.mensaje;
        return resultado;
      }
      resultado.estado = "ENVIADA";
      const consulta = await esperarResolucionHacienda(credenciales.ambiente, token, clave);
      resultado.respuestaHacienda = consulta.respuestaXmlBase64;
      if (consulta.estado === "aceptado") {
        resultado.estado = "ACEPTADA";
      } else if (consulta.estado === "rechazado") {
        resultado.estado = "RECHAZADA";
        resultado.mensajeError = consulta.detalleMensaje || "Hacienda rechazó el comprobante.";
      }
    } catch (err: any) {
      resultado.mensajeError = err.message || String(err);
      console.error(`[Hacienda] Error transmitiendo el comprobante ${clave}:`, resultado.mensajeError);
    }
    return resultado;
  }

  // Proxy al catálogo oficial CABYS de Hacienda (evita CORS desde el navegador).
  app.get("/api/cabys", requireAuth, async (req, res) => {
    try {
      const q = (req.query.q as string) || "";
      if (!q.trim()) return res.json([]);
      const url = /^\d{13}$/.test(q.trim())
        ? `https://api.hacienda.go.cr/fe/cabys?codigo=${encodeURIComponent(q.trim())}`
        : `https://api.hacienda.go.cr/fe/cabys?q=${encodeURIComponent(q.trim())}`;
      // Con límite: sin él, una API de Hacienda que no responde dejaba colgado el buscador.
      const resp = await fetch(url, { signal: AbortSignal.timeout(HACIENDA_FETCH_TIMEOUT_MS) });
      if (!resp.ok) return res.json([]);
      const data = await resp.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 10.1 Facturas (Factura Electrónica v4.4) — siempre acotadas a la empresa de la sesión;
  // se ignora cualquier idCompania que venga en el query/body para evitar que una empresa
  // lea o facture a nombre de otra.
  app.get("/api/facturas", requireAuth, async (req, res) => {
    try {
      const idCompania = sessionOf(req).idCompania;
      if (dbConnected && pool) {
        // Sin xml_firmado ni respuesta_hacienda: pesan varios KB por fila, la pantalla no los usa y
        // ahora se llenan en cada envío. Solo los lee el reenvío por correo, que carga la fila por id.
        const [rows] = await pool.query(
          "SELECT id_factura, id_consulta, idCompania, idCita, idPaciente, clave, consecutivo, fechaEmision, ambiente, subtotal, totalIva, total, estado, mensajeError, creadaEn, condicionVenta, tipoDocumento, idFacturaReferencia, motivoAnulacion, medioPago, montoRecibido FROM facturas WHERE idCompania = ?",
          [idCompania]
        );
        const facturas = (rows as any[]).map(row => normalizeRow(row, 'id_factura'));
        const lineasPorFactura = await fetchLineasPorFactura(facturas.map(f => f.id_factura));
        res.json(facturas.map(r => ({ ...r, idConsulta: r.id_consulta, lineas: lineasPorFactura.get(r.id_factura) || [] })));
      } else {
        res.json(localFacturas.filter(f => f.idCompania === idCompania).map(({ xmlFirmado, respuestaHacienda, ...f }: any) => f));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/facturas", requireAuth, unaOperacionALaVez(candadoPorConsulta, async (req, res) => {
    try {
      const body = req.body;
      const idCompania = sessionOf(req).idCompania;
      const idCita = body.idCita != null ? parseInt(body.idCita) : null;
      const idConsulta = body.idConsulta != null ? parseInt(body.idConsulta) : null;
      const idPaciente = parseInt(body.idPaciente);
      const condicionVenta = body.condicionVenta || "01";
      const medioPago = body.medioPago || "01";
      const montoRecibido = body.montoRecibido != null && String(body.montoRecibido).trim() !== '' ? parseFloat(body.montoRecibido) : null;
      const modoPrueba = body.modoPrueba === true;
      const lineasBody: Array<{ idServicio: number; cantidad: number }> = body.lineas || [];

      if (lineasBody.length === 0) {
        return res.status(400).json({ error: "Agregue al menos un servicio a facturar." });
      }
      if (!esCodigoCatalogo(condicionVenta) || !esCodigoCatalogo(medioPago)) {
        return res.status(400).json({ error: "Condición de venta o medio de pago inválido." });
      }

      // `facturas.id_consulta` es una columna heredada de ConsultorioDB_schema.sql con un
      // UNIQUE KEY (uq_facturas_consulta) — nunca antes usada por esta app. La reutilizamos tal
      // cual para impedir facturar dos veces la misma consulta: chequeo aquí para un mensaje
      // claro, y el UNIQUE de la BD queda como red de seguridad ante una carrera entre dos
      // solicitudes simultáneas (capturado más abajo como ER_DUP_ENTRY).
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

      let company: Company | undefined;
      let paciente: Patient | undefined;
      let serviciosDisponibles: Servicio[];
      if (dbConnected && pool) {
        const [companyRows] = await pool.query("SELECT * FROM companias WHERE id_compania = ?", [idCompania]);
        company = (companyRows as any[]).map(row => normalizeRow(row, 'id_compania'))[0];
        const [pacienteRows] = await pool.query("SELECT * FROM pacientes WHERE id_paciente = ?", [idPaciente]);
        paciente = (pacienteRows as any[]).map(row => normalizeRow(row, 'id_paciente'))[0];
        const [servicioRows] = await pool.query("SELECT * FROM servicios WHERE idCompania = ?", [idCompania]);
        serviciosDisponibles = (servicioRows as any[]).map(row => normalizeRow(row, 'id_servicio'));
      } else {
        company = localCompanies.find(c => c.id === idCompania);
        paciente = localPatients.find(p => p.id === idPaciente);
        serviciosDisponibles = localServicios.filter(s => s.idCompania === idCompania);
      }

      if (!company) return res.status(404).json({ error: "Empresa no encontrada." });
      if (!paciente) return res.status(404).json({ error: "Paciente no encontrado." });
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
      // envía nada a Hacienda — así que tampoco debe exigir tener configurados el certificado
      // .p12 ni las credenciales ATV, que solo hacen falta cuando la factura realmente va a
      // procesarse contra Hacienda.
      const omitirEnvioHacienda = modoPrueba || credenciales?.ambiente === "PRUEBAS_LOCAL";

      if (!omitirEnvioHacienda) {
        if (!cert) {
          return res.status(400).json({ error: "Configure primero la Firma Digital de Hacienda (certificado .p12) en Configuración de Empresa." });
        }
        if (!credenciales) {
          return res.status(400).json({ error: "Configure primero el usuario y contraseña ATV de Hacienda en Configuración de Empresa." });
        }
      }

      const lineasInput = [];
      for (const l of lineasBody) {
        const servicio = serviciosDisponibles.find(s => s.id === parseInt(l.idServicio as any));
        if (!servicio) return res.status(400).json({ error: `Servicio ${l.idServicio} no encontrado.` });
        if (!servicio.codigoCabys) return res.status(400).json({ error: `El servicio "${servicio.nombre}" no tiene un código CABYS configurado — asígnelo en Configuración de Empresa antes de facturar.` });
        const cantidad = parseFloat((l.cantidad as any) || 1);
        if (!Number.isFinite(cantidad) || cantidad <= 0) return res.status(400).json({ error: `La cantidad de "${servicio.nombre}" debe ser mayor a 0.` });
        if (servicio.tipo === 'ARTICULO' && (servicio.stock || 0) < cantidad) {
          return res.status(400).json({ error: `Existencias insuficientes de "${servicio.nombre}" (disponible: ${servicio.stock || 0}, solicitado: ${cantidad}).` });
        }
        lineasInput.push({
          codigoCabys: servicio.codigoCabys,
          detalle: servicio.nombre,
          unidadMedida: servicio.unidadMedida || 'Sp',
          cantidad,
          precioUnitario: servicio.precio,
          porcentajeIva: servicio.porcentajeIva != null ? servicio.porcentajeIva : company.ivaPorDefecto,
          idServicio: servicio.id,
          tipo: servicio.tipo || 'SERVICIO'
        });
      }

      const lineasCalculadas = calcularLineas(lineasInput).map((l, i) => ({ ...l, idServicio: lineasInput[i].idServicio, tipo: lineasInput[i].tipo }));
      const resumen = calcularResumen(lineasCalculadas);

      // Numeración consecutiva y descuento de existencias — ambos dentro de la misma transacción
      // (con FOR UPDATE) para que dos facturas simultáneas de la misma empresa no repitan
      // consecutivo NI sobrevendan el mismo artículo. Si el stock ya no alcanza para cuando esta
      // transacción toma el lock (carrera con otra factura concurrente), se revierte todo —
      // incluyendo el consecutivo, para no dejar un hueco en la numeración por un fallo local.
      let siguienteSecuencial: number;
      if (dbConnected && pool) {
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();

          // La fila de configuración solo se creaba al guardar credenciales de Hacienda. Una
          // empresa que factura sin haberlas guardado (ambiente de pruebas) no tenía fila: el
          // SELECT no devolvía nada, el contador arrancaba en 0 y el UPDATE afectaba 0 filas en
          // silencio — así que TODAS sus facturas salían con el consecutivo 1. Con el upsert la
          // numeración se autocorrige exista o no la fila.
          const [rows] = await connection.query("SELECT ultimo_consecutivo FROM compania_hacienda_config WHERE id_compania = ? FOR UPDATE", [idCompania]);
          const actual = (rows as any[])[0]?.ultimo_consecutivo || 0;
          siguienteSecuencial = actual + 1;
          const consecutivoParaMovimiento = generarConsecutivo(siguienteSecuencial);
          await connection.query(
            "INSERT INTO compania_hacienda_config (id_compania, ultimo_consecutivo) VALUES (?, ?) ON DUPLICATE KEY UPDATE ultimo_consecutivo = VALUES(ultimo_consecutivo)",
            [idCompania, siguienteSecuencial]
          );

          for (const l of lineasCalculadas) {
            if (l.tipo !== 'ARTICULO' || !l.idServicio) continue;
            const [servicioRows] = await connection.query("SELECT stock FROM servicios WHERE id_servicio = ? FOR UPDATE", [l.idServicio]);
            const stockActual = (servicioRows as any[])[0]?.stock || 0;
            if (stockActual < l.cantidad) {
              await connection.rollback();
              return res.status(409).json({ error: `Existencias insuficientes de "${l.detalle}" (disponible: ${stockActual}, solicitado: ${l.cantidad}).` });
            }
            const stockResultante = stockActual - l.cantidad;
            await connection.query("UPDATE servicios SET stock = ? WHERE id_servicio = ?", [stockResultante, l.idServicio]);
            await connection.query(
              "INSERT INTO movimientos_inventario (idCompania, idServicio, tipo, cantidad, stockResultante, referencia, notas, creadoPor, creadoEn) VALUES (?, ?, 'VENTA', ?, ?, ?, ?, ?, ?)",
              [idCompania, l.idServicio, -l.cantidad, stockResultante, `Factura ${consecutivoParaMovimiento}`, null, null, new Date().toISOString()]
            );
          }

          await connection.commit();
        } catch (err) {
          await connection.rollback();
          throw err;
        } finally {
          connection.release();
        }
      } else {
        const cfg = configLocalHacienda(idCompania);
        siguienteSecuencial = cfg.ultimoConsecutivo + 1;
        cfg.ultimoConsecutivo = siguienteSecuencial;
        // Igual que en la BD: sin esto el modo memoria nunca descontaba existencias al facturar,
        // y anular o acreditar las "reponía" de más.
        for (const l of lineasCalculadas) {
          if (l.tipo !== 'ARTICULO' || !l.idServicio) continue;
          const servicio = localServicios.find(s => s.id === l.idServicio);
          if (servicio) servicio.stock = (servicio.stock || 0) - l.cantidad;
        }
      }

      const consecutivo = generarConsecutivo(siguienteSecuencial);
      const fechaEmision = new Date();
      const clave = generarClaveNumerica(company.identificacion, consecutivo, fechaEmision);

      const tipoIdReceptor = paciente.tipoIdentificacion === 'EXT' ? '03' : paciente.tipoIdentificacion;
      const xml = construirXmlFactura({
        clave,
        consecutivo,
        fechaEmision,
        emisor: {
          nombre: company.razonSocial,
          nombreComercial: company.nombreComercial,
          tipoIdentificacion: company.tipoIdentificacion,
          identificacion: company.identificacion,
          correoElectronico: company.correoEmisor,
          provincia: company.provincia,
          canton: company.canton,
          distrito: company.distrito,
          otrasSenas: company.otrasSenas,
          codigoActividad: limpiarCodigoActividad(company.actividadEconomica)
        },
        receptor: {
          nombre: paciente.nombreCompleto,
          tipoIdentificacion: tipoIdReceptor,
          identificacion: paciente.identificacion,
          correoElectronico: paciente.correoElectronico || undefined
        },
        condicionVenta,
        medioPago,
        plazoCredito,
        lineas: lineasCalculadas,
        resumen
      });

      const nuevaFactura: any = {
        idCompania,
        idCita,
        idConsulta,
        idPaciente,
        clave,
        consecutivo,
        fechaEmision: fechaEmisionCR(fechaEmision),
        ambiente: credenciales?.ambiente ?? "PRUEBAS_LOCAL",
        lineas: lineasCalculadas,
        subtotal: resumen.totalVenta,
        totalIva: resumen.totalImpuesto,
        total: resumen.totalComprobante,
        estado: "FIRMADA",
        mensajeError: null,
        creadaEn: new Date().toISOString(),
        condicionVenta,
        tipoDocumento: "01",
        idFacturaReferencia: null,
        motivoAnulacion: null,
        medioPago,
        montoRecibido,
        plazoCredito
      };

      if (omitirEnvioHacienda) {
        // Modo sin envío: la factura se numera y guarda igual que siempre, pero nunca se firma
        // ni se llama a la API de Hacienda — ni para pedir token ni para enviar el XML. Puede
        // venir del ambiente de la empresa (PRUEBAS_LOCAL) o de marcar "Modo prueba" en esta
        // factura puntual — en ambos casos la decisión la toma el servidor, nunca el cliente
        // por sí solo, y jamás se simula un estado "ACEPTADA" falso. Por eso tampoco exige
        // certificado .p12 ni credenciales ATV configurados (ver checks arriba).
        nuevaFactura.estado = "SIMULADA";
        nuevaFactura.mensajeError = modoPrueba && credenciales?.ambiente !== "PRUEBAS_LOCAL"
          ? "Modo prueba activado para esta factura — no se envió a Hacienda."
          : "Ambiente de pruebas locales — no se envió a Hacienda.";
      } else {
        // Envío a Hacienda — best-effort: si la firma o Hacienda fallan, la factura queda
        // guardada como ERROR (en vez de perderse junto con la numeración/stock ya
        // reservados arriba). cert/credenciales ya se validaron no-nulos arriba
        // (omitirEnvioHacienda es false en este branch).
        const transmision = await transmitirComprobante({
          xmlSinFirmar: xml, clave, fechaEmision: nuevaFactura.fechaEmision, cert: cert!, credenciales: credenciales!, company,
          receptor: { tipoIdentificacion: tipoIdReceptor, identificacion: paciente.identificacion }
        });
        nuevaFactura.estado = transmision.estado;
        nuevaFactura.mensajeError = transmision.mensajeError;
        nuevaFactura.xmlFirmado = transmision.xmlFirmado;
        nuevaFactura.respuestaHacienda = transmision.respuestaHacienda;
      }

      if (dbConnected && pool) {
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          const [result] = await connection.query(
            "INSERT INTO facturas (idCompania, idCita, id_consulta, idPaciente, clave, consecutivo, fechaEmision, ambiente, subtotal, totalIva, total, estado, mensajeError, creadaEn, condicionVenta, tipoDocumento, idFacturaReferencia, motivoAnulacion, medioPago, montoRecibido, plazoCredito, xml_firmado, respuesta_hacienda) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [nuevaFactura.idCompania, nuevaFactura.idCita, nuevaFactura.idConsulta, nuevaFactura.idPaciente, nuevaFactura.clave, nuevaFactura.consecutivo, nuevaFactura.fechaEmision, nuevaFactura.ambiente, nuevaFactura.subtotal, nuevaFactura.totalIva, nuevaFactura.total, nuevaFactura.estado, nuevaFactura.mensajeError, nuevaFactura.creadaEn, nuevaFactura.condicionVenta, nuevaFactura.tipoDocumento, nuevaFactura.idFacturaReferencia, nuevaFactura.motivoAnulacion, nuevaFactura.medioPago, nuevaFactura.montoRecibido, nuevaFactura.plazoCredito, nuevaFactura.xmlFirmado || null, nuevaFactura.respuestaHacienda || null]
          );
          nuevaFactura.id = (result as any).insertId;
          await guardarLineasFactura(connection, nuevaFactura.id, nuevaFactura.lineas);
          await connection.commit();
        } catch (err: any) {
          await connection.rollback();
          // Red de seguridad ante una carrera entre dos solicitudes simultáneas para la misma
          // consulta — el chequeo de arriba ya cubre el caso normal (secuencial).
          if (err.code === "ER_DUP_ENTRY" && nuevaFactura.idConsulta != null) {
            return res.status(409).json({ error: "Esta consulta ya fue facturada." });
          }
          throw err;
        } finally {
          connection.release();
        }
      } else {
        nuevaFactura.id = Math.max(0, ...localFacturas.map(f => f.id)) + 1;
        localFacturas.push(nuevaFactura);
      }

      // CXC automática: toda venta a crédito ('02') genera una cuenta por cobrar por el total —
      // independiente de si Hacienda ya aceptó el comprobante o no, porque la obligación de pago
      // del paciente es un hecho de negocio, no algo condicionado al trámite fiscal.
      if (condicionVenta === "02") {
        const fechaEmisionSolo = nuevaFactura.fechaEmision.split("T")[0];
        const fechaVencimiento = sumarDiasCR(fechaEmisionSolo, plazoCredito as number);

        if (dbConnected && pool) {
          await pool.query(
            "INSERT INTO cuentas_cobrar (idCompania, idFactura, facturaConsecutivo, idPaciente, fechaEmision, fechaVencimiento, plazoDias, montoTotal, saldoPendiente, estado, creadaEn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDIENTE', ?)",
            [idCompania, nuevaFactura.id, consecutivo, idPaciente, fechaEmisionSolo, fechaVencimiento, plazoCredito, resumen.totalComprobante, resumen.totalComprobante, new Date().toISOString()]
          );
        } else {
          localCuentasCobrar.push({
            id: Math.max(0, ...localCuentasCobrar.map(c => c.id), 0) + 1,
            idCompania,
            idFactura: nuevaFactura.id,
            facturaConsecutivo: consecutivo,
            idPaciente,
            fechaEmision: fechaEmisionSolo,
            fechaVencimiento,
            plazoDias: plazoCredito as number,
            montoTotal: resumen.totalComprobante,
            saldoPendiente: resumen.totalComprobante,
            estado: "PENDIENTE",
            creadaEn: new Date().toISOString()
          });
        }
      }

      res.json(nuevaFactura);
    } catch (err: any) {
      console.error("[Hacienda] Error generando factura:", err);
      res.status(500).json({ error: err.message });
    }
  }));

  async function cargarFacturaPorId(id: number): Promise<any | undefined> {
    if (dbConnected && pool) {
      const [rows] = await pool.query("SELECT * FROM facturas WHERE id_factura = ?", [id]);
      return (rows as any[]).map(row => normalizeRow(row, 'id_factura'))[0];
    }
    return localFacturas.find(f => f.id === id);
  }

  async function lineasDeFactura(factura: any): Promise<any[]> {
    if (dbConnected && pool) return (await fetchLineasPorFactura([factura.id])).get(factura.id) || [];
    return typeof factura.lineas === "string" ? JSON.parse(factura.lineas) : (factura.lineas || []);
  }

  async function cargarEmpresaYPaciente(idCompania: number, idPaciente: number): Promise<{ company?: Company; paciente?: Patient }> {
    if (dbConnected && pool) {
      const [companyRows] = await pool.query("SELECT * FROM companias WHERE id_compania = ?", [idCompania]);
      const [pacienteRows] = await pool.query("SELECT * FROM pacientes WHERE id_paciente = ?", [idPaciente]);
      return {
        company: (companyRows as any[]).map(row => normalizeRow(row, 'id_compania'))[0],
        paciente: (pacienteRows as any[]).map(row => normalizeRow(row, 'id_paciente'))[0]
      };
    }
    return { company: localCompanies.find(c => c.id === idCompania), paciente: localPatients.find(p => p.id === idPaciente) };
  }

  // Cuánto se acreditó ya de cada servicio en Notas de Crédito previas sobre esta factura. Las que
  // Hacienda nunca recibió (ERROR) o rechazó no acreditaron nada — y tampoco aplicaron efectos
  // locales (ver emitirYGuardarNota) —, así que no cuentan.
  async function cantidadesAcreditadas(idFactura: number): Promise<Map<number, number>> {
    let notas: any[];
    if (dbConnected && pool) {
      const [rows] = await pool.query("SELECT * FROM facturas WHERE idFacturaReferencia = ? AND tipoDocumento = '03' AND estado NOT IN ('ERROR', 'RECHAZADA')", [idFactura]);
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
  async function notasDeFactura(idFactura: number): Promise<any[]> {
    if (dbConnected && pool) {
      const [rows] = await pool.query("SELECT id_factura, consecutivo, tipoDocumento, estado, mensajeError FROM facturas WHERE idFacturaReferencia = ?", [idFactura]);
      return (rows as any[]).map(row => normalizeRow(row, 'id_factura'));
    }
    return localFacturas.filter(f => f.idFacturaReferencia === idFactura);
  }

  function notaEnEnvioIncierto(notas: any[]): any | undefined {
    return notas.find(n => n.estado === "ERROR" && String(n.mensajeError || "").startsWith(MARCA_ENVIO_INCIERTO));
  }

  function mensajeEnvioIncierto(nota: any): string {
    return `La nota ${nota.consecutivo} de esta factura tiene un envío incierto: use «Verificar estado» sobre ella antes de emitir otra nota o anular. Si Hacienda sí la recibió, emitir otra la duplicaría.`;
  }

  // Cert + credenciales reales para transmitir una Nota. Se valida ANTES de reservar el consecutivo
  // para no quemar numeración por un problema de configuración. La Nota va al mismo ambiente en que
  // se emitió la factura: una clave de SANDBOX no existe en PRODUCCIÓN, y Hacienda rechazaría la
  // Nota para siempre.
  async function exigirConfigHacienda(idCompania: number, ambienteFactura: string): Promise<{ cert: CertificadoEmpresa; credenciales: CredencialesAtv }> {
    const credenciales = await cargarCredencialesAtv(idCompania);
    const cert = await cargarCertificadoEmpresa(idCompania);
    if (!cert) throw Object.assign(new Error("Configure primero la Firma Digital de Hacienda (certificado .p12) en Configuración de Empresa."), { status: 400 });
    if (!credenciales) throw Object.assign(new Error("Configure primero el usuario y contraseña ATV de Hacienda en Configuración de Empresa."), { status: 400 });
    if (credenciales.ambiente === "PRUEBAS_LOCAL") {
      throw Object.assign(new Error("La empresa está en ambiente de pruebas locales: no se puede transmitir una Nota sobre una factura que Hacienda aceptó."), { status: 400 });
    }
    if (credenciales.ambiente !== ambienteFactura) {
      throw Object.assign(new Error(`La factura se emitió en ${ambienteFactura} y la empresa está configurada en ${credenciales.ambiente}: cualquier Nota sobre ella tiene que ir al ambiente original.`), { status: 409 });
    }
    return { cert, credenciales };
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
    await moverStockPorNota(connection, factura.idCompania, lineasARestituir, 1, `Anulación factura ${factura.consecutivo}`, motivo);
  }

  // Una pestaña abierta antes de quitar la casilla "Modo prueba" de las Notas todavía la muestra; si
  // se ignorara en silencio, quien la marcó transmitiría una Nota real creyendo que era de prueba.
  const MENSAJE_SIN_MODO_PRUEBA = "Las Notas de Crédito y Débito ya no tienen modo prueba: siempre se transmiten a Hacienda. Recargue la página e intente de nuevo.";

  const AVISO_EFECTOS_NO_APLICADOS ="Hacienda sí recibió esta nota, pero al emitirla se dio por fallida y su efecto en inventario y cuenta por cobrar no se aplicó: ajústelo a mano.";

  // Qué estado y mensaje le corresponden a un comprobante según lo que Hacienda respondió al
  // consultarlo. Lo comparten POST /api/facturas/:id/estado y /anular (que consulta antes de anular
  // una factura en ERROR), para que los dos lleguen siempre a la misma conclusión.
  function estadoTrasConsulta(factura: any, consulta: EstadoHaciendaResultado): { estado: string; mensajeError: string | null } {
    let estado: string = factura.estado;
    let mensajeError: string | null = factura.mensajeError ?? null;
    if (consulta.estado === "aceptado") {
      estado = "ACEPTADA";
      mensajeError = null;
    } else if (consulta.estado === "rechazado") {
      estado = "RECHAZADA";
      mensajeError = consulta.detalleMensaje || "Hacienda rechazó el comprobante.";
    } else if ((consulta.estado === "recibido" || consulta.estado === "procesando") && factura.estado === "ERROR") {
      // Sí le llegó, aunque el envío se reportó como fallido.
      estado = "ENVIADA";
      mensajeError = null;
    } else if (consulta.estado === "no_encontrado" && factura.estado === "ERROR") {
      mensajeError = factura.tipoDocumento === "01"
        ? "Hacienda no tiene registro de esta factura: nunca le llegó. Anúlela (no requiere Nota de Crédito) y vuelva a facturar."
        : "Hacienda no tiene registro de esta nota: nunca le llegó, y por eso no se aplicó. Vuelva a emitirla.";
    }
    // Una Nota que se dio por fallida al emitirla nunca aplicó sus efectos (ver emitirYGuardarNota).
    // Si Hacienda sí la tiene, se avisa — y el aviso se conserva en las consultas siguientes (antes
    // la siguiente consulta "aceptado" lo borraba).
    if (factura.tipoDocumento !== "01" && (estado === "ACEPTADA" || estado === "ENVIADA")
        && (factura.estado === "ERROR" || factura.mensajeError === AVISO_EFECTOS_NO_APLICADOS)) {
      mensajeError = AVISO_EFECTOS_NO_APLICADOS;
    }
    // El saldo a favor anotado al emitir una Nota de Crédito sigue siendo cierto cuando Hacienda la acepta.
    if (estado === "ACEPTADA" && mensajeError === null && String(factura.mensajeError || "").startsWith(MARCA_SALDO_A_FAVOR)) {
      mensajeError = factura.mensajeError;
    }
    // Una Nota ENVIADA ya aplicó sus efectos al emitirla (ver emitirYGuardarNota). Si Hacienda la
    // rechaza después, esos efectos quedaron sin comprobante que los respalde: se avisa.
    if (factura.tipoDocumento !== "01" && factura.estado === "ENVIADA" && estado === "RECHAZADA") {
      mensajeError = `${mensajeError} — Al emitirla ya se habían aplicado sus efectos (inventario, cuenta por cobrar${factura.tipoDocumento === "03" ? " y, si era de anulación, la anulación de la factura" : ""}): reviértalos a mano.`;
    }
    // ANULADA se conserva: la anulación ya ocurrió y Hacienda solo informa del comprobante original.
    if (factura.estado === "ANULADA") {
      estado = "ANULADA";
      mensajeError = factura.mensajeError ?? null;
    }
    return { estado, mensajeError };
  }

  async function guardarEstadoConsultado(id: number, estado: string, mensajeError: string | null, respuestaXmlBase64: string | null): Promise<void> {
    if (dbConnected && pool) {
      // respuesta_hacienda es el MensajeHacienda: el tercer documento que el paciente debe recibir.
      await pool.query(
        "UPDATE facturas SET estado = ?, mensajeError = ?, respuesta_hacienda = COALESCE(?, respuesta_hacienda) WHERE id_factura = ?",
        [estado, mensajeError, respuestaXmlBase64, id]
      );
      return;
    }
    const local = localFacturas.find(f => f.id === id);
    if (local) {
      local.estado = estado as any;
      local.mensajeError = mensajeError;
    }
  }

  // Anula una Factura Electrónica. Son tres efectos independientes (mismo criterio que el POS):
  // reponer existencias y anular la CxC pendiente siempre —ocurrieron localmente al facturar, sin
  // importar qué supo Hacienda—, y emitir la Nota de Crédito (código '01') SOLO si Hacienda ACEPTÓ
  // la factura. La condición es positiva a propósito: una NC sobre un comprobante que Hacienda
  // nunca aceptó (SIMULADA, RECHAZADA, ERROR) la haría rechazar también. Antes solo se podían anular
  // las ENVIADAS/ACEPTADAS, así que una factura rechazada o de prueba no tenía forma de reversarse
  // y su consulta quedaba bloqueada para siempre.
  app.post("/api/facturas/:id/anular", requireAuth, unaOperacionALaVez(candadoPorFactura, async (req, res) => {
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
      if (factura.tipoDocumento && factura.tipoDocumento !== "01") {
        return res.status(400).json({ error: "Solo se pueden anular Facturas Electrónicas (no Notas de Crédito/Débito)." });
      }
      if (factura.estado === "ANULADA") {
        return res.status(400).json({ error: "Esta factura ya fue anulada." });
      }
      // ENVIADA: Hacienda la recibió y todavía no resuelve. Anularla sin NC dejaría viva ante
      // Hacienda una factura que luego acepte; emitir NC sobre algo no aceptado la haría rechazar.
      if (factura.estado === "ENVIADA") {
        return res.status(409).json({ error: "Hacienda todavía está procesando esta factura. Use «Verificar estado» y anúlela cuando quede aceptada o rechazada." });
      }

      const idCompania = factura.idCompania;
      const credenciales = await cargarCredencialesAtv(idCompania);
      const ambienteActual = credenciales?.ambiente ?? "PRUEBAS_LOCAL";

      // Ambiente: las claves de SANDBOX y de PRODUCCIÓN viven en sistemas distintos de Hacienda.
      // - Una factura de SANDBOX es una prueba sin efecto fiscal: si la empresa ya pasó a otro
      //   ambiente, no hay a quién mandarle la Nota, y se anula solo en el sistema.
      // - Una de PRODUCCIÓN que Hacienda aceptó (o pudo haber recibido) solo se anula ante
      //   PRODUCCIÓN: hacerlo localmente dejaría viva ante Hacienda una venta real.
      const esPruebaDeSandbox = factura.ambiente === "SANDBOX" && ambienteActual !== "SANDBOX";
      if (factura.ambiente === "PRODUCCION" && ambienteActual !== "PRODUCCION" && (factura.estado === "ACEPTADA" || factura.estado === "ERROR")) {
        return res.status(409).json({ error: `Esta factura se emitió en PRODUCCIÓN y la empresa está configurada en ${ambienteActual}. Vuelva a configurar el ambiente de Producción para anularla ante Hacienda.` });
      }

      const notas = await notasDeFactura(factura.id);
      const incierta = notaEnEnvioIncierto(notas);
      if (incierta) return res.status(409).json({ error: mensajeEnvioIncierto(incierta) });
      // Una Nota de Débito vigente es otro comprobante ante Hacienda: anular la factura no la anula,
      // pero sí anularía la cuenta por cobrar que incluye su monto. Hasta que el sistema emita Notas
      // de Crédito sobre Notas de Débito, se bloquea en vez de dejar Hacienda y el sistema en desacuerdo.
      const debitosVigentes = notas.filter(n => n.tipoDocumento === "02" && (n.estado === "ACEPTADA" || n.estado === "ENVIADA"));
      if (debitosVigentes.length > 0 && !esPruebaDeSandbox) {
        return res.status(409).json({ error: `Esta factura tiene Notas de Débito vigentes ante Hacienda (${debitosVigentes.map(n => n.consecutivo).join(", ")}). Anularla las dejaría válidas mientras el sistema anula la cuenta por cobrar, y el sistema todavía no emite Notas de Crédito sobre Notas de Débito. Corrija la factura con Notas de Crédito parciales.` });
      }

      // ERROR puede ser "nunca le llegó a Hacienda" (falló la firma, el token o la recepción) o "sí
      // le llegó y se cortó la respuesta". Antes de anularla sin Nota de Crédito se le pregunta: la
      // misma lección del POS de distinguir "nunca se envió" de "ya se envió".
      if (factura.estado === "ERROR" && credenciales && credenciales.ambiente === factura.ambiente) {
        let consulta;
        try {
          const token = await obtenerTokenHacienda(credenciales.ambiente, credenciales.usuarioAtv, credenciales.passwordAtv);
          consulta = await consultarEstadoHacienda(credenciales.ambiente, token, factura.clave);
        } catch (err: any) {
          return res.status(503).json({ error: `No se pudo confirmar con Hacienda si recibió esta factura (${err.message}). Intente de nuevo en unos minutos.` });
        }
        if (consulta.estado === "error") {
          return res.status(503).json({ error: `No se pudo confirmar con Hacienda si recibió esta factura${consulta.detalleMensaje ? ` (${consulta.detalleMensaje})` : ""}. Intente de nuevo en unos minutos.` });
        }
        const sincronizado = estadoTrasConsulta(factura, consulta);
        await guardarEstadoConsultado(factura.id, sincronizado.estado, sincronizado.mensajeError, consulta.respuestaXmlBase64);
        factura.estado = sincronizado.estado;
        factura.mensajeError = sincronizado.mensajeError;
        if (factura.estado === "ENVIADA") {
          return res.status(409).json({ error: "Hacienda sí recibió esta factura y todavía la está procesando. Use «Verificar estado» y anúlela cuando quede aceptada o rechazada." });
        }
      }

      const { company, paciente } = await cargarEmpresaYPaciente(idCompania, factura.idPaciente);
      if (!company) return res.status(404).json({ error: "Empresa no encontrada." });
      if (!paciente) return res.status(404).json({ error: "Paciente no encontrado." });

      // Lo que falta por acreditar de cada línea. Si ya hubo Notas de Crédito parciales, la de
      // anulación cubre solo el resto: acreditar la factura completa otra vez superaría el
      // comprobante original ante Hacienda y repondría dos veces las mismas existencias.
      const lineasOriginales = await lineasDeFactura(factura);
      const pendientePorServicio = factura.estado === "ACEPTADA" ? await cantidadesAcreditadas(factura.id) : new Map<number, number>();
      const lineasPorAcreditar: any[] = [];
      for (const l of lineasOriginales) {
        const yaAcreditada = l.idServicio != null ? Math.min(Number(l.cantidad), pendientePorServicio.get(l.idServicio) || 0) : 0;
        if (l.idServicio != null) pendientePorServicio.set(l.idServicio, (pendientePorServicio.get(l.idServicio) || 0) - yaAcreditada);
        const cantidad = Math.round((Number(l.cantidad) - yaAcreditada) * 1000) / 1000;
        if (cantidad > 0) lineasPorAcreditar.push({ ...l, cantidad });
      }

      const facturaAnulada = { ...factura, estado: "ANULADA", motivoAnulacion: motivo, idConsulta: null };
      const emiteNotaCredito = factura.estado === "ACEPTADA" && !esPruebaDeSandbox && lineasPorAcreditar.length > 0;

      if (!emiteNotaCredito) {
        // Sin Nota de Crédito: la factura nunca fue válida ante Hacienda (o sus Notas de Crédito
        // parciales ya la acreditaron completa). Solo los efectos locales.
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

      const { cert, credenciales: credencialesReales } = await exigirConfigHacienda(idCompania, factura.ambiente);
      const siguienteSecuencialNc = await reservarConsecutivoNota(idCompania, "03");
      const consecutivoNc = generarConsecutivo(siguienteSecuencialNc, "001", "00001", "03");
      const fechaEmisionNc = new Date();
      const claveNc = generarClaveNumerica(company.identificacion, consecutivoNc, fechaEmisionNc);
      const tipoIdReceptor = paciente.tipoIdentificacion === "EXT" ? "03" : paciente.tipoIdentificacion;
      const lineasNc = calcularLineas(lineasPorAcreditar.map(l => ({
        codigoCabys: l.codigoCabys, detalle: l.detalle, unidadMedida: l.unidadMedida, cantidad: l.cantidad, precioUnitario: Number(l.precioUnitario), porcentajeIva: Number(l.porcentajeIva)
      }))).map((l, i) => ({ ...l, idServicio: lineasPorAcreditar[i].idServicio, tipo: lineasPorAcreditar[i].tipo }));
      const resumen = calcularResumen(lineasNc);
      const condicionVenta = factura.condicionVenta || "01";

      const xml = construirXmlNotaCredito({
        clave: claveNc,
        consecutivo: consecutivoNc,
        fechaEmision: fechaEmisionNc,
        emisor: {
          nombre: company.razonSocial, nombreComercial: company.nombreComercial,
          tipoIdentificacion: company.tipoIdentificacion, identificacion: company.identificacion,
          correoElectronico: company.correoEmisor, provincia: company.provincia, canton: company.canton,
          distrito: company.distrito, otrasSenas: company.otrasSenas, codigoActividad: limpiarCodigoActividad(company.actividadEconomica)
        },
        receptor: { nombre: paciente.nombreCompleto, tipoIdentificacion: tipoIdReceptor, identificacion: paciente.identificacion, correoElectronico: paciente.correoElectronico || undefined },
        condicionVenta,
        medioPago: factura.medioPago || "01",
        plazoCredito: factura.plazoCredito ?? null,
        lineas: lineasNc,
        resumen,
        referencia: { tipoDocumento: "01", numero: factura.clave, fechaEmision: factura.fechaEmision, codigo: "01", razon: motivo }
      });

      const { nota: notaCredito, exitoso } = await emitirYGuardarNota({
        tipoDocumento: "03", factura, xmlSinFirmar: xml, clave: claveNc, consecutivo: consecutivoNc, fechaEmision: fechaEmisionNc,
        condicionVenta, resumen, lineas: lineasNc, motivo, company, paciente, medioPago: factura.medioPago || "01",
        cert, credenciales: credencialesReales,
        aplicarEfectos: (connection) => aplicarAnulacion(connection, factura, lineasPorAcreditar, motivo)
      });
      if (!exitoso) {
        return res.status(502).json({ error: mensajeNotaNoTransmitida("Nota de Crédito de anulación", notaCredito, "La factura NO fue anulada"), notaCredito });
      }
      res.json({ factura: facturaAnulada, notaCredito });
    } catch (err: any) {
      console.error("[Hacienda] Error anulando factura:", err);
      res.status(err.status || 500).json({ error: err.message });
    }
  }));

  function mensajeNotaNoTransmitida(nombre: string, nota: any, consecuencia: string): string {
    // Envío incierto: NO se invita a reintentar — si Hacienda sí la tiene, otra la duplicaría.
    if (String(nota.mensajeError || "").startsWith(MARCA_ENVIO_INCIERTO)) {
      return `No se pudo confirmar si Hacienda recibió la ${nombre} ${nota.consecutivo}. ${consecuencia}: no se tocó el inventario ni la cuenta por cobrar. Use «Verificar estado» sobre esa nota antes de volver a intentarlo.`;
    }
    const motivo = nota.estado === "RECHAZADA" ? `Hacienda rechazó la ${nombre}` : `Hacienda no recibió la ${nombre}`;
    return `${motivo}: ${nota.mensajeError || "sin detalle"}. ${consecuencia}: no se tocó el inventario ni la cuenta por cobrar. Corrija el problema y vuelva a intentarlo.`;
  }

  // Carga la factura original + empresa + paciente + líneas ya guardadas — validación y datos
  // compartidos entre /nota-credito y /nota-debito (ambos ajustan, total o parcial, una Factura
  // Electrónica ya emitida; a diferencia de /anular, ninguno cambia el estado de la factura
  // original, porque un ajuste no es una anulación).
  async function cargarFacturaParaAjuste(req: any, res: any): Promise<{ factura: any; company: Company; paciente: Patient; lineasOriginales: any[] } | null> {
    const factura = await cargarFacturaPorId(parseInt(req.params.id));
    if (!factura) { res.status(404).json({ error: "Factura no encontrada." }); return null; }
    if (!canAccessCompany(sessionOf(req), factura.idCompania)) { res.status(403).json({ error: "No autorizado." }); return null; }
    if (factura.tipoDocumento !== "01") { res.status(400).json({ error: "Solo se pueden ajustar Facturas Electrónicas (no otras Notas de Crédito/Débito)." }); return null; }
    // Solo ACEPTADA (antes también ENVIADA): una Nota referencia la factura por su clave, y si
    // Hacienda todavía no la aceptó —o termina rechazándola— rechaza también la Nota.
    if (factura.estado !== "ACEPTADA") {
      res.status(400).json({ error: factura.estado === "ENVIADA"
        ? "Hacienda todavía está procesando esta factura. Use «Verificar estado» y emita la Nota cuando quede aceptada."
        : "Solo se pueden ajustar facturas que Hacienda aceptó." });
      return null;
    }
    const incierta = notaEnEnvioIncierto(await notasDeFactura(factura.id));
    if (incierta) { res.status(409).json({ error: mensajeEnvioIncierto(incierta) }); return null; }

    const { company, paciente } = await cargarEmpresaYPaciente(factura.idCompania, factura.idPaciente);
    if (!company) { res.status(404).json({ error: "Empresa no encontrada." }); return null; }
    if (!paciente) { res.status(404).json({ error: "Paciente no encontrado." }); return null; }

    return { factura, company, paciente, lineasOriginales: await lineasDeFactura(factura) };
  }

  // Transmite una Nota de Crédito/Débito ya armada y la guarda. `tipoDocumento` es '02' (Débito) o
  // '03' (Crédito).
  //
  // Siempre se transmite de verdad, sin "modo prueba": solo se llega aquí sobre una factura que
  // Hacienda aceptó, y ante Hacienda esa factura sigue intacta hasta que reciba la Nota (antes una
  // Nota simulada sobre una factura real dejaba el sistema y Hacienda diciendo cosas distintas).
  //
  // Los efectos locales (inventario, CxC, anular la factura) se aplican en la MISMA transacción que
  // guarda la Nota y SOLO si Hacienda la recibió (ENVIADA/ACEPTADA). Si no le llegó o la rechazó,
  // la Nota queda guardada como registro de ese intento (su consecutivo ya se usó) pero nada más
  // cambia, y se puede volver a intentar. Antes los efectos se aplicaban antes de saber nada, así
  // que una Nota fallida dejaba stock y CxC movidos sin ningún comprobante que los respaldara.
  async function emitirYGuardarNota(params: {
    tipoDocumento: "02" | "03";
    factura: any;
    xmlSinFirmar: string;
    clave: string;
    consecutivo: string;
    fechaEmision: Date;
    condicionVenta: string;
    resumen: ReturnType<typeof calcularResumen>;
    lineas: any[];
    motivo: string;
    company: Company;
    paciente: Patient;
    medioPago: string;
    cert: CertificadoEmpresa;
    credenciales: CredencialesAtv;
    aplicarEfectos: (connection: any | null) => Promise<void>;
  }): Promise<{ nota: any; exitoso: boolean }> {
    const { tipoDocumento, factura, xmlSinFirmar, clave, consecutivo, fechaEmision, condicionVenta, resumen, lineas, motivo, company, paciente, medioPago, cert, credenciales, aplicarEfectos } = params;

    const transmision = await transmitirComprobante({
      xmlSinFirmar, clave, fechaEmision: fechaEmisionCR(fechaEmision), cert, credenciales, company,
      receptor: { tipoIdentificacion: paciente.tipoIdentificacion === "EXT" ? "03" : paciente.tipoIdentificacion, identificacion: paciente.identificacion }
    });
    const exitoso = transmision.estado === "ENVIADA" || transmision.estado === "ACEPTADA";

    const nota: any = {
      idCompania: factura.idCompania,
      idCita: null,
      idPaciente: factura.idPaciente,
      clave,
      consecutivo,
      fechaEmision: fechaEmisionCR(fechaEmision),
      ambiente: credenciales.ambiente,
      lineas,
      subtotal: resumen.totalVenta,
      totalIva: resumen.totalImpuesto,
      total: resumen.totalComprobante,
      estado: transmision.estado,
      mensajeError: transmision.mensajeError,
      creadaEn: new Date().toISOString(),
      condicionVenta,
      plazoCredito: condicionVenta === "02" ? factura.plazoCredito ?? null : null,
      tipoDocumento,
      idFacturaReferencia: factura.id,
      motivoAnulacion: motivo,
      medioPago,
      montoRecibido: null,
      xmlFirmado: transmision.xmlFirmado,
      respuestaHacienda: transmision.respuestaHacienda
    };

    if (dbConnected && pool) {
      const insertarNota = async (connection: any) => {
        const [result] = await connection.query(
          "INSERT INTO facturas (idCompania, idCita, idPaciente, clave, consecutivo, fechaEmision, ambiente, subtotal, totalIva, total, estado, mensajeError, creadaEn, condicionVenta, tipoDocumento, idFacturaReferencia, motivoAnulacion, medioPago, montoRecibido, plazoCredito, xml_firmado, respuesta_hacienda) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [nota.idCompania, nota.idCita, nota.idPaciente, nota.clave, nota.consecutivo, nota.fechaEmision, nota.ambiente, nota.subtotal, nota.totalIva, nota.total, nota.estado, nota.mensajeError, nota.creadaEn, nota.condicionVenta, nota.tipoDocumento, nota.idFacturaReferencia, nota.motivoAnulacion, nota.medioPago, nota.montoRecibido, nota.plazoCredito, nota.xmlFirmado || null, nota.respuestaHacienda || null]
        );
        nota.id = (result as any).insertId;
        await guardarLineasFactura(connection, nota.id, nota.lineas);
      };
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        await insertarNota(connection);
        if (exitoso) await aplicarEfectos(connection);
        await connection.commit();
      } catch (err: any) {
        // Si la conexión misma falló, el rollback también lanza; no debe impedir el guardado de abajo.
        await connection.rollback().catch(() => {});
        // Hacienda ya tiene esta Nota: perder su registro local (clave, XML firmado) sería peor que
        // quedarse sin sus efectos. Se guarda sola, marcada, y el error sigue hacia el usuario.
        if (exitoso) {
          nota.mensajeError = `Hacienda recibió esta nota, pero no se pudo aplicar su efecto en inventario/cuenta por cobrar (${err.message}): ajústelo a mano.`;
          await insertarNota(connection).catch(e => console.error("[Hacienda] No se pudo guardar la nota ya transmitida:", nota.clave, e));
        }
        throw err;
      } finally {
        connection.release();
      }
    } else {
      nota.id = Math.max(0, ...localFacturas.map(f => f.id)) + 1;
      localFacturas.push(nota);
      if (exitoso) await aplicarEfectos(null);
    }

    return { nota, exitoso };
  }

  // Ajuste de la CxC de una factura a crédito por una Nota (montos en colones, `delta` > 0 aumenta).
  // - Nota de Débito: suma al total y al saldo; una cuenta ya PAGADA vuelve a PENDIENTE (el
  //   paciente vuelve a deber), y si la factura nunca tuvo CxC se le crea una.
  // - Nota de Crédito parcial: resta (sin bajar de 0); si el saldo llega a 0 queda PAGADA. Solo
  //   sobre una cuenta PENDIENTE: si ya estaba pagada, lo acreditado es una devolución de dinero que
  //   se hace fuera del sistema.
  // Devuelve el saldo a favor del paciente: lo acreditado que excede lo que todavía debía (antes ese
  // pago de más desaparecía sin rastro al recortar el saldo a 0).
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
  // No se recorta a 0: el kardex (movimientos_inventario) tiene que cuadrar con el stock. Si una
  // Nota de Débito vende más de lo que queda —el chequeo previo no bloquea filas mientras Hacienda
  // responde—, el stock queda negativo, que es la verdad: hay una venta sin existencias que ajustar.
  async function moverStockPorNota(connection: any | null, idCompania: number, lineas: any[], signo: 1 | -1, referencia: string, motivo: string): Promise<void> {
    for (const l of lineas) {
      if (l.tipo !== "ARTICULO" || !l.idServicio) continue;
      if (connection) {
        const [servicioRows] = await connection.query("SELECT stock FROM servicios WHERE id_servicio = ? FOR UPDATE", [l.idServicio]);
        const stockResultante = (Number((servicioRows as any[])[0]?.stock) || 0) + signo * Number(l.cantidad);
        await connection.query("UPDATE servicios SET stock = ? WHERE id_servicio = ?", [stockResultante, l.idServicio]);
        await connection.query(
          `INSERT INTO movimientos_inventario (idCompania, idServicio, tipo, cantidad, stockResultante, referencia, notas, creadoPor, creadoEn) VALUES (?, ?, '${signo > 0 ? "DEVOLUCION_VENTA" : "VENTA"}', ?, ?, ?, ?, ?, ?)`,
          [idCompania, l.idServicio, signo * Number(l.cantidad), stockResultante, referencia, motivo, null, new Date().toISOString()]
        );
      } else {
        const servicio = localServicios.find(s => s.id === l.idServicio);
        if (servicio) servicio.stock = (servicio.stock || 0) + signo * Number(l.cantidad);
      }
    }
  }

  // Nota de Crédito PARCIAL (o total sin marcar la factura como ANULADA): corrige el monto de una
  // factura ya emitida acreditando cantidades específicas de sus líneas originales — a diferencia
  // de POST /api/facturas/:id/anular (que además marca la factura ANULADA y libera su consulta),
  // este endpoint es para correcciones (se cobró de más, una devolución parcial) donde la factura
  // original sigue vigente. Código de referencia '02' ("Corrige monto", Nota 9 de
  // ANEXOS_Y_ESTRUCTURAS_V4.4.pdf) — nunca '01' (reservado a anulación total vía /anular).
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
      const { cert, credenciales } = await exigirConfigHacienda(idCompania, factura.ambiente);

      // Hacienda exige que la suma de ajustes nunca supere el comprobante original (Anexos V4.4,
      // sección "Información de referencia").
      const acreditadoPorServicio = await cantidadesAcreditadas(factura.id);
      const lineasInput = [];
      for (const pedida of lineasBody) {
        const idServicio = parseInt(pedida.idServicio as any);
        const cantidad = parseFloat(pedida.cantidad as any);
        if (!Number.isFinite(cantidad) || cantidad <= 0) return res.status(400).json({ error: "Cada línea a acreditar debe tener una cantidad mayor a 0." });
        const originales = lineasOriginales.filter((l: any) => l.idServicio === idServicio);
        if (originales.length === 0) return res.status(400).json({ error: `La factura original no tiene una línea con el servicio ${idServicio}.` });
        const original = originales[0];
        const vendido = originales.reduce((s: number, l: any) => s + Number(l.cantidad), 0);
        const yaAcreditado = acreditadoPorServicio.get(idServicio) || 0;
        const disponible = vendido - yaAcreditado;
        if (cantidad > disponible + 1e-9) {
          return res.status(400).json({ error: `"${original.detalle}": solo quedan ${disponible} unidad(es) por acreditar (ya se acreditaron ${yaAcreditado} de ${vendido}).` });
        }
        // Lo pedido en esta misma nota también cuenta: repetir el servicio en dos líneas de la
        // solicitud no puede acreditar más de lo vendido.
        acreditadoPorServicio.set(idServicio, yaAcreditado + cantidad);
        lineasInput.push({
          codigoCabys: original.codigoCabys,
          detalle: original.detalle,
          unidadMedida: original.unidadMedida,
          cantidad,
          precioUnitario: Number(original.precioUnitario),
          porcentajeIva: Number(original.porcentajeIva),
          idServicio,
          tipo: original.tipo
        });
      }

      const lineasCalculadas = calcularLineas(lineasInput).map((l, i) => ({ ...l, idServicio: lineasInput[i].idServicio, tipo: lineasInput[i].tipo }));
      const resumen = calcularResumen(lineasCalculadas);

      const consecutivo = generarConsecutivo(await reservarConsecutivoNota(idCompania, "03"), "001", "00001", "03");
      const fechaEmision = new Date();
      const clave = generarClaveNumerica(company.identificacion, consecutivo, fechaEmision);
      const tipoIdReceptor = paciente.tipoIdentificacion === "EXT" ? "03" : paciente.tipoIdentificacion;
      const condicionVenta = factura.condicionVenta || "01";

      const xml = construirXmlNotaCredito({
        clave,
        consecutivo,
        fechaEmision,
        emisor: {
          nombre: company.razonSocial, nombreComercial: company.nombreComercial,
          tipoIdentificacion: company.tipoIdentificacion, identificacion: company.identificacion,
          correoElectronico: company.correoEmisor, provincia: company.provincia, canton: company.canton,
          distrito: company.distrito, otrasSenas: company.otrasSenas, codigoActividad: limpiarCodigoActividad(company.actividadEconomica)
        },
        receptor: { nombre: paciente.nombreCompleto, tipoIdentificacion: tipoIdReceptor, identificacion: paciente.identificacion, correoElectronico: paciente.correoElectronico || undefined },
        condicionVenta,
        medioPago: factura.medioPago || "01",
        plazoCredito: factura.plazoCredito ?? null,
        lineas: lineasCalculadas,
        resumen,
        referencia: { tipoDocumento: "01", numero: factura.clave, fechaEmision: factura.fechaEmision, codigo: "02", razon: motivo }
      });

      let saldoAFavor = 0;
      const { nota: notaCredito, exitoso } = await emitirYGuardarNota({
        tipoDocumento: "03", factura, xmlSinFirmar: xml, clave, consecutivo, fechaEmision, condicionVenta, resumen,
        lineas: lineasCalculadas, motivo, company, paciente, medioPago: factura.medioPago || "01", cert, credenciales,
        aplicarEfectos: async (connection) => {
          // Repone las existencias acreditadas (no todo el stock de la factura, como /anular) y
          // rebaja lo que el paciente todavía debe. Antes la CxC no se tocaba: la nota reducía la
          // deuda ante Hacienda pero el saldo por cobrar seguía igual.
          await moverStockPorNota(connection, idCompania, lineasCalculadas, 1, `Nota de Crédito ${consecutivo} sobre factura ${factura.consecutivo}`, motivo);
          // Solo una venta a crédito tiene cuenta por cobrar; en una de contado la devolución es obvia.
          if (condicionVenta === "02") saldoAFavor = await ajustarCxcPorNota(connection, factura, -resumen.totalComprobante);
        }
      });
      if (!exitoso) {
        return res.status(502).json({ error: mensajeNotaNoTransmitida("Nota de Crédito", notaCredito, "No se acreditó nada"), notaCredito });
      }
      if (saldoAFavor > 0) {
        notaCredito.mensajeError = `${MARCA_SALDO_A_FAVOR} ₡${saldoAFavor.toLocaleString("es-CR")} — lo acreditado superó lo que quedaba por cobrar de la factura. Devuélvalo fuera del sistema.`;
        await guardarEstadoConsultado(notaCredito.id, notaCredito.estado, notaCredito.mensajeError, null);
      }
      res.json(notaCredito);
    } catch (err: any) {
      console.error("[Hacienda] Error emitiendo Nota de Crédito parcial:", err);
      res.status(err.status || 500).json({ error: err.message });
    }
  }));

  // Nota de Débito (total o parcial): agrega un cargo adicional sobre una factura ya emitida
  // (sesión adicional no cobrada, corrección al alza, etc.). Las líneas son nuevas — se toman del
  // catálogo VIGENTE de servicios, igual que POST /api/facturas, no de la factura original.
  app.post("/api/facturas/:id/nota-debito", requireAuth, unaOperacionALaVez(candadoPorFactura, async (req, res) => {
    try {
      if (req.body.modoPrueba === true) return res.status(400).json({ error: MENSAJE_SIN_MODO_PRUEBA });
      const motivo = String(req.body.motivo || "").trim().slice(0, RAZON_MAX);
      if (!motivo) return res.status(400).json({ error: "Indique el motivo de la Nota de Débito." });
      const lineasBody: Array<{ idServicio: number; cantidad: number }> = req.body.lineas || [];
      if (lineasBody.length === 0) return res.status(400).json({ error: "Agregue al menos un servicio a debitar." });
      const medioPago = req.body.medioPago || "01";
      if (!esCodigoCatalogo(medioPago)) return res.status(400).json({ error: "Medio de pago inválido." });

      const datos = await cargarFacturaParaAjuste(req, res);
      if (!datos) return;
      const { factura, company, paciente } = datos;
      const idCompania = factura.idCompania;
      const { cert, credenciales } = await exigirConfigHacienda(idCompania, factura.ambiente);

      let serviciosDisponibles: Servicio[];
      if (dbConnected && pool) {
        const [servicioRows] = await pool.query("SELECT * FROM servicios WHERE idCompania = ?", [idCompania]);
        serviciosDisponibles = (servicioRows as any[]).map(row => normalizeRow(row, 'id_servicio'));
      } else {
        serviciosDisponibles = localServicios.filter(s => s.idCompania === idCompania);
      }

      const lineasInput = [];
      // Se chequea contra lo pedido en TODAS las líneas del mismo artículo, y antes de transmitir:
      // después de que Hacienda recibe la Nota ya no hay vuelta atrás.
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
        lineasInput.push({
          codigoCabys: servicio.codigoCabys, detalle: servicio.nombre, unidadMedida: servicio.unidadMedida || 'Sp',
          cantidad, precioUnitario: servicio.precio,
          porcentajeIva: servicio.porcentajeIva != null ? servicio.porcentajeIva : company.ivaPorDefecto,
          idServicio: servicio.id, tipo: servicio.tipo || 'SERVICIO'
        });
      }

      const lineasCalculadas = calcularLineas(lineasInput).map((l, i) => ({ ...l, idServicio: lineasInput[i].idServicio, tipo: lineasInput[i].tipo }));
      const resumen = calcularResumen(lineasCalculadas);

      const consecutivo = generarConsecutivo(await reservarConsecutivoNota(idCompania, "02"), "001", "00001", "02");
      const fechaEmision = new Date();
      const clave = generarClaveNumerica(company.identificacion, consecutivo, fechaEmision);
      const tipoIdReceptor = paciente.tipoIdentificacion === "EXT" ? "03" : paciente.tipoIdentificacion;
      const condicionVenta = factura.condicionVenta || "01";

      const xml = construirXmlNotaDebito({
        clave,
        consecutivo,
        fechaEmision,
        emisor: {
          nombre: company.razonSocial, nombreComercial: company.nombreComercial,
          tipoIdentificacion: company.tipoIdentificacion, identificacion: company.identificacion,
          correoElectronico: company.correoEmisor, provincia: company.provincia, canton: company.canton,
          distrito: company.distrito, otrasSenas: company.otrasSenas, codigoActividad: limpiarCodigoActividad(company.actividadEconomica)
        },
        receptor: { nombre: paciente.nombreCompleto, tipoIdentificacion: tipoIdReceptor, identificacion: paciente.identificacion, correoElectronico: paciente.correoElectronico || undefined },
        condicionVenta,
        medioPago,
        plazoCredito: factura.plazoCredito ?? null,
        lineas: lineasCalculadas,
        resumen,
        referencia: { tipoDocumento: "01", numero: factura.clave, fechaEmision: factura.fechaEmision, codigo: "02", razon: motivo }
      });

      const { nota: notaDebito, exitoso } = await emitirYGuardarNota({
        tipoDocumento: "02", factura, xmlSinFirmar: xml, clave, consecutivo, fechaEmision, condicionVenta, resumen,
        lineas: lineasCalculadas, motivo, company, paciente, medioPago, cert, credenciales,
        aplicarEfectos: async (connection) => {
          await moverStockPorNota(connection, idCompania, lineasCalculadas, -1, `Nota de Débito ${consecutivo} sobre factura ${factura.consecutivo}`, motivo);
          // Venta a crédito: el cargo adicional se suma a lo que el paciente debe. Antes solo se
          // sumaba si la CxC seguía PENDIENTE, así que una ND sobre una cuenta ya pagada se perdía.
          if (condicionVenta === "02") await ajustarCxcPorNota(connection, factura, resumen.totalComprobante);
        }
      });
      if (!exitoso) {
        return res.status(502).json({ error: mensajeNotaNoTransmitida("Nota de Débito", notaDebito, "No se cargó nada"), notaDebito });
      }
      res.json(notaDebito);
    } catch (err: any) {
      console.error("[Hacienda] Error emitiendo Nota de Débito:", err);
      res.status(err.status || 500).json({ error: err.message });
    }
  }));

  // Vuelve a CONSULTAR a Hacienda el estado de un comprobante ya transmitido. Nunca lo reenvía
  // (ver transmitirComprobante). Sirve tanto para una factura ENVIADA que no resolvió durante el
  // sondeo, como para una en ERROR que quizás sí le llegó a Hacienda (se cortó la respuesta).
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

      // Si el IdP de Hacienda no responde o rechaza el login, es el mismo "no se pudo consultar" que
      // una consulta caída: 502, sin tocar el estado (antes salía como 500).
      let consulta: EstadoHaciendaResultado;
      try {
        const token = await obtenerTokenHacienda(credenciales.ambiente, credenciales.usuarioAtv, credenciales.passwordAtv);
        consulta = await consultarEstadoHacienda(credenciales.ambiente, token, factura.clave);
      } catch (err: any) {
        return res.status(502).json({ error: `No se pudo consultar a Hacienda en este momento (${err.message}). Intente de nuevo en unos minutos.` });
      }
      if (consulta.estado === "error") {
        return res.status(502).json({ error: `No se pudo consultar a Hacienda en este momento${consulta.detalleMensaje ? ` (${consulta.detalleMensaje})` : ""}. Intente de nuevo en unos minutos.` });
      }

      const { estado: nuevoEstado, mensajeError } = estadoTrasConsulta(factura, consulta);
      await guardarEstadoConsultado(id, nuevoEstado, mensajeError, consulta.respuestaXmlBase64);

      res.json({ id, estado: nuevoEstado, mensajeError, estadoHacienda: consulta.estado });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Reenvía por correo un resumen HTML del comprobante ya emitido (no adjunta el XML firmado de
  // Hacienda — este no se persiste en ningún lado, ver POST /api/facturas). Sin columna idFactura
  // dedicada en notification_logs; el consecutivo queda en el asunto/cuerpo del log igual.
  app.post("/api/facturas/:id/reenviar-correo", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      let factura: any;
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM facturas WHERE id_factura = ?", [id]);
        factura = (rows as any[]).map(row => normalizeRow(row, 'id_factura'))[0];
      } else {
        factura = localFacturas.find(f => f.id === id);
      }
      if (!factura) return res.status(404).json({ error: "Factura no encontrada." });
      if (!canAccessCompany(sessionOf(req), factura.idCompania)) {
        return res.status(403).json({ error: "No autorizado." });
      }
      factura.lineas = dbConnected && pool
        ? (await fetchLineasPorFactura([factura.id])).get(factura.id) || []
        : (typeof factura.lineas === 'string' ? JSON.parse(factura.lineas) : factura.lineas);
      // Estas dos conservan el nombre snake_case del esquema original de Hacienda; se exponen en
      // camelCase aquí, que es el único punto que las consume (los adjuntos del correo).
      factura.xmlFirmado = factura.xmlFirmado ?? factura.xml_firmado ?? null;
      factura.respuestaHacienda = factura.respuestaHacienda ?? factura.respuesta_hacienda ?? null;

      const idCompania = factura.idCompania;
      let company: Company | undefined;
      let paciente: Patient | undefined;
      let smtpConfig: CompaniaSmtpConfig | undefined;
      if (dbConnected && pool) {
        const [companyRows] = await pool.query("SELECT * FROM companias WHERE id_compania = ?", [idCompania]);
        company = (companyRows as any[]).map(row => normalizeRow(row, 'id_compania'))[0];
        const [pacienteRows] = await pool.query("SELECT * FROM pacientes WHERE id_paciente = ?", [factura.idPaciente]);
        paciente = (pacienteRows as any[]).map(row => normalizeRow(row, 'id_paciente'))[0];
        const [smtpRows] = await pool.query("SELECT * FROM compania_smtp_config WHERE idCompania = ?", [idCompania]);
        const smtpRow = (smtpRows as any[])[0];
        smtpConfig = smtpRow ? { ...smtpRow, activo: !!smtpRow.activo } : undefined;
      } else {
        company = localCompanies.find(c => c.id === idCompania);
        paciente = localPatients.find(p => p.id === factura.idPaciente);
        smtpConfig = localSmtpConfigs.find(s => s.idCompania === idCompania);
      }
      if (!company) return res.status(404).json({ error: "Empresa no encontrada." });
      if (!paciente) return res.status(404).json({ error: "Paciente no encontrado." });
      if (!paciente.correoElectronico) return res.status(400).json({ error: "El paciente no tiene un correo electrónico registrado." });
      if (!smtpConfig || !smtpConfig.activo) {
        return res.status(400).json({ error: "Las notificaciones SMTP no están activas para esta empresa." });
      }

      const rendered = renderFacturaEmail({ company, patient: paciente, factura });

      // Adjuntos: el PDF va siempre, incluso en facturas simuladas — es el comprobante que el
      // paciente archiva. Los dos XML solo si existen: una factura en modo prueba no se firma ni
      // se envía a Hacienda, así que nunca los tendrá. La regla es "adjunta lo que haya".
      const adjuntosFactura: AdjuntoEmail[] = [];
      const pdfFactura = await generarPdfDesdeHtml(
        renderFacturaPdf({ company, patient: paciente, factura }),
        `factura ${factura.consecutivo}`
      );
      if (pdfFactura) {
        adjuntosFactura.push({ filename: `factura-${factura.consecutivo}.pdf`, content: pdfFactura, contentType: "application/pdf" });
      }
      if (factura.xmlFirmado) {
        adjuntosFactura.push({ filename: `factura-${factura.consecutivo}.xml`, content: factura.xmlFirmado, contentType: "application/xml" });
      }
      if (factura.respuestaHacienda) {
        // Hacienda la devuelve en base64; se adjunta ya decodificada para que el paciente pueda abrirla.
        adjuntosFactura.push({
          filename: `respuesta-hacienda-${factura.consecutivo}.xml`,
          content: Buffer.from(factura.respuestaHacienda, "base64"),
          contentType: "application/xml"
        });
      }

      await sendMail(smtpConfig, {
        to: paciente.correoElectronico,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        attachments: adjuntosFactura
      });

      const log: any = {
        idCompania,
        idCita: null,
        idConsulta: null,
        tipo: "FACTURA",
        destinatario: paciente.correoElectronico,
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
      console.error("Error reenviando factura por correo:", err);
      res.status(500).json({ error: err.message || "No se pudo reenviar la factura por correo." });
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
        const [cuentas] = await pool.query("SELECT * FROM cuentas_cobrar WHERE idCompania = ? ORDER BY fechaEmision DESC", [idCompania]);
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
          .map(c => ({ ...c, pagos: localCxcPagos.filter(p => p.idCuentaCobrar === c.id) })));
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
        "SELECT consecutivo, tipoDocumento, estado FROM facturas WHERE idCompania = ? AND ambiente = 'PRODUCCION' AND fechaEmision LIKE ? AND estado IN ('ENVIADA', 'ERROR', 'FIRMADA') ORDER BY fechaEmision",
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
        `SELECT f.id_factura FROM facturas f WHERE f.idCompania = ? AND f.tipoDocumento = '01' AND f.fechaEmision LIKE ? AND f.ambiente = 'PRODUCCION' AND ${SQL_FACTURA_DECLARABLE}`,
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
      const facturasMes = localFacturas.filter(f => f.idCompania === idCompania && f.tipoDocumento === "01" && f.fechaEmision.startsWith(periodo) && f.ambiente === "PRODUCCION" && esFacturaDeclarableLocal(f));
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
        `SELECT f.id_factura, f.subtotal, f.totalIva FROM facturas f WHERE f.idCompania = ? AND f.tipoDocumento = '01' AND f.fechaEmision LIKE ? AND f.ambiente = 'PRODUCCION' AND ${SQL_FACTURA_DECLARABLE}`,
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
      const facturasAnio = localFacturas.filter(f => f.idCompania === idCompania && f.tipoDocumento === "01" && f.fechaEmision.startsWith(anioStr) && f.ambiente === "PRODUCCION" && esFacturaDeclarableLocal(f));
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
            AND i.imapHost <> '' AND i.imapUsuario <> '' AND i.imapPasswordCifrado IS NOT NULL`
      );
      for (const row of filas as any[]) {
        try {
          const r = await revisarBuzonEmpresa(row.idCompania, row);
          if (r.nuevos > 0 || r.yaRegistrados > 0) {
            console.log(`[CORREO PROVEEDORES] Empresa ${row.idCompania}: ${r.nuevos} comprobante(s) nuevo(s), ${r.yaRegistrados} ya registrado(s) (de ${r.revisados} correo(s)).`);
          }
        } catch (err: any) {
          console.error(`[CORREO PROVEEDORES] Falla revisando el buzón de la empresa ${row.idCompania}:`, err.message || err);
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
          const [rows] = await pool.query("SELECT * FROM pacientes WHERE id_paciente = ?", [id]);
          return (rows as any[]).map(row => normalizeRow(row, 'id_paciente'))[0];
        }
        return localPatients.find(p => p.id === id);
      }

      async function fetchCitaById(id: number): Promise<Cita | undefined> {
        if (dbConnected && pool) {
          // Note: unlike pacientes/consultas, the dynamically-created `citas` table (see CREATE TABLE
          // IF NOT EXISTS citas above) has no `id_cita` column at all -- its real PK is just `id`.
          // Querying "id_cita" here throws "Unknown column 'id_cita'" (verified live), so we only match on `id`.
          const [rows] = await pool.query("SELECT * FROM citas WHERE id = ?", [id]);
          return (rows as any[]).map(row => normalizeRow(row, 'id'))[0];
        }
        return localCitas.find(c => c.id === id);
      }

      async function fetchConsultationById(id: number): Promise<Consultation | undefined> {
        if (dbConnected && pool) {
          const [rows] = await pool.query(`SELECT ${CONSULTA_EVAL_SELECT} FROM consultas c ${CONSULTA_EVAL_JOIN} WHERE c.id_consulta = ?`, [id]);
          const rawRow = (rows as any[])[0];
          if (!rawRow) return undefined;
          const row = normalizeRow(rawRow, 'id_consulta');
          const evaluaciones = reconstruirEvaluaciones(rawRow);
          return {
            ...row,
            ...evaluaciones
          };
        }
        return localConsultations.find(c => c.id === id);
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
          return res.status(400).json({ error: "Paciente o cita no encontrados." });
        }
        rendered = renderCitaEmail({ company, patient, cita, tipoNotif });
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
          return res.status(400).json({ error: "Paciente o consulta no encontrados." });
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

  // --- Public Booking Routes (no auth) ---

  app.get("/api/public/config", (req, res) => {
    res.json({ googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "" });
  });

  app.get("/api/public/clinicas", async (req, res) => {
    try {
      let companies: Company[];
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM companias WHERE estadoSaas = 'ACTIVA'");
        companies = (rows as any[]).map(row => normalizeRow(row, 'id_compania'));
      } else {
        companies = localCompanies.filter(c => c.estadoSaas === "ACTIVA");
      }
      res.json(companies.map(c => ({
        id: c.id,
        nombreComercial: c.nombreComercial,
        perfilCompania: c.perfilCompania,
        logoUrl: c.logoUrl,
        colorPrimario: c.colorPrimario,
        colorSidebar: c.colorSidebar
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/public/clinicas/:id/profesionales", async (req, res) => {
    try {
      const idCompania = parseInt(req.params.id);
      let users: any[];
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM usuarios WHERE idCompania = ? AND activo = 1", [idCompania]);
        users = (rows as any[]).map(row => normalizeRow(row, 'id_usuario'));
      } else {
        users = localUsers.filter(u => u.idCompania === idCompania && u.activo);
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
        duracionMinutos: s.duracionMinutos
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/public/clinicas/:id/pacientes/:identificacion", async (req, res) => {
    try {
      const idCompania = parseInt(req.params.id);
      const identificacion = req.params.identificacion;
      let patient: Patient | undefined;
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM pacientes WHERE idCompania = ? AND identificacion = ?", [idCompania, identificacion]);
        patient = (rows as any[]).map(row => normalizeRow(row, 'id_paciente'))[0];
      } else {
        patient = localPatients.find(p => p.idCompania === idCompania && p.identificacion === identificacion);
      }
      if (!patient) return res.status(404).json({ error: "Paciente no encontrado." });
      res.json({
        nombreCompleto: patient.nombreCompleto,
        telefono: patient.telefono,
        correoElectronico: patient.correoElectronico,
        tipoIdentificacion: patient.tipoIdentificacion,
        fechaNacimiento: patient.fechaNacimiento
      });
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
        if (!user) return res.status(404).json({ error: "Profesional no encontrado." });

        const [companyRows] = await pool.query("SELECT * FROM companias WHERE id_compania = ?", [user.idCompania]);
        company = (companyRows as any[]).map(row => normalizeRow(row, 'id_compania'))[0];
        if (company) {
          company.horarioAtencion = await fetchHorarioAtencionCompania(company.id);
          company.horarioDomicilio = await fetchHorarioDomicilioCompania(company.id);
        }

        const [citaRows] = await pool.query("SELECT * FROM citas WHERE idUsuarioNutricionista = ? AND fechaHora LIKE ?", [idUsuario, `${fecha}%`]);
        citasDelDia = citaRows as any[];

        const [blockRows] = await pool.query("SELECT * FROM calendar_blocks WHERE idUsuarioNutricionista = ?", [idUsuario]);
        bloqueosDelDia = blockRows as any[];
      } else {
        user = localUsers.find(u => u.id === idUsuario);
        if (!user) return res.status(404).json({ error: "Profesional no encontrado." });
        company = localCompanies.find(c => c.id === user.idCompania);
        citasDelDia = localCitas.filter(c => c.idUsuarioNutricionista === idUsuario && c.fechaHora.startsWith(fecha));
        bloqueosDelDia = localCalendarBlocks.filter(b => b.idUsuarioNutricionista === idUsuario);
      }

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
        if (servicio) duracionMin = servicio.duracionMinutos;
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
      const idUsuarioNutricionista = parseInt(body.idUsuarioNutricionista);
      const tipoVisita: "CONSULTORIO" | "DOMICILIO" = body.tipoVisita === "DOMICILIO" ? "DOMICILIO" : "CONSULTORIO";
      const fechaHora = body.fechaHora as string;
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
          const [citaRows] = await pool.query("SELECT * FROM citas WHERE idUsuarioNutricionista = ? AND fechaHora LIKE ?", [idUsuarioNutricionista, `${fecha}%`]);
          citasDelDiaPrevias = citaRows as any[];
        } else {
          citasDelDiaPrevias = localCitas.filter(c => c.idUsuarioNutricionista === idUsuarioNutricionista && c.fechaHora.startsWith(fecha));
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

          const [citaRows] = await connection.query("SELECT * FROM citas WHERE idUsuarioNutricionista = ? AND fechaHora LIKE ?", [idUsuarioNutricionista, `${fecha}%`]);
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
            await connection.rollback();
            connection.release();
            return res.status(409).json({ error: "Ese horario ya no está disponible. Por favor escoja otro." });
          }

          // Buscar o crear paciente por cédula
          const [existing] = await connection.query("SELECT * FROM pacientes WHERE idCompania = ? AND identificacion = ?", [idCompania, pac.identificacion]);
          paciente = (existing as any[]).map(row => normalizeRow(row, 'id_paciente'))[0];

          if (!paciente) {
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
            // Paciente encontrado por cédula: el formulario público precarga estos campos desde
            // el registro existente pero, sin este UPDATE, cualquier corrección que la persona
            // escriba aquí (p.ej. un correo desactualizado) se descartaba en silencio — la cita
            // se guardaba igual, pero la confirmación seguía yendo al correo viejo. Se
            // actualizan los datos de contacto con lo realmente enviado antes de usarlos para
            // el correo de confirmación.
            const contactoActualizado = {
              nombreCompleto: pac.nombreCompleto,
              correoElectronico: pac.correoElectronico,
              telefono: pac.telefono,
              tipoIdentificacion: pac.tipoIdentificacion,
              fechaNacimiento: pac.fechaNacimiento
            };
            await connection.query(
              "UPDATE pacientes SET nombreCompleto = ?, correoElectronico = ?, telefono = ?, tipoIdentificacion = ?, fechaNacimiento = ? WHERE id_paciente = ?",
              [
                contactoActualizado.nombreCompleto,
                contactoActualizado.correoElectronico,
                contactoActualizado.telefono,
                contactoActualizado.tipoIdentificacion,
                contactoActualizado.fechaNacimiento,
                paciente.id
              ]
            );
            paciente = { ...paciente, ...contactoActualizado };
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
          const contactoActualizado = {
            nombreCompleto: pac.nombreCompleto,
            correoElectronico: pac.correoElectronico,
            telefono: pac.telefono,
            tipoIdentificacion: pac.tipoIdentificacion,
            fechaNacimiento: pac.fechaNacimiento
          };
          const idx = localPatients.findIndex(p => p.id === paciente!.id);
          if (idx !== -1) localPatients[idx] = { ...localPatients[idx], ...contactoActualizado };
          paciente = { ...paciente, ...contactoActualizado };
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
          const correoCliente = renderCitaEmail({ company, patient: paciente!, cita: nuevaCita, tipoNotif: "CONFIRMACION" });
          const correoEspecialista = renderCitaEmailProfesional({ company, professional: user, patient: paciente!, cita: nuevaCita });

          await sendMail(smtpConfig, { to: paciente!.correoElectronico, subject: correoCliente.subject, html: correoCliente.html, text: correoCliente.text });
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
  }
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
});

