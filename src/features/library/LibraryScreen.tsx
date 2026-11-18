import { BookPlus, FilePlus, LayoutGrid, List, NotebookPen } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/Button';
import { EmptyState, LoadingBlock, PageHeader, Section, Segmented } from '@/components/ui/Layout';
import { byOrder } from '@/database/repositories/common';
import { createNotebook } from '@/database/repositories/notebooks';
import { writeSetting } from '@/database/repositories/settings';
import { NotebookDialog } from '@/features/organisation/dialogs';
import { NotebookCard, NotebookRow, PageRow, notebookPath } from '@/features/organisation/items';
import { useItemActions } from '@/features/organisation/useItemActions';
import { SearchField, SearchResultsList } from '@/features/search/SearchResults';
import { queryWords, searchEverything } from '@/features/search/search';
import { useSearchSource, useSettings, useWorkspace } from '@/hooks/useData';
import { t } from '@/i18n/en';

/**
 * Home: a search field over everything written, the notebooks on their
 * shelf, and loose pages under it. While there is a query, its results take
 * the shelf's place. With nothing written yet, one button makes the first notebook.
 */
export function LibraryScreen() {
  const workspace = useWorkspace();
  const settings = useSettings();
  const { newPage, guarded } = useItemActions();
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  // The query lives in the address, so Back returns to the results and a search can be bookmarked.
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const setQuery = (next: string) => setParams(next ? { q: next } : {}, { replace: true });
  const source = useSearchSource();
  const deferred = useDeferredValue(query);
  const results = useMemo(() => (source && queryWords(deferred).length > 0 ? searchEverything(source, deferred) : null), [source, deferred]);

  if (!workspace) return <LoadingBlock />;

  const notebooks = [...workspace.notebooks].sort(byOrder);
  const pages = workspace.pages.filter((p) => p.notebookId === null).sort(byOrder);
  const isEmpty = notebooks.length + pages.length === 0;

  const newNotebookButton = (primary: boolean) => (
    <Button variant={primary ? 'primary' : 'secondary'} icon={BookPlus} onClick={() => setCreating(true)}>
      {isEmpty ? t.library.createFirst : t.actions.newNotebook}
    </Button>
  );

  return (
    <>
      <PageHeader title={t.library.title} description={isEmpty ? undefined : t.library.description} actions={isEmpty ? undefined : newNotebookButton(true)} />

      {!isEmpty && <SearchField value={query} onChange={setQuery} />}

      {results ? (
        <SearchResultsList results={results} query={deferred} />
      ) : isEmpty ? (
        <EmptyState
          icon={NotebookPen}
          title={t.library.emptyTitle}
          body={t.library.emptyBody}
          action={
            <>
              {newNotebookButton(true)}
              <Button icon={FilePlus} onClick={() => void newPage()}>
                {t.actions.newLoosePage}
              </Button>
            </>
          }
        />
      ) : (
        <>
          <Section
            title={t.library.notebooks}
            action={
              notebooks.length > 0 && (
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
              )
            }
          >
            {notebooks.length === 0 ? (
              <p className="text-sm text-muted">{t.library.noNotebooks}</p>
            ) : settings.libraryView === 'shelf' ? (
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
          <Section
            title={t.library.loosePages}
            action={
              <Button icon={FilePlus} onClick={() => void newPage()}>
                {t.actions.newLoosePage}
              </Button>
            }
          >
            {pages.length === 0 ? (
              <p className="text-sm text-muted">{t.library.noLoosePages}</p>
            ) : (
              <ul className="grid gap-2">
                {pages.map((p, index) => (
                  <PageRow key={p.id} page={p} workspace={workspace} position={{ index, count: pages.length }} />
                ))}
              </ul>
            )}
          </Section>
        </>
      )}

      <NotebookDialog
        open={creating}
        onClose={() => setCreating(false)}
        // A new notebook opens at once: the next thing to do is write in it.
        onSubmit={(details) =>
          void guarded(async () => {
            const notebook = await createNotebook(details);
            navigate(notebookPath(notebook.id));
          })
        }
      />
    </>
  );
}
