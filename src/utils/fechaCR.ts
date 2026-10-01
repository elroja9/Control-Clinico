// Fechas en hora de Costa Rica (UTC-06:00 todo el año: no hay horario de verano). Compartido por
// el servidor y el navegador.
//
// No sirve `new Date().toISOString().split("T")[0]`: eso es la fecha UTC, que después de las 6 p.m.
// en Costa Rica ya es el día siguiente. Con eso una compra registrada el último día del mes a las
// 7 p.m. caía en el D-104 del mes siguiente, y una cuenta se mostraba vencida un día antes.

const OFFSET_CR_MS = 6 * 60 * 60 * 1000;

/** "YYYY-MM-DDTHH:mm:ss-06:00" — el formato de <FechaEmision> que exige Hacienda. */
export function fechaHoraCR(fecha: Date = new Date()): string {
  return new Date(fecha.getTime() - OFFSET_CR_MS).toISOString().replace(/\.\d+Z$/, "") + "-06:00";
}

/** "YYYY-MM-DD" del día en Costa Rica. */
export function fechaCR(fecha: Date = new Date()): string {
  return fechaHoraCR(fecha).slice(0, 10);
}

/** Suma días a una fecha "YYYY-MM-DD" y devuelve otra "YYYY-MM-DD" (aritmética de calendario, sin husos). */
export function sumarDiasCR(fechaYmd: string, dias: number): string {
  const d = new Date(`${fechaYmd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
