import { TableInfo } from './schema';
import type { FormulaTMB, DireccionPrescripcion } from '../utils/calorieFormulas';

export interface HorarioDia {
  abre: string | null;   // 'HH:MM', null = cerrado ese día
  cierra: string | null; // 'HH:MM'
}

export interface HorarioAtencion {
  lunes: HorarioDia;
  martes: HorarioDia;
  miercoles: HorarioDia;
  jueves: HorarioDia;
  viernes: HorarioDia;
  sabado: HorarioDia;
  domingo: HorarioDia;
}

export type DiaSemana = keyof HorarioAtencion;

export interface TramoHorario {
  abre: string;   // 'HH:MM'
  cierra: string; // 'HH:MM'
}

// Horario propio (fraccionado) para citas a domicilio: varios tramos por día.
export type HorarioDomicilio = Record<DiaSemana, TramoHorario[]>;

export const DEFAULT_HORARIO_ATENCION: HorarioAtencion = {
  lunes: { abre: '08:00', cierra: '18:00' },
  martes: { abre: '08:00', cierra: '18:00' },
  miercoles: { abre: '08:00', cierra: '18:00' },
  jueves: { abre: '08:00', cierra: '18:00' },
  viernes: { abre: '08:00', cierra: '18:00' },
  sabado: { abre: '08:00', cierra: '12:00' },
  domingo: { abre: null, cierra: null }
};

export type PerfilCompania = 'Fisioterapia' | 'Nutrición' | 'Ambas' | 'Spa' | 'Legal';

export interface Company {
  id: number;
  nombreComercial: string;
  razonSocial: string;
  tipoIdentificacion: '01' | '02' | '03' | '04'; // 01: Física, 02: Jurídica, etc.
  identificacion: string;
  correoEmisor: string;
  ivaPorDefecto: number;
  colorPrimario: string;
  colorSidebar: string;
  logoUrl: string;
  actividadEconomica: string;
  perfilCompania: PerfilCompania;
  estadoSaas: 'PENDIENTE' | 'ACTIVA' | 'SUSPENDIDA';
  maxUsuarios: number;
  montoMensual: number | null;
  proximoVencimiento: string | null; // 'YYYY-MM-DD'
  horarioAtencion: HorarioAtencion;
  horarioDomicilio?: HorarioDomicilio | null; // null o sin tramos = usar horarioAtencion para citas a domicilio
  requiereConfirmacionCitas: boolean; // si es true, las citas creadas por el cliente quedan PROGRAMADA (pendiente de confirmar) en vez de CONFIRMADA
  // Reservas en línea por tipo de visita. undefined/true = reserva automática (comportamiento de siempre);
  // false = la página pública no agenda y ofrece solicitar el espacio por WhatsApp.
  reservaAutoConsultorio?: boolean;
  reservaAutoDomicilio?: boolean;
  whatsappReservas?: string | null; // solo dígitos con código de país
  mensajeWhatsappReservas?: string | null; // máx. 500 caracteres
  plazoCreditoClientesDias?: number; // plazo por defecto de las ventas a crédito (editable en cada factura)
  plazoCreditoProveedoresDias?: number; // plazo por defecto de las compras a crédito en CxP
  regimenSimplificado: boolean; // Régimen de Tributación Simplificada: no declara IVA por D-104 (paga cuota fija) — los reportes fiscales muestran esto solo como referencia informativa
  // Ubicación fiscal (requerida por Hacienda para el bloque Emisor.Ubicacion de la factura electrónica)
  provincia: string; // código INEC, 1 dígito
  canton: string; // código INEC, 2 dígitos
  distrito: string; // código INEC, 2 dígitos
  otrasSenas: string; // dirección exacta, 5-250 caracteres
}

export interface User {
  id: number;
  idCompania: number;
  nombre: string;
  usuario: string;
  correo: string;
  contrasena: string;
  rol: 'Administrador' | 'Profesional';
  activo: boolean;
  ubicacionDireccion: string | null;
  ubicacionLat: number | null;
  ubicacionLng: number | null;
  maxTiempoTrasladoMinutos: number;
}

export interface Patient {
  id: number;
  idCompania: number;
  nombreCompleto: string;
  fechaNacimiento: string;
  edad: number;
  sexo?: 'M' | 'F'; // opcional en ficha; requerido para calcular TMB (Harris Benedict/Mifflin/Muller)
  ocupacion: string;
  correoElectronico: string;
  situacionVivienda: 'SOLO' | 'ACOMPAÑADO' | 'FAMILIAR';
  tipoIdentificacion: '01' | '02' | '03' | '04' | 'EXT';
  identificacion: string;
  telefono: string;
  provinciaId: number;
  cantonId: number;
  distritoId: number;
  otrasSenas: string;
  // Antecedentes nutricionales
  diabetes: boolean;
  hipertension: boolean;
  gastritis: boolean;
  estrenimiento: boolean;
  alergiasAlimentarias: string;
  // Antecedentes fisioterapia
  fracturas: string;
  esguinces: string;
  cirugiasOrtopedicas: string;
  actividadFisica: string;
  activo?: boolean; // false = eliminado (soft-delete); ausente/true = activo
}

