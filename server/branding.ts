/**
 * Utilidades para aplicar la identidad visual de cada empresa (colores y logo) en los documentos
 * y correos que recibe el paciente.
 *
 * El motivo de existir: los colores los elige cada clínica desde Configuración de Empresa, así
 * que no se puede asumir nada sobre ellos. Poner texto blanco fijo sobre el color de marca
 * funciona con un azul oscuro y deja el texto ilegible con un ámbar claro — y ambos casos existen
 * hoy en la base (#1e33d2 y #eca655). Estas funciones eligen el color de texto según el fondo.
 */

const NEGRO_TEXTO = "#1e293b";
const BLANCO_TEXTO = "#ffffff";

function aRgb(hex: string): { r: number; g: number; b: number } | null {
  const limpio = String(hex || "").trim().replace(/^#/, "");
  const completo = limpio.length === 3
    ? limpio.split("").map(c => c + c).join("")
    : limpio;
  if (!/^[0-9a-fA-F]{6}$/.test(completo)) return null;
  return {
    r: parseInt(completo.slice(0, 2), 16),
    g: parseInt(completo.slice(2, 4), 16),
    b: parseInt(completo.slice(4, 6), 16)
  };
}

/** Luminancia relativa según WCAG, para decidir si el texto encima va claro u oscuro. */
function luminancia(hex: string): number | null {
  const rgb = aRgb(hex);
  if (!rgb) return null;
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(rgb.r) + 0.7152 * canal(rgb.g) + 0.0722 * canal(rgb.b);
}

/** Razón de contraste WCAG entre dos luminancias (1:1 = idénticas, 21:1 = negro sobre blanco). */
function razonContraste(l1: number, l2: number): number {
  const claro = Math.max(l1, l2);
  const oscuro = Math.min(l1, l2);
  return (claro + 0.05) / (oscuro + 0.05);
}

/**
 * Color de texto legible sobre `hexFondo`.
 *
 * Compara la razón de contraste real contra blanco y contra oscuro y devuelve la mejor, en vez de
 * usar un umbral de luminancia. La diferencia importa con los naranjas y ámbares de marca: sobre
 * el #ff8648 que usa una de las clínicas, el blanco da 2.4:1 (ilegible) y el oscuro 5.9:1, pero un
 * umbral simple se inclinaba por el blanco.
 *
 * Ante un color inválido devuelve texto oscuro, que es lo seguro sobre el blanco por defecto.
 */
export function textoSobre(hexFondo: string): string {
  const l = luminancia(hexFondo);
  if (l == null) return NEGRO_TEXTO;
  const contrasteBlanco = razonContraste(l, luminancia(BLANCO_TEXTO)!);
  const contrasteNegro = razonContraste(l, luminancia(NEGRO_TEXTO)!);
  return contrasteNegro >= contrasteBlanco ? NEGRO_TEXTO : BLANCO_TEXTO;
}

/** Versión translúcida del color, para fondos suaves (encabezados de tabla, tarjetas). */
export function tinte(hex: string, alpha: number): string {
  const rgb = aRgb(hex);
  if (!rgb) return "rgba(148,163,184,0.12)";
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/** Color de marca validado, con respaldo si la empresa no lo tiene configurado. */
export function colorMarca(hex: string | null | undefined, respaldo: string): string {
  return aRgb(hex || "") ? String(hex) : respaldo;
}
