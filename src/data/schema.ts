export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  key?: 'PRI' | 'MUL' | 'UNI';
  extra?: string;
  description: string;
}

export interface TableInfo {
  name: string;
  category: 'Fisioterapia (Nuevas)' | 'Nutrición (Existentes)' | 'Geografía y Direcciones' | 'Facturación y Servicios' | 'Configuración y Usuarios';
  description: string;
  columns: ColumnInfo[];
  relationships?: { column: string; refTable: string; refColumn: string; type: string }[];
}

export const physiotherapyTables: TableInfo[] = [
  {
    name: "antecedentes_lesionales",
    category: "Fisioterapia (Nuevas)",
    description: "Almacena el historial lesional del paciente previo a las terapias, clave para el diagnóstico diferencial.",
    columns: [
      { name: "id_paciente", type: "int(11)", nullable: false, key: "PRI", description: "Clave primaria y foránea. Identificador único del paciente." },
      { name: "fracturas", type: "text", nullable: true, description: "Historial de huesos rotos con fechas aproximadas." },
      { name: "esguinces", type: "text", nullable: true, description: "Registro de esguinces (grados y articulaciones afectadas)." },
      { name: "luxaciones", type: "text", nullable: true, description: "Articulaciones que han sufrido luxación o subluxación." },
      { name: "desgarros", type: "text", nullable: true, description: "Historial de desgarros musculares o lesiones tendinosas." },
      { name: "cirugias_ortopedicas", type: "text", nullable: true, description: "Operaciones de rodilla, columna, hombro, etc." },
      { name: "actividad_fisica_frecuencia", type: "varchar(100)", nullable: true, description: "Frecuencia e intensidad con la que practica deportes actualmente." },
      { name: "observaciones", type: "text", nullable: true, description: "Notas adicionales sobre su condición musculoesquelética previa." },
      { name: "estado", type: "tinyint(1)", nullable: false, extra: "DEFAULT 1", description: "Estado lógico del registro (1: Activo, 0: Inactivo)." }
    ],
    relationships: [
      { column: "id_paciente", refTable: "pacientes", refColumn: "id_paciente", type: "1:1" }
    ]
  },
  {
    name: "evaluacion_fisioterapeutica",
    category: "Fisioterapia (Nuevas)",
    description: "Contiene la ficha de ingreso para el caso de terapia física, guardando el motivo clínico y origen de la lesión.",
    columns: [
      { name: "id_evaluacion_fisio", type: "int(11)", nullable: false, key: "PRI", extra: "AUTO_INCREMENT", description: "Clave primaria de la evaluación." },
      { name: "id_consulta", type: "int(11)", nullable: false, key: "MUL", description: "Clave foránea. Consulta asociada." },
      { name: "motivo_consulta", type: "text", nullable: false, description: "Descripción detallada de por qué asiste a terapia (ej: dolor lumbar, rehabilitación poscirugía)." },
      { name: "mecanismo_lesion", type: "text", nullable: true, description: "Cómo ocurrió la lesión (ej: caída, trauma deportivo, mala postura repetitiva)." },
      { name: "diagnostico_medico", type: "varchar(255)", nullable: true, description: "Diagnóstico emitido por el médico general u ortopedista si cuenta con referencia." },
      { name: "sintomas_principales", type: "text", nullable: true, description: "Síntomas reportados (ej: entumecimiento, debilidad, rigidez)." },
      { name: "tiempo_evolucion", type: "varchar(100)", nullable: true, description: "Tiempo con la sintomatología. Permite clasificar en Agudo, Subagudo o Crónico." },
      { name: "estado", type: "tinyint(1)", nullable: false, extra: "DEFAULT 1", description: "Estado del registro." }
    ],
    relationships: [
      { column: "id_consulta", refTable: "consultas", refColumn: "id_consulta", type: "1:N" }
    ]
  },
  {
    name: "evaluacion_dolor",
    category: "Fisioterapia (Nuevas)",
    description: "Permite mapear el dolor del paciente. Se conecta con la interfaz gráfica del Mapa de Dolor.",
    columns: [
      { name: "id_dolor", type: "int(11)", nullable: false, key: "PRI", extra: "AUTO_INCREMENT", description: "Identificador del registro de dolor." },
      { name: "id_consulta", type: "int(11)", nullable: false, key: "MUL", description: "Clave foránea de la consulta asociada." },
      { name: "escala_eva", type: "int(11)", nullable: false, description: "Intensidad del dolor según Escala Visual Analógica (0: Sin Dolor, 10: Dolor Inbearable)." },
      { name: "tipo_dolor", type: "varchar(100)", nullable: true, description: "Cualidad del dolor: Opresivo, Punzante, Quemante, Sordo, Irradiado, etc." },
      { name: "localizacion_anatomica", type: "varchar(150)", nullable: false, description: "Región muscular o articular afectada (ej: hombro_derecho, cervical, lumbar, etc.)." },
      { name: "factores_agravantes", type: "text", nullable: true, description: "Movimientos, posturas o actividades que incrementan el dolor." },
      { name: "factores_atenuantes", type: "text", nullable: true, description: "Acciones o posturas que alivian el dolor (ej: reposo, calor, estiramiento)." },
      { name: "comportamiento_diario", type: "varchar(100)", nullable: true, description: "Cuándo duele más: Por la mañana, tarde, noche, constante o intermitente." },
      { name: "estado", type: "tinyint(1)", nullable: false, extra: "DEFAULT 1", description: "Estado del registro." }
    ],
    relationships: [
      { column: "id_consulta", refTable: "consultas", refColumn: "id_consulta", type: "1:N" }
    ]
  },
  {
    name: "examen_fisico_rom",
    category: "Fisioterapia (Nuevas)",
    description: "Detalla los hallazgos mecánicos del terapeuta, como rangos de movilidad (ROM), postura, palpación y pruebas especiales.",
    columns: [
      { name: "id_examen_fisico", type: "int(11)", nullable: false, key: "PRI", extra: "AUTO_INCREMENT", description: "Identificador del examen físico." },
      { name: "id_consulta", type: "int(11)", nullable: false, key: "MUL", description: "Clave foránea de la consulta." },
      { name: "postura_observaciones", type: "text", nullable: true, description: "Hallazgos de la inspección estática (ej: escoliosis, hombros caídos, anteproyección cefálica)." },
      { name: "palpacion_hallazgos", type: "text", nullable: true, description: "Puntos dolorosos al tacto, contracturas, bandas tensas, trigger points o temperatura elevada." },
      { name: "rango_movimiento_rom", type: "text", nullable: true, description: "Estructura JSON o notas sobre el rango de movimiento articular activo y pasivo (ej: flexión de cadera limitada)." },
      { name: "fuerza_muscular_daniels", type: "text", nullable: true, description: "Fuerza calificada del 0 al 5 según la Escala de Daniels por grupos musculares." },
      { name: "pruebas_especiales", type: "text", nullable: true, description: "Pruebas ortopédicas específicas (ej: Signo de Phalen, Cajón Anterior, Prueba de Neer, etc.)." },
      { name: "estado", type: "tinyint(1)", nullable: false, extra: "DEFAULT 1", description: "Estado del registro." }
    ],
    relationships: [
      { column: "id_consulta", refTable: "consultas", refColumn: "id_consulta", type: "1:1" }
    ]
  },
  {
    name: "plan_tratamiento_fisioterapia",
    category: "Fisioterapia (Nuevas)",
    description: "Prescripción de la intervención terapéutica física personalizada, objetivos clínicos y dosificación.",
    columns: [
      { name: "id_plan", type: "int(11)", nullable: false, key: "PRI", extra: "AUTO_INCREMENT", description: "Clave primaria del plan." },
      { name: "id_consulta", type: "int(11)", nullable: false, key: "MUL", description: "Clave foránea de la consulta asociada." },
      { name: "objetivos_corto_plazo", type: "text", nullable: true, description: "Metas inmediatas (ej: disminuir el dolor a EVA 3, reducir la inflamación)." },
      { name: "objetivos_largo_plazo", type: "text", nullable: true, description: "Metas de recuperación (ej: reincorporación al deporte, rango completo de movimiento)." },
      { name: "agentes_fisicos", type: "text", nullable: true, description: "Uso de electroterapia (TENS, EMS), ultrasonido terapéutico, termoterapia, crioterapia o láser." },
      { name: "terapia_manual", type: "text", nullable: true, description: "Técnicas manuales (ej: movilización articular, liberación miofascial, masoterapia de descarga)." },
      { name: "ejercicio_terapeutico", type: "text", nullable: true, description: "Protocolos de fortalecimiento, control motor, estiramientos y propiocepción recetados." },
      { name: "frecuencia_sesiones_sugerida", type: "varchar(50)", nullable: true, description: "Número de sesiones recomendadas por semana (ej: 2 veces por semana)." },
      { name: "cantidad_sesiones_total", type: "int(11)", nullable: true, description: "Total de sesiones estimadas para el ciclo (ej: 10 sesiones)." },
      { name: "estado", type: "tinyint(1)", nullable: false, extra: "DEFAULT 1", description: "Estado del registro." }
    ],
    relationships: [
      { column: "id_consulta", refTable: "consultas", refColumn: "id_consulta", type: "1:1" }
    ]
  },
  {
    name: "sesiones_evolucion_fisioterapia",
    category: "Fisioterapia (Nuevas)",
    description: "Registro clínico diario (por sesión de tratamiento) estructurado bajo el estándar SOAP de salud.",
    columns: [
      { name: "id_sesion", type: "int(11)", nullable: false, key: "PRI", extra: "AUTO_INCREMENT", description: "Clave primaria de la nota de evolución." },
      { name: "id_consulta", type: "int(11)", nullable: false, key: "MUL", description: "Clave foránea de la consulta inicial o de control." },
      { name: "numero_sesion", type: "int(11)", nullable: false, description: "Número correlativo de sesión (ej: Sesión 1, 2, 3...)." },
      { name: "fecha_sesion", type: "date", nullable: false, description: "Fecha en la que se ejecuta la sesión de rehabilitación." },
      { name: "subjetivo", type: "text", nullable: true, description: "S (SOAP): Reporte del paciente. Cómo amaneció, nivel de dolor antes de empezar, cumplimiento de tareas." },
      { name: "objetivo", type: "text", nullable: true, description: "O (SOAP): Lo medido por el fisioterapeuta hoy (ej: ROM medido, tolerancia al ejercicio)." },
      { name: "analisis", type: "text", nullable: true, description: "A (SOAP): Evaluación del progreso. Si responde al tratamiento o hay estancamientos." },
      { name: "plan_siguiente_sesion", type: "text", nullable: true, description: "P (SOAP): Qué se priorizará en la siguiente sesión (ej: aumentar carga de ejercicio, aplicar punción)." },
      { name: "creado_por", type: "int(11)", nullable: true, key: "MUL", description: "Clave foránea. Terapeuta que atendió la sesión." },
      { name: "estado", type: "tinyint(1)", nullable: false, extra: "DEFAULT 1", description: "Estado lógico." }
    ],
    relationships: [
      { column: "id_consulta", refTable: "consultas", refColumn: "id_consulta", type: "1:N" },
      { column: "creado_por", refTable: "usuarios", refColumn: "id_usuario", type: "1:N" }
    ]
  }
];

