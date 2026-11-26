// Cliente de la API de integración del ERP ELROTECH (contrato v1, docs/integracion-erp-saas.md).
// Control Clínico es la fuente de verdad de sus suscriptores; el ERP es el único que emite los
// comprobantes de la suscripción. Este módulo tiene:
//   * reglas puras (sin Express/MySQL) para poder probarlas: lectura y validación de la
//     configuración, armado del suscriptor, validación de las respuestas, resumen del estado de
//     cuenta, decisión de suspensión por mora y referencia idempotente de "meses por adelantado";
//   * el envoltorio HTTPS con tiempo límite, clave Bearer y errores en español.
// La clave nunca se registra en el log ni sale en una respuesta.

import https from "https";
import { X509Certificate } from "crypto";
import { errorIdentificacion, esTipoIdentificacion, soloDigitosIdentificacion, type TipoIdentificacion } from "../src/utils/identificacion";

// ---------------------------------------------------------------------------------------------
// Configuración (parametros_sistema)
// ---------------------------------------------------------------------------------------------

/** Claves de parametros_sistema (docs/sql/2026-11-27-integracion-erp.sql las siembra). */
export const PARAMETROS_ERP = {
  url: "erp_url",
  rutaApi: "erp_ruta_api",
  syncActivo: "erp_sync_activo",
  syncIntervaloMin: "erp_sync_intervalo_min",
  timeoutMs: "erp_timeout_ms",
  moraDiasSuspension: "erp_mora_dias_suspension",
  moraDiasAviso: "erp_mora_dias_aviso",
  adelantadoMesesMax: "erp_adelantado_meses_max",
  adelantadoVentanaSeg: "erp_adelantado_ventana_seg",
  respuestaMaxBytes: "erp_respuesta_max_bytes"
} as const;

export interface ConfigErp {
  /** URL base del ERP sin barra final ('' = sin configurar). */
  url: string;
  /** Ruta de la API de integraciones, p. ej. /api/integraciones/v1. */
  rutaApi: string;
  syncActivo: boolean;
  syncIntervaloMin: number;
  timeoutMs: number;
  /** Días de mora para suspender (0 = suspensión automática desactivada). */
  moraDiasSuspension: number;
  /** Días de aviso por correo antes de suspender. */
  moraDiasAviso: number;
  adelantadoMesesMax: number;
  /** Ventana en la que un segundo clic de "Facturar por adelantado" reutiliza la referencia. */
  adelantadoVentanaSeg: number;
  respuestaMaxBytes: number;
}

type FilaParametro = { clave: string; valor: string };

function entero(valor: string | undefined, minimo: number): number | null {
  const t = String(valor ?? "").trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n >= minimo ? n : null;
}

/**
 * Lee la configuración de las filas de parametros_sistema. `faltantes` lista las claves ausentes
 * o inválidas: sin ellas la integración no corre (no hay valores de respaldo en código).
 */
export function configErpDesdeParametros(filas: FilaParametro[]): { config: ConfigErp; faltantes: string[] } {
  const v = (clave: string) => filas.find(f => f.clave === clave)?.valor;
  const faltantes: string[] = [];
  const num = (clave: string, minimo: number) => {
    const n = entero(v(clave), minimo);
    if (n === null) faltantes.push(clave);
    return n ?? 0;
  };
  const rutaApi = String(v(PARAMETROS_ERP.rutaApi) ?? "").trim();
  if (!/^\/[\w\-./]*$/.test(rutaApi)) faltantes.push(PARAMETROS_ERP.rutaApi);
  const activo = String(v(PARAMETROS_ERP.syncActivo) ?? "").trim();
  if (activo !== "0" && activo !== "1") faltantes.push(PARAMETROS_ERP.syncActivo);
  const config: ConfigErp = {
    url: String(v(PARAMETROS_ERP.url) ?? "").trim().replace(/\/+$/, ""),
    rutaApi: rutaApi.replace(/\/+$/, ""),
    syncActivo: activo === "1",
    syncIntervaloMin: num(PARAMETROS_ERP.syncIntervaloMin, 1),
    timeoutMs: num(PARAMETROS_ERP.timeoutMs, 1),
    moraDiasSuspension: num(PARAMETROS_ERP.moraDiasSuspension, 0),
    moraDiasAviso: num(PARAMETROS_ERP.moraDiasAviso, 0),
    adelantadoMesesMax: num(PARAMETROS_ERP.adelantadoMesesMax, 1),
    adelantadoVentanaSeg: num(PARAMETROS_ERP.adelantadoVentanaSeg, 1),
    respuestaMaxBytes: num(PARAMETROS_ERP.respuestaMaxBytes, 1)
  };
  return { config, faltantes };
}

