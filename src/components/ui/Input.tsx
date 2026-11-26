import type { ReactNode } from 'react';
import type { DomProps } from './cx';
import { cx } from './cx';

export const controlBase =
  'w-full min-h-11 bg-surface border border-border-strong rounded-control text-body text-fg placeholder:text-fg-subtle hover:border-fg-subtle focus:border-brand transition-colors disabled:bg-surface-muted disabled:text-fg-subtle';

export const controlInvalid = 'border-danger hover:border-danger focus:border-danger';

export interface InputProps extends DomProps {
  invalid?: boolean;
  /** Icono decorativo a la izquierda. */
  leadingIcon?: ReactNode;
  /** Contenido a la derecha (p. ej. botón mostrar/ocultar). Debe medir ~44px de ancho. */
  trailing?: ReactNode;
  wrapperClassName?: string;
}

export function Input({ invalid, leadingIcon, trailing, wrapperClassName, className, ...rest }: InputProps) {
  return (
    <div className={cx('relative', wrapperClassName)}>
      {leadingIcon && (
        <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-fg-subtle [&_svg]:w-4 [&_svg]:h-4" aria-hidden="true">
          {leadingIcon}
        </span>
      )}
      <input
        {...rest}
        aria-invalid={invalid || rest['aria-invalid'] || undefined}
        className={cx(controlBase, invalid && controlInvalid, leadingIcon ? 'pl-10' : 'pl-3.5', trailing ? 'pr-12' : 'pr-3.5', className)}
      />
      {trailing && <span className="absolute inset-y-0 right-0 flex items-center">{trailing}</span>}
    </div>
  );
}
