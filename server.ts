import express from "express";
import path from "path";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import {
  defaultCompanies,
  defaultUsers,
  defaultPatients,
  defaultConsultations,
  defaultCitas,
  defaultSmtpConfigs,
  defaultNotificationLogs
} from "./src/data/mockData";

dotenv.config();

let aiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required but not configured.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

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

    // Reconnect to the database itself
    pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 5000
    });

    console.log(`[MySQL] Conexión establecida con éxito a '${database}'. Creando tablas...`);
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

  // 1. companias
  await pool.query(`
    CREATE TABLE IF NOT EXISTS companias (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nombreComercial VARCHAR(255) NOT NULL,
      razonSocial VARCHAR(255) NOT NULL,
      tipoIdentificacion VARCHAR(5) NOT NULL,
      identificacion VARCHAR(50) NOT NULL,
      correoEmisor VARCHAR(255) NOT NULL,
      ivaPorDefecto DECIMAL(5,2) NOT NULL DEFAULT 4.00,
      colorPrimario VARCHAR(50) NOT NULL DEFAULT '#0f766e',
      colorSidebar VARCHAR(50) NOT NULL DEFAULT '#115e59',
      logoUrl TEXT,
      actividadEconomica TEXT,
      perfilCompania VARCHAR(50) NOT NULL DEFAULT 'Ambas'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 2. usuarios
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      idCompania INT NOT NULL,
      nombre VARCHAR(255) NOT NULL,
      usuario VARCHAR(255) NOT NULL,
      correo VARCHAR(255) NOT NULL,
      contrasena VARCHAR(255) NOT NULL,
      rol VARCHAR(50) NOT NULL,
      FOREIGN KEY (idCompania) REFERENCES companias(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 3. pacientes
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pacientes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      idCompania INT NOT NULL,
      nombreCompleto VARCHAR(255) NOT NULL,
      fechaNacimiento VARCHAR(50) NOT NULL,
      edad INT NOT NULL,
      ocupacion VARCHAR(255),
      correoElectronico VARCHAR(255) NOT NULL,
      situacionVivienda VARCHAR(50),
      tipoIdentificacion VARCHAR(5) NOT NULL,
      identificacion VARCHAR(50) NOT NULL,
      telefono VARCHAR(50),
      provinciaId INT,
      cantonId INT,
      distritoId INT,
      otrasSenas TEXT,
      diabetes BOOLEAN NOT NULL DEFAULT FALSE,
      hipertension BOOLEAN NOT NULL DEFAULT FALSE,
      gastritis BOOLEAN NOT NULL DEFAULT FALSE,
      estrenimiento BOOLEAN NOT NULL DEFAULT FALSE,
      alergiasAlimentarias TEXT,
      fracturas TEXT,
      esguinces TEXT,
      cirugiasOrtopedicas TEXT,
      actividadFisica TEXT,
      FOREIGN KEY (idCompania) REFERENCES companias(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 4. consultas
  await pool.query(`
    CREATE TABLE IF NOT EXISTS consultas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      idPaciente INT NOT NULL,
      idCompania INT NOT NULL,
      fecha VARCHAR(50) NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      motivo TEXT NOT NULL,
      horasSueno DECIMAL(4,1) NOT NULL,
      compromiso INT NOT NULL,
      antropometria JSON,
      dieta JSON,
      fisioterapia JSON,
      anotacionesGenerales TEXT,
      FOREIGN KEY (idPaciente) REFERENCES pacientes(id) ON DELETE CASCADE,
      FOREIGN KEY (idCompania) REFERENCES companias(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 5. citas
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
      cancelacionEnviadaEn VARCHAR(50),
      FOREIGN KEY (idCompania) REFERENCES companias(id) ON DELETE CASCADE,
      FOREIGN KEY (idPaciente) REFERENCES pacientes(id) ON DELETE CASCADE,
      FOREIGN KEY (idUsuarioNutricionista) REFERENCES usuarios(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 6. compania_smtp_config
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
      FOREIGN KEY (idCompania) REFERENCES companias(id) ON DELETE CASCADE,
      UNIQUE KEY unique_compania (idCompania)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 7. notification_logs
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      idCompania INT NOT NULL,
      idCita INT NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      destinatario VARCHAR(255) NOT NULL,
      asunto VARCHAR(255) NOT NULL,
      cuerpo TEXT NOT NULL,
      enviadoEn VARCHAR(50) NOT NULL,
      FOREIGN KEY (idCompania) REFERENCES companias(id) ON DELETE CASCADE,
      FOREIGN KEY (idCita) REFERENCES citas(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
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

// Ensure database setup starts asynchronously
setupDatabase();

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

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
  app.get("/api/companies", async (req, res) => {
    try {
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM companias");
        res.json(rows);
      } else {
        res.json(localCompanies);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/companies", async (req, res) => {
    try {
      const c = req.body;
      if (dbConnected && pool) {
        if (c.id) {
          const [exists] = await pool.query("SELECT id FROM companias WHERE id = ?", [c.id]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE companias SET nombreComercial = ?, razonSocial = ?, tipoIdentificacion = ?, identificacion = ?, correoEmisor = ?, ivaPorDefecto = ?, colorPrimario = ?, colorSidebar = ?, logoUrl = ?, actividadEconomica = ?, perfilCompania = ? WHERE id = ?",
              [c.nombreComercial, c.razonSocial, c.tipoIdentificacion, c.identificacion, c.correoEmisor, parseFloat(c.ivaPorDefecto), c.colorPrimario, c.colorSidebar, c.logoUrl, c.actividadEconomica, c.perfilCompania, c.id]
            );
            return res.json(c);
          }
        }
        const [result] = await pool.query(
          "INSERT INTO companias (nombreComercial, razonSocial, tipoIdentificacion, identificacion, correoEmisor, ivaPorDefecto, colorPrimario, colorSidebar, logoUrl, actividadEconomica, perfilCompania) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [c.nombreComercial, c.razonSocial, c.tipoIdentificacion, c.identificacion, c.correoEmisor, parseFloat(c.ivaPorDefecto), c.colorPrimario, c.colorSidebar, c.logoUrl, c.actividadEconomica, c.perfilCompania]
        );
        c.id = (result as any).insertId;
        res.json(c);
      } else {
        if (c.id) {
          localCompanies = localCompanies.map(item => item.id === c.id ? c : item);
        } else {
          c.id = Math.max(0, ...localCompanies.map(item => item.id)) + 1;
          localCompanies.push(c);
        }
        res.json(c);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Users
  app.get("/api/users", async (req, res) => {
    try {
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM usuarios");
        res.json(rows);
      } else {
        res.json(localUsers);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/users", async (req, res) => {
    try {
      const u = req.body;
      if (dbConnected && pool) {
        if (u.id) {
          const [exists] = await pool.query("SELECT id FROM usuarios WHERE id = ?", [u.id]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE usuarios SET idCompania = ?, nombre = ?, usuario = ?, correo = ?, contrasena = ?, rol = ? WHERE id = ?",
              [parseInt(u.idCompania), u.nombre, u.usuario, u.correo, u.contrasena, u.rol, u.id]
            );
            return res.json(u);
          }
        }
        const [result] = await pool.query(
          "INSERT INTO usuarios (idCompania, nombre, usuario, correo, contrasena, rol) VALUES (?, ?, ?, ?, ?, ?)",
          [parseInt(u.idCompania), u.nombre, u.usuario, u.correo, u.contrasena, u.rol]
        );
        u.id = (result as any).insertId;
        res.json(u);
      } else {
        if (u.id) {
          localUsers = localUsers.map(item => item.id === u.id ? u : item);
        } else {
          u.id = Math.max(0, ...localUsers.map(item => item.id)) + 1;
          localUsers.push(u);
        }
        res.json(u);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Patients
  app.get("/api/patients", async (req, res) => {
    try {
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM pacientes");
        const formatted = (rows as any[]).map(row => ({
          ...row,
          diabetes: !!row.diabetes,
          hipertension: !!row.hipertension,
          gastritis: !!row.gastritis,
          estrenimiento: !!row.estrenimiento
        }));
        res.json(formatted);
      } else {
        res.json(localPatients);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/patients", async (req, res) => {
    try {
      const p = req.body;
      if (dbConnected && pool) {
        if (p.id) {
          const [exists] = await pool.query("SELECT id FROM pacientes WHERE id = ?", [p.id]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE pacientes SET idCompania = ?, nombreCompleto = ?, fechaNacimiento = ?, edad = ?, ocupacion = ?, correoElectronico = ?, situacionVivienda = ?, tipoIdentificacion = ?, identificacion = ?, telefono = ?, provinciaId = ?, cantonId = ?, distritoId = ?, otrasSenas = ?, diabetes = ?, hipertension = ?, gastritis = ?, estrenimiento = ?, alergiasAlimentarias = ?, fracturas = ?, esguinces = ?, cirugiasOrtopedicas = ?, actividadFisica = ? WHERE id = ?",
              [parseInt(p.idCompania), p.nombreCompleto, p.fechaNacimiento, parseInt(p.edad), p.ocupacion, p.correoElectronico, p.situacionVivienda, p.tipoIdentificacion, p.identificacion, p.telefono, parseInt(p.provinciaId), parseInt(p.cantonId), parseInt(p.distritoId), p.otrasSenas, p.diabetes ? 1 : 0, p.hipertension ? 1 : 0, p.gastritis ? 1 : 0, p.estrenimiento ? 1 : 0, p.alergiasAlimentarias, p.fracturas, p.esguinces, p.cirugiasOrtopedicas, p.actividadFisica, p.id]
            );
            return res.json(p);
          }
        }
        const [result] = await pool.query(
          "INSERT INTO pacientes (idCompania, nombreCompleto, fechaNacimiento, edad, ocupacion, correoElectronico, situacionVivienda, tipoIdentificacion, identificacion, telefono, provinciaId, cantonId, distritoId, otrasSenas, diabetes, hipertension, gastritis, estrenimiento, alergiasAlimentarias, fracturas, esguinces, cirugiasOrtopedicas, actividadFisica) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [parseInt(p.idCompania), p.nombreCompleto, p.fechaNacimiento, parseInt(p.edad), p.ocupacion, p.correoElectronico, p.situacionVivienda, p.tipoIdentificacion, p.identificacion, p.telefono, parseInt(p.provinciaId), parseInt(p.cantonId), parseInt(p.distritoId), p.otrasSenas, p.diabetes ? 1 : 0, p.hipertension ? 1 : 0, p.gastritis ? 1 : 0, p.estrenimiento ? 1 : 0, p.alergiasAlimentarias, p.fracturas, p.esguinces, p.cirugiasOrtopedicas, p.actividadFisica]
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
  app.get("/api/consultations", async (req, res) => {
    try {
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM consultas");
        const formatted = (rows as any[]).map(row => ({
          ...row,
          antropometria: typeof row.antropometria === 'string' ? JSON.parse(row.antropometria) : row.antropometria,
          dieta: typeof row.dieta === 'string' ? JSON.parse(row.dieta) : row.dieta,
          fisioterapia: typeof row.fisioterapia === 'string' ? JSON.parse(row.fisioterapia) : row.fisioterapia
        }));
        res.json(formatted);
      } else {
        res.json(localConsultations);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/consultations", async (req, res) => {
    try {
      const con = req.body;
      if (dbConnected && pool) {
        if (con.id) {
          const [exists] = await pool.query("SELECT id FROM consultas WHERE id = ?", [con.id]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE consultas SET idPaciente = ?, idCompania = ?, fecha = ?, tipo = ?, motivo = ?, horasSueno = ?, compromiso = ?, antropometria = ?, dieta = ?, fisioterapia = ?, anotacionesGenerales = ? WHERE id = ?",
              [parseInt(con.idPaciente), parseInt(con.idCompania), con.fecha, con.tipo, con.motivo, parseFloat(con.horasSueno), parseInt(con.compromiso), JSON.stringify(con.antropometria || null), JSON.stringify(con.dieta || null), JSON.stringify(con.fisioterapia || null), con.anotacionesGenerales, con.id]
            );
            return res.json(con);
          }
        }
        const [result] = await pool.query(
          "INSERT INTO consultas (idPaciente, idCompania, fecha, tipo, motivo, horasSueno, compromiso, antropometria, dieta, fisioterapia, anotacionesGenerales) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [parseInt(con.idPaciente), parseInt(con.idCompania), con.fecha, con.tipo, con.motivo, parseFloat(con.horasSueno), parseInt(con.compromiso), JSON.stringify(con.antropometria || null), JSON.stringify(con.dieta || null), JSON.stringify(con.fisioterapia || null), con.anotacionesGenerales]
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
  app.get("/api/citas", async (req, res) => {
    try {
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM citas");
        res.json(rows);
      } else {
        res.json(localCitas);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/citas", async (req, res) => {
    try {
      const ct = req.body;
      if (dbConnected && pool) {
        if (ct.id) {
          const [exists] = await pool.query("SELECT id FROM citas WHERE id = ?", [ct.id]);
          if ((exists as any).length > 0) {
            await pool.query(
              "UPDATE citas SET idCompania = ?, idPaciente = ?, idUsuarioNutricionista = ?, idConsulta = ?, fechaHora = ?, duracionMinutos = ?, estadoCita = ?, notas = ?, confirmacionEnviadaEn = ?, recordatorioEnviadoEn = ?, cancelacionEnviadaEn = ? WHERE id = ?",
              [parseInt(ct.idCompania), parseInt(ct.idPaciente), parseInt(ct.idUsuarioNutricionista), ct.idConsulta || null, ct.fechaHora, parseInt(ct.duracionMinutos), ct.estadoCita, ct.notas || '', ct.confirmacionEnviadaEn || null, ct.recordatorioEnviadoEn || null, ct.cancelacionEnviadaEn || null, ct.id]
            );
            return res.json(ct);
          }
        }
        const [result] = await pool.query(
          "INSERT INTO citas (idCompania, idPaciente, idUsuarioNutricionista, idConsulta, fechaHora, duracionMinutos, estadoCita, notas, confirmacionEnviadaEn, recordatorioEnviadoEn, cancelacionEnviadaEn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [parseInt(ct.idCompania), parseInt(ct.idPaciente), parseInt(ct.idUsuarioNutricionista), ct.idConsulta || null, ct.fechaHora, parseInt(ct.duracionMinutos), ct.estadoCita, ct.notas || '', ct.confirmacionEnviadaEn || null, ct.recordatorioEnviadoEn || null, ct.cancelacionEnviadaEn || null]
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

  app.delete("/api/citas/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (dbConnected && pool) {
        await pool.query("DELETE FROM citas WHERE id = ?", [id]);
        res.json({ success: true });
      } else {
        localCitas = localCitas.filter(item => item.id !== id);
        res.json({ success: true });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. SMTP Configs
  app.get("/api/smtp-configs", async (req, res) => {
    try {
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM compania_smtp_config");
        const formatted = (rows as any[]).map(row => ({
          ...row,
          activo: !!row.activo
        }));
        res.json(formatted);
      } else {
        res.json(localSmtpConfigs);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/smtp-configs", async (req, res) => {
    try {
      const s = req.body;
      if (dbConnected && pool) {
        const [exists] = await pool.query("SELECT id FROM compania_smtp_config WHERE idCompania = ?", [parseInt(s.idCompania)]);
        if ((exists as any).length > 0) {
          await pool.query(
            "UPDATE compania_smtp_config SET proveedor = ?, smtpHost = ?, smtpPort = ?, smtpSeguridad = ?, smtpUsuario = ?, smtpPasswordCifrado = ?, remitenteNombre = ?, remitenteCorreo = ?, recordatorioHorasAntes = ?, activo = ? WHERE idCompania = ?",
            [s.provider || s.proveedor, s.smtpHost, parseInt(s.smtpPort), s.smtpSeguridad, s.smtpUsuario, s.smtpPasswordCifrado, s.remitenteNombre, s.remitenteCorreo, parseInt(s.recordatorioHorasAntes), s.activo ? 1 : 0, parseInt(s.idCompania)]
          );
          return res.json(s);
        }
        const [result] = await pool.query(
          "INSERT INTO compania_smtp_config (idCompania, proveedor, smtpHost, smtpPort, smtpSeguridad, smtpUsuario, smtpPasswordCifrado, remitenteNombre, remitenteCorreo, recordatorioHorasAntes, activo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [parseInt(s.idCompania), s.provider || s.proveedor, s.smtpHost, parseInt(s.smtpPort), s.smtpSeguridad, s.smtpUsuario, s.smtpPasswordCifrado, s.remitenteNombre, s.remitenteCorreo, parseInt(s.recordatorioHorasAntes), s.activo ? 1 : 0]
        );
        s.id = (result as any).insertId;
        res.json(s);
      } else {
        const index = localSmtpConfigs.findIndex(item => item.idCompania === s.idCompania);
        if (index !== -1) {
          localSmtpConfigs[index] = s;
        } else {
          s.id = Math.max(0, ...localSmtpConfigs.map(item => item.id)) + 1;
          localSmtpConfigs.push(s);
        }
        res.json(s);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Notification Logs
  app.get("/api/notification-logs", async (req, res) => {
    try {
      if (dbConnected && pool) {
        const [rows] = await pool.query("SELECT * FROM notification_logs");
        res.json(rows);
      } else {
        res.json(localLogs);
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/notification-logs", async (req, res) => {
    try {
      const l = req.body;
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

  // Endpoint to talk to the AI database schema assistant
  app.post("/api/chat", async (req: express.Request, res: express.Response) => {
    try {
      const { message, schemaContext } = req.body;
      
      let ai;
      try {
        ai = getGeminiClient();
      } catch (err: any) {
        return res.status(400).json({
          error: "Clave API ausente. Por favor, configura GEMINI_API_KEY en el panel de Secretos."
        });
      }

      const prompt = `
Eres un Diseñador de Bases de Datos experto y un Especialista en Fisioterapia e Informática Médica en Costa Rica.
El usuario tiene un sistema de nutrición y facturación en Costa Rica, y quiere agregar tablas para manejar pacientes de fisioterapia.

Aquí está la estructura actual de las tablas principales que el usuario compartió:
${schemaContext}

Petición del usuario:
"${message}"

Responde en español de forma profesional, clara y didáctica.
Si te piden modificaciones o adiciones al esquema, muestra los scripts de SQL (compatibles con MySQL / MariaDB como en el dump phpMyAdmin proporcionado). Asegúrate de incluir comentarios útiles y de respetar las claves foráneas (como vincular con 'pacientes' o 'consultas' usando id_paciente o id_consulta).
Mantén una estructura limpia y fácil de copiar.
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Error en API de Chat:", error);
      res.status(500).json({ error: error.message || "Error interno del servidor al consultar la IA." });
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
});

