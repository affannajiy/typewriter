import type { Editor } from '@tiptap/react';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { IconButton } from '@/components/ui/Button';
import { MAX_QUERY_LENGTH } from '@/features/search/search';
import { t } from '@/i18n/en';
import { findState, setFindQuery, stepFind } from './findInPage';

/** Bring the current match into the middle of the screen. */
function showCurrent(editor: Editor) {
  requestAnimationFrame(() => {
    if (editor.isDestroyed) return;
    editor.view.dom.querySelector('.tn-find-current')?.scrollIntoView?.({ block: 'center' });
  });
}

/**
 * The find bar over the page: the query, "3 of 12", previous and next.
 * Enter goes to the next match, Shift+Enter to the previous one, Escape closes.
 */
export function FindBar({ editor, initial, onClose }: { editor: Editor; initial: string; onClose: () => void }) {
  const [query, setQuery] = useState(initial);
  const [{ current, count }, setPosition] = useState({ current: 0, count: 0 });
  const field = useRef<HTMLInputElement>(null);
  const id = useId();

  // The count follows the text while the writer edits.
  useEffect(() => {
    const read = () => {
      const state = findState(editor.state);
      setPosition({ current: state.current, count: state.matches.length });
    };
    editor.on('transaction', read);
    return () => {
      editor.off('transaction', read);
    };
  }, [editor]);

  useEffect(() => {
    if (editor.isDestroyed) return;
    editor.view.dispatch(setFindQuery(editor.state, query));
    showCurrent(editor);
  }, [editor, query]);

  // Closing clears the highlights.
  useEffect(
    () => () => {
      if (!editor.isDestroyed) editor.view.dispatch(setFindQuery(editor.state, ''));
    },
    [editor],
  );

  // Opened from a search result: the page shows the first match; the field is ready for another word.
  useEffect(() => {
    if (initial === '') field.current?.focus();
  }, [initial]);

  const step = (by: number) => {
    if (editor.isDestroyed) return;
    editor.view.dispatch(stepFind(editor.state, by));
    showCurrent(editor);
  };

  return (
    <div data-chrome role="search" aria-label={t.search.find.label} className="tn-find sticky top-(--tn-topbar) z-10 mb-3 flex items-center gap-1 rounded-lg border border-line-strong bg-surface px-2 py-1 shadow-soft md:top-2">
      <Search size={16} aria-hidden className="ms-1 shrink-0 text-muted" />
      <label htmlFor={id} className="sr-only">
        {t.search.find.label}
      </label>
      <input
        ref={field}
        id={id}
        type="search"
        value={query}
        maxLength={MAX_QUERY_LENGTH}
        placeholder={t.search.find.label}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            step(event.shiftKey ? -1 : 1);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          }
        }}
        className="h-9 min-w-0 flex-1 bg-transparent px-1 text-sm text-ink outline-none placeholder:text-muted/70 [&::-webkit-search-cancel-button]:hidden"
      />
      <output htmlFor={id} aria-live="polite" className="shrink-0 px-1 text-xs text-muted tabular-nums">
        {query.trim() === '' ? '' : t.search.find.position(count === 0 ? 0 : current + 1, count)}
      </output>
      <IconButton icon={ChevronUp} label={t.search.find.previous} disabled={count === 0} onClick={() => step(-1)} />
      <IconButton icon={ChevronDown} label={t.search.find.next} disabled={count === 0} onClick={() => step(1)} />
      <IconButton icon={X} label={t.search.find.close} onClick={onClose} />
    </div>
  );
}
