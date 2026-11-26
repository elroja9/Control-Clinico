import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cx } from './cx';
import { Card } from './Card';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  delta?: { value: string; trend?: 'up' | 'down' | 'neutral'; label?: string };
  className?: string;
}

export function StatCard({ label, value, icon, delta, className }: StatCardProps) {
  const trend = delta?.trend ?? 'neutral';
  return (
    <Card className={cx('p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold text-fg-muted">{label}</p>
        {icon && (
          <span className="w-9 h-9 shrink-0 rounded-control bg-brand-soft text-brand-ink flex items-center justify-center [&_svg]:w-4.5 [&_svg]:h-4.5" aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-title font-semibold tracking-tight text-fg tabular-nums">{value}</p>
      {delta && (
        <p className={cx('mt-1.5 flex items-center gap-1 text-xs font-semibold', trend === 'up' ? 'text-success' : trend === 'down' ? 'text-danger' : 'text-fg-muted')}>
          {trend === 'up' && <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />}
          {trend === 'down' && <ArrowDownRight className="w-3.5 h-3.5" aria-hidden="true" />}
          <span>{delta.value}</span>
          {delta.label && <span className="font-normal text-fg-subtle">{delta.label}</span>}
        </p>
      )}
    </Card>
  );
}
