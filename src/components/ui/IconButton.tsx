import type { ReactNode } from 'react';
import type { DomProps } from './cx';
import { cx } from './cx';
import { buttonVariants, type ButtonVariant } from './Button';

export interface IconButtonProps extends Omit<DomProps, 'aria-label'> {
  /** Texto accesible obligatorio (el botón no tiene texto visible). */
  label: string;
  icon: ReactNode;
  variant?: Exclude<ButtonVariant, 'primary'> | 'primary';
}

export function IconButton({ label, icon, variant = 'ghost', type = 'button', className, ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={rest.title ?? label}
      className={cx(
        'inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-control transition-colors duration-150 disabled:opacity-60',
        buttonVariants[variant],
        className
      )}
      {...rest}
    >
      {icon}
    </button>
  );
}
