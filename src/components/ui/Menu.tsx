import { Ellipsis, type LucideIcon } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { IconButton, cx } from './Button';

export interface MenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

interface MenuProps {
  /** Accessible name of the trigger, for example "Actions for Chemistry". */
  label: string;
  items: MenuItem[];
  icon?: LucideIcon;
  align?: 'start' | 'end';
}

/**
 * A menu button following the ARIA menu pattern: arrow keys, Home and End
 * move between items, Escape closes and returns focus to the trigger.
 */
export function Menu({ label, items, icon = Ellipsis, align = 'end' }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const enabledItems = () => Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
  const focusTrigger = () => triggerRef.current?.querySelector('button')?.focus();

  useEffect(() => {
    if (!open) return;
    enabledItems()[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (!open) return;
    const list = enabledItems();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => {
      event.preventDefault();
      list[(to + list.length) % list.length]?.focus();
    };
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home') move(0);
    else if (event.key === 'End') move(list.length - 1);
    else if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
      focusTrigger();
    } else if (event.key === 'Tab') setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      <div ref={triggerRef}>
        <IconButton icon={icon} label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen((v) => !v)} />
      </div>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className={cx(
            'animate-rise absolute top-full z-30 mt-1 min-w-48 rounded-lg border border-line bg-surface p-1 shadow-soft',
            align === 'end' ? 'end-0' : 'start-0',
          )}
        >
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                focusTrigger();
                item.onSelect();
              }}
              className={cx(
                'flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-start text-sm whitespace-nowrap pointer-coarse:min-h-11',
                'enabled:hover:bg-accent-soft focus-visible:bg-accent-soft disabled:cursor-not-allowed disabled:opacity-50',
                item.danger ? 'text-danger' : 'text-ink',
              )}
            >
              {item.icon && <item.icon size={16} aria-hidden />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
