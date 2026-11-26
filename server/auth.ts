// Sesiones de autenticación: token firmado (HMAC-SHA256) guardado en una cookie httpOnly, sin
// estado de sesión en el servidor (no requiere tabla/almacenamiento adicional — sobrevive
// reinicios de pm2, a diferencia de un Map en memoria). Import exclusivo del servidor.

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { esCompaniaPlataforma } from "./companiaPlataforma";

export const SESSION_COOKIE = "cc_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días
export const SESSION_MAX_AGE_SECONDS = SESSION_TTL_MS / 1000;

function getSessionKey(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is required.");
  }
  return crypto.createHash("sha256").update(secret).digest();
}

export interface SessionPayload {
  userId: number;
  idCompania: number;
  rol: "Administrador" | "Profesional" | "Contador";
  /** Versión de sesión del usuario al emitir el token (usuarios.sesionVersion). Si la versión
   * en la base cambió (cambio/restablecimiento de contraseña), el token deja de valer. */
  sv?: number;
}

export function createSessionToken(payload: SessionPayload): string {
  const body = JSON.stringify({ ...payload, exp: Date.now() + SESSION_TTL_MS });
  const encoded = Buffer.from(body, "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", getSessionKey()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature) return null;

  const expectedSignature = crypto.createHmac("sha256", getSessionKey()).update(encoded).digest("base64url");
  const givenBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSignature);
  if (givenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(givenBuf, expectedBuf)) {
    return null;
  }

  try {
    const body = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (typeof body.exp !== "number" || Date.now() > body.exp) return null;
    if (typeof body.userId !== "number" || typeof body.idCompania !== "number") return null;
    // Tokens emitidos antes de existir la versión se tratan como versión 0.
    return { userId: body.userId, idCompania: body.idCompania, rol: body.rol, sv: typeof body.sv === "number" ? body.sv : 0 };
  } catch {
    return null;
  }
}

const BCRYPT_HASH_PATTERN = /^\$2[aby]\$\d{2}\$/;

export function isBcryptHash(value: string): boolean {
  return BCRYPT_HASH_PATTERN.test(value);
}

/** Acepta hashes bcrypt (formato actual) y contraseñas en texto plano heredadas de datos de
 * prueba/semilla antiguos — login() reemplaza esas por un hash bcrypt en el primer ingreso
 * exitoso, así que este segundo caso desaparece progresivamente sin requerir una migración manual. */
export function passwordMatches(stored: string, input: string): boolean {
  if (isBcryptHash(stored)) {
    return bcrypt.compareSync(input, stored);
  }
  return stored === input;
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

/** Contraseña temporal numérica de `digits` dígitos (p.ej. "04839217") para el flujo de
 * restablecimiento por correo. crypto.randomInt (no Math.random) para que no sea adivinable. */
export function generateNumericPassword(digits: number): string {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;
  return crypto.randomInt(min, max + 1).toString();
}

/** Administrador de la empresa de plataforma (id configurable en parametros_sistema, ver
 * server/companiaPlataforma.ts). Síncrono: usa el id vigente ya cargado en memoria. */
export function isSaasAdmin(session: SessionPayload | null | undefined): boolean {
  return !!session && esCompaniaPlataforma(session.idCompania) && session.rol === "Administrador";
}

/** Lee el valor de una cookie puntual del header `Cookie` de la petición. */
export function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/** Serializa el header `Set-Cookie` de la sesión. `maxAgeSeconds: 0` la borra (logout). */
export function serializeSessionCookie(value: string, maxAgeSeconds: number): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}
