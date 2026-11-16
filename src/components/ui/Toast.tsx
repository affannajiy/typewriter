import { CircleAlert, CircleCheck, X } from 'lucide-react';
import { type ReactNode, createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { t } from '@/i18n/en';
import { Button, IconButton, cx } from './Button';

export interface ToastInput {
  message: string;
  tone?: 'info' | 'error';
  /** One follow-up action, usually Undo. */
  action?: { label: string; run: () => void };
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

const DISMISS_MS = 6000;
const DISMISS_WITH_ACTION_MS = 10000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((toast) => toast.id !== id)), []);

  const show = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      // Keep at most three on screen: older ones give way.
      setToasts((list) => [...list.slice(-2), { ...input, id }]);
      // Errors stay until dismissed, so they cannot be missed.
      if (input.tone !== 'error') setTimeout(() => dismiss(id), input.action ? DISMISS_WITH_ACTION_MS : DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* A live region: messages are announced without moving focus. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        {toasts.map((toast) => {
          const Icon = toast.tone === 'error' ? CircleAlert : CircleCheck;
          return (
            <div
              key={toast.id}
              className={cx(
                'animate-rise pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-lg border bg-surface py-2 ps-4 pe-2 text-sm text-ink shadow-soft',
                toast.tone === 'error' ? 'border-danger' : 'border-line-strong',
              )}
            >
              <Icon size={18} aria-hidden className={cx('shrink-0', toast.tone === 'error' ? 'text-danger' : 'text-success')} />
              <p className="min-w-0 flex-1 py-1">
                {toast.tone === 'error' && <span className="sr-only">{t.common.errorPrefix} </span>}
                {toast.message}
              </p>
              {toast.action && (
                <Button
                  variant="ghost"
                  className="font-semibold underline underline-offset-2"
                  onClick={() => {
                    dismiss(toast.id);
                    toast.action?.run();
                  }}
                >
                  {toast.action.label}
                </Button>
              )}
              <IconButton icon={X} label={t.common.dismiss} onClick={() => dismiss(toast.id)} />
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): (toast: ToastInput) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside ToastProvider');
  return show;
}
