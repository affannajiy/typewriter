import { useLiveQuery } from 'dexie-react-hooks';
import { Pin, Star, Trash2, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button, IconButton, cx } from '@/components/ui/Button';
import { Breadcrumbs, type Crumb, LoadingBlock } from '@/components/ui/Layout';
import { getPage, markPageOpened, savePageDraft, setPageFlags, setPageTags } from '@/database/repositories/pages';
import { writeSetting } from '@/database/repositories/settings';
import { restoreBatch } from '@/database/repositories/trash';
import { ItemMenu } from '@/features/organisation/ItemMenu';
import { TagPicker } from '@/features/organisation/TagPicker';
import { folderPath, folderTrail, notebookPath } from '@/features/organisation/items';
import { useGuarded } from '@/features/organisation/useItemActions';
import { type Workspace, useSettings, useWorkspace } from '@/hooks/useData';
import { t } from '@/i18n/en';
import { type Autosaver, type SaveStatus, createAutosaver } from '@/services/autosave';
import type { Page } from '@/types/models';
import { NotFound } from './NotFound';
import { SaveIndicator } from './SaveIndicator';
import { countCharacters, countWords, docToText, textToDoc } from './plainDoc';
import { useTypewriter } from './useTypewriter';

export function PageScreen() {
  const { pageId = '' } = useParams();
  const workspace = useWorkspace();
  // undefined: still loading. null: no such page.
  const page = useLiveQuery(async () => (await getPage(pageId)) ?? null, [pageId]);

  useEffect(() => {
    void markPageOpened(pageId);
  }, [pageId]);

  if (page === undefined || !workspace) return <LoadingBlock />;
  if (page === null) return <NotFound />;
  // The key gives each page its own editor state and autosaver.
  return <PageEditor key={page.id} page={page} workspace={workspace} />;
}

function crumbsFor(page: Page, workspace: Workspace): Crumb[] {
  const notebook = page.notebookId ? workspace.notebooks.find((n) => n.id === page.notebookId) : undefined;
  const trail = folderTrail(notebook ? notebook.folderId : page.folderId, workspace.folders);
  return [
    { label: t.library.title, to: '/library' },
    ...trail.map((f) => ({ label: f.name, to: folderPath(f.id) })),
    ...(notebook ? [{ label: notebook.name, to: notebookPath(notebook.id) }] : []),
    { label: page.title },
  ];
}

/**
 * The writing surface keeps a focus indicator, but a thin, distant one:
 * a heavy ring around the whole page would sit in the writer's eye.
 */
const quietFocus = 'focus-visible:outline-1 focus-visible:outline-offset-8 focus-visible:outline-line-strong';

interface Draft {
  title: string;
  body: string;
}

