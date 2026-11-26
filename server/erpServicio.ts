// Lado Control Clínico de la integración con el ERP ELROTECH: acceso a la BD, sincronización de
// suscriptores, job periódico, suspensión automática por mora y rutas del panel SaaS. Las reglas
// puras y el cliente HTTPS viven en server/erpIntegracion.ts. server.ts inyecta las dependencias
// (pool, parámetros, cifrado, cambio de estado SaaS con su correo y el correo de aviso).
//
// Nada de esto toca a la empresa de plataforma: no se sincroniza, no se factura y no se suspende.

import crypto from "crypto";
import type express from "express";
import type { Pool } from "mysql2/promise";
import {
  configErpDesdeParametros, validarEntradaConfigErp, infoCertificadoCa, pistaClave, construirSuscriptor,
  motivoOmitirSincronizacion, resumenParaGuardar, decidirMora, diasHastaSuspension, generarReferenciaAdelantado,
  elegirReferenciaAdelantado, errorMesesAdelantado, esDiaFacturacion, esMontoMensual, MONEDAS_SUSCRIPCION,
  erpSalud, erpGuardarSuscriptor, erpEstadoCuenta, erpFacturarAdicional, ErrorErp,
  type ConfigErp, type ConexionErp, type EstadoCuentaErp, type FacturaResumen, type MonedaSuscripcion
} from "./erpIntegracion";

type FilaParametro = { clave: string; valor: string };

export interface InfoAvisoMora {
  diasMora: number;
  diasHastaSuspension: number;
  saldoVencido: number | null;
  moneda: string | null;
}

export interface DependenciasErp {
  /** Pool de MySQL, o null si la app corre sin base de datos (la integración requiere BD). */
  pool: () => Pool | null;
  leerParametros: () => Promise<FilaParametro[]>;
  /** Descarta la caché de parametros_sistema tras guardar. */
  invalidarParametros: () => void;
  esCompaniaPlataforma: (id: number) => boolean;
  idCompaniaPlataforma: () => number;
  cifrar: (texto: string) => string;
  descifrar: (cifrado: string) => string;
  /** La misma lógica de POST /api/companies/:id/estado-saas (incluye el correo de estado). */
  cambiarEstadoSaas: (idCompania: number, nuevoEstado: "ACTIVA" | "SUSPENDIDA") => Promise<unknown>;
  /** Envía el aviso de suspensión por mora. 'sin-destino' = no hay SMTP de plataforma o destinatario
   * (no se reintenta); un error lanzado = fallo transitorio (se reintenta en la próxima vuelta). */
  enviarAvisoMora: (idCompania: number, info: InfoAvisoMora) => Promise<"enviado" | "sin-destino">;
}

export class ErrorIntegracion extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/** Respaldo técnico del job cuando faltan los parámetros (p. ej. migración sin aplicar): vuelve a
 * mirar la configuración cada 10 minutos. No es un valor de negocio. */
const REINTENTO_SIN_CONFIG_MS = 10 * 60_000;

