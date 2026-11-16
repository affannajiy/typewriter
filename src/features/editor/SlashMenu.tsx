import type { Editor } from '@tiptap/core';
import { type CSSProperties, type RefObject, useEffect, useId, useRef, useState } from 'react';
import { cx } from '@/components/ui/Button';
import { t } from '@/i18n/en';
import type { SlashState } from './extensions';

const GAP = 6;
const MENU_HEIGHT = 300;
const MENU_WIDTH = 256;

/** Below the "/" when there is room, above it otherwise. Never off the side of the screen. */
function place(rect: DOMRect | null): CSSProperties {
  if (!rect) return { top: 0, left: 0, visibility: 'hidden' };
  // On a phone the keyboard covers the bottom of the window: use what is visible.
  const height = window.visualViewport?.height ?? window.innerHeight;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8));
  const below = height - rect.bottom;
  if (below < MENU_HEIGHT && rect.top > below) return { left, bottom: window.innerHeight - rect.top + GAP };
  return { left, top: rect.bottom + GAP };
}

interface SlashMenuProps {
  editor: Editor;
  state: SlashState;
  /** The editor sends its key presses here while the menu is open. */
  keysRef: RefObject<(event: KeyboardEvent) => boolean>;
}

/**
 * The list of block types shown after typing "/". Focus stays in the text,
 * so the list is driven from the editor's key presses and announced through
 * `aria-activedescendant` on the editor.
 */
export function SlashMenu({ editor, state, keysRef }: SlashMenuProps) {
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

  // Tell assistive technology which option the arrow keys are on.
  useEffect(() => {
    const dom = editor.view.dom;
    dom.setAttribute('aria-controls', listId);
    if (items[index]) dom.setAttribute('aria-activedescendant', `${listId}-${items[index].id}`);
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
      aria-label={t.editor.slashMenu}
      style={{ ...place(state.rect), width: MENU_WIDTH, maxHeight: MENU_HEIGHT }}
      className="animate-rise fixed z-40 overflow-y-auto rounded-lg border border-line bg-surface p-1 shadow-soft"
    >
      {items.length === 0 && <p className="px-3 py-2 text-sm text-muted">{t.editor.slashEmpty}</p>}
      {items.map((command, i) => (
        // The keyboard reaches these options through the editor (arrows and Enter), not through focus.
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events
        <div
          key={command.id}
          id={`${listId}-${command.id}`}
          role="option"
          tabIndex={-1}
          aria-selected={i === index}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => setActive(i)}
          onClick={() => choose(command)}
          className={cx('flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-3 text-sm text-ink pointer-coarse:min-h-11', i === index && 'bg-accent-soft font-medium')}
        >
          <command.icon size={16} aria-hidden className="shrink-0" />
          {command.label}
        </div>
      ))}
    </div>
  );
}
