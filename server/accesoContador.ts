// Reglas puras del rol 'Contador' y de la caché de sesión vigente (sin dependencias de Express/MySQL
// para poder probarlas).

export const RUTAS_CONTADOR: Array<{ metodo: string; patron: RegExp }> = [
  { metodo: "GET", patron: /^\/api\/(me|db-status|companies|servicios|facturas|cxc|cxp|proveedores|parametros-renta|facturas-correo)$/ },
  { metodo: "GET", patron: /^\/api\/reportes\/(clientes-sesiones|d104|d101|cierres)$/ },
  { metodo: "GET", patron: /^\/api\/hacienda-config\/\d+$/ },
  { metodo: "GET", patron: /^\/api\/facturas-correo\/\d+\/xml$/ },
  // Consultas fiscales a Hacienda (CABYS, contribuyentes, tipo de cambio, exoneraciones y
  // comprobantes emitidos): solo lectura, sin datos clínicos.
  // Catálogos de Hacienda (condición de venta, medios de pago) para leer los comprobantes.
  { metodo: "GET", patron: /^\/api\/hacienda\/(cabys|cabys\/sugeridos|tipo-cambio|comprobantes|catalogos)$/ },
  // Claves rechazadas que se reemplazaron con «Reintentar con clave nueva» (auditoría).
  { metodo: "GET", patron: /^\/api\/facturas\/\d+\/historial-rechazos$/ },
  { metodo: "GET", patron: /^\/api\/hacienda\/(contribuyente|exoneracion|comprobantes)\/[^/]+$/ },
  { metodo: "POST", patron: /^\/api\/(logout|users)$/ },
  // Todo usuario (también el Contador) puede cambiar su propia contraseña.
  { metodo: "GET", patron: /^\/api\/me\/politica-contrasena$/ },
  { metodo: "POST", patron: /^\/api\/me\/contrasena$/ },
  { metodo: "POST", patron: /^\/api\/facturas\/\d+\/reenviar-correo$/ },
  { metodo: "ANY", patron: /^\/api\/(login|forgot-password|public\/.*)$/ },
];

/**
 * Normaliza la ruta como lo hace el enrutador de Express (sin distinguir mayúsculas y sin barra final)
 * para que `/API/Patients` no se salte la lista blanca. Si contiene `%` se decodifica antes; devuelve
 * null si la decodificación falla.
 */
export function normalizarRuta(path: string): string | null {
  let ruta = path;
  if (ruta.includes("%")) {
    try {
      ruta = decodeURIComponent(ruta);
    } catch {
      return null;
    }
  }
  return ruta.toLowerCase().replace(/\/+$/, "");
}

export type DecisionContador = "no-api" | "permitido" | "prohibido" | "invalida";

/** Decide si una petición de un Contador puede continuar. */
export function decidirAccesoContador(metodo: string, path: string): DecisionContador {
  const ruta = normalizarRuta(path);
  if (ruta === null) return "invalida";
  if (!ruta.startsWith("/api/")) return "no-api";
  const ok = RUTAS_CONTADOR.some(r => (r.metodo === "ANY" || r.metodo === metodo) && r.patron.test(ruta));
  return ok ? "permitido" : "prohibido";
}

export interface UsuarioVigente {
  id: number;
  rol: "Administrador" | "Profesional" | "Contador";
  idCompania: number;
  activo: boolean;
  /** usuarios.sesionVersion: sube al cambiar o restablecer la contraseña. */
  sesionVersion?: number;
}

/** Caché en memoria con TTL. `now` es inyectable para pruebas. */
export function crearCacheUsuarios(ttlMs = 60_000, now: () => number = Date.now) {
  const mapa = new Map<number, { valor: UsuarioVigente | null; expira: number }>();
  return {
    get(id: number): UsuarioVigente | null | undefined {
      const e = mapa.get(id);
      if (!e) return undefined;
      if (e.expira <= now()) { mapa.delete(id); return undefined; }
      return e.valor;
    },
    set(id: number, valor: UsuarioVigente | null) { mapa.set(id, { valor, expira: now() + ttlMs }); },
    invalidate(id: number) { mapa.delete(id); },
  };
}

/**
 * Un usuario inexistente o inactivo no tiene sesión válida; tampoco un token emitido con una
 * versión de sesión distinta a la vigente (la contraseña cambió después de iniciar sesión).
 */
export function sesionDesdeUsuario(
  u: UsuarioVigente | null | undefined,
  versionToken?: number
): { userId: number; idCompania: number; rol: UsuarioVigente["rol"]; sv: number } | null {
  if (!u || !u.activo) return null;
  const vigente = u.sesionVersion ?? 0;
  if (versionToken !== undefined && versionToken !== vigente) return null;
  return { userId: u.id, idCompania: u.idCompania, rol: u.rol, sv: vigente };
}
