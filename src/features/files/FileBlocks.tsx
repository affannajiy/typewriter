import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { BookOpen, CircleAlert, Download, FileText, FolderOpen, Mic, Pause, Play, Square } from 'lucide-react';
import { type ChangeEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Button, IconButton, cx } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { MAX_ATTACHMENT_BYTES } from '@/database/repositories/attachments';
import { useAttachment } from '@/hooks/useData';
import { t } from '@/i18n/en';
import { fillFileBlock } from '@/database/repositories/pages';
import { type ActiveRecording, RecorderError, formatDuration, recordingSupported, startRecording } from '@/services/recorder';
import { formatBytes } from '@/services/storage';
import type { Attachment, Id } from '@/types/models';
import { describeError } from '@/utils/errors';
import { AudioPlayer } from './AudioPlayer';
import { NotPdfError, addAudioFile, addPdfFile, downloadAttachment, saveRecording } from './fileActions';
import { type FileNodeOptions, openFileRoute } from './fileNodes';

const idOf = (value: unknown): Id | null => (typeof value === 'string' && value !== '' ? value : null);

function Card({ kind, selected, children }: { kind: 'pdf' | 'audio'; selected: boolean; children: ReactNode }) {
  return (
    <NodeViewWrapper
      data-type={kind}
      className={cx('tn-file my-3 flex flex-col justify-center gap-2 rounded-lg border bg-surface px-3 py-2', selected ? 'border-accent outline-2 outline-offset-2 outline-focus' : 'border-line')}
      // The block is an island in the text: typing and clicks inside it belong to its own controls.
      contentEditable={false}
    >
      {children}
    </NodeViewWrapper>
  );
}

function Heading({ icon: Icon, name, meta }: { icon: typeof FileText; name: string; meta: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      <Icon size={22} aria-hidden className="shrink-0 text-accent" />
      <div className="min-w-0">
        <p className="truncate font-sans font-medium text-ink">{name}</p>
        <p className="font-sans text-xs text-muted">{meta}</p>
      </div>
    </div>
  );
}

function Missing() {
  return (
    <p className="flex items-center gap-2 font-sans text-sm text-muted">
      <CircleAlert size={16} aria-hidden className="shrink-0" />
      {t.files.notFound}
    </p>
  );
}

/** A hidden file input behind a button, so the button can be styled and named like the others. */
function FileButton({ label, icon, accept, busy, onFile }: { label: string; icon: typeof FileText; accept: string; busy: boolean; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const changed = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) onFile(file);
  };
  return (
    <>
      <Button icon={icon} loading={busy} onClick={() => input.current?.click()}>
        {label}
      </Button>
      <input ref={input} type="file" accept={accept} className="sr-only" tabIndex={-1} aria-hidden onChange={changed} />
    </>
  );
}

/** Adds a chosen file and points the block at it. One message for every way it can fail. */
function useAddFile(updateAttributes: (attrs: Record<string, unknown>) => void, add: (file: File) => Promise<Attachment>) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (file: File) => {
    setBusy(true);
    try {
      const attachment = await add(file);
      updateAttributes({ attachmentId: attachment.id });
    } catch (error) {
      toast({ tone: 'error', message: error instanceof NotPdfError ? t.files.notPdf : describeError(error) });
    } finally {
      setBusy(false);
    }
  };
  return { busy, run: (file: File) => void run(file) };
}

/** A PDF in a page: its name and size, and a button that opens the reader. */
export function PdfBlock({ node, editor, extension, selected, updateAttributes }: ReactNodeViewProps) {
  const attachmentId = idOf(node.attrs.attachmentId);
  const attachment = useAttachment(attachmentId);
  const options = extension.options as FileNodeOptions;
  const add = useAddFile(updateAttributes, addPdfFile);

  if (!attachmentId) {
    return (
      <Card kind="pdf" selected={selected}>
        <div className="flex flex-wrap items-center gap-3">
          <FileText size={22} aria-hidden className="shrink-0 text-muted" />
          <p className="min-w-40 flex-1 font-sans text-sm text-muted">{add.busy ? t.files.reading : t.files.pdfEmpty}</p>
          {editor.isEditable && <FileButton label={t.files.choosePdf} icon={FolderOpen} accept="application/pdf,.pdf" busy={add.busy} onFile={add.run} />}
        </div>
      </Card>
    );
  }
  return (
    <Card kind="pdf" selected={selected}>
      {attachment === undefined ? (
        <div aria-hidden className="h-10" />
      ) : attachment === null ? (
        <Missing />
      ) : (
        <div className="flex items-center gap-3">
          <Heading icon={FileText} name={attachment.name} meta={t.files.pdfMeta(attachment.pageCount, formatBytes(attachment.size))} />
          <Button icon={BookOpen} onClick={() => (options.onOpen ?? openFileRoute)(attachment.id)} aria-label={t.files.openNamed(attachment.name)}>
            {t.files.open}
          </Button>
        </div>
      )}
    </Card>
  );
}

const audioMeta = (attachment: Attachment) => t.files.audioMeta(attachment.durationMs === null ? null : formatDuration(attachment.durationMs), formatBytes(attachment.size));

type RecorderState = { phase: 'idle' } | { phase: 'recording'; recording: ActiveRecording } | { phase: 'saving' };

/**
 * Records into this block. A recording still running when the block goes
 * (the page was closed) is stopped, saved, and put into the block in the
 * stored page by `onSavedAfterLeaving`.
 */
