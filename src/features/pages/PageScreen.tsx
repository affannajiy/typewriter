import { useLiveQuery } from 'dexie-react-hooks';
import { Files, Maximize, Minimize, Pin, ScrollText, Star, Trash2, TriangleAlert, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button, IconButton, cx } from '@/components/ui/Button';
import { Breadcrumbs, type Crumb, LoadingBlock, Segmented } from '@/components/ui/Layout';
import { docToPlainText, getPage, markPageOpened, savePageDraft, setPageFlags, setPageLayout, setPageTags } from '@/database/repositories/pages';
import { writeSetting } from '@/database/repositories/settings';
import { restoreBatch } from '@/database/repositories/trash';
import { DrawingEditor } from '@/features/drawing/DrawingEditor';
import { RichEditor } from '@/features/editor/RichEditor';
import { formatShortcut } from '@/features/editor/commands';
import { isReadableDoc } from '@/features/editor/extensions';
import { ItemMenu } from '@/features/organisation/ItemMenu';
import { TagPicker } from '@/features/organisation/TagPicker';
import { folderPath, folderTrail, notebookPath } from '@/features/organisation/items';
import { useGuarded } from '@/features/organisation/useItemActions';
import { type Workspace, useSettings, useWorkspace } from '@/hooks/useData';
import { t } from '@/i18n/en';
import { type Autosaver, type SaveStatus, createAutosaver } from '@/services/autosave';
import type { DocNode, Page, PageLayout } from '@/types/models';
import { NotFound } from './NotFound';
import { SaveIndicator } from './SaveIndicator';
import { countCharacters, countWords } from './plainDoc';
import { useTypewriter } from './useTypewriter';

export default function PageScreen() {
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
  content: DocNode;
}

