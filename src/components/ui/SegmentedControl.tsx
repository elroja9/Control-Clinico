import type { ReactNode } from 'react';
import { cx } from './cx';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string = string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Nombre accesible del grupo (o usar ariaLabelledBy). */
  ariaLabel?: string;
  ariaLabelledBy?: string;
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Grupo de opciones excluyentes en una sola fila (radiogroup). Sustituye a los botones
 * gigantes apilados: con 2-3 opciones cabe en 360px; el texto puede bajar de línea.
 * Teclado: flechas izquierda/derecha (o arriba/abajo) mueven y seleccionan.
 */
export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  ariaLabel,
  ariaLabelledBy,
  size = 'md',
  className
}: SegmentedControlProps<T>) {
  const habilitadas = options.filter(o => !o.disabled);

  const mover = (e: any, actual: T) => {
    const teclas: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    const paso = teclas[e.key];
    if (!paso || habilitadas.length === 0) return;
    e.preventDefault();
    const i = habilitadas.findIndex(o => o.value === actual);
    const siguiente = habilitadas[(i + paso + habilitadas.length) % habilitadas.length];
    onChange(siguiente.value);
    const grupo = (e.currentTarget as HTMLElement).parentElement;
    const btn = grupo?.querySelector(`[data-value="${CSS.escape(siguiente.value)}"]`) as HTMLElement | null;
    btn?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      className={cx('flex w-full gap-1 p-1 rounded-control bg-surface-muted border border-border', className)}
    >
      {options.map(o => {
        const activo = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={activo}
            data-value={o.value}
            disabled={o.disabled}
            tabIndex={activo ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e: any) => mover(e, o.value)}
            className={cx(
              'flex-1 min-w-0 inline-flex items-center justify-center gap-1.5 rounded-[calc(var(--radius-control)-2px)] px-2 text-center font-semibold leading-tight transition-colors',
              size === 'sm' ? 'min-h-10 text-xs' : 'min-h-11 text-sm',
              activo
                ? 'bg-surface text-brand-ink shadow-xs ring-1 ring-border'
                : 'text-fg-muted hover:text-fg hover:bg-surface/60',
              'disabled:opacity-50'
            )}
          >
            {o.icon && <span className="shrink-0 [&_svg]:w-4 [&_svg]:h-4" aria-hidden="true">{o.icon}</span>}
            <span className="min-w-0 break-words">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
