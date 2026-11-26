-- 2026-11-26: integración con las APIs de Hacienda sin valores quemados.
-- Aplicar una sola vez. Requiere parametros_sistema (2026-11-26-cambio-contrasena-parametros.sql).

-- 1) CABYS sugeridos por especialidad (perfil de la clínica). Códigos verificados contra
--    https://api.hacienda.go.cr/fe/cabys el 2026-11-26. perfil: 'Fisioterapia', 'Nutrición' o
--    'General' (se muestran a todas las clínicas de salud). Administrable desde la BD.
CREATE TABLE IF NOT EXISTS cabys_sugeridos (
  id INT NOT NULL AUTO_INCREMENT,
  perfil VARCHAR(20) NOT NULL,
  codigo CHAR(13) NOT NULL,
  descripcion VARCHAR(255) NOT NULL,
  impuesto DECIMAL(5,2) NULL,
  orden INT NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cabys_sugerido (perfil, codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO cabys_sugeridos (perfil, codigo, descripcion, impuesto, orden) VALUES
  ('Fisioterapia', '9310210150420', 'Masaje de cuerpo entero', 4, 10),
  ('Fisioterapia', '9310210030201', 'Masaje de tronco', 4, 20),
  ('Fisioterapia', '9310210011004', 'Masaje de cabeza o cuello', 4, 30),
  ('Fisioterapia', '9310210080111', 'Masaje de extremidad superior', 4, 40),
  ('Fisioterapia', '9310210140101', 'Masaje de extremidad inferior', 4, 50),
  ('Fisioterapia', '9310201100107', 'Ayudar y liderar el ejercicio para el dolor', 4, 60),
  ('Fisioterapia', '9310206060404', 'Entrenamiento para funciones de tolerancia al ejercicio', 4, 70),
  ('Fisioterapia', '9310212070119', 'Hidroterapia con inmersión total, con fines terapéuticos', 4, 80),
  ('Fisioterapia', '9310201100114', 'Acupuntura para el dolor', 4, 90),
  ('Fisioterapia', '9310210170108', 'Acupuntura para funciones musculares', 4, 100),
  ('Nutrición', '9319901000000', 'Servicios de nutrición', 4, 10),
  ('Nutrición', '9310212070110', 'Administración de requerimientos nutricionales, otros', 4, 20),
  ('General', '9310100000100', 'Consulta de médico general (chequeo, sin incluir intervenciones)', 4, 10),
  ('General', '9310100009900', 'Consulta de especialidad médica n.c.p (chequeo general, sin incluir intervenciones)', 4, 20),
  ('General', '9310100002500', 'Consulta de psicología (chequeo general, sin incluir intervenciones)', 4, 30),
  ('General', '9319999000000', 'Servicios de salud humana, n.c.p.', 4, 40);

-- 2) URLs y credenciales de cliente de Hacienda (antes constantes en server/haciendaApi.ts).
INSERT IGNORE INTO parametros_sistema (clave, valor, descripcion) VALUES
  ('hacienda_api_publica_url', 'https://api.hacienda.go.cr', 'API pública de Hacienda (CABYS, contribuyentes, exoneraciones, tipo de cambio)'),
  ('hacienda_recepcion_url_sandbox', 'https://api-sandbox.comprobanteselectronicos.go.cr/recepcion/v1', 'API de recepción de comprobantes, ambiente de pruebas'),
  ('hacienda_recepcion_url_produccion', 'https://api.comprobanteselectronicos.go.cr/recepcion/v1', 'API de recepción de comprobantes, producción'),
  ('hacienda_comprobantes_limite', '20', 'Cantidad de comprobantes por página al consultar los emitidos en Hacienda'),
  ('hacienda_cabys_resultados_max', '20', 'Máximo de resultados al buscar códigos CABYS');

-- 3) Autenticación (IdP) de Hacienda por ambiente (antes constantes en server/haciendaApi.ts).
INSERT IGNORE INTO parametros_sistema (clave, valor, descripcion) VALUES
  ('hacienda_idp_url_sandbox', 'https://idp.comprobanteselectronicos.go.cr/auth/realms/rut-stag/protocol/openid-connect/token', 'IdP de Hacienda, ambiente de pruebas'),
  ('hacienda_idp_url_produccion', 'https://idp.comprobanteselectronicos.go.cr/auth/realms/rut/protocol/openid-connect/token', 'IdP de Hacienda, producción'),
  ('hacienda_client_id_sandbox', 'api-stag', 'client_id del IdP, ambiente de pruebas'),
  ('hacienda_client_id_produccion', 'api-prod', 'client_id del IdP, producción');
