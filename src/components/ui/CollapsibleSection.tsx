import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from './Card';
import { cx } from './cx';

/** Duración de la animación de abrir/cerrar (debe coincidir con duration-200). */
const DURACION_MS = 200;

export interface CollapsibleSectionProps {
  /** Base única de los ids del botón del encabezado y del panel (aria-controls / aria-labelledby). */
  id: string;
  title: ReactNode;
  icon?: ReactNode;
  /** Resumen de una línea que se ve también con la sección cerrada. */
  description?: ReactNode;
  /** Etiqueta breve siempre visible junto al título (p. ej. un Badge de estado). No interactiva. */
  badge?: ReactNode;
  /** Acciones del encabezado (botones); solo se muestran con la sección abierta. */
  actions?: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** La sección no se puede cerrar (edición en curso, cambios sin guardar o un error): queda abierta. */
  locked?: boolean;
  /** Se llama cuando se intenta cerrar una sección bloqueada (para avisar, nunca en silencio). */
  onLockedToggle?: () => void;
  className?: string;
  children?: ReactNode;
}

/**
 * Tarjeta plegable (acordeón de selección múltiple: el estado lo controla quien la usa). El
 * encabezado es un <button> real con aria-expanded/aria-controls, así que Enter y Espacio funcionan
 * solos y el anillo de foco es el global de :focus-visible. El panel anima grid-rows 0fr→1fr; con
 * prefers-reduced-motion no hay transición. Cerrada, el contenido queda `inert` (fuera del foco y
 * del árbol de accesibilidad) pero sigue montado, así no se pierde lo digitado.
 */
export function CollapsibleSection({
  id,
  title,
  icon,
  description,
  badge,
  actions,
  open,
  onOpenChange,
  locked = false,
  onLockedToggle,
  className,
  children
}: CollapsibleSectionProps) {
  const abierta = open || locked;
  const idBoton = `${id}-encabezado`;
  const idPanel = `${id}-panel`;

  // Mientras anima, el panel recorta (overflow-hidden); ya abierto pasa a overflow-visible para no
  // cortar menús desplegables ni romper los pies `sticky` de los formularios en el iPhone.
  const [sinRecorte, setSinRecorte] = useState(abierta);
  useEffect(() => {
    if (!abierta) {
      setSinRecorte(false);
      return;
    }
    const t = window.setTimeout(() => setSinRecorte(true), DURACION_MS);
    return () => window.clearTimeout(t);
  }, [abierta]);

  const alternar = () => {
    if (abierta && locked) {
      onLockedToggle?.();
      return;
    }
    onOpenChange(!abierta);
  };

  return (
    <Card className={className}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-6 py-2.5 sm:py-3">
        <h3 className="min-w-0 flex-1 basis-56">
          <button
            type="button"
            id={idBoton}
            aria-expanded={abierta}
            aria-controls={idPanel}
            onClick={alternar}
            className="group w-full min-h-12 flex items-center gap-3 text-left rounded-control"
          >
            {icon && (
              <span
                className="w-9 h-9 shrink-0 rounded-control bg-brand-soft text-brand-ink flex items-center justify-center [&_svg]:w-5 [&_svg]:h-5"
                aria-hidden="true"
              >
                {icon}
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 min-w-0">
                <span className="text-base font-semibold text-fg tracking-tight truncate">{title}</span>
                {badge && <span className="shrink-0 flex">{badge}</span>}
              </span>
              {description && <span className="block text-sm text-fg-muted truncate">{description}</span>}
            </span>
            <ChevronDown
              className={cx(
                'w-5 h-5 shrink-0 text-fg-muted group-hover:text-fg transition-transform duration-200 motion-reduce:transition-none',
                abierta && 'rotate-180'
              )}
              aria-hidden="true"
            />
          </button>
        </h3>
        {abierta && actions && (
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
            {actions}
          </div>
        )}
      </div>

      <div
        className={cx(
          'grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none',
          abierta ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        )}
      >
        <div
          id={idPanel}
          role="region"
          aria-labelledby={idBoton}
          inert={!abierta}
          className={cx('min-h-0', abierta && sinRecorte ? 'overflow-visible' : 'overflow-hidden')}
        >
          <div className="border-t border-border">{children}</div>
        </div>
      </div>
    </Card>
  );
}