export interface Cita {
  id: number;
  idCompania: number;
  idPaciente: number;
  idUsuarioNutricionista: number; // Profesional a cargo
  idConsulta?: number | null; // Se llena cuando se inicia la consulta
  idServicio?: number | null; // Servicio del catálogo elegido; su duracionMinutos define duracionMinutos de la cita
  fechaHora: string; // Formato "YYYY-MM-DDTHH:MM"
  duracionMinutos: number;
  estadoCita: 'PROGRAMADA' | 'CONFIRMADA' | 'CANCELADA' | 'COMPLETADA' | 'NO_ASISTIO';
  notas: string;
  confirmacionEnviadaEn?: string | null;
  recordatorioEnviadoEn?: string | null;
  cancelacionEnviadaEn?: string | null;
  tipoVisita: 'CONSULTORIO' | 'DOMICILIO';
  direccionDomicilio?: string | null;
  pacienteLat?: number | null;
  pacienteLng?: number | null;
  tiempoTrasladoMinutos?: number | null;
}

// Buzón de correo entrante donde los proveedores envían sus facturas electrónicas (CxP). La
// contraseña nunca viaja al navegador: solo `tieneContrasena`.
export interface CompaniaImapConfig {
  imapHost: string;
  imapPort: number;
  imapSeguro: boolean; // true = TLS directo (993); false = STARTTLS (143)
  imapUsuario: string;
  imapCarpeta: string; // varias separadas por coma, ej. "INBOX, Facturas"
  activo: boolean;
  verificadaEn: string | null;
  tieneContrasena: boolean;
}

export interface FacturaCorreo {
  id: number;
  tipoDocumento: '01' | '04';
  clave: string;
  numeroConsecutivo: string;
  fechaEmision: string;
  emisorNombre: string;
  emisorIdentificacion: string;
  montoTotal: number; // siempre en colones
  moneda: string;
  tipoCambio: number;
  remitente: string;
  asunto: string;
  fechaCorreo: string;
  nombreArchivo: string;
  estado: 'PENDIENTE' | 'IMPORTADA' | 'DESCARTADA';
  idCuentaPagar: number | null;
  motivoDescarte: string | null;
  procesadoEn: string | null;
}

export interface CompaniaSmtpConfig {
  id: number;
  idCompania: number;
  proveedor: 'GMAIL' | 'OUTLOOK' | 'OTRO';
  smtpHost: string;
  smtpPort: number;
  smtpSeguridad: 'TLS' | 'SSL' | 'NINGUNA';
  smtpUsuario: string;
  smtpPasswordCifrado: string;
  remitenteNombre: string;
  remitenteCorreo: string;
  recordatorioHorasAntes: number;
  activo: boolean;
  tieneContrasena?: boolean;
}

export type SmtpConfigInput = Omit<CompaniaSmtpConfig, 'smtpPasswordCifrado' | 'tieneContrasena'> & {
  smtpPassword?: string;
};

export interface NotificationLog {
  id: number;
  idCompania: number;
  idCita?: number | null;
  idConsulta?: number | null;
  tipo: 'CONFIRMACION' | 'MODIFICACION' | 'RECORDATORIO' | 'CANCELACION' | 'CONSULTA' | 'FACTURA' | 'DOCUMENTOS';
  destinatario: string;
  asunto: string;
  cuerpo: string;
  enviadoEn: string;
}

// Perfil Legal: el cliente es una fila de `pacientes` (idPaciente). Las fechas viajan como texto,
// igual que en el resto de la BD: días 'YYYY-MM-DD', instantes ISO.
export interface DocumentoCaso {
  id: number;
  idCaso: number;
  nombre: string;
  estado: 'PENDIENTE' | 'RECIBIDO';
  folio: string; // dónde está dentro de la carpeta física del caso, ej. "f. 12-15"
  fechaLimite: string | null;
  fechaRecibido: string | null;
  notas: string;
}

export interface CasoLegal {
  id: number;
  idCompania: number;
  idPaciente: number;
  numeroExpediente: string;
  titulo: string;
  materia: string;
  estado: 'ABIERTO' | 'CERRADO';
  ubicacionFisica: string; // archivador / gaveta / cajón donde está la carpeta física
  recordatorioCadaDias: number; // 0 = sin recordatorio automático
  ultimoRecordatorioEn: string | null;
  notas: string;
  creadoEn: string;
  documentos: DocumentoCaso[];
}

export interface Consultation {
  id: number;
  idPaciente: number;
  idCompania: number;
  fecha: string;
  tipo: 'Nutrición' | 'Fisioterapia';
  motivo: string;
  horasSueno: number;
  compromiso: number; // 1-10
  estado?: 'ABIERTA' | 'CERRADA'; // Nace ABIERTA; CERRADA cuando el nutricionista finaliza la sesión. Sigue siendo editable en ambos estados.
  activo?: boolean; // false = eliminada (soft-delete); ausente/true = activa

