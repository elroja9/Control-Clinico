-- ============================================================================
-- BASE DE DATOS: ConsultorioDB
-- MOTOR DE ALMACENAMIENTO: InnoDB
-- JUEGO DE CARACTERES: utf8mb4_unicode_ci
-- DESCRIPCIÓN: Script SQL unificado y completo que incluye las tablas de 
--              fisioterapia (nuevas) y nutrición (existentes), geografía de CR,
--              facturación y configuraciones de SMTP.
-- TOTAL DE TABLAS: 21
-- ============================================================================

-- 1. CREACIÓN DE LA BASE DE DATOS
CREATE DATABASE IF NOT EXISTS `ConsultorioDB`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `ConsultorioDB`;

-- Desactivar temporalmente restricciones de llaves foráneas para reinicio limpio
SET FOREIGN_KEY_CHECKS = 0;

-- 2. ELIMINACIÓN DE TABLAS EXISTENTES EN ORDEN DE DEPENDENCIA
DROP TABLE IF EXISTS `notification_logs`;
DROP TABLE IF EXISTS `compania_smtp_config`;
DROP TABLE IF EXISTS `citas`;
DROP TABLE IF EXISTS `sesiones_evolucion_fisioterapia`;
DROP TABLE IF EXISTS `plan_tratamiento_fisioterapia`;
DROP TABLE IF EXISTS `examen_fisico_rom`;
DROP TABLE IF EXISTS `evaluacion_dolor`;
DROP TABLE IF EXISTS `evaluacion_fisioterapeutica`;
DROP TABLE IF EXISTS `evaluacion_antropometrica`;
DROP TABLE IF EXISTS `consultas`;
DROP TABLE IF EXISTS `antecedentes_lesionales`;
DROP TABLE IF EXISTS `antecedentes_familiares`;
DROP TABLE IF EXISTS `antecedentes_personales`;
DROP TABLE IF EXISTS `pacientes`;
DROP TABLE IF EXISTS `usuarios`;
DROP TABLE IF EXISTS `facturas`;
DROP TABLE IF EXISTS `servicios`;
DROP TABLE IF EXISTS `companias`;
DROP TABLE IF EXISTS `distritos`;
DROP TABLE IF EXISTS `cantones`;
DROP TABLE IF EXISTS `provincias`;

-- Reactivar restricciones de llaves foráneas
SET FOREIGN_KEY_CHECKS = 1;


-- ============================================================================
-- CATEGORÍA 1: CONFIGURACIÓN Y USUARIOS
-- ============================================================================

-- TABLA: companias (Clínicas / Sedes de Salud)
CREATE TABLE `companias` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `nombreComercial` VARCHAR(255) NOT NULL COMMENT 'Nombre fantasía del consultorio o clínica',
  `razonSocial` VARCHAR(255) NOT NULL COMMENT 'Nombre legal/jurídico',
  `tipoIdentificacion` VARCHAR(5) NOT NULL COMMENT '01: Física, 02: Jurídica, 03: DIMEX, 04: NITE',
  `identificacion` VARCHAR(50) NOT NULL UNIQUE COMMENT 'Identificación tributaria única',
  `correoEmisor` VARCHAR(255) NOT NULL COMMENT 'Correo de emisión para reportes y notificaciones',
  `ivaPorDefecto` DECIMAL(5,2) NOT NULL DEFAULT 4.00 COMMENT 'IVA por servicios de salud (por defecto en Costa Rica es 4%)',
  `colorPrimario` VARCHAR(50) NOT NULL DEFAULT '#0f766e' COMMENT 'Color primario de la marca (formato hex)',
  `colorSidebar` VARCHAR(50) NOT NULL DEFAULT '#115e59' COMMENT 'Color lateral del panel de control',
  `logoUrl` TEXT NULL COMMENT 'URL del logotipo de la clínica',
  `actividadEconomica` TEXT NULL COMMENT 'Código o descripción de la actividad económica ante Hacienda',
  `perfilCompania` VARCHAR(50) NOT NULL DEFAULT 'Ambas' COMMENT 'Nutrición, Fisioterapia o Ambas'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: usuarios (Profesionales / Administradores)
CREATE TABLE `usuarios` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `idCompania` INT NOT NULL COMMENT 'Relación con la clínica correspondiente',
  `nombre` VARCHAR(255) NOT NULL COMMENT 'Nombre completo del profesional o administrativo',
  `usuario` VARCHAR(255) NOT NULL UNIQUE COMMENT 'Nombre de usuario único para login',
  `correo` VARCHAR(255) NOT NULL UNIQUE COMMENT 'Correo electrónico del profesional',
  `contrasena` VARCHAR(255) NOT NULL COMMENT 'Contraseña de acceso',
  `rol` VARCHAR(50) NOT NULL COMMENT 'Administrador, Profesional o Asistente',
  CONSTRAINT `fk_usuarios_compania` 
    FOREIGN KEY (`idCompania`) REFERENCES `companias` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- CATEGORÍA 2: GEOGRAFÍA Y DIRECCIONES COSTA RICA
-- ============================================================================

