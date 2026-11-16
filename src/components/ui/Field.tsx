import { Search } from 'lucide-react';
import { type InputHTMLAttributes, type TextareaHTMLAttributes, useId } from 'react';
import { cx } from './Button';

const control =
  'w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-muted/70 ' +
  'hover:border-ink/60 disabled:opacity-50 disabled:cursor-not-allowed aria-invalid:border-danger';

interface FieldShellProps {
  label: string;
  hint?: string;
  /** Error text shown under the field. Paired with an icon-free but worded message, not colour alone. */
  error?: string | null;
}

interface TextFieldProps extends FieldShellProps, InputHTMLAttributes<HTMLInputElement> {}

/** A labelled text input. The label is always visible: a placeholder is not a label. */
export function TextField({ label, hint, error, className, id, ...rest }: TextFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  const describedBy = [hint && `${fieldId}-hint`, error && `${fieldId}-error`].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={fieldId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <input id={fieldId} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={cx(control, 'min-h-10 pointer-coarse:min-h-11')} {...rest} />
      {hint && (
        <p id={`${fieldId}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${fieldId}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

interface TextAreaFieldProps extends FieldShellProps, TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function TextAreaField({ label, hint, error, className, id, ...rest }: TextAreaFieldProps) {
  const autoId = useId();
  const fieldId = id ?? autoId;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={fieldId} className="text-sm font-medium text-ink">
        {label}
      </label>
      <textarea id={fieldId} aria-describedby={hint ? `${fieldId}-hint` : undefined} className={cx(control, 'py-2')} {...rest} />
      {hint && (
        <p id={`${fieldId}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
}

/** A search input with a visually hidden label and a leading icon. */
export function SearchField({ label, className, ...rest }: SearchFieldProps) {
  return (
    <label className={cx('relative block', className)}>
      <span className="sr-only">{label}</span>
      <Search size={16} aria-hidden className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted" />
      <input type="search" className={cx(control, 'min-h-10 pl-9 pointer-coarse:min-h-11')} {...rest} />
    </label>
  );
}
