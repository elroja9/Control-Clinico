import type { DomProps } from './cx';
import { cx } from './cx';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-muted text-fg-muted ring-border',
  brand: 'bg-brand-soft text-brand-ink ring-brand/20',
  success: 'bg-success-soft text-success ring-success/20',
  warning: 'bg-warning-soft text-warning ring-warning/25',
  danger: 'bg-danger-soft text-danger ring-danger/20',
  info: 'bg-info-soft text-info ring-info/20'
};

export interface BadgeProps extends DomProps {
  tone?: BadgeTone;
}

export function Badge({ tone = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption font-semibold ring-1 ring-inset whitespace-nowrap', tones[tone], className)}
      {...rest}
    />
  );
}
