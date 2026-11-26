// Generador iCalendar (RFC 5545) sin dependencias. Se usa para la suscripción de calendario del
// profesional (METHOD:PUBLISH) y para el adjunto "cita.ics" de los correos al paciente
// (METHOD:REQUEST / METHOD:CANCEL).
//
// Las citas guardan `fechaHora` ("YYYY-MM-DDTHH:MM") en hora local de Costa Rica (UTC-06:00 todo el
// año, sin horario de verano); aquí se convierte a UTC sumando 6 horas.
//
// PRIVACIDAD: este módulo NUNCA lee `cita.notas` (ni ningún dato clínico). La descripción solo lleva
// tipo de visita, estado y, si se pidió, el teléfono del paciente.

const OFFSET_CR_MIN = 6 * 60;
const DOMINIO_DEFECTO = "control-clinico";
const MAX_OCTETOS_LINEA = 75;

export type EstadoIcs = "CONFIRMED" | "TENTATIVE" | "CANCELLED";
export type MetodoIcs = "PUBLISH" | "REQUEST" | "CANCEL";

export interface EventoIcs {
  uid: string;
  inicio: Date;
  fin: Date;
  titulo: string;
  descripcion?: string;
  ubicacion?: string;
  estado: EstadoIcs;
  sequence: number;
  dtstamp: Date;
}

export interface CitaIcs {
  id: number;
  fechaHora: string; // "YYYY-MM-DDTHH:MM" hora de Costa Rica
  duracionMinutos: number;
  estadoCita: string;
  tipoVisita: "CONSULTORIO" | "DOMICILIO";
  direccionDomicilio?: string | null;
  // Marcas de envío de notificaciones: únicas fechas de modificación disponibles para derivar SEQUENCE.
  confirmacionEnviadaEn?: string | null;
  cancelacionEnviadaEn?: string | null;
}

export interface OpcionesEvento {
  audiencia: "PROFESIONAL" | "PACIENTE";
  nombreClinica: string;
  servicio?: string | null;
  nombrePaciente?: string | null;
  telefonoPaciente?: string | null;
  /** Solo audiencia PROFESIONAL: true = nombre completo y teléfono; false = solo iniciales. */
  nombreCompleto?: boolean;
  dominio?: string;
  /** Si viene, se usa tal cual; si no, se deriva de las marcas de envío de la cita (o 0). */
  sequence?: number;
  /** Fuerza STATUS:CANCELLED (correo de cancelación). */
  cancelar?: boolean;
  ahora?: Date;
}

/** Convierte "YYYY-MM-DDTHH:MM" (hora de Costa Rica) al instante UTC correspondiente. */
export function fechaHoraCRaUtc(fechaHora: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(fechaHora);
  if (!m) throw new Error(`Fecha y hora inválidas: ${fechaHora}`);
  const [y, mes, d, h, min] = m.slice(1).map(Number);
  return new Date(Date.UTC(y, mes - 1, d, h, min) + OFFSET_CR_MIN * 60_000);
}

