// Utilidades de WhatsApp para las solicitudes de espacio de la reserva en línea.
// Se comparten entre el servidor (normaliza y valida al guardar) y la página pública (arma el enlace).

export const MENSAJE_WHATSAPP_MAX = 500;

export class WhatsappInvalidoError extends Error {
  constructor() {
    super('El número de WhatsApp debe tener entre 8 y 15 dígitos.');
    this.name = 'WhatsappInvalidoError';
  }
}

// Deja solo dígitos; un número local de 8 dígitos recibe el código de país de Costa Rica (506).
// Vacío o nulo => null. Lanza WhatsappInvalidoError si no tiene entre 8 y 15 dígitos.
export function normalizarWhatsapp(valor: unknown): string | null {
  if (valor == null) return null;
  const digitos = String(valor).replace(/\D/g, '');
  if (digitos === '') return null;
  if (digitos.length < 8 || digitos.length > 15) throw new WhatsappInvalidoError();
  return digitos.length === 8 ? `506${digitos}` : digitos;
}

// Mensaje opcional: se recorta a MENSAJE_WHATSAPP_MAX caracteres; vacío => null.
export function normalizarMensajeWhatsapp(valor: unknown): string | null {
  if (valor == null) return null;
  const texto = String(valor).trim().slice(0, MENSAJE_WHATSAPP_MAX);
  return texto === '' ? null : texto;
}

// Enlace https://wa.me/<numero>?text=<mensaje>. Devuelve null si no hay número válido.
export function enlaceWhatsapp(numero: string | null | undefined, mensaje: string): string | null {
  const digitos = (numero ?? '').replace(/\D/g, '');
  if (digitos.length < 8) return null;
  return `https://wa.me/${digitos}?text=${encodeURIComponent(mensaje)}`;
}
