import type { Editor } from '@tiptap/core';
import { FilePlus, FileText } from 'lucide-react';
import { type CSSProperties, type RefObject, useEffect, useId, useRef, useState } from 'react';
import { cx } from '@/components/ui/Button';
import { t } from '@/i18n/en';
import type { LinkChoice, LinkMenuState } from './pageLinkNode';

const GAP = 6;
const MENU_HEIGHT = 300;
const MENU_WIDTH = 300;

function place(rect: DOMRect | null): CSSProperties {
  if (!rect) return { top: 0, left: 0, visibility: 'hidden' };
  const height = window.visualViewport?.height ?? window.innerHeight;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8));
  const below = height - rect.bottom;
  if (below < MENU_HEIGHT && rect.top > below) return { left, bottom: window.innerHeight - rect.top + GAP };
  return { left, top: rect.bottom + GAP };
}

const keyOf = (choice: LinkChoice) => (choice.kind === 'page' ? choice.target.id : 'create');

/**
 * Pages to link to, shown after typing "[[". Like the slash menu, focus stays
 * in the text: the editor passes the arrow keys and Enter here.
 */
export function PageLinkMenu({ editor, state, keysRef }: { editor: Editor; state: LinkMenuState; keysRef: RefObject<(event: KeyboardEvent) => boolean> }) {
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const { items, choose } = state;
  const index = Math.min(active, Math.max(items.length - 1, 0));

  useEffect(() => {
    keysRef.current = (event) => {
      if (items.length === 0) return false;
      if (event.key === 'ArrowDown') setActive((index + 1) % items.length);
      else if (event.key === 'ArrowUp') setActive((index - 1 + items.length) % items.length);
      else if (event.key === 'Enter' || event.key === 'Tab') choose(items[index]!);
      else return false;
      return true;
    };
    return () => {
      keysRef.current = () => false;
    };
  }, [keysRef, items, index, choose]);

  useEffect(() => {
    const dom = editor.view.dom;
    dom.setAttribute('aria-controls', listId);
    if (items[index]) dom.setAttribute('aria-activedescendant', `${listId}-${keyOf(items[index])}`);
    else dom.removeAttribute('aria-activedescendant');
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
    return () => {
      dom.removeAttribute('aria-controls');
      dom.removeAttribute('aria-activedescendant');
    };
  }, [editor, listId, items, index]);

  return (
    <div
      ref={listRef}
      id={listId}
      role="listbox"
      aria-label={t.links.menu}
      style={{ ...place(state.rect), width: MENU_WIDTH, maxHeight: MENU_HEIGHT }}
      className="animate-rise fixed z-40 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-soft"
    >
      {items.length === 0 && <p className="px-3 py-2 text-sm text-muted">{t.links.menuEmpty}</p>}
      {items.map((choice, i) => (
        // The keyboard reaches these options through the editor (arrows and Enter), not through focus.
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events
        <div
          key={keyOf(choice)}
          id={`${listId}-${keyOf(choice)}`}
          role="option"
          tabIndex={-1}
          aria-selected={i === index}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActive(i)}
          onClick={() => choose(choice)}
          className={cx('flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-3 py-1 text-sm text-ink pointer-coarse:min-h-11', i === index && 'bg-accent-soft')}
        >
          {choice.kind === 'page' ? <FileText size={16} aria-hidden className="shrink-0 text-muted" /> : <FilePlus size={16} aria-hidden className="shrink-0 text-muted" />}
          <span className="min-w-0 flex-1">
            <span className={cx('block truncate', i === index && 'font-medium')}>{choice.kind === 'page' ? choice.target.title : t.links.create(choice.title)}</span>
            {choice.kind === 'page' && choice.target.location && <span className="block truncate text-xs text-muted">{choice.target.location}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
