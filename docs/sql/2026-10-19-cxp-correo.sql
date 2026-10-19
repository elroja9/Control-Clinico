-- CxP: lectura de facturas de proveedor por correo (spec 2026-10-19-cxp-lectura-correo-design.md).
-- Solo crea tablas nuevas; no toca datos existentes. Se aplica a mano (server.ts ya no crea esquema).

CREATE TABLE IF NOT EXISTS compania_imap_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idCompania INT NOT NULL,
  imapHost VARCHAR(255) NOT NULL DEFAULT '',
  imapPort INT NOT NULL DEFAULT 993,
  imapSeguro TINYINT(1) NOT NULL DEFAULT 1,
  imapUsuario VARCHAR(255) NOT NULL DEFAULT '',
  imapPasswordCifrado TEXT NULL,
  imapCarpeta VARCHAR(500) NOT NULL DEFAULT 'INBOX',
  activo TINYINT(1) NOT NULL DEFAULT 0,
  avance TEXT NULL,
  verificadaEn VARCHAR(50) NULL,
  UNIQUE KEY uq_imap_compania (idCompania)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS facturas_proveedor_correo (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idCompania INT NOT NULL,
  tipoDocumento VARCHAR(2) NOT NULL,
  clave VARCHAR(50) NOT NULL,
  numeroConsecutivo VARCHAR(100) NOT NULL DEFAULT '',
  fechaEmision VARCHAR(50) NOT NULL DEFAULT '',
  emisorNombre VARCHAR(150) NOT NULL DEFAULT '',
  emisorIdentificacion VARCHAR(30) NOT NULL DEFAULT '',
  montoTotal DECIMAL(18,2) NOT NULL DEFAULT 0,
  moneda VARCHAR(3) NOT NULL DEFAULT 'CRC',
  tipoCambio DECIMAL(18,5) NOT NULL DEFAULT 1,
  remitente VARCHAR(255) NOT NULL DEFAULT '',
  asunto VARCHAR(500) NOT NULL DEFAULT '',
  fechaCorreo VARCHAR(50) NOT NULL,
  nombreArchivo VARCHAR(255) NOT NULL DEFAULT '',
  xml LONGTEXT NOT NULL,
  estado VARCHAR(12) NOT NULL DEFAULT 'PENDIENTE',
  idCuentaPagar INT NULL,
  motivoDescarte VARCHAR(500) NULL,
  procesadoEn VARCHAR(50) NULL,
  creadoEn VARCHAR(50) NOT NULL,
  UNIQUE KEY uq_factura_correo_clave (idCompania, clave),
  INDEX idx_factura_correo_estado (idCompania, estado)
) ENGINE=InnoDB;