  // Nutrición específica
  antropometria?: {
    peso: number; // kg
    talla: number; // cm
    imc: number;
    grasaCorporal: number; // %
    grasaVisceral: number; // nivel
    masaMuscular: number; // kg
    masaOsea: number; // kg
    cintura: number; // cm
    abdominal: number; // cm
  };
  dieta?: {
    totalCalorias: number;
    desayuno: string;
    meriendaManana: string;
    almuerzo: string;
    meriendaTarde: string;
    cena: string;
    indicaciones: string;
    prescripcionCalorica?: {
      formula: FormulaTMB;
      tmb: number;
      diasDescanso: number;
      diasEntrenamiento: number;
      factorActividadDescanso: number;
      factorActividadEntreno: number;
      promedioMantenimiento: number;
      direccion: DireccionPrescripcion;
      porcentaje: number;
    };
    macros?: {
      // Porcentaje de distribución calórica (no gramos) — igual convención que PlantillaDieta.
      // Individualmente opcional; cuando los 3 tienen valor deben sumar 100 (ver POST
      // /api/consultations en server.ts). Los gramos se calculan al mostrar, a partir de
      // totalCalorias (4 kcal/g carbohidratos y proteína, 9 kcal/g grasa).
      carbohidratosPct: number | null;
      proteinasPct: number | null;
      grasasPct: number | null;
    };
  };
  evaluacionAntropometrica?: {
    peso: number;
    talla: number;
    imc: number;
    c_muneca?: number;
    porcentaje_grasa_balanza?: number;
    grasa_visceral?: number;
    porcentaje_agua?: number;
    masa_muscular?: number;
    kg_magros?: number;
    masa_osea?: number;
    tmb?: number;
    edad_metabolica?: number;
    cintura?: number;
    circunferencia_abdominal?: number;
    pliegue_triceps?: number;
    pliegue_subescapular?: number;
    pliegue_biceps?: number;
    pliegue_cresta_iliaca?: number;
    pliegue_supraespinal?: number;
    pliegue_abdominal?: number;
    pliegue_muslo_medio?: number;
    pliegue_pierna_medial?: number;
    perimetro_brazo_relajado?: number;
    perimetro_brazo_contraido?: number;
  };
  evaluacionBioquimica?: {
    indice_homa?: number;
    hb1ac_glicosilada?: number;
    vit_d?: number;
    glicemia?: number;
    insulinemia?: number;
    hematocrito?: number;
    hemoglobina?: number;
    albumina?: number;
    acido_urico?: number;
    trigliceridos?: number;
    colesterol_total?: number;
    colesterol_hdl?: number;
    colesterol_ldl?: number;
    intolerancias_alimentarias?: string;
    alergias?: string;
  };
  evaluacionDietetica?: {
    tiempos_comida?: '1-2' | '3-4' | '5-6';
    lugar_consumo?: 'Casa' | 'Fuera' | 'Ambos';
    quien_prepara?: string;
    calificacion_apetito?: 'Bueno' | 'Regular' | 'Malo';
    tipo_grasas?: string;
    coccion_asado?: boolean;
    coccion_fritura?: boolean;
    coccion_hervido?: boolean;
    coccion_plancha?: boolean;
    coccion_vapor?: boolean;
    coccion_freidora_aire?: boolean;
    agrega_sal?: boolean;
    consume_azucar?: boolean;
    utiliza_edulcorante?: boolean;
    dietas_anteriores?: string;
    consume_agua?: boolean;
    cantidad_agua?: string;
    alimentos_no_consume?: string;
    alimentos_preferidos?: string;
  };
  composicionSegmentada?: {
    grasa?: {
      total?: number;
      mano_izquierda?: number;
      mano_derecha?: number;
      pierna_derecha?: number;
      pierna_izquierda?: number;
      tronco?: number;
      calificacion_grasa?: string;
    };
    musculo?: {
      total?: number;
      mano_izquierda?: number;
      mano_derecha?: number;
      pierna_derecha?: number;
      pierna_izquierda?: number;
      tronco?: number;
    };
  };
  estiloVida?: {
    realiza_ejercicio?: boolean;
    tiempo_entrenar?: string;
    hace_cuanto_entrena?: string;
    hora_entreno?: string;
    tipo_ejercicio?: string;
    frecuencia_ejercicio_semana?: string;
    duracion_ejercicio?: string;
    suplementos?: string;
    consume_alcohol?: boolean;
    tipo_alcohol?: string;
    frecuencia_alcohol?: string;
    cantidad_alcohol?: string;
    fuma?: boolean;
    frecuencia_fumado?: string;
    cantidad_fumado?: string;
  };

  // Fisioterapia específica
  fisioterapia?: {
    mecanismoLesion: string;
    diagnosticoMedico: string;
    evaDolor: number; // 0-10
    zonaDolor: string; // hombro_der, lumbar, etc.
    tipoDolor: string; // opresivo, punzante...
    factoresAgravantes: string;
    factoresAtenuantes: string;
    posturaObservaciones: string;
    palpacionHallazgos: string;
    romMedido: string; // rangos articulares
    fuerzaDaniels: string; // escala daniels 0-5
    pruebasEspeciales: string;
    agentesFisicos: string; // electro, ultrasonido, frio...
    terapiaManual: string;
    ejercicioTerapeutico: string;
    sesionesSugeridas: number;
    soapSubjetivo: string;
    soapObjetivo: string;
    soapAnalisis: string;
    soapPlan: string;
  };
  anotacionesGenerales: string;
}

