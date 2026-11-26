import type { DomProps } from './cx';
import { ChevronDown } from 'lucide-react';
import { cx } from './cx';
import { controlBase, controlInvalid } from './Input';

export interface SelectProps extends DomProps {
  invalid?: boolean;
  wrapperClassName?: string;
}

export function Select({ invalid, wrapperClassName, className, children, ...rest }: SelectProps) {
  return (
    <div className={cx('relative', wrapperClassName)}>
      <select
        {...rest}
        aria-invalid={invalid || rest['aria-invalid'] || undefined}
        className={cx(controlBase, 'appearance-none pl-3.5 pr-10', invalid && controlInvalid, className)}
      >
        {children}
      </select>
      <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-subtle pointer-events-none" aria-hidden="true" />
    </div>
  );
}
