import { useEffect, useState } from 'react';
import { fechaCR } from './fechaCR';
import { errorIdentificacion } from './identificacion';
import type { Factura } from '../data/mockData';

// Abonos de CxC/CxP: códigos internos (no van a Hacienda) que ya están guardados con este significado.
export const MEDIO_PAGO_ABONO: Record<string, string> = {
  '01': 'Efectivo',
  '02': 'Tarjeta',
  '03': 'Transferencia / SINPE',
  '04': 'Cheque'
};

// --- Catálogos de Hacienda (vienen de la BD: GET /api/hacienda/catalogos) ---

export interface EntradaCatalogoHacienda { codigo: string; descripcion: string }

export interface CatalogosHacienda {
  condicionesVenta: EntradaCatalogoHacienda[];
  mediosPago: EntradaCatalogoHacienda[];
  codigosDescuento: EntradaCatalogoHacienda[];
  codigoDescuentoDefecto: string;
  toleranciaMedioPago: number;
  mediosPagoMax: number;
  condicionesExigenReceptor: string[];
}

let catalogosEnCurso: Promise<CatalogosHacienda> | null = null;

/** Carga (una vez por sesión de página) los catálogos de Hacienda guardados en la BD. */
export function cargarCatalogosHacienda(): Promise<CatalogosHacienda> {
  if (!catalogosEnCurso) {
    catalogosEnCurso = fetch('/api/hacienda/catalogos')
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'No se pudieron cargar los catálogos de Hacienda.');
        return data as CatalogosHacienda;
      })
      .catch(err => {
        catalogosEnCurso = null; // se reintenta la próxima vez
        throw err;
      });
  }
  return catalogosEnCurso;
}

/** Catálogos de Hacienda para los selectores; null mientras cargan. */
export function useCatalogosHacienda(): { catalogos: CatalogosHacienda | null; error: string | null } {
  const [catalogos, setCatalogos] = useState<CatalogosHacienda | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let vigente = true;
    cargarCatalogosHacienda()
      .then(c => { if (vigente) setCatalogos(c); })
      .catch(err => { if (vigente) setError(err.message); });
    return () => { vigente = false; };
  }, []);
  return { catalogos, error };
}

/** Descripción de un medio de pago según el catálogo (o el código si todavía no cargó). */
export function nombreMedioPago(catalogos: CatalogosHacienda | null, codigo: string): string {
  return catalogos?.mediosPago.find(m => m.codigo === codigo)?.descripcion ?? codigo;
}

/** "Efectivo" o "Efectivo ₡5 000,00 · Tarjeta ₡3 000,00" para un comprobante. */
export function textoMediosPago(f: Pick<Factura, 'mediosPago' | 'medioPago'>, catalogos: CatalogosHacienda | null): string {
  const medios = f.mediosPago && f.mediosPago.length > 0 ? f.mediosPago : [{ tipo: f.medioPago, monto: 0 }];
  if (medios.length === 1) return nombreMedioPago(catalogos, medios[0].tipo);
  return medios.map(m => `${nombreMedioPago(catalogos, m.tipo)} ${colones(Number(m.monto))}`).join(' · ');
}

/** Nombre del comprobante según su tipo de documento. */
export function nombreComprobante(tipoDocumento: string): string {
  return tipoDocumento === '03' ? 'Nota de Crédito' : tipoDocumento === '02' ? 'Nota de Débito' : tipoDocumento === '04' ? 'Tiquete' : 'Factura';
}

/**
 * Espejo (solo para avisar en pantalla) de la regla del servidor: Factura con identificación
 * costarricense válida; si no, Tiquete. El servidor decide siempre.
 */
export function identificacionValidaParaFactura(tipo: string | null | undefined, numero: string | null | undefined): boolean {
  if (!tipo || !['01', '02', '03', '04'].includes(tipo) || !numero) return false;
  return errorIdentificacion(tipo, numero) === null;
}

export function colones(n: number): string {
  return `₡${n.toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "2026-10-05" → "05/10/2026" */
export function fechaCorta(ymd: string): string {
  const [a, m, d] = ymd.slice(0, 10).split('-');
  return d && m && a ? `${d}/${m}/${a}` : ymd;
}

/** Texto de plazo de una cuenta pendiente: "vence hoy", "vence en 3 días", "vencida hace 5 días". */
export function plazoVencimiento(fechaVencimiento: string): { texto: string; vencida: boolean } {
  const dias = Math.round((Date.parse(`${fechaVencimiento}T00:00:00Z`) - Date.parse(`${fechaCR()}T00:00:00Z`)) / 86_400_000);
  if (dias === 0) return { texto: 'vence hoy', vencida: false };
  if (dias > 0) return { texto: `vence en ${dias} día${dias === 1 ? '' : 's'}`, vencida: false };
  return { texto: `vencida hace ${-dias} día${dias === -1 ? '' : 's'}`, vencida: true };
}