export const defaultCompanies: Company[] = [
  {
    id: 1,
    nombreComercial: "FisioNutri Escazú",
    razonSocial: "Clínicas de Salud Integral S.A.",
    tipoIdentificacion: "02",
    identificacion: "3-101-445566",
    correoEmisor: "contacto@fisionutriescazu.com",
    ivaPorDefecto: 4.0, // Servicios de salud en Costa Rica
    colorPrimario: "#0f766e", // Teal 700
    colorSidebar: "#115e59", // Teal 800
    logoUrl: "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=120&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    actividadEconomica: "869001 (Servicios de Terapia Física y Nutrición)",
    perfilCompania: "Ambas",
    estadoSaas: "ACTIVA",
    maxUsuarios: 5,
    montoMensual: null,
    proximoVencimiento: null,
    horarioAtencion: DEFAULT_HORARIO_ATENCION,
    requiereConfirmacionCitas: false,
    regimenSimplificado: false,
    provincia: "1",
    canton: "01",
    distrito: "01",
    otrasSenas: "Escazú centro, edificio Torre Médica, tercer piso"
  },
  {
    id: 2,
    nombreComercial: "Clínica Elronutri Alajuela",
    razonSocial: "Eliecer Rojas Nutrición y Terapia",
    tipoIdentificacion: "01",
    identificacion: "5-0392-0984",
    correoEmisor: "eliecer.rojas9@gmail.com",
    ivaPorDefecto: 4.0,
    colorPrimario: "#d97706", // Amber 600
    colorSidebar: "#92400e", // Amber 800
    logoUrl: "https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=120&auto=format&fit=crop&q=60&ixlib=rb-4.0.3",
    actividadEconomica: "851201 (Servicios de Nutrición)",
    perfilCompania: "Nutrición",
    estadoSaas: "ACTIVA",
    maxUsuarios: 5,
    montoMensual: null,
    proximoVencimiento: null,
    horarioAtencion: DEFAULT_HORARIO_ATENCION,
    requiereConfirmacionCitas: false,
    regimenSimplificado: false,
    provincia: "2",
    canton: "01",
    distrito: "01",
    otrasSenas: "Alajuela centro, 200m norte del parque central"
  }
];

export const defaultUsers: User[] = [
  {
    id: 1,
    idCompania: 1,
    nombre: "Dr. Keneth Rojas",
    usuario: "admin_escazu",
    correo: "contacto@fisionutriescazu.com",
    contrasena: "123456",
    rol: "Administrador",
    activo: true,
    ubicacionDireccion: null,
    ubicacionLat: null,
    ubicacionLng: null,
    maxTiempoTrasladoMinutos: 45
  },
  {
    id: 2,
    idCompania: 2,
    nombre: "Dr. Eliecer Rojas",
    usuario: "eliecer_alajuela",
    correo: "eliecer.rojas9@gmail.com",
    contrasena: "123456",
    rol: "Administrador",
    activo: true,
    ubicacionDireccion: null,
    ubicacionLat: null,
    ubicacionLng: null,
    maxTiempoTrasladoMinutos: 45
  }
];

export const defaultPatients: Patient[] = [
  {
    id: 1,
    idCompania: 1,
    nombreCompleto: "Keneth Rojas Delgado",
    fechaNacimiento: "1994-08-13",
    edad: 32,
    ocupacion: "Agente de Aduanas",
    correoElectronico: "keneth.rojas@hotmail.com",
    situacionVivienda: "SOLO",
    tipoIdentificacion: "01",
    identificacion: "5-0399-0811",
    telefono: "8303-7805",
    provinciaId: 1, // San José
    cantonId: 102, // Escazú
    distritoId: 10203, // San Rafael
    otrasSenas: "De la Iglesia de San Rafael, 200m Oeste, casa de portón café.",
    diabetes: false,
    hipertension: true,
    gastritis: true,
    estrenimiento: false,
    alergiasAlimentarias: "Intolerancia a la lactosa y alergia a mariscos",
    fracturas: "Fractura de clavícula izquierda en 2018",
    esguinces: "Esguince de tobillo derecho grado II (2021)",
    cirugiasOrtopedicas: "Ninguna",
    actividadFisica: "Gimnasio 3 veces por semana"
  },
  {
    id: 2,
    idCompania: 2,
    nombreCompleto: "María Elena Quesada Brenes",
    fechaNacimiento: "1988-04-22",
    edad: 38,
    ocupacion: "Profesora de Primaria",
    correoElectronico: "maria.quesada@mep.go.cr",
    situacionVivienda: "FAMILIAR",
    tipoIdentificacion: "01",
    identificacion: "2-0456-0789",
    telefono: "8899-2233",
    provinciaId: 2, // Alajuela
    cantonId: 201, // Alajuela
    distritoId: 20101, // Alajuela centro
    otrasSenas: "Frente al parque de los niños, edificio esquinero.",
    diabetes: true,
    hipertension: false,
    gastritis: false,
    estrenimiento: true,
    alergiasAlimentarias: "Gluten (le provoca inflamación severa)",
    fracturas: "Ninguna",
    esguinces: "Ninguno",
    cirugiasOrtopedicas: "Artroscopia de rodilla izquierda (2023)",
    actividadFisica: "Sedentaria por dolor de rodilla"
  }
];

