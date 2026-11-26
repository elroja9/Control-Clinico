-- 2026-11-26: límite de usuarios con que nace una empresa en el autorregistro.
-- El autorregistro ya no acepta estado, límite, cuota ni vencimiento enviados por el navegador:
-- la empresa nace PENDIENTE con este límite y solo el SaaS admin los cambia.
-- Idempotente: INSERT IGNORE no pisa un valor ya configurado.
INSERT IGNORE INTO parametros_sistema (clave, valor, descripcion) VALUES
  ('saas_max_usuarios_defecto', '5', 'Usuarios activos permitidos a una empresa nueva hasta que el SaaS admin defina su plan');
