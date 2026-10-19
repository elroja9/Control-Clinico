-- Perfil Legal: casos y control de documentos (spec 2026-10-19-perfil-legal-casos-documentos-design.md).
-- Solo crea tablas nuevas; no toca datos existentes. Se aplica a mano (server.ts ya no crea esquema).
-- Fechas como VARCHAR, igual que el resto de la BD: días 'YYYY-MM-DD', instantes ISO.

CREATE TABLE IF NOT EXISTS casos_legales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idCompania INT NOT NULL,
  idPaciente INT NOT NULL,
  numeroExpediente VARCHAR(60) NOT NULL DEFAULT '',
  titulo VARCHAR(150) NOT NULL,
  materia VARCHAR(100) NOT NULL DEFAULT '',
  estado VARCHAR(10) NOT NULL DEFAULT 'ABIERTO',
  ubicacionFisica VARCHAR(150) NOT NULL DEFAULT '',
  recordatorioCadaDias INT NOT NULL DEFAULT 7,
  ultimoRecordatorioEn VARCHAR(50) NULL,
  notas TEXT NULL,
  creadoEn VARCHAR(50) NOT NULL,
  INDEX idx_casos_compania (idCompania),
  INDEX idx_casos_paciente (idPaciente)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS documentos_caso (
  id INT AUTO_INCREMENT PRIMARY KEY,
  idCaso INT NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  estado VARCHAR(10) NOT NULL DEFAULT 'PENDIENTE',
  folio VARCHAR(60) NOT NULL DEFAULT '',
  fechaLimite VARCHAR(10) NULL,
  fechaRecibido VARCHAR(10) NULL,
  notas TEXT NULL,
  INDEX idx_documentos_caso (idCaso),
  CONSTRAINT fk_documentos_caso_caso FOREIGN KEY (idCaso) REFERENCES casos_legales(id) ON DELETE CASCADE
) ENGINE=InnoDB;
