-- 2026-11-26: empresa de plataforma (administración SaaS) configurable en BD.
-- Idempotente: se puede aplicar más de una vez (INSERT IGNORE no pisa un valor ya configurado).
-- Requiere la tabla parametros_sistema (docs/sql/2026-11-26-cambio-contrasena-parametros.sql).

-- Id de la empresa de plataforma: principalmente para administración SaaS (puede tener datos de
-- demostración). No aparece en la reserva en línea, los procesos automáticos no le envían correos
-- y no emite comprobantes electrónicos. Sus administradores son los SaaS admin y su SMTP envía los
-- correos de restablecimiento de contraseña y los avisos de la plataforma.
INSERT IGNORE INTO parametros_sistema (clave, valor, descripcion) VALUES
  ('saas_id_compania_plataforma', '7', 'Id (companias.id_compania) de la empresa de plataforma (administración SaaS)');
