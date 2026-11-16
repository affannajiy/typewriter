import { X } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useId, useRef } from 'react';
import { t } from '@/i18n/en';
import { Button, IconButton } from './Button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Buttons, right-aligned. */
  footer?: ReactNode;
  /** When set, the dialog body is a form and Enter submits it. */
  onSubmit?: () => void;
}

/**
 * Modal dialog on the native <dialog> element, which provides the focus trap,
 * Escape to close, the inert background and focus return to the opener.
 * Initial focus goes to the element marked `data-autofocus`, if any.
 */
export function Dialog({ open, onClose, title, children, footer, onSubmit }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
    };
  }, [open]);

  if (!open) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit?.();
  };

  const body = (
    <>
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <h2 id={titleId} className="text-xl font-semibold text-ink">
          {title}
        </h2>
        <IconButton icon={X} label={t.common.close} onClick={onClose} className="-mt-2 -mr-2" />
      </div>
      <div className="px-5 py-4 text-sm text-ink">{children}</div>
      {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-sunken/50 px-5 py-3">{footer}</div>}
    </>
  );

  return (
    // The click handler only closes on the backdrop. The keyboard way out is Escape, which <dialog> provides.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === ref.current) onClose();
      }}
      className="animate-rise m-auto w-[min(32rem,calc(100vw-2rem))] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-xl border border-line bg-surface p-0 text-ink shadow-soft backdrop:bg-black/45"
    >
      {onSubmit ? (
        <form onSubmit={submit} noValidate>
          {body}
        </form>
      ) : (
        body
      )}
    </dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** States the consequence and names the exact object. */
  message: ReactNode;
  /** Names the action, for example "Delete permanently". Never "Yes" or "OK". */
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
}

/** Confirmation for an action that cannot be undone. Focus starts on the safe choice. */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel, cancelLabel = t.common.cancel, busy }: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button onClick={onClose} data-autofocus>
            {cancelLabel}
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message}
    </Dialog>
  );
}