/** Problema de la URL base del ERP, o null. Solo HTTPS, sin usuario/clave, consulta ni fragmento. */
export function errorUrlErp(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return "La URL del ERP no es válida.";
  }
  if (u.protocol !== "https:") return "La URL del ERP debe usar https://.";
  if (u.username || u.password) return "La URL del ERP no puede llevar usuario ni contraseña.";
  if (u.search || u.hash) return "La URL del ERP no puede llevar parámetros (?) ni fragmento (#).";
  return null;
}

export interface EntradaConfigErp {
  url?: unknown;
  syncActivo?: unknown;
  syncIntervaloMin?: unknown;
  timeoutMs?: unknown;
  moraDiasSuspension?: unknown;
  moraDiasAviso?: unknown;
  /** Texto no vacío = reemplazar la clave. Ausente o vacío = conservar la guardada. */
  apiKey?: unknown;
  borrarApiKey?: unknown;
  /** undefined = conservar; '' o null = quitar; texto = PEM nuevo. */
  caPem?: unknown;
}

export interface CambiosConfigErp {
  parametros: Array<{ clave: string; valor: string }>;
  /** undefined = no tocar, null = borrar, texto = clave nueva en claro (se cifra al guardar). */
  apiKey?: string | null;
  caPem?: string | null;
}

/** Rangos aceptados en la pantalla (límites de validación, no valores de negocio). */
const RANGOS = {
  syncIntervaloMin: [1, 1440],
  timeoutMs: [1000, 120000],
  moraDiasSuspension: [0, 365],
  moraDiasAviso: [0, 60]
} as const;

/** Valida lo que envía la pantalla y devuelve los cambios a guardar, o la lista de errores. */
export function validarEntradaConfigErp(e: EntradaConfigErp): { ok: true; cambios: CambiosConfigErp } | { ok: false; errores: string[] } {
  const errores: string[] = [];
  const parametros: Array<{ clave: string; valor: string }> = [];

  const url = String(e.url ?? "").trim().replace(/\/+$/, "");
  if (url) {
    const problema = errorUrlErp(url);
    if (problema) errores.push(problema);
  }
  parametros.push({ clave: PARAMETROS_ERP.url, valor: url });

  if (typeof e.syncActivo !== "boolean") errores.push("Indique si la sincronización automática está activa.");
  else parametros.push({ clave: PARAMETROS_ERP.syncActivo, valor: e.syncActivo ? "1" : "0" });

  const etiquetas: Record<keyof typeof RANGOS, string> = {
    syncIntervaloMin: "El intervalo de sincronización (minutos)",
    timeoutMs: "El tiempo límite de cada petición (ms)",
    moraDiasSuspension: "Los días de mora para suspender",
    moraDiasAviso: "Los días de aviso previo"
  };
  for (const campo of Object.keys(RANGOS) as Array<keyof typeof RANGOS>) {
    const [min, max] = RANGOS[campo];
    const n = Number(e[campo]);
    if (!Number.isInteger(n) || n < min || n > max) {
      errores.push(`${etiquetas[campo]} debe ser un entero entre ${min} y ${max}.`);
    } else {
      parametros.push({ clave: PARAMETROS_ERP[campo], valor: String(n) });
    }
  }

  const cambios: CambiosConfigErp = { parametros };
  if (e.borrarApiKey === true) {
    cambios.apiKey = null;
  } else if (e.apiKey != null && String(e.apiKey).trim() !== "") {
    const clave = String(e.apiKey).trim();
    if (clave.length < 16 || clave.length > 512 || /\s/.test(clave)) {
      errores.push("La clave de integración no parece válida (sin espacios, 16 a 512 caracteres).");
    } else {
      cambios.apiKey = clave;
    }
  }

  if (e.caPem === null || (typeof e.caPem === "string" && e.caPem.trim() === "")) {
    cambios.caPem = null;
  } else if (typeof e.caPem === "string") {
    const info = infoCertificadoCa(e.caPem);
    if (!info) errores.push("El certificado CA no es un PEM válido (-----BEGIN CERTIFICATE-----).");
    else cambios.caPem = e.caPem.trim();
  }

  return errores.length ? { ok: false, errores } : { ok: true, cambios };
}

