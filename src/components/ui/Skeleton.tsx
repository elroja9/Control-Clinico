import type { DomProps } from './cx';
import { cx } from './cx';

/** Bloque de carga decorativo; el contenedor que lo usa debe anunciar el estado (role="status"). */
export function Skeleton({ className, ...rest }: DomProps) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-control bg-border/70', className)} {...rest} />;
}
