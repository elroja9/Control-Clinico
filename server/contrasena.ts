// Reglas puras del cambio de contraseña. La política sale de `parametros_sistema` (regla del
// proyecto: nada de valores de negocio quemados); aquí solo se interpreta y valida.

export interface PoliticaContrasena {
  minLongitud: number;
  requiereLetrasYNumeros: boolean;
  intentosMax: number;
  ventanaMin: number;
}

/**
 * Construye la política a partir de las filas clave/valor de `parametros_sistema`. Si una clave
 * falta o es inválida se usa un respaldo seguro: así la app no queda sin política si la tabla
 * aún no tiene la fila (la fuente de verdad sigue siendo la BD, sembrada por la migración).
 */
export function politicaDesdeParametros(filas: Array<{ clave: string; valor: string }>): PoliticaContrasena {
  const mapa = new Map(filas.map(f => [f.clave, String(f.valor)]));
  const entero = (clave: string, respaldo: number, min: number, max: number) => {
    const n = parseInt(mapa.get(clave) ?? "", 10);
    return Number.isFinite(n) && n >= min && n <= max ? n : respaldo;
  };
  return {
    minLongitud: entero("password_min_longitud", 8, 6, 128),
    requiereLetrasYNumeros: (mapa.get("password_requiere_letras_numeros") ?? "1") !== "0",
    intentosMax: entero("password_intentos_max", 5, 1, 100),
    ventanaMin: entero("password_intentos_ventana_min", 15, 1, 1440),
  };
}

/** Devuelve el motivo por el que la contraseña nueva no es aceptable, o null si es válida. */
export function validarNuevaContrasena(nueva: string, politica: PoliticaContrasena): string | null {
  if (typeof nueva !== "string" || nueva.length === 0) return "Indique la contraseña nueva.";
  if (nueva !== nueva.trim()) return "La contraseña no puede empezar ni terminar con espacios.";
  if (nueva.length < politica.minLongitud) return `La contraseña debe tener al menos ${politica.minLongitud} caracteres.`;
  if (nueva.length > 128) return "La contraseña no puede superar 128 caracteres.";
  if (politica.requiereLetrasYNumeros && !(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(nueva) && /\d/.test(nueva))) {
    return "La contraseña debe incluir letras y números.";
  }
  return null;
}

/** Límite en memoria de intentos fallidos de "contraseña actual" por usuario. */
export function crearLimiteIntentos(now: () => number = Date.now) {
  const fallos = new Map<number, number[]>();
  return {
    bloqueado(userId: number, politica: PoliticaContrasena): boolean {
      const ventana = politica.ventanaMin * 60_000;
      const vigentes = (fallos.get(userId) || []).filter(t => now() - t < ventana);
      fallos.set(userId, vigentes);
      return vigentes.length >= politica.intentosMax;
    },
    registrarFallo(userId: number) {
      fallos.set(userId, [...(fallos.get(userId) || []), now()]);
    },
    limpiar(userId: number) {
      fallos.delete(userId);
    },
  };
}