export const defaultConsultations: Consultation[] = [
  {
    id: 1,
    idPaciente: 1,
    idCompania: 1,
    fecha: "2026-07-16",
    tipo: "Nutrición",
    motivo: "Pérdida de grasa corporal y control de reflujo digestivo",
    horasSueno: 6.5,
    compromiso: 8,
    antropometria: {
      peso: 84.5,
      talla: 178,
      imc: 26.7,
      grasaCorporal: 24.5,
      grasaVisceral: 11,
      masaMuscular: 60.2,
      masaOsea: 3.2,
      cintura: 94,
      abdominal: 98
    },
    dieta: {
      totalCalorias: 1950,
      desayuno: "2 huevos revueltos con tomate, 1 rebanada de pan integral, 1/2 taza de papaya y café negro sin azúcar.",
      meriendaManana: "1 manzana verde y 10 almendras.",
      almuerzo: "120g de pechuga de pollo a la plancha, 1/2 taza de arroz integral, 1/2 taza de frijoles negros, ensalada verde abundante aderezada con limón.",
      meriendaTarde: "1 yogur griego descremado deslactosado con 1 cucharadita de semillas de chía.",
      cena: "100g de filete de pescado al horno, brócoli y zanahorias al vapor con unas gotas de aceite de oliva.",
      indicaciones: "Evitar acostarse antes de 2 horas post-cena para prevenir reflujo. Hidratarse con 2.5 litros de agua al día."
    },
    anotacionesGenerales: "El paciente muestra excelente motivación. Se enfoca la dieta en alimentos antiinflamatorios y de fácil digestión por su gastritis clínica en Costa Rica."
  },
  {
    id: 2,
    idPaciente: 1,
    idCompania: 1,
    fecha: "2026-07-17",
    tipo: "Fisioterapia",
    motivo: "Dolor lumbar bajo constante irradiado a glúteo derecho",
    horasSueno: 7.0,
    compromiso: 9,
    fisioterapia: {
      mecanismoLesion: "Sobrecarga en peso muerto con mala postura en el gimnasio hace 2 semanas.",
      diagnosticoMedico: "Lumbociatalgia aguda con sospecha de hernia discal L5-S1",
      evaDolor: 7,
      zonaDolor: "lumbar",
      tipoDolor: "Irradiado",
      factoresAgravantes: "Estar sentado más de 15 minutos o realizar flexión anterior de tronco.",
      factoresAtenuantes: "Reposo boca arriba con rodillas dobladas y aplicación de compresa caliente.",
      posturaObservaciones: "Hiperlordosis lumbar compensatoria, hombro derecho ligeramente elevado, espasmo muscular bilateral en erectores de columna.",
      palpacionHallazgos: "Puntos gatillo activos en cuadrado lumbar derecho y glúteo medio. Sensibilidad aumentada al tacto.",
      romMedido: "Flexión de cadera activa limitada a 50 grados por dolor (prueba de SLR positiva a 45 grados en pierna derecha).",
      fuerzaDaniels: "Flexores de cadera 4/5, Extensores de rodilla 5/5, Dorsiflexores de tobillo 5/5.",
      pruebasEspeciales: "Prueba de Lasegue (SLR) Positiva a 45 grados lado derecho. Prueba de Bragard Positiva.",
      agentesFisicos: "TENS convencional por 15 minutos en región lumbar para modulación de dolor. Termoterapia superficial (compresa húmedo-caliente).",
      terapiaManual: "Liberación miofascial instrumental en cuadrado lumbar y técnicas de energía muscular en glúteo medio derecho.",
      ejercicioTerapeutico: "Ejercicios de extensión pasiva tipo McKenzie (3 series de 10 repeticiones), estiramiento suave de piramidal y báscula pélvica.",
      sesionesSugeridas: 10,
      soapSubjetivo: "Paciente reporta dolor punzante en zona lumbar que se corre al glúteo derecho. Califica el dolor en un 7 de 10.",
      soapObjetivo: "Espasmo severo paravertebral. SLR positivo a 45°. Limitación de rangos mecánicos de flexión.",
      soapAnalisis: "Lumbociatalgia de origen mecánico-discal. Responde favorablemente a la descompresión pasiva McKenzie.",
      soapPlan: "Continuar 2 veces por semana. Priorizar control de dolor y reeducación postural. Tareas en casa: Extensiones McKenzie cada 4 horas."
    },
    anotacionesGenerales: "Paciente colaborativo. Se le indica no realizar cargas axiales pesadas en el gimnasio hasta nueva orden clínica."
  }
];

export const defaultCitas: Cita[] = [
  {
    id: 1,
    idCompania: 1,
    idPaciente: 1,
    idUsuarioNutricionista: 1,
    idConsulta: 2,
    fechaHora: "2026-07-17T09:00",
    duracionMinutos: 45,
    estadoCita: "COMPLETADA",
    notas: "Paciente asiste puntual. Presenta lumbociatalgia aguda.",
    confirmacionEnviadaEn: "2026-07-16T10:00:00Z",
    recordatorioEnviadoEn: "2026-07-16T18:00:00Z",
    tipoVisita: "CONSULTORIO"
  },
  {
    id: 2,
    idCompania: 1,
    idPaciente: 1,
    idUsuarioNutricionista: 1,
    idConsulta: null,
    fechaHora: "2026-07-18T10:30",
    duracionMinutos: 30,
    estadoCita: "PROGRAMADA",
    notas: "Seguimiento de terapia de McKenzie y agentes físicos.",
    confirmacionEnviadaEn: "2026-07-17T11:00:00Z",
    tipoVisita: "CONSULTORIO"
  },
  {
    id: 3,
    idCompania: 2,
    idPaciente: 2,
    idUsuarioNutricionista: 2,
    idConsulta: null,
    fechaHora: "2026-07-17T14:00",
    duracionMinutos: 60,
    estadoCita: "CONFIRMADA",
    notas: "Evaluación inicial de plan nutricional por sospecha de celiaquía.",
    confirmacionEnviadaEn: "2026-07-16T15:00:00Z",
    recordatorioEnviadoEn: "2026-07-16T19:00:00Z",
    tipoVisita: "CONSULTORIO"
  },
  {
    id: 4,
    idCompania: 1,
    idPaciente: 1,
    idUsuarioNutricionista: 1,
    idConsulta: null,
    fechaHora: "2026-07-20T16:00",
    duracionMinutos: 45,
    estadoCita: "PROGRAMADA",
    notas: "Tercera sesión. Monitoreo de respuesta de dolor.",
    tipoVisita: "CONSULTORIO"
  }
];

