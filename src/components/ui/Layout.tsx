import { ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { t } from '@/i18n/en';
import { cx } from './Button';

/** The title row at the top of every screen. */
export function PageHeader({ title, description, actions, children }: { title: string; description?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4">
      {children}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-semibold tracking-tight break-words text-ink">{title}</h1>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-xl border border-line bg-surface', className)}>{children}</div>;
}

/** What goes here, and the one action that creates the first item. */
export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
      <Icon size={28} aria-hidden className="mb-3 text-muted" />
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-prose text-sm text-muted">{body}</p>
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export interface Crumb {
  label: string;
  to?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label={t.nav.breadcrumbs}>
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted">
        {items.map((item, index) => (
          <li key={index} className="flex min-w-0 items-center gap-1">
            {index > 0 && <ChevronRight size={14} aria-hidden className="shrink-0 rtl:rotate-180" />}
            {item.to ? (
              <Link to={item.to} className="truncate rounded px-1 py-1 underline-offset-2 hover:text-ink hover:underline">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate px-1 font-medium text-ink">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

/** A small set of mutually exclusive choices, built on native radio buttons. */
export function Segmented<T extends string>({ legend, name, value, options, onChange, iconsOnly = false }: {
  legend: string;
  name: string;
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  iconsOnly?: boolean;
}) {
  return (
    <fieldset className="inline-flex rounded-md border border-line-strong bg-surface p-0.5">
      <legend className="sr-only">{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          data-clickable
          title={iconsOnly ? option.label : undefined}
          className="flex min-h-9 items-center gap-2 rounded px-3 text-sm text-ink has-checked:bg-accent has-checked:text-on-accent has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus pointer-coarse:min-h-10"
        >
          <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="sr-only" />
          {option.icon && <option.icon size={16} aria-hidden />}
          <span className={iconsOnly ? 'sr-only' : undefined}>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}

/** Loading placeholder for a screen. Reserves space so content does not jump. */
export function LoadingBlock() {
  return (
    <p role="status" className="py-10 text-center text-sm text-muted">
      {t.common.loading}
    </p>
  );
}