function Recorder({ onSaved, onSavedAfterLeaving }: { onSaved: (attachment: Attachment) => void; onSavedAfterLeaving: (attachment: Attachment) => Promise<void> }) {
  const toast = useToast();
  const [state, setState] = useState<RecorderState>({ phase: 'idle' });
  const [, tick] = useState(0);
  const active = useRef<ActiveRecording | null>(null);
  const mounted = useRef(true);

  const finish = async (recording: ActiveRecording, reason: 'stopped' | 'limit' | 'left') => {
    if (active.current !== recording) return;
    active.current = null;
    if (mounted.current) setState({ phase: 'saving' });
    try {
      const attachment = await saveRecording(await recording.stop());
      if (reason === 'left' || !mounted.current) {
        await onSavedAfterLeaving(attachment);
        toast({ message: t.files.savedAfterLeaving });
      } else {
        onSaved(attachment);
        toast({ message: reason === 'limit' ? t.files.limitReached : t.files.savedRecording(formatDuration(attachment.durationMs ?? 0)) });
      }
    } catch (error) {
      toast({ tone: 'error', message: describeError(error) });
    }
    if (mounted.current) setState({ phase: 'idle' });
  };

  const start = async () => {
    try {
      let recording: ActiveRecording | null = null;
      recording = await startRecording((size) => {
        // Stop a little before the limit: the last piece still has to fit.
        if (recording && size > MAX_ATTACHMENT_BYTES * 0.98) void finish(recording, 'limit');
      });
      active.current = recording;
      setState({ phase: 'recording', recording });
    } catch (error) {
      toast({ tone: 'error', message: error instanceof RecorderError ? t.files.recorderErrors[error.reason] : describeError(error) });
    }
  };

  // The timer on screen. A second is fine-grained enough.
  const recording = state.phase === 'recording' ? state.recording : null;
  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [recording]);

  // Leaving the page must not lose sound already recorded. Closing the tab would: ask first.
  useEffect(() => {
    if (!recording) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [recording]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const running = active.current;
      if (running) void finish(running, 'left');
    };
    // `finish` only reads refs and stable setters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.phase === 'saving') return <p className="font-sans text-sm text-muted" role="status">{t.files.saving}</p>;
  if (!recording) {
    return recordingSupported() ? (
      <Button variant="primary" icon={Mic} onClick={() => void start()}>
        {t.files.record}
      </Button>
    ) : null;
  }
  const time = formatDuration(recording.elapsedMs());
  const paused = recording.paused();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex min-w-36 items-center gap-2 font-sans text-sm text-ink" role="status">
        <span aria-hidden className={cx('size-2.5 rounded-full', paused ? 'bg-muted' : 'bg-danger motion-safe:animate-pulse')} />
        {paused ? t.files.pausedStatus(time) : t.files.recordingStatus(time)}
      </span>
      <Button
        icon={paused ? Play : Pause}
        onClick={() => {
          if (paused) recording.resume();
          else recording.pause();
          tick((n) => n + 1);
        }}
      >
        {paused ? t.files.resume : t.files.pause}
      </Button>
      <Button variant="primary" icon={Square} onClick={() => void finish(recording, 'stopped')}>
        {t.files.stop}
      </Button>
    </div>
  );
}

/** A recording in a page: a player, or, while the block is new, a recorder and a file button. */
export function AudioBlock({ node, editor, extension, selected, updateAttributes }: ReactNodeViewProps) {
  const attachmentId = idOf(node.attrs.attachmentId);
  const attachment = useAttachment(attachmentId);
  const add = useAddFile(updateAttributes, addAudioFile);
  const toast = useToast();

  if (!attachmentId) {
    return (
      <Card kind="audio" selected={selected}>
        <div className="flex items-center gap-3">
          <Mic size={22} aria-hidden className="shrink-0 text-muted" />
          <p className="flex-1 font-sans text-sm text-muted">{add.busy ? t.files.reading : recordingSupported() ? t.files.audioEmpty : t.files.recorderErrors.unsupported}</p>
        </div>
        {editor.isEditable && (
          <div className="flex flex-wrap items-center gap-2">
            <Recorder
              onSaved={(saved) => updateAttributes({ attachmentId: saved.id })}
              onSavedAfterLeaving={async (saved) => {
                const { pageId } = extension.options as FileNodeOptions;
                if (pageId) await fillFileBlock(pageId, idOf(node.attrs.id), 'audio', saved.id);
              }}
            />
            <FileButton label={t.files.chooseAudio} icon={FolderOpen} accept="audio/*" busy={add.busy} onFile={add.run} />
          </div>
        )}
      </Card>
    );
  }
  return (
    <Card kind="audio" selected={selected}>
      {attachment === undefined ? (
        <div aria-hidden className="h-20" />
      ) : attachment === null ? (
        <Missing />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <Heading icon={Mic} name={attachment.name} meta={audioMeta(attachment)} />
            <IconButton
              icon={Download}
              label={t.files.downloadNamed(attachment.name)}
              onClick={() =>
                void downloadAttachment(attachment).then(
                  () => toast({ message: t.files.downloaded(attachment.name) }),
                  (error: unknown) => toast({ tone: 'error', message: describeError(error) }),
                )
              }
            />
          </div>
          <AudioPlayer attachment={attachment} />
        </>
      )}
    </Card>
  );
}