export function crearServicioErp(deps: DependenciasErp) {
  function poolRequerido(): Pool {
    const p = deps.pool();
    if (!p) throw new ErrorIntegracion("La integración con el ERP requiere la base de datos.", 503);
    return p;
  }

  async function leerConfig(): Promise<{ config: ConfigErp; faltantes: string[] }> {
    return configErpDesdeParametros(await deps.leerParametros());
  }

  async function leerCredenciales(): Promise<{ apiKeyCifrada: string | null; apiKeyPista: string | null; caPem: string | null; actualizadoEn: any }> {
    const [rows] = await poolRequerido().query("SELECT apiKeyCifrada, apiKeyPista, caPem, actualizadoEn FROM integracion_erp_config WHERE id = 1");
    const r = (rows as any[])[0];
    return { apiKeyCifrada: r?.apiKeyCifrada ?? null, apiKeyPista: r?.apiKeyPista ?? null, caPem: r?.caPem ?? null, actualizadoEn: r?.actualizadoEn ?? null };
  }

  /** Conexión lista para llamar al ERP, o ErrorIntegracion con lo que falta configurar. */
  async function conexion(): Promise<{ conexion: ConexionErp; config: ConfigErp }> {
    const { config, faltantes } = await leerConfig();
    if (faltantes.length) throw new ErrorIntegracion(`Faltan parámetros de la integración con el ERP: ${faltantes.join(", ")}.`, 409);
    if (!config.url) throw new ErrorIntegracion("Configure la URL del ERP en Administración SaaS → Integración con ERP.", 409);
    const cred = await leerCredenciales();
    if (!cred.apiKeyCifrada) throw new ErrorIntegracion("Configure la clave de integración del ERP.", 409);
    let apiKey: string;
    try {
      apiKey = deps.descifrar(cred.apiKeyCifrada);
    } catch {
      throw new ErrorIntegracion("No se pudo descifrar la clave de integración del ERP; vuelva a guardarla.", 409);
    }
    return {
      config,
      conexion: { url: config.url, rutaApi: config.rutaApi, apiKey, caPem: cred.caPem, timeoutMs: config.timeoutMs, respuestaMaxBytes: config.respuestaMaxBytes }
    };
  }

  // Una operación a la vez por empresa (PUT, estado de cuenta, mora): el job y un clic del panel
  // nunca se cruzan sobre la misma empresa.
  const colas = new Map<number, Promise<unknown>>();
  function enSerie<T>(idCompania: number, fn: () => Promise<T>): Promise<T> {
    const previa = colas.get(idCompania) ?? Promise.resolve();
    const actual = previa.catch(() => {}).then(fn);
    colas.set(idCompania, actual);
    actual.finally(() => { if (colas.get(idCompania) === actual) colas.delete(idCompania); }).catch(() => {});
    return actual;
  }

  async function leerCompania(idCompania: number): Promise<any | null> {
    const [rows] = await poolRequerido().query(
      "SELECT *, TIMESTAMPDIFF(SECOND, erpAvisoMoraEnviadoEn, NOW()) AS segundosDesdeAvisoMora FROM companias WHERE id_compania = ?",
      [idCompania]
    );
    const r = (rows as any[])[0];
    if (r && r.id == null) r.id = r.id_compania;
    return r ?? null;
  }

  const recortar = (texto: string) => texto.slice(0, 500);

  /** Marca la empresa como pendiente de enviar al ERP (sube la versión). */
  async function marcarPendiente(idCompania: number): Promise<void> {
    if (deps.esCompaniaPlataforma(idCompania)) return;
    await poolRequerido().query(
      "UPDATE companias SET erpPendienteSync = 1, erpVersionSync = erpVersionSync + 1 WHERE id_compania = ? AND id_compania <> ?",
      [idCompania, deps.idCompaniaPlataforma()]
    );
  }

  /** PUT /suscriptores/{id}. Nunca lanza: devuelve el resultado y deja el error en companias.erpError. */
  function sincronizarCompania(idCompania: number): Promise<{ ok: boolean; omitida?: string; error?: string }> {
    return enSerie(idCompania, async () => {
      if (deps.esCompaniaPlataforma(idCompania)) return { ok: true, omitida: "plataforma" };
      const pool = poolRequerido();
      const c = await leerCompania(idCompania);
      if (!c) return { ok: false, error: "Empresa no encontrada." };
      const version = Number(c.erpVersionSync) || 0;
      const omitir = motivoOmitirSincronizacion({
        esPlataforma: false, estadoSaas: c.estadoSaas, montoMensual: c.montoMensual, sincronizadaAntes: !!c.erpSincronizadoEn
      });
      if (omitir) {
        await pool.query(
          "UPDATE companias SET erpPendienteSync = IF(erpVersionSync = ?, 0, erpPendienteSync), erpError = NULL WHERE id_compania = ?",
          [version, idCompania]
        );
        return { ok: true, omitida: omitir };
      }
      const armado = construirSuscriptor(c);
      if (armado.ok === false) {
        const error = recortar(`Datos incompletos para el ERP: ${armado.errores.join(" ")}`);
        await pool.query("UPDATE companias SET erpPendienteSync = 1, erpError = ? WHERE id_compania = ?", [error, idCompania]);
        return { ok: false, error };
      }
      let con: ConexionErp;
      try {
        con = (await conexion()).conexion;
      } catch (err: any) {
        // Sin configuración no se marca error en cada empresa: queda pendiente.
        return { ok: false, error: err.message };
      }
      try {
        const r = await erpGuardarSuscriptor(con, idCompania, armado.payload);
        await pool.query(
          "UPDATE companias SET erpPendienteSync = IF(erpVersionSync = ?, 0, 1), erpError = NULL, erpSincronizadoEn = NOW(), erpProximaFacturacion = COALESCE(?, erpProximaFacturacion) WHERE id_compania = ?",
          [version, r.proximaFacturacion, idCompania]
        );
        return { ok: true };
      } catch (err: any) {
        const error = recortar(err instanceof ErrorErp ? err.message : "No se pudo sincronizar con el ERP.");
        if (!(err instanceof ErrorErp)) console.error(`[ERP] Sincronización de la empresa ${idCompania}:`, err?.message || err);
        await pool.query("UPDATE companias SET erpPendienteSync = 1, erpError = ? WHERE id_compania = ?", [error, idCompania]);
        return { ok: false, error };
      }
    });
  }

  /** Marca pendiente e intenta el PUT sin esperar (nunca hace fallar la acción del administrador). */
  function solicitarSincronizacion(idCompania: number): void {
    if (deps.esCompaniaPlataforma(idCompania) || !deps.pool()) return;
    marcarPendiente(idCompania)
      .then(() => sincronizarCompania(idCompania))
      .catch(err => console.error(`[ERP] No se pudo solicitar la sincronización de la empresa ${idCompania}:`, err?.message || err));
  }

  /** Tras aprobar/suspender/reactivar desde el panel. Reactivar abre un periodo de mora nuevo (otro aviso con su plazo). */
  async function alCambiarEstadoSaas(idCompania: number, nuevoEstado: string): Promise<void> {
    if (deps.esCompaniaPlataforma(idCompania) || !deps.pool()) return;
    try {
      if (nuevoEstado === "ACTIVA") {
        await poolRequerido().query(
          "UPDATE companias SET erpAvisoMoraEnviadoEn = NULL, erpSuspendidaPorMoraEn = NULL WHERE id_compania = ?",
          [idCompania]
        );
      }
    } catch (err: any) {
      console.error(`[ERP] No se pudo reiniciar el aviso de mora de la empresa ${idCompania}:`, err?.message || err);
    }
    solicitarSincronizacion(idCompania);
  }

  /** GET estado-cuenta y guarda el resumen. Lanza ErrorErp/ErrorIntegracion. */
  async function refrescarEstadoCuentaSinSerie(idCompania: number, con: ConexionErp): Promise<EstadoCuentaErp> {
    const pool = poolRequerido();
    try {
      const ec = await erpEstadoCuenta(con, idCompania);
      const r = resumenParaGuardar(ec);
      await pool.query(
        `UPDATE companias SET erpSaldoPendiente = ?, erpSaldoVencido = ?, erpDiasMora = ?, erpMonedaSaldo = ?,
           erpProximaFacturacion = COALESCE(?, erpProximaFacturacion), erpUltimaFacturaConsecutivo = ?, erpUltimaFacturaEstado = ?,
           erpUltimaFacturaFecha = ?, erpEstadoCuentaEn = NOW(), erpError = IF(erpPendienteSync = 1, erpError, NULL)
         WHERE id_compania = ?`,
        [r.erpSaldoPendiente, r.erpSaldoVencido, r.erpDiasMora, r.erpMonedaSaldo, r.erpProximaFacturacion,
         r.erpUltimaFacturaConsecutivo, r.erpUltimaFacturaEstado, r.erpUltimaFacturaFecha, idCompania]
      );
      return ec;
    } catch (err: any) {
      if (err instanceof ErrorErp && err.status === 404) {
        // El ERP no conoce al suscriptor: se vuelve a dar de alta en la próxima sincronización.
        await pool.query(
          "UPDATE companias SET erpPendienteSync = 1, erpVersionSync = erpVersionSync + 1, erpError = ? WHERE id_compania = ?",
          ["El ERP no tiene este suscriptor; se volverá a sincronizar.", idCompania]
        );
      } else if (err instanceof ErrorErp) {
        await pool.query("UPDATE companias SET erpError = ? WHERE id_compania = ?", [recortar(`Estado de cuenta: ${err.message}`), idCompania]);
      }
      throw err;
    }
  }

  function refrescarEstadoCuenta(idCompania: number): Promise<EstadoCuentaErp> {
    return enSerie(idCompania, async () => refrescarEstadoCuentaSinSerie(idCompania, (await conexion()).conexion));
  }

  /** Suspensión automática por mora (solo con el estado de cuenta recién refrescado). */
  async function evaluarMora(idCompania: number, config: ConfigErp): Promise<void> {
    if (deps.esCompaniaPlataforma(idCompania)) return;
    const pool = poolRequerido();
    const c = await leerCompania(idCompania);
    if (!c) return;
    const segundos = c.segundosDesdeAvisoMora == null ? null : Number(c.segundosDesdeAvisoMora);
    const decision = decidirMora({
      esPlataforma: false,
      estadoSaas: c.estadoSaas,
      diasMora: c.erpDiasMora == null ? null : Number(c.erpDiasMora),
      diasSuspension: config.moraDiasSuspension,
      diasAviso: config.moraDiasAviso,
      avisoEnviado: c.erpAvisoMoraEnviadoEn != null,
      diasDesdeAviso: segundos == null ? null : Math.floor(segundos / 86400)
    });
    if (decision === "nada") return;

    if (decision === "reiniciar") {
      await pool.query("UPDATE companias SET erpAvisoMoraEnviadoEn = NULL WHERE id_compania = ?", [idCompania]);
      return;
    }

    if (decision === "avisar") {
      // Reclamo condicional: aunque corran dos procesos, el aviso sale una sola vez.
      const [res] = await pool.query(
        "UPDATE companias SET erpAvisoMoraEnviadoEn = NOW() WHERE id_compania = ? AND erpAvisoMoraEnviadoEn IS NULL",
        [idCompania]
      );
      if ((res as any).affectedRows !== 1) return;
      const diasMora = Number(c.erpDiasMora);
      try {
        const r = await deps.enviarAvisoMora(idCompania, {
          diasMora,
          diasHastaSuspension: diasHastaSuspension(config.moraDiasSuspension, config.moraDiasAviso, diasMora),
          saldoVencido: c.erpSaldoVencido == null ? null : Number(c.erpSaldoVencido),
          moneda: c.erpMonedaSaldo ?? null
        });
        console.log(`[ERP] Aviso de suspensión por mora de la empresa ${idCompania}: ${r === "enviado" ? "enviado" : "sin SMTP de plataforma o destinatario (queda registrado)"}.`);
      } catch (err: any) {
        // Fallo transitorio del correo: se libera el reclamo para reintentar en la próxima vuelta.
        await pool.query("UPDATE companias SET erpAvisoMoraEnviadoEn = NULL WHERE id_compania = ?", [idCompania]);
        console.error(`[ERP] No se pudo enviar el aviso de mora de la empresa ${idCompania}:`, err?.message || err);
      }
      return;
    }

    // suspender
    const [res] = await pool.query(
      "UPDATE companias SET erpSuspendidaPorMoraEn = NOW() WHERE id_compania = ? AND estadoSaas = 'ACTIVA' AND id_compania <> ?",
      [idCompania, deps.idCompaniaPlataforma()]
    );
    if ((res as any).affectedRows !== 1) return;
    console.log(`[ERP] Suspensión automática por mora de la empresa ${idCompania} (${c.erpDiasMora} días).`);
    await deps.cambiarEstadoSaas(idCompania, "SUSPENDIDA");
  }

  // --- Job periódico ---
  let jobEnCurso = false;

  async function cicloJob(): Promise<void> {
    if (jobEnCurso || !deps.pool()) return;
    jobEnCurso = true;
    try {
      const { config, faltantes } = await leerConfig();
      if (faltantes.length || !config.syncActivo || !config.url) return;
      let con: ConexionErp;
      try {
        con = (await conexion()).conexion;
      } catch (err: any) {
        console.warn("[ERP] Job: integración incompleta:", err.message);
        return;
      }
      const pool = poolRequerido();
      const idPlataforma = deps.idCompaniaPlataforma();

      // 1) Pendientes y empresas que nunca se dieron de alta en el ERP.
      const [pend] = await pool.query(
        "SELECT id_compania FROM companias WHERE id_compania <> ? AND (erpPendienteSync = 1 OR erpSincronizadoEn IS NULL) ORDER BY id_compania",
        [idPlataforma]
      );
      for (const r of pend as any[]) {
        await sincronizarCompania(Number(r.id_compania));
      }

      // 2) Estado de cuenta de las empresas con cuota ya dadas de alta, y mora.
      const [conCuota] = await pool.query(
        "SELECT id_compania FROM companias WHERE id_compania <> ? AND montoMensual > 0 AND erpSincronizadoEn IS NOT NULL ORDER BY id_compania",
        [idPlataforma]
      );
      for (const r of conCuota as any[]) {
        const id = Number(r.id_compania);
        await enSerie(id, async () => {
          try {
            await refrescarEstadoCuentaSinSerie(id, con);
          } catch (err: any) {
            if (!(err instanceof ErrorErp)) console.error(`[ERP] Estado de cuenta de la empresa ${id}:`, err?.message || err);
            return; // sin estado de cuenta fresco no se decide nada sobre la mora
          }
          try {
            await evaluarMora(id, config);
          } catch (err: any) {
            console.error(`[ERP] Mora de la empresa ${id}:`, err?.message || err);
          }
        });
      }
    } catch (err: any) {
      console.error("[ERP] Job de sincronización:", err?.message || err);
    } finally {
      jobEnCurso = false;
    }
  }

  /** Programa el job con el intervalo vigente de parametros_sistema (se relee en cada vuelta). */
  async function programarJob(): Promise<void> {
    await cicloJob();
    let esperaMs = REINTENTO_SIN_CONFIG_MS;
    try {
      const { config, faltantes } = await leerConfig();
      if (!faltantes.includes("erp_sync_intervalo_min")) esperaMs = config.syncIntervaloMin * 60_000;
    } catch { /* se reintenta con el respaldo */ }
    setTimeout(() => { programarJob().catch(() => {}); }, esperaMs);
  }

  // --- Configuración ---
  async function obtenerConfiguracion() {
    const { config, faltantes } = await leerConfig();
    const cred = deps.pool() ? await leerCredenciales() : { apiKeyCifrada: null, apiKeyPista: null, caPem: null, actualizadoEn: null };
    return {
      dbConectada: !!deps.pool(),
      url: config.url,
      rutaApi: config.rutaApi,
      syncActivo: config.syncActivo,
      syncIntervaloMin: config.syncIntervaloMin,
      timeoutMs: config.timeoutMs,
      moraDiasSuspension: config.moraDiasSuspension,
      moraDiasAviso: config.moraDiasAviso,
      adelantadoMesesMax: config.adelantadoMesesMax,
      faltantes,
      apiKeyConfigurada: !!cred.apiKeyCifrada,
      apiKeyPista: cred.apiKeyCifrada ? cred.apiKeyPista : null,
      caConfigurada: !!cred.caPem,
      ca: infoCertificadoCa(cred.caPem),
      actualizadoEn: cred.actualizadoEn
    };
  }

  async function guardarConfiguracion(entrada: unknown, idUsuario: number) {
    const pool = poolRequerido();
    const v = validarEntradaConfigErp((entrada ?? {}) as any);
    if (v.ok === false) throw new ErrorIntegracion(v.errores.join(" "));
    const anterior = (await leerConfig()).config;
    for (const p of v.cambios.parametros) {
      await pool.query(
        "INSERT INTO parametros_sistema (clave, valor) VALUES (?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)",
        [p.clave, p.valor]
      );
    }
    const sets: string[] = ["actualizadoPor = ?"];
    const valores: any[] = [idUsuario];
    if (v.cambios.apiKey === null) {
      sets.push("apiKeyCifrada = NULL", "apiKeyPista = NULL");
    } else if (typeof v.cambios.apiKey === "string") {
      sets.push("apiKeyCifrada = ?", "apiKeyPista = ?");
      valores.push(deps.cifrar(v.cambios.apiKey), pistaClave(v.cambios.apiKey) || null);
    }
    if (v.cambios.caPem !== undefined) {
      sets.push("caPem = ?");
      valores.push(v.cambios.caPem);
    }
    await pool.query("INSERT IGNORE INTO integracion_erp_config (id) VALUES (1)");
    await pool.query(`UPDATE integracion_erp_config SET ${sets.join(", ")} WHERE id = 1`, valores);
    deps.invalidarParametros();

    // Otro ERP (URL distinta): todas las empresas ya dadas de alta se vuelven a enviar.
    const nuevaUrl = v.cambios.parametros.find(p => p.clave === "erp_url")?.valor ?? "";
    if (nuevaUrl && nuevaUrl !== anterior.url) {
      await pool.query(
        "UPDATE companias SET erpPendienteSync = 1, erpVersionSync = erpVersionSync + 1 WHERE id_compania <> ? AND erpSincronizadoEn IS NOT NULL",
        [deps.idCompaniaPlataforma()]
      );
    }
    console.log(`[ERP] Configuración de la integración actualizada por el usuario ${idUsuario}${typeof v.cambios.apiKey === "string" ? " (clave nueva)" : v.cambios.apiKey === null ? " (clave borrada)" : ""}.`);
    return obtenerConfiguracion();
  }

  async function probarConexion() {
    const { conexion: con } = await conexion();
    return erpSalud(con);
  }

  // --- Suscripción por empresa ---
  async function guardarSuscripcion(idCompania: number, entrada: any) {
    if (deps.esCompaniaPlataforma(idCompania)) throw new ErrorIntegracion("La empresa de plataforma no tiene suscripción.");
    const moneda = String(entrada?.monedaSuscripcion ?? "");
    const errores: string[] = [];
    if (!MONEDAS_SUSCRIPCION.includes(moneda as MonedaSuscripcion)) errores.push("La moneda debe ser CRC o USD.");
    if (!esMontoMensual(Number(entrada?.montoMensual))) errores.push("La cuota mensual debe ser un monto mayor que cero (hasta 2 decimales).");
    if (!esDiaFacturacion(entrada?.diaFacturacion)) errores.push("El día de facturación debe ser un entero de 1 a 28.");
    if (errores.length) throw new ErrorIntegracion(errores.join(" "));
    const pool = poolRequerido();
    const [res] = await pool.query(
      "UPDATE companias SET monedaSuscripcion = ?, montoMensual = ?, diaFacturacion = ? WHERE id_compania = ? AND id_compania <> ?",
      [moneda, Number(entrada.montoMensual), Number(entrada.diaFacturacion), idCompania, deps.idCompaniaPlataforma()]
    );
    if ((res as any).affectedRows !== 1) throw new ErrorIntegracion("Empresa no encontrada.", 404);
    await marcarPendiente(idCompania);
    const sync = await sincronizarCompania(idCompania);
    return { company: await companiaPublica(idCompania), sincronizacion: sync };
  }

  /** Fila de companias como la devuelve GET /api/companies (sin columnas auxiliares). */
  async function companiaPublica(idCompania: number) {
    const [rows] = await poolRequerido().query("SELECT * FROM companias WHERE id_compania = ?", [idCompania]);
    const r = (rows as any[])[0];
    if (r && r.id == null) r.id = r.id_compania;
    return r ?? null;
  }

  async function sincronizarAhora(idCompania: number) {
    if (deps.esCompaniaPlataforma(idCompania)) throw new ErrorIntegracion("La empresa de plataforma no se sincroniza con el ERP.");
    if (!(await companiaPublica(idCompania))) throw new ErrorIntegracion("Empresa no encontrada.", 404);
    await conexion(); // error claro si falta configurar
    await marcarPendiente(idCompania);
    const sync = await sincronizarCompania(idCompania);
    let errorEstadoCuenta: string | null = null;
    const c = await companiaPublica(idCompania);
    if (sync.ok && c?.erpSincronizadoEn) {
      try {
        await refrescarEstadoCuenta(idCompania);
      } catch (err: any) {
        errorEstadoCuenta = err.message;
      }
    }
    return { company: await companiaPublica(idCompania), sincronizacion: sync, errorEstadoCuenta };
  }

  async function estadoCuentaEnVivo(idCompania: number) {
    if (deps.esCompaniaPlataforma(idCompania)) throw new ErrorIntegracion("La empresa de plataforma no tiene estado de cuenta.");
    const c = await companiaPublica(idCompania);
    if (!c) throw new ErrorIntegracion("Empresa no encontrada.", 404);
    if (!c.erpSincronizadoEn) throw new ErrorIntegracion("La empresa todavía no está dada de alta en el ERP. Use «Sincronizar ahora».", 409);
    const ec = await refrescarEstadoCuenta(idCompania);
    return { estadoCuenta: ec, company: await companiaPublica(idCompania) };
  }

  // Doble clic: una solicitud por empresa a la vez dentro de este proceso; entre procesos o tras
  // un reinicio, la ventana de reutilización de la referencia evita la factura duplicada.
  const adelantadosEnCurso = new Set<number>();

  async function facturarAdelantado(idCompania: number, mesesEntrada: unknown, idUsuario: number): Promise<{ factura: FacturaResumen; referencia: string; reutilizada: boolean; nueva: boolean }> {
    if (deps.esCompaniaPlataforma(idCompania)) throw new ErrorIntegracion("La empresa de plataforma no se factura.");
    const { conexion: con, config } = await conexion();
    const problema = errorMesesAdelantado(mesesEntrada, config.adelantadoMesesMax);
    if (problema) throw new ErrorIntegracion(problema);
    const meses = Number(mesesEntrada);
    if (adelantadosEnCurso.has(idCompania)) throw new ErrorIntegracion("Ya hay una facturación por adelantado en curso para esta empresa.", 409);
    adelantadosEnCurso.add(idCompania);
    try {
      const pool = poolRequerido();
      let c = await companiaPublica(idCompania);
      if (!c) throw new ErrorIntegracion("Empresa no encontrada.", 404);
      // El ERP factura con los datos que tiene: primero se le envían los cambios pendientes.
      if (!c.erpSincronizadoEn || Number(c.erpPendienteSync) === 1) {
        const sync = await sincronizarCompania(idCompania);
        c = await companiaPublica(idCompania);
        if (!sync.ok || !c?.erpSincronizadoEn) {
          throw new ErrorIntegracion(`Primero hay que sincronizar la empresa con el ERP: ${sync.error ?? sync.omitida ?? "sin alta en el ERP"}.`, 409);
        }
      }

      const [previas] = await pool.query(
        "SELECT referencia, meses, TIMESTAMPDIFF(SECOND, creadoEn, NOW()) AS edadSeg FROM erp_facturas_adelantadas WHERE idCompania = ? AND creadoEn >= NOW() - INTERVAL ? SECOND",
        [idCompania, config.adelantadoVentanaSeg]
      );
      const ahora = Date.now();
      const eleccion = elegirReferenciaAdelantado(
        (previas as any[]).map(p => ({ referencia: String(p.referencia), meses: Number(p.meses), creadoEnMs: ahora - Number(p.edadSeg) * 1000 })),
        meses, ahora, config.adelantadoVentanaSeg,
        () => generarReferenciaAdelantado(ahora, crypto.randomBytes(5).toString("hex"))
      );
      if (!eleccion.reutilizada) {
        await pool.query(
          "INSERT INTO erp_facturas_adelantadas (idCompania, referencia, meses, estado, creadoPor) VALUES (?, ?, ?, 'PENDIENTE', ?)",
          [idCompania, eleccion.referencia, meses, idUsuario]
        );
      }
      try {
        const r = await erpFacturarAdicional(con, idCompania, { referencia: eleccion.referencia, meses });
        await pool.query(
          "UPDATE erp_facturas_adelantadas SET estado = 'EMITIDA', facturaIdErp = ?, consecutivo = ?, total = ?, moneda = ?, error = NULL WHERE referencia = ?",
          [r.factura.id, r.factura.consecutivo, r.factura.total, r.factura.moneda, eleccion.referencia]
        );
        console.log(`[ERP] Factura por adelantado (${meses} mes(es)) de la empresa ${idCompania}: ${r.nueva ? "nueva" : "ya existía"} (${eleccion.referencia}).`);
        refrescarEstadoCuenta(idCompania).catch(() => {});
        return { factura: r.factura, referencia: eleccion.referencia, reutilizada: eleccion.reutilizada, nueva: r.nueva };
      } catch (err: any) {
        const mensaje = err instanceof ErrorErp ? err.message : "No se pudo facturar en el ERP.";
        // 'tiempo'/'red': la factura pudo crearse; la misma referencia en un reintento la recupera.
        await pool.query("UPDATE erp_facturas_adelantadas SET estado = 'ERROR', error = ? WHERE referencia = ?", [recortar(mensaje), eleccion.referencia]);
        if (!(err instanceof ErrorErp)) console.error(`[ERP] Facturar por adelantado (empresa ${idCompania}):`, err?.message || err);
        throw new ErrorIntegracion(mensaje, 502);
      }
    } finally {
      adelantadosEnCurso.delete(idCompania);
    }
  }

  return {
    marcarPendiente, sincronizarCompania, solicitarSincronizacion, alCambiarEstadoSaas, refrescarEstadoCuenta, evaluarMora,
    cicloJob, programarJob, obtenerConfiguracion, guardarConfiguracion, probarConexion, guardarSuscripcion, sincronizarAhora,
    estadoCuentaEnVivo, facturarAdelantado
  };
}

