-- 2026-11-27: integración de la facturación de suscripciones con el ERP ELROTECH (contrato v1,
-- docs/integracion-erp-saas.md, sección «Lado de las apps SaaS»).
--   * Configuración de plataforma en parametros_sistema (URL, sincronización, intervalos, mora).
--   * Clave de integración (cifrada AES-256-GCM) y CA propia del ERP en integracion_erp_config
--     (fila única): la clave no pasa por la caché de parámetros y el PEM no cabe en VARCHAR(500).
--   * Datos de la suscripción y resumen del estado de cuenta por empresa (columnas de companias).
--   * Solicitudes de "Facturar meses por adelantado" (referencia única = idempotencia en el ERP).
--
-- IDEMPOTENTE: se puede aplicar más de una vez. Sin DELIMITER (se ejecuta también con mysql2 y
-- multipleStatements): las columnas se agregan con sentencias preparadas que consultan
-- information_schema; las tablas usan CREATE TABLE IF NOT EXISTS y los datos INSERT IGNORE (no
-- pisan lo ya configurado). Requiere parametros_sistema (2026-11-26-cambio-contrasena-parametros.sql).

-- ---------------------------------------------------------------------------------------------
-- 1) Columnas de companias
-- ---------------------------------------------------------------------------------------------
-- Moneda de la cuota mensual que factura el ERP (CRC o USD).
SET @cc_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `companias` ADD COLUMN `monedaSuscripcion` CHAR(3) NOT NULL DEFAULT ''CRC''', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companias' AND COLUMN_NAME = 'monedaSuscripcion');
PREPARE cc_st FROM @cc_sql; EXECUTE cc_st; DEALLOCATE PREPARE cc_st;
-- Día del mes (1-28) en que el ERP emite la factura de la suscripción.
SET @cc_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `companias` ADD COLUMN `diaFacturacion` TINYINT UNSIGNED NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companias' AND COLUMN_NAME = 'diaFacturacion');
PREPARE cc_st FROM @cc_sql; EXECUTE cc_st; DEALLOCATE PREPARE cc_st;
-- 1 = hay cambios que todavía no llegan al ERP (PUT /suscriptores).
SET @cc_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `companias` ADD COLUMN `erpPendienteSync` TINYINT(1) NOT NULL DEFAULT 0', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companias' AND COLUMN_NAME = 'erpPendienteSync');
PREPARE cc_st FROM @cc_sql; EXECUTE cc_st; DEALLOCATE PREPARE cc_st;
-- Sube con cada cambio: un PUT solo limpia el pendiente si nadie cambió la empresa mientras tanto.
SET @cc_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `companias` ADD COLUMN `erpVersionSync` INT NOT NULL DEFAULT 0', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companias' AND COLUMN_NAME = 'erpVersionSync');
PREPARE cc_st FROM @cc_sql; EXECUTE cc_st; DEALLOCATE PREPARE cc_st;
-- Último PUT aceptado por el ERP (NULL = nunca dada de alta en el ERP).
SET @cc_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `companias` ADD COLUMN `erpSincronizadoEn` DATETIME NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companias' AND COLUMN_NAME = 'erpSincronizadoEn');
PREPARE cc_st FROM @cc_sql; EXECUTE cc_st; DEALLOCATE PREPARE cc_st;
-- Último error de sincronización o de estado de cuenta (NULL = sin error).
SET @cc_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `companias` ADD COLUMN `erpError` VARCHAR(500) NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companias' AND COLUMN_NAME = 'erpError');
PREPARE cc_st FROM @cc_sql; EXECUTE cc_st; DEALLOCATE PREPARE cc_st;
-- Resumen del último estado de cuenta del ERP (para el panel SaaS).
SET @cc_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `companias` ADD COLUMN `erpSaldoPendiente` DECIMAL(14,2) NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companias' AND COLUMN_NAME = 'erpSaldoPendiente');
PREPARE cc_st FROM @cc_sql; EXECUTE cc_st; DEALLOCATE PREPARE cc_st;
SET @cc_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `companias` ADD COLUMN `erpSaldoVencido` DECIMAL(14,2) NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companias' AND COLUMN_NAME = 'erpSaldoVencido');
PREPARE cc_st FROM @cc_sql; EXECUTE cc_st; DEALLOCATE PREPARE cc_st;
SET @cc_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `companias` ADD COLUMN `erpDiasMora` INT NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companias' AND COLUMN_NAME = 'erpDiasMora');
PREPARE cc_st FROM @cc_sql; EXECUTE cc_st; DEALLOCATE PREPARE cc_st;
SET @cc_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `companias` ADD COLUMN `erpMonedaSaldo` CHAR(3) NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companias' AND COLUMN_NAME = 'erpMonedaSaldo');
PREPARE cc_st FROM @cc_sql; EXECUTE cc_st; DEALLOCATE PREPARE cc_st;
SET @cc_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `companias` ADD COLUMN `erpProximaFacturacion` DATE NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companias' AND COLUMN_NAME = 'erpProximaFacturacion');
PREPARE cc_st FROM @cc_sql; EXECUTE cc_st; DEALLOCATE PREPARE cc_st;
SET @cc_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `companias` ADD COLUMN `erpUltimaFacturaConsecutivo` VARCHAR(20) NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companias' AND COLUMN_NAME = 'erpUltimaFacturaConsecutivo');
PREPARE cc_st FROM @cc_sql; EXECUTE cc_st; DEALLOCATE PREPARE cc_st;
SET @cc_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `companias` ADD COLUMN `erpUltimaFacturaEstado` VARCHAR(30) NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companias' AND COLUMN_NAME = 'erpUltimaFacturaEstado');
PREPARE cc_st FROM @cc_sql; EXECUTE cc_st; DEALLOCATE PREPARE cc_st;
SET @cc_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `companias` ADD COLUMN `erpUltimaFacturaFecha` DATE NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companias' AND COLUMN_NAME = 'erpUltimaFacturaFecha');
PREPARE cc_st FROM @cc_sql; EXECUTE cc_st; DEALLOCATE PREPARE cc_st;
-- Última consulta exitosa de estado-cuenta.
SET @cc_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `companias` ADD COLUMN `erpEstadoCuentaEn` DATETIME NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companias' AND COLUMN_NAME = 'erpEstadoCuentaEn');
PREPARE cc_st FROM @cc_sql; EXECUTE cc_st; DEALLOCATE PREPARE cc_st;
-- Aviso de suspensión por mora del periodo actual (NULL = no enviado). Se limpia al quedar al día o al reactivar.
SET @cc_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `companias` ADD COLUMN `erpAvisoMoraEnviadoEn` DATETIME NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companias' AND COLUMN_NAME = 'erpAvisoMoraEnviadoEn');
PREPARE cc_st FROM @cc_sql; EXECUTE cc_st; DEALLOCATE PREPARE cc_st;
-- Cuándo la suspensión automática por mora suspendió la empresa.
SET @cc_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `companias` ADD COLUMN `erpSuspendidaPorMoraEn` DATETIME NULL', 'SELECT 1')
  FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companias' AND COLUMN_NAME = 'erpSuspendidaPorMoraEn');
PREPARE cc_st FROM @cc_sql; EXECUTE cc_st; DEALLOCATE PREPARE cc_st;

-- Índice para el job (pendientes de sincronizar).
SET @cc_sql = (SELECT IF(COUNT(*) = 0, 'ALTER TABLE `companias` ADD INDEX `idx_companias_erp_pendiente` (`erpPendienteSync`)', 'SELECT 1')
  FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companias' AND INDEX_NAME = 'idx_companias_erp_pendiente');
PREPARE cc_st FROM @cc_sql; EXECUTE cc_st; DEALLOCATE PREPARE cc_st;

-- ---------------------------------------------------------------------------------------------
-- 2) Credenciales de la integración (fila única id = 1)
-- ---------------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integracion_erp_config (
  id TINYINT UNSIGNED NOT NULL,
  -- Clave Bearer emitida por el ERP, cifrada con ENCRYPTION_KEY (server/crypto.ts). Nunca se devuelve.
  apiKeyCifrada TEXT NULL,
  -- Últimos 4 caracteres, solo para mostrar en el panel que hay una clave configurada.
  apiKeyPista VARCHAR(8) NULL,
  -- CA (PEM) del certificado propio del ERP. La verificación TLS sigue siempre activa.
  caPem TEXT NULL,
  actualizadoPor INT NULL,
  actualizadoEn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT chk_integracion_erp_config_unica CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO integracion_erp_config (id) VALUES (1);

-- ---------------------------------------------------------------------------------------------
-- 3) Facturas de meses por adelantado pedidas al ERP
-- ---------------------------------------------------------------------------------------------
-- La referencia viaja al ERP (referenciaExterna = {origen}:{idExterno}:manual:{referencia}); un
-- reintento con la misma referencia devuelve la misma factura. Un segundo clic dentro de la
-- ventana erp_adelantado_ventana_seg reutiliza la referencia en vez de crear otra.
CREATE TABLE IF NOT EXISTS erp_facturas_adelantadas (
  id INT NOT NULL AUTO_INCREMENT,
  idCompania INT NOT NULL,
  referencia VARCHAR(64) NOT NULL,
  meses INT NOT NULL,
  -- PENDIENTE (enviada, sin respuesta) | EMITIDA | ERROR
  estado VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE',
  facturaIdErp BIGINT NULL,
  consecutivo VARCHAR(20) NULL,
  total DECIMAL(14,2) NULL,
  moneda CHAR(3) NULL,
  error VARCHAR(500) NULL,
  creadoPor INT NULL,
  creadoEn DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizadoEn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_erp_facturas_adelantadas_referencia (referencia),
  KEY idx_erp_facturas_adelantadas_compania (idCompania, creadoEn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- ---------------------------------------------------------------------------------------------
-- 4) Parámetros de plataforma (se editan desde Administración SaaS → Integración con ERP)
-- ---------------------------------------------------------------------------------------------
INSERT IGNORE INTO parametros_sistema (clave, valor, descripcion) VALUES
  ('erp_url', '', 'URL base (https) del ERP ELROTECH que factura las suscripciones; vacío = sin configurar'),
  ('erp_ruta_api', '/api/integraciones/v1', 'Ruta de la API de integraciones del ERP (contrato v1)'),
  ('erp_sync_activo', '0', '1 = el job sincroniza suscriptores y consulta estados de cuenta del ERP'),
  ('erp_sync_intervalo_min', '30', 'Minutos entre vueltas del job de sincronización con el ERP'),
  ('erp_timeout_ms', '15000', 'Tiempo límite (ms) de cada petición al ERP'),
  ('erp_mora_dias_suspension', '0', 'Días de mora tras los cuales se suspende la empresa automáticamente (0 = desactivado)'),
  ('erp_mora_dias_aviso', '5', 'Días de anticipación del correo de aviso antes de la suspensión por mora'),
  ('erp_adelantado_meses_max', '12', 'Máximo de meses que se pueden facturar por adelantado de una vez'),
  ('erp_adelantado_ventana_seg', '120', 'Segundos en que un segundo clic de facturar por adelantado reutiliza la misma referencia'),
  ('erp_respuesta_max_bytes', '2097152', 'Tamaño máximo (bytes) aceptado en una respuesta del ERP');
