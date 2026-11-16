import { LoaderCircle, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium select-none ' +
  'min-h-10 pointer-coarse:min-h-11 disabled:opacity-50 disabled:cursor-not-allowed';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent enabled:hover:brightness-110 enabled:active:brightness-95',
  secondary: 'border border-line-strong bg-surface text-ink enabled:hover:bg-accent-soft enabled:active:bg-sunken',
  ghost: 'text-ink enabled:hover:bg-accent-soft enabled:active:bg-sunken',
  danger: 'border border-danger bg-surface text-danger enabled:hover:bg-danger/10 enabled:active:bg-danger/20',
};

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: LucideIcon;
  /** Shows a spinner and blocks clicks while work is in progress. */
  loading?: boolean;
  children: ReactNode;
}

export function Button({ variant = 'secondary', icon: Icon, loading = false, disabled, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(base, 'px-4', variants[variant], className)}
      {...rest}
    >
      {loading ? <LoaderCircle size={16} aria-hidden className="animate-spin-slow" /> : Icon && <Icon size={16} aria-hidden />}
      {children}
    </button>
  );
}

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  /** Accessible name. Also shown as the tooltip. */
  label: string;
  variant?: 'ghost' | 'secondary';
  pressed?: boolean;
  /** Fills the icon, for an "on" state that does not rely on colour alone. */
  filled?: boolean;
}

export function IconButton({ icon: Icon, label, variant = 'ghost', pressed, filled, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cx(base, 'w-10 pointer-coarse:w-11 shrink-0', variants[variant], className)}
      {...rest}
    >
      <Icon size={18} aria-hidden fill={filled ? 'currentColor' : 'none'} />
    </button>
  );
}