/** Sujeto y vencimiento del primer certificado del PEM, o null si no es un certificado válido. */
export function infoCertificadoCa(pem: string | null | undefined): { sujeto: string; venceEn: string } | null {
  const texto = String(pem ?? "").trim();
  if (!/-----BEGIN CERTIFICATE-----/.test(texto)) return null;
  try {
    const cert = new X509Certificate(texto);
    return { sujeto: cert.subject.replace(/\n/g, ", "), venceEn: new Date(cert.validTo).toISOString() };
  } catch {
    return null;
  }
}

/** Últimos 4 caracteres de la clave para mostrar que está configurada (nunca la clave). */
export function pistaClave(clave: string): string {
  return clave.length > 8 ? clave.slice(-4) : "";
}

// ---------------------------------------------------------------------------------------------
// Suscriptor (PUT /suscriptores/{idExterno})
// ---------------------------------------------------------------------------------------------

export type MonedaSuscripcion = "CRC" | "USD";
export const MONEDAS_SUSCRIPCION: MonedaSuscripcion[] = ["CRC", "USD"];

/** Columnas de companias que usa la integración. */
export interface CompaniaParaErp {
  id: number;
  nombreComercial?: string | null;
  razonSocial?: string | null;
  tipoIdentificacion?: string | null;
  identificacion?: string | null;
  correoEmisor?: string | null;
  provincia?: string | null;
  canton?: string | null;
  distrito?: string | null;
  otrasSenas?: string | null;
  actividadEconomica?: string | null;
  estadoSaas?: string | null;
  montoMensual?: number | string | null;
  monedaSuscripcion?: string | null;
  diaFacturacion?: number | string | null;
}

export interface SuscriptorErp {
  tipoIdentificacion: TipoIdentificacion;
  identificacion: string;
  nombre: string;
  nombreComercial?: string;
  correo: string;
  provincia: string;
  canton: string;
  distrito: string;
  otrasSenas?: string;
  codigoActividad?: string;
  moneda: MonedaSuscripcion;
  montoMensual: number;
  diaFacturacion: number;
  activo: boolean;
}

const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Código de actividad (6 dígitos) al inicio del texto libre, p. ej. "869001 (Fisioterapia)". */
export function codigoActividadDe(actividad: string | null | undefined): string | undefined {
  const m = /^\s*([\d.]+)/.exec(String(actividad ?? ""));
  if (!m) return undefined;
  const digitos = m[1].replace(/\./g, "");
  return /^\d{6}$/.test(digitos) ? digitos : undefined;
}

/** Día de facturación válido (1-28: existe en todos los meses). */
export function esDiaFacturacion(dia: unknown): boolean {
  const n = Number(dia);
  return Number.isInteger(n) && n >= 1 && n <= 28;
}

/** Cuota mensual válida: positiva, con hasta 2 decimales y un tope razonable de columna. */
export function esMontoMensual(monto: unknown): boolean {
  if (monto === null || monto === undefined || monto === "") return false;
  const n = Number(monto);
  return Number.isFinite(n) && n > 0 && n < 1e12 && Math.round(n * 100) / 100 === n;
}

/** Arma el cuerpo de PUT /suscriptores/{id} desde la empresa, o la lista de datos que faltan. */
export function construirSuscriptor(c: CompaniaParaErp): { ok: true; payload: SuscriptorErp } | { ok: false; errores: string[] } {
  const errores: string[] = [];
  const tipo = String(c.tipoIdentificacion ?? "").trim();
  const identificacion = String(c.identificacion ?? "").trim();
  if (!esTipoIdentificacion(tipo)) {
    errores.push("Tipo de identificación inválido.");
  } else {
    const problema = errorIdentificacion(tipo, identificacion);
    if (problema) errores.push(problema);
  }
  const nombre = String(c.razonSocial ?? "").trim();
  if (!nombre) errores.push("Falta la razón social.");
  else if (nombre.length > 100) errores.push("La razón social pasa de 100 caracteres.");
  const correo = String(c.correoEmisor ?? "").trim();
  if (!CORREO_VALIDO.test(correo) || correo.length > 160) errores.push("El correo de facturación no es válido.");
  const provincia = String(c.provincia ?? "").trim();
  const canton = String(c.canton ?? "").trim();
  const distrito = String(c.distrito ?? "").trim();
  if (!/^[1-7]$/.test(provincia) || !/^\d{2}$/.test(canton) || !/^\d{2}$/.test(distrito)) {
    errores.push("Falta la ubicación fiscal (provincia, cantón y distrito).");
  }
  const moneda = String(c.monedaSuscripcion ?? "").trim();
  if (moneda !== "CRC" && moneda !== "USD") errores.push("Falta la moneda de la suscripción (CRC o USD).");
  if (!esMontoMensual(c.montoMensual)) errores.push("Falta la cuota mensual (mayor que cero).");
  if (!esDiaFacturacion(c.diaFacturacion)) errores.push("Falta el día de facturación (1 a 28).");
  if (errores.length) return { ok: false, errores };

  const payload: SuscriptorErp = {
    tipoIdentificacion: tipo as TipoIdentificacion,
    identificacion: soloDigitosIdentificacion(identificacion),
    nombre,
    correo,
    provincia,
    canton,
    distrito,
    moneda: moneda as MonedaSuscripcion,
    montoMensual: Number(c.montoMensual),
    diaFacturacion: Number(c.diaFacturacion),
    activo: c.estadoSaas === "ACTIVA"
  };
  const nombreComercial = String(c.nombreComercial ?? "").trim();
  if (nombreComercial) payload.nombreComercial = nombreComercial.slice(0, 80);
  const otrasSenas = String(c.otrasSenas ?? "").trim();
  if (otrasSenas.length >= 5) payload.otrasSenas = otrasSenas.slice(0, 250);
  const codigoActividad = codigoActividadDe(c.actividadEconomica);
  if (codigoActividad) payload.codigoActividad = codigoActividad;
  return { ok: true, payload };
}

