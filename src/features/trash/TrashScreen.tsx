import { BookOpen, FileText, Folder, Trash2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { EmptyState, LoadingBlock, PageHeader } from '@/components/ui/Layout';
import { useToast } from '@/components/ui/Toast';
import { type TrashEntry, emptyTrash, purgeBatch, restoreBatch } from '@/database/repositories/trash';
import { useGuarded } from '@/features/organisation/useItemActions';
import { useTrash } from '@/hooks/useData';
import { t } from '@/i18n/en';
import { formatRelative } from '@/utils/dates';

const icons = { folder: Folder, notebook: BookOpen, page: FileText };

/** Deleted items. They stay here until the user restores or permanently deletes them. */
export function TrashScreen() {
  const entries = useTrash();
  const guarded = useGuarded();
  const toast = useToast();
  const [purging, setPurging] = useState<TrashEntry | null>(null);
  const [emptying, setEmptying] = useState(false);

  if (!entries) return <LoadingBlock />;
  const total = entries.reduce((sum, entry) => sum + entry.count, 0);

  const restore = (entry: TrashEntry) =>
    void guarded(async () => {
      const result = await restoreBatch(entry.batchId);
      toast({ message: result.relocated ? t.trash.restoredToTop(entry.name) : t.trash.restored(entry.name) });
    });

  return (
    <>
      <PageHeader
        title={t.trash.title}
        description={t.trash.description}
        actions={
          entries.length > 0 ? (
            <Button variant="danger" icon={Trash2} onClick={() => setEmptying(true)}>
              {t.trash.empty}
            </Button>
          ) : undefined
        }
      />
      {entries.length === 0 ? (
        <EmptyState icon={Trash2} title={t.trash.emptyTitle} body={t.trash.emptyBody} />
      ) : (
        <ul className="grid gap-2">
          {entries.map((entry) => {
            const Icon = icons[entry.root.kind];
            return (
              <li key={entry.batchId} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2">
                <Icon size={20} aria-hidden className="shrink-0 text-muted" />
                <div className="min-w-40 flex-1">
                  <p className="truncate font-medium text-ink">{entry.name}</p>
                  <p className="text-xs text-muted">
                    {t.trash.kind[entry.root.kind]}
                    {entry.count > 1 && ` · ${t.trash.contains(entry.count - 1)}`} · {t.trash.deleted(formatRelative(entry.deletedAt))}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button icon={Undo2} onClick={() => restore(entry)}>
                    {t.trash.restore}
                  </Button>
                  <Button variant="danger" onClick={() => setPurging(entry)} aria-label={t.trash.deleteForeverNamed(entry.name)}>
                    {t.trash.deleteForever}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={purging !== null}
        onClose={() => setPurging(null)}
        title={t.trash.purgeTitle(purging?.name ?? '')}
        message={t.trash.purgeMessage(purging?.count ?? 0)}
        confirmLabel={t.trash.deleteForever}
        cancelLabel={t.trash.keepInTrash}
        onConfirm={() => {
          const entry = purging;
          setPurging(null);
          if (entry) void guarded(() => purgeBatch(entry.batchId));
        }}
      />
      <ConfirmDialog
        open={emptying}
        onClose={() => setEmptying(false)}
        title={t.trash.emptyConfirmTitle}
        message={t.trash.emptyConfirmMessage(total)}
        confirmLabel={t.trash.emptyConfirm(total)}
        cancelLabel={t.trash.keepInTrash}
        onConfirm={() => {
          setEmptying(false);
          void guarded(emptyTrash);
        }}
      />
    </>
  );
}