export const existingTables: TableInfo[] = [
  {
    name: "pacientes",
    category: "Nutrición (Existentes)",
    description: "Expediente central del paciente común para nutrición, fisioterapia y facturación.",
    columns: [
      { name: "id_paciente", type: "int(11)", nullable: false, key: "PRI", extra: "AUTO_INCREMENT", description: "Identificador del paciente." },
      { name: "id_compania", type: "int(11)", nullable: false, key: "MUL", description: "Clave foránea de la compañía o sucursal." },
      { name: "nombre_completo", type: "varchar(150)", nullable: false, description: "Nombre completo del paciente." },
      { name: "fecha_nacimiento", type: "date", nullable: true, description: "Fecha de nacimiento." },
      { name: "edad", type: "int(11)", nullable: true, description: "Edad calculada o registrada." },
      { name: "ocupacion", type: "varchar(150)", nullable: true, description: "Profesión u ocupación del paciente." },
      { name: "correo_electronico", type: "varchar(100)", nullable: true, description: "Correo electrónico para contacto." },
      { name: "situacion_vivienda", type: "enum('SOLO','ACOMPAÑADO','FAMILIAR')", nullable: true, description: "Con quién vive el paciente." },
      { name: "fact_tipo_identificacion", type: "enum('01','02','03','04','EXT')", nullable: true, description: "Tipo de cédula para factura electrónica Costa Rica." },
      { name: "fact_identificacion", type: "varchar(50)", nullable: true, description: "Cédula física, jurídica, DIMEX o pasaporte." },
      { name: "fact_nombre", type: "varchar(150)", nullable: true, description: "Nombre que saldrá en la factura oficial." },
      { name: "fact_correo", type: "varchar(150)", nullable: true, description: "Correo receptor de facturación electrónica." },
      { name: "periodicidad_valoracion", type: "enum('MENSUAL','BIMESTRAL','TRIMESTRAL','SEMESTRAL','ANUAL')", nullable: false, extra: "DEFAULT 'MENSUAL'", description: "Cada cuánto se reevalúa al paciente." },
      { name: "proxima_valoracion", type: "date", nullable: true, description: "Fecha de cita futura sugerida." },
      { name: "creado_por", type: "int(11)", nullable: true, key: "MUL", description: "Usuario creador." },
      { name: "estado", type: "tinyint(1)", nullable: false, extra: "DEFAULT 1", description: "Estado activo/inactivo." }
    ]
  },
  {
    name: "consultas",
    category: "Nutrición (Existentes)",
    description: "Expediente general por sesión clínica donde se agrupan las notas y evoluciones médicas.",
    columns: [
      { name: "id_consulta", type: "int(11)", nullable: false, key: "PRI", extra: "AUTO_INCREMENT", description: "Identificador de la consulta." },
      { name: "id_paciente", type: "int(11)", nullable: false, key: "MUL", description: "ID del paciente atendido." },
      { name: "id_compania", type: "int(11)", nullable: false, key: "MUL", description: "ID de la clínica." },
      { name: "fecha_consulta", type: "date", nullable: false, description: "Fecha del encuentro clínico." },
      { name: "motivo_expectativas", type: "text", nullable: true, description: "Metas iniciales que desea el paciente." },
      { name: "horas_sueno", type: "decimal(4,2)", nullable: true, description: "Promedio de horas de descanso." },
      { name: "compromiso_cumplir", type: "int(11)", nullable: true, description: "Nivel de motivación autopercibida del 1 al 10." },
      { name: "comentarios_nutricionista", type: "text", nullable: true, description: "Notas adicionales del profesional de nutrición." },
      { name: "creado_por", type: "int(11)", nullable: true, key: "MUL", description: "ID del profesional creador." },
      { name: "estado", type: "tinyint(1)", nullable: false, extra: "DEFAULT 1", description: "Estado activo/inactivo." }
    ]
  },
  {
    name: "antecedentes_personales",
    category: "Nutrición (Existentes)",
    description: "Antecedentes patológicos personales clínicos (diabetes, hipertensión, etc.).",
    columns: [
      { name: "id_paciente", type: "int(11)", nullable: false, key: "PRI", description: "Identificador del paciente." },
      { name: "diabetes", type: "tinyint(1)", nullable: true, description: "Padece diabetes mellitus." },
      { name: "hipertension", type: "tinyint(1)", nullable: true, description: "Padece hipertensión arterial." },
      { name: "enfermedad_cardiovascular", type: "tinyint(1)", nullable: true, description: "Enfermedades cardíacas previas." },
      { name: "enfermedad_respiratoria", type: "tinyint(1)", nullable: true, description: "Asma, EPOC u otros males respiratorios." },
      { name: "enfermedad_renal", type: "tinyint(1)", nullable: true, description: "Falla renal o problemas afines." },
      { name: "problemas_tiroideos", type: "tinyint(1)", nullable: true, description: "Hipotiroidismo o hipertiroidismo." },
      { name: "gastritis", type: "tinyint(1)", nullable: true, description: "Sufre de gastritis crónica." },
      { name: "estrenimiento", type: "tinyint(1)", nullable: true, description: "Trastornos de estreñimiento." },
      { name: "cirugias", type: "varchar(255)", nullable: true, description: "Cirugías generales previas." },
      { name: "observaciones", type: "text", nullable: true, description: "Detalles médicos adicionales." },
      { name: "estado", type: "tinyint(1)", nullable: false, extra: "DEFAULT 1", description: "Estado." }
    ]
  },
  {
    name: "antecedentes_familiares",
    category: "Nutrición (Existentes)",
    description: "Registro de enfermedades crónicas presentes en padres o abuelos.",
    columns: [
      { name: "id_paciente", type: "int(11)", nullable: false, key: "PRI", description: "Identificador del paciente." },
      { name: "obesidad", type: "tinyint(1)", nullable: true, description: "Historial familiar de obesidad severa." },
      { name: "cancer", type: "tinyint(1)", nullable: true, description: "Cáncer en línea consanguínea directa." },
      { name: "diabetes", type: "tinyint(1)", nullable: true, description: "Diabetes familiar." },
      { name: "hipertension", type: "tinyint(1)", nullable: true, description: "Hipertensión familiar." },
      { name: "observaciones", type: "text", nullable: true, description: "Quién lo padece (ej: Abuela materna)." },
      { name: "estado", type: "tinyint(1)", nullable: false, extra: "DEFAULT 1", description: "Estado activo." }
    ]
  },
  {
    name: "evaluacion_antropometrica",
    category: "Nutrición (Existentes)",
    description: "Composición corporal del paciente (Peso, Talla, IMC, pliegues cutáneos, perímetros).",
    columns: [
      { name: "id_antropometria", type: "int(11)", nullable: false, key: "PRI", extra: "AUTO_INCREMENT", description: "ID de la medición." },
      { name: "id_consulta", type: "int(11)", nullable: false, key: "UNI", description: "Consulta vinculada." },
      { name: "peso", type: "decimal(6,2)", nullable: true, description: "Peso corporal en kilogramos." },
      { name: "talla", type: "decimal(6,2)", nullable: true, description: "Altura en centímetros." },
      { name: "imc", type: "decimal(6,2)", nullable: true, description: "Índice de Masa Corporal calculado." },
      { name: "grasa_visceral", type: "decimal(5,2)", nullable: true, description: "Nivel de grasa visceral peligrosa." },
      { name: "masa_muscular", type: "decimal(6,2)", nullable: true, description: "Masa muscular esquelética en kg." },
      { name: "cintura", type: "decimal(6,2)", nullable: true, description: "Circunferencia de cintura (cm)." },
      { name: "abdominal", type: "decimal(6,2)", nullable: true, description: "Perímetro abdominal medio (cm)." }
    ]
  },
  {
    name: "facturas",
    category: "Facturación y Servicios",
    description: "Comprobantes fiscales estructurados para el envío directo al Ministerio de Hacienda de Costa Rica.",
    columns: [
      { name: "id_factura", type: "int(11)", nullable: false, key: "PRI", extra: "AUTO_INCREMENT", description: "ID único de la factura." },
      { name: "id_compania", type: "int(11)", nullable: false, description: "Compañía emisora de la factura." },
      { name: "consecutivo", type: "varchar(20)", nullable: false, description: "Número de 20 dígitos oficial (Sucursal+Terminal+Tipo+Consecutivo)." },
      { name: "clave", type: "varchar(50)", nullable: false, key: "UNI", description: "Clave numérica de 50 dígitos requerida por Hacienda." },
      { name: "fecha_emision", type: "datetime", nullable: false, description: "Fecha de emisión y firma electrónica." },
      { name: "medio_pago", type: "enum('EFECTIVO','TARJETA','TRANSFERENCIA','SINPE','OTRO')", nullable: false, description: "Forma de pago de la terapia o consulta." },
      { name: "subtotal", type: "decimal(12,2)", nullable: false, description: "Monto total antes de impuestos y descuentos." },
      { name: "total_iva", type: "decimal(12,2)", nullable: false, description: "Impuesto al Valor Agregado cobrado (generalmente 4% para servicios de salud privados o 13% en Costa Rica)." },
      { name: "total_comprobante", type: "decimal(12,2)", nullable: false, description: "Total neto pagado en colones." },
      { name: "estado_hacienda", type: "enum('BORRADOR','PENDIENTE_ENVIO','ACEPTADO','RECHAZADO')", nullable: false, description: "Estado de validación ATV de Hacienda." }
    ]
  },
  {
    name: "servicios",
    category: "Facturación y Servicios",
    description: "Servicios médicos o de rehabilitación ofrecidos por la clínica con código de Hacienda (CABYS).",
    columns: [
      { name: "id_servicio", type: "int(11)", nullable: false, key: "PRI", extra: "AUTO_INCREMENT", description: "ID del servicio." },
      { name: "nombre", type: "varchar(150)", nullable: false, description: "Nombre del servicio (ej: Terapia Física de Hombro, Consulta Nutricional Completa)." },
      { name: "codigo_cabys", type: "varchar(13)", nullable: true, description: "Código oficial del Catálogo de Bienes y Servicios de Costa Rica (13 dígitos)." },
      { name: "precio", type: "decimal(10,2)", nullable: false, description: "Costo unitario del servicio." },
      { name: "porcentaje_iva", type: "decimal(5,2)", nullable: true, description: "IVA aplicable (Tasa de salud privada: 4% en CR)." }
    ]
  }
];