/** Campos de la empresa que viajan al ERP: si alguno cambia, hay que volver a sincronizar. */
const CAMPOS_SUSCRIPTOR: Array<keyof CompaniaParaErp> = [
  "nombreComercial", "razonSocial", "tipoIdentificacion", "identificacion", "correoEmisor", "provincia", "canton",
  "distrito", "otrasSenas", "actividadEconomica", "estadoSaas", "montoMensual", "monedaSuscripcion", "diaFacturacion"
];

function normalizarCampo(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  const t = String(v).trim();
  return /^-?\d+(\.\d+)?$/.test(t) ? String(Number(t)) : t;
}

/** true si cambió algún dato que el ERP conoce del suscriptor (los ausentes en `despues` se conservan). */
export function cambiaronDatosSuscriptor(antes: Partial<CompaniaParaErp>, despues: Partial<CompaniaParaErp>): boolean {
  return CAMPOS_SUSCRIPTOR.some(campo => despues[campo] !== undefined && normalizarCampo(antes[campo]) !== normalizarCampo(despues[campo]));
}

export type MotivoOmitir = "plataforma" | "pendiente-de-aprobacion" | "sin-cuota";

/**
 * Empresas que no se envían al ERP (no es un error): la de plataforma nunca; y, mientras no se haya
 * dado de alta en el ERP, la que sigue pendiente de aprobación o no tiene cuota (cortesía/demo).
 * Una empresa ya dada de alta siempre se sincroniza (así una suspensión llega al ERP).
 */
export function motivoOmitirSincronizacion(c: { esPlataforma: boolean; estadoSaas?: string | null; montoMensual?: number | string | null; sincronizadaAntes: boolean }): MotivoOmitir | null {
  if (c.esPlataforma) return "plataforma";
  if (c.sincronizadaAntes) return null;
  if (c.estadoSaas === "PENDIENTE") return "pendiente-de-aprobacion";
  if (!(Number(c.montoMensual) > 0)) return "sin-cuota";
  return null;
}

// ---------------------------------------------------------------------------------------------
// Respuestas del ERP
// ---------------------------------------------------------------------------------------------

export interface FacturaResumen {
  id: number;
  referenciaExterna: string | null;
  consecutivo: string | null;
  clave: string | null;
  fechaEmision: string | null;
  moneda: string | null;
  total: number;
  saldoPendiente: number;
  fechaVencimiento: string | null;
  estadoHacienda: string | null;
  pagada: boolean;
}

export interface EstadoCuentaErp {
  suscriptor: { clientId: number | null; activo: boolean; moneda: string | null; montoMensual: number | null; proximaFacturacion: string | null };
  resumen: { saldoPendiente: number; saldoVencido: number; diasMoraMax: number; alDia: boolean; monedaSaldo: string | null };
  facturas: FacturaResumen[];
}

export class ErrorRespuestaErp extends Error {}

const texto = (v: unknown, max: number): string | null => (v == null || v === "" ? null : String(v).slice(0, max));
const numero = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const esObjeto = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);

