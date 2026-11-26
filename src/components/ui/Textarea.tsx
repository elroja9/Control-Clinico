import type { DomProps } from './cx';
import { cx } from './cx';
import { controlBase, controlInvalid } from './Input';

export interface TextareaProps extends DomProps {
  invalid?: boolean;
}

export function Textarea({ invalid, className, rows = 4, ...rest }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      {...rest}
      aria-invalid={invalid || rest['aria-invalid'] || undefined}
      className={cx(controlBase, 'px-3.5 py-2.5 resize-y', invalid && controlInvalid, className)}
    />
  );
}
