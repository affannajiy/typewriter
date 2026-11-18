import { BookOpen, FilePlus, FileText, FileType2, Keyboard, Library, type LucideIcon, ListTree, Search, Settings, Trash2 } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { cx } from '@/components/ui/Button';
import { useActiveEditor } from '@/features/editor/activeEditor';
import { EDITOR_COMMANDS, formatShortcut } from '@/features/editor/commands';
import { notebookPath } from '@/features/organisation/items';
import { useItemActions } from '@/features/organisation/useItemActions';
import { useSearchSource } from '@/hooks/useData';
import { t } from '@/i18n/en';
import { hitKey, hitPath } from './SearchResults';
import { MAX_QUERY_LENGTH, fold, queryWords, searchEverything } from './search';

type Group = 'results' | 'actions' | 'format';

interface PaletteItem {
  id: string;
  group: Group;
  label: string;
  icon: LucideIcon;
  /** Second line: a snippet of the page text. */
  detail?: string;
  /** Shown at the end of the row: a location or a shortcut. */
  hint?: string;
  run: () => void;
}

/** Results shown here; the rest are one Enter away, on the home screen. */
const PALETTE_RESULTS = 8;
const GROUPS: Group[] = ['results', 'actions', 'format'];

const matches = (label: string, words: string[]) => words.every((word) => fold(label).includes(word));

