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
  `estado` tinyint(1) NOT NULL DEFAULT 1
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

-- 1. Provincias
INSERT INTO `provincias` (`id_provincia`, `cod_hacienda`, `nombre`, `estado`) VALUES
(1, '01', 'San José', 1),
(2, '02', 'Alajuela', 1),
(3, '03', 'Cartago', 1),
(4, '04', 'Heredia', 1),
(5, '05', 'Guanacaste', 1),
(6, '06', 'Puntarenas', 1),
(7, '07', 'Limón', 1);

-- 2. Cantones (Muestra oficial)
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
(120, 1, '20', 'León Cortés', 1),
(201, 2, '01', 'Alajuela', 1);

-- 3. Distritos (Muestra oficial)
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
(10111, 101, '11', 'San Sebástian', 1),
(10201, 102, '01', 'Escazú', 1),
(10202, 102, '02', 'San Antonio', 1),
(10203, 102, '03', 'San Rafael', 1),
(20101, 201, '01', 'ALAJUELA', 1);

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
