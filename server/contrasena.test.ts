import { describe, it, expect } from "vitest";
import { politicaDesdeParametros, validarNuevaContrasena, crearLimiteIntentos } from "./contrasena";

const base = politicaDesdeParametros([
  { clave: "password_min_longitud", valor: "8" },
  { clave: "password_requiere_letras_numeros", valor: "1" },
  { clave: "password_intentos_max", valor: "3" },
  { clave: "password_intentos_ventana_min", valor: "15" },
]);

describe("politicaDesdeParametros", () => {
  it("lee los valores de la BD", () => {
    expect(base).toEqual({ minLongitud: 8, requiereLetrasYNumeros: true, intentosMax: 3, ventanaMin: 15 });
  });
  it("usa respaldo seguro con valores ausentes o inválidos", () => {
    const p = politicaDesdeParametros([{ clave: "password_min_longitud", valor: "2" }]);
    expect(p.minLongitud).toBe(8);
    expect(p.requiereLetrasYNumeros).toBe(true);
  });
  it("permite desactivar letras y números desde la BD", () => {
    expect(politicaDesdeParametros([{ clave: "password_requiere_letras_numeros", valor: "0" }]).requiereLetrasYNumeros).toBe(false);
  });
});

describe("validarNuevaContrasena", () => {
  it("acepta una contraseña que cumple", () => {
    expect(validarNuevaContrasena("Clinica2026", base)).toBeNull();
  });
  it("rechaza cortas, sin números o con espacios en los extremos", () => {
    expect(validarNuevaContrasena("ab1", base)).toMatch(/al menos 8/);
    expect(validarNuevaContrasena("solamenteletras", base)).toMatch(/letras y números/);
    expect(validarNuevaContrasena("12345678", base)).toMatch(/letras y números/);
    expect(validarNuevaContrasena(" Clinica2026", base)).toMatch(/espacios/);
  });
});

describe("crearLimiteIntentos", () => {
  it("bloquea tras el máximo y se libera al pasar la ventana", () => {
    let t = 0;
    const lim = crearLimiteIntentos(() => t);
    for (let i = 0; i < 3; i++) lim.registrarFallo(1);
    expect(lim.bloqueado(1, base)).toBe(true);
    expect(lim.bloqueado(2, base)).toBe(false);
    t += 15 * 60_000;
    expect(lim.bloqueado(1, base)).toBe(false);
  });
});
