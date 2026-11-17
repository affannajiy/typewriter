import { BookOpen, BookPlus, FilePlus, Feather } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { EmptyState, LoadingBlock, PageHeader, Section } from '@/components/ui/Layout';
import { byOrder } from '@/database/repositories/common';
import { createNotebook } from '@/database/repositories/notebooks';
import { NotebookDialog } from '@/features/organisation/dialogs';
import { NotebookCard, PageRow, notebookPath } from '@/features/organisation/items';
import { useItemActions } from '@/features/organisation/useItemActions';
import { useSettings, useWorkspace } from '@/hooks/useData';
import { t } from '@/i18n/en';
import { dayPart, formatLongDate } from '@/utils/dates';
import { StudyCorner } from './StudyCorner';
import { WritingStats } from './WritingStats';

/** The landing screen: a writing desk with what the user was last working on. */
export function DashboardScreen() {
  const workspace = useWorkspace();
  const settings = useSettings();
  const navigate = useNavigate();
  const { newPage, guarded } = useItemActions();
  const [creatingNotebook, setCreatingNotebook] = useState(false);

  const actions = (
    <>
      <Button icon={BookPlus} onClick={() => setCreatingNotebook(true)}>
        {t.actions.newNotebook}
      </Button>
      <Button variant="primary" icon={FilePlus} onClick={() => void newPage()}>
        {t.actions.newPage}
      </Button>
    </>
  );

  // An empty desk offers the actions once, in the empty state, not twice.
  const header = (withActions: boolean) => <PageHeader title={t.dashboard.greeting[dayPart()]} description={formatLongDate(new Date())} actions={withActions ? actions : undefined} />;
  const dialog = (
    <NotebookDialog
      open={creatingNotebook}
      onClose={() => setCreatingNotebook(false)}
      onSubmit={(details) =>
        void guarded(async () => {
          const notebook = await createNotebook({ ...details, folderId: null });
          navigate(notebookPath(notebook.id));
        })
      }
    />
  );

  if (!workspace) {
    return (
      <>
        {header(false)}
        <LoadingBlock />
      </>
    );
  }

  const { pages, notebooks } = workspace;
  const limit = settings.recentCount;

  if (pages.length === 0 && notebooks.length === 0 && workspace.folders.length === 0) {
    return (
      <>
        {header(false)}
        <EmptyState icon={Feather} title={t.dashboard.emptyTitle} body={t.dashboard.emptyBody} action={actions} />
        {dialog}
      </>
    );
  }

  const opened = pages.filter((p) => p.lastOpenedAt !== null).sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0)).slice(0, limit);
  const pinned = pages.filter((p) => p.pinned).sort(byOrder);
  const favouritePages = pages.filter((p) => p.favourite && !p.pinned).sort(byOrder);
  const favouriteNotebooks = notebooks.filter((n) => n.favourite).sort(byOrder);
  const modified = [...pages].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);

  return (
    <>
      {header(true)}
      <WritingStats pages={pages} goal={settings.dailyGoal} />
      <StudyCorner />
      {opened.length > 0 && (
        <Section title={t.dashboard.continueWorking}>
          <ul className="grid gap-2 lg:grid-cols-2">
            {opened.map((page) => (
              <PageRow key={page.id} page={page} workspace={workspace} showLocation />
            ))}
          </ul>
        </Section>
      )}
      {pinned.length > 0 && (
        <Section title={t.dashboard.pinned}>
          <ul className="grid gap-2 lg:grid-cols-2">
            {pinned.map((page) => (
              <PageRow key={page.id} page={page} workspace={workspace} showLocation />
            ))}
          </ul>
        </Section>
      )}
      <Section title={t.dashboard.favourites}>
        {favouriteNotebooks.length === 0 && favouritePages.length === 0 ? (
          <p className="flex items-center gap-2 rounded-lg border border-dashed border-line-strong px-4 py-3 text-sm text-muted">
            <BookOpen size={16} aria-hidden />
            {t.dashboard.noFavourites}
          </p>
        ) : (
          <>
            {favouriteNotebooks.length > 0 && (
              <ul className="mb-4 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-4">
                {favouriteNotebooks.map((notebook) => (
                  <NotebookCard key={notebook.id} notebook={notebook} workspace={workspace} />
                ))}
              </ul>
            )}
            <ul className="grid gap-2 lg:grid-cols-2">
              {favouritePages.map((page) => (
                <PageRow key={page.id} page={page} workspace={workspace} showLocation />
              ))}
            </ul>
          </>
        )}
      </Section>
      {modified.length > 0 && (
        <Section title={t.dashboard.recentlyModified}>
          <ul className="grid gap-2 lg:grid-cols-2">
            {modified.map((page) => (
              <PageRow key={page.id} page={page} workspace={workspace} showLocation />
            ))}
          </ul>
        </Section>
      )}
      {dialog}
    </>
  );
}
