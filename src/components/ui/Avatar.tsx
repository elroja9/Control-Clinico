import { cx } from './cx';

export type AvatarSize = 'sm' | 'md' | 'lg';

const sizes: Record<AvatarSize, string> = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base'
};

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export interface AvatarProps {
  name: string;
  size?: AvatarSize;
  className?: string;
}

/** Avatar con iniciales; decorativo (el nombre suele mostrarse al lado). */
export function Avatar({ name, size = 'md', className }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-ink font-semibold ring-1 ring-inset ring-brand/20 select-none', sizes[size], className)}
    >
      {getInitials(name)}
    </span>
  );
}