function PageEditor({ page, workspace }: { page: Page; workspace: Workspace }) {
  const navigate = useNavigate();
  const guarded = useGuarded();
  const settings = useSettings();
  // Local state starts from the stored page once and is then the editing truth:
  // later database updates (our own saves) must not move the cursor.
  const [draft, setDraft] = useState<Draft>(() => ({ title: page.title, body: docToText(page.content) }));
  const [status, setStatus] = useState<SaveStatus>({ state: 'idle', savedAt: page.updatedAt, error: null });
  const saver = useRef<Autosaver<Draft> | null>(null);
  const inTrash = page.deletedAt !== null;

  useEffect(() => {
    const autosaver = createAutosaver<Draft>((value) => savePageDraft(page.id, { title: value.title, content: textToDoc(value.body) }), setStatus);
    saver.current = autosaver;

    // Write before the tab is hidden or closed; warn if something is still unsaved.
    const onHide = () => {
      if (document.visibilityState === 'hidden') void autosaver.flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (autosaver.isDirty()) {
        void autosaver.flush();
        event.preventDefault();
      }
    };
    // Ctrl/Cmd+S forces a save instead of opening the browser's "Save page" dialog.
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void autosaver.flush();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('keydown', onKeyDown);
      autosaver.dispose();
    };
  }, [page.id]);

  const change = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    saver.current?.schedule(next);
  };

  const typewriter = useTypewriter(settings);

  const toggleSound = () => {
    const next = !settings.typingSound;
    if (next) typewriter.feedPaper();
    void guarded(() => writeSetting('typingSound', next));
  };

  const counts = useMemo(() => ({ words: countWords(draft.body), characters: countCharacters(draft.body) }), [draft.body]);

  return (
    <article className="mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-3xl flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Breadcrumbs items={crumbsFor(page, workspace)} />
        {!inTrash && (
          <div className="ms-auto flex items-center">
            <IconButton icon={Star} filled={page.favourite} pressed={page.favourite} label={t.organise.favourite} onClick={() => void guarded(() => setPageFlags(page.id, { favourite: !page.favourite }))} />
            <IconButton icon={Pin} filled={page.pinned} pressed={page.pinned} label={t.organise.pin} onClick={() => void guarded(() => setPageFlags(page.id, { pinned: !page.pinned }))} />
            <ItemMenu noRename entry={{ kind: 'page', item: page }} workspace={workspace} onTrashed={() => navigate(page.notebookId ? notebookPath(page.notebookId) : folderPath(page.folderId))} />
          </div>
        )}
      </div>

      {inTrash && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-line-strong bg-sunken px-4 py-3 text-sm text-ink">
          <Trash2 size={18} aria-hidden className="shrink-0" />
          <p className="min-w-0 flex-1">{t.page.inTrash}</p>
          {page.trashBatchId && (
            <Button onClick={() => void guarded(() => restoreBatch(page.trashBatchId!))}>{t.trash.restore}</Button>
          )}
        </div>
      )}

      <label htmlFor="page-title" className="sr-only">
        {t.page.titleLabel}
      </label>
      <input
        id="page-title"
        value={draft.title}
        readOnly={inTrash}
        maxLength={200}
        placeholder={t.page.titlePlaceholder}
        autoComplete="off"
        onKeyDown={typewriter.onKeyDown}
        onKeyUp={typewriter.onKeyUp}
        onChange={(e) => {
          typewriter.onInput(e);
          change({ title: e.target.value });
        }}
        className={cx('w-full bg-transparent py-1 font-serif text-4xl font-semibold text-ink placeholder:text-muted/60', quietFocus)}
      />

      {!inTrash && (
        <div className="mt-2 mb-4">
          <TagPicker tags={workspace.tags} selected={page.tagIds} onChange={(tagIds) => void guarded(() => setPageTags(page.id, tagIds))} />
        </div>
      )}

      <label htmlFor="page-body" className="sr-only">
        {t.page.bodyLabel}
      </label>
      <textarea
        id="page-body"
        value={draft.body}
        readOnly={inTrash}
        placeholder={t.page.bodyPlaceholder}
        onKeyDown={typewriter.onKeyDown}
        onKeyUp={typewriter.onKeyUp}
        onSelect={typewriter.onSelect}
        onChange={(e) => {
          typewriter.onInput(e);
          change({ body: e.target.value });
        }}
        className={cx('min-h-80 w-full flex-1 resize-none bg-transparent py-2 font-serif text-lg leading-[1.7] text-ink placeholder:text-muted/60', quietFocus)}
      />

      <footer className="sticky bottom-16 mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line bg-bg py-2 text-xs text-muted md:bottom-0">
        <SaveIndicator status={status} onRetry={() => void saver.current?.flush()} />
        <div className="flex items-center gap-2">
          <p>
            {t.page.words(counts.words)} · {t.page.characters(counts.characters)}
          </p>
          {!inTrash && (
            <IconButton
              icon={settings.typingSound ? Volume2 : VolumeX}
              pressed={settings.typingSound}
              label={t.sound.toggle}
              onClick={toggleSound}
            />
          )}
        </div>
      </footer>
    </article>
  );
}