/** Normaliza una FacturaResumen del ERP; lanza ErrorRespuestaErp si no trae lo mínimo. */
export function validarFacturaResumen(f: unknown): FacturaResumen {
  if (!esObjeto(f)) throw new ErrorRespuestaErp("El ERP devolvió una factura con formato inválido.");
  const id = numero(f.id);
  const total = numero(f.total);
  if (id === null || total === null) throw new ErrorRespuestaErp("El ERP devolvió una factura sin id o sin total.");
  return {
    id,
    referenciaExterna: texto(f.referenciaExterna, 200),
    consecutivo: texto(f.consecutivo, 20),
    clave: texto(f.clave, 50),
    fechaEmision: texto(f.fechaEmision, 40),
    moneda: texto(f.moneda, 3),
    total,
    saldoPendiente: numero(f.saldoPendiente) ?? 0,
    fechaVencimiento: texto(f.fechaVencimiento, 10),
    estadoHacienda: texto(f.estadoHacienda, 30),
    pagada: f.pagada === true
  };
}

/** Normaliza la respuesta de GET /suscriptores/{id}/estado-cuenta; lanza si el formato no calza. */
export function validarEstadoCuenta(datos: unknown): EstadoCuentaErp {
  if (!esObjeto(datos) || !esObjeto(datos.resumen) || !Array.isArray(datos.facturas)) {
    throw new ErrorRespuestaErp("El ERP devolvió un estado de cuenta con formato inválido.");
  }
  const r = datos.resumen;
  const saldoPendiente = numero(r.saldoPendiente);
  const saldoVencido = numero(r.saldoVencido);
  const diasMoraMax = numero(r.diasMoraMax);
  if (saldoPendiente === null || saldoVencido === null || diasMoraMax === null || diasMoraMax < 0) {
    throw new ErrorRespuestaErp("El ERP devolvió un resumen de estado de cuenta incompleto.");
  }
  const s = esObjeto(datos.suscriptor) ? datos.suscriptor : {};
  return {
    suscriptor: {
      clientId: numero(s.clientId),
      activo: s.activo === true,
      moneda: texto(s.moneda, 3),
      montoMensual: numero(s.montoMensual),
      proximaFacturacion: fechaYmd(s.proximaFacturacion)
    },
    resumen: {
      saldoPendiente,
      saldoVencido,
      diasMoraMax: Math.floor(diasMoraMax),
      alDia: r.alDia === true,
      monedaSaldo: texto(r.monedaSaldo, 3)
    },
    facturas: datos.facturas.map(validarFacturaResumen)
  };
}

/** "YYYY-MM-DD" al inicio del texto (fecha o fecha-hora ISO del ERP), o null. */
export function fechaYmd(v: unknown): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v ?? ""));
  return m ? m[1] : null;
}

/** Columnas de companias con el resumen del estado de cuenta. */
export interface ResumenGuardado {
  erpSaldoPendiente: number;
  erpSaldoVencido: number;
  erpDiasMora: number;
  erpMonedaSaldo: string | null;
  erpProximaFacturacion: string | null;
  erpUltimaFacturaConsecutivo: string | null;
  erpUltimaFacturaEstado: string | null;
  erpUltimaFacturaFecha: string | null;
}

/**
 * Resumen a guardar en companias. Mora: si el ERP no marca la cuenta al día pero tampoco trae días,
 * se guarda lo que diga diasMoraMax (la decisión de suspender usa solo los días). La última factura
 * es la de fechaEmision más reciente (el contrato las ordena, pero no se depende de eso).
 */
export function resumenParaGuardar(ec: EstadoCuentaErp): ResumenGuardado {
  const ultima = [...ec.facturas].sort((a, b) => String(b.fechaEmision ?? "").localeCompare(String(a.fechaEmision ?? "")) || b.id - a.id)[0];
  return {
    erpSaldoPendiente: ec.resumen.saldoPendiente,
    erpSaldoVencido: ec.resumen.saldoVencido,
    erpDiasMora: ec.resumen.alDia ? 0 : ec.resumen.diasMoraMax,
    erpMonedaSaldo: ec.resumen.monedaSaldo,
    erpProximaFacturacion: ec.suscriptor.proximaFacturacion,
    erpUltimaFacturaConsecutivo: ultima?.consecutivo ?? null,
    erpUltimaFacturaEstado: ultima?.estadoHacienda ?? null,
    erpUltimaFacturaFecha: ultima ? fechaYmd(ultima.fechaEmision) : null
  };
}

// ---------------------------------------------------------------------------------------------
// Suspensión automática por mora
// ---------------------------------------------------------------------------------------------

export type DecisionMora = "nada" | "reiniciar" | "avisar" | "suspender";

