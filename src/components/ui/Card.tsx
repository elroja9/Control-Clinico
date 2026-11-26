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
    <div className={cx('px-5 sm:px-6 pt-5 pb-4 flex items-start justify-between gap-3 border-b border-border', className)} {...rest}>
      <div className="min-w-0">
        {title && <h3 className="text-base font-semibold text-fg tracking-tight">{title}</h3>}
        {description && <p className="text-sm text-fg-muted mt-0.5">{description}</p>}
        {children}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: DomProps) {
  return <div className={cx('p-5 sm:p-6', className)} {...rest} />;
}

export function CardFooter({ className, ...rest }: DomProps) {
  return (
    <div
      className={cx('px-5 sm:px-6 py-4 border-t border-border bg-surface-muted/60 rounded-b-card flex items-center justify-end gap-2', className)}
      {...rest}
    />
  );
}