/**
 * Search and commands in one place (Ctrl/Cmd + K): find words in any
 * notebook, page or PDF, go to a screen, or run a formatting command on the
 * open page. "Show all results" opens the full, grouped list on the home screen.
 * A combobox with a listbox: focus stays in the field, the arrow keys move
 * the highlighted row, Enter runs it.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const source = useSearchSource();
  const editor = useActiveEditor();
  const navigate = useNavigate();
  const { newPage } = useItemActions();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (typeof element.showModal === 'function') element.showModal();
    else element.setAttribute('open', '');
    return () => {
      if (element.open && typeof element.close === 'function') element.close();
    };
  }, []);

  const items = useMemo<PaletteItem[]>(() => {
    const words = queryWords(query);
    const go = (id: string, label: string, icon: LucideIcon, to: string): PaletteItem => ({ id, group: 'actions', label: t.palette.goTo(label), icon, run: () => navigate(to) });
    const actions: PaletteItem[] = [
      { id: 'new-page', group: 'actions', label: t.actions.newLoosePage, icon: FilePlus, run: () => void newPage() },
      go('notebooks', t.nav.notebooks, Library, '/'),
      go('typing', t.nav.typingTest, Keyboard, '/typing'),
      go('trash', t.nav.trash, Trash2, '/trash'),
      go('settings', t.nav.settings, Settings, '/settings'),
    ];
    const format: PaletteItem[] = editor
      ? EDITOR_COMMANDS.filter((command) => command.isEnabled?.(editor) !== false).map((command) => ({
          id: `format-${command.id}`,
          group: 'format',
          label: command.label,
          icon: command.icon,
          hint: command.shortcut && formatShortcut(command.shortcut),
          run: () => command.toggle(editor),
        }))
      : [];
    if (words.length === 0) return [...actions, ...format];
    const found = source ? searchEverything(source, query) : null;
    const results: PaletteItem[] = [];
    for (const group of found?.groups ?? []) {
      const where = group.notebook?.name ?? t.library.loosePages;
      if (group.nameMatched && group.notebook) {
        const { id } = group.notebook;
        results.push({ id: `notebook-${id}`, group: 'results', label: group.notebook.name, icon: BookOpen, hint: t.trash.kind.notebook, run: () => navigate(notebookPath(id)) });
      }
      for (const hit of group.hits) {
        const snippet = hit.kind === 'page' ? hit.snippets[0] : hit.snippet;
        results.push({
          id: hitKey(hit),
          group: 'results',
          label: hit.kind === 'page' ? hit.page.title : hit.name.text,
          icon: hit.kind === 'page' ? FileText : FileType2,
          detail: snippet?.text || undefined,
          hint: hit.kind === 'page' ? where : t.search.inPdf(hit.page.title, null),
          run: () => navigate(hitPath(hit, query)),
        });
      }
    }
    const shown = results.slice(0, PALETTE_RESULTS);
    if (found && (results.length > PALETTE_RESULTS || found.total > 0)) {
      shown.push({ id: 'all-results', group: 'results', label: t.search.showAll(found.total), icon: ListTree, run: () => navigate(`/?q=${encodeURIComponent(query.trim())}`) });
    }
    return [...shown, ...[...actions, ...format].filter((item) => matches(item.label, words))];
  }, [query, source, editor, navigate, newPage]);

  const index = Math.min(active, Math.max(items.length - 1, 0));
  const optionId = (item: PaletteItem) => `${listId}-${item.id}`;

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [index, items]);

  const run = (item: PaletteItem) => {
    onClose();
    // After the dialog has closed and focus is back where it was.
    setTimeout(item.run, 0);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (items.length === 0) return;
    const move = (to: number) => {
      event.preventDefault();
      setActive((to + items.length) % items.length);
    };
    if (event.key === 'ArrowDown') move(index + 1);
    else if (event.key === 'ArrowUp') move(index - 1);
    else if (event.key === 'Home' && event.ctrlKey) move(0);
    else if (event.key === 'End' && event.ctrlKey) move(items.length - 1);
    else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      event.preventDefault();
      run(items[index]!);
    }
  };

  const searching = queryWords(query).length > 0;

  return (
    // A click on the backdrop lands on the dialog element itself. Escape is handled by the dialog.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialog}
      aria-label={t.palette.title}
      // "cancel" is Escape. The "close" event is not used: it also fires after this component's own clean-up.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => event.target === dialog.current && onClose()}
      className="animate-rise mx-auto mt-[10vh] mb-auto w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface p-0 text-ink shadow-soft backdrop:bg-black/45"
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search size={18} aria-hidden className="shrink-0 text-muted" />
        <input
          role="combobox"
          aria-label={t.palette.inputLabel}
          aria-expanded
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={items[index] ? optionId(items[index]) : undefined}
          value={query}
          maxLength={MAX_QUERY_LENGTH}
          placeholder={t.palette.placeholder}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="min-h-12 w-full bg-transparent text-base text-ink outline-none placeholder:text-muted/70"
        />
      </div>

      <ul ref={list} id={listId} role="listbox" aria-label={t.palette.title} className="max-h-[min(60vh,28rem)] overflow-y-auto p-1">
        {GROUPS.flatMap((group) => {
          const members = items.filter((item) => item.group === group);
          if (members.length === 0) return [];
          return [
            <li key={group} role="presentation" className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">
              {t.palette.groups[group]}
            </li>,
            ...members.map((item) => {
              const selected = items[index] === item;
              return (
                // The keyboard reaches the rows through the field above (arrows and Enter), not through focus.
                // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                <li
                  key={item.id}
                  id={optionId(item)}
                  role="option"
                  tabIndex={-1}
                  aria-selected={selected}
                  onMouseMove={() => !selected && setActive(items.indexOf(item))}
                  onClick={() => run(item)}
                  className={cx('flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-3 py-1.5 text-sm pointer-coarse:min-h-11', selected && 'bg-accent-soft shadow-[inset_3px_0_0_var(--tn-accent)]')}
                >
                  <item.icon size={16} aria-hidden className="shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className={cx('block truncate', selected && 'font-medium')}>{item.label}</span>
                    {item.detail && <span className="block truncate text-xs text-muted">{item.detail}</span>}
                  </span>
                  {item.hint && <span className="max-w-[40%] shrink-0 truncate text-xs text-muted">{item.hint}</span>}
                </li>
              );
            }),
          ];
        })}
      </ul>
      {items.length === 0 && <p className="px-4 pb-4 text-sm text-muted">{t.palette.empty}</p>}
      <p role="status" className="sr-only">
        {searching ? t.palette.count(items.length) : ''}
      </p>
      <p aria-hidden className="border-t border-line bg-sunken/50 px-4 py-2 text-xs text-muted">
        {t.palette.hint}
      </p>
    </dialog>
  );
}
