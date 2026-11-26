// Empresa de plataforma: la empresa dueña del SaaS, principalmente para administración SaaS. Puede
// tener datos de demostración (pacientes, citas, servicios...), pero no aparece en la reserva en
// línea, los procesos automáticos no le envían correos y no emite comprobantes electrónicos.
// Su id vive en parametros_sistema (clave CLAVE_ID_COMPANIA_PLATAFORMA): server.ts lo carga al
// arrancar y lo vuelve a aplicar cada vez que relee los parámetros (caché de 60 s). Se guarda en
// una variable de módulo para que isSaasAdmin() y los filtros sigan siendo síncronos.
// Reglas puras (sin Express/MySQL) para poder probarlas.

export const CLAVE_ID_COMPANIA_PLATAFORMA = "saas_id_compania_plataforma";

/**
 * Valor de ARRANQUE, el único literal permitido: rige solo mientras no se haya podido leer
 * parametros_sistema (BD todavía conectando, caída o modo en memoria). Debe coincidir con el
 * valor sembrado por docs/sql/2026-11-26-saas-compania-plataforma.sql.
 */
const ID_COMPANIA_PLATAFORMA_ARRANQUE = 7;

let idVigente = ID_COMPANIA_PLATAFORMA_ARRANQUE;

/** Respuesta a cualquier intento de emitir o transmitir comprobantes electrónicos de la plataforma. */
export const MENSAJE_PLATAFORMA_SIN_COMPROBANTES = "La empresa de plataforma es solo para administración SaaS; no emite comprobantes electrónicos.";

/** Id vigente de la empresa de plataforma. */
export function idCompaniaPlataforma(): number {
  return idVigente;
}

/** Fija el id vigente (lo llama server.ts tras leer parametros_sistema). */
export function establecerIdCompaniaPlataforma(id: number): void {
  if (!Number.isInteger(id) || id < 1) {
    throw new Error(`Id de empresa de plataforma inválido: ${id}`);
  }
  idVigente = id;
}

/** Id configurado en las filas de parametros_sistema; null si falta o no es un entero positivo. */
export function idPlataformaDesdeParametros(filas: Array<{ clave: string; valor: string }>): number | null {
  const valor = filas.find(f => f.clave === CLAVE_ID_COMPANIA_PLATAFORMA)?.valor;
  if (valor == null) return null;
  const texto = String(valor).trim();
  if (!/^\d+$/.test(texto)) return null;
  const n = Number(texto);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** true si el id (número o texto de la URL/BD) es el de la empresa de plataforma. */
export function esCompaniaPlataforma(idCompania: number | string | null | undefined): boolean {
  if (idCompania == null || idCompania === "") return false;
  return Number(idCompania) === idVigente;
}
