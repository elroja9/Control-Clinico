-- ============================================================================
-- BASE DE DATOS: ConsultorioDB
-- MOTOR DE ALMACENAMIENTO: InnoDB
-- JUEGO DE CARACTERES: utf8mb4_general_ci
-- DESCRIPCIÓN: Script SQL completo y detallado para la clínica, que incluye
--              todos los módulos de Nutrición (evaluaciones, estilo de vida,
--              antecedentes), geografía de Costa Rica, facturación y config.
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `ConsultorioDB` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `ConsultorioDB`;

SET FOREIGN_KEY_CHECKS = 0;

-- Drop existing tables to ensure a clean slate
DROP TABLE IF EXISTS `antecedentes_familiares`;
DROP TABLE IF EXISTS `antecedentes_personales`;
DROP TABLE IF EXISTS `barrios`;
DROP TABLE IF EXISTS `cantones`;
DROP TABLE IF EXISTS `companias`;
DROP TABLE IF EXISTS `compania_direcciones`;
DROP TABLE IF EXISTS `compania_hacienda_config`;
DROP TABLE IF EXISTS `compania_telefonos`;
DROP TABLE IF EXISTS `composicion_segmentada`;
DROP TABLE IF EXISTS `consultas`;
DROP TABLE IF EXISTS `dietas_recetas`;
DROP TABLE IF EXISTS `distritos`;
DROP TABLE IF EXISTS `estilo_vida`;
DROP TABLE IF EXISTS `evaluacion_antropometrica`;
DROP TABLE IF EXISTS `evaluacion_bioquimica`;
DROP TABLE IF EXISTS `evaluacion_dietetica`;
DROP TABLE IF EXISTS `facturas`;
DROP TABLE IF EXISTS `factura_lineas`;
DROP TABLE IF EXISTS `frecuencia_alimentos`;
DROP TABLE IF EXISTS `historial_farmacologico`;
DROP TABLE IF EXISTS `notificaciones_reevaluacion`;
DROP TABLE IF EXISTS `pacientes`;
DROP TABLE IF EXISTS `paciente_direcciones`;
DROP TABLE IF EXISTS `paciente_telefonos`;
DROP TABLE IF EXISTS `provincias`;
DROP TABLE IF EXISTS `servicios`;
DROP TABLE IF EXISTS `usuarios`;