-- TABLA: provincias
CREATE TABLE `provincias` (
  `id_provincia` INT PRIMARY KEY COMMENT 'Identificador de la provincia (1 al 7)',
  `cod_hacienda` VARCHAR(2) NOT NULL UNIQUE COMMENT 'Código oficial para Hacienda (ej: 01)',
  `nombre` VARCHAR(50) NOT NULL COMMENT 'Nombre de la provincia',
  `estado` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1: Activo, 0: Inactivo'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: cantones
CREATE TABLE `cantones` (
  `id_canton` INT PRIMARY KEY COMMENT 'Código único del cantón (ej: 102)',
  `id_provincia` INT NOT NULL COMMENT 'ID de la provincia a la que pertenece',
  `cod_hacienda` VARCHAR(2) NOT NULL COMMENT 'Código oficial del cantón',
  `nombre` VARCHAR(50) NOT NULL COMMENT 'Nombre del cantón',
  CONSTRAINT `fk_cantones_provincia` 
    FOREIGN KEY (`id_provincia`) REFERENCES `provincias` (`id_provincia`) 
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: distritos
CREATE TABLE `distritos` (
  `id_distrito` INT PRIMARY KEY COMMENT 'Código único del distrito (ej: 10203)',
  `id_canton` INT NOT NULL COMMENT 'ID del cantón al que pertenece',
  `cod_hacienda` VARCHAR(2) NOT NULL COMMENT 'Código de Hacienda del distrito',
  `nombre` VARCHAR(50) NOT NULL COMMENT 'Nombre del distrito',
  CONSTRAINT `fk_distritos_canton` 
    FOREIGN KEY (`id_canton`) REFERENCES `cantones` (`id_canton`) 
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- CATEGORÍA 3: EXPEDIENTES Y PACIENTES (CENTRAL)
-- ============================================================================

-- TABLA: pacientes (Expediente unificado de Salud)
CREATE TABLE `pacientes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `idCompania` INT NOT NULL COMMENT 'Clínica propietaria del expediente',
  `nombreCompleto` VARCHAR(255) NOT NULL COMMENT 'Nombre completo del paciente',
  `fechaNacimiento` VARCHAR(50) NOT NULL COMMENT 'Fecha de nacimiento YYYY-MM-DD',
  `edad` INT NOT NULL COMMENT 'Edad calculada',
  `ocupacion` VARCHAR(255) NULL COMMENT 'Profesión u oficio',
  `correoElectronico` VARCHAR(255) NOT NULL COMMENT 'Destinatario de notificaciones y facturación',
  `situacionVivienda` VARCHAR(50) NULL COMMENT 'SOLO, ACOMPAÑADO, FAMILIAR',
  `tipoIdentificacion` VARCHAR(5) NOT NULL COMMENT '01: Física, 02: Jurídica, 03: DIMEX, 04: NITE, EXT: Pasaporte/Extranjero',
  `identificacion` VARCHAR(50) NOT NULL COMMENT 'Número de cédula o identificación',
  `telefono` VARCHAR(50) NULL,
  `provinciaId` INT NULL,
  `cantonId` INT NULL,
  `distritoId` INT NULL,
  `otrasSenas` TEXT NULL COMMENT 'Detalles adicionales de la dirección',
  -- Antecedentes Nutricionales / Médicos Generales
  `diabetes` BOOLEAN NOT NULL DEFAULT FALSE,
  `hipertension` BOOLEAN NOT NULL DEFAULT FALSE,
  `gastritis` BOOLEAN NOT NULL DEFAULT FALSE,
  `estrenimiento` BOOLEAN NOT NULL DEFAULT FALSE,
  `alergiasAlimentarias` TEXT NULL,
  -- Resumen antecedentes Fisioterapia
  `fracturas` TEXT NULL,
  `esguinces` TEXT NULL,
  `cirugiasOrtopedicas` TEXT NULL,
  `actividadFisica` TEXT NULL,
  CONSTRAINT `fk_pacientes_compania` 
    FOREIGN KEY (`idCompania`) REFERENCES `companias` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_pacientes_provincia` 
    FOREIGN KEY (`provinciaId`) REFERENCES `provincias` (`id_provincia`) 
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pacientes_canton` 
    FOREIGN KEY (`cantonId`) REFERENCES `cantones` (`id_canton`) 
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_pacientes_distrito` 
    FOREIGN KEY (`distritoId`) REFERENCES `distritos` (`id_distrito`) 
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- CATEGORÍA 4: ANTECEDENTES Y HISTORIALES CLÍNICOS DETALLADOS
-- ============================================================================

-- TABLA: antecedentes_personales (Módulo Nutrición)
CREATE TABLE `antecedentes_personales` (
  `id_paciente` INT PRIMARY KEY,
  `diabetes` TINYINT(1) NULL DEFAULT 0,
  `hipertension` TINYINT(1) NULL DEFAULT 0,
  `enfermedad_cardiovascular` TINYINT(1) NULL DEFAULT 0,
  `enfermedad_respiratoria` TINYINT(1) NULL DEFAULT 0,
  `enfermedad_renal` TINYINT(1) NULL DEFAULT 0,
  `problemas_tiroideos` TINYINT(1) NULL DEFAULT 0,
  `gastritis` TINYINT(1) NULL DEFAULT 0,
  `estrenimiento` TINYINT(1) NULL DEFAULT 0,
  `cirugias` VARCHAR(255) NULL,
  `observaciones` TEXT NULL,
  `estado` TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_ant_personales_paciente` 
    FOREIGN KEY (`id_paciente`) REFERENCES `pacientes` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: antecedentes_familiares (Módulo Nutrición)
CREATE TABLE `antecedentes_familiares` (
  `id_paciente` INT PRIMARY KEY,
  `obesidad` TINYINT(1) NULL DEFAULT 0,
  `cancer` TINYINT(1) NULL DEFAULT 0,
  `diabetes` TINYINT(1) NULL DEFAULT 0,
  `hipertension` TINYINT(1) NULL DEFAULT 0,
  `observaciones` TEXT NULL COMMENT 'Detalles sobre parentesco de antecedentes',
  `estado` TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_ant_familiares_paciente` 
    FOREIGN KEY (`id_paciente`) REFERENCES `pacientes` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: antecedentes_lesionales (Módulo Fisioterapia)
CREATE TABLE `antecedentes_lesionales` (
  `id_paciente` INT PRIMARY KEY,
  `fracturas` TEXT NULL COMMENT 'Historial de fracturas',
  `esguinces` TEXT NULL COMMENT 'Historial de esguinces',
  `luxaciones` TEXT NULL COMMENT 'Historial de luxaciones',
  `desgarros` TEXT NULL COMMENT 'Registro de desgarros musculares o tendinopatías',
  `cirugias_ortopedicas` TEXT NULL COMMENT 'Cirugías de columna, rodilla, hombros, etc.',
  `actividad_fisica_frecuencia` VARCHAR(100) NULL COMMENT 'Deporte y frecuencia semanal',
  `observaciones` TEXT NULL,
  `estado` TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_ant_lesionales_paciente` 
    FOREIGN KEY (`id_paciente`) REFERENCES `pacientes` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- CATEGORÍA 5: SESIONES, CONSULTAS Y EVALUACIONES CLÍNICAS
-- ============================================================================

-- TABLA: consultas (Evolución por encuentro de Salud)
CREATE TABLE `consultas` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `idPaciente` INT NOT NULL,
  `idCompania` INT NOT NULL,
  `fecha` VARCHAR(50) NOT NULL COMMENT 'Fecha de la sesión',
  `tipo` VARCHAR(50) NOT NULL COMMENT 'Nutrición, Fisioterapia, Integral',
  `motivo` TEXT NOT NULL COMMENT 'Motivo principal de la visita',
  `horasSueno` DECIMAL(4,1) NOT NULL DEFAULT 8.0,
  `compromiso` INT NOT NULL DEFAULT 10 COMMENT 'Nivel de motivación (1 al 10)',
  `antropometria` JSON NULL COMMENT 'Datos JSON de peso, grasa corporal, músculo, perímetros',
  `dieta` JSON NULL COMMENT 'Macrodistribución, calorías y plan alimenticio en JSON',
  `fisioterapia` JSON NULL COMMENT 'Dolor, pruebas musculares, rango de movilidad en JSON',
  `anotacionesGenerales` TEXT NULL COMMENT 'Anotaciones privadas del profesional',
  CONSTRAINT `fk_consultas_paciente` 
    FOREIGN KEY (`idPaciente`) REFERENCES `pacientes` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_consultas_compania` 
    FOREIGN KEY (`idCompania`) REFERENCES `companias` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- SUB-CATEGORÍA 5.1: MÓDULO NUTRICIÓN (DISEÑO RELACIONAL DETALLADO)
-- ============================================================================

-- TABLA: evaluacion_antropometrica
CREATE TABLE `evaluacion_antropometrica` (
  `id_antropometria` INT AUTO_INCREMENT PRIMARY KEY,
  `id_consulta` INT NOT NULL UNIQUE COMMENT 'Relación única con la consulta',
  `peso` DECIMAL(6,2) NULL COMMENT 'Peso en kilogramos',
  `talla` DECIMAL(6,2) NULL COMMENT 'Talla en centímetros',
  `imc` DECIMAL(6,2) NULL COMMENT 'Índice de masa corporal calculado',
  `grasa_visceral` DECIMAL(5,2) NULL COMMENT 'Nivel de grasa visceral',
  `masa_muscular` DECIMAL(6,2) NULL COMMENT 'Masa muscular en kg',
  `cintura` DECIMAL(6,2) NULL COMMENT 'Perímetro de cintura en cm',
  `abdominal` DECIMAL(6,2) NULL COMMENT 'Perímetro abdominal en cm',
  CONSTRAINT `fk_antropometria_consulta` 
    FOREIGN KEY (`id_consulta`) REFERENCES `consultas` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- SUB-CATEGORÍA 5.2: MÓDULO FISIOTERAPIA (DISEÑO RELACIONAL DETALLADO)
-- ============================================================================

-- TABLA: evaluacion_fisioterapeutica (Ficha de ingreso)
CREATE TABLE `evaluacion_fisioterapeutica` (
  `id_evaluacion_fisio` INT AUTO_INCREMENT PRIMARY KEY,
  `id_consulta` INT NOT NULL COMMENT 'Consulta de terapia asociada',
  `motivo_consulta` TEXT NOT NULL COMMENT 'Por qué asiste (dolor lumbar, rehabilitación poscirugía)',
  `mecanismo_lesion` TEXT NULL COMMENT 'Cómo ocurrió la lesión (ej: caída, trauma deportivo)',
  `diagnostico_medico` VARCHAR(255) NULL COMMENT 'Diagnóstico del médico general o traumatólogo',
  `sintomas_principales` TEXT NULL COMMENT 'Entumecimiento, rigidez, debilidad',
  `tiempo_evolucion` VARCHAR(100) NULL COMMENT 'Agudo, Subagudo, Crónico',
  `estado` TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_eval_fisio_consulta` 
    FOREIGN KEY (`id_consulta`) REFERENCES `consultas` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: evaluacion_dolor (Se vincula con el Mapa de Dolor)
CREATE TABLE `evaluacion_dolor` (
  `id_dolor` INT AUTO_INCREMENT PRIMARY KEY,
  `id_consulta` INT NOT NULL COMMENT 'Consulta asociada',
  `escala_eva` INT NOT NULL COMMENT 'Escala Visual Analógica (0 al 10)',
  `tipo_dolor` VARCHAR(100) NULL COMMENT 'Opresivo, Punzante, Quemante, Sordo, Irradiado',
  `localizacion_anatomica` VARCHAR(150) NOT NULL COMMENT 'Ubicación corporal del dolor (ej: cervical, lumbar)',
  `factores_agravantes` TEXT NULL COMMENT 'Qué aumenta el dolor',
  `factores_atenuantes` TEXT NULL COMMENT 'Qué alivia el dolor',
  `comportamiento_diario` VARCHAR(100) NULL COMMENT 'Mañana, tarde, noche, constante, intermitente',
  `estado` TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_eval_dolor_consulta` 
    FOREIGN KEY (`id_consulta`) REFERENCES `consultas` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: examen_fisico_rom (Rangos articulares, postura, pruebas especiales)
CREATE TABLE `examen_fisico_rom` (
  `id_examen_fisico` INT AUTO_INCREMENT PRIMARY KEY,
  `id_consulta` INT NOT NULL COMMENT 'Consulta asociada',
  `postura_observaciones` TEXT NULL COMMENT 'Hallazgos de la postura estática (ej: escoliosis)',
  `palpacion_hallazgos` TEXT NULL COMMENT 'Hallazgos al tacto, contracturas, trigger points',
  `rango_movimiento_rom` TEXT NULL COMMENT 'Rangos de movimiento articular activos y pasivos',
  `fuerza_muscular_daniels` TEXT NULL COMMENT 'Fuerza muscular calificada en Escala Daniels (0 al 5)',
  `pruebas_especiales` TEXT NULL COMMENT 'Pruebas ortopédicas y funcionales (ej: Phalen, Lachman)',
  `estado` TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_examen_fisico_consulta` 
    FOREIGN KEY (`id_consulta`) REFERENCES `consultas` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: plan_tratamiento_fisioterapia (Prescripción y dosificación terapéutica)
CREATE TABLE `plan_tratamiento_fisioterapia` (
  `id_plan` INT AUTO_INCREMENT PRIMARY KEY,
  `id_consulta` INT NOT NULL COMMENT 'Consulta asociada',
  `objetivos_corto_plazo` TEXT NULL COMMENT 'Reducir el dolor, desinflamar',
  `objetivos_largo_plazo` TEXT NULL COMMENT 'Retorno al deporte, recuperar movilidad completa',
  `agentes_fisicos` TEXT NULL COMMENT 'Electroterapia, ultrasonido, láser, crioterapia, termoterapia',
  `terapia_manual` TEXT NULL COMMENT 'Masaje, movilización pasiva, estiramiento manual',
  `ejercicio_terapeutico` TEXT NULL COMMENT 'Plan de ejercicios en casa, control motor, propiocepción',
  `frecuencia_sesiones_sugerida` VARCHAR(50) NULL COMMENT 'ej: 2 veces por semana',
  `cantidad_sesiones_total` INT NULL COMMENT 'ej: 10 sesiones totales',
  `estado` TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_plan_fisio_consulta` 
    FOREIGN KEY (`id_consulta`) REFERENCES `consultas` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: sesiones_evolucion_fisioterapia (Historial de evolución diaria - SOAP)
CREATE TABLE `sesiones_evolucion_fisioterapia` (
  `id_sesion` INT AUTO_INCREMENT PRIMARY KEY,
  `id_consulta` INT NOT NULL COMMENT 'Consulta de control o inicial',
  `numero_sesion` INT NOT NULL COMMENT 'Correlativo (Sesión 1, 2, 3...)',
  `fecha_sesion` DATE NOT NULL COMMENT 'Fecha de la rehabilitación física',
  `subjetivo` TEXT NULL COMMENT 'S (SOAP): Percepción del dolor hoy, reporte del paciente',
  `objetivo` TEXT NULL COMMENT 'O (SOAP): Hallazgos del terapeuta hoy, ejercicios tolerados',
  `analisis` TEXT NULL COMMENT 'A (SOAP): Evaluación de progreso clínico o estancamiento',
  `plan_siguiente_sesion` TEXT NULL COMMENT 'P (SOAP): Qué se priorizará en la próxima sesión',
  `creado_por` INT NULL COMMENT 'Fisioterapeuta que atendió',
  `estado` TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_sesiones_ev_consulta` 
    FOREIGN KEY (`id_consulta`) REFERENCES `consultas` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_sesiones_ev_usuario` 
    FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) 
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- CATEGORÍA 6: AGENDA, CITAS Y CORREOS ELECTRÓNICOS (SMTP)
-- ============================================================================

-- TABLA: citas (Agenda de citas médicas de la clínica)
CREATE TABLE `citas` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `idCompania` INT NOT NULL,
  `idPaciente` INT NOT NULL,
  `idUsuarioNutricionista` INT NOT NULL COMMENT 'Profesional que atenderá la cita',
  `idConsulta` INT NULL COMMENT 'Consulta asignada al realizarse la cita',
  `fechaHora` VARCHAR(50) NOT NULL COMMENT 'Fecha y hora de la cita (ISO YYYY-MM-DDTHH:MM)',
  `duracionMinutos` INT NOT NULL DEFAULT 30,
  `estadoCita` VARCHAR(50) NOT NULL DEFAULT 'PROGRAMADA' COMMENT 'PROGRAMADA, CONFIRMADA, CANCELADA, COMPLETADA, NO_ASISTIO',
  `notas` TEXT NULL COMMENT 'Notas preparatorias de la cita',
  `confirmacionEnviadaEn` VARCHAR(50) NULL,
  `recordatorioEnviadoEn` VARCHAR(50) NULL,
  `cancelacionEnviadaEn` VARCHAR(50) NULL,
  CONSTRAINT `fk_citas_compania` 
    FOREIGN KEY (`idCompania`) REFERENCES `companias` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_citas_paciente` 
    FOREIGN KEY (`idPaciente`) REFERENCES `pacientes` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_citas_usuario` 
    FOREIGN KEY (`idUsuarioNutricionista`) REFERENCES `usuarios` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: compania_smtp_config (Parámetros del Servidor de Correo Saliente)
CREATE TABLE `compania_smtp_config` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `idCompania` INT NOT NULL COMMENT 'Clínica propietaria de esta configuración',
  `proveedor` VARCHAR(50) NOT NULL DEFAULT 'OTRO' COMMENT 'GMAIL, OUTLOOK, OTRO',
  `smtpHost` VARCHAR(255) NULL,
  `smtpPort` INT NOT NULL DEFAULT 587,
  `smtpSeguridad` VARCHAR(50) NOT NULL DEFAULT 'TLS' COMMENT 'TLS, SSL, NINGUNA',
  `smtpUsuario` VARCHAR(255) NULL,
  `smtpPasswordCifrado` VARCHAR(255) NULL,
  `remitenteNombre` VARCHAR(255) NULL,
  `remitenteCorreo` VARCHAR(255) NULL,
  `recordatorioHorasAntes` INT NOT NULL DEFAULT 24 COMMENT 'Horas de anticipación de recordatorios',
  `activo` BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE KEY `unique_smtp_compania` (`idCompania`),
  CONSTRAINT `fk_smtp_compania` 
    FOREIGN KEY (`idCompania`) REFERENCES `companias` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: notification_logs (Historial de Correos Electrónicos Enviados)
CREATE TABLE `notification_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `idCompania` INT NOT NULL,
  `idCita` INT NOT NULL,
  `tipo` VARCHAR(50) NOT NULL COMMENT 'CONFIRMACION, MODIFICACION, RECORDATORIO, CANCELACION',
  `destinatario` VARCHAR(255) NOT NULL,
  `asunto` VARCHAR(255) NOT NULL,
  `cuerpo` TEXT NOT NULL,
  `enviadoEn` VARCHAR(50) NOT NULL,
  CONSTRAINT `fk_logs_compania` 
    FOREIGN KEY (`idCompania`) REFERENCES `companias` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_logs_cita` 
    FOREIGN KEY (`idCita`) REFERENCES `citas` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- CATEGORÍA 7: FACTURACIÓN ELECTRÓNICA Y SERVICIOS (CR - HACIENDA)
-- ============================================================================

-- TABLA: servicios (Catálogo de Terapias y Consultas con Código CABYS)
CREATE TABLE `servicios` (
  `id_servicio` INT AUTO_INCREMENT PRIMARY KEY,
  `nombre` VARCHAR(150) NOT NULL COMMENT 'Nombre del servicio brindado',
  `codigo_cabys` VARCHAR(13) NULL COMMENT 'Código de Hacienda de 13 dígitos para Costa Rica',
  `precio` DECIMAL(10,2) NOT NULL COMMENT 'Precio neto en colones',
  `porcentaje_iva` DECIMAL(5,2) NULL COMMENT 'IVA (Generalmente 4% para servicios de salud privados)'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- TABLA: facturas (Comprobantes Electrónicos Emitidos)
CREATE TABLE `facturas` (
  `id_factura` INT AUTO_INCREMENT PRIMARY KEY,
  `id_compania` INT NOT NULL COMMENT 'Emisor de la factura',
  `consecutivo` VARCHAR(20) NOT NULL COMMENT 'Consecutivo oficial de 20 dígitos',
  `clave` VARCHAR(50) NOT NULL UNIQUE COMMENT 'Clave oficial de 50 dígitos del Ministerio de Hacienda',
  `fecha_emision` DATETIME NOT NULL COMMENT 'Fecha de firma electrónica de la factura',
  `medio_pago` ENUM('EFECTIVO','TARJETA','TRANSFERENCIA','SINPE','OTRO') NOT NULL,
  `subtotal` DECIMAL(12,2) NOT NULL,
  `total_iva` DECIMAL(12,2) NOT NULL,
  `total_comprobante` DECIMAL(12,2) NOT NULL,
  `estado_hacienda` ENUM('BORRADOR','PENDIENTE_ENVIO','ACEPTADO','RECHAZADO') NOT NULL,
  CONSTRAINT `fk_facturas_compania` 
    FOREIGN KEY (`id_compania`) REFERENCES `companias` (`id`) 
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================================================
-- 3. INSERCIÓN DE DATOS DE PRUEBA Y CATÁLOGOS INICIALES
-- ============================================================================

-- 3.1 Provincias de Costa Rica
INSERT INTO `provincias` (`id_provincia`, `cod_hacienda`, `nombre`, `estado`) VALUES
(1, '01', 'San José', 1),
(2, '02', 'Alajuela', 1),
(3, '03', 'Cartago', 1),
(4, '04', 'Heredia', 1),
(5, '05', 'Guanacaste', 1),
(6, '06', 'Puntarenas', 1),
(7, '07', 'Limón', 1);

-- 3.2 Cantones de Costa Rica (Muestra representativa de Escazú y Alajuela)
INSERT INTO `cantones` (`id_canton`, `id_provincia`, `cod_hacienda`, `nombre`) VALUES
(102, 1, '02', 'Escazú'),
(201, 2, '01', 'Alajuela');

-- 3.3 Distritos de Costa Rica (Muestra representativa de San Rafael de Escazú y Alajuela Centro)
INSERT INTO `distritos` (`id_distrito`, `id_canton`, `cod_hacienda`, `nombre`) VALUES
(10203, 102, '03', 'San Rafael'),
(20101, 201, '01', 'Alajuela');

-- 3.4 Clínicas / Compañías por defecto
INSERT INTO `companias` (`id`, `nombreComercial`, `razonSocial`, `tipoIdentificacion`, `identificacion`, `correoEmisor`, `ivaPorDefecto`, `colorPrimario`, `colorSidebar`, `logoUrl`, `actividadEconomica`, `perfilCompania`) VALUES
(1, 'FisioNutri Escazú', 'Clínicas de Salud Integral S.A.', '02', '3-101-445566', 'contacto@fisionutriescazu.com', 4.00, '#0f766e', '#115e59', 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=120&auto=format&fit=crop&q=60', '869001 (Servicios de Terapia Física y Nutrición)', 'Ambas'),
(2, 'Clínica Elronutri Alajuela', 'Eliecer Rojas Nutrición y Terapia', '01', '5-0392-0984', 'eliecer.rojas9@gmail.com', 4.00, '#d97706', '#92400e', 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=120&auto=format&fit=crop&q=60', '851201 (Servicios de Nutrición)', 'Nutrición');

-- 3.5 Usuarios Iniciales
INSERT INTO `usuarios` (`id`, `idCompania`, `nombre`, `usuario`, `correo`, `contrasena`, `rol`) VALUES
(1, 1, 'Dr. Keneth Rojas', 'admin_escazu', 'contacto@fisionutriescazu.com', '123456', 'Administrador'),
(2, 2, 'Dr. Eliecer Rojas', 'eliecer_alajuela', 'eliecer.rojas9@gmail.com', '123456', 'Administrador');

-- 3.6 Servicios Médicos Brindados por Defecto (CABYS)
INSERT INTO `servicios` (`id_servicio`, `nombre`, `codigo_cabys`, `precio`, `porcentaje_iva`) VALUES
(1, 'Consulta Nutricional Completa', '9311100001000', 35000.00, 4.00),
(2, 'Terapia Física de Descarga Muscular', '9311300002100', 25000.00, 4.00),
(3, 'Evaluación Integral Fisioterapéutica', '9311300001000', 40000.00, 4.00);

-- 3.7 Pacientes Iniciales (Alineados con el mock de React)
INSERT INTO `pacientes` (`id`, `idCompania`, `nombreCompleto`, `fechaNacimiento`, `edad`, `ocupacion`, `correoElectronico`, `situacionVivienda`, `tipoIdentificacion`, `identificacion`, `telefono`, `provinciaId`, `cantonId`, `distritoId`, `otrasSenas`, `diabetes`, `hipertension`, `gastritis`, `estrenimiento`, `alergiasAlimentarias`, `fracturas`, `esguinces`, `cirugiasOrtopedicas`, `actividadFisica`) VALUES
(1, 1, 'Keneth Rojas Delgado', '1994-08-13', 32, 'Agente de Aduanas', 'keneth.rojas@hotmail.com', 'SOLO', '01', '5-0399-0811', '8303-7805', 1, 102, 10203, 'De la Iglesia de San Rafael, 200m Oeste, casa de portón café.', 0, 1, 1, 0, 'Intolerancia a la lactosa y alergia a mariscos', 'Fractura de clavícula izquierda en 2018', 'Esguince de tobillo derecho grado II (2021)', 'Ninguna', 'Gimnasio 3 veces por semana'),
(2, 2, 'María Elena Quesada Brenes', '1988-04-22', 38, 'Profesora de Primaria', 'maria.quesada@mep.go.cr', 'FAMILIAR', '01', '2-0456-0789', '8899-2233', 2, 201, 20101, 'Frente al parque de los niños, edificio esquinero.', 0, 0, 0, 0, 'Ninguna', 'Ninguna', 'Ninguno', 'Ninguna', 'Ninguna');

-- 3.8 Consultas SOAP Iniciales
INSERT INTO `consultas` (`id`, `idPaciente`, `idCompania`, `fecha`, `tipo`, `motivo`, `horasSueno`, `compromiso`, `antropometria`, `dieta`, `fisioterapia`, `anotacionesGenerales`) VALUES
(1, 1, 1, '2026-07-15', 'Fisioterapia', 'Fuerte dolor en hombro derecho tras entrenamiento de fuerza.', 6.5, 9, 
'{"peso": 82.5, "talla": 178.0, "imc": 26.0, "grasaCorporal": 18.5, "grasaVisceral": 8.0, "masaMuscular": 36.5, "masaOsea": 4.2, "cintura": 88.0, "abdominal": 92.0}',
'{"totalCalorias": 2200, "desayuno": "Gallo pinto, huevos revueltos, café negro sin azúcar", "meriendaManana": "Fruta de temporada con almendras", "almuerzo": "Casado con pechuga de pollo a la plancha y ensalada verde", "meriendaTarde": "Yogurt griego con granola", "cena": "Sopa de verduras con carne magra", "indicaciones": "Evitar lácteos enteros e incrementar hidratación a 3L diarios"}',
'{"mecanismoLesion": "Movimiento brusco de abducción en press de banca plano", "diagnosticoMedico": "Tendinitis del supraespinoso (Hombro Derecho)", "evaDolor": 7, "zonaDolor": "Hombro Derecho", "tipoDolor": "Punzante al realizar abducción a más de 90 grados", "factoresAgravantes": "Cargar peso, dormir sobre el hombro derecho", "factoresAtenuantes": "Crioterapia, reposo, analgésico oral", "posturaObservaciones": "Ligera anteproyección de ambos hombros, mayor en el hombro derecho", "palpacionHallazgos": "Dolor severo a la palpación en tendón de supraespinoso e hipertonía en trapecio superior derecho", "romMedido": "Abducción activa limitada a 85 grados por dolor, flexión a 140 grados", "fuerzaDaniels": "Fuerza 3/5 en abducción de hombro derecho por dolor", "pruebasEspeciales": "Prueba de Neer positiva, Prueba de Hawkins-Kennedy positiva", "agentesFisicos": "Crioterapia por 15 minutos, Ultrasonido pulsado a 1.5 W/cm2 por 6 minutos", "terapiaManual": "Masoterapia de descarga en cuello y hombro derecho, liberación miofascial en trapecio", "ejercicioTerapeutico": "Ejercicios de péndulo de Codman en casa (3 series de 15 repeticiones, 2 veces al día)", "sesionesSugeridas": 10, "soapSubjetivo": "Paciente indica dolor agudo 7/10 en hombro derecho tras hacer press de banca.", "soapObjetivo": "Movilidad limitada, pruebas ortopédicas positivas para pinzamiento subacromial.", "soapAnalisis": "Presenta síndrome de pinzamiento del supraespinoso secundario a sobrecarga mecánica en gimnasio.", "soapPlan": "Controlar inflamación mediante agentes físicos y terapia manual. Iniciar péndulos y estiramientos suaves."}',
'Paciente con buena actitud física pero con sobrecarga importante. Se requiere reposo de gimnasio por 1 semana.');

-- 3.9 Diagnósticos de Antropometría Detallados
INSERT INTO `evaluacion_antropometrica` (`id_antropometria`, `id_consulta`, `peso`, `talla`, `imc`, `grasa_visceral`, `masa_muscular`, `cintura`, `abdominal`) VALUES
(1, 1, 82.50, 178.00, 26.00, 8.00, 36.50, 88.00, 92.00);

-- 3.10 Evaluaciones de Fisioterapia Detalladas
INSERT INTO `evaluacion_fisioterapeutica` (`id_evaluacion_fisio`, `id_consulta`, `motivo_consulta`, `mecanismo_lesion`, `diagnostico_medico`, `sintomas_principales`, `tiempo_evolucion`, `estado`) VALUES
(1, 1, 'Fuerte dolor en hombro derecho tras entrenamiento de fuerza.', 'Movimiento brusco de abducción en press de banca plano', 'Tendinitis del supraespinoso', 'Dolor punzante, incapacidad de elevar brazo derecho', '2 días', 1);

-- 3.11 Mapeos de Dolor
INSERT INTO `evaluacion_dolor` (`id_dolor`, `id_consulta`, `escala_eva`, `tipo_dolor`, `localizacion_anatomica`, `factores_agravantes`, `factores_atenuantes`, `comportamiento_diario`, `estado`) VALUES
(1, 1, 7, 'Punzante', 'Hombro Derecho', 'Movimientos por encima de la cabeza, cargar bolsas de compras', 'Reposo y compresas frías', 'Empeora en la noche al acostarse de ese lado', 1);

-- 3.12 Examen Físico ROM
INSERT INTO `examen_fisico_rom` (`id_examen_fisico`, `id_consulta`, `postura_observaciones`, `palpacion_hallazgos`, `rango_movimiento_rom`, `fuerza_muscular_daniels`, `pruebas_especiales`, `estado`) VALUES
(1, 1, 'Ligera anteproyección de hombros, más severo en el hombro derecho', 'Hipertonía severa en trapecio superior derecho y dolor intenso en fosa supraespinosa', 'Abducción activa limitada a 85° por dolor agudo', 'Escala Daniels: 3/5 en abducción de hombro', 'Neer (+), Hawkins-Kennedy (+)', 1);

-- 3.13 Planes de Tratamiento
INSERT INTO `plan_tratamiento_fisioterapia` (`id_plan`, `id_consulta`, `objetivos_corto_plazo`, `objetivos_largo_plazo`, `agentes_fisicos`, `terapia_manual`, `ejercicio_terapeutico`, `frecuencia_sesiones_sugerida`, `cantidad_sesiones_total`, `estado`) VALUES
(1, 1, 'Disminuir el dolor de 7/10 a 3/10 y desinflamar la articulación acromioclavicular', 'Recuperar el rango completo de movilidad (abducción a 180°) y retorno seguro al gimnasio', 'Ultrasonido pulsátil y termocrioterapia selectiva', 'Liberación miofascial y estiramientos pasivos asistidos', 'Ejercicios de péndulo Codman y fortalecimiento excéntrico de manguito rotador con bandas elásticas', '2 veces por semana', 10, 1);

-- 3.14 Sesiones de nota SOAP diarias
INSERT INTO `sesiones_evolucion_fisioterapia` (`id_sesion`, `id_consulta`, `numero_sesion`, `fecha_sesion`, `subjetivo`, `objetivo`, `analisis`, `plan_siguiente_sesion`, `creado_por`, `estado`) VALUES
(1, 1, 1, '2026-07-16', 'Paciente indica mejoría leve tras aplicar frío en casa, amanece con dolor 6/10', 'Se realiza terapia manual, abducción mejora pasivamente a 100°', 'Buena respuesta a la dosificación física inicial', 'Mantener agentes físicos e iniciar movilizaciones activas asistidas', 1, 1);

-- 3.15 Citas agendadas por defecto
INSERT INTO `citas` (`id`, `idCompania`, `idPaciente`, `idUsuarioNutricionista`, `idConsulta`, `fechaHora`, `duracionMinutos`, `estadoCita`, `notas`, `confirmacionEnviadaEn`, `recordatorioEnviadoEn`, `cancelacionEnviadaEn`) VALUES
(1, 1, 1, 1, 1, '2026-07-20 09:00', 45, 'PROGRAMADA', 'Seguimiento de rehabilitación de hombro y antropometría', NULL, NULL, NULL),
(2, 2, 2, 2, NULL, '2026-07-22 14:00', 30, 'PROGRAMADA', 'Consulta inicial de hábitos alimenticios y peso', NULL, NULL, NULL);

-- 3.16 Parámetros SMTP por Defecto
INSERT INTO `compania_smtp_config` (`id`, `idCompania`, `proveedor`, `smtpHost`, `smtpPort`, `smtpSeguridad`, `smtpUsuario`, `smtpPasswordCifrado`, `remitenteNombre`, `remitenteCorreo`, `recordatorioHorasAntes`, `activo`) VALUES
(1, 1, 'OTRO', 'mail.fisionutriescazu.com', 587, 'TLS', 'notificaciones@fisionutriescazu.com', 'ClaveSegura123', 'FisioNutri Notificaciones', 'notificaciones@fisionutriescazu.com', 24, 1),
(2, 2, 'GMAIL', 'smtp.gmail.com', 465, 'SSL', 'notificaciones.elronutri@gmail.com', 'AppPassword123', 'Elronutri Alajuela Notificaciones', 'notificaciones.elronutri@gmail.com', 24, 0);

-- ============================================================================
-- ÍNDICES DE OPTIMIZACIÓN DE BÚSQUEDAS
-- ============================================================================
CREATE INDEX `idx_pacientes_identificacion` ON `pacientes` (`identificacion`);
CREATE INDEX `idx_citas_fechahora` ON `citas` (`fechaHora`);
CREATE INDEX `idx_consultas_fecha` ON `consultas` (`fecha`);
CREATE INDEX `idx_notification_logs_enviado` ON `notification_logs` (`enviadoEn`);

-- Fin del Script completo
