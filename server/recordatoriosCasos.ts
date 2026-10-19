import { fechaCR, fechaHoraCR, sumarDiasCR } from "../src/utils/fechaCR";
import type { CasoLegal } from "../src/data/mockData";

/**
 * ¿Le toca hoy a este caso el correo de documentos pendientes? Pura: el reloj entra por parámetro.
 * Los N días se cuentan en días calendario de Costa Rica (no en horas), así el envío cae en la
 * primera pasada hábil del día N en vez de correrse una hora cada vez.
 */
export function tocaRecordatorio(
  caso: Pick<CasoLegal, "estado" | "recordatorioCadaDias" | "ultimoRecordatorioEn">,
  pendientes: number,
  ahora: Date = new Date()
): boolean {
  if (caso.estado !== "ABIERTO" || caso.recordatorioCadaDias <= 0 || pendientes <= 0) return false;
  const horaCR = parseInt(fechaHoraCR(ahora).slice(11, 13), 10);
  if (horaCR < 8 || horaCR >= 18) return false; // no escribirle al cliente de madrugada
  if (!caso.ultimoRecordatorioEn) return true;
  return fechaCR(ahora) >= sumarDiasCR(fechaCR(new Date(caso.ultimoRecordatorioEn)), caso.recordatorioCadaDias);
}
