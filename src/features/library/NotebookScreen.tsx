import { FilePlus, FileText, Star } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { Button, IconButton } from '@/components/ui/Button';
import { Breadcrumbs, EmptyState, LoadingBlock, Section } from '@/components/ui/Layout';
import { byOrder } from '@/database/repositories/common';
import { setNotebookFavourite, setNotebookTags } from '@/database/repositories/notebooks';
import { ItemMenu } from '@/features/organisation/ItemMenu';
import { TagPicker } from '@/features/organisation/TagPicker';
import { NotebookCover, PageRow, folderPath, folderTrail } from '@/features/organisation/items';
import { useItemActions } from '@/features/organisation/useItemActions';
import { NotFound } from '@/features/pages/NotFound';
import { useWorkspace } from '@/hooks/useData';
import { t } from '@/i18n/en';

/** One notebook: its cover, details and pages. */
export function NotebookScreen() {
  const { notebookId } = useParams();
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const { newPage, guarded } = useItemActions();

  if (!workspace) return <LoadingBlock />;
  const notebook = workspace.notebooks.find((n) => n.id === notebookId);
  if (!notebook) return <NotFound />;

  const pages = workspace.pages.filter((p) => p.notebookId === notebook.id).sort(byOrder);
  const trail = folderTrail(notebook.folderId, workspace.folders);
  const newPageButton = (
    <Button variant="primary" icon={FilePlus} onClick={() => void newPage({ notebookId: notebook.id })}>
      {t.actions.newPage}
    </Button>
  );

  return (
    <>
      <div className="mb-4">
        <Breadcrumbs items={[{ label: t.library.title, to: '/library' }, ...trail.map((f) => ({ label: f.name, to: folderPath(f.id) })), { label: notebook.name }]} />
      </div>
      <header className="mb-8 flex flex-col gap-5 sm:flex-row">
        <div className="w-32 shrink-0">
          <NotebookCover notebook={notebook} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-start gap-2">
            <h1 className="min-w-0 flex-1 font-display text-4xl font-semibold break-words text-ink">{notebook.name}</h1>
            <IconButton
              icon={Star}
              filled={notebook.favourite}
              pressed={notebook.favourite}
              label={t.organise.favourite}
              onClick={() => void guarded(() => setNotebookFavourite(notebook.id, !notebook.favourite))}
            />
            <ItemMenu entry={{ kind: 'notebook', item: notebook }} workspace={workspace} onTrashed={() => navigate(folderPath(notebook.folderId))} />
          </div>
          {notebook.description && <p className="max-w-prose text-sm whitespace-pre-line text-muted">{notebook.description}</p>}
          <TagPicker tags={workspace.tags} selected={notebook.tagIds} onChange={(tagIds) => void guarded(() => setNotebookTags(notebook.id, tagIds))} />
        </div>
      </header>

      <Section title={t.library.pages} action={pages.length > 0 ? newPageButton : undefined}>
        {pages.length === 0 ? (
          <EmptyState icon={FileText} title={t.notebook.emptyTitle} body={t.notebook.emptyBody} action={newPageButton} />
        ) : (
          <ul className="grid gap-2">
            {pages.map((page, index) => (
              <PageRow key={page.id} page={page} workspace={workspace} position={{ index, count: pages.length }} />
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