/** "YYYYMMDDTHHMMSSZ" en UTC. */
export function formatoFechaIcs(fecha: Date): string {
  return fecha.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

/** Escapa un valor TEXT: \ ; , y saltos de línea. */
export function escaparTextoIcs(valor: string): string {
  return valor
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Pliega una línea a 75 octetos (UTF-8) sin partir caracteres; las continuaciones empiezan con un espacio. */
export function plegarLineaIcs(linea: string): string {
  if (Buffer.byteLength(linea, "utf8") <= MAX_OCTETOS_LINEA) return linea;
  const partes: string[] = [];
  let actual = "";
  let octetos = 0;
  let limite = MAX_OCTETOS_LINEA;
  for (const caracter of linea) {
    const n = Buffer.byteLength(caracter, "utf8");
    if (octetos + n > limite) {
      partes.push(actual);
      actual = "";
      octetos = 0;
      limite = MAX_OCTETOS_LINEA - 1; // el espacio inicial de la continuación cuenta como octeto
    }
    actual += caracter;
    octetos += n;
  }
  if (actual) partes.push(actual);
  return partes.join("\r\n ");
}

/** Iniciales con puntos: "María José Rodríguez" -> "M.J.R." */
export function inicialesDe(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return "";
  return palabras.map(p => Array.from(p)[0].toUpperCase() + ".").join("");
}

function dominioSeguro(dominio?: string): string {
  const d = (dominio || "").trim().toLowerCase();
  return /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(d) ? d : DOMINIO_DEFECTO;
}

export function uidDeCita(idCita: number, dominio?: string): string {
  return `cita-${idCita}@${dominioSeguro(dominio)}`;
}

export function estadoIcsDeCita(estadoCita: string): EstadoIcs {
  if (estadoCita === "CANCELADA") return "CANCELLED";
  if (estadoCita === "PROGRAMADA") return "TENTATIVE";
  return "CONFIRMED";
}

const ESTADO_LEGIBLE: Record<string, string> = {
  PROGRAMADA: "Programada (pendiente de confirmar)",
  CONFIRMADA: "Confirmada",
  CANCELADA: "Cancelada",
  COMPLETADA: "Completada",
  NO_ASISTIO: "No asistió",
};

function epochSegundos(iso?: string | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

/** SEQUENCE a partir de las marcas de envío (no hay columna de modificación); una cancelada sube 1. */
function secuenciaDerivada(cita: CitaIcs, cancelada: boolean): number {
  const base = Math.max(epochSegundos(cita.confirmacionEnviadaEn), epochSegundos(cita.cancelacionEnviadaEn));
  return cancelada ? base + 1 : base;
}

/** Arma el evento de una cita. No usa `notas`. */
export function eventoDesdeCita(cita: CitaIcs, opciones: OpcionesEvento): EventoIcs {
  const inicio = fechaHoraCRaUtc(cita.fechaHora);
  const fin = new Date(inicio.getTime() + Math.max(1, cita.duracionMinutos || 0) * 60_000);
  const estado: EstadoIcs = opciones.cancelar ? "CANCELLED" : estadoIcsDeCita(cita.estadoCita);
  const servicio = opciones.servicio?.trim() || "";
  const nombre = (opciones.nombrePaciente || "").trim();

  const ubicacion = cita.tipoVisita === "DOMICILIO" && cita.direccionDomicilio?.trim()
    ? cita.direccionDomicilio.trim()
    : `Consultorio ${opciones.nombreClinica}`;

  let titulo: string;
  let descripcion: string;
  if (opciones.audiencia === "PACIENTE") {
    titulo = `Cita en ${opciones.nombreClinica}${servicio ? ` · ${servicio}` : ""}`;
    descripcion = [
      servicio ? `Servicio: ${servicio}` : "",
      `Tipo de visita: ${cita.tipoVisita === "DOMICILIO" ? "A domicilio" : "En consultorio"}`,
    ].filter(Boolean).join("\n");
  } else {
    const completo = opciones.nombreCompleto === true;
    const quien = completo ? nombre : inicialesDe(nombre);
    titulo = `${servicio || "Cita"}${quien ? ` · ${quien}` : ""}`;
    const lineas = [
      `Tipo de visita: ${cita.tipoVisita === "DOMICILIO" ? "A domicilio" : "En consultorio"}`,
      `Estado: ${ESTADO_LEGIBLE[cita.estadoCita] || cita.estadoCita}`,
    ];
    if (completo && opciones.telefonoPaciente?.trim()) lineas.push(`Teléfono: ${opciones.telefonoPaciente.trim()}`);
    descripcion = lineas.join("\n");
  }

  return {
    uid: uidDeCita(cita.id, opciones.dominio),
    inicio,
    fin,
    titulo,
    descripcion,
    ubicacion,
    estado,
    sequence: opciones.sequence ?? secuenciaDerivada(cita, estado === "CANCELLED"),
    dtstamp: opciones.ahora ?? new Date(),
  };
}

/**
 * Adjunto "cita.ics" para el correo al paciente. REQUEST crea/actualiza el evento y CANCEL lo elimina;
 * ambos con el mismo UID y un SEQUENCE creciente (epoch en segundos) para que el calendario del
 * paciente lo reemplace.
 */
export function adjuntoIcsParaPaciente(
  cita: CitaIcs,
  datos: { nombreClinica: string; servicio?: string | null; cancelar: boolean; dominio?: string; ahora?: Date }
): { filename: string; content: string; contentType: string } {
  const ahora = datos.ahora ?? new Date();
  const evento = eventoDesdeCita(cita, {
    audiencia: "PACIENTE",
    nombreClinica: datos.nombreClinica,
    servicio: datos.servicio,
    dominio: datos.dominio,
    cancelar: datos.cancelar,
    sequence: Math.floor(ahora.getTime() / 1000),
    ahora,
  });
  const metodo: MetodoIcs = datos.cancelar ? "CANCEL" : "REQUEST";
  return {
    filename: "cita.ics",
    content: generarCalendarioIcs({ nombreCalendario: datos.nombreClinica, eventos: [evento], metodo }),
    contentType: `text/calendar; charset=utf-8; method=${metodo}`,
  };
}

/** Genera el documento iCalendar completo (líneas separadas por CRLF, con CRLF final). */
export function generarCalendarioIcs(params: {
  nombreCalendario: string;
  eventos: EventoIcs[];
  metodo?: MetodoIcs;
}): string {
  const metodo = params.metodo ?? "PUBLISH";
  const lineas: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Control Clinico//Citas//ES",
    "CALSCALE:GREGORIAN",
    `METHOD:${metodo}`,
  ];
  if (metodo === "PUBLISH") {
    // Solo para la suscripción: nombre del calendario y frecuencia de actualización sugerida.
    lineas.push(
      `X-WR-CALNAME:${escaparTextoIcs(params.nombreCalendario)}`,
      "X-WR-TIMEZONE:America/Costa_Rica",
      "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
      "X-PUBLISHED-TTL:PT15M",
    );
  }

  for (const e of params.eventos) {
    lineas.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${formatoFechaIcs(e.dtstamp)}`,
      `DTSTART:${formatoFechaIcs(e.inicio)}`,
      `DTEND:${formatoFechaIcs(e.fin)}`,
      `SEQUENCE:${Math.max(0, Math.trunc(e.sequence))}`,
      `STATUS:${e.estado}`,
      `SUMMARY:${escaparTextoIcs(e.titulo)}`,
    );
    if (e.descripcion) lineas.push(`DESCRIPTION:${escaparTextoIcs(e.descripcion)}`);
    if (e.ubicacion) lineas.push(`LOCATION:${escaparTextoIcs(e.ubicacion)}`);
    if (e.estado !== "CANCELLED") {
      lineas.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escaparTextoIcs(e.titulo)}`,
        "TRIGGER:-PT30M",
        "END:VALARM",
      );
    }
    lineas.push("END:VEVENT");
  }

  lineas.push("END:VCALENDAR");
  return lineas.map(plegarLineaIcs).join("\r\n") + "\r\n";
}
