-- 2026-11-25: suscripción de calendario (ICS) por profesional para Android/iOS.
-- Aplicar una sola vez (MySQL 8.0 no tiene ADD COLUMN IF NOT EXISTS).

-- Token secreto del enlace de suscripción (NULL = sin enlace generado). Se puede regenerar
-- para invalidar un enlace compartido por error.
ALTER TABLE usuarios
  ADD COLUMN calendarioToken VARCHAR(64) NULL,
  ADD COLUMN calendarioNombreCompleto TINYINT(1) NOT NULL DEFAULT 0,
  ADD UNIQUE KEY uq_usuarios_calendario_token (calendarioToken);
