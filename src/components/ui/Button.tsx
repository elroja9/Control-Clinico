import type { ReactNode } from 'react';
import type { DomProps } from './cx';
import { Loader2 } from 'lucide-react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends DomProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}

export const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-solid text-brand-fg shadow-xs hover:brightness-110 active:brightness-95',
  secondary: 'bg-surface-muted text-fg hover:bg-border',
  ghost: 'text-fg-muted hover:bg-surface-muted hover:text-fg',
  danger: 'bg-danger text-white shadow-xs hover:brightness-110 active:brightness-95',
  outline: 'border border-border-strong bg-surface text-fg shadow-xs hover:bg-surface-muted'
};

// Alturas mínimas >= 40px para áreas táctiles cómodas
export const buttonSizes: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-3.5 text-sm gap-1.5',
  md: 'min-h-11 px-4 text-sm gap-2',
  lg: 'min-h-12 px-5 text-base gap-2'
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  disabled,
  type = 'button',
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center rounded-control font-semibold whitespace-nowrap transition-[background-color,filter,box-shadow] duration-150 disabled:opacity-60 disabled:shadow-none',
        buttonVariants[variant],
        buttonSizes[size],
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : icon}
      {children}
    </button>
  );
}