export const defaultSmtpConfigs: CompaniaSmtpConfig[] = [
  {
    id: 1,
    idCompania: 1,
    proveedor: "GMAIL",
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpSeguridad: "TLS",
    smtpUsuario: "fisionutri.notificaciones@gmail.com",
    smtpPasswordCifrado: "••••••••••••••••",
    remitenteNombre: "Clínica FisioNutri Escazú",
    remitenteCorreo: "contacto@fisionutriescazu.com",
    recordatorioHorasAntes: 24,
    activo: true
  },
  {
    id: 2,
    idCompania: 2,
    proveedor: "OTRO",
    smtpHost: "mail.elronutri.com",
    smtpPort: 465,
    smtpSeguridad: "SSL",
    smtpUsuario: "citas@elronutri.com",
    smtpPasswordCifrado: "••••••••••••••••",
    remitenteNombre: "Clínica Elronutri Alajuela",
    remitenteCorreo: "eliecer.rojas9@gmail.com",
    recordatorioHorasAntes: 12,
    activo: false
  }
];

export const defaultNotificationLogs: NotificationLog[] = [
  {
    id: 1,
    idCompania: 1,
    idCita: 1,
    tipo: "CONFIRMACION",
    destinatario: "keneth.rojas@hotmail.com",
    asunto: "Confirmación de Cita - FisioNutri Escazú",
    cuerpo: "Hola Keneth Rojas Delgado, tu cita ha sido programada con éxito para el 2026-07-17 a las 09:00 en FisioNutri Escazú. Gracias por confiar en nosotros.",
    enviadoEn: "2026-07-16T10:00:00Z"
  },
  {
    id: 2,
    idCompania: 1,
    idCita: 1,
    tipo: "RECORDATORIO",
    destinatario: "keneth.rojas@hotmail.com",
    asunto: "Recordatorio de Cita de Salud - FisioNutri Escazú",
    cuerpo: "Estimado Keneth Rojas Delgado, te recordamos tu cita de mañana 2026-07-17 a las 09:00 en nuestra sucursal de Escazú. Por favor asistir 5 minutos antes.",
    enviadoEn: "2026-07-16T18:00:00Z"
  }
];

export interface CalendarBlock {
  id: number;
  idCompania: number;
  idUsuarioNutricionista: number;
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string; // YYYY-MM-DD
  horaInicio: string | null; // HH:MM
  horaFin: string | null; // HH:MM
  motivo: string;
}

export const defaultCalendarBlocks: CalendarBlock[] = [];

export interface PorcentajeDieta {
  id: number;
  idCompania: number;
  porcentaje: number;
}

export const defaultPorcentajesDieta: PorcentajeDieta[] = [];

export interface PlantillaDieta {
  id: number;
  idCompania: number;
  nombre: string;
  direccion: DireccionPrescripcion;
  caloriaMin: number;
  caloriaMax: number;
  carbohidratosPct: number | null;
  proteinasPct: number | null;
  grasasPct: number | null;
  desayuno: string;
  meriendaManana: string;
  almuerzo: string;
  meriendaTarde: string;
  cena: string;
  indicaciones: string;
}

export const defaultPlantillasDieta: PlantillaDieta[] = [];

export interface HaciendaConfig {
  idCompania: number;
  ambiente: 'SANDBOX' | 'PRODUCCION' | 'PRUEBAS_LOCAL';
  usuarioAtv: string;
  tienePasswordAtv: boolean;
  tieneCertificado: boolean;
  certificadoNombreArchivo: string | null;
  certificadoVenceEn: string | null; // YYYY-MM-DD
  // Último consecutivo emitido de Factura / Nota de Crédito / Nota de Débito (el siguiente es +1).
  ultimoConsecutivo: number;
  ultimoConsecutivoNc: number;
  ultimoConsecutivoNd: number;
}

export type HaciendaConfigInput = {
  idCompania: number;
  ambiente: 'SANDBOX' | 'PRODUCCION' | 'PRUEBAS_LOCAL';
  usuarioAtv: string;
  passwordAtv?: string; // solo cuando el usuario escribe una nueva
  certificadoP12Base64?: string; // solo cuando el usuario sube un nuevo archivo .p12
  certificadoNombreArchivo?: string; // nombre del archivo nuevo, acompaña a certificadoP12Base64
  certificadoPin?: string; // solo cuando el usuario escribe un nuevo PIN
  // Corrección de numeración (solo Administrador, solo puede subir): ver POST /api/hacienda-config.
  ultimoConsecutivo?: number;
  ultimoConsecutivoNc?: number;
  ultimoConsecutivoNd?: number;
};

export interface CompanyPayment {
  id: number;
  idCompania: number;
  fecha: string; // 'YYYY-MM-DD'
  monto: number;
  notas: string;
  registradoPor: string;
}

export const defaultCompanyPayments: CompanyPayment[] = [];

