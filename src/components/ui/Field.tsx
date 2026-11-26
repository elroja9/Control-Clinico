import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { cx } from './cx';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  invalid?: boolean;
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Acción pequeña a la derecha de la etiqueta (p. ej. "¿Olvidó su contraseña?"). */
  labelAction?: ReactNode;
  className?: string;
  /** Un control (Input/Select/Textarea) al que se inyectan id y aria-*, o una función que los recibe. */
  children: ReactElement<Partial<FieldControlProps>> | ((props: FieldControlProps) => ReactNode);
}

export function Field({ label, hint, error, required, labelAction, className, children }: FieldProps) {
  const uid = useId();
  const id = `${uid}-control`;
  const hintId = hint ? `${uid}-hint` : undefined;
  const errorId = error ? `${uid}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  const controlProps: FieldControlProps = {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    invalid: error ? true : undefined
  };

  return (
    <div className={cx('min-w-0', className)}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label htmlFor={id} className="block text-xs font-semibold text-fg">
          {label}
          {required && <span className="text-danger" aria-hidden="true"> *</span>}
        </label>
        {labelAction}
      </div>
      {typeof children === 'function' ? children(controlProps) : isValidElement(children) ? cloneElement(children, controlProps) : children}
      {hint && !error && <p id={hintId} className="mt-1.5 text-xs text-fg-muted">{hint}</p>}
      {error && (
        <p id={errorId} className="mt-1.5 text-xs font-medium text-danger flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