export type ServicioErp = ReturnType<typeof crearServicioErp>;

type Middleware = (req: express.Request, res: express.Response, next: express.NextFunction) => void;

/** Rutas del panel SaaS (solo el administrador SaaS; ninguna está en la lista blanca del Contador). */
export function registrarRutasErp(
  app: express.Express,
  servicio: ServicioErp,
  mw: { requireAuth: Middleware; requireSaasAdmin: Middleware; idUsuario: (req: express.Request) => number }
) {
  const { requireAuth, requireSaasAdmin } = mw;

  const responderError = (res: express.Response, err: any, contexto: string) => {
    if (err instanceof ErrorIntegracion) return res.status(err.status).json({ error: err.message });
    if (err instanceof ErrorErp) return res.status(502).json({ error: err.message, codigo: err.codigo });
    console.error(`[ERP] ${contexto}:`, err?.message || err);
    return res.status(500).json({ error: "Error interno de la integración con el ERP." });
  };

  const idDe = (req: express.Request): number | null => {
    const id = Number(req.params.id);
    return Number.isInteger(id) && id > 0 ? id : null;
  };

  app.get("/api/saas/integracion-erp", requireAuth, requireSaasAdmin, async (_req, res) => {
    try {
      res.json(await servicio.obtenerConfiguracion());
    } catch (err) {
      responderError(res, err, "Leer configuración");
    }
  });

  app.put("/api/saas/integracion-erp", requireAuth, requireSaasAdmin, async (req, res) => {
    try {
      res.json(await servicio.guardarConfiguracion(req.body, mw.idUsuario(req)));
    } catch (err) {
      responderError(res, err, "Guardar configuración");
    }
  });

  app.post("/api/saas/integracion-erp/probar", requireAuth, requireSaasAdmin, async (_req, res) => {
    try {
      res.json(await servicio.probarConexion());
    } catch (err) {
      responderError(res, err, "Probar conexión");
    }
  });

  app.put("/api/saas/companias/:id/suscripcion", requireAuth, requireSaasAdmin, async (req, res) => {
    const id = idDe(req);
    if (!id) return res.status(400).json({ error: "Empresa inválida." });
    try {
      res.json(await servicio.guardarSuscripcion(id, req.body));
    } catch (err) {
      responderError(res, err, "Guardar suscripción");
    }
  });

  app.post("/api/saas/companias/:id/sincronizar", requireAuth, requireSaasAdmin, async (req, res) => {
    const id = idDe(req);
    if (!id) return res.status(400).json({ error: "Empresa inválida." });
    try {
      res.json(await servicio.sincronizarAhora(id));
    } catch (err) {
      responderError(res, err, "Sincronizar");
    }
  });

  app.get("/api/saas/companias/:id/estado-cuenta", requireAuth, requireSaasAdmin, async (req, res) => {
    const id = idDe(req);
    if (!id) return res.status(400).json({ error: "Empresa inválida." });
    try {
      res.json(await servicio.estadoCuentaEnVivo(id));
    } catch (err) {
      responderError(res, err, "Estado de cuenta");
    }
  });

  app.post("/api/saas/companias/:id/facturar-adelantado", requireAuth, requireSaasAdmin, async (req, res) => {
    const id = idDe(req);
    if (!id) return res.status(400).json({ error: "Empresa inválida." });
    try {
      res.json(await servicio.facturarAdelantado(id, req.body?.meses, mw.idUsuario(req)));
    } catch (err) {
      responderError(res, err, "Facturar por adelantado");
    }
  });
}
