-- Parámetros contables: plazos de crédito por empresa y tramos de renta por período fiscal.
-- Se aplica a mano UNA vez (MySQL 8.0 no tiene ADD COLUMN IF NOT EXISTS; server.ts ya no crea esquema).

-- Plazos por defecto de cada empresa: ventas a crédito a clientes y compras a crédito a proveedores.
ALTER TABLE companias
  ADD COLUMN plazoCreditoClientesDias INT NOT NULL DEFAULT 30,
  ADD COLUMN plazoCreditoProveedoresDias INT NOT NULL DEFAULT 30;

-- Plazo con que se emitió cada comprobante a crédito (va en <PlazoCredito> y define el vencimiento
-- de su cuenta por cobrar). Las ventas a crédito anteriores se emitieron todas a 30 días.
ALTER TABLE facturas ADD COLUMN plazoCredito INT NULL;
UPDATE facturas SET plazoCredito = 30 WHERE condicionVenta = '02' AND plazoCredito IS NULL;

-- Tramos del Impuesto sobre la Renta (D-101), uno por período fiscal; los mantiene el administrador
-- SaaS cuando Hacienda publica el decreto anual. Escalas en JSON: [[hasta, tasa], ...], hasta = null
-- en el último tramo (sin tope).
CREATE TABLE IF NOT EXISTS parametros_renta (
  anio INT PRIMARY KEY,
  escalaFisica TEXT NOT NULL,
  escalaJuridica TEXT NOT NULL,
  topeIngresosEscalaReducida DECIMAL(18,2) NOT NULL,
  tarifaGeneralJuridica DECIMAL(6,4) NOT NULL,
  referenciaLegal VARCHAR(255) NOT NULL DEFAULT '',
  actualizadoEn VARCHAR(50) NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO parametros_renta (anio, escalaFisica, escalaJuridica, topeIngresosEscalaReducida, tarifaGeneralJuridica, referenciaLegal, actualizadoEn) VALUES
  (2026,
   '[[6244000,0],[8329000,0.1],[10414000,0.15],[20872000,0.2],[null,0.25]]',
   '[[5621000,0.05],[8433000,0.1],[11243000,0.15],[null,0.2]]',
   119174000, 0.30,
   'Decreto Ejecutivo 45333-H (La Gaceta 229, 5 de diciembre de 2025)',
   '2026-10-22T00:00:00.000Z');