SET FOREIGN_KEY_CHECKS = 1;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `provincias`
-- --------------------------------------------------------
CREATE TABLE `provincias` (
  `id_provincia` int(11) NOT NULL PRIMARY KEY,
  `cod_hacienda` varchar(2) NOT NULL UNIQUE,
  `nombre` varchar(50) NOT NULL,
  `estado` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `cantones`
-- --------------------------------------------------------
CREATE TABLE `cantones` (
  `id_canton` int(11) NOT NULL PRIMARY KEY,
  `id_provincia` int(11) NOT NULL,
  `cod_hacienda` varchar(2) NOT NULL,
  `nombre` varchar(50) NOT NULL,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_cantones_provincia` FOREIGN KEY (`id_provincia`) REFERENCES `provincias` (`id_provincia`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `distritos`
-- --------------------------------------------------------
CREATE TABLE `distritos` (
  `id_distrito` int(11) NOT NULL PRIMARY KEY,
  `id_canton` int(11) NOT NULL,
  `cod_hacienda` varchar(2) NOT NULL,
  `nombre` varchar(50) NOT NULL,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_distritos_canton` FOREIGN KEY (`id_canton`) REFERENCES `cantones` (`id_canton`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `barrios`
-- --------------------------------------------------------
CREATE TABLE `barrios` (
  `id_barrio` int(11) NOT NULL PRIMARY KEY,
  `id_distrito` int(11) NOT NULL,
  `cod_hacienda` varchar(2) NOT NULL,
  `nombre` varchar(50) NOT NULL,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_barrios_distrito` FOREIGN KEY (`id_distrito`) REFERENCES `distritos` (`id_distrito`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `companias`
-- --------------------------------------------------------
CREATE TABLE `companias` (
  `id_compania` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `nombre_comercial` varchar(150) NOT NULL,
  `razon_social` varchar(150) NOT NULL,
  `tipo_identificacion` enum('01','02','03','04') NOT NULL COMMENT '01:Física, 02:Jurídica, 03:DIMEX, 04:NITE',
  `identificacion` varchar(50) NOT NULL UNIQUE,
  `cod_actividad_economica` varchar(10) DEFAULT NULL COMMENT 'Código ATV',
  `correo_emisor` varchar(150) NOT NULL,
  `iva_por_defecto` decimal(5,2) NOT NULL DEFAULT 13.00,
  `sucursal_hacienda` varchar(3) NOT NULL DEFAULT '001',
  `terminal_hacienda` varchar(5) NOT NULL DEFAULT '00001',
  `siguiente_consecutivo_factura` int(11) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `color_primario` varchar(7) NOT NULL DEFAULT '#0d9488',
  `color_sidebar` varchar(7) NOT NULL DEFAULT '#115e59',
  `logo_url` varchar(255) DEFAULT NULL COMMENT 'Ruta al logo subido',
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  `estadoSaas` enum('PENDIENTE','ACTIVA','SUSPENDIDA') NOT NULL DEFAULT 'ACTIVA',
  `maxUsuarios` int(11) NOT NULL DEFAULT 5,
  `montoMensual` decimal(10,2) DEFAULT NULL,
  `proximoVencimiento` date DEFAULT NULL,
  `horarioAtencion` json DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `pagos_empresa`
-- --------------------------------------------------------
CREATE TABLE `pagos_empresa` (
  `id_pago` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_compania` int(11) NOT NULL,
  `fecha` date NOT NULL,
  `monto` decimal(10,2) NOT NULL,
  `notas` varchar(255) DEFAULT NULL,
  `registrado_por` varchar(150) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  CONSTRAINT `fk_pagos_empresa_compania` FOREIGN KEY (`id_compania`) REFERENCES `companias` (`id_compania`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `usuarios`
-- --------------------------------------------------------
CREATE TABLE `usuarios` (
  `id_usuario` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_compania` int(11) NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `email` varchar(100) NOT NULL UNIQUE,
  `password_hash` varchar(255) NOT NULL,
  `rol` enum('ADMIN','NUTRICIONISTA','RECEPCION') DEFAULT 'NUTRICIONISTA',
  `activo` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  `ubicacionDireccion` varchar(255) DEFAULT NULL,
  `ubicacionLat` decimal(10,7) DEFAULT NULL,
  `ubicacionLng` decimal(10,7) DEFAULT NULL,
  `maxTiempoTrasladoMinutos` int(11) NOT NULL DEFAULT 45,
  CONSTRAINT `fk_usuarios_compania` FOREIGN KEY (`id_compania`) REFERENCES `companias` (`id_compania`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `pacientes`
-- --------------------------------------------------------
CREATE TABLE `pacientes` (
  `id_paciente` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_compania` int(11) NOT NULL,
  `nombre_completo` varchar(150) NOT NULL,
  `fecha_nacimiento` date DEFAULT NULL,
  `edad` int(11) DEFAULT NULL,
  `ocupacion` varchar(150) DEFAULT NULL,
  `correo_electronico` varchar(100) DEFAULT NULL,
  `situacion_vivienda` enum('SOLO','ACOMPAÑADO','FAMILIAR') DEFAULT NULL,
  `fact_tipo_identificacion` enum('01','02','03','04','EXT') DEFAULT NULL,
  `fact_identificacion` varchar(50) DEFAULT NULL,
  `fact_nombre` varchar(150) DEFAULT NULL,
  `fact_correo` varchar(150) DEFAULT NULL,
  `periodicidad_valoracion` enum('MENSUAL','BIMESTRAL','TRIMESTRAL','SEMESTRAL','ANUAL') NOT NULL DEFAULT 'MENSUAL',
  `proxima_valoracion` date DEFAULT NULL,
  `creado_por` int(11) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_por` int(11) DEFAULT NULL,
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_pacientes_compania` FOREIGN KEY (`id_compania`) REFERENCES `companias` (`id_compania`) ON DELETE CASCADE,
  CONSTRAINT `fk_pacientes_creado_por` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL,
  CONSTRAINT `fk_pacientes_actualizado_por` FOREIGN KEY (`actualizado_por`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `antecedentes_familiares`
-- --------------------------------------------------------
CREATE TABLE `antecedentes_familiares` (
  `id_paciente` int(11) NOT NULL PRIMARY KEY,
  `obesidad` tinyint(1) DEFAULT 0,
  `cancer` tinyint(1) DEFAULT 0,
  `diabetes` tinyint(1) DEFAULT 0,
  `dislipidemia` tinyint(1) DEFAULT 0,
  `enfermedad_cardiovascular` tinyint(1) DEFAULT 0,
  `hipertension` tinyint(1) DEFAULT 0,
  `enfermedad_respiratoria` tinyint(1) DEFAULT 0,
  `enfermedad_renal` tinyint(1) DEFAULT 0,
  `problemas_tiroideos` tinyint(1) DEFAULT 0,
  `epilepsia` tinyint(1) DEFAULT 0,
  `artritis_reumatoide` tinyint(1) DEFAULT 0,
  `problemas_psiquiatricos` tinyint(1) DEFAULT 0,
  `lupus_inmunologicos` tinyint(1) DEFAULT 0,
  `otros` varchar(255) DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_ant_familiares_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `pacientes` (`id_paciente`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `antecedentes_personales`
-- --------------------------------------------------------
CREATE TABLE `antecedentes_personales` (
  `id_paciente` int(11) NOT NULL PRIMARY KEY,
  `diabetes` tinyint(1) DEFAULT 0,
  `dislipidemia` tinyint(1) DEFAULT 0,
  `enfermedad_respiratoria` tinyint(1) DEFAULT 0,
  `enfermedad_cardiovascular` tinyint(1) DEFAULT 0,
  `hipertension` tinyint(1) DEFAULT 0,
  `enfermedad_renal` tinyint(1) DEFAULT 0,
  `problemas_tiroideos` tinyint(1) DEFAULT 0,
  `ulceras` tinyint(1) DEFAULT 0,
  `cancer` tinyint(1) DEFAULT 0,
  `cirugias` varchar(255) DEFAULT NULL,
  `depresion` tinyint(1) DEFAULT 0,
  `sida` tinyint(1) DEFAULT 0,
  `intolerancia_alimento` varchar(255) DEFAULT NULL,
  `problemas_dentales` tinyint(1) DEFAULT 0,
  `problemas_masticacion_deglucion` tinyint(1) DEFAULT 0,
  `hernia_hiatal` tinyint(1) DEFAULT 0,
  `reflujo_gastroesofagico` tinyint(1) DEFAULT 0,
  `gastritis` tinyint(1) DEFAULT 0,
  `nauseas_frecuentes` tinyint(1) DEFAULT 0,
  `vomitos` tinyint(1) DEFAULT 0,
  `colon_irritable` tinyint(1) DEFAULT 0,
  `estrenimiento` tinyint(1) DEFAULT 0,
  `diarreas` tinyint(1) DEFAULT 0,
  `colelitiasis` tinyint(1) DEFAULT 0,
  `observaciones` text DEFAULT NULL,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_ant_personales_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `pacientes` (`id_paciente`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `estilo_vida`
-- --------------------------------------------------------
CREATE TABLE `estilo_vida` (
  `id_paciente` int(11) NOT NULL PRIMARY KEY,
  `realiza_ejercicio` tinyint(1) DEFAULT 0,
  `tiempo_entrenar` varchar(100) DEFAULT NULL,
  `hace_cuanto_entrena` varchar(100) DEFAULT NULL,
  `hora_entreno` varchar(50) DEFAULT NULL,
  `tipo_ejercicio` varchar(100) DEFAULT NULL,
  `frecuencia_ejercicio_semana` varchar(50) DEFAULT NULL,
  `duracion_ejercicio` varchar(50) DEFAULT NULL,
  `suplementos` varchar(255) DEFAULT NULL,
  `consume_alcohol` tinyint(1) DEFAULT 0,
  `tipo_alcohol` varchar(100) DEFAULT NULL,
  `frecuencia_alcohol` varchar(100) DEFAULT NULL,
  `cantidad_alcohol` varchar(100) DEFAULT NULL,
  `fuma` tinyint(1) DEFAULT 0,
  `frecuencia_fumado` varchar(100) DEFAULT NULL,
  `cantidad_fumado` varchar(100) DEFAULT NULL,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_estilo_vida_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `pacientes` (`id_paciente`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `historial_farmacologico`
-- --------------------------------------------------------
CREATE TABLE `historial_farmacologico` (
  `id_farmaco` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_paciente` int(11) NOT NULL,
  `tipo_medicamento` varchar(100) NOT NULL,
  `dosis` varchar(100) DEFAULT NULL,
  `frecuencia_uso` varchar(100) DEFAULT NULL,
  `observaciones` text DEFAULT NULL,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_farmacologico_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `pacientes` (`id_paciente`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `paciente_direcciones`
-- --------------------------------------------------------
CREATE TABLE `paciente_direcciones` (
  `id_direccion` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_paciente` int(11) NOT NULL,
  `tipo_direccion` enum('CASA','TRABAJO','FACTURACION','OTRO') DEFAULT 'CASA',
  `es_principal` tinyint(1) DEFAULT 1 COMMENT 'Usar esta para Hacienda por defecto',
  `id_provincia` int(11) NOT NULL,
  `id_canton` int(11) NOT NULL,
  `id_distrito` int(11) NOT NULL,
  `id_barrio` int(11) DEFAULT NULL,
  `otras_senas` varchar(250) NOT NULL,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_paciente_dir_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `pacientes` (`id_paciente`) ON DELETE CASCADE,
  CONSTRAINT `fk_paciente_dir_provincia` FOREIGN KEY (`id_provincia`) REFERENCES `provincias` (`id_provincia`),
  CONSTRAINT `fk_paciente_dir_canton` FOREIGN KEY (`id_canton`) REFERENCES `cantones` (`id_canton`),
  CONSTRAINT `fk_paciente_dir_distrito` FOREIGN KEY (`id_distrito`) REFERENCES `distritos` (`id_distrito`),
  CONSTRAINT `fk_paciente_dir_barrio` FOREIGN KEY (`id_barrio`) REFERENCES `barrios` (`id_barrio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `paciente_telefonos`
-- --------------------------------------------------------
CREATE TABLE `paciente_telefonos` (
  `id_telefono` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_paciente` int(11) NOT NULL,
  `tipo_telefono` enum('MOVIL','CASA','TRABAJO','WHATSAPP','EMERGENCIA') DEFAULT 'MOVIL',
  `codigo_pais` varchar(5) DEFAULT '506',
  `numero` varchar(20) NOT NULL,
  `es_principal` tinyint(1) DEFAULT 1 COMMENT 'Usar este para notificaciones y factura',
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_paciente_tel_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `pacientes` (`id_paciente`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `consultas`
-- --------------------------------------------------------
CREATE TABLE `consultas` (
  `id_consulta` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_paciente` int(11) NOT NULL,
  `id_compania` int(11) NOT NULL,
  `fecha_consulta` date NOT NULL,
  `motivo_expectativas` text DEFAULT NULL,
  `horas_sueno` decimal(4,2) DEFAULT NULL,
  `compromiso_cumplir` int(11) DEFAULT NULL,
  `comentarios_nutricionista` text DEFAULT NULL,
  `creado_por` int(11) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_por` int(11) DEFAULT NULL,
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_consultas_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `pacientes` (`id_paciente`) ON DELETE CASCADE,
  CONSTRAINT `fk_consultas_compania` FOREIGN KEY (`id_compania`) REFERENCES `companias` (`id_compania`),
  CONSTRAINT `fk_consultas_creado` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL,
  CONSTRAINT `fk_consultas_actualizado` FOREIGN KEY (`actualizado_por`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `evaluacion_antropometrica`
-- --------------------------------------------------------
CREATE TABLE `evaluacion_antropometrica` (
  `id_antropometria` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_consulta` int(11) NOT NULL,
  `peso` decimal(6,2) DEFAULT NULL,
  `talla` decimal(6,2) DEFAULT NULL,
  `imc` decimal(6,2) DEFAULT NULL,
  `c_muneca` decimal(6,2) DEFAULT NULL,
  `porcentaje_grasa_balanza` decimal(5,2) DEFAULT NULL,
  `grasa_visceral` decimal(5,2) DEFAULT NULL,
  `porcentaje_agua` decimal(5,2) DEFAULT NULL,
  `masa_muscular` decimal(6,2) DEFAULT NULL,
  `kg_magros` decimal(6,2) DEFAULT NULL,
  `masa_osea` decimal(5,2) DEFAULT NULL,
  `tmb` decimal(7,2) DEFAULT NULL,
  `edad_metabolica` int(11) DEFAULT NULL,
  `cintura` decimal(6,2) DEFAULT NULL,
  `circunferencia_abdominal` decimal(6,2) DEFAULT NULL,
  `pliegue_triceps` decimal(5,2) DEFAULT NULL,
  `pliegue_subescapular` decimal(5,2) DEFAULT NULL,
  `pliegue_biceps` decimal(5,2) DEFAULT NULL,
  `pliegue_cresta_iliaca` decimal(5,2) DEFAULT NULL,
  `pliegue_supraespinal` decimal(5,2) DEFAULT NULL,
  `pliegue_abdominal` decimal(5,2) DEFAULT NULL,
  `pliegue_muslo_medio` decimal(5,2) DEFAULT NULL,
  `pliegue_pierna_medial` decimal(5,2) DEFAULT NULL,
  `perimetro_brazo_relajado` decimal(6,2) DEFAULT NULL,
  `perimetro_brazo_contraido` decimal(6,2) DEFAULT NULL,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  UNIQUE KEY `uq_eval_antropometria_consulta` (`id_consulta`),
  CONSTRAINT `fk_antropometrica_consulta` FOREIGN KEY (`id_consulta`) REFERENCES `consultas` (`id_consulta`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `composicion_segmentada`
-- --------------------------------------------------------
CREATE TABLE `composicion_segmentada` (
  `id_segmentada` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_consulta` int(11) NOT NULL,
  `tipo_medicion` enum('Grasa','Musculo') NOT NULL,
  `total` decimal(5,2) DEFAULT NULL,
  `mano_izquierda` decimal(5,2) DEFAULT NULL,
  `mano_derecha` decimal(5,2) DEFAULT NULL,
  `pierna_derecha` decimal(5,2) DEFAULT NULL,
  `pierna_izquierda` decimal(5,2) DEFAULT NULL,
  `tronco` decimal(5,2) DEFAULT NULL,
  `calificacion_grasa` varchar(50) DEFAULT NULL,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  UNIQUE KEY `uq_composicion_consulta_tipo` (`id_consulta`,`tipo_medicion`),
  CONSTRAINT `fk_composicion_consulta` FOREIGN KEY (`id_consulta`) REFERENCES `consultas` (`id_consulta`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `evaluacion_bioquimica`
-- --------------------------------------------------------
CREATE TABLE `evaluacion_bioquimica` (
  `id_evaluacion` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_consulta` int(11) NOT NULL,
  `indice_homa` decimal(6,2) DEFAULT NULL,
  `hb1ac_glicosilada` decimal(6,2) DEFAULT NULL,
  `vit_d` decimal(6,2) DEFAULT NULL,
  `glicemia` decimal(6,2) DEFAULT NULL,
  `insulinemia` decimal(6,2) DEFAULT NULL,
  `hematocrito` decimal(6,2) DEFAULT NULL,
  `hemoglobina` decimal(6,2) DEFAULT NULL,
  `albumina` decimal(6,2) DEFAULT NULL,
  `acido_urico` decimal(6,2) DEFAULT NULL,
  `trigliceridos` decimal(6,2) DEFAULT NULL,
  `colesterol_total` decimal(6,2) DEFAULT NULL,
  `colesterol_hdl` decimal(6,2) DEFAULT NULL,
  `colesterol_ldl` decimal(6,2) DEFAULT NULL,
  `intolerancias_alimentarias` varchar(255) DEFAULT NULL,
  `alergias` varchar(255) DEFAULT NULL,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  UNIQUE KEY `uq_evaluacion_bioquimica_consulta` (`id_consulta`),
  CONSTRAINT `fk_bioquimica_consulta` FOREIGN KEY (`id_consulta`) REFERENCES `consultas` (`id_consulta`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `evaluacion_dietetica`
-- --------------------------------------------------------
CREATE TABLE `evaluacion_dietetica` (
  `id_evaluacion` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_consulta` int(11) NOT NULL,
  `tiempos_comida` enum('1-2','3-4','5-6') DEFAULT NULL,
  `lugar_consumo` enum('Casa','Fuera','Ambos') DEFAULT NULL,
  `quien_prepara` varchar(100) DEFAULT NULL,
  `calificacion_apetito` enum('Bueno','Regular','Malo') DEFAULT NULL,
  `tipo_grasas` varchar(100) DEFAULT NULL,
  `coccion_asado` tinyint(1) DEFAULT 0,
  `coccion_fritura` tinyint(1) DEFAULT 0,
  `coccion_hervido` tinyint(1) DEFAULT 0,
  `coccion_plancha` tinyint(1) DEFAULT 0,
  `coccion_vapor` tinyint(1) DEFAULT 0,
  `coccion_freidora_aire` tinyint(1) DEFAULT 0,
  `agrega_sal` tinyint(1) DEFAULT 0,
  `consume_azucar` tinyint(1) DEFAULT 0,
  `utiliza_edulcorante` tinyint(1) DEFAULT 0,
  `dietas_anteriores` text DEFAULT NULL,
  `consume_agua` tinyint(1) DEFAULT 0,
  `cantidad_agua` varchar(100) DEFAULT NULL,
  `alimentos_no_consume` text DEFAULT NULL,
  `alimentos_preferidos` text DEFAULT NULL,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  UNIQUE KEY `uq_evaluacion_dietetica_consulta` (`id_consulta`),
  CONSTRAINT `fk_dietetica_consulta` FOREIGN KEY (`id_consulta`) REFERENCES `consultas` (`id_consulta`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `frecuencia_alimentos`
-- --------------------------------------------------------
CREATE TABLE `frecuencia_alimentos` (
  `id_frecuencia` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_consulta` int(11) NOT NULL,
  `alimento` varchar(100) NOT NULL,
  `frecuencia` varchar(100) DEFAULT NULL,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_frecuencia_consulta` FOREIGN KEY (`id_consulta`) REFERENCES `consultas` (`id_consulta`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `dietas_recetas`
-- --------------------------------------------------------
CREATE TABLE `dietas_recetas` (
  `id_dieta` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_consulta` int(11) NOT NULL,
  `id_paciente` int(11) NOT NULL,
  `fecha_inicio` date DEFAULT NULL,
  `fecha_fin` date DEFAULT NULL,
  `total_calorias` int(11) DEFAULT NULL,
  `comida_1_desayuno` text DEFAULT NULL,
  `comida_2_merienda_manana` text DEFAULT NULL,
  `comida_3_almuerzo` text DEFAULT NULL,
  `comida_4_merienda_tarde` text DEFAULT NULL,
  `comida_5_cena` text DEFAULT NULL,
  `indicaciones_adicionales` text DEFAULT NULL,
  `creado_por` int(11) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_por` int(11) DEFAULT NULL,
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_dietas_consulta` FOREIGN KEY (`id_consulta`) REFERENCES `consultas` (`id_consulta`) ON DELETE CASCADE,
  CONSTRAINT `fk_dietas_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `pacientes` (`id_paciente`) ON DELETE CASCADE,
  CONSTRAINT `fk_dietas_creado_por` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL,
  CONSTRAINT `fk_dietas_actualizado_por` FOREIGN KEY (`actualizado_por`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `compania_direcciones`
-- --------------------------------------------------------
CREATE TABLE `compania_direcciones` (
  `id_direccion` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_compania` int(11) NOT NULL,
  `tipo_direccion` enum('MATRIZ','SUCURSAL','OTRA') DEFAULT 'MATRIZ',
  `es_principal` tinyint(1) DEFAULT 1,
  `id_provincia` int(11) NOT NULL,
  `id_canton` int(11) NOT NULL,
  `id_distrito` int(11) NOT NULL,
  `id_barrio` int(11) DEFAULT NULL,
  `otras_senas` varchar(250) NOT NULL,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_comp_dir_compania` FOREIGN KEY (`id_compania`) REFERENCES `companias` (`id_compania`) ON DELETE CASCADE,
  CONSTRAINT `fk_comp_dir_provincia` FOREIGN KEY (`id_provincia`) REFERENCES `provincias` (`id_provincia`),
  CONSTRAINT `fk_comp_dir_canton` FOREIGN KEY (`id_canton`) REFERENCES `cantones` (`id_canton`),
  CONSTRAINT `fk_comp_dir_distrito` FOREIGN KEY (`id_distrito`) REFERENCES `distritos` (`id_distrito`),
  CONSTRAINT `fk_comp_dir_barrio` FOREIGN KEY (`id_barrio`) REFERENCES `barrios` (`id_barrio`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `compania_telefonos`
-- --------------------------------------------------------
CREATE TABLE `compania_telefonos` (
  `id_telefono` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_compania` int(11) NOT NULL,
  `tipo_telefono` enum('MOVIL','OFICINA','WHATSAPP') DEFAULT 'OFICINA',
  `codigo_pais` varchar(5) DEFAULT '506',
  `numero` varchar(20) NOT NULL,
  `es_principal` tinyint(1) DEFAULT 1,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_comp_tel_compania` FOREIGN KEY (`id_compania`) REFERENCES `companias` (`id_compania`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `compania_hacienda_config`
-- --------------------------------------------------------
CREATE TABLE `compania_hacienda_config` (
  `id_compania` int(11) NOT NULL PRIMARY KEY,
  `ambiente` enum('SANDBOX','PRODUCCION') NOT NULL DEFAULT 'SANDBOX',
  `usuario_atv` varchar(50) DEFAULT NULL,
  `password_atv_enc` varbinary(512) DEFAULT NULL,
  `certificado_p12_enc` longblob DEFAULT NULL,
  `certificado_password_enc` varbinary(512) DEFAULT NULL,
  `certificado_nombre_archivo` varchar(255) DEFAULT NULL,
  `certificado_vence_en` date DEFAULT NULL,
  `actualizado_por` int(11) DEFAULT NULL,
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  CONSTRAINT `fk_hacienda_compania` FOREIGN KEY (`id_compania`) REFERENCES `companias` (`id_compania`) ON DELETE CASCADE,
  CONSTRAINT `fk_hacienda_actualizado_por` FOREIGN KEY (`actualizado_por`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `servicios`
-- --------------------------------------------------------
CREATE TABLE `servicios` (
  `id_servicio` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_compania` int(11) NOT NULL,
  `nombre` varchar(150) NOT NULL,
  `codigo_cabys` varchar(13) DEFAULT NULL COMMENT 'Catálogo de Bienes y Servicios de Hacienda',
  `precio` decimal(10,2) NOT NULL,
  `porcentaje_iva` decimal(5,2) DEFAULT NULL COMMENT 'Si es NULL se usa companias.iva_por_defecto',
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  CONSTRAINT `fk_servicios_compania` FOREIGN KEY (`id_compania`) REFERENCES `companias` (`id_compania`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `facturas`
-- --------------------------------------------------------
CREATE TABLE `facturas` (
  `id_factura` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_compania` int(11) NOT NULL,
  `id_consulta` int(11) NOT NULL,
  `id_paciente` int(11) NOT NULL,
  `consecutivo` varchar(20) NOT NULL COMMENT 'sucursal(3)+terminal(5)+tipo_doc(2)+numero(10)',
  `clave` varchar(50) NOT NULL COMMENT 'Clave numérica de 50 dígitos (formato Hacienda)',
  `fecha_emision` datetime NOT NULL DEFAULT current_timestamp(),
  `condicion_venta` enum('CONTADO','CREDITO','OTROS') NOT NULL DEFAULT 'CONTADO',
  `medio_pago` enum('EFECTIVO','TARJETA','TRANSFERENCIA','SINPE','OTRO') NOT NULL DEFAULT 'EFECTIVO',
  `moneda` char(3) NOT NULL DEFAULT 'CRC',
  `subtotal` decimal(12,2) NOT NULL,
  `total_descuento` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_iva` decimal(12,2) NOT NULL,
  `total_comprobante` decimal(12,2) NOT NULL,
  `estado_hacienda` enum('BORRADOR','PENDIENTE_ENVIO','ACEPTADO','RECHAZADO') NOT NULL DEFAULT 'BORRADOR',
  `xml_firmado` longtext DEFAULT NULL,
  `respuesta_hacienda` text DEFAULT NULL,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  `creado_por` int(11) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_por` int(11) DEFAULT NULL,
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  UNIQUE KEY `uq_facturas_compania_consecutivo` (`id_compania`,`consecutivo`),
  UNIQUE KEY `uq_facturas_clave` (`clave`),
  UNIQUE KEY `uq_facturas_consulta` (`id_consulta`),
  CONSTRAINT `fk_facturas_compania` FOREIGN KEY (`id_compania`) REFERENCES `companias` (`id_compania`),
  CONSTRAINT `fk_facturas_consulta` FOREIGN KEY (`id_consulta`) REFERENCES `consultas` (`id_consulta`),
  CONSTRAINT `fk_facturas_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `pacientes` (`id_paciente`),
  CONSTRAINT `fk_facturas_creado_por` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL,
  CONSTRAINT `fk_facturas_actualizado_por` FOREIGN KEY (`actualizado_por`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `factura_lineas`
-- --------------------------------------------------------
CREATE TABLE `factura_lineas` (
  `id_linea` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_factura` int(11) NOT NULL,
  `id_servicio` int(11) DEFAULT NULL,
  `detalle` varchar(200) NOT NULL,
  `codigo_cabys` varchar(13) DEFAULT NULL,
  `cantidad` decimal(10,2) NOT NULL DEFAULT 1.00,
  `precio_unitario` decimal(10,2) NOT NULL,
  `porcentaje_iva` decimal(5,2) NOT NULL DEFAULT 0.00,
  `monto_iva` decimal(10,2) NOT NULL DEFAULT 0.00,
  `monto_total` decimal(10,2) NOT NULL,
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_lineas_factura` FOREIGN KEY (`id_factura`) REFERENCES `facturas` (`id_factura`) ON DELETE CASCADE,
  CONSTRAINT `fk_lineas_servicio` FOREIGN KEY (`id_servicio`) REFERENCES `servicios` (`id_servicio`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para la tabla `notificaciones_reevaluacion`
-- --------------------------------------------------------
CREATE TABLE `notificaciones_reevaluacion` (
  `id_notificacion` int(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `id_compania` int(11) NOT NULL,
  `id_paciente` int(11) NOT NULL,
  `id_consulta_previa` int(11) DEFAULT NULL,
  `fecha_programada` date NOT NULL,
  `medio_contacto` enum('WHATSAPP','EMAIL','TELEFONO') DEFAULT 'WHATSAPP',
  `mensaje_personalizado` text DEFAULT NULL,
  `estado_notificacion` enum('PENDIENTE','ENVIADA','RESPONDIDA','CANCELADA') DEFAULT 'PENDIENTE',
  `creado_por` int(11) DEFAULT NULL,
  `creado_en` timestamp NOT NULL DEFAULT current_timestamp(),
  `actualizado_por` int(11) DEFAULT NULL,
  `actualizado_en` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `estado` tinyint(1) NOT NULL DEFAULT 1,
  CONSTRAINT `fk_notif_compania` FOREIGN KEY (`id_compania`) REFERENCES `companias` (`id_compania`),
  CONSTRAINT `fk_notif_paciente` FOREIGN KEY (`id_paciente`) REFERENCES `pacientes` (`id_paciente`) ON DELETE CASCADE,
  CONSTRAINT `fk_notif_consulta` FOREIGN KEY (`id_consulta_previa`) REFERENCES `consultas` (`id_consulta`) ON DELETE SET NULL,
  CONSTRAINT `fk_notif_creado_por` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL,
  CONSTRAINT `fk_notif_actualizado_por` FOREIGN KEY (`actualizado_por`) REFERENCES `usuarios` (`id_usuario`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;


-- ============================================================================
-- INSERCIÓN DE VALORES Y CATÁLOGOS INICIALES
-- ============================================================================

-- 1. Provincias (lista oficial completa: 7 provincias)
INSERT INTO `provincias` (`id_provincia`, `cod_hacienda`, `nombre`, `estado`) VALUES
(1, '01', 'San José', 1),
(2, '02', 'Alajuela', 1),
(3, '03', 'Cartago', 1),
(4, '04', 'Heredia', 1),
(5, '05', 'Guanacaste', 1),
(6, '06', 'Puntarenas', 1),
(7, '07', 'Limón', 1);

-- 2. Cantones (lista oficial completa: 84 cantones, fuente Registro Nacional/IGN/INEC,
-- cotejada contra el catálogo de Hacienda "Codificacionubicacion_V4.4")
INSERT INTO `cantones` (`id_canton`, `id_provincia`, `cod_hacienda`, `nombre`, `estado`) VALUES
(101, 1, '01', 'San José', 1),
(102, 1, '02', 'Escazú', 1),
(103, 1, '03', 'Desamparados', 1),
(104, 1, '04', 'Puriscal', 1),
(105, 1, '05', 'Tarrazú', 1),
(106, 1, '06', 'Aserrí', 1),
(107, 1, '07', 'Mora', 1),
(108, 1, '08', 'Goicoechea', 1),
(109, 1, '09', 'Santa Ana', 1),
(110, 1, '10', 'Alajuelita', 1),
(111, 1, '11', 'Vázquez de Coronado', 1),
(112, 1, '12', 'Acosta', 1),
(113, 1, '13', 'Tibás', 1),
(114, 1, '14', 'Moravia', 1),
(115, 1, '15', 'Montes de Oca', 1),
(116, 1, '16', 'Turrubares', 1),
(117, 1, '17', 'Dota', 1),
(118, 1, '18', 'Curridabat', 1),
(119, 1, '19', 'Pérez Zeledón', 1),
(120, 1, '20', 'León Cortés Castro', 1),
(201, 2, '01', 'Alajuela', 1),
(202, 2, '02', 'San Ramón', 1),
(203, 2, '03', 'Grecia', 1),
(204, 2, '04', 'San Mateo', 1),
(205, 2, '05', 'Atenas', 1),
(206, 2, '06', 'Naranjo', 1),
(207, 2, '07', 'Palmares', 1),
(208, 2, '08', 'Poás', 1),
(209, 2, '09', 'Orotina', 1),
(210, 2, '10', 'San Carlos', 1),
(211, 2, '11', 'Zarcero', 1),
(212, 2, '12', 'Sarchí', 1),
(213, 2, '13', 'Upala', 1),
(214, 2, '14', 'Los Chiles', 1),
(215, 2, '15', 'Guatuso', 1),
(216, 2, '16', 'Río Cuarto', 1),
(301, 3, '01', 'Cartago', 1),
(302, 3, '02', 'Paraíso', 1),
(303, 3, '03', 'La Unión', 1),
(304, 3, '04', 'Jiménez', 1),
(305, 3, '05', 'Turrialba', 1),
(306, 3, '06', 'Alvarado', 1),
(307, 3, '07', 'Oreamuno', 1),
(308, 3, '08', 'El Guarco', 1),
(401, 4, '01', 'Heredia', 1),
(402, 4, '02', 'Barva', 1),
(403, 4, '03', 'Santo Domingo', 1),
(404, 4, '04', 'Santa Bárbara', 1),
(405, 4, '05', 'San Rafael', 1),
(406, 4, '06', 'San Isidro', 1),
(407, 4, '07', 'Belén', 1),
(408, 4, '08', 'Flores', 1),
(409, 4, '09', 'San Pablo', 1),
(410, 4, '10', 'Sarapiquí', 1),
(501, 5, '01', 'Liberia', 1),
(502, 5, '02', 'Nicoya', 1),
(503, 5, '03', 'Santa Cruz', 1),
(504, 5, '04', 'Bagaces', 1),
(505, 5, '05', 'Carrillo', 1),
(506, 5, '06', 'Cañas', 1),
(507, 5, '07', 'Abangares', 1),
(508, 5, '08', 'Tilarán', 1),
(509, 5, '09', 'Nandayure', 1),
(510, 5, '10', 'La Cruz', 1),
(511, 5, '11', 'Hojancha', 1),
(601, 6, '01', 'Puntarenas', 1),
(602, 6, '02', 'Esparza', 1),
(603, 6, '03', 'Buenos Aires', 1),
(604, 6, '04', 'Montes de Oro', 1),
(605, 6, '05', 'Osa', 1),
(606, 6, '06', 'Quepos', 1),
(607, 6, '07', 'Golfito', 1),
(608, 6, '08', 'Coto Brus', 1),
(609, 6, '09', 'Parrita', 1),
(610, 6, '10', 'Corredores', 1),
(611, 6, '11', 'Garabito', 1),
(612, 6, '12', 'Monteverde', 1),
(613, 6, '13', 'Puerto Jiménez', 1),
(701, 7, '01', 'Limón', 1),
(702, 7, '02', 'Pococí', 1),
(703, 7, '03', 'Siquirres', 1),
(704, 7, '04', 'Talamanca', 1),
(705, 7, '05', 'Matina', 1),
(706, 7, '06', 'Guácimo', 1);

-- 3. Distritos (lista oficial completa: 494 distritos, misma fuente y cotejo que cantones)
INSERT INTO `distritos` (`id_distrito`, `id_canton`, `cod_hacienda`, `nombre`, `estado`) VALUES
(10101, 101, '01', 'Carmen', 1),
(10102, 101, '02', 'Merced', 1),
(10103, 101, '03', 'Hospital', 1),
(10104, 101, '04', 'Catedral', 1),
(10105, 101, '05', 'Zapote', 1),
(10106, 101, '06', 'San Francisco de Dos Ríos', 1),
(10107, 101, '07', 'Uruca', 1),
(10108, 101, '08', 'Mata Redonda', 1),
(10109, 101, '09', 'Pavas', 1),
(10110, 101, '10', 'Hatillo', 1),
(10111, 101, '11', 'San Sebastián', 1),
(10201, 102, '01', 'Escazú', 1),
(10202, 102, '02', 'San Antonio', 1),
(10203, 102, '03', 'San Rafael', 1),
(10301, 103, '01', 'Desamparados', 1),
(10302, 103, '02', 'San Miguel', 1),
(10303, 103, '03', 'San Juan de Dios', 1),
(10304, 103, '04', 'San Rafael Arriba', 1),
(10305, 103, '05', 'San Antonio', 1),
(10306, 103, '06', 'Frailes', 1),
(10307, 103, '07', 'Patarrá', 1),
(10308, 103, '08', 'San Cristobal', 1),
(10309, 103, '09', 'Rosario', 1),
(10310, 103, '10', 'Damas', 1),
(10311, 103, '11', 'San Rafael Abajo', 1),
(10312, 103, '12', 'Gravilias', 1),
(10313, 103, '13', 'Los Guido', 1),
(10401, 104, '01', 'Santiago', 1),
(10402, 104, '02', 'Mercedes Sur', 1),
(10403, 104, '03', 'Barbacoas', 1),
(10404, 104, '04', 'Grifo Alto', 1),
(10405, 104, '05', 'San Rafael', 1),
(10406, 104, '06', 'Candelarita', 1),
(10407, 104, '07', 'Desamparaditos', 1),
(10408, 104, '08', 'San Antonio', 1),
(10409, 104, '09', 'Chires', 1),
(10501, 105, '01', 'San Marcos', 1),
(10502, 105, '02', 'San Lorenzo', 1),
(10503, 105, '03', 'San Carlos', 1),
(10601, 106, '01', 'Aserrí', 1),
(10602, 106, '02', 'Tarbaca', 1),
(10603, 106, '03', 'Vuelta de Jorco', 1),
(10604, 106, '04', 'San Gabriel', 1),
(10605, 106, '05', 'Legua', 1),
(10606, 106, '06', 'Monterrey', 1),
(10607, 106, '07', 'Salitrillos', 1),
(10701, 107, '01', 'Colón', 1),
(10702, 107, '02', 'Guayabo', 1),
(10703, 107, '03', 'Tabarcia', 1),
(10704, 107, '04', 'Piedras Negras', 1),
(10705, 107, '05', 'Picagres', 1),
(10706, 107, '06', 'Jaris', 1),
(10707, 107, '07', 'Quitirrisí', 1),
(10801, 108, '01', 'Guadalupe', 1),
(10802, 108, '02', 'San Francisco', 1),
(10803, 108, '03', 'Calle Blancos', 1),
(10804, 108, '04', 'Mata de Plátano', 1),
(10805, 108, '05', 'Ipís', 1),
(10806, 108, '06', 'Rancho Redondo', 1),
(10807, 108, '07', 'Purral', 1),
(10901, 109, '01', 'Santa Ana', 1),
(10902, 109, '02', 'Salitral', 1),
(10903, 109, '03', 'Pozos', 1),
(10904, 109, '04', 'Uruca', 1),
(10905, 109, '05', 'Piedades', 1),
(10906, 109, '06', 'Brasil', 1),
(11001, 110, '01', 'Alajuelita', 1),
(11002, 110, '02', 'San Josecito', 1),
(11003, 110, '03', 'San Antonio', 1),
(11004, 110, '04', 'Concepción', 1),
(11005, 110, '05', 'San Felipe', 1),
(11101, 111, '01', 'San Isidro', 1),
(11102, 111, '02', 'San Rafael', 1),
(11103, 111, '03', 'Dulce Nombre de Jesús', 1),
(11104, 111, '04', 'Patalillo', 1),
(11105, 111, '05', 'Cascajal', 1),
(11201, 112, '01', 'San Ignacio', 1),
(11202, 112, '02', 'Guaitil', 1),
(11203, 112, '03', 'Palmichal', 1),
(11204, 112, '04', 'Cangrejal', 1),
(11205, 112, '05', 'Sabanillas', 1),
(11301, 113, '01', 'San Juan', 1),
(11302, 113, '02', 'Cinco Esquinas', 1),
(11303, 113, '03', 'Anselmo Llorente', 1),
(11304, 113, '04', 'León XIII', 1),
(11305, 113, '05', 'Colima', 1),
(11401, 114, '01', 'San Vicente', 1),
(11402, 114, '02', 'San Jerónimo', 1),
(11403, 114, '03', 'La Trinidad', 1),
(11501, 115, '01', 'San Pedro', 1),
(11502, 115, '02', 'Sabanilla', 1),
(11503, 115, '03', 'Mercedes', 1),
(11504, 115, '04', 'San Rafael', 1),
(11601, 116, '01', 'San Pablo', 1),
(11602, 116, '02', 'San Pedro', 1),
(11603, 116, '03', 'San Juan de Mata', 1),
(11604, 116, '04', 'San Luis', 1),
(11605, 116, '05', 'Carara', 1),
(11701, 117, '01', 'Santa María', 1),
(11702, 117, '02', 'Jardín', 1),
(11703, 117, '03', 'Copey', 1),
(11801, 118, '01', 'Curridabat', 1),
(11802, 118, '02', 'Granadilla', 1),
(11803, 118, '03', 'Sánchez', 1),
(11804, 118, '04', 'Tirrases', 1),
(11901, 119, '01', 'San Isidro de El General', 1),
(11902, 119, '02', 'El General', 1),
(11903, 119, '03', 'Daniel Flores', 1),
(11904, 119, '04', 'Rivas', 1),
(11905, 119, '05', 'San Pedro', 1),
(11906, 119, '06', 'Platanares', 1),
(11907, 119, '07', 'Pejivalle', 1),
(11908, 119, '08', 'Cajón', 1),
(11909, 119, '09', 'Barú', 1),
(11910, 119, '10', 'Río Nuevo', 1),
(11911, 119, '11', 'Páramo', 1),
(11912, 119, '12', 'La Amistad', 1),
(12001, 120, '01', 'San Pablo', 1),
(12002, 120, '02', 'San Andrés', 1),
(12003, 120, '03', 'Llano Bonito', 1),
(12004, 120, '04', 'San Isidro', 1),
(12005, 120, '05', 'Santa Cruz', 1),
(12006, 120, '06', 'San Antonio', 1),
(20101, 201, '01', 'Alajuela', 1),
(20102, 201, '02', 'San José', 1),
(20103, 201, '03', 'Carrizal', 1),
(20104, 201, '04', 'San Antonio', 1),
(20105, 201, '05', 'Guácima', 1),
(20106, 201, '06', 'San Isidro', 1),
(20107, 201, '07', 'Sabanilla', 1),
(20108, 201, '08', 'San Rafael', 1),
(20109, 201, '09', 'Río Segundo', 1),
(20110, 201, '10', 'Desamparados', 1),
(20111, 201, '11', 'Turrúcares', 1),
(20112, 201, '12', 'Tambor', 1),
(20113, 201, '13', 'Garita', 1),
(20114, 201, '14', 'Sarapiquí', 1),
(20201, 202, '01', 'San Ramón', 1),
(20202, 202, '02', 'Santiago', 1),
(20203, 202, '03', 'San Juan', 1),
(20204, 202, '04', 'Piedades Norte', 1),
(20205, 202, '05', 'Piedades Sur', 1),
(20206, 202, '06', 'San Rafael', 1),
(20207, 202, '07', 'San Isidro', 1),
(20208, 202, '08', 'Ángeles', 1),
(20209, 202, '09', 'Alfaro', 1),
(20210, 202, '10', 'Volio', 1),
(20211, 202, '11', 'Concepción', 1),
(20212, 202, '12', 'Zapotal', 1),
(20213, 202, '13', 'Peñas Blancas', 1),
(20214, 202, '14', 'San Lorenzo', 1),
(20301, 203, '01', 'Grecia', 1),
(20302, 203, '02', 'San Isidro', 1),
(20303, 203, '03', 'San José', 1),
(20304, 203, '04', 'San Roque', 1),
(20305, 203, '05', 'Tacares', 1),
(20306, 203, '06', 'Puente de Piedra', 1),
(20307, 203, '07', 'Bolívar', 1),
(20401, 204, '01', 'San Mateo', 1),
(20402, 204, '02', 'Desmonte', 1),
(20403, 204, '03', 'Jesús María', 1),
(20404, 204, '04', 'Labrador', 1),
(20501, 205, '01', 'Atenas', 1),
(20502, 205, '02', 'Jesús', 1),
(20503, 205, '03', 'Mercedes', 1),
(20504, 205, '04', 'San Isidro', 1),
(20505, 205, '05', 'Concepción', 1),
(20506, 205, '06', 'San José', 1),
(20507, 205, '07', 'Santa Eulalia', 1),
(20508, 205, '08', 'Escobal', 1),
(20601, 206, '01', 'Naranjo', 1),
(20602, 206, '02', 'San Miguel', 1),
(20603, 206, '03', 'San José', 1),
(20604, 206, '04', 'Cirrí Sur', 1),
(20605, 206, '05', 'San Jerónimo', 1),
(20606, 206, '06', 'San Juan', 1),
(20607, 206, '07', 'El Rosario', 1),
(20608, 206, '08', 'Palmitos', 1),
(20701, 207, '01', 'Palmares', 1),
(20702, 207, '02', 'Zaragoza', 1),
(20703, 207, '03', 'Buenos Aires', 1),
(20704, 207, '04', 'Santiago', 1),
(20705, 207, '05', 'Candelaria', 1),
(20706, 207, '06', 'Esquipulas', 1),
(20707, 207, '07', 'La Granja', 1),
(20801, 208, '01', 'San Pedro', 1),
(20802, 208, '02', 'San Juan', 1),
(20803, 208, '03', 'San Rafael', 1),
(20804, 208, '04', 'Carrillos', 1),
(20805, 208, '05', 'Sabana Redonda', 1),
(20901, 209, '01', 'Orotina', 1),
(20902, 209, '02', 'El Mastate', 1),
(20903, 209, '03', 'Hacienda Vieja', 1),
(20904, 209, '04', 'Coyolar', 1),
(20905, 209, '05', 'La Ceiba', 1),
(21001, 210, '01', 'Quesada', 1),
(21002, 210, '02', 'Florencia', 1),
(21003, 210, '03', 'Buenavista', 1),
(21004, 210, '04', 'Aguas Zarcas', 1),
(21005, 210, '05', 'Venecia', 1),
(21006, 210, '06', 'Pital', 1),
(21007, 210, '07', 'La Fortuna', 1),
(21008, 210, '08', 'La Tigra', 1),
(21009, 210, '09', 'La Palmera', 1),
(21010, 210, '10', 'Venado', 1),
(21011, 210, '11', 'Cutris', 1),
(21012, 210, '12', 'Monterrey', 1),
(21013, 210, '13', 'Pocosol', 1),
(21101, 211, '01', 'Zarcero', 1),
(21102, 211, '02', 'Laguna', 1),
(21103, 211, '03', 'Tapesco', 1),
(21104, 211, '04', 'Guadalupe', 1),
(21105, 211, '05', 'Palmira', 1),
(21106, 211, '06', 'Zapote', 1),
(21107, 211, '07', 'Brisas', 1),
(21201, 212, '01', 'Sarchí Norte', 1),
(21202, 212, '02', 'Sarchí Sur', 1),
(21203, 212, '03', 'Toro Amarillo', 1),
(21204, 212, '04', 'San Pedro', 1),
(21205, 212, '05', 'Rodríguez', 1),
(21301, 213, '01', 'Upala', 1),
(21302, 213, '02', 'Aguas Claras', 1),
(21303, 213, '03', 'San José O Pizote', 1),
(21304, 213, '04', 'Bijagua', 1),
(21305, 213, '05', 'Delicias', 1),
(21306, 213, '06', 'Dos Ríos', 1),
(21307, 213, '07', 'Yolillal', 1),
(21308, 213, '08', 'Canalete', 1),
(21401, 214, '01', 'Los Chiles', 1),
(21402, 214, '02', 'Caño Negro', 1),
(21403, 214, '03', 'El Amparo', 1),
(21404, 214, '04', 'San Jorge', 1),
(21501, 215, '01', 'San Rafael', 1),
(21502, 215, '02', 'Buenavista', 1),
(21503, 215, '03', 'Cote', 1),
(21504, 215, '04', 'Katira', 1),
(21601, 216, '01', 'Río Cuarto', 1),
(21602, 216, '02', 'Santa Rita', 1),
(21603, 216, '03', 'Santa Isabel', 1),
(30101, 301, '01', 'Oriental', 1),
(30102, 301, '02', 'Occidental', 1),
(30103, 301, '03', 'Carmen', 1),
(30104, 301, '04', 'San Nicolás', 1),
(30105, 301, '05', 'Aguacaliente o San Francisco', 1),
(30106, 301, '06', 'Guadalupe o Arenilla', 1),
(30107, 301, '07', 'Corralillo', 1),
(30108, 301, '08', 'Tierra Blanca', 1),
(30109, 301, '09', 'Dulce Nombre', 1),
(30110, 301, '10', 'Llano Grande', 1),
(30111, 301, '11', 'Quebradilla', 1),
(30201, 302, '01', 'Paraíso', 1),
(30202, 302, '02', 'Santiago', 1),
(30203, 302, '03', 'Orosi', 1),
(30204, 302, '04', 'Cachí', 1),
(30205, 302, '05', 'Llanos de Santa Lucía', 1),
(30206, 302, '06', 'Birrisito', 1),
(30301, 303, '01', 'Tres Ríos', 1),
(30302, 303, '02', 'San Diego', 1),
(30303, 303, '03', 'San Juan', 1),
(30304, 303, '04', 'San Rafael', 1),
(30305, 303, '05', 'Concepción', 1),
(30306, 303, '06', 'Dulce Nombre', 1),
(30307, 303, '07', 'San Ramón', 1),
(30308, 303, '08', 'Río Azul', 1),
(30401, 304, '01', 'Juan Viñas', 1),
(30402, 304, '02', 'Tucurrique', 1),
(30403, 304, '03', 'Pejibaye', 1),
(30404, 304, '04', 'La Victoria', 1),
(30501, 305, '01', 'Turrialba', 1),
(30502, 305, '02', 'La Suiza', 1),
(30503, 305, '03', 'Peralta', 1),
(30504, 305, '04', 'Santa Cruz', 1),
(30505, 305, '05', 'Santa Teresita', 1),
(30506, 305, '06', 'Pavones', 1),
(30507, 305, '07', 'Tuis', 1),
(30508, 305, '08', 'Tayutic', 1),
(30509, 305, '09', 'Santa Rosa', 1),
(30510, 305, '10', 'Tres Equis', 1),
(30511, 305, '11', 'La Isabel', 1),
(30512, 305, '12', 'Chirripó', 1),
(30601, 306, '01', 'Pacayas', 1),
(30602, 306, '02', 'Cervantes', 1),
(30603, 306, '03', 'Capellades', 1),
(30701, 307, '01', 'San Rafael', 1),
(30702, 307, '02', 'Cot', 1),
(30703, 307, '03', 'Potrero Cerrado', 1),
(30704, 307, '04', 'Cipreses', 1),
(30705, 307, '05', 'Santa Rosa', 1),
(30801, 308, '01', 'El Tejar', 1),
(30802, 308, '02', 'San Isidro', 1),
(30803, 308, '03', 'Tobosi', 1),
(30804, 308, '04', 'Patio de Agua', 1),
(40101, 401, '01', 'Heredia', 1),
(40102, 401, '02', 'Mercedes', 1),
(40103, 401, '03', 'San Francisco', 1),
(40104, 401, '04', 'Ulloa', 1),
(40105, 401, '05', 'Varablanca', 1),
(40201, 402, '01', 'Barva', 1),
(40202, 402, '02', 'San Pedro', 1),
(40203, 402, '03', 'San Pablo', 1),
(40204, 402, '04', 'San Roque', 1),
(40205, 402, '05', 'Santa Lucía', 1),
(40206, 402, '06', 'San José de la Montaña', 1),
(40207, 402, '07', 'Puente Salas', 1),
(40301, 403, '01', 'Santo Domingo', 1),
(40302, 403, '02', 'San Vicente', 1),
(40303, 403, '03', 'San Miguel', 1),
(40304, 403, '04', 'Paracito', 1),
(40305, 403, '05', 'Santo Tomás', 1),
(40306, 403, '06', 'Santa Rosa', 1),
(40307, 403, '07', 'Tures', 1),
(40308, 403, '08', 'Pará', 1),
(40401, 404, '01', 'Santa Bárbara', 1),
(40402, 404, '02', 'San Pedro', 1),
(40403, 404, '03', 'San Juan', 1),
(40404, 404, '04', 'Jesús', 1),
(40405, 404, '05', 'Santo Domingo', 1),
(40406, 404, '06', 'Purabá', 1),
(40501, 405, '01', 'San Rafael', 1),
(40502, 405, '02', 'San Josecito', 1),
(40503, 405, '03', 'Santiago', 1),
(40504, 405, '04', 'Ángeles', 1),
(40505, 405, '05', 'Concepción', 1),
(40601, 406, '01', 'San Isidro', 1),
(40602, 406, '02', 'San José', 1),
(40603, 406, '03', 'Concepción', 1),
(40604, 406, '04', 'San Francisco', 1),
(40701, 407, '01', 'San Antonio', 1),
(40702, 407, '02', 'La Ribera', 1),
(40703, 407, '03', 'La Asunción', 1),
(40801, 408, '01', 'San Joaquín', 1),
(40802, 408, '02', 'Barrantes', 1),
(40803, 408, '03', 'Llorente', 1),
(40901, 409, '01', 'San Pablo', 1),
(40902, 409, '02', 'Rincón de Sabanilla', 1),
(41001, 410, '01', 'Puerto Viejo', 1),
(41002, 410, '02', 'La Virgen', 1),
(41003, 410, '03', 'Las Horquetas', 1),
(41004, 410, '04', 'Llanuras del Gaspar', 1),
(41005, 410, '05', 'Cureña', 1),
(50101, 501, '01', 'Liberia', 1),
(50102, 501, '02', 'Cañas Dulces', 1),
(50103, 501, '03', 'Mayorga', 1),
(50104, 501, '04', 'Nacascolo', 1),
(50105, 501, '05', 'Curubandé', 1),
(50201, 502, '01', 'Nicoya', 1),
(50202, 502, '02', 'Mansión', 1),
(50203, 502, '03', 'San Antonio', 1),
(50204, 502, '04', 'Quebrada Honda', 1),
(50205, 502, '05', 'Sámara', 1),
(50206, 502, '06', 'Nosara', 1),
(50207, 502, '07', 'Belén de Nosarita', 1),
(50301, 503, '01', 'Santa Cruz', 1),
(50302, 503, '02', 'Bolsón', 1),
(50303, 503, '03', 'Veintisiete de Abril', 1),
(50304, 503, '04', 'Tempate', 1),
(50305, 503, '05', 'Cartagena', 1),
(50306, 503, '06', 'Cuajiniquil', 1),
(50307, 503, '07', 'Diriá', 1),
(50308, 503, '08', 'Cabo Velas', 1),
(50309, 503, '09', 'Tamarindo', 1),
(50401, 504, '01', 'Bagaces', 1),
(50402, 504, '02', 'La Fortuna', 1),
(50403, 504, '03', 'Mogote', 1),
(50404, 504, '04', 'Río Naranjo', 1),
(50405, 504, '05', 'Pijije', 1),
(50501, 505, '01', 'Filadelfia', 1),
(50502, 505, '02', 'Palmira', 1),
(50503, 505, '03', 'Sardinal', 1),
(50504, 505, '04', 'Belén', 1),
(50601, 506, '01', 'Cañas', 1),
(50602, 506, '02', 'Palmira', 1),
(50603, 506, '03', 'San Miguel', 1),
(50604, 506, '04', 'Bebedero', 1),
(50605, 506, '05', 'Porozal', 1),
(50701, 507, '01', 'Las Juntas', 1),
(50702, 507, '02', 'Sierra', 1),
(50703, 507, '03', 'San Juan', 1),
(50704, 507, '04', 'Colorado', 1),
(50801, 508, '01', 'Tilarán', 1),
(50802, 508, '02', 'Quebrada Grande', 1),
(50803, 508, '03', 'Tronadora', 1),
(50804, 508, '04', 'Santa Rosa', 1),
(50805, 508, '05', 'Líbano', 1),
(50806, 508, '06', 'Tierras Morenas', 1),
(50807, 508, '07', 'Arenal', 1),
(50808, 508, '08', 'Cabeceras', 1),
(50901, 509, '01', 'Carmona', 1),
(50902, 509, '02', 'Santa Rita', 1),
(50903, 509, '03', 'Zapotal', 1),
(50904, 509, '04', 'San Pablo', 1),
(50905, 509, '05', 'Porvenir', 1),
(50906, 509, '06', 'Bejuco', 1),
(51001, 510, '01', 'La Cruz', 1),
(51002, 510, '02', 'Santa Cecilia', 1),
(51003, 510, '03', 'La Garita', 1),
(51004, 510, '04', 'Santa Elena', 1),
(51101, 511, '01', 'Hojancha', 1),
(51102, 511, '02', 'Monte Romo', 1),
(51103, 511, '03', 'Puerto Carrillo', 1),
(51104, 511, '04', 'Huacas', 1),
(51105, 511, '05', 'Matambú', 1),
(60101, 601, '01', 'Puntarenas', 1),
(60102, 601, '02', 'Pitahaya', 1),
(60103, 601, '03', 'Chomes', 1),
(60104, 601, '04', 'Lepanto', 1),
(60105, 601, '05', 'Paquera', 1),
(60106, 601, '06', 'Manzanillo', 1),
(60107, 601, '07', 'Guacimal', 1),
(60108, 601, '08', 'Barranca', 1),
(60110, 601, '10', 'Isla del Coco', 1),
(60111, 601, '11', 'Cóbano', 1),
(60112, 601, '12', 'Chacarita', 1),
(60113, 601, '13', 'Chira', 1),
(60114, 601, '14', 'Acapulco', 1),
(60115, 601, '15', 'El Roble', 1),
(60116, 601, '16', 'Arancibia', 1),
(60201, 602, '01', 'Espíritu Santo', 1),
(60202, 602, '02', 'San Juan Grande', 1),
(60203, 602, '03', 'Macacona', 1),
(60204, 602, '04', 'San Rafael', 1),
(60205, 602, '05', 'San Jerónimo', 1),
(60206, 602, '06', 'Caldera', 1),
(60301, 603, '01', 'Buenos Aires', 1),
(60302, 603, '02', 'Volcán', 1),
(60303, 603, '03', 'Potrero Grande', 1),
(60304, 603, '04', 'Boruca', 1),
(60305, 603, '05', 'Pilas', 1),
(60306, 603, '06', 'Colinas', 1),
(60307, 603, '07', 'Chánguena', 1),
(60308, 603, '08', 'Biolley', 1),
(60309, 603, '09', 'Brunka', 1),
(60310, 603, '10', 'Cabagra', 1),
(60401, 604, '01', 'Miramar', 1),
(60402, 604, '02', 'La Unión', 1),
(60403, 604, '03', 'San Isidro', 1),
(60501, 605, '01', 'Puerto Cortés', 1),
(60502, 605, '02', 'Palmar', 1),
(60503, 605, '03', 'Sierpe', 1),
(60504, 605, '04', 'Bahía Ballena', 1),
(60505, 605, '05', 'Piedras Blancas', 1),
(60506, 605, '06', 'Bahía Drake', 1),
(60601, 606, '01', 'Quepos', 1),
(60602, 606, '02', 'Savegre', 1),
(60603, 606, '03', 'Naranjito', 1),
(60701, 607, '01', 'Golfito', 1),
(60703, 607, '03', 'Guaycará', 1),
(60704, 607, '04', 'Pavón', 1),
(60801, 608, '01', 'San Vito', 1),
(60802, 608, '02', 'Sabalito', 1),
(60803, 608, '03', 'Aguabuena', 1),
(60804, 608, '04', 'Limoncito', 1),
(60805, 608, '05', 'Pittier', 1),
(60806, 608, '06', 'Gutiérrez Braun', 1),
(60901, 609, '01', 'Parrita', 1),
(61001, 610, '01', 'Corredor', 1),
(61002, 610, '02', 'La Cuesta', 1),
(61003, 610, '03', 'Canoas', 1),
(61004, 610, '04', 'Laurel', 1),
(61101, 611, '01', 'Jacó', 1),
(61102, 611, '02', 'Tárcoles', 1),
(61103, 611, '03', 'Lagunillas', 1),
(61201, 612, '01', 'Monteverde', 1),
(61301, 613, '01', 'Puerto Jiménez', 1),
(70101, 701, '01', 'Limón', 1),
(70102, 701, '02', 'Valle La Estrella', 1),
(70103, 701, '03', 'Río Blanco', 1),
(70104, 701, '04', 'Matama', 1),
(70201, 702, '01', 'Guápiles', 1),
(70202, 702, '02', 'Jiménez', 1),
(70203, 702, '03', 'Rita', 1),
(70204, 702, '04', 'Roxana', 1),
(70205, 702, '05', 'Cariari', 1),
(70206, 702, '06', 'Colorado', 1),
(70207, 702, '07', 'La Colonia', 1),
(70301, 703, '01', 'Siquirres', 1),
(70302, 703, '02', 'Pacuarito', 1),
(70303, 703, '03', 'Florida', 1),
(70304, 703, '04', 'Germania', 1),
(70305, 703, '05', 'El Cairo', 1),
(70306, 703, '06', 'Alegría', 1),
(70307, 703, '07', 'Reventazón', 1),
(70401, 704, '01', 'Bratsi', 1),
(70402, 704, '02', 'Sixaola', 1),
(70403, 704, '03', 'Cahuita', 1),
(70404, 704, '04', 'Telire', 1),
(70501, 705, '01', 'Matina', 1),
(70502, 705, '02', 'Batán', 1),
(70503, 705, '03', 'Carrandí', 1),
(70601, 706, '01', 'Guácimo', 1),
(70602, 706, '02', 'Mercedes', 1),
(70603, 706, '03', 'Pocora', 1),
(70604, 706, '04', 'Río Jiménez', 1),
(70605, 706, '05', 'Duacarí', 1);

-- 4. Clínica / Compañía por defecto
INSERT INTO `companias` (`id_compania`, `nombre_comercial`, `razon_social`, `tipo_identificacion`, `identificacion`, `cod_actividad_economica`, `correo_emisor`, `iva_por_defecto`, `sucursal_hacienda`, `terminal_hacienda`, `siguiente_consecutivo_factura`, `color_primario`, `color_sidebar`, `logo_url`, `estado`) VALUES
(7, 'ELRONUTRI', 'ELIECER ROJAS', '01', '503920984', '71101', 'eliecer.rojas9@gmail.com', 13.00, '001', '00001', 1, '#d27914', '#df9949', 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?auto=format&fit=crop&q=80&w=200', 1);

-- 5. Usuario Administrador por defecto
INSERT INTO `usuarios` (`id_usuario`, `id_compania`, `nombre`, `email`, `password_hash`, `rol`, `activo`, `estado`) VALUES
(8, 7, 'ELRO', 'eliecer.rojas9@gmail.com', '$2b$10$MU3ObQnyNJLbGPvyy6BJ/ujh0tdA.O3LAKcjdmT43VsDarywtx//y', 'ADMIN', 1, 1);

-- 6. Paciente por defecto
INSERT INTO `pacientes` (`id_paciente`, `id_compania`, `nombre_completo`, `fecha_nacimiento`, `edad`, `ocupacion`, `correo_electronico`, `situacion_vivienda`, `fact_tipo_identificacion`, `fact_identificacion`, `fact_nombre`, `fact_correo`, `periodicidad_valoracion`, `proxima_valoracion`, `creado_por`, `estado`) VALUES
(2, 7, 'KENETH ROJAS', '1994-08-13', 32, 'ADUANAS', 'KENETH.ROJAS@HOTMAIL.COM', 'SOLO', '01', '503990811', 'KENETH ROJAS', 'KENETH.ROJAS@HOTMAIL.COM', 'MENSUAL', '2026-08-16', 8, 1);

-- 7. Teléfono de paciente
INSERT INTO `paciente_telefonos` (`id_telefono`, `id_paciente`, `tipo_telefono`, `codigo_pais`, `numero`, `es_principal`, `estado`) VALUES
(2, 2, 'MOVIL', '506', '83037805', 1, 1);

-- 8. Antecedentes familiares por defecto
INSERT INTO `antecedentes_familiares` (`id_paciente`, `obesidad`, `cancer`, `diabetes`, `dislipidemia`, `enfermedad_cardiovascular`, `hipertension`, `enfermedad_respiratoria`, `enfermedad_renal`, `problemas_tiroideos`, `epilepsia`, `artritis_reumatoide`, `problemas_psiquiatricos`, `lupus_inmunologicos`, `otros`, `observaciones`, `estado`) VALUES
(2, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL, 'ABUELOS PATERNOS', 1);

-- 9. Antecedentes personales por defecto
INSERT INTO `antecedentes_personales` (`id_paciente`, `diabetes`, `dislipidemia`, `enfermedad_respiratoria`, `enfermedad_cardiovascular`, `hipertension`, `enfermedad_renal`, `problemas_tiroideos`, `ulceras`, `cancer`, `cirugias`, `depresion`, `sida`, `intolerancia_alimento`, `problemas_dentales`, `problemas_masticacion_deglucion`, `hernia_hiatal`, `reflujo_gastroesofagico`, `gastritis`, `nauseas_frecuentes`, `vomitos`, `colon_irritable`, `estrenimiento`, `diarreas`, `colelitiasis`, `observaciones`, `estado`) VALUES
(2, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL, 0, 0, NULL, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, NULL, 1);

-- 10. Consulta por defecto
INSERT INTO `consultas` (`id_consulta`, `id_paciente`, `id_compania`, `fecha_consulta`, `motivo_expectativas`, `horas_sueno`, `compromiso_cumplir`, `comentarios_nutricionista`, `creado_por`, `estado`) VALUES
(4, 2, 7, '2026-07-16', 'Control de peso y porcentaje de grasa corporal.', 6.00, 8, 'Presenta buena disposición para seguir el plan alimentario recomendado.', 8, 1);

-- Fin de Script completo de Creación e Inicialización de Tablas