export interface EntradaMora {
  esPlataforma: boolean;
  estadoSaas: string | null | undefined;
  /** Días de mora del último estado de cuenta; null = desconocido (no se decide nada). */
  diasMora: number | null;
  /** Configuración: días de mora para suspender (0 = desactivado) y días de aviso previo. */
  diasSuspension: number;
  diasAviso: number;
  /** Ya se envió el aviso de este periodo de mora. */
  avisoEnviado: boolean;
  /** Días completos desde el aviso (null si no hay aviso). */
  diasDesdeAviso: number | null;
}

/**
 * Qué hacer con una empresa tras refrescar su estado de cuenta:
 *  - nunca nada con la empresa de plataforma;
 *  - al día con aviso registrado → "reiniciar" (el próximo periodo de mora vuelve a avisar);
 *  - en mora, activa y con suspensión configurada:
 *      * sin aviso y con mora >= días de suspensión − días de aviso → "avisar" (una sola vez);
 *      * con aviso, mora > días de suspensión y al menos los días de aviso desde que se avisó →
 *        "suspender" (aunque la mora ya pasara el umbral al activarlo, el cliente tiene su plazo).
 */
export function decidirMora(e: EntradaMora): DecisionMora {
  if (e.esPlataforma || e.diasMora === null || !Number.isFinite(e.diasMora)) return "nada";
  if (e.diasMora <= 0) return e.avisoEnviado ? "reiniciar" : "nada";
  if (e.diasSuspension <= 0 || e.estadoSaas !== "ACTIVA") return "nada";
  if (!e.avisoEnviado) {
    const umbralAviso = Math.max(1, e.diasSuspension - e.diasAviso);
    return e.diasMora >= umbralAviso ? "avisar" : "nada";
  }
  if (e.diasMora > e.diasSuspension && (e.diasDesdeAviso ?? 0) >= e.diasAviso) return "suspender";
  return "nada";
}

/** Días que faltan para la suspensión al enviar el aviso (para el texto del correo). */
export function diasHastaSuspension(diasSuspension: number, diasAviso: number, diasMora: number): number {
  return Math.max(diasSuspension + 1 - diasMora, diasAviso, 0);
}

// ---------------------------------------------------------------------------------------------
// Facturar meses por adelantado (POST /suscriptores/{id}/facturas)
// ---------------------------------------------------------------------------------------------

/** Referencia única del lado SaaS: adelantado-<ms>-<aleatorio>. */
export function generarReferenciaAdelantado(ahoraMs: number, aleatorio: string): string {
  const sufijo = aleatorio.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 12);
  if (!sufijo) throw new Error("Falta la parte aleatoria de la referencia.");
  return `adelantado-${ahoraMs}-${sufijo}`;
}

export interface SolicitudAdelantadoPrevia {
  referencia: string;
  meses: number;
  creadoEnMs: number;
}

/**
 * Doble clic o reintento: si hay una solicitud de la misma empresa con los mismos meses dentro de
 * la ventana, se reutiliza su referencia (el ERP responde con la misma factura). Si no, una nueva.
 */
export function elegirReferenciaAdelantado(
  previas: SolicitudAdelantadoPrevia[],
  meses: number,
  ahoraMs: number,
  ventanaSeg: number,
  generar: () => string
): { referencia: string; reutilizada: boolean } {
  const reciente = previas
    .filter(p => p.meses === meses && ahoraMs - p.creadoEnMs >= 0 && ahoraMs - p.creadoEnMs <= ventanaSeg * 1000)
    .sort((a, b) => b.creadoEnMs - a.creadoEnMs)[0];
  return reciente ? { referencia: reciente.referencia, reutilizada: true } : { referencia: generar(), reutilizada: false };
}

/** Meses válidos para facturar por adelantado (entero de 1 al máximo configurado). */
export function errorMesesAdelantado(meses: unknown, maximo: number): string | null {
  const n = Number(meses);
  return Number.isInteger(n) && n >= 1 && n <= maximo ? null : `Indique entre 1 y ${maximo} meses.`;
}

// ---------------------------------------------------------------------------------------------
// Cliente HTTPS
// ---------------------------------------------------------------------------------------------

export type TipoErrorErp = "config" | "red" | "tls" | "tiempo" | "http" | "respuesta";

export class ErrorErp extends Error {
  constructor(message: string, public tipo: TipoErrorErp, public status?: number, public codigo?: string) {
    super(message);
  }
}