// Códigos de Unidad de Medida de Hacienda. "Sp" = Servicios Profesionales, "Spe" = Servicios
// Personales, "St" = Servicios Técnicos, "Os" = Otros Servicios, "h" = horas — para SERVICIO.
// "Unid" = Unidad — para ARTICULO (venta de bienes con existencias).
export type UnidadMedidaServicio = 'Sp' | 'Spe' | 'St' | 'Os' | 'h' | 'Unid';

// Catálogo único de items facturables: cubre tanto SERVICIO (sesiones/citas, sin existencias)
// como ARTICULO (bienes físicos con control de stock — suplementos, cremas, equipo de venta).
// Un mismo negocio (p.ej. una clínica que también vende productos) usa esta única tabla para
// ambos, distinguidos por `tipo` — los campos de stock solo aplican/se validan para ARTICULO.
export type TipoServicio = 'SERVICIO' | 'ARTICULO';

export interface Servicio {
  id: number;
  idCompania: number;
  tipo: TipoServicio;
  nombre: string;
  precio: number;
  porcentajeIva: number | null; // null => usa el ivaPorDefecto de la empresa
  duracionMinutos: number; // duración de la sesión/cita — solo aplica a SERVICIO (0 en ARTICULO)
  codigoCabys: string | null; // código CABYS de 13 dígitos — obligatorio para poder facturar este servicio
  unidadMedida: UnidadMedidaServicio;
  activo: boolean;
  modalidad?: 'CONSULTORIO' | 'DOMICILIO' | 'AMBOS'; // tipo de visita en que se ofrece; undefined = 'AMBOS'
  // Solo ARTICULO:
  stock: number | null; // existencias actuales; null para SERVICIO (no aplica)
  stockMinimo: number | null; // punto de reorden — null desactiva la alerta de faltante
  costoUnitario: number | null; // costo de compra, para margen y valorización de inventario
  codigoBarras: string | null;
}

export const defaultServicios: Servicio[] = [];

export type TipoMovimientoInventario = 'VENTA' | 'COMPRA' | 'AJUSTE' | 'DEVOLUCION_VENTA' | 'DEVOLUCION_COMPRA';

export interface MovimientoInventario {
  id: number;
  idCompania: number;
  idServicio: number;
  tipo: TipoMovimientoInventario;
  cantidad: number; // delta: negativo resta stock, positivo lo suma
  stockResultante: number;
  referencia: string | null; // p.ej. "Factura #123"
  notas: string | null;
  creadoPor: string | null;
  creadoEn: string; // ISO 8601
}

export interface FacturaLinea {
  idServicio: number | null;
  tipo: TipoServicio; // copiado del servicio al momento de facturar — el tipo del catálogo puede cambiar después
  codigoCabys: string;
  detalle: string; // nombre del servicio/artículo al momento de facturar (ver calcularLineas en server/haciendaFactura.ts)
  unidadMedida: UnidadMedidaServicio;
  cantidad: number;
  precioUnitario: number;
  porcentajeIva: number;
  codigoTarifaIva: string;
  montoIva: number;
  subTotal: number; // cantidad * precioUnitario
  montoTotalLinea: number; // subTotal + montoIva
}

export type EstadoFactura = 'FIRMADA' | 'ENVIADA' | 'ACEPTADA' | 'RECHAZADA' | 'ERROR' | 'ANULADA' | 'SIMULADA';
// 01 = Factura Electrónica, 02 = Nota de Débito Electrónica, 03 = Nota de Crédito Electrónica
export type TipoDocumentoFactura = '01' | '02' | '03';

export interface Factura {
  id: number;
  idCompania: number;
  idCita: number | null;
  idConsulta: number | null; // solo en Facturas (no en NC/ND) — impide refacturar la misma consulta (UNIQUE en BD)
  idPaciente: number;
  clave: string; // 50 dígitos
  consecutivo: string; // 20 dígitos
  fechaEmision: string; // ISO 8601 con offset
  ambiente: 'SANDBOX' | 'PRODUCCION' | 'PRUEBAS_LOCAL';
  lineas: FacturaLinea[];
  subtotal: number;
  totalIva: number;
  total: number;
  estado: EstadoFactura;
  mensajeError: string | null;
  creadaEn: string;
  condicionVenta: string; // '01' contado, '02' crédito, etc. — catálogo de Hacienda
  tipoDocumento: TipoDocumentoFactura;
  idFacturaReferencia: number | null; // solo en NC/ND: id de la Factura que referencian
  motivoAnulacion: string | null; // en NC/ND: motivo del ajuste; en una Factura ANULADA: motivo de la anulación
  medioPago: string; // '01' Efectivo, '02' Tarjeta, '06' SINPE Móvil — catálogo de Hacienda
  montoRecibido: number | null; // solo informativo, para trazabilidad del vuelto entregado
  plazoCredito?: number | null; // días de crédito con que se emitió (solo condicionVenta '02')
}

// CXC — Cuentas por Cobrar. Se crea automáticamente al facturar con condicionVenta='02'
// (crédito); "VENCIDA" no se guarda como tal, se deriva comparando fechaVencimiento contra hoy
// (igual que en POS-RESTAURANTE) para no depender de un cron que la actualice.
export type EstadoCuentaCobrar = 'PENDIENTE' | 'PAGADA' | 'ANULADA';

