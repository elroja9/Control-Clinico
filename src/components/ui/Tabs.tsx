import type { KeyboardEvent, ReactNode } from 'react';
import { cx } from './cx';

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  icon?: ReactNode;
  count?: number;
}

export interface TabsProps<T extends string = string> {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  'aria-label': string;
  className?: string;
}

/** Pestañas simples con navegación por flechas, Inicio y Fin. El panel lo renderiza quien la usa. */
export function Tabs<T extends string = string>({ items, value, onChange, className, ...rest }: TabsProps<T>) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = items.findIndex(i => i.id === value);
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % items.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + items.length) % items.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(items[next].id);
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div role="tablist" aria-label={rest['aria-label']} onKeyDown={onKeyDown} className={cx('flex gap-1 border-b border-border overflow-x-auto scrollbar-thin', className)}>
      {items.map(item => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cx(
              'relative min-h-11 px-3.5 inline-flex items-center gap-2 text-sm font-semibold whitespace-nowrap transition-colors',
              active ? 'text-brand-ink' : 'text-fg-muted hover:text-fg'
            )}
          >
            {item.icon}
            {item.label}
            {item.count !== undefined && (
              <span className="text-caption px-1.5 rounded-full bg-surface-muted text-fg-muted tabular-nums">{item.count}</span>
            )}
            <span aria-hidden="true" className={cx('absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand transition-opacity', active ? 'opacity-100' : 'opacity-0')} />
          </button>
        );
      })}
    </div>
  );
}
