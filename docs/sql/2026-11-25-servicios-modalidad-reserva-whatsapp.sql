-- 2026-11-25: servicios por tipo de visita + reserva automática por tipo de visita / WhatsApp.
-- Aplicar una sola vez (MySQL 8.0 no tiene ADD COLUMN IF NOT EXISTS).
-- Los valores por defecto conservan el comportamiento actual.

-- 1) En qué tipo de visita se ofrece cada servicio: 'CONSULTORIO', 'DOMICILIO' o 'AMBOS'.
ALTER TABLE servicios
  ADD COLUMN modalidad VARCHAR(12) NOT NULL DEFAULT 'AMBOS';

-- 2) Reserva automática en la página pública, por tipo de visita. Si está apagada, la página
--    pública no agenda ese tipo de cita y ofrece un enlace de WhatsApp para solicitar espacio.
ALTER TABLE companias
  ADD COLUMN reservaAutoConsultorio TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN reservaAutoDomicilio TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN whatsappReservas VARCHAR(20) NULL,
  ADD COLUMN mensajeWhatsappReservas VARCHAR(500) NULL;
