import { ArrowLeft, FileQuestion } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { Button, IconButton } from '@/components/ui/Button';
import { EmptyState, LoadingBlock } from '@/components/ui/Layout';
import { useAttachment } from '@/hooks/useData';
import { t } from '@/i18n/en';
import { formatDuration } from '@/services/recorder';
import { formatBytes } from '@/services/storage';
import { AudioPlayer } from './AudioPlayer';
import { PdfReader } from './PdfReader';

/** One file, full screen: the PDF reader, or a player for a recording. Loaded on demand, with PDF.js. */
export default function FileScreen() {
  const { fileId = '' } = useParams();
  const attachment = useAttachment(fileId);
  const navigate = useNavigate();

  if (attachment === undefined) return <LoadingBlock />;
  if (attachment === null) {
    return <EmptyState icon={FileQuestion} title={t.files.title} body={t.files.notFound} action={<Button onClick={() => navigate('/files')}>{t.nav.files}</Button>} />;
  }
  if (attachment.kind === 'pdf') return <PdfReader key={attachment.id} attachment={attachment} />;
  return (
    <div className="grid max-w-2xl gap-4">
      <div className="flex items-center gap-2">
        <IconButton icon={ArrowLeft} label={t.reader.back} onClick={() => navigate(-1)} />
        <h1 className="min-w-0 flex-1 truncate font-display text-2xl text-ink">{attachment.name}</h1>
      </div>
      <p className="text-sm text-muted">{t.files.audioMeta(attachment.durationMs === null ? null : formatDuration(attachment.durationMs), formatBytes(attachment.size))}</p>
      <AudioPlayer attachment={attachment} />
    </div>
  );
}
