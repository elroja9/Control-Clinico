-- 2026-11-27: facturación electrónica robusta (rama feat/facturacion-robusta).
--   * guardar primero y transmitir después (estado PENDIENTE) + cola de transmisión en segundo plano
--   * Tiquete Electrónico (04) con su propio consecutivo
--   * sucursal/terminal y numeración mínima por empresa
--   * facturar a un tercero (copia del receptor en cada comprobante + terceros guardados por paciente)
--   * descuentos por línea y varios medios de pago
--   * correo automático al quedar ACEPTADO, «Probar configuración», reintento con clave nueva
--   * catálogos de Hacienda y parámetros técnicos en BD (nada quemado en código)
--
-- IDEMPOTENTE: se puede aplicar más de una vez. MySQL 8.0 no tiene ADD COLUMN IF NOT EXISTS, así
-- que las columnas e índices se agregan con procedimientos que revisan information_schema; las
-- tablas usan CREATE TABLE IF NOT EXISTS y los datos INSERT IGNORE (no pisan lo ya configurado).
-- Requiere parametros_sistema (2026-11-26-cambio-contrasena-parametros.sql).
-- Aplicar con el cliente mysql (usa DELIMITER).

DROP PROCEDURE IF EXISTS cc_agregar_columna;
DROP PROCEDURE IF EXISTS cc_agregar_indice;

DELIMITER $$
CREATE PROCEDURE cc_agregar_columna(IN p_tabla VARCHAR(64), IN p_columna VARCHAR(64), IN p_definicion VARCHAR(500))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tabla AND COLUMN_NAME = p_columna
  ) THEN
    SET @cc_sql = CONCAT('ALTER TABLE `', p_tabla, '` ADD COLUMN `', p_columna, '` ', p_definicion);
    PREPARE cc_st FROM @cc_sql;
    EXECUTE cc_st;
    DEALLOCATE PREPARE cc_st;
  END IF;
END$$

CREATE PROCEDURE cc_agregar_indice(IN p_tabla VARCHAR(64), IN p_indice VARCHAR(64), IN p_columnas VARCHAR(500))
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = p_tabla AND INDEX_NAME = p_indice
  ) THEN
    SET @cc_sql = CONCAT('ALTER TABLE `', p_tabla, '` ADD INDEX `', p_indice, '` (', p_columnas, ')');
    PREPARE cc_st FROM @cc_sql;
    EXECUTE cc_st;
    DEALLOCATE PREPARE cc_st;
  END IF;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------------------------------
