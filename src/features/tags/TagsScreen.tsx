import { Pencil, Plus, Tag as TagIcon, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button, cx } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { EmptyState, LoadingBlock, PageHeader, Section } from '@/components/ui/Layout';
import { Menu } from '@/components/ui/Menu';
import { MAX_TAG_LENGTH, TAG_COLOURS, createTag, deleteTag, updateTag } from '@/database/repositories/tags';
import { NameDialog } from '@/features/organisation/dialogs';
import { NotebookRow, PageRow } from '@/features/organisation/items';
import { useGuarded } from '@/features/organisation/useItemActions';
import { useWorkspace } from '@/hooks/useData';
import { t } from '@/i18n/en';
import type { Tag } from '@/types/models';

/** All tags, and the notebooks and pages that carry the selected one. */
export function TagsScreen() {
  const { tagId } = useParams();
  const workspace = useWorkspace();
  const guarded = useGuarded();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Tag | null>(null);
  const [deleting, setDeleting] = useState<Tag | null>(null);

  if (!workspace) return <LoadingBlock />;
  const { tags, notebooks, pages } = workspace;
  const usage = (id: string) => notebooks.filter((n) => n.tagIds.includes(id)).length + pages.filter((p) => p.tagIds.includes(id)).length;
  const selected = tags.find((tag) => tag.id === tagId);
  const taggedNotebooks = selected ? notebooks.filter((n) => n.tagIds.includes(selected.id)) : [];
  const taggedPages = selected ? pages.filter((p) => p.tagIds.includes(selected.id)) : [];

  const newTagButton = (
    <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
      {t.tags.newTag}
    </Button>
  );

  return (
    <>
      <PageHeader title={t.tags.title} description={t.tags.description} actions={tags.length > 0 ? newTagButton : undefined} />

      {tags.length === 0 ? (
        <EmptyState icon={TagIcon} title={t.tags.emptyTitle} body={t.tags.emptyBody} action={newTagButton} />
      ) : (
        <ul className="mb-8 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag.id} className={cx('flex items-center rounded-full border bg-surface ps-1', tag.id === tagId ? 'border-ink' : 'border-line')}>
              <Link to={`/tags/${tag.id}`} aria-current={tag.id === tagId ? 'true' : undefined} className={cx('flex min-h-10 items-center gap-2 rounded-full px-3 text-sm text-ink', tag.id === tagId && 'font-semibold')}>
                <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: tag.colour }} />
                {tag.name}
                <span className="text-xs font-normal text-muted">{usage(tag.id)}</span>
              </Link>
              <Menu
                label={t.organise.actionsFor(tag.name)}
                items={[
                  { id: 'rename', label: t.organise.rename, icon: Pencil, onSelect: () => setRenaming(tag) },
                  ...TAG_COLOURS.map((colour, index) => ({
                    id: `colour-${colour}`,
                    label: t.tags.colourOption(index + 1) + (colour === tag.colour ? ` ${t.tags.currentColour}` : ''),
                    onSelect: () => void guarded(() => updateTag(tag.id, { colour })),
                  })),
                  { id: 'delete', label: t.tags.delete, icon: Trash2, danger: true, onSelect: () => setDeleting(tag) },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <Section title={t.tags.taggedWith(selected.name)}>
          {taggedNotebooks.length + taggedPages.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line-strong px-4 py-3 text-sm text-muted">{t.tags.nothingTagged}</p>
          ) : (
            <ul className="grid gap-2">
              {taggedNotebooks.map((n) => (
                <NotebookRow key={n.id} notebook={n} workspace={workspace} />
              ))}
              {taggedPages.map((p) => (
                <PageRow key={p.id} page={p} workspace={workspace} showLocation />
              ))}
            </ul>
          )}
        </Section>
      )}

      <NameDialog open={creating} onClose={() => setCreating(false)} title={t.tags.newTag} label={t.tags.tagName} submitLabel={t.tags.create} maxLength={MAX_TAG_LENGTH} onSubmit={(name) => void guarded(() => createTag(name))} />
      <NameDialog
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title={t.organise.renameTitle(renaming?.name ?? '')}
        label={t.tags.tagName}
        initial={renaming?.name}
        submitLabel={t.organise.rename}
        maxLength={MAX_TAG_LENGTH}
        onSubmit={(name) => renaming && void guarded(() => updateTag(renaming.id, { name }))}
      />
      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={t.tags.deleteTitle(deleting?.name ?? '')}
        message={t.tags.deleteMessage(deleting ? usage(deleting.id) : 0)}
        confirmLabel={t.tags.delete}
        cancelLabel={t.tags.keep}
        onConfirm={() => {
          const tag = deleting;
          setDeleting(null);
          if (!tag) return;
          void guarded(() => deleteTag(tag.id));
          if (tag.id === tagId) navigate('/tags');
        }}
      />
    </>
  );
}
