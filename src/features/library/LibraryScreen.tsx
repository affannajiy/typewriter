import { BookPlus, FilePlus, FolderPlus, LayoutGrid, Library, List } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { Breadcrumbs, EmptyState, LoadingBlock, PageHeader, Section, Segmented } from '@/components/ui/Layout';
import { byOrder } from '@/database/repositories/common';
import { createFolder } from '@/database/repositories/folders';
import { createNotebook } from '@/database/repositories/notebooks';
import { writeSetting } from '@/database/repositories/settings';
import { ItemMenu } from '@/features/organisation/ItemMenu';
import { NameDialog, NotebookDialog } from '@/features/organisation/dialogs';
import { FolderRow, NotebookCard, NotebookRow, PageRow, folderPath, folderTrail } from '@/features/organisation/items';
import { useItemActions } from '@/features/organisation/useItemActions';
import { NotFound } from '@/features/pages/NotFound';
import { useSettings, useWorkspace } from '@/hooks/useData';
import { t } from '@/i18n/en';

/** Folders, notebooks and loose pages at one level of the workspace. */
export function LibraryScreen() {
  const { folderId = null } = useParams();
  const workspace = useWorkspace();
  const settings = useSettings();
  const navigate = useNavigate();
  const { newPage, guarded } = useItemActions();
  const [dialog, setDialog] = useState<'folder' | 'notebook' | null>(null);

  if (!workspace) return <LoadingBlock />;
  const folder = folderId ? workspace.folders.find((f) => f.id === folderId) : null;
  if (folderId && !folder) return <NotFound />;

  const folders = workspace.folders.filter((f) => f.parentId === folderId).sort(byOrder);
  const notebooks = workspace.notebooks.filter((n) => n.folderId === folderId).sort(byOrder);
  const pages = workspace.pages.filter((p) => p.folderId === folderId && p.notebookId === null).sort(byOrder);
  const isEmpty = folders.length + notebooks.length + pages.length === 0;
  const trail = folderTrail(folderId, workspace.folders);

  const actions = (
    <>
      <Button icon={FolderPlus} onClick={() => setDialog('folder')}>
        {t.actions.newFolder}
      </Button>
      <Button icon={BookPlus} onClick={() => setDialog('notebook')}>
        {t.actions.newNotebook}
      </Button>
      <Button variant="primary" icon={FilePlus} onClick={() => void newPage({ folderId })}>
        {t.actions.newPage}
      </Button>
    </>
  );

  return (
    <>
      <PageHeader
        title={folder ? folder.name : t.library.title}
        description={folder ? undefined : t.library.description}
        actions={
          <>
            {folder && <ItemMenu entry={{ kind: 'folder', item: folder }} workspace={workspace} onTrashed={() => navigate(folderPath(folder.parentId))} />}
            {!isEmpty && actions}
          </>
        }
      >
        {folder && (
          <Breadcrumbs
            items={[{ label: t.library.title, to: '/library' }, ...trail.map((f, i) => ({ label: f.name, to: i === trail.length - 1 ? undefined : folderPath(f.id) }))]}
          />
        )}
      </PageHeader>

      {isEmpty ? (
        <EmptyState icon={Library} title={folder ? t.library.emptyFolderTitle : t.library.emptyTitle} body={t.library.emptyBody} action={actions} />
      ) : (
        <>
          {folders.length > 0 && (
            <Section title={t.library.folders}>
              <ul className="grid gap-2 lg:grid-cols-2">
                {folders.map((f, index) => (
                  <FolderRow key={f.id} folder={f} workspace={workspace} position={{ index, count: folders.length }} />
                ))}
              </ul>
            </Section>
          )}
          {notebooks.length > 0 && (
            <Section
              title={t.library.notebooks}
              action={
                <Segmented
                  legend={t.library.viewAs}
                  name="library-view"
                  value={settings.libraryView}
                  iconsOnly
                  options={[
                    { value: 'shelf', label: t.library.shelfView, icon: LayoutGrid },
                    { value: 'list', label: t.library.listView, icon: List },
                  ]}
                  onChange={(view) => void guarded(() => writeSetting('libraryView', view))}
                />
              }
            >
              {settings.libraryView === 'shelf' ? (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-x-4 gap-y-5">
                  {notebooks.map((n, index) => (
                    <NotebookCard key={n.id} notebook={n} workspace={workspace} position={{ index, count: notebooks.length }} />
                  ))}
                </ul>
              ) : (
                <ul className="grid gap-2">
                  {notebooks.map((n, index) => (
                    <NotebookRow key={n.id} notebook={n} workspace={workspace} position={{ index, count: notebooks.length }} />
                  ))}
                </ul>
              )}
            </Section>
          )}
          {pages.length > 0 && (
            <Section title={t.library.pages}>
              <ul className="grid gap-2">
                {pages.map((p, index) => (
                  <PageRow key={p.id} page={p} workspace={workspace} position={{ index, count: pages.length }} />
                ))}
              </ul>
            </Section>
          )}
        </>
      )}

      <NameDialog
        open={dialog === 'folder'}
        onClose={() => setDialog(null)}
        title={t.library.newFolderTitle}
        label={t.organise.name}
        submitLabel={t.library.createFolder}
        onSubmit={(name) => void guarded(() => createFolder({ name, parentId: folderId }))}
      />
      <NotebookDialog open={dialog === 'notebook'} onClose={() => setDialog(null)} onSubmit={(details) => void guarded(() => createNotebook({ ...details, folderId }))} />
    </>
  );
}
