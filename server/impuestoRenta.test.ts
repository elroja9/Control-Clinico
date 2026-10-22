import { describe, it, expect } from "vitest";
import { calcularImpuestoRenta, validarParametrosRenta, type ParametrosRenta } from "./impuestoRenta";

// Fixture con los tramos del período 2026 (Decreto 45333-H); en producción vienen de parametros_renta.
const P2026: ParametrosRenta = {
  anio: 2026,
  escalaFisica: [[6_244_000, 0], [8_329_000, 0.10], [10_414_000, 0.15], [20_872_000, 0.20], [null, 0.25]],
  escalaJuridica: [[5_621_000, 0.05], [8_433_000, 0.10], [11_243_000, 0.15], [null, 0.20]],
  topeIngresosEscalaReducida: 119_174_000,
  tarifaGeneralJuridica: 0.30,
  referenciaLegal: "Decreto 45333-H",
  actualizadoEn: null
};

describe("calcularImpuestoRenta", () => {
  it("persona física: exenta hasta el primer tope", () => {
    expect(calcularImpuestoRenta(6_244_000, "fisica", 0, P2026).total).toBe(0);
  });

  it("persona física: cada tasa solo sobre su exceso", () => {
    // (8.329.000 − 6.244.000) × 10% + (10.000.000 − 8.329.000) × 15%
    expect(calcularImpuestoRenta(10_000_000, "fisica", 0, P2026).total).toBe(208_500 + 250_650);
  });

  it("persona física: último tramo sin tope", () => {
    const r = calcularImpuestoRenta(25_000_000, "fisica", 0, P2026);
    expect(r.total).toBe(208_500 + 312_750 + 2_091_600 + 1_032_000);
    expect(r.tramos).toHaveLength(5);
  });

  it("persona jurídica con escala reducida", () => {
    expect(calcularImpuestoRenta(6_000_000, "juridica", 50_000_000, P2026).total).toBe(281_050 + 37_900);
  });

  it("persona jurídica sobre el tope de ingresos paga la tarifa general", () => {
    expect(calcularImpuestoRenta(10_000_000, "juridica", 119_174_001, P2026).total).toBe(3_000_000);
    expect(calcularImpuestoRenta(10_000_000, "juridica", 119_174_000, P2026).total).toBeLessThan(3_000_000);
  });

  it("sin utilidad no hay impuesto", () => {
    expect(calcularImpuestoRenta(0, "juridica", 0, P2026)).toEqual({ total: 0, tramos: ["Sin renta neta gravable."] });
  });
});

describe("validarParametrosRenta", () => {
  it("acepta los tramos 2026", () => {
    expect(validarParametrosRenta(P2026)).toBeNull();
  });

  it("rechaza topes que no crecen, último tramo con tope y tasas fuera de rango", () => {
    expect(validarParametrosRenta({ ...P2026, escalaFisica: [[8_000_000, 0], [7_000_000, 0.1], [null, 0.2]] })).toMatch(/mayor que el del tramo anterior/);
    expect(validarParametrosRenta({ ...P2026, escalaJuridica: [[5_000_000, 0.05], [9_000_000, 0.2]] })).toMatch(/no lleva tope/);
    expect(validarParametrosRenta({ ...P2026, escalaJuridica: [[5_000_000, 5], [null, 0.2]] })).toMatch(/entre 0% y 100%/);
    expect(validarParametrosRenta({ ...P2026, topeIngresosEscalaReducida: 0 })).toMatch(/tope de ingresos/);
  });
});
