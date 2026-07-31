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
  construirXmlFactura
} from "./server/haciendaFactura";
import { obtenerTokenHacienda, enviarFacturaHacienda, consultarEstadoHacienda } from "./server/haciendaApi";
import { serviciosDefectoParaPerfil } from "./server/serviciosDefecto";
import type { CompaniaSmtpConfig } from "./src/data/mockData";
import { sendMail } from "./server/mailer";
import { renderCitaEmail, renderCitaEmailProfesional, renderConsultaEmail, renderAccountStatusEmail, renderNuevaEmpresaEmail, renderPasswordResetEmail } from "./server/emailTemplates";
import { calcularTiempoTrasladoMinutos, TrasladoNoCalculableError } from "./server/googleMaps";
import type { Company, Patient, Cita, Consultation, CalendarBlock, CompanyPayment, HorarioAtencion, Servicio, Factura } from "./src/data/mockData";
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
  defaultFacturas
} from "./src/data/mockData";

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
let localCompanyPayments: CompanyPayment[] = [...defaultCompanyPayments];
let localServicios: Servicio[] = [...defaultServicios];
let localFacturas: Factura[] = [...defaultFacturas];

interface LocalHaciendaConfig {
  idCompania: number;
  ambiente: 'SANDBOX' | 'PRODUCCION';
  usuarioAtv: string;
  passwordAtvCifrado: string;
  certificadoP12Cifrado: string;
  certificadoPinCifrado: string;
  certificadoNombreArchivo: string | null;
  certificadoVenceEn: string | null;
  ultimoConsecutivo: number;
}
let localHaciendaConfigs: LocalHaciendaConfig[] = [];

async function setupDatabase() {
  const host = process.env.DB_HOST || "172.28.185.50";
  const port = parseInt(process.env.DB_PORT || "7878");
  const user = process.env.DB_USER || "root";
  const password = process.env.DB_PASSWORD || "";
  const database = process.env.DB_NAME || "ConsultorioDB";

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
      multipleStatements: true
    });

    console.log(`[MySQL] Conexión establecida con éxito a '${database}'. Inicializando esquema desde ConsultorioDB_schema.sql...`);
    await createTables();
    
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

async function createTables() {
  if (!pool) return;

  try {
    console.log("[MySQL] Creando tablas del sistema de citas y notificaciones si no existen...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS citas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idCompania INT NOT NULL,
        idPaciente INT NOT NULL,
        idUsuarioNutricionista INT NOT NULL,
        idConsulta INT NULL,
        fechaHora VARCHAR(50) NOT NULL,
        duracionMinutos INT NOT NULL DEFAULT 30,
        estadoCita VARCHAR(50) NOT NULL DEFAULT 'PROGRAMADA',
        notas TEXT,
        confirmacionEnviadaEn VARCHAR(50),
        recordatorioEnviadoEn VARCHAR(50),
        cancelacionEnviadaEn VARCHAR(50)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS tipoVisita VARCHAR(20) NOT NULL DEFAULT 'CONSULTORIO'`);
    await pool.query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS direccionDomicilio VARCHAR(255) NULL`);
    await pool.query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS pacienteLat DECIMAL(10,7) NULL`);
    await pool.query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS pacienteLng DECIMAL(10,7) NULL`);
    await pool.query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS tiempoTrasladoMinutos INT NULL`);
    await pool.query(`ALTER TABLE citas ADD COLUMN IF NOT EXISTS idServicio INT NULL`);
    // Todas las consultas de disponibilidad filtran por (idUsuarioNutricionista, fechaHora) —
    // sin este índice, el `SELECT ... FOR UPDATE` que serializa reservas concurrentes en
    // POST /api/public/citas haría un table scan y bloquearía filas de otros profesionales sin
    // relación alguna con la reserva en curso.
    await pool.query(`ALTER TABLE citas ADD INDEX IF NOT EXISTS idx_citas_profesional_fecha (idUsuarioNutricionista, fechaHora)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS calendar_blocks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idCompania INT NOT NULL,
        idUsuarioNutricionista INT NOT NULL,
        fechaInicio VARCHAR(10) NOT NULL,
        fechaFin VARCHAR(10) NOT NULL,
        horaInicio VARCHAR(5) NULL,
        horaFin VARCHAR(5) NULL,
        motivo VARCHAR(255)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS servicios (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idCompania INT NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        precio DECIMAL(10,2) NOT NULL,
        porcentajeIva DECIMAL(5,2) NULL,
        duracionMinutos INT NOT NULL DEFAULT 30,
        activo BOOLEAN NOT NULL DEFAULT TRUE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    await pool.query(`ALTER TABLE servicios ADD COLUMN IF NOT EXISTS duracionMinutos INT NOT NULL DEFAULT 30`);
    await pool.query(`ALTER TABLE servicios ADD COLUMN IF NOT EXISTS codigoCabys VARCHAR(13) NULL`);
    await pool.query(`ALTER TABLE servicios ADD COLUMN IF NOT EXISTS unidadMedida VARCHAR(5) NOT NULL DEFAULT 'Sp'`);
    // La tabla `servicios` ya existía (creada por ConsultorioDB_schema.sql con columnas en
    // snake_case: id_servicio, id_compania, porcentaje_iva, estado) — el CREATE TABLE IF NOT
    // EXISTS de arriba no la tocó. Se agregan las columnas camelCase que usa esta app, igual
    // que se hace para companias/usuarios/pacientes.
    await pool.query(`ALTER TABLE servicios ADD COLUMN IF NOT EXISTS id INT NULL`);
    await pool.query(`ALTER TABLE servicios ADD COLUMN IF NOT EXISTS idCompania INT NULL`);
    await pool.query(`ALTER TABLE servicios ADD COLUMN IF NOT EXISTS porcentajeIva DECIMAL(5,2) NULL`);
    await pool.query(`ALTER TABLE servicios ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS facturas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idCompania INT NOT NULL,
        idCita INT NULL,
        idPaciente INT NOT NULL,
        clave VARCHAR(50) NOT NULL,
        consecutivo VARCHAR(20) NOT NULL,
        fechaEmision VARCHAR(30) NOT NULL,
        ambiente VARCHAR(20) NOT NULL,
        lineas JSON NOT NULL,
        subtotal DECIMAL(14,5) NOT NULL,
        totalIva DECIMAL(14,5) NOT NULL,
        total DECIMAL(14,5) NOT NULL,
        estado VARCHAR(20) NOT NULL,
        mensajeError TEXT NULL,
        creadaEn VARCHAR(30) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // compania_hacienda_config ya existe desde ConsultorioDB_schema.sql (sin esta columna) —
    // se agrega aquí en vez de en el .sql para no perder el contador de facturas ya emitidas
    // si el esquema se re-importa.
    await pool.query(`ALTER TABLE compania_hacienda_config ADD COLUMN IF NOT EXISTS ultimo_consecutivo INT NOT NULL DEFAULT 0`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS pagos_empresa (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idCompania INT NOT NULL,
        fecha DATE NOT NULL,
        monto DECIMAL(10,2) NOT NULL,
        notas VARCHAR(255),
        registradoPor VARCHAR(150)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS compania_smtp_config (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idCompania INT NOT NULL,
        proveedor VARCHAR(50) NOT NULL DEFAULT 'OTRO',
        smtpHost VARCHAR(255),
        smtpPort INT NOT NULL DEFAULT 587,
        smtpSeguridad VARCHAR(50) NOT NULL DEFAULT 'TLS',
        smtpUsuario VARCHAR(255),
        smtpPasswordCifrado VARCHAR(255),
        remitenteNombre VARCHAR(255),
        remitenteCorreo VARCHAR(255),
        recordatorioHorasAntes INT NOT NULL DEFAULT 24,
        activo BOOLEAN NOT NULL DEFAULT FALSE,
        UNIQUE KEY unique_compania (idCompania)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notification_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        idCompania INT NOT NULL,
        idCita INT NOT NULL,
        tipo VARCHAR(50) NOT NULL,
        destinatario VARCHAR(255) NOT NULL,
        asunto VARCHAR(255) NOT NULL,
        cuerpo TEXT NOT NULL,
        enviadoEn VARCHAR(50) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await pool.query(`ALTER TABLE notification_logs MODIFY COLUMN idCita INT NULL`);
    await pool.query(`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS idConsulta INT NULL`);

    console.log("[MySQL] Aplicando columnas de compatibilidad camelCase y soporte para JSON clínico avanzado...");
    
    // companias
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS id INT NULL`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS nombreComercial VARCHAR(255) NULL`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS razonSocial VARCHAR(255) NULL`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS tipoIdentificacion VARCHAR(5) NULL`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS correoEmisor VARCHAR(255) NULL`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS ivaPorDefecto DECIMAL(5,2) NULL`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS colorPrimario VARCHAR(50) NULL`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS colorSidebar VARCHAR(50) NULL`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS logoUrl TEXT NULL`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS actividadEconomica TEXT NULL`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS perfilCompania VARCHAR(50) NULL`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS estadoSaas ENUM('PENDIENTE','ACTIVA','SUSPENDIDA') NOT NULL DEFAULT 'ACTIVA'`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS maxUsuarios INT NOT NULL DEFAULT 5`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS montoMensual DECIMAL(10,2) NULL`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS proximoVencimiento DATE NULL`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS horarioAtencion JSON NULL`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS requiereConfirmacionCitas BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS provincia VARCHAR(2) NULL`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS canton VARCHAR(2) NULL`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS distrito VARCHAR(2) NULL`);
    await pool.query(`ALTER TABLE companias ADD COLUMN IF NOT EXISTS otrasSenas VARCHAR(250) NULL`);

    // usuarios
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS id INT NULL`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS idCompania INT NULL`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS usuario VARCHAR(255) NULL`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS correo VARCHAR(255) NULL`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS contrasena VARCHAR(255) NULL`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ubicacionDireccion VARCHAR(255) NULL`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ubicacionLat DECIMAL(10,7) NULL`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ubicacionLng DECIMAL(10,7) NULL`);
    await pool.query(`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS maxTiempoTrasladoMinutos INT NOT NULL DEFAULT 45`);

    // El enum original ('ADMIN','NUTRICIONISTA','RECEPCION') no acepta los
    // valores que la app realmente usa ('Administrador'/'Profesional') —
    // MySQL trunca silenciosamente cualquier valor fuera del enum a ''.
    // Se amplía la columna y se normalizan los valores legados una sola vez
    // (idempotente: tras la primera ejecución ningún registro vuelve a
    // coincidir con estas condiciones, así que las siguientes ejecuciones
    // no modifican nada).
    await pool.query(`ALTER TABLE usuarios MODIFY COLUMN rol VARCHAR(50) NOT NULL DEFAULT 'Profesional'`);
    await pool.query(`
      UPDATE usuarios SET rol = CASE
        WHEN rol = 'ADMIN' THEN 'Administrador'
        WHEN rol IN ('NUTRICIONISTA', 'RECEPCION', '') THEN 'Profesional'
        ELSE rol
      END
      WHERE rol IN ('ADMIN', 'NUTRICIONISTA', 'RECEPCION', '')
    `);

    // pacientes
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS id INT NULL`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS idCompania INT NULL`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS nombreCompleto VARCHAR(255) NULL`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fechaNacimiento VARCHAR(50) NULL`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS correoElectronico VARCHAR(255) NULL`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS situacionVivienda VARCHAR(50) NULL`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS tipoIdentificacion VARCHAR(5) NULL`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS identificacion VARCHAR(50) NULL`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS telefono VARCHAR(50) NULL`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS provinciaId INT NULL`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS cantonId INT NULL`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS distritoId INT NULL`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS otrasSenas TEXT NULL`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS diabetes BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS hipertension BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS gastritis BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS estrenimiento BOOLEAN NOT NULL DEFAULT FALSE`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS alergiasAlimentarias TEXT NULL`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fracturas TEXT NULL`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS esguinces TEXT NULL`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS cirugiasOrtopedicas TEXT NULL`);
    await pool.query(`ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS actividadFisica TEXT NULL`);

    // consultas
    await pool.query(`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS id INT NULL`);
    await pool.query(`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS idPaciente INT NULL`);
    await pool.query(`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS idCompania INT NULL`);
    await pool.query(`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS fecha VARCHAR(50) NULL`);
    await pool.query(`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS tipo VARCHAR(50) NULL`);
    await pool.query(`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS motivo TEXT NULL`);
    await pool.query(`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS horasSueno DECIMAL(4,1) NULL`);
    await pool.query(`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS compromiso INT NULL`);
    await pool.query(`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS antropometria JSON NULL`);
    await pool.query(`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS dieta JSON NULL`);
    await pool.query(`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS fisioterapia JSON NULL`);
    await pool.query(`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS anotacionesGenerales TEXT NULL`);
    await pool.query(`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS evaluacionAntropometrica JSON NULL`);
    await pool.query(`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS evaluacionBioquimica JSON NULL`);
    await pool.query(`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS evaluacionDietetica JSON NULL`);
    await pool.query(`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS composicionSegmentada JSON NULL`);
    await pool.query(`ALTER TABLE consultas ADD COLUMN IF NOT EXISTS estiloVida JSON NULL`);

    console.log("[MySQL] Columnas de compatibilidad añadidas con éxito.");
  } catch (err: any) {
    console.error("❌ [MySQL] Error al inicializar/migrar la base de datos:", err);
    throw err;
  }
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
        "INSERT INTO consultas (id, idPaciente, idCompania, fecha, tipo, motivo, horasSueno, compromiso, antropometria, dieta, fisioterapia, anotacionesGenerales) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [con.id, con.idPaciente, con.idCompania, con.fecha, con.tipo, con.motivo, con.horasSueno, con.compromiso, JSON.stringify(con.antropometria || null), JSON.stringify(con.dieta || null), JSON.stringify(con.fisioterapia || null), con.anotacionesGenerales]
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

