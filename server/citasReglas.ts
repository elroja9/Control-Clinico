// Reglas puras de la agenda de citas (sin acceso a base de datos), separadas de server.ts para
// poder probarlas con vitest.
import type { CalendarBlock, Cita } from "../src/data/mockData";
import { fechaHoraCR } from "../src/utils/fechaCR";

export type EstadoCita = Cita["estadoCita"];

export const ESTADOS_CITA: readonly EstadoCita[] = ["PROGRAMADA", "CONFIRMADA", "CANCELADA", "COMPLETADA", "NO_ASISTIO"];

/** PROGRAMADA y CONFIRMADA son las citas "vivas": ocupan agenda y deben ser a futuro. */
export function esEstadoActivo(estado: string): boolean {
  return estado === "PROGRAMADA" || estado === "CONFIRMADA";
}

export function minutosDesdeMedianoche(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** "YYYY-MM-DDTHH:MM" (formato de Cita.fechaHora). */
export function esFechaHoraValida(fechaHora: unknown): fechaHora is string {
  if (typeof fechaHora !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(fechaHora)) return false;
  const [f, h] = fechaHora.split("T");
  const d = new Date(`${f}T00:00:00Z`);
  if (isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== f) return false;
  const [hh, mm] = h.split(":").map(Number);
  return hh < 24 && mm < 60;
}

/** true si fechaHora ("YYYY-MM-DDTHH:MM", hora de Costa Rica) es anterior al minuto actual en Costa Rica. */
export function fechaHoraEsPasada(fechaHora: string, ahora: Date = new Date()): boolean {
  return fechaHora.slice(0, 16) < fechaHoraCR(ahora).slice(0, 16);
}

export interface CitaOcupacion {
  id?: number;
  fechaHora: string;
  duracionMinutos: number;
  tipoVisita: string;
  tiempoTrasladoMinutos: number | null;
  estadoCita?: string;
}

/**
 * true si el intervalo candidato [inicio, inicio+duracion) choca con alguna cita del profesional.
 * Las citas CANCELADAS no ocupan agenda. Las citas a domicilio reservan además su tiempo de
 * traslado antes y después. `excluirId` omite la propia cita al editarla.
 */
export function haySolapeConCitas(params: {
  candidatoInicioMin: number;
  duracionMin: number;
  fecha: string;
  citasDelDia: CitaOcupacion[];
  excluirId?: number | null;
}): boolean {
  const { candidatoInicioMin, duracionMin, fecha, citasDelDia, excluirId } = params;
  const candidatoFinMin = candidatoInicioMin + duracionMin;
  for (const c of citasDelDia) {
    if (c.estadoCita === "CANCELADA") continue;
    if (excluirId != null && c.id === excluirId) continue;
    const [citaFecha, citaHora] = c.fechaHora.split("T");
    if (citaFecha !== fecha || !citaHora) continue;
    const citaInicioMin = minutosDesdeMedianoche(citaHora);
    const padding = c.tipoVisita === "DOMICILIO" ? (c.tiempoTrasladoMinutos || 0) : 0;
    const ocupadoInicio = citaInicioMin - padding;
    const ocupadoFin = citaInicioMin + c.duracionMinutos + padding;
    if (candidatoInicioMin < ocupadoFin && candidatoFinMin > ocupadoInicio) return true;
  }
  return false;
}

export function slotLibre(params: {
  candidatoInicioMin: number;
  duracionMin: number;
  citasDelDia: CitaOcupacion[];
  bloqueosDelDia: CalendarBlock[];
  fecha: string;
  horaCandidato: string;
  tramos: Array<{ abre: string; cierra: string }>;
}): boolean {
  const { candidatoInicioMin, duracionMin, citasDelDia, bloqueosDelDia, fecha, horaCandidato, tramos } = params;
  const candidatoFinMin = candidatoInicioMin + duracionMin;

  // generarSlotsCandidatos() solo genera horas de INICIO anteriores al cierre — no garantiza
  // que la cita quepa completa antes de cerrar. Con horario fraccionado, la cita completa debe
  // caber dentro de UN solo tramo (esto cubre también el límite inferior: no antes de abrir).
  const cabeEnUnTramo = tramos.some(t =>
    candidatoInicioMin >= minutosDesdeMedianoche(t.abre) && candidatoFinMin <= minutosDesdeMedianoche(t.cierra)
  );
  if (!cabeEnUnTramo) return false;

  for (const b of bloqueosDelDia) {
    if (fecha < b.fechaInicio || fecha > b.fechaFin) continue;
    if (!b.horaInicio || !b.horaFin) return false;
    if (horaCandidato >= b.horaInicio && horaCandidato < b.horaFin) return false;
  }

  return !haySolapeConCitas({ candidatoInicioMin, duracionMin, fecha, citasDelDia });
}

/**
 * Valida el cambio de estado de una cita. Devuelve el mensaje de error (en español) o null si es
 * válido. `anterior` es null al crear la cita.
 */
export function validarTransicionEstado(
  anterior: EstadoCita | null,
  nuevo: EstadoCita,
  opciones: { facturada?: boolean } = {}
): string | null {
  if (anterior === nuevo) return null;
  if (anterior === "CANCELADA" && nuevo === "COMPLETADA") {
    return "Una cita cancelada no puede pasar directamente a completada. Reprográmela primero.";
  }
  if (anterior === "COMPLETADA" && nuevo === "CANCELADA" && opciones.facturada) {
    return "No se puede cancelar una cita completada que ya fue facturada.";
  }
  return null;
}
