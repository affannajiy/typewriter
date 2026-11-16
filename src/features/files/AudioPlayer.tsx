import { type SyntheticEvent, useRef } from 'react';
import { cx } from '@/components/ui/Button';
import { useAttachmentBytes } from '@/hooks/useData';
import { t } from '@/i18n/en';
import type { Attachment } from '@/types/models';
import { useObjectUrl } from './fileActions';

/**
 * Browsers do not know the length of a WebM recording until they have read
 * it to the end, and show no length. Seeking far ahead makes them read it.
 */
function learnDuration(event: SyntheticEvent<HTMLAudioElement>) {
  const audio = event.currentTarget;
  if (audio.duration !== Infinity) return;
  audio.addEventListener('durationchange', () => (audio.currentTime = 0), { once: true });
  audio.currentTime = Number.MAX_SAFE_INTEGER;
}

/**
 * A sound player for a stored file. The bytes are read from the database once.
 * Kept apart from the editor blocks, so the Files screen does not load the editor.
 */
export function AudioPlayer({ attachment, className }: { attachment: Attachment; className?: string }) {
  const bytes = useAttachmentBytes(attachment.id);
  const player = useRef<HTMLAudioElement>(null);
  useObjectUrl(player, bytes, attachment.mimeType);
  if (bytes === null) return <p className="font-sans text-sm text-muted">{t.files.loadFailed}</p>;
  return (
    // Recordings are the user's own sound; no captions exist for them. Transcription is planned for release 2 (PRD.md).
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <audio ref={player} controls preload="metadata" aria-label={t.files.player(attachment.name)} onLoadedMetadata={learnDuration} className={cx('h-10 w-full', className)} />
  );
}
