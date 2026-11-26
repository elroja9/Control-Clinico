-- 2026-11-26: cambio de contraseña por el propio usuario + parámetros del sistema en BD.
-- Aplicar una sola vez (MySQL 8.0 no tiene ADD COLUMN IF NOT EXISTS).

-- 1) Versión de sesión: viaja en el token; al cambiar/restablecer la contraseña se incrementa y
--    los tokens emitidos antes (otros dispositivos) dejan de valer.
ALTER TABLE usuarios
  ADD COLUMN sesionVersion INT NOT NULL DEFAULT 0;

-- 2) Parámetros del sistema (regla del proyecto: nada de valores de negocio quemados en código).
CREATE TABLE IF NOT EXISTS parametros_sistema (
  clave VARCHAR(64) NOT NULL,
  valor VARCHAR(500) NOT NULL,
  descripcion VARCHAR(255) NULL,
  actualizadoEn TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO parametros_sistema (clave, valor, descripcion) VALUES
  ('password_min_longitud', '8', 'Longitud mínima de una contraseña nueva'),
  ('password_requiere_letras_numeros', '1', '1 = la contraseña nueva debe tener letras y números'),
  ('password_intentos_max', '5', 'Intentos fallidos de contraseña actual permitidos por ventana'),
  ('password_intentos_ventana_min', '15', 'Ventana (minutos) del límite de intentos fallidos');
