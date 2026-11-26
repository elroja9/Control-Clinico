import type { ReactNode } from 'react';
import type { DomProps } from './cx';
import { cx } from './cx';

export function Card({ className, ...rest }: DomProps) {
  return <div className={cx('bg-surface border border-border rounded-card shadow-xs', className)} {...rest} />;
}

export interface CardHeaderProps extends Omit<DomProps, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}

export function CardHeader({ title, description, actions, className, children, ...rest }: CardHeaderProps) {
  return (
    // flex-wrap: en móvil las acciones bajan bajo el título y ocupan el ancho (antes se quedaban
    // en la misma fila y desbordaban la pantalla del iPhone, p. ej. en Servicios).
    <div className={cx('px-4 sm:px-6 pt-4 sm:pt-5 pb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border', className)} {...rest}>
      <div className="min-w-0 flex-1 basis-56">
        {title && <h3 className="text-base font-semibold text-fg tracking-tight text-balance">{title}</h3>}
        {description && <p className="text-sm text-fg-muted mt-0.5">{description}</p>}
        {children}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto [&>*]:flex-1 sm:[&>*]:flex-none">
          {actions}
        </div>
      )}
    </div>
  );
}

export function CardBody({ className, ...rest }: DomProps) {
  return <div className={cx('p-4 sm:p-6', className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: DomProps) {
  return (
    <div
      className={cx('px-4 sm:px-6 py-4 border-t border-border bg-surface-muted/60 rounded-b-card flex flex-wrap items-center justify-end gap-2 [&>*]:flex-1 sm:[&>*]:flex-none', className)}
      {...rest}
    />
  );
}