-- 1) Configuración de Hacienda por empresa
-- ---------------------------------------------------------------------------------------------
-- Contadores (ya existen en producción; se aseguran por si se aplica en un entorno nuevo).
CALL cc_agregar_columna('compania_hacienda_config', 'ultimo_consecutivo', 'INT NOT NULL DEFAULT 0');
CALL cc_agregar_columna('compania_hacienda_config', 'ultimo_consecutivo_nc', 'INT NOT NULL DEFAULT 0');
CALL cc_agregar_columna('compania_hacienda_config', 'ultimo_consecutivo_nd', 'INT NOT NULL DEFAULT 0');
-- Tiquete Electrónico (04): numeración propia.
CALL cc_agregar_columna('compania_hacienda_config', 'ultimo_consecutivo_te', 'INT NOT NULL DEFAULT 0');
-- Sucursal (3 dígitos) y terminal (5 dígitos) del consecutivo de 20 dígitos.
CALL cc_agregar_columna('compania_hacienda_config', 'sucursal', 'CHAR(3) NOT NULL DEFAULT ''001''');
CALL cc_agregar_columna('compania_hacienda_config', 'terminal', 'CHAR(5) NOT NULL DEFAULT ''00001''');
-- Numeración mínima por tipo de documento (empresa que viene de otro sistema): el siguiente
-- número es max(último, mínimo) + 1, así nunca se reutiliza uno que Hacienda ya tiene.
CALL cc_agregar_columna('compania_hacienda_config', 'numeracion_minima_fe', 'INT NOT NULL DEFAULT 0');
CALL cc_agregar_columna('compania_hacienda_config', 'numeracion_minima_nc', 'INT NOT NULL DEFAULT 0');
CALL cc_agregar_columna('compania_hacienda_config', 'numeracion_minima_nd', 'INT NOT NULL DEFAULT 0');
CALL cc_agregar_columna('compania_hacienda_config', 'numeracion_minima_te', 'INT NOT NULL DEFAULT 0');
-- Enviar el comprobante por correo al receptor cuando Hacienda lo acepta (1 = sí).
CALL cc_agregar_columna('compania_hacienda_config', 'correo_automatico', 'TINYINT(1) NOT NULL DEFAULT 1');
-- Resultado de «Probar configuración» (.p12 + PIN + inicio de sesión real en el IdP). Se
-- reinicia al cambiar credenciales, certificado o ambiente.
CALL cc_agregar_columna('compania_hacienda_config', 'config_verificada', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL cc_agregar_columna('compania_hacienda_config', 'config_verificada_en', 'DATETIME NULL');

-- ---------------------------------------------------------------------------------------------
-- 2) Comprobantes: cola de transmisión, receptor, medios de pago, correo, efectos de notas
-- ---------------------------------------------------------------------------------------------
-- Copia del receptor al emitir (el paciente o un tercero). Las Notas y la anulación usan siempre
-- la copia del comprobante original. NULL en comprobantes anteriores (se usa el paciente).
CALL cc_agregar_columna('facturas', 'receptor_tipo_id', 'VARCHAR(3) NULL');
CALL cc_agregar_columna('facturas', 'receptor_numero', 'VARCHAR(20) NULL');
CALL cc_agregar_columna('facturas', 'receptor_nombre', 'VARCHAR(100) NULL');
CALL cc_agregar_columna('facturas', 'receptor_correo', 'VARCHAR(160) NULL');
CALL cc_agregar_columna('facturas', 'receptor_actividad', 'CHAR(6) NULL');
CALL cc_agregar_columna('facturas', 'receptor_es_tercero', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL cc_agregar_columna('facturas', 'correo_copia_paciente', 'TINYINT(1) NOT NULL DEFAULT 0');
-- Medios de pago (JSON [{"tipo":"01","monto":5000}, ...]); medioPago conserva el primero.
CALL cc_agregar_columna('facturas', 'medios_pago', 'TEXT NULL');
CALL cc_agregar_columna('facturas', 'total_descuentos', 'DECIMAL(14,5) NOT NULL DEFAULT 0');
-- Cola de transmisión. hacienda_post_realizado = 1 si un POST pudo haber llegado a Hacienda: desde
-- ahí solo se CONSULTA la clave (nunca se reenvía) hasta que Hacienda diga que no la tiene.
-- hacienda_procesando_hasta = reclamo de la fila (UPDATE condicional) para que dos procesos nunca
-- trabajen el mismo comprobante.
CALL cc_agregar_columna('facturas', 'hacienda_intentos', 'INT NOT NULL DEFAULT 0');
CALL cc_agregar_columna('facturas', 'hacienda_post_realizado', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL cc_agregar_columna('facturas', 'hacienda_proximo_intento', 'DATETIME(3) NULL');
CALL cc_agregar_columna('facturas', 'hacienda_ultimo_intento', 'DATETIME(3) NULL');
CALL cc_agregar_columna('facturas', 'hacienda_error_detalle', 'VARCHAR(1000) NULL');
CALL cc_agregar_columna('facturas', 'hacienda_procesando_hasta', 'DATETIME(3) NULL');
-- Notas: qué efecto local tienen (ANULACION / CREDITO / DEBITO) y si ya se aplicó. Se aplica una
-- sola vez, cuando Hacienda recibe la nota. DEFAULT 1: las notas anteriores ya tuvieron su trato.
CALL cc_agregar_columna('facturas', 'nota_efecto', 'VARCHAR(12) NULL');
CALL cc_agregar_columna('facturas', 'efectos_aplicados', 'TINYINT(1) NOT NULL DEFAULT 1');
-- Correo automático al quedar ACEPTADO (0 = no, 1 = enviado, 2 = en curso).
CALL cc_agregar_columna('facturas', 'correo_enviado', 'TINYINT(1) NOT NULL DEFAULT 0');
CALL cc_agregar_columna('facturas', 'correo_enviado_en', 'DATETIME NULL');
CALL cc_agregar_columna('facturas', 'correo_error', 'VARCHAR(500) NULL');
CALL cc_agregar_indice('facturas', 'idx_facturas_cola_hacienda', 'estado, hacienda_proximo_intento');

-- Los comprobantes que ya estaban en ERROR con envío incierto pasan a la cola, que solo los consulta.
UPDATE facturas SET hacienda_post_realizado = 1
 WHERE hacienda_post_realizado = 0 AND (estado = 'ENVIADA' OR (estado = 'ERROR' AND mensajeError LIKE 'Envío incierto:%'));

-- Descuento por línea.
CALL cc_agregar_columna('factura_lineas', 'monto_descuento', 'DECIMAL(14,5) NOT NULL DEFAULT 0');
CALL cc_agregar_columna('factura_lineas', 'codigo_descuento', 'VARCHAR(2) NULL');
CALL cc_agregar_columna('factura_lineas', 'naturaleza_descuento', 'VARCHAR(80) NULL');

-- ---------------------------------------------------------------------------------------------
-- 3) Tablas nuevas
-- ---------------------------------------------------------------------------------------------
-- Terceros a los que un paciente pide facturar (p. ej. la empresa donde trabaja). Acotado por
-- empresa y paciente; uno por número de identificación.
CREATE TABLE IF NOT EXISTS paciente_receptores_factura (
  id INT NOT NULL AUTO_INCREMENT,
  idCompania INT NOT NULL,
  idPaciente INT NOT NULL,
  tipoIdentificacion VARCHAR(3) NOT NULL,
  numero VARCHAR(20) NOT NULL DEFAULT '',
  nombre VARCHAR(100) NOT NULL,
  correo VARCHAR(160) NULL,
  telefono VARCHAR(20) NULL,
  codigoActividad CHAR(6) NULL,
  creadoEn DATETIME NOT NULL,
  actualizadoEn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_receptor_paciente_numero (idCompania, idPaciente, numero),
  KEY idx_receptor_paciente (idCompania, idPaciente)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Auditoría del «Reintentar con clave nueva»: la clave, el consecutivo y la respuesta rechazados.
CREATE TABLE IF NOT EXISTS factura_historial_rechazos (
  id INT NOT NULL AUTO_INCREMENT,
  id_factura INT NOT NULL,
  idCompania INT NOT NULL,
  tipoDocumento VARCHAR(2) NOT NULL,
  clave VARCHAR(50) NOT NULL,
  consecutivo VARCHAR(20) NOT NULL,
  fechaEmision VARCHAR(30) NULL,
  mensajeError TEXT NULL,
  respuesta_hacienda MEDIUMTEXT NULL,
  xml_firmado MEDIUMTEXT NULL,
  reemplazadaEn DATETIME NOT NULL,
  reemplazadaPor INT NULL,
  PRIMARY KEY (id),
  KEY idx_historial_factura (id_factura),
  KEY idx_historial_compania (idCompania)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Catálogos de Hacienda v4.4 que la app valida (ANEXOS Y ESTRUCTURAS_V4.4: Nota 5 «Condiciones de
-- la venta», Nota 6 «Medios de pago» y el catálogo «Código del descuento»). activo = 0 oculta un
-- código sin borrarlo. Condiciones de venta: solo Contado y Crédito vienen activas porque son las
-- que el flujo de la clínica soporta (CxC, plazo); las demás quedan cargadas para activarlas cuando
-- el negocio las necesite (99 exige además un texto que el formulario todavía no pide).
CREATE TABLE IF NOT EXISTS hacienda_catalogos (
  tipo VARCHAR(30) NOT NULL,
  codigo VARCHAR(4) NOT NULL,
  descripcion VARCHAR(150) NOT NULL,
  orden INT NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (tipo, codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO hacienda_catalogos (tipo, codigo, descripcion, orden, activo) VALUES
  ('CONDICION_VENTA', '01', 'Contado', 10, 1),
  ('CONDICION_VENTA', '02', 'Crédito', 20, 1),
  ('CONDICION_VENTA', '03', 'Consignación', 30, 0),
  ('CONDICION_VENTA', '04', 'Apartado', 40, 0),
  ('CONDICION_VENTA', '05', 'Arrendamiento con opción de compra', 50, 0),
  ('CONDICION_VENTA', '06', 'Arrendamiento en función financiera', 60, 0),
  ('CONDICION_VENTA', '07', 'Cobro a favor de un tercero', 70, 0),
  ('CONDICION_VENTA', '08', 'Servicios prestados al Estado', 80, 0),
  ('CONDICION_VENTA', '09', 'Pago de servicios prestados al Estado', 90, 0),
  ('CONDICION_VENTA', '10', 'Venta a crédito en IVA hasta 90 días (Artículo 27, LIVA)', 100, 0),
  ('CONDICION_VENTA', '11', 'Pago de venta a crédito en IVA hasta 90 días (Artículo 27, LIVA)', 110, 0),
  ('CONDICION_VENTA', '12', 'Venta mercancía no nacionalizada', 120, 0),
  ('CONDICION_VENTA', '13', 'Venta bienes usados no contribuyente', 130, 0),
  ('CONDICION_VENTA', '14', 'Arrendamiento operativo', 140, 0),
  ('CONDICION_VENTA', '15', 'Arrendamiento financiero', 150, 0),
  ('CONDICION_VENTA', '99', 'Otros', 990, 0),
  ('MEDIO_PAGO', '01', 'Efectivo', 10, 1),
  ('MEDIO_PAGO', '02', 'Tarjeta', 20, 1),
  ('MEDIO_PAGO', '03', 'Cheque', 30, 1),
  ('MEDIO_PAGO', '04', 'Transferencia – depósito bancario', 40, 1),
  ('MEDIO_PAGO', '05', 'Recaudado por terceros', 50, 1),
  ('MEDIO_PAGO', '06', 'SINPE Móvil', 60, 1),
  ('MEDIO_PAGO', '07', 'Plataforma digital', 70, 1),
  ('MEDIO_PAGO', '99', 'Otros', 990, 1),
  ('CODIGO_DESCUENTO', '01', 'Descuento por regalía', 10, 1),
  ('CODIGO_DESCUENTO', '02', 'Descuento por regalía o bonificaciones IVA cobrado al cliente', 20, 1),
  ('CODIGO_DESCUENTO', '03', 'Descuento por bonificación', 30, 1),
  ('CODIGO_DESCUENTO', '04', 'Descuento por volumen', 40, 1),
  ('CODIGO_DESCUENTO', '05', 'Descuento por temporada (estacional)', 50, 1),
  ('CODIGO_DESCUENTO', '06', 'Descuento promocional', 60, 1),
  ('CODIGO_DESCUENTO', '07', 'Descuento comercial', 70, 1),
  ('CODIGO_DESCUENTO', '08', 'Descuento por frecuencia', 80, 1),
  ('CODIGO_DESCUENTO', '09', 'Descuento sostenido', 90, 1),
  ('CODIGO_DESCUENTO', '99', 'Otros descuentos', 990, 1);

-- ---------------------------------------------------------------------------------------------
-- 4) Parámetros del sistema (antes constantes en server/haciendaApi.ts, haciendaSigner.ts y server.ts)
-- ---------------------------------------------------------------------------------------------
INSERT IGNORE INTO parametros_sistema (clave, valor, descripcion) VALUES
  -- Política de firma XAdES-EPES (verificada contra el ejemplo oficial de ANEXOS Y ESTRUCTURAS_V4.4, p. 86).
  ('hacienda_politica_firma_url', 'https://cdn.comprobanteselectronicos.go.cr/xml-schemas/Resoluci%C3%B3n_General_sobre_disposiciones_t%C3%A9cnicas_comprobantes_electr%C3%B3nicos_para_efectos_tributarios.pdf', 'URL (OIDAsURI) de la política de firma XAdES-EPES de Hacienda'),
  ('hacienda_politica_firma_hash', 'DWxin1xWOeI8OuWQXazh4VjLWAaCLAA954em7DMh0h8=', 'Digest SHA-256 (base64) del documento de la política de firma'),
  -- Comunicación con Hacienda
  ('hacienda_fetch_timeout_ms', '20000', 'Tiempo máximo (ms) de cada llamada al IdP o a la API de recepción'),
  ('hacienda_consulta_timeout_ms', '5000', 'Tiempo máximo (ms) de cada consulta de estado durante el sondeo corto'),
  ('hacienda_sondeo_intentos', '4', 'Consultas de estado justo después de enviar un comprobante'),
  ('hacienda_sondeo_espera_ms', '2000', 'Espera (ms) entre consultas del sondeo corto'),
  ('hacienda_sondeo_plazo_ms', '12000', 'Plazo total (ms) del sondeo corto después de enviar'),
  ('hacienda_token_margen_seg', '60', 'Segundos antes de expires_in en que se renueva el token del IdP'),
  -- Cola de transmisión en segundo plano
  ('hacienda_cola_intervalo_seg', '60', 'Cada cuántos segundos revisa la cola de comprobantes por transmitir'),
  ('hacienda_cola_lote', '20', 'Comprobantes que procesa la cola en cada vuelta'),
  ('hacienda_cola_bloqueo_seg', '300', 'Segundos que un proceso reserva un comprobante mientras lo transmite'),
  ('hacienda_cola_backoff_base_seg', '60', 'Espera (s) tras el primer intento fallido; se duplica en cada intento'),
  ('hacienda_cola_backoff_max_seg', '3600', 'Espera máxima (s) entre intentos de la cola'),
  ('hacienda_cola_max_intentos', '12', 'Intentos automáticos antes de dejar el comprobante para acción manual'),
  -- Comprobante
  ('hacienda_unidad_medida_servicio', 'Sp', 'Unidad de medida por omisión de un servicio sin unidad configurada'),
  ('hacienda_unidad_medida_mercancia', 'Unid', 'Unidad de medida por omisión de un artículo sin unidad configurada'),
  ('hacienda_codigo_descuento_defecto', '07', 'Código de descuento (hacienda_catalogos CODIGO_DESCUENTO) por omisión'),
  ('hacienda_medio_pago_tolerancia', '0.01', 'Diferencia máxima (colones) entre la suma de medios de pago y el total'),
  ('hacienda_medios_pago_max', '4', 'Máximo de medios de pago por comprobante (el XSD v4.4 admite 4)'),
  ('hacienda_detalle_min', '3', 'Largo mínimo del <Detalle> de una línea'),
  ('hacienda_detalle_max', '200', 'Largo máximo del <Detalle> de una línea (XSD v4.4: 200)'),
  ('hacienda_condiciones_exigen_receptor', '02', 'Condiciones de venta (coma) que exigen Factura con receptor identificado'),
  -- Consultas públicas
  ('hacienda_tipo_cambio_cache_min', '30', 'Minutos que se guarda en memoria el tipo de cambio de Hacienda');

DROP PROCEDURE IF EXISTS cc_agregar_columna;
DROP PROCEDURE IF EXISTS cc_agregar_indice;
