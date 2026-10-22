// Impuesto sobre la Renta (D-101) de Costa Rica. Los tramos no viven en el código: se guardan por
// período fiscal en la tabla parametros_renta (los mantiene el administrador SaaS cuando Hacienda
// publica el decreto anual) y llegan aquí como ParametrosRenta.

/** [hasta (renta neta anual), tasa 0..1]; hasta = null en el último tramo (sin tope). */
export type EscalaRenta = Array<[number | null, number]>;

export interface ParametrosRenta {
  anio: number;
  escalaFisica: EscalaRenta;
  /** Escala reducida de personas jurídicas: solo aplica con ingresos brutos hasta el tope. */
  escalaJuridica: EscalaRenta;
  topeIngresosEscalaReducida: number;
  /** Tarifa plana sobre toda la renta neta de una persona jurídica que supera el tope. */
  tarifaGeneralJuridica: number;
  referenciaLegal: string;
  actualizadoEn: string | null;
}

const fmt = (n: number) => `₡${Math.round(n).toLocaleString("es-CR")}`;
const pct = (t: number) => `${Math.round(t * 10000) / 100}%`;

/** Devuelve el primer problema de los parámetros, o null si son válidos. */
export function validarParametrosRenta(p: ParametrosRenta): string | null {
  if (!Number.isInteger(p.anio) || p.anio < 2000 || p.anio > 2100) return "Año fiscal inválido.";
  for (const [nombre, escala] of [["persona física", p.escalaFisica], ["persona jurídica", p.escalaJuridica]] as const) {
    if (!Array.isArray(escala) || escala.length === 0) return `La escala de ${nombre} no tiene tramos.`;
    let anterior = 0;
    for (let i = 0; i < escala.length; i++) {
      const [hasta, tasa] = escala[i];
      const ultimo = i === escala.length - 1;
      if (!Number.isFinite(tasa) || tasa < 0 || tasa > 1) return `Tramo ${i + 1} de ${nombre}: la tasa debe estar entre 0% y 100%.`;
      if (ultimo ? hasta !== null : !(Number.isFinite(hasta) && (hasta as number) > anterior)) {
        return ultimo
          ? `El último tramo de ${nombre} no lleva tope (aplica a todo el exceso).`
          : `Tramo ${i + 1} de ${nombre}: el tope debe ser mayor que el del tramo anterior.`;
      }
      if (!ultimo) anterior = hasta as number;
    }
  }
  if (!(p.topeIngresosEscalaReducida > 0)) return "El tope de ingresos brutos de la escala reducida debe ser mayor que cero.";
  if (!(p.tarifaGeneralJuridica > 0 && p.tarifaGeneralJuridica <= 1)) return "La tarifa general de persona jurídica debe estar entre 0% y 100%.";
  return null;
}

export function calcularImpuestoRenta(
  utilidad: number,
  tipo: "fisica" | "juridica",
  ingresosBrutos: number,
  p: ParametrosRenta
): { total: number; tramos: string[] } {
  const tramos: string[] = [];
  let total = 0;

  if (tipo === "juridica" && ingresosBrutos > p.topeIngresosEscalaReducida) {
    total = utilidad * p.tarifaGeneralJuridica;
    tramos.push(`Ingresos brutos de ${fmt(ingresosBrutos)} superan ${fmt(p.topeIngresosEscalaReducida)}: no aplica la escala reducida.`);
    tramos.push(`Tarifa general ${pct(p.tarifaGeneralJuridica)} sobre ${fmt(utilidad)} ➔ ${fmt(total)}`);
  } else {
    const escala = tipo === "fisica" ? p.escalaFisica : p.escalaJuridica;
    let desde = 0;
    for (const [tope, tasa] of escala) {
      if (utilidad <= desde) break;
      const hasta = tope ?? Infinity;
      const base = Math.min(utilidad, hasta) - desde;
      total += base * tasa;
      const rango = tope == null ? `sobre el exceso de ${fmt(desde)}` : desde === 0 ? `hasta ${fmt(hasta)}` : `de ${fmt(desde)} a ${fmt(hasta)}`;
      tramos.push(`${pct(tasa)} ${rango}: ${fmt(base)} gravados ➔ ${fmt(base * tasa)}`);
      desde = hasta;
    }
    if (tramos.length === 0) tramos.push("Sin renta neta gravable.");
  }

  return { total: Math.round(total * 100) / 100, tramos };
}