export interface CuentaCobrar {
  id: number;
  idCompania: number;
  idFactura: number;
  facturaConsecutivo: string;
  idPaciente: number;
  fechaEmision: string; // 'YYYY-MM-DD'
  fechaVencimiento: string; // 'YYYY-MM-DD'
  plazoDias: number;
  montoTotal: number;
  saldoPendiente: number;
  estado: EstadoCuentaCobrar;
  creadaEn: string;
  pagos: PagoCuentaCobrar[];
}

export interface PagoCuentaCobrar {
  id: number;
  idCompania: number;
  idCuentaCobrar: number;
  fecha: string; // 'YYYY-MM-DD'
  monto: number;
  medioPago: string; // catálogo Hacienda: '01' Efectivo, '02' Tarjeta, '03' Transferencia/SINPE, '04' Cheque
  referencia: string | null;
  registradoPor: string | null;
  creadoEn: string;
}

export const defaultFacturas: Factura[] = [];

// CXP — Cuentas por Pagar (proveedores). A diferencia de CXC (que solo nace de una factura de
// venta), aquí la cuenta por pagar SÍ se crea manualmente — no hay "factura electrónica de
// compra" en esta app, el usuario registra lo que el proveedor le facturó en papel/PDF.
export interface Proveedor {
  id: number;
  idCompania: number;
  tipoIdentificacion: '01' | '02' | '03' | '04'; // catálogo Hacienda: Física/Jurídica/DIMEX/NITE
  identificacion: string;
  nombre: string;
  correo: string | null;
  telefono: string | null;
  direccion: string | null;
  activo: boolean;
  creadoEn: string;
}

export interface LineaCuentaPagar {
  idServicio: number;
  nombre: string; // copiado al momento de la compra — el nombre del artículo puede cambiar después
  cantidad: number;
  costoUnitario: number;
}

export type EstadoCuentaPagar = 'PENDIENTE' | 'PAGADA' | 'ANULADA';

export interface CuentaPagar {
  id: number;
  idCompania: number;
  idProveedor: number;
  numeroFacturaProveedor: string | null;
  esServicio: boolean; // true = gasto sin impacto en inventario (alquiler, servicios profesionales...)
  lineas: LineaCuentaPagar[]; // solo cuando esServicio=false — alimenta el inventario
  fechaRegistro: string; // 'YYYY-MM-DD'
  fechaVencimiento: string; // 'YYYY-MM-DD'
  plazoDias: number;
  montoTotal: number;
  saldoPendiente: number;
  estado: EstadoCuentaPagar;
  ivaAcreditable: number; // IVA de la factura de compra recibida — crédito fiscal para el D-104, se ingresa a mano
  notas: string | null;
  creadaEn: string;
  pagos: PagoCuentaPagar[];
}

export interface PagoCuentaPagar {
  id: number;
  idCompania: number;
  idCuentaPagar: number;
  fecha: string; // 'YYYY-MM-DD'
  monto: number;
  medioPago: string; // catálogo Hacienda: '01' Efectivo, '02' Tarjeta, '03' Transferencia/SINPE, '04' Cheque
  referencia: string | null;
  registradoPor: string | null;
  creadoEn: string;
}

// Reportes fiscales D-104 (IVA mensual) y D-101 (Renta anual). Se calculan siempre en el
// servidor a partir de facturas/notas de crédito/CXP — nunca se aceptan totales calculados en
// el cliente, ni siquiera al "cerrar" un período (ver POST /api/reportes/d104/cerrar).
export interface TarifaIvaDesglose {
  base: number;
  iva: number;
}

export interface ReporteD104 {
  periodo: string; // 'YYYY-MM'
  regimenSimplificado: boolean;
  tarifas: {
    t13: TarifaIvaDesglose;
    t4: TarifaIvaDesglose;
    t2: TarifaIvaDesglose;
    t1: TarifaIvaDesglose;
    exento: TarifaIvaDesglose;
  };
  debitoFiscal: number; // suma de IVA de todas las tarifas (ventas + notas de débito - notas de crédito del período)
  creditoFiscal: number; // IVA acreditable de compras (CXP) registradas en el período
  saldoAPagar: number; // debitoFiscal - creditoFiscal (negativo = saldo a favor)
  cantidadFacturas: number;
  cantidadNotasCredito: number;
  cantidadNotasDebito: number;
  yaCerrado: boolean;
  fechaCierre: string | null;
}

export interface GastosManualesAnuales {
  alquileres: number;
  servicios: number;
  planilla: number;
  otros: number;
}

export interface ReporteD101 {
  anio: number;
  regimenSimplificado: boolean;
  tipoContribuyente: 'fisica' | 'juridica';
  ventasNetas: number;
  ivaAnual: number;
  comprasCxP: number; // derivado de Cuentas por Pagar del año, sin el IVA acreditable (va al D-104)
  gastosManuales: GastosManualesAnuales;
  totalGastosDeducibles: number;
  utilidadNeta: number;
  impuestoRenta: number;
  tramos: string[];
  referenciaTramos?: string | null; // decreto de los tramos usados; ausente en cierres guardados antes de parametrizarlos
  cantidadFacturas: number;
  cantidadNotasCredito?: number; // opcional: los cierres guardados antes de este campo no lo traen
  cantidadNotasDebito: number;
  yaCerrado: boolean;
  fechaCierre: string | null;
}

export interface CierreFiscal {
  id: number;
  idCompania: number;
  tipo: 'D104' | 'D101';
  periodo: string;
  datos: ReporteD104 | ReporteD101;
  creadoPor: string | null;
  creadoEn: string;
}