export const allGeographyTables: TableInfo[] = [
  {
    name: "provincias",
    category: "Geografía y Direcciones",
    description: "Listado de las 7 provincias de Costa Rica (San José, Alajuela, Cartago, Heredia, Guanacaste, Puntarenas, Limón).",
    columns: [
      { name: "id_provincia", type: "int(11)", nullable: false, key: "PRI", description: "Identificador numérico de la provincia (1 al 7)." },
      { name: "cod_hacienda", type: "varchar(2)", nullable: false, key: "UNI", description: "Código asignado por el Ministerio de Hacienda (ej: '01')." },
      { name: "nombre", type: "varchar(50)", nullable: false, description: "Nombre de la provincia." },
      { name: "estado", type: "tinyint(1)", nullable: false, extra: "DEFAULT 1", description: "Si está activo." }
    ]
  },
  {
    name: "cantones",
    category: "Geografía y Direcciones",
    description: "Los 84 cantones oficiales de Costa Rica estructurados por provincia.",
    columns: [
      { name: "id_canton", type: "int(11)", nullable: false, key: "PRI", description: "Código único de cantón (ej: 101 para San José)." },
      { name: "id_provincia", type: "int(11)", nullable: false, key: "MUL", description: "ID de provincia a la que pertenece." },
      { name: "cod_hacienda", type: "varchar(2)", nullable: false, description: "Código de Hacienda de cantón." },
      { name: "nombre", type: "varchar(50)", nullable: false, description: "Nombre del cantón." }
    ]
  },
  {
    name: "distritos",
    category: "Geografía y Direcciones",
    description: "Distritos de Costa Rica que dividen territorialmente cada cantón.",
    columns: [
      { name: "id_distrito", type: "int(11)", nullable: false, key: "PRI", description: "Identificador del distrito (ej: 10101)." },
      { name: "id_canton", type: "int(11)", nullable: false, key: "MUL", description: "ID del cantón contenedor." },
      { name: "cod_hacienda", type: "varchar(2)", nullable: false, description: "Código de Hacienda del distrito." },
      { name: "nombre", type: "varchar(50)", nullable: false, description: "Nombre de la demarcación." }
    ]
  }
];