function generarSlotsCandidatos(abre: string, cierra: string): string[] {
  const slots: string[] = [];
  let [h, m] = abre.split(":").map(Number);
  const [hFin, mFin] = cierra.split(":").map(Number);
  while (h < hFin || (h === hFin && m < mFin)) {
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    m += 30;
    if (m >= 60) { m -= 60; h += 1; }
  }
  return slots;
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
  abreMin: number;
  cierraMin: number;
}): boolean {
  const { candidatoInicioMin, duracionMin, citasDelDia, bloqueosDelDia, fecha, horaCandidato, abreMin, cierraMin } = params;
  const candidatoFinMin = candidatoInicioMin + duracionMin;

  // generarSlotsCandidatos() solo genera horas de INICIO anteriores al cierre — no garantiza
  // que la cita quepa completa antes de cerrar. Sin este chequeo, un servicio de 60 min
  // ofrecía como "libre" un inicio a las 17:30 con cierre a las 18:00 (terminaría a las 18:30,
  // media hora después de cerrado). Verificado contra datos reales: la cita #15 de ELRONUTRI
  // quedó agendada viernes 17:30–18:30 con horario de cierre 18:00.
  if (candidatoFinMin > cierraMin) return false;
  // El listado de disponibilidad (generarSlotsCandidatos) nunca ofrece horas antes de la
  // apertura, pero POST /api/public/citas reutiliza esta misma función para re-verificar el
  // horario justo antes de guardar — sin este límite inferior, una llamada directa al API (sin
  // pasar por el listado) podía agendar antes de que abra el negocio.
  if (candidatoInicioMin < abreMin) return false;

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

function normalizeRow(row: any): any {
  if (!row) return row;
  const copy = { ...row };

  // Normalize IDs — table-specific primary keys must win over the id_compania
  // foreign key, which every table also carries.
  if (copy.id_usuario != null && copy.id == null) copy.id = copy.id_usuario;
  if (copy.id_paciente != null && copy.id == null) copy.id = copy.id_paciente;
  if (copy.id_consulta != null && copy.id == null) copy.id = copy.id_consulta;
  if (copy.id_cita != null && copy.id == null) copy.id = copy.id_cita;
  if (copy.id_servicio != null && copy.id == null) copy.id = copy.id_servicio;
  if (copy.id_compania != null && copy.id == null) copy.id = copy.id_compania;

  // companias
  if (copy.nombre_comercial != null && copy.nombreComercial == null) copy.nombreComercial = copy.nombre_comercial;
  if (copy.razon_social != null && copy.razonSocial == null) copy.razonSocial = copy.razon_social;
  if (copy.tipo_identificacion != null && copy.tipoIdentificacion == null) copy.tipoIdentificacion = copy.tipo_identificacion;
  if (copy.correo_emisor != null && copy.correoEmisor == null) copy.correoEmisor = copy.correo_emisor;
  if (copy.iva_por_defecto != null && copy.ivaPorDefecto == null) copy.ivaPorDefecto = parseFloat(copy.iva_por_defecto);
  if (copy.color_primario != null && copy.colorPrimario == null) copy.colorPrimario = copy.color_primario;
  if (copy.color_sidebar != null && copy.colorSidebar == null) copy.colorSidebar = copy.color_sidebar;
  if (copy.logo_url != null && copy.logoUrl == null) copy.logoUrl = copy.logo_url;
  if (copy.cod_actividad_economica != null && copy.actividadEconomica == null) copy.actividadEconomica = copy.cod_actividad_economica;
  if (typeof copy.horarioAtencion === "string") {
    try { copy.horarioAtencion = JSON.parse(copy.horarioAtencion); } catch { /* deja el valor crudo si no es JSON válido */ }
  }

  // usuarios
  if (copy.id_compania != null && copy.idCompania == null) copy.idCompania = copy.id_compania;
  if (copy.email != null && copy.correo == null) copy.correo = copy.email;
  if (copy.password_hash != null && copy.contrasena == null) copy.contrasena = copy.password_hash;
  if (copy.usuario == null && copy.email != null) copy.usuario = copy.email.split("@")[0];

  // servicios
  if (copy.porcentaje_iva != null && copy.porcentajeIva == null) copy.porcentajeIva = parseFloat(copy.porcentaje_iva);

  // pacientes
  if (copy.nombre_completo != null && copy.nombreCompleto == null) copy.nombreCompleto = copy.nombre_completo;
  if (copy.fecha_nacimiento != null && copy.fechaNacimiento == null) copy.fechaNacimiento = copy.fecha_nacimiento;
  if (copy.correo_electronico != null && copy.correoElectronico == null) copy.correoElectronico = copy.correo_electronico;
  if (copy.situacion_vivienda != null && copy.situacionVivienda == null) copy.situacionVivienda = copy.situacion_vivienda;
  if (copy.fact_tipo_identificacion != null && copy.tipoIdentificacion == null) copy.tipoIdentificacion = copy.fact_tipo_identificacion;
  if (copy.fact_identificacion != null && copy.identificacion == null) copy.identificacion = copy.fact_identificacion;

  return copy;
}

// Ensure database setup starts asynchronously
setupDatabase();

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  // --- Authentication ---
  // Every route below is protected by requireAuth unless explicitly marked "no auth" (the
  // /api/public/* booking routes, /api/db-status, /api/login and the company-registration
  // branch of POST /api/companies). Session lives in a signed, httpOnly cookie — see
  // server/auth.ts. Handlers read `getSession(req)` and scope data to `session.idCompania`
  // instead of trusting an idCompania the client put in the request body/query.

  async function fetchUserById(id: number): Promise<any | undefined> {
    if (dbConnected && pool) {
      const [rows] = await pool.query("SELECT * FROM usuarios WHERE id = ? OR id_usuario = ?", [id, id]);
      return (rows as any[]).map(normalizeRow)[0];
    }
    return localUsers.find(u => u.id === id);
  }

  async function fetchCompanyById(id: number): Promise<Company | undefined> {
    if (dbConnected && pool) {
      const [rows] = await pool.query("SELECT * FROM companias WHERE id = ? OR id_compania = ?", [id, id]);
      return (rows as any[]).map(normalizeRow)[0];
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
    const { contrasena, password_hash, ...safeUser } = u;
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
          "SELECT * FROM usuarios WHERE LOWER(usuario) = ? OR LOWER(email) = ?",
          [usuario, usuario]
        );
        user = (rows as any[]).map(normalizeRow)[0];
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
          await pool.query("UPDATE usuarios SET contrasena = ?, password_hash = ? WHERE id = ? OR id_usuario = ?", [upgraded, upgraded, user.id, user.id]);
        } else {
          localUsers = localUsers.map(u => u.id === user.id ? { ...u, contrasena: upgraded } : u);
        }
        user.contrasena = upgraded;
      }

      const token = createSessionToken({ userId: user.id, idCompania: user.idCompania, rol: user.rol });
      res.setHeader("Set-Cookie", serializeSessionCookie(token, SESSION_MAX_AGE_SECONDS));

      const { contrasena, password_hash, ...safeUser } = user;
      res.json({ user: safeUser, company });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/logout", (req, res) => {
    res.setHeader("Set-Cookie", serializeSessionCookie("", 0));
    res.json({ success: true });
  });

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

      let user: any;
      if (dbConnected && pool) {
        const [rows] = await pool.query(
          "SELECT * FROM usuarios WHERE LOWER(usuario) = ? OR LOWER(correo) = ? OR LOWER(email) = ?",
          [identificador, identificador, identificador]
        );
        user = (rows as any[]).map(normalizeRow)[0];
      } else {
        user = localUsers.find(u => u.usuario.trim().toLowerCase() === identificador || u.correo.trim().toLowerCase() === identificador);
      }

      if (!user || !user.correo) {
        return res.json(respuestaGenerica);
      }

      const company = await fetchCompanyById(user.idCompania);
      let smtpConfig: CompaniaSmtpConfig | undefined;
      if (dbConnected && pool) {
        const [smtpRows] = await pool.query("SELECT * FROM compania_smtp_config WHERE idCompania = ?", [user.idCompania]);
        const smtpRow = (smtpRows as any[])[0];
        smtpConfig = smtpRow ? { ...smtpRow, activo: !!smtpRow.activo } : undefined;
      } else {
        smtpConfig = localSmtpConfigs.find(s => s.idCompania === user.idCompania);
      }

      if (!company || !smtpConfig || !smtpConfig.activo) {
        // No hay forma de avisarle a esta cuenta por correo — no se revela esto al cliente
        // (evitaría la protección contra enumeración de arriba), solo se registra en el servidor.
        console.error(`[ForgotPassword] No se pudo enviar contraseña temporal a "${user.usuario}": SMTP no configurado/activo para idCompania=${user.idCompania}.`);
        return res.json(respuestaGenerica);
      }

      const nuevaContrasena = generateNumericPassword(8);
      const hash = hashPassword(nuevaContrasena);

      if (dbConnected && pool) {
        await pool.query("UPDATE usuarios SET contrasena = ?, password_hash = ? WHERE id = ? OR id_usuario = ?", [hash, hash, user.id, user.id]);
      } else {
        localUsers = localUsers.map(u => u.id === user.id ? { ...u, contrasena: hash } : u);
      }

      const rendered = renderPasswordResetEmail({ company, user, nuevaContrasena });
      await sendMail(smtpConfig, { to: user.correo, subject: rendered.subject, html: rendered.html, text: rendered.text });

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

    const { contrasena, password_hash, ...safeUser } = user;
    res.json({ user: safeUser, company });
  });

  // DB Connection Status Endpoint
  app.get("/api/db-status", (req, res) => {
    res.json({
      connected: dbConnected,
      error: dbError,
      server: process.env.DB_HOST || "172.28.185.50",
      port: process.env.DB_PORT || "7878",
      database: "ConsultorioDB"
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
          : await pool.query("SELECT * FROM companias WHERE id = ? OR id_compania = ?", [session.idCompania, session.idCompania]);
        res.json((rows as any[]).map(normalizeRow));
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

      if (dbConnected && pool) {
        if (c.id) {
          const [exists] = await pool.query("SELECT * FROM companias WHERE id = ? OR id_compania = ?", [c.id, c.id]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE companias SET nombreComercial = ?, razonSocial = ?, tipoIdentificacion = ?, identificacion = ?, correoEmisor = ?, ivaPorDefecto = ?, colorPrimario = ?, colorSidebar = ?, logoUrl = ?, actividadEconomica = ?, perfilCompania = ?, estadoSaas = ?, maxUsuarios = ?, montoMensual = ?, proximoVencimiento = ?, horarioAtencion = ?, requiereConfirmacionCitas = ?, provincia = ?, canton = ?, distrito = ?, otrasSenas = ?, nombre_comercial = ?, razon_social = ?, tipo_identificacion = ?, correo_emisor = ?, iva_por_defecto = ?, color_primario = ?, color_sidebar = ?, logo_url = ? WHERE id = ? OR id_compania = ?",
              [
                c.nombreComercial, c.razonSocial, c.tipoIdentificacion, c.identificacion, c.correoEmisor, parseFloat(c.ivaPorDefecto), c.colorPrimario, c.colorSidebar, c.logoUrl, c.actividadEconomica, c.perfilCompania,
                c.estadoSaas, c.maxUsuarios, c.montoMensual != null ? c.montoMensual : null, c.proximoVencimiento || null, JSON.stringify(c.horarioAtencion || null), c.requiereConfirmacionCitas ? 1 : 0,
                c.provincia || null, c.canton || null, c.distrito || null, c.otrasSenas || null,
                c.nombreComercial, c.razonSocial, c.tipoIdentificacion, c.correoEmisor, parseFloat(c.ivaPorDefecto), c.colorPrimario, c.colorSidebar, c.logoUrl,
                c.id, c.id
              ]
            );
            return res.json(c);
          }
        }
        const [result] = await pool.query(
          "INSERT INTO companias (nombreComercial, razonSocial, tipoIdentificacion, identificacion, correoEmisor, ivaPorDefecto, colorPrimario, colorSidebar, logoUrl, actividadEconomica, perfilCompania, estadoSaas, maxUsuarios, montoMensual, proximoVencimiento, horarioAtencion, requiereConfirmacionCitas, provincia, canton, distrito, otrasSenas, nombre_comercial, razon_social, tipo_identificacion, correo_emisor, iva_por_defecto, color_primario, color_sidebar, logo_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            c.nombreComercial, c.razonSocial, c.tipoIdentificacion, c.identificacion, c.correoEmisor, parseFloat(c.ivaPorDefecto), c.colorPrimario, c.colorSidebar, c.logoUrl, c.actividadEconomica, c.perfilCompania,
            c.estadoSaas || 'PENDIENTE', c.maxUsuarios || 5, c.montoMensual != null ? c.montoMensual : null, c.proximoVencimiento || null, JSON.stringify(c.horarioAtencion || null), c.requiereConfirmacionCitas ? 1 : 0,
            c.provincia || null, c.canton || null, c.distrito || null, c.otrasSenas || null,
            c.nombreComercial, c.razonSocial, c.tipoIdentificacion, c.correoEmisor, parseFloat(c.ivaPorDefecto), c.colorPrimario, c.colorSidebar, c.logoUrl
          ]
        );
        c.id = (result as any).insertId;

        // Servicios por defecto según el colegio profesional correspondiente
        // (Fisioterapia/Nutrición/Ambas únicamente — Spa no aplica).
        for (const s of serviciosDefectoParaPerfil(c.perfilCompania)) {
          await pool.query(
            "INSERT INTO servicios (idCompania, id_compania, nombre, precio, porcentajeIva, duracionMinutos, codigoCabys, unidadMedida, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [c.id, c.id, s.nombre, s.precio, s.porcentajeIva, s.duracionMinutos, s.codigoCabys, s.unidadMedida, s.activo ? 1 : 0]
          );
        }

        // Avisar a los administradores de la empresa 7 (la plataforma) de que
        // hay una empresa nueva pendiente de revisión/aprobación. Best-effort:
        // un fallo de correo no debe impedir que la empresa quede creada.
        if (c.id !== 7) {
          try {
            const [platRows] = await pool.query("SELECT * FROM companias WHERE id = 7 OR id_compania = 7");
            const platformCompany: Company | undefined = (platRows as any[]).map(normalizeRow)[0];
            const [smtpRows] = await pool.query("SELECT * FROM compania_smtp_config WHERE idCompania = 7");
            const smtpRow = (smtpRows as any[])[0];
            const platformSmtp: CompaniaSmtpConfig | undefined = smtpRow ? { ...smtpRow, activo: !!smtpRow.activo } : undefined;
            const [adminRows] = await pool.query("SELECT * FROM usuarios WHERE (idCompania = 7 OR id_compania = 7) AND rol = 'Administrador'");
            const adminUsers = (adminRows as any[]).map(normalizeRow);

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
        const [rows] = await pool.query("SELECT * FROM companias WHERE id = ? OR id_compania = ?", [companyId, companyId]);
        company = (rows as any[]).map(normalizeRow)[0];
        if (!company) return res.status(404).json({ error: "Empresa no encontrada." });
        estadoAnterior = company.estadoSaas;
        await pool.query("UPDATE companias SET estadoSaas = ? WHERE id = ? OR id_compania = ?", [nuevoEstado, companyId, companyId]);
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
            const [platRows] = await pool.query("SELECT * FROM companias WHERE id = 7 OR id_compania = 7");
            platformCompany = (platRows as any[]).map(normalizeRow)[0];
            const [smtpRows] = await pool.query("SELECT * FROM compania_smtp_config WHERE idCompania = 7");
            const smtpRow = (smtpRows as any[])[0];
            platformSmtp = smtpRow ? { ...smtpRow, activo: !!smtpRow.activo } : undefined;
            const [userRows] = await pool.query("SELECT * FROM usuarios WHERE (idCompania = ? OR id_compania = ?) AND rol = 'Administrador' LIMIT 1", [companyId, companyId]);
            adminUser = (userRows as any[]).map(normalizeRow)[0];
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
            "UPDATE companias SET montoMensual = COALESCE(?, montoMensual), proximoVencimiento = COALESCE(?, proximoVencimiento) WHERE id = ? OR id_compania = ?",
            [p.montoMensual != null ? parseFloat(p.montoMensual) : null, p.proximoVencimiento || null, companyId, companyId]
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
          : await pool.query("SELECT * FROM usuarios WHERE idCompania = ? OR id_compania = ?", [session.idCompania, session.idCompania]);
        res.json((rows as any[]).map(normalizeRow).map(sanitizeUser));
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
        const [companyRows] = await pool.query("SELECT maxUsuarios FROM companias WHERE id = ? OR id_compania = ?", [idCompania, idCompania]);
        const companyRow = (companyRows as any[])[0];
        if (companyRow) maxUsuarios = companyRow.maxUsuarios;
        const [countRows] = await pool.query("SELECT COUNT(*) as count FROM usuarios WHERE idCompania = ? OR id_compania = ?", [idCompania, idCompania]);
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
          ? ((await pool.query("SELECT COUNT(*) as count FROM usuarios WHERE (idCompania = ? OR id_compania = ?) AND activo = 1", [idCompania, idCompania]))[0] as any)[0].count
          : localUsers.filter(item => item.idCompania === idCompania && item.activo).length;

        if (activosActuales >= maxUsuarios) {
          return res.status(400).json({ error: `Límite de usuarios alcanzado (máximo ${maxUsuarios}).` });
        }

        // El usuario de login es global (POST /api/login lo busca sin acotar por empresa), así
        // que debe ser único en todo el sistema, no solo dentro de esta empresa.
        const usuarioNormalizado = String(u.usuario || "").trim().toLowerCase();
        const yaExiste = dbConnected && pool
          ? ((await pool.query("SELECT id FROM usuarios WHERE LOWER(usuario) = ?", [usuarioNormalizado]))[0] as any).length > 0
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
          const [exists] = await pool.query("SELECT * FROM usuarios WHERE (id = ? OR id_usuario = ?) AND (idCompania = ? OR id_compania = ?)", [u.id, u.id, parseInt(u.idCompania), parseInt(u.idCompania)]);
          const existingRow = (exists as any[])[0];
          if (existingRow) {
            // Un `contrasena` vacío significa "no está cambiando la contraseña" (el cliente ya
            // no recibe hashes de contraseña en ninguna respuesta, así que un guardado que solo
            // cambia p.ej. `activo` llega sin este campo) — se conserva el hash existente en ese
            // caso en vez de sobreescribirlo con un valor vacío.
            const contrasenaFinal = u.contrasena && String(u.contrasena).trim()
              ? hashPassword(String(u.contrasena).trim())
              : (existingRow.contrasena || existingRow.password_hash);
            await pool.query(
              "UPDATE usuarios SET idCompania = ?, id_compania = ?, nombre = ?, usuario = ?, correo = ?, email = ?, contrasena = ?, password_hash = ?, rol = ?, activo = ?, ubicacionDireccion = ?, ubicacionLat = ?, ubicacionLng = ?, maxTiempoTrasladoMinutos = ? WHERE id = ? OR id_usuario = ?",
              [parseInt(u.idCompania), parseInt(u.idCompania), u.nombre, u.usuario, u.correo, u.correo, contrasenaFinal, contrasenaFinal, u.rol, u.activo ? 1 : 0, u.ubicacionDireccion || null, u.ubicacionLat != null ? parseFloat(u.ubicacionLat) : null, u.ubicacionLng != null ? parseFloat(u.ubicacionLng) : null, u.maxTiempoTrasladoMinutos || 45, u.id, u.id]
            );
            const { contrasena, password_hash, ...safeUser } = u;
            return res.json(safeUser);
          }
        }
        const contrasenaNueva = hashPassword(String(u.contrasena || "").trim());
        const [result] = await pool.query(
          "INSERT INTO usuarios (idCompania, id_compania, nombre, usuario, correo, email, contrasena, password_hash, rol, activo, ubicacionDireccion, ubicacionLat, ubicacionLng, maxTiempoTrasladoMinutos) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [parseInt(u.idCompania), parseInt(u.idCompania), u.nombre, u.usuario, u.correo, u.correo, contrasenaNueva, contrasenaNueva, u.rol, u.activo === false ? 0 : 1, u.ubicacionDireccion || null, u.ubicacionLat != null ? parseFloat(u.ubicacionLat) : null, u.ubicacionLng != null ? parseFloat(u.ubicacionLng) : null, u.maxTiempoTrasladoMinutos || 45]
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
        const [rows] = await pool.query("SELECT * FROM pacientes WHERE idCompania = ? OR id_compania = ?", [session.idCompania, session.idCompania]);
        const formatted = (rows as any[]).map(row => {
          const norm = normalizeRow(row);
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
        res.json(localPatients.filter(p => p.idCompania === session.idCompania));
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
          const [exists] = await pool.query("SELECT * FROM pacientes WHERE (id = ? OR id_paciente = ?) AND (idCompania = ? OR id_compania = ?)", [p.id, p.id, parseInt(p.idCompania), parseInt(p.idCompania)]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE pacientes SET idCompania = ?, id_compania = ?, nombreCompleto = ?, nombre_completo = ?, fechaNacimiento = ?, fecha_nacimiento = ?, edad = ?, ocupacion = ?, correoElectronico = ?, correo_electronico = ?, situacionVivienda = ?, situacion_vivienda = ?, tipoIdentificacion = ?, fact_tipo_identificacion = ?, identificacion = ?, fact_identificacion = ?, telefono = ?, provinciaId = ?, cantonId = ?, distritoId = ?, otrasSenas = ?, diabetes = ?, hipertension = ?, gastritis = ?, estrenimiento = ?, alergiasAlimentarias = ?, fracturas = ?, esguinces = ?, cirugiasOrtopedicas = ?, actividadFisica = ? WHERE id = ? OR id_paciente = ?",
              [
                parseInt(p.idCompania), parseInt(p.idCompania), p.nombreCompleto, p.nombreCompleto, p.fechaNacimiento, p.fechaNacimiento, parseInt(p.edad), p.ocupacion, p.correoElectronico, p.correoElectronico, p.situacionVivienda, p.situacionVivienda, p.tipoIdentificacion, p.tipoIdentificacion, p.identificacion, p.identificacion, p.telefono, parseInt(p.provinciaId), parseInt(p.cantonId), parseInt(p.distritoId), p.otrasSenas, p.diabetes ? 1 : 0, p.hipertension ? 1 : 0, p.gastritis ? 1 : 0, p.estrenimiento ? 1 : 0, p.alergiasAlimentarias, p.fracturas, p.esguinces, p.cirugiasOrtopedicas, p.actividadFisica,
                p.id, p.id
              ]
            );
            return res.json(p);
          }
        }
        const [result] = await pool.query(
          "INSERT INTO pacientes (idCompania, id_compania, nombreCompleto, nombre_completo, fechaNacimiento, fecha_nacimiento, edad, ocupacion, correoElectronico, correo_electronico, situacionVivienda, situacion_vivienda, tipoIdentificacion, fact_tipo_identificacion, identificacion, fact_identificacion, telefono, provinciaId, cantonId, distritoId, otrasSenas, diabetes, hipertension, gastritis, estrenimiento, alergiasAlimentarias, fracturas, esguinces, cirugiasOrtopedicas, actividadFisica) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            parseInt(p.idCompania), parseInt(p.idCompania), p.nombreCompleto, p.nombreCompleto, p.fechaNacimiento, p.fechaNacimiento, parseInt(p.edad), p.ocupacion, p.correoElectronico, p.correoElectronico, p.situacionVivienda, p.situacionVivienda, p.tipoIdentificacion, p.tipoIdentificacion, p.identificacion, p.identificacion, p.telefono, parseInt(p.provinciaId), parseInt(p.cantonId), parseInt(p.distritoId), p.otrasSenas, p.diabetes ? 1 : 0, p.hipertension ? 1 : 0, p.gastritis ? 1 : 0, p.estrenimiento ? 1 : 0, p.alergiasAlimentarias, p.fracturas, p.esguinces, p.cirugiasOrtopedicas, p.actividadFisica
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

  // 4. Consultations
  app.get("/api/consultations", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM consultas WHERE idCompania = ? OR id_compania = ?", [session.idCompania, session.idCompania]);
        const formatted = (rows as any[]).map(row => {
          const norm = normalizeRow(row);
          return {
            ...norm,
            antropometria: typeof norm.antropometria === 'string' ? JSON.parse(norm.antropometria) : norm.antropometria,
            dieta: typeof norm.dieta === 'string' ? JSON.parse(norm.dieta) : norm.dieta,
            fisioterapia: typeof norm.fisioterapia === 'string' ? JSON.parse(norm.fisioterapia) : norm.fisioterapia,
            evaluacionAntropometrica: typeof norm.evaluacionAntropometrica === 'string' ? JSON.parse(norm.evaluacionAntropometrica) : norm.evaluacionAntropometrica,
            evaluacionBioquimica: typeof norm.evaluacionBioquimica === 'string' ? JSON.parse(norm.evaluacionBioquimica) : norm.evaluacionBioquimica,
            evaluacionDietetica: typeof norm.evaluacionDietetica === 'string' ? JSON.parse(norm.evaluacionDietetica) : norm.evaluacionDietetica,
            composicionSegmentada: typeof norm.composicionSegmentada === 'string' ? JSON.parse(norm.composicionSegmentada) : norm.composicionSegmentada,
            estiloVida: typeof norm.estiloVida === 'string' ? JSON.parse(norm.estiloVida) : norm.estiloVida
          };
        });
        res.json(formatted);
      } else {
        res.json(localConsultations.filter(c => c.idCompania === session.idCompania));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/consultations", requireAuth, async (req, res) => {
    try {
      const con = req.body;
      con.idCompania = sessionOf(req).idCompania;
      if (dbConnected && pool) {
        if (con.id) {
          // Scoped by idCompania too — see comment on the equivalent usuarios check above.
          const [exists] = await pool.query("SELECT * FROM consultas WHERE (id = ? OR id_consulta = ?) AND (idCompania = ? OR id_compania = ?)", [con.id, con.id, parseInt(con.idCompania), parseInt(con.idCompania)]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE consultas SET idPaciente = ?, id_paciente = ?, idCompania = ?, id_compania = ?, fecha = ?, fecha_consulta = ?, tipo = ?, motivo = ?, motivo_expectativas = ?, horasSueno = ?, horas_sueno = ?, compromiso = ?, compromiso_cumplir = ?, antropometria = ?, dieta = ?, fisioterapia = ?, anotacionesGenerales = ?, comentarios_nutricionista = ?, evaluacionAntropometrica = ?, evaluacionBioquimica = ?, evaluacionDietetica = ?, composicionSegmentada = ?, estiloVida = ? WHERE id = ? OR id_consulta = ?",
              [
                parseInt(con.idPaciente), parseInt(con.idPaciente), parseInt(con.idCompania), parseInt(con.idCompania), con.fecha, con.fecha, con.tipo, con.motivo, con.motivo, parseFloat(con.horasSueno), parseFloat(con.horasSueno), parseInt(con.compromiso), parseInt(con.compromiso), JSON.stringify(con.antropometria || null), JSON.stringify(con.dieta || null), JSON.stringify(con.fisioterapia || null), con.anotacionesGenerales, con.anotacionesGenerales,
                JSON.stringify(con.evaluacionAntropometrica || null), JSON.stringify(con.evaluacionBioquimica || null), JSON.stringify(con.evaluacionDietetica || null), JSON.stringify(con.composicionSegmentada || null), JSON.stringify(con.estiloVida || null),
                con.id, con.id
              ]
            );
            return res.json(con);
          }
        }
        const [result] = await pool.query(
          "INSERT INTO consultas (idPaciente, id_paciente, idCompania, id_compania, fecha, fecha_consulta, tipo, motivo, motivo_expectativas, horasSueno, horas_sueno, compromiso, compromiso_cumplir, antropometria, dieta, fisioterapia, anotacionesGenerales, comentarios_nutricionista, evaluacionAntropometrica, evaluacionBioquimica, evaluacionDietetica, composicionSegmentada, estiloVida) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            parseInt(con.idPaciente), parseInt(con.idPaciente), parseInt(con.idCompania), parseInt(con.idCompania), con.fecha, con.fecha, con.tipo, con.motivo, con.motivo, parseFloat(con.horasSueno), parseFloat(con.horasSueno), parseInt(con.compromiso), parseInt(con.compromiso), JSON.stringify(con.antropometria || null), JSON.stringify(con.dieta || null), JSON.stringify(con.fisioterapia || null), con.anotacionesGenerales, con.anotacionesGenerales,
            JSON.stringify(con.evaluacionAntropometrica || null), JSON.stringify(con.evaluacionBioquimica || null), JSON.stringify(con.evaluacionDietetica || null), JSON.stringify(con.composicionSegmentada || null), JSON.stringify(con.estiloVida || null)
          ]
        );
        con.id = (result as any).insertId;
        res.json(con);
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

  // 5. Citas (Appointments)
  app.get("/api/citas", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM citas WHERE idCompania = ?", [session.idCompania]);
        res.json((rows as any[]).map(normalizeRow));
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

  // 10. Servicios (catálogo de servicios/tarifas por empresa, con IVA opcional
  // por servicio que cae al ivaPorDefecto de la empresa cuando es NULL)
  app.get("/api/servicios", requireAuth, async (req, res) => {
    try {
      const session = sessionOf(req);
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM servicios WHERE idCompania = ? OR id_compania = ?", [session.idCompania, session.idCompania]);
        res.json((rows as any[]).map(normalizeRow));
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
      if (dbConnected && pool) {
        if (s.id) {
          // Scoped by idCompania too — see comment on the equivalent usuarios check above.
          const [exists] = await pool.query("SELECT id FROM servicios WHERE (id = ? OR id_servicio = ?) AND (idCompania = ? OR id_compania = ?)", [s.id, s.id, parseInt(s.idCompania), parseInt(s.idCompania)]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE servicios SET idCompania = ?, id_compania = ?, nombre = ?, precio = ?, porcentajeIva = ?, duracionMinutos = ?, codigoCabys = ?, unidadMedida = ?, activo = ? WHERE id = ? OR id_servicio = ?",
              [parseInt(s.idCompania), parseInt(s.idCompania), s.nombre, parseFloat(s.precio), s.porcentajeIva != null ? parseFloat(s.porcentajeIva) : null, parseInt(s.duracionMinutos) || 30, s.codigoCabys || null, s.unidadMedida || 'Sp', s.activo ? 1 : 0, s.id, s.id]
            );
            return res.json(s);
          }
        }
        const [result] = await pool.query(
          "INSERT INTO servicios (idCompania, id_compania, nombre, precio, porcentajeIva, duracionMinutos, codigoCabys, unidadMedida, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [parseInt(s.idCompania), parseInt(s.idCompania), s.nombre, parseFloat(s.precio), s.porcentajeIva != null ? parseFloat(s.porcentajeIva) : null, parseInt(s.duracionMinutos) || 30, s.codigoCabys || null, s.unidadMedida || 'Sp', s.activo === false ? 0 : 1]
        );
        s.id = (result as any).insertId;
        res.json(s);
      } else {
        if (s.id && localServicios.some(item => item.id === s.id)) {
          localServicios = localServicios.map(item => item.id === s.id ? s : item);
        } else {
          s.id = Math.max(0, ...localServicios.map(item => item.id)) + 1;
          localServicios.push(s);
        }
        res.json(s);
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
        const [companyRows] = await pool.query("SELECT * FROM companias WHERE id = ? OR id_compania = ?", [idCompania, idCompania]);
        company = (companyRows as any[]).map(normalizeRow)[0];
        const [servicioRows] = await pool.query("SELECT * FROM servicios WHERE idCompania = ? OR id_compania = ?", [idCompania, idCompania]);
        existentes = (servicioRows as any[]).map(normalizeRow);
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
            "INSERT INTO servicios (idCompania, id_compania, nombre, precio, porcentajeIva, duracionMinutos, codigoCabys, unidadMedida, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [idCompania, idCompania, s.nombre, s.precio, s.porcentajeIva, s.duracionMinutos, s.codigoCabys, s.unidadMedida, s.activo ? 1 : 0]
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
            tieneCertificado: false, certificadoNombreArchivo: null, certificadoVenceEn: null
          });
        }
        res.json({
          idCompania: row.id_compania,
          ambiente: row.ambiente,
          usuarioAtv: row.usuario_atv || '',
          tienePasswordAtv: !!row.password_atv_enc,
          tieneCertificado: !!row.certificado_p12_enc,
          certificadoNombreArchivo: row.certificado_nombre_archivo,
          certificadoVenceEn: row.certificado_vence_en ? new Date(row.certificado_vence_en).toISOString().split('T')[0] : null
        });
      } else {
        const row = localHaciendaConfigs.find(c => c.idCompania === idCompania);
        if (!row) {
          return res.json({
            idCompania, ambiente: 'SANDBOX', usuarioAtv: '', tienePasswordAtv: false,
            tieneCertificado: false, certificadoNombreArchivo: null, certificadoVenceEn: null
          });
        }
        res.json({
          idCompania: row.idCompania,
          ambiente: row.ambiente,
          usuarioAtv: row.usuarioAtv || '',
          tienePasswordAtv: !!row.passwordAtvCifrado,
          tieneCertificado: !!row.certificadoP12Cifrado,
          certificadoNombreArchivo: row.certificadoNombreArchivo,
          certificadoVenceEn: row.certificadoVenceEn
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
      if (!canAccessCompany(sessionOf(req), idCompania)) {
        return res.status(403).json({ error: "No autorizado." });
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
          ultimoConsecutivo: index !== -1 ? localHaciendaConfigs[index].ultimoConsecutivo : 0
        };
        if (index !== -1) {
          localHaciendaConfigs[index] = stored;
        } else {
          localHaciendaConfigs.push(stored);
        }
      }

      res.json({
        idCompania,
        ambiente: b.ambiente,
        usuarioAtv: b.usuarioAtv || '',
        tienePasswordAtv: !!passwordAtvCifrado,
        tieneCertificado: !!certificadoP12Cifrado,
        certificadoNombreArchivo,
        certificadoVenceEn
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

  app.post("/api/hacienda/firmar", requireAuth, async (req, res) => {
    try {
      const idCompania = parseInt(req.body.idCompania);
      if (!canAccessCompany(sessionOf(req), idCompania)) {
        return res.status(403).json({ error: "No autorizado." });
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

  async function cargarCredencialesAtv(idCompania: number): Promise<{ ambiente: 'SANDBOX' | 'PRODUCCION'; usuarioAtv: string; passwordAtv: string } | null> {
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

  // Proxy al catálogo oficial CABYS de Hacienda (evita CORS desde el navegador).
  app.get("/api/cabys", requireAuth, async (req, res) => {
    try {
      const q = (req.query.q as string) || "";
      if (!q.trim()) return res.json([]);
      const url = /^\d{13}$/.test(q.trim())
        ? `https://api.hacienda.go.cr/fe/cabys?codigo=${encodeURIComponent(q.trim())}`
        : `https://api.hacienda.go.cr/fe/cabys?q=${encodeURIComponent(q.trim())}`;
      const resp = await fetch(url);
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
        const [rows] = await pool.query("SELECT * FROM facturas WHERE idCompania = ?", [idCompania]);
        res.json((rows as any[]).map(r => ({ ...r, lineas: typeof r.lineas === 'string' ? JSON.parse(r.lineas) : r.lineas })));
      } else {
        res.json(localFacturas.filter(f => f.idCompania === idCompania));
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/facturas", requireAuth, async (req, res) => {
    try {
      const body = req.body;
      const idCompania = sessionOf(req).idCompania;
      const idCita = body.idCita != null ? parseInt(body.idCita) : null;
      const idPaciente = parseInt(body.idPaciente);
      const condicionVenta = body.condicionVenta || "01";
      const medioPago = body.medioPago || "01";
      const lineasBody: Array<{ idServicio: number; cantidad: number }> = body.lineas || [];

      if (lineasBody.length === 0) {
        return res.status(400).json({ error: "Agregue al menos un servicio a facturar." });
      }

      let company: Company | undefined;
      let paciente: Patient | undefined;
      let serviciosDisponibles: Servicio[];
      if (dbConnected && pool) {
        const [companyRows] = await pool.query("SELECT * FROM companias WHERE id = ? OR id_compania = ?", [idCompania, idCompania]);
        company = (companyRows as any[]).map(normalizeRow)[0];
        const [pacienteRows] = await pool.query("SELECT * FROM pacientes WHERE id = ? OR id_paciente = ?", [idPaciente, idPaciente]);
        paciente = (pacienteRows as any[]).map(normalizeRow)[0];
        const [servicioRows] = await pool.query("SELECT * FROM servicios WHERE idCompania = ? OR id_compania = ?", [idCompania, idCompania]);
        serviciosDisponibles = (servicioRows as any[]).map(normalizeRow);
      } else {
        company = localCompanies.find(c => c.id === idCompania);
        paciente = localPatients.find(p => p.id === idPaciente);
        serviciosDisponibles = localServicios.filter(s => s.idCompania === idCompania);
      }

      if (!company) return res.status(404).json({ error: "Empresa no encontrada." });
      if (!paciente) return res.status(404).json({ error: "Paciente no encontrado." });
      if (!company.provincia || !company.canton || !company.distrito || !company.otrasSenas) {
        return res.status(400).json({ error: "Configure la ubicación fiscal de la empresa (provincia/cantón/distrito/señas) en Configuración de Empresa antes de facturar." });
      }

      const cert = await cargarCertificadoEmpresa(idCompania);
      if (!cert) {
        return res.status(400).json({ error: "Configure primero la Firma Digital de Hacienda (certificado .p12) en Configuración de Empresa." });
      }
      const credenciales = await cargarCredencialesAtv(idCompania);
      if (!credenciales) {
        return res.status(400).json({ error: "Configure primero el usuario y contraseña ATV de Hacienda en Configuración de Empresa." });
      }

      const lineasInput = [];
      for (const l of lineasBody) {
        const servicio = serviciosDisponibles.find(s => s.id === parseInt(l.idServicio as any));
        if (!servicio) return res.status(400).json({ error: `Servicio ${l.idServicio} no encontrado.` });
        if (!servicio.codigoCabys) return res.status(400).json({ error: `El servicio "${servicio.nombre}" no tiene un código CABYS configurado — asígnelo en Configuración de Empresa antes de facturar.` });
        lineasInput.push({
          codigoCabys: servicio.codigoCabys,
          detalle: servicio.nombre,
          unidadMedida: servicio.unidadMedida || 'Sp',
          cantidad: parseFloat((l.cantidad as any) || 1),
          precioUnitario: servicio.precio,
          porcentajeIva: servicio.porcentajeIva != null ? servicio.porcentajeIva : company.ivaPorDefecto,
          idServicio: servicio.id
        });
      }

      const lineasCalculadas = calcularLineas(lineasInput).map((l, i) => ({ ...l, idServicio: lineasInput[i].idServicio }));
      const resumen = calcularResumen(lineasCalculadas);

      // Numeración consecutiva — se incrementa dentro de una transacción para no repetir
      // números si dos facturas se emiten al mismo tiempo para la misma empresa.
      let siguienteSecuencial: number;
      if (dbConnected && pool) {
        const connection = await pool.getConnection();
        try {
          await connection.beginTransaction();
          const [rows] = await connection.query("SELECT ultimo_consecutivo FROM compania_hacienda_config WHERE id_compania = ? FOR UPDATE", [idCompania]);
          const actual = (rows as any[])[0]?.ultimo_consecutivo || 0;
          siguienteSecuencial = actual + 1;
          await connection.query("UPDATE compania_hacienda_config SET ultimo_consecutivo = ? WHERE id_compania = ?", [siguienteSecuencial, idCompania]);
          await connection.commit();
        } catch (err) {
          await connection.rollback();
          throw err;
        } finally {
          connection.release();
        }
      } else {
        const cfg = localHaciendaConfigs.find(c => c.idCompania === idCompania)!;
        siguienteSecuencial = cfg.ultimoConsecutivo + 1;
        cfg.ultimoConsecutivo = siguienteSecuencial;
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
        lineas: lineasCalculadas,
        resumen
      });

      const xmlFirmado = await firmarXadesEpes(xml, cert.p12Base64, cert.pin);

      const nuevaFactura: any = {
        idCompania,
        idCita,
        idPaciente,
        clave,
        consecutivo,
        fechaEmision: fechaEmisionCR(fechaEmision),
        ambiente: credenciales.ambiente,
        lineas: lineasCalculadas,
        subtotal: resumen.totalVenta,
        totalIva: resumen.totalImpuesto,
        total: resumen.totalComprobante,
        estado: "FIRMADA",
        mensajeError: null,
        creadaEn: new Date().toISOString()
      };

      // Envío a Hacienda — best-effort: si Hacienda no responde o rechaza, la factura queda
      // guardada como FIRMADA/ERROR y se puede reintentar el envío después.
      try {
        const token = await obtenerTokenHacienda(credenciales.ambiente, credenciales.usuarioAtv, credenciales.passwordAtv);
        const envio = await enviarFacturaHacienda({
          ambiente: credenciales.ambiente,
          token,
          clave,
          fechaEmisionIso: fechaEmisionCR(fechaEmision),
          tipoIdentificacionEmisor: company.tipoIdentificacion,
          cedulaEmisor: limpiarIdentificacion(company.identificacion),
          tipoIdentificacionReceptor: tipoIdReceptor,
          cedulaReceptor: limpiarIdentificacion(paciente.identificacion),
          xmlFirmado
        });
        nuevaFactura.estado = envio.aceptadoParaProcesar ? "ENVIADA" : "ERROR";
        nuevaFactura.mensajeError = envio.mensaje;
      } catch (err: any) {
        nuevaFactura.estado = "ERROR";
        nuevaFactura.mensajeError = err.message;
        console.error("[Hacienda] Error enviando factura:", err.message || err);
      }

      if (dbConnected && pool) {
        const [result] = await pool.query(
          "INSERT INTO facturas (idCompania, idCita, idPaciente, clave, consecutivo, fechaEmision, ambiente, lineas, subtotal, totalIva, total, estado, mensajeError, creadaEn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [nuevaFactura.idCompania, nuevaFactura.idCita, nuevaFactura.idPaciente, nuevaFactura.clave, nuevaFactura.consecutivo, nuevaFactura.fechaEmision, nuevaFactura.ambiente, JSON.stringify(nuevaFactura.lineas), nuevaFactura.subtotal, nuevaFactura.totalIva, nuevaFactura.total, nuevaFactura.estado, nuevaFactura.mensajeError, nuevaFactura.creadaEn]
        );
        nuevaFactura.id = (result as any).insertId;
      } else {
        nuevaFactura.id = Math.max(0, ...localFacturas.map(f => f.id)) + 1;
        localFacturas.push(nuevaFactura);
      }

      res.json(nuevaFactura);
    } catch (err: any) {
      console.error("[Hacienda] Error generando factura:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/facturas/:id/estado", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      let factura: any;
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM facturas WHERE id = ?", [id]);
        factura = (rows as any[])[0];
      } else {
        factura = localFacturas.find(f => f.id === id);
      }
      if (!factura) return res.status(404).json({ error: "Factura no encontrada." });
      if (!canAccessCompany(sessionOf(req), factura.idCompania)) {
        return res.status(403).json({ error: "No autorizado." });
      }

      const credenciales = await cargarCredencialesAtv(factura.idCompania);
      if (!credenciales) return res.status(400).json({ error: "No hay credenciales ATV configuradas para esta empresa." });

      const token = await obtenerTokenHacienda(credenciales.ambiente, credenciales.usuarioAtv, credenciales.passwordAtv);
      const estadoHacienda = await consultarEstadoHacienda(credenciales.ambiente, token, factura.clave);

      const mapaEstado: Record<string, string> = { aceptado: "ACEPTADA", rechazado: "RECHAZADA" };
      const nuevoEstado = mapaEstado[estadoHacienda.estado] || factura.estado;

      if (dbConnected && pool) {
        await pool.query("UPDATE facturas SET estado = ? WHERE id = ?", [nuevoEstado, id]);
      } else {
        const idx = localFacturas.findIndex(f => f.id === id);
        if (idx !== -1) localFacturas[idx].estado = nuevoEstado as any;
      }

      res.json({ id, estado: nuevoEstado, estadoHacienda: estadoHacienda.estado });
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
        const [companyRows] = await pool.query("SELECT * FROM companias WHERE id = ? OR id_compania = ?", [idCompania, idCompania]);
        company = (companyRows as any[]).map(normalizeRow)[0];
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
          const [rows] = await pool.query("SELECT * FROM pacientes WHERE id = ? OR id_paciente = ?", [id, id]);
          return (rows as any[]).map(normalizeRow)[0];
        }
        return localPatients.find(p => p.id === id);
      }

      async function fetchCitaById(id: number): Promise<Cita | undefined> {
        if (dbConnected && pool) {
          // Note: unlike pacientes/consultas, the dynamically-created `citas` table (see CREATE TABLE
          // IF NOT EXISTS citas above) has no `id_cita` column at all -- its real PK is just `id`.
          // Querying "id_cita" here throws "Unknown column 'id_cita'" (verified live), so we only match on `id`.
          const [rows] = await pool.query("SELECT * FROM citas WHERE id = ?", [id]);
          return (rows as any[]).map(normalizeRow)[0];
        }
        return localCitas.find(c => c.id === id);
      }

      async function fetchConsultationById(id: number): Promise<Consultation | undefined> {
        if (dbConnected && pool) {
          const [rows] = await pool.query("SELECT * FROM consultas WHERE id = ? OR id_consulta = ?", [id, id]);
          const row = (rows as any[]).map(normalizeRow)[0];
          if (!row) return undefined;
          return {
            ...row,
            antropometria: typeof row.antropometria === 'string' ? JSON.parse(row.antropometria) : row.antropometria,
            dieta: typeof row.dieta === 'string' ? JSON.parse(row.dieta) : row.dieta,
            fisioterapia: typeof row.fisioterapia === 'string' ? JSON.parse(row.fisioterapia) : row.fisioterapia,
            evaluacionAntropometrica: typeof row.evaluacionAntropometrica === 'string' ? JSON.parse(row.evaluacionAntropometrica) : row.evaluacionAntropometrica,
            evaluacionBioquimica: typeof row.evaluacionBioquimica === 'string' ? JSON.parse(row.evaluacionBioquimica) : row.evaluacionBioquimica,
            evaluacionDietetica: typeof row.evaluacionDietetica === 'string' ? JSON.parse(row.evaluacionDietetica) : row.evaluacionDietetica,
            composicionSegmentada: typeof row.composicionSegmentada === 'string' ? JSON.parse(row.composicionSegmentada) : row.composicionSegmentada,
            estiloVida: typeof row.estiloVida === 'string' ? JSON.parse(row.estiloVida) : row.estiloVida
          };
        }
        return localConsultations.find(c => c.id === id);
      }

      let rendered;
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
        idConsulta = consultation.id;
        destinatario = patient.correoElectronico;
        tipoLog = "CONSULTA";
      } else {
        return res.status(400).json({ error: "Tipo de notificación inválido." });
      }

      await sendMail(smtpConfig, { to: destinatario, subject: rendered.subject, html: rendered.html, text: rendered.text });

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
        companies = (rows as any[]).map(normalizeRow);
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
        const [rows] = await pool.query("SELECT * FROM usuarios WHERE (idCompania = ? OR id_compania = ?) AND activo = 1", [idCompania, idCompania]);
        users = (rows as any[]).map(normalizeRow);
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
        const [rows] = await pool.query("SELECT * FROM servicios WHERE (idCompania = ? OR id_compania = ?) AND activo = 1", [idCompania, idCompania]);
        servicios = (rows as any[]).map(normalizeRow);
      } else {
        servicios = localServicios.filter(s => s.idCompania === idCompania && s.activo);
      }
      res.json(servicios.map(s => ({
        id: s.id,
        nombre: s.nombre,
        precio: s.precio,
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
        const [rows] = await pool.query("SELECT * FROM pacientes WHERE (idCompania = ? OR id_compania = ?) AND (identificacion = ? OR fact_identificacion = ?)", [idCompania, idCompania, identificacion, identificacion]);
        patient = (rows as any[]).map(normalizeRow)[0];
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
        const [userRows] = await pool.query("SELECT * FROM usuarios WHERE id = ? OR id_usuario = ?", [idUsuario, idUsuario]);
        user = (userRows as any[]).map(normalizeRow)[0];
        if (!user) return res.status(404).json({ error: "Profesional no encontrado." });

        const [companyRows] = await pool.query("SELECT * FROM companias WHERE id = ? OR id_compania = ?", [user.idCompania, user.idCompania]);
        company = (companyRows as any[]).map(normalizeRow)[0];

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

      const { abre, cierra } = horarioDelDia(company?.horarioAtencion, fecha);
      if (!abre || !cierra) return res.json([]);

      let duracionMin = DURACION_POR_TIPO_VISITA[tipoVisita];
      if (req.query.idServicio) {
        const idServicio = parseInt(req.query.idServicio as string);
        let servicio: Servicio | undefined;
        if (dbConnected && pool) {
          const [servicioRows] = await pool.query("SELECT * FROM servicios WHERE (id = ? OR id_servicio = ?) AND (idCompania = ? OR id_compania = ?) AND activo = 1", [idServicio, idServicio, user.idCompania, user.idCompania]);
          servicio = (servicioRows as any[]).map(normalizeRow)[0];
        } else {
          servicio = localServicios.find(s => s.id === idServicio && s.idCompania === user.idCompania && s.activo);
        }
        if (servicio) duracionMin = servicio.duracionMinutos;
      }
      const candidatos = generarSlotsCandidatos(abre, cierra);
      const abreMin = minutosDesdeMedianoche(abre);
      const cierraMin = minutosDesdeMedianoche(cierra);
      const libres = candidatos.filter(hora => slotLibre({
        candidatoInicioMin: minutosDesdeMedianoche(hora),
        duracionMin,
        citasDelDia,
        bloqueosDelDia,
        fecha,
        horaCandidato: hora,
        abreMin,
        cierraMin
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
        const [userRows] = await pool.query("SELECT * FROM usuarios WHERE id = ? OR id_usuario = ?", [idUsuarioNutricionista, idUsuarioNutricionista]);
        user = (userRows as any[]).map(normalizeRow)[0];
        const [companyRows] = await pool.query("SELECT * FROM companias WHERE id = ? OR id_compania = ?", [idCompania, idCompania]);
        company = (companyRows as any[]).map(normalizeRow)[0];
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
          const [servicioRows] = await pool.query("SELECT * FROM servicios WHERE (id = ? OR id_servicio = ?) AND (idCompania = ? OR id_compania = ?) AND activo = 1", [idServicio, idServicio, idCompania, idCompania]);
          servicio = (servicioRows as any[]).map(normalizeRow)[0];
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

          await connection.query("SELECT id FROM usuarios WHERE id = ? OR id_usuario = ? FOR UPDATE", [idUsuarioNutricionista, idUsuarioNutricionista]);

          const [citaRows] = await connection.query("SELECT * FROM citas WHERE idUsuarioNutricionista = ? AND fechaHora LIKE ?", [idUsuarioNutricionista, `${fecha}%`]);
          const citasDelDia = citaRows as any[];
          const [blockRows] = await connection.query("SELECT * FROM calendar_blocks WHERE idUsuarioNutricionista = ?", [idUsuarioNutricionista]);
          const bloqueosDelDia = blockRows as any[];

          const { abre: abreDelDia, cierra: cierraDelDia } = horarioDelDia(company?.horarioAtencion, fecha);
          const libre = !!abreDelDia && !!cierraDelDia && slotLibre({
            candidatoInicioMin: minutosDesdeMedianoche(hora),
            duracionMin: duracionMinutos,
            citasDelDia,
            bloqueosDelDia,
            fecha,
            horaCandidato: hora,
            abreMin: minutosDesdeMedianoche(abreDelDia),
            cierraMin: minutosDesdeMedianoche(cierraDelDia)
          });
          if (!libre) {
            await connection.rollback();
            connection.release();
            return res.status(409).json({ error: "Ese horario ya no está disponible. Por favor escoja otro." });
          }

          // Buscar o crear paciente por cédula
          const [existing] = await connection.query("SELECT * FROM pacientes WHERE (idCompania = ? OR id_compania = ?) AND (identificacion = ? OR fact_identificacion = ?)", [idCompania, idCompania, pac.identificacion, pac.identificacion]);
          paciente = (existing as any[]).map(normalizeRow)[0];

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
              "INSERT INTO pacientes (idCompania, id_compania, nombreCompleto, nombre_completo, fechaNacimiento, fecha_nacimiento, edad, ocupacion, correoElectronico, correo_electronico, situacionVivienda, situacion_vivienda, tipoIdentificacion, fact_tipo_identificacion, identificacion, fact_identificacion, telefono, provinciaId, cantonId, distritoId, otrasSenas, diabetes, hipertension, gastritis, estrenimiento, alergiasAlimentarias, fracturas, esguinces, cirugiasOrtopedicas, actividadFisica) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [
                nuevoPaciente.idCompania, nuevoPaciente.idCompania, nuevoPaciente.nombreCompleto, nuevoPaciente.nombreCompleto, nuevoPaciente.fechaNacimiento, nuevoPaciente.fechaNacimiento, nuevoPaciente.edad, nuevoPaciente.ocupacion, nuevoPaciente.correoElectronico, nuevoPaciente.correoElectronico, nuevoPaciente.situacionVivienda, nuevoPaciente.situacionVivienda, nuevoPaciente.tipoIdentificacion, nuevoPaciente.tipoIdentificacion, nuevoPaciente.identificacion, nuevoPaciente.identificacion, nuevoPaciente.telefono, nuevoPaciente.provinciaId, nuevoPaciente.cantonId, nuevoPaciente.distritoId, nuevoPaciente.otrasSenas, 0, 0, 0, 0, nuevoPaciente.alergiasAlimentarias, nuevoPaciente.fracturas, nuevoPaciente.esguinces, nuevoPaciente.cirugiasOrtopedicas, nuevoPaciente.actividadFisica
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
              "UPDATE pacientes SET nombreCompleto = ?, nombre_completo = ?, correoElectronico = ?, correo_electronico = ?, telefono = ?, tipoIdentificacion = ?, fact_tipo_identificacion = ?, fechaNacimiento = ?, fecha_nacimiento = ? WHERE id = ? OR id_paciente = ?",
              [
                contactoActualizado.nombreCompleto, contactoActualizado.nombreCompleto,
                contactoActualizado.correoElectronico, contactoActualizado.correoElectronico,
                contactoActualizado.telefono,
                contactoActualizado.tipoIdentificacion, contactoActualizado.tipoIdentificacion,
                contactoActualizado.fechaNacimiento, contactoActualizado.fechaNacimiento,
                paciente.id, paciente.id
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

        const { abre: abreDelDia, cierra: cierraDelDia } = horarioDelDia(company?.horarioAtencion, fecha);
        const libre = !!abreDelDia && !!cierraDelDia && slotLibre({
          candidatoInicioMin: minutosDesdeMedianoche(hora),
          duracionMin: duracionMinutos,
          citasDelDia,
          bloqueosDelDia,
          fecha,
          horaCandidato: hora,
          abreMin: minutosDesdeMedianoche(abreDelDia),
          cierraMin: minutosDesdeMedianoche(cierraDelDia)
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
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
});