export interface ConexionErp {
  url: string;
  rutaApi: string;
  apiKey: string;
  /** CA propia del ERP (certificado autofirmado). La verificación TLS sigue siempre activa. */
  caPem?: string | null;
  timeoutMs: number;
  respuestaMaxBytes: number;
}

/** URL completa de un endpoint del contrato. */
export function urlEndpointErp(conexion: Pick<ConexionErp, "url" | "rutaApi">, ruta: string): string {
  return `${conexion.url.replace(/\/+$/, "")}${conexion.rutaApi}${ruta}`;
}

/** Mensaje en español para una respuesta HTTP de error del ERP. */
export function mensajeErrorHttp(status: number, cuerpo: unknown): string {
  const delErp = esObjeto(cuerpo) && typeof cuerpo.error === "string" ? cuerpo.error.trim().slice(0, 300) : "";
  switch (status) {
    case 401: return "El ERP rechazó la clave de integración (no es válida o fue revocada).";
    case 403: return "La clave de integración no tiene permiso para esta operación en el ERP.";
    case 404: return delErp || "El ERP no encontró el recurso solicitado.";
    case 429: return "El ERP limitó las peticiones; se reintentará más tarde.";
    case 400: case 409: case 422: return delErp ? `El ERP rechazó los datos: ${delErp}` : "El ERP rechazó los datos enviados.";
  }
  if (status >= 300 && status < 400) return "El ERP respondió con una redirección; revise la URL configurada.";
  if (status >= 500) return `El ERP respondió con un error interno (HTTP ${status}).`;
  return delErp || `Respuesta inesperada del ERP (HTTP ${status}).`;
}

const CODIGOS_TLS = new Set([
  "DEPTH_ZERO_SELF_SIGNED_CERT", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID", "ERR_TLS_CERT_ALTNAME_INVALID"
]);

/** Error de red/TLS de Node → ErrorErp en español. */
export function errorDeRed(err: any): ErrorErp {
  if (err instanceof ErrorErp) return err;
  const codigo = String(err?.code ?? "");
  if (CODIGOS_TLS.has(codigo)) {
    const detalle = codigo === "CERT_HAS_EXPIRED" ? "el certificado del ERP venció"
      : codigo === "ERR_TLS_CERT_ALTNAME_INVALID" ? "el certificado no corresponde al nombre de la URL"
      : "el certificado del ERP no es de confianza (configure su CA)";
    return new ErrorErp(`No se pudo verificar la conexión segura con el ERP: ${detalle}.`, "tls", undefined, codigo);
  }
  if (codigo === "ENOTFOUND" || codigo === "EAI_AGAIN") return new ErrorErp("No se encontró el servidor del ERP (revise la URL).", "red", undefined, codigo);
  if (codigo === "ECONNREFUSED") return new ErrorErp("El servidor del ERP rechazó la conexión.", "red", undefined, codigo);
  if (codigo === "ECONNRESET" || codigo === "EPIPE") return new ErrorErp("Se cortó la conexión con el ERP.", "red", undefined, codigo);
  return new ErrorErp("No se pudo conectar con el ERP.", "red", undefined, codigo || undefined);
}

let agenteCa: { pem: string; agente: https.Agent } | null = null;
function agentePara(caPem: string | null | undefined): https.Agent | undefined {
  const pem = String(caPem ?? "").trim();
  if (!pem) return undefined;
  if (agenteCa?.pem !== pem) {
    // Solo esta CA para el ERP; rejectUnauthorized queda en su valor seguro (true).
    agenteCa = { pem, agente: new https.Agent({ ca: pem, keepAlive: false }) };
  }
  return agenteCa.agente;
}

export interface RespuestaErp<T = unknown> {
  status: number;
  datos: T;
}