export const allTables = [...physiotherapyTables, ...existingTables, ...allGeographyTables];

export const completeSQLScript = `-- ========================================================
-- FisioDB Costa Rica - Ajuste de Esquema para Fisioterapia
-- Extiende la base de datos de Nutrición y Facturación Electrónica (Hacienda CR)
-- Autor: Diseñador de Esquemas AI
-- ========================================================

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- TABLAS NUEVAS DE FISIOTERAPIA (Ajustadas para Costa Rica)
--

-- --------------------------------------------------------
-- Estructura de tabla para 'antecedentes_lesionales'
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`antecedentes_lesionales\` (
  \`id_paciente\` int(11) NOT NULL,
  \`fracturas\` text DEFAULT NULL COMMENT 'Detalle de fracturas óseas previas',
  \`esguinces\` text DEFAULT NULL COMMENT 'Detalle de esguinces sufridos (articulación y grado)',
  \`luxaciones\` text DEFAULT NULL COMMENT 'Historial de luxaciones o subluxaciones',
  \`desgarros\` text DEFAULT NULL COMMENT 'Registro de desgarros musculares o tendinopatías',
  \`cirugias_ortopedicas\` text DEFAULT NULL COMMENT 'Cirugías de columna, hombros, rodillas u otros',
  \`actividad_fisica_frecuencia\` varchar(100) DEFAULT NULL COMMENT 'Deporte practicado y frecuencia semanal',
  \`observaciones\` text DEFAULT NULL,
  \`estado\` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (\`id_paciente\`),
  CONSTRAINT \`fk_ant_lesionales_paciente\` FOREIGN KEY (\`id_paciente\`) REFERENCES \`pacientes\` (\`id_paciente\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para 'evaluacion_fisioterapeutica'
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`evaluacion_fisioterapeutica\` (
  \`id_evaluacion_fisio\` int(11) NOT NULL AUTO_INCREMENT,
  \`id_consulta\` int(11) NOT NULL COMMENT 'Relación con la consulta general',
  \`motivo_consulta\` text NOT NULL COMMENT 'Descripción de por qué asiste (dolor, debilidad, etc)',
  \`mecanismo_lesion\` text DEFAULT NULL COMMENT 'Cómo ocurrió la lesión (ej: caída, trauma deportivo)',
  \`diagnostico_medico\` varchar(255) DEFAULT NULL COMMENT 'Diagnóstico del médico remitente si aplica',
  \`sintomas_principales\` text DEFAULT NULL COMMENT 'Parestesias, rigidez, pérdida de fuerza',
  \`tiempo_evolucion\` varchar(100) DEFAULT NULL COMMENT 'Duración: Agudo, Subagudo, Crónico',
  \`estado\` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (\`id_evaluacion_fisio\`),
  KEY \`idx_eval_fisio_consulta\` (\`id_consulta\`),
  CONSTRAINT \`fk_eval_fisioterapeutica_consulta\` FOREIGN KEY (\`id_consulta\`) REFERENCES \`consultas\` (\`id_consulta\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para 'evaluacion_dolor' (Datos de Mapa de Dolor)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`evaluacion_dolor\` (
  \`id_dolor\` int(11) NOT NULL AUTO_INCREMENT,
  \`id_consulta\` int(11) NOT NULL,
  \`escala_eva\` int(11) NOT NULL COMMENT 'Escala Visual Analógica (0 al 10)',
  \`tipo_dolor\` varchar(100) DEFAULT NULL COMMENT 'Opresivo, punzante, quemante, sordo, irradiado',
  \`localizacion_anatomica\` varchar(150) NOT NULL COMMENT 'Zona corporal del dolor (ej: hombro_der, lumbar)',
  \`factores_agravantes\` text DEFAULT NULL COMMENT 'Movimientos o posturas que empeoran el dolor',
  \`factores_atenuantes\` text DEFAULT NULL COMMENT 'Acciones que disminuyen el dolor (ej: frío, reposo)',
  \`comportamiento_diario\` varchar(100) DEFAULT NULL COMMENT 'Mañana, tarde, noche, constante, intermitente',
  \`estado\` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (\`id_dolor\`),
  KEY \`idx_eval_dolor_consulta\` (\`id_consulta\`),
  CONSTRAINT \`fk_eval_dolor_consulta\` FOREIGN KEY (\`id_consulta\`) REFERENCES \`consultas\` (\`id_consulta\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para 'examen_fisico_rom'
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`examen_fisico_rom\` (
  \`id_examen_fisico\` int(11) NOT NULL AUTO_INCREMENT,
  \`id_consulta\` int(11) NOT NULL,
  \`postura_observaciones\` text DEFAULT NULL COMMENT 'Postura estática (escoliosis, anteproyecciones)',
  \`palpacion_hallazgos\` text DEFAULT NULL COMMENT 'Zonas de hipertonía, trigger points, temperatura',
  \`rango_movimiento_rom\` text DEFAULT NULL COMMENT 'Notas o JSON de rangos articulares activos y pasivos',
  \`fuerza_muscular_daniels\` text DEFAULT NULL COMMENT 'Calificación 0 a 5 por grupos musculares (Escala Daniels)',
  \`pruebas_especiales\` text DEFAULT NULL COMMENT 'Resultado de pruebas específicas (ej: Phalen, Lachman)',
  \`estado\` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (\`id_examen_fisico\`),
  KEY \`idx_examen_fisico_consulta\` (\`id_consulta\`),
  CONSTRAINT \`fk_examen_fisico_consulta\` FOREIGN KEY (\`id_consulta\`) REFERENCES \`consultas\` (\`id_consulta\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para 'plan_tratamiento_fisioterapia'
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`plan_tratamiento_fisioterapia\` (
  \`id_plan\` int(11) NOT NULL AUTO_INCREMENT,
  \`id_consulta\` int(11) NOT NULL,
  \`objetivos_corto_plazo\` text DEFAULT NULL COMMENT 'Aliviar dolor, desinflamar en corto plazo',
  \`objetivos_largo_plazo\` text DEFAULT NULL COMMENT 'Retorno deportivo, rango completo de movimiento',
  \`agentes_fisicos\` text DEFAULT NULL COMMENT 'TENS, ultrasonido, crioterapia, termoterapia, láser',
  \`terapia_manual\` text DEFAULT NULL COMMENT 'Liberación miofascial, movilización, estiramiento',
  \`ejercicio_terapeutico\` text DEFAULT NULL COMMENT 'Fortalecimiento, propiocepción, control motor prescrito',
  \`frecuencia_sesiones_sugerida\` varchar(50) DEFAULT NULL COMMENT 'ej: 2 veces por semana',
  \`cantidad_sesiones_total\` int(11) DEFAULT NULL COMMENT 'ej: 10 sesiones totales',
  \`estado\` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (\`id_plan\`),
  KEY \`idx_plan_fisio_consulta\` (\`id_consulta\`),
  CONSTRAINT \`fk_plan_fisio_consulta\` FOREIGN KEY (\`id_consulta\`) REFERENCES \`consultas\` (\`id_consulta\`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------
-- Estructura de tabla para 'sesiones_evolucion_fisioterapia' ( SOAP diario )
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS \`sesiones_evolucion_fisioterapia\` (
  \`id_sesion\` int(11) NOT NULL AUTO_INCREMENT,
  \`id_consulta\` int(11) NOT NULL,
  \`numero_sesion\` int(11) NOT NULL COMMENT 'Correlativo (ej: Sesión 1, Sesión 2...)',
  \`fecha_sesion\` date NOT NULL,
  \`subjetivo\` text DEFAULT NULL COMMENT 'S (SOAP): Percepción del paciente de hoy, dolor previo',
  \`objetivo\` text DEFAULT NULL COMMENT 'O (SOAP): Medidas del terapeuta hoy, ROM, ejercicios tolerados',
  \`analisis\` text DEFAULT NULL COMMENT 'A (SOAP): Evolución clínica o respuesta al tratamiento',
  \`plan_siguiente_sesion\` text DEFAULT NULL COMMENT 'P (SOAP): Prioridades para la próxima sesión',
  \`creado_por\` int(11) DEFAULT NULL COMMENT 'ID del fisioterapeuta que atiende la sesión',
  \`estado\` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (\`id_sesion\`),
  KEY \`idx_sesiones_ev_consulta\` (\`id_consulta\`),
  KEY \`idx_sesiones_ev_usuario\` (\`creado_por\`),
  CONSTRAINT \`fk_sesiones_ev_consulta\` FOREIGN KEY (\`id_consulta\`) REFERENCES \`consultas\` (\`id_consulta\`) ON DELETE CASCADE,
  CONSTRAINT \`fk_sesiones_ev_usuario\` FOREIGN KEY (\`creado_por\`) REFERENCES \`usuarios\` (\`id_usuario\`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
`;
