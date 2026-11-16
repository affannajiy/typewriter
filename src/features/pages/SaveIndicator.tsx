import { Check, CircleAlert, LoaderCircle, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { t } from '@/i18n/en';
import type { SaveStatus } from '@/services/autosave';
import { describeError } from '@/utils/errors';
import { formatTime } from '@/utils/dates';

function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

/**
 * Save status as icon plus words, never colour alone. "Saved" is shown only
 * after the database has confirmed the write. A failure stays visible, keeps
 * the text on screen and offers a retry.
 */
export function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  const online = useOnline();
  const message = status.state === 'failed' ? describeError(status.error) : '';

  let content;
  if (status.state === 'failed') {
    content = (
      <span className="flex flex-wrap items-center gap-2 font-medium text-danger">
        <CircleAlert size={14} aria-hidden />
        {t.save.failed} {message}
        <button type="button" onClick={onRetry} className="min-h-6 rounded px-1 underline underline-offset-2">
          {t.save.retry}
        </button>
      </span>
    );
  } else if (status.state === 'pending' || status.state === 'saving') {
    content = (
      <span className="flex items-center gap-2">
        <LoaderCircle size={14} aria-hidden className="animate-spin-slow" />
        {t.save.saving}
      </span>
    );
  } else {
    content = (
      <span className="flex items-center gap-2">
        <Check size={14} aria-hidden />
        {status.savedAt ? t.save.savedAt(formatTime(status.savedAt)) : t.save.saved}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <div role="status" aria-live="polite">
        {content}
      </div>
      {!online && (
        <span className="flex items-center gap-2">
          <WifiOff size={14} aria-hidden />
          {t.save.offline}
        </span>
      )}
    </div>
  );
}
