import { BookOpen, Download, FileText, Mic, Paperclip, Pencil, Play, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { TextField } from '@/components/ui/Field';
import { EmptyState, LoadingBlock, PageHeader, Segmented } from '@/components/ui/Layout';
import { Menu } from '@/components/ui/Menu';
import { useToast } from '@/components/ui/Toast';
import { type FileUse, deleteAttachment, renameAttachment } from '@/database/repositories/attachments';
import { pagePath } from '@/features/organisation/items';
import { useGuarded } from '@/features/organisation/useItemActions';
import { useAttachments, useFileUses } from '@/hooks/useData';
import { t } from '@/i18n/en';
import { formatDuration } from '@/services/recorder';
import { formatBytes } from '@/services/storage';
import type { Attachment } from '@/types/models';
import { formatRelative } from '@/utils/dates';
import { AudioPlayer } from './AudioPlayer';
import { downloadAttachment } from './fileActions';

type Filter = 'all' | 'pdf' | 'audio';

const metaOf = (file: Attachment) =>
  file.kind === 'pdf'
    ? t.files.pdfMeta(file.pageCount, formatBytes(file.size))
    : t.files.audioMeta(file.durationMs === null ? null : formatDuration(file.durationMs), formatBytes(file.size));

function Uses({ use }: { use: FileUse | undefined }) {
  if (use && use.live.length > 0) {
    return (
      <p className="text-xs text-muted">
        {t.files.usedIn}{' '}
        {use.live.map((page, index) => (
          <span key={page.id}>
            {index > 0 && ', '}
            <Link to={pagePath(page.id)} className="text-ink underline underline-offset-2">
              {page.title}
            </Link>
          </span>
        ))}
      </p>
    );
  }
  if (use && use.trashed.length > 0) return <p className="text-xs text-muted">{t.files.onlyInTrash}</p>;
  return (
    <p className="text-xs text-muted">
      <strong className="font-semibold text-ink">{t.files.unused}.</strong> {t.files.unusedHint}
    </p>
  );
}

/** Every PDF and recording in the workspace: where each is used, and play, open, rename, download, delete. */
export function FilesScreen() {
  const files = useAttachments();
  const uses = useFileUses();
  const guarded = useGuarded();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const [playing, setPlaying] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<Attachment | null>(null);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<Attachment | null>(null);

  if (!files || !uses) return <LoadingBlock />;
  const shown = files.filter((file) => filter === 'all' || file.kind === filter);
  const total = files.reduce((sum, file) => sum + file.size, 0);

  const download = (file: Attachment) =>
    void guarded(async () => {
      await downloadAttachment(file);
      toast({ message: t.files.downloaded(file.name) });
    });

  return (
    <>
      <PageHeader title={t.files.title} description={t.files.description} />
      {files.length === 0 ? (
        <EmptyState icon={Paperclip} title={t.files.emptyTitle} body={t.files.emptyBody} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Segmented
              legend={t.files.filterLegend}
              name="file-filter"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: t.files.filters.all },
                { value: 'pdf', label: t.files.filters.pdf, icon: FileText },
                { value: 'audio', label: t.files.filters.audio, icon: Mic },
              ]}
            />
            <p className="text-sm text-muted">{t.files.total(files.length, formatBytes(total))}</p>
          </div>
          {shown.length === 0 ? (
            <p className="text-sm text-muted">{t.files.emptyFiltered}</p>
          ) : (
            <ul className="grid gap-2">
              {shown.map((file) => {
                const use = uses.get(file.id);
                const unused = !use || (use.live.length === 0 && use.trashed.length === 0);
                const Icon = file.kind === 'pdf' ? FileText : Mic;
                return (
                  <li key={file.id} className="grid gap-2 rounded-lg border border-line bg-surface px-3 py-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <Icon size={20} aria-hidden className="shrink-0 text-muted" />
                      <div className="min-w-40 flex-1">
                        {file.kind === 'pdf' ? (
                          <Link to={`/file/${file.id}`} className="block truncate font-medium text-ink hover:underline">
                            {file.name}
                          </Link>
                        ) : (
                          <p className="truncate font-medium text-ink">{file.name}</p>
                        )}
                        <p className="text-xs text-muted">
                          {metaOf(file)} · {formatRelative(file.createdAt)}
                        </p>
                        <Uses use={use} />
                      </div>
                      <div className="flex items-center gap-1">
                        {file.kind === 'pdf' ? (
                          <Link to={`/file/${file.id}`} aria-label={t.files.openNamed(file.name)} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-line-strong px-3 text-sm text-ink hover:bg-accent-soft">
                            <BookOpen size={16} aria-hidden />
                            {t.files.open}
                          </Link>
                        ) : (
                          <Button icon={playing === file.id ? X : Play} aria-expanded={playing === file.id} aria-label={t.files.playNamed(file.name)} onClick={() => setPlaying((id) => (id === file.id ? null : file.id))}>
                            {t.files.play}
                          </Button>
                        )}
                        <Menu
                          label={t.files.actionsFor(file.name)}
                          items={[
                            {
                              id: 'rename',
                              label: t.files.rename,
                              icon: Pencil,
                              onSelect: () => {
                                setName(file.name);
                                setRenaming(file);
                              },
                            },
                            { id: 'download', label: t.files.download, icon: Download, onSelect: () => download(file) },
                            { id: 'delete', label: t.files.deleteForever, icon: Trash2, danger: true, disabled: !unused, onSelect: () => setDeleting(file) },
                          ]}
                        />
                      </div>
                    </div>
                    {playing === file.id && <AudioPlayer attachment={file} />}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <Dialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title={t.files.renameTitle}
        onSubmit={() => {
          const file = renaming;
          setRenaming(null);
          if (file) void guarded(() => renameAttachment(file.id, name));
        }}
        footer={
          <>
            <Button onClick={() => setRenaming(null)}>{t.common.cancel}</Button>
            <Button variant="primary" type="submit">
              {t.files.rename}
            </Button>
          </>
        }
      >
        <TextField label={t.files.nameLabel} value={name} onChange={(event) => setName(event.target.value)} maxLength={200} data-autofocus />
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t.files.deleteTitle(deleting?.name ?? '')}
        message={t.files.deleteMessage}
        confirmLabel={t.files.deleteForever}
        cancelLabel={t.files.keep}
        onConfirm={() => {
          const file = deleting;
          setDeleting(null);
          if (file)
            void guarded(async () => {
              await deleteAttachment(file.id);
              toast({ message: t.files.deleted(file.name) });
            });
        }}
      />
    </>
  );
}