function PageEditor({ page, workspace }: { page: Page; workspace: Workspace }) {
  const navigate = useNavigate();
  const guarded = useGuarded();
  const settings = useSettings();
  // Local state starts from the stored page once and is then the editing truth:
  // later database updates (our own saves) must not move the cursor.
  const [draft, setDraft] = useState<Draft>(() => ({ title: page.title, content: page.content }));
  const [status, setStatus] = useState<SaveStatus>({ state: 'idle', savedAt: page.updatedAt, error: null });
  const [sheets, setSheets] = useState(1);
  const [openDrawing, setOpenDrawing] = useState<string | null>(null);
  const [focus, setFocus] = useState(false);
  const saver = useRef<Autosaver<Draft> | null>(null);
  const latestDraft = useRef(draft);
  const inTrash = page.deletedAt !== null;
  // Checked once, against the document as it was stored.
  const [readable] = useState(() => isReadableDoc(page.content));
  const locked = inTrash || !readable;

  useEffect(() => {
    const autosaver = createAutosaver<Draft>((value) => savePageDraft(page.id, value), setStatus);
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

  // Focus mode hides the application around the page (see editor.css). It ends with the page.
  useEffect(() => {
    const root = document.documentElement;
    if (focus) root.dataset.focus = 'on';
    else delete root.dataset.focus;
    return () => {
      delete root.dataset.focus;
    };
  }, [focus]);

  // Ctrl/Cmd + Shift + F turns focus mode on and off; Escape leaves it.
  // Heard before the editor, whose own keymap claims Escape. While a menu,
  // the slash menu or a dialog is open, Escape belongs to that instead.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setFocus((on) => !on);
      } else if (event.key === 'Escape' && !document.querySelector('dialog[open], [role="menu"], [role="listbox"]')) {
        setFocus(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  // The editor calls this from a handler that was set up once, so it reads the draft from a ref.
  const change = useCallback(
    (patch: Partial<Draft>) => {
      if (locked) return;
      const next = { ...latestDraft.current, ...patch };
      latestDraft.current = next;
      setDraft(next);
      saver.current?.schedule(next);
    },
    [locked],
  );
  const changeContent = useCallback((content: DocNode) => change({ content }), [change]);

  const typewriter = useTypewriter(settings);

  const toggleSound = () => {
    const next = !settings.typingSound;
    if (next) typewriter.feedPaper();
    void guarded(() => writeSetting('typingSound', next));
  };

  const counts = useMemo(() => {
    const text = docToPlainText(draft.content);
    return { words: countWords(text), characters: countCharacters(text) };
  }, [draft.content]);

  const paginated = page.layout === 'paginated';

  return (
    <article
      className={cx('tn-page mx-auto flex min-h-[calc(100dvh-10rem)] w-full flex-col', paginated ? 'max-w-[51rem]' : 'max-w-(--tn-column)')}
      data-font={settings.editorFont}
      data-size={settings.editorSize}
      data-leading={settings.editorLeading}
      data-width={settings.editorWidth}
      data-paper={settings.paperStyle}
      data-dim={settings.focusDim ? '' : undefined}
    >
      <div data-chrome className="mb-4 flex flex-wrap items-center justify-between gap-2">
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
          {page.trashBatchId && <Button onClick={() => void guarded(() => restoreBatch(page.trashBatchId!))}>{t.trash.restore}</Button>}
        </div>
      )}

      {!readable && (
        <div role="status" className="mb-4 flex items-start gap-3 rounded-lg border border-line-strong bg-sunken px-4 py-3 text-sm text-ink">
          <TriangleAlert size={18} aria-hidden className="mt-0.5 shrink-0" />
          <p className="min-w-0 flex-1">{t.page.unreadable}</p>
        </div>
      )}

      <label htmlFor="page-title" className="sr-only">
        {t.page.titleLabel}
      </label>
      <input
        id="page-title"
        value={draft.title}
        readOnly={locked}
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
        <div data-chrome className="mt-2 mb-4">
          <TagPicker tags={workspace.tags} selected={page.tagIds} onChange={(tagIds) => void guarded(() => setPageTags(page.id, tagIds))} />
        </div>
      )}

      {readable ? (
        <RichEditor
          initial={page.content}
          editable={!locked}
          layout={page.layout}
          pageSize={settings.pageSize}
          pageMargin={settings.pageMargin}
          typewriter={typewriter}
          onChange={changeContent}
          onPageCount={setSheets}
          pageId={page.id}
          onOpenDrawing={setOpenDrawing}
          textMetrics={`${settings.editorFont} ${settings.editorSize} ${settings.editorLeading} ${settings.paperStyle}`}
        />
      ) : (
        // The stored text, exactly as it is. Nothing on this screen can change the page.
        <pre className="flex-1 py-2 font-serif text-lg leading-[1.7] whitespace-pre-wrap text-ink">{page.plainText}</pre>
      )}

      {openDrawing && !locked && <DrawingEditor drawingId={openDrawing} pageId={page.id} onClose={() => setOpenDrawing(null)} />}

      {focus && (
        <p role="status" className="sr-only">
          {t.page.focusHint(formatShortcut('Mod+Shift+F'))}
        </p>
      )}

      <footer className="tn-page-footer sticky bottom-16 z-10 mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line bg-bg py-2 text-xs text-muted md:bottom-0">
        <SaveIndicator status={status} onRetry={() => void saver.current?.flush()} />
        <div className="flex flex-wrap items-center gap-2">
          <p>
            {t.page.words(counts.words)} · {t.page.characters(counts.characters)}
            {paginated && readable && ` · ${t.page.sheets(sheets)}`}
          </p>
          {!locked && (
            <Segmented<PageLayout>
              legend={t.page.layout}
              name="page-layout"
              value={page.layout}
              iconsOnly
              options={[
                { value: 'continuous', label: t.page.layoutContinuous, icon: ScrollText },
                { value: 'paginated', label: t.page.layoutPaginated, icon: Files },
              ]}
              onChange={(layout) => void guarded(() => setPageLayout(page.id, layout))}
            />
          )}
          {!inTrash && <IconButton icon={settings.typingSound ? Volume2 : VolumeX} pressed={settings.typingSound} label={t.sound.toggle} onClick={toggleSound} />}
          <IconButton icon={focus ? Minimize : Maximize} pressed={focus} label={t.page.focus} title={`${t.page.focus} (${formatShortcut('Mod+Shift+F')})`} onClick={() => setFocus(!focus)} />
        </div>
      </footer>
    </article>
  );
}
