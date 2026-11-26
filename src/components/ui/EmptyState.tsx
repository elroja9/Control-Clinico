import type { ReactNode } from 'react';
import { cx } from './cx';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cx('flex flex-col items-center text-center px-6 py-12', className)}>
      {icon && (
        <div className="mb-4 w-12 h-12 rounded-card bg-brand-soft text-brand-ink flex items-center justify-center [&_svg]:w-6 [&_svg]:h-6" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {description && <p className="mt-1.5 text-sm text-fg-muted max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
