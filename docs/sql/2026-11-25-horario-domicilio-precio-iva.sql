-- 2026-11-25: horario fraccionado para citas a domicilio + precio de servicios con IVA.
-- Aplicar una sola vez (MySQL 8.0 no tiene ADD/CREATE ... IF NOT EXISTS para columnas;
-- la tabla sí usa IF NOT EXISTS).

-- 1) Horario propio de citas a DOMICILIO, con varios tramos por día (horario fraccionado).
--    dia: 'lunes'..'domingo' (mismas claves que HorarioAtencion). Una fila por tramo.
--    Si una empresa no tiene filas aquí, las citas a domicilio usan compania_horario_atencion.
CREATE TABLE IF NOT EXISTS compania_horario_domicilio (
  id INT NOT NULL AUTO_INCREMENT,
  id_compania INT NOT NULL,
  dia VARCHAR(10) NOT NULL,
  abre VARCHAR(5) NOT NULL,
  cierra VARCHAR(5) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_horario_dom_compania (id_compania, dia),
  CONSTRAINT fk_horario_dom_compania FOREIGN KEY (id_compania) REFERENCES companias (id_compania) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- 2) Precio base (sin IVA) con 5 decimales, para que al capturar el precio CON IVA el total
--    recalculado cuadre exacto (Hacienda admite 5 decimales en PrecioUnitario). Solo amplía.
ALTER TABLE servicios MODIFY precio DECIMAL(14,5) NOT NULL;

-- 3) Las líneas de factura guardan ese precio y sus montos sin truncar a 2 decimales.
ALTER TABLE factura_lineas
  MODIFY precio_unitario DECIMAL(14,5) NOT NULL,
  MODIFY monto_iva DECIMAL(14,5) NOT NULL DEFAULT 0,
  MODIFY monto_total DECIMAL(14,5) NOT NULL;
