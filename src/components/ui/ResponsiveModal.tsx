import { useId } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import { cx } from './cx';
import { IconButton } from './IconButton';

export type ResponsiveModalSize = 'sm' | 'md' | 'lg' | 'xl';

export interface ResponsiveModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  /** Acciones fijas abajo (guardar/cancelar). En móvil quedan sobre la zona segura del iPhone. */
  footer?: ReactNode;
  size?: ResponsiveModalSize;
  /** Icono decorativo junto al título. */
  icon?: ReactNode;
  /** Colores del recuadro del icono (por defecto, los de la marca). */
  iconClassName?: string;
  /** Franja de color de la marca sobre el encabezado. */
  accentColor?: string;
  /** Deshabilita el botón cerrar (p. ej. mientras se envía a Hacienda). Escape lo controla `onClose`. */
  closeDisabled?: boolean;
  /** Clases del cuerpo con scroll (por defecto, relleno estándar). */
  bodyClassName?: string;
}

const SIZES: Record<ResponsiveModalSize, string> = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl'
};

/**
 * Modal adaptable. En móvil (por debajo de `sm`) ocupa toda la pantalla: encabezado fijo con
 * el título y el botón cerrar de 44px (respeta el notch con pt-safe), cuerpo con scroll propio
 * y pie fijo sobre la barra de inicio (pb-safe). Desde `sm` es un panel centrado.
 * Escape cierra, el foco queda atrapado y el scroll del fondo se bloquea (useDialog).
 */
export function ResponsiveModal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  icon,
  iconClassName,
  accentColor,
  closeDisabled = false,
  bodyClassName
}: ResponsiveModalProps) {
  const titleId = useId();
  const ref = useDialog<HTMLDivElement>(open, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center sm:p-4 bg-fg/50 backdrop-blur-xs animate-fade-in font-sans">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'flex flex-col w-full h-dvh sm:h-auto sm:max-h-[85dvh] bg-surface sm:rounded-panel sm:border sm:border-border shadow-lg overflow-hidden animate-dialog-in focus:outline-hidden',
          SIZES[size]
        )}
      >
        <header className="shrink-0 pt-safe sm:pt-0 bg-surface border-b border-border">
          {accentColor && <div className="h-1" style={{ backgroundColor: accentColor }} aria-hidden="true" />}
          <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2 sm:py-3.5 min-h-14">
            <div className="flex items-center gap-3 min-w-0">
              {icon && (
                <span
                  className={cx(
                    'w-9 h-9 shrink-0 rounded-control flex items-center justify-center [&_svg]:w-4.5 [&_svg]:h-4.5',
                    iconClassName ?? 'bg-brand-soft text-brand-ink'
                  )}
                  aria-hidden="true"
                >
                  {icon}
                </span>
              )}
              <h2 id={titleId} className="text-heading font-semibold text-fg leading-tight line-clamp-2 break-words">
                {title}
              </h2>
            </div>
            <IconButton
              label="Cerrar"
              icon={<X className="w-5 h-5" aria-hidden="true" />}
              onClick={onClose}
              disabled={closeDisabled}
              className="-mr-2 sm:mr-0"
            />
          </div>
        </header>

        <div className={cx('flex-1 min-h-0 overflow-y-auto overscroll-contain', bodyClassName ?? 'p-4 sm:p-5')}>
          {children}
        </div>

        {footer ? (
          <div className="shrink-0 bg-surface border-t border-border pb-safe sm:pb-0">
            <div className="px-4 sm:px-5 py-3 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              {footer}
            </div>
          </div>
        ) : (
          // Sin pie: el contenido no termina bajo el indicador de inicio del iPhone
          <div className="shrink-0 pb-safe sm:hidden" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
