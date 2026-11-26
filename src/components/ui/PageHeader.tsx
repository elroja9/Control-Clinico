import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

export interface Breadcrumb {
  label: string;
  onClick?: () => void;
}

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Breadcrumb[];
}

export function PageHeader({ title, description, actions, breadcrumbs }: PageHeaderProps) {
  return (
    <div className="mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Ruta de navegación" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-xs text-fg-muted">
            {breadcrumbs.map((b, i) => {
              const last = i === breadcrumbs.length - 1;
              return (
                <li key={`${b.label}-${i}`} className="flex items-center gap-1">
                  {b.onClick && !last ? (
                    <button type="button" onClick={b.onClick} className="min-h-8 px-1 rounded-md hover:text-fg hover:underline underline-offset-2">
                      {b.label}
                    </button>
                  ) : (
                    <span aria-current={last ? 'page' : undefined} className={last ? 'font-semibold text-fg' : undefined}>{b.label}</span>
                  )}
                  {!last && <ChevronRight className="w-3.5 h-3.5 text-fg-subtle" aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-title font-semibold tracking-tight text-fg">{title}</h2>
          {description && <p className="mt-1 text-body text-fg-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