/** Llama al ERP por HTTPS con la clave Bearer y tiempo límite total. Lanza ErrorErp. */
export function llamarErp<T = unknown>(conexion: ConexionErp, metodo: "GET" | "PUT" | "POST", ruta: string, cuerpo?: unknown): Promise<RespuestaErp<T>> {
  return new Promise((resolve, reject) => {
    let url: URL;
    try {
      url = new URL(urlEndpointErp(conexion, ruta));
    } catch {
      return reject(new ErrorErp("La URL del ERP no es válida.", "config"));
    }
    if (url.protocol !== "https:") return reject(new ErrorErp("La URL del ERP debe usar https://.", "config"));
    if (!conexion.apiKey) return reject(new ErrorErp("Falta la clave de integración del ERP.", "config"));

    const body = cuerpo === undefined ? undefined : Buffer.from(JSON.stringify(cuerpo), "utf8");
    const headers: Record<string, string> = {
      Authorization: `Bearer ${conexion.apiKey}`,
      Accept: "application/json"
    };
    if (body) {
      headers["Content-Type"] = "application/json; charset=utf-8";
      headers["Content-Length"] = String(body.length);
    }

    let terminado = false;
    let limite: ReturnType<typeof setTimeout> | undefined;
    const terminar = (fn: () => void) => {
      if (terminado) return;
      terminado = true;
      if (limite) clearTimeout(limite);
      fn();
    };

    const req = https.request(url, { method: metodo, headers, agent: agentePara(conexion.caPem) }, res => {
      const partes: Buffer[] = [];
      let bytes = 0;
      res.on("data", (trozo: Buffer) => {
        bytes += trozo.length;
        if (bytes > conexion.respuestaMaxBytes) {
          req.destroy();
          terminar(() => reject(new ErrorErp("La respuesta del ERP es demasiado grande.", "respuesta")));
          return;
        }
        partes.push(trozo);
      });
      res.on("end", () => terminar(() => {
        const status = res.statusCode ?? 0;
        const crudo = Buffer.concat(partes).toString("utf8");
        let datos: unknown = null;
        if (crudo.trim()) {
          try {
            datos = JSON.parse(crudo);
          } catch {
            if (status >= 200 && status < 300) return reject(new ErrorErp("El ERP respondió algo que no es JSON.", "respuesta", status));
          }
        }
        if (status >= 200 && status < 300) return resolve({ status, datos: datos as T });
        const codigo = esObjeto(datos) && typeof datos.codigo === "string" ? datos.codigo.slice(0, 60) : undefined;
        reject(new ErrorErp(mensajeErrorHttp(status, datos), "http", status, codigo));
      }));
      res.on("error", err => terminar(() => reject(errorDeRed(err))));
    });

    limite = setTimeout(() => {
      terminar(() => reject(new ErrorErp(`El ERP no respondió en ${Math.round(conexion.timeoutMs / 1000)} s.`, "tiempo")));
      req.destroy();
    }, conexion.timeoutMs);

    req.on("error", err => terminar(() => reject(errorDeRed(err))));
    if (body) req.write(body);
    req.end();
  });
}

const rutaSuscriptor = (idExterno: number) => `/suscriptores/${encodeURIComponent(String(idExterno))}`;

export async function erpSalud(conexion: ConexionErp): Promise<{ ok: true; origen: string | null; empresa: string | null }> {
  const { datos } = await llamarErp<any>(conexion, "GET", "/salud");
  if (!esObjeto(datos) || datos.ok !== true) throw new ErrorErp("El ERP respondió, pero no confirmó que la integración esté lista.", "respuesta");
  return { ok: true, origen: texto(datos.origen, 60), empresa: texto(datos.empresa, 160) };
}

export async function erpGuardarSuscriptor(conexion: ConexionErp, idExterno: number, payload: SuscriptorErp): Promise<{ clientId: number | null; proximaFacturacion: string | null }> {
  const { datos } = await llamarErp<any>(conexion, "PUT", rutaSuscriptor(idExterno), payload);
  if (!esObjeto(datos)) throw new ErrorErp("El ERP respondió sin datos del suscriptor.", "respuesta");
  return {
    clientId: numero(datos.clientId),
    proximaFacturacion: fechaYmd(esObjeto(datos.suscripcion) ? datos.suscripcion.proximaFacturacion : null)
  };
}

export async function erpEstadoCuenta(conexion: ConexionErp, idExterno: number): Promise<EstadoCuentaErp> {
  const { datos } = await llamarErp<unknown>(conexion, "GET", `${rutaSuscriptor(idExterno)}/estado-cuenta`);
  try {
    return validarEstadoCuenta(datos);
  } catch (err: any) {
    throw new ErrorErp(err.message, "respuesta");
  }
}

export async function erpFacturarAdicional(conexion: ConexionErp, idExterno: number, cuerpo: { referencia: string; meses: number; descripcion?: string }): Promise<{ factura: FacturaResumen; nueva: boolean }> {
  const { status, datos } = await llamarErp<any>(conexion, "POST", `${rutaSuscriptor(idExterno)}/facturas`, { ...cuerpo, monto: null });
  if (!esObjeto(datos)) throw new ErrorErp("El ERP respondió sin la factura.", "respuesta");
  try {
    return { factura: validarFacturaResumen(datos.factura), nueva: status === 201 };
  } catch (err: any) {
    throw new ErrorErp(err.message, "respuesta");
  }
}
