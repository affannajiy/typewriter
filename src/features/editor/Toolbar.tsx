import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { ArrowDown, ArrowUp, Copy, GripVertical, Trash2 } from 'lucide-react';
import { type KeyboardEvent, useRef, useState } from 'react';
import { IconButton, cx } from '@/components/ui/Button';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { useToast } from '@/components/ui/Toast';
import { t } from '@/i18n/en';
import { canMoveBlock, deleteBlock, duplicateBlock, moveBlock } from './blocks';
import { EDITOR_COMMANDS, type EditorCommand, formatShortcut } from './commands';

const byId = (id: string) => EDITOR_COMMANDS.find((command) => command.id === id)!;

/** Buttons in reading order. Each inner list is one visual group. */
const GROUPS: EditorCommand[][] = [
  ['undo', 'redo'],
  ['bold', 'italic', 'underline', 'code'],
  ['heading1', 'heading2', 'heading3'],
  ['bulletList', 'orderedList', 'taskList'],
  ['blockquote', 'codeBlock', 'horizontalRule', 'drawing'],
].map((group) => group.map(byId));

const BUTTONS = GROUPS.flat();
/** Position of each group's first button in the flat list. */
const GROUP_START = GROUPS.map((_, index) => GROUPS.slice(0, index).reduce((count, group) => count + group.length, 0));
const TURN_INTO = EDITOR_COMMANDS.filter((command) => command.kind === 'block');

const withShortcut = (command: EditorCommand) => (command.shortcut ? t.editor.withShortcut(command.label, formatShortcut(command.shortcut)) : command.label);

/**
 * The formatting toolbar. It is one tab stop: the arrow keys, Home and End
 * move between its buttons (the ARIA toolbar pattern), so the keyboard path
 * from the title to the text stays short.
 */
export function Toolbar({ editor }: { editor: Editor }) {
  const toast = useToast();
  const strip = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);

  // One short string, so the toolbar re-renders only when a button's state changes.
  const flags = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      BUTTONS.map((command) => (command.isActive(e) ? 'a' : '-') + (command.isEnabled?.(e) === false ? 'd' : 'e')).join('') +
      TURN_INTO.map((command) => (command.isActive(e) ? 'a' : '-')).join('') +
      (canMoveBlock(e.state, -1) ? 'u' : '-') +
      (canMoveBlock(e.state, 1) ? 'd' : '-'),
  });
  const turnFlags = flags.slice(BUTTONS.length * 2);

  const onKeyDown = (event: KeyboardEvent) => {
    const buttons = Array.from(strip.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const step = (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0) * (rtl ? -1 : 1);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : step ? (index + step + buttons.length) % buttons.length : -1;
    if (next < 0) return;
    event.preventDefault();
    setCurrent(next);
    buttons[next]?.focus();
  };

  const blockItems: MenuItem[] = [
    { id: 'up', label: t.editor.block.moveUp, icon: ArrowUp, disabled: flags.at(-2) !== 'u', onSelect: () => moveBlock(editor, -1) },
    { id: 'down', label: t.editor.block.moveDown, icon: ArrowDown, disabled: flags.at(-1) !== 'd', onSelect: () => moveBlock(editor, 1) },
    { id: 'duplicate', label: t.editor.block.duplicate, icon: Copy, onSelect: () => duplicateBlock(editor) },
    {
      id: 'delete',
      label: t.editor.block.delete,
      icon: Trash2,
      danger: true,
      onSelect: () => {
        // Deleting is one step in the editor's history, so it can be taken back.
        if (deleteBlock(editor)) toast({ message: t.editor.block.deleted, action: { label: t.common.undo, run: () => editor.chain().focus().undo().run() } });
      },
    },
    ...TURN_INTO.map((command, index) => ({
      id: `turn-${command.id}`,
      label: t.editor.block.turnInto(command.label),
      icon: command.icon,
      disabled: turnFlags[index] === 'a',
      onSelect: () => command.turnInto?.(editor),
    })),
  ];

  return (
    <div className="tn-toolbar sticky z-30 -mx-1 mb-3 flex items-center gap-1 border-b border-line bg-bg py-1">
      {/* Arrow keys move inside the toolbar; the buttons themselves handle activation. */}
      <div ref={strip} role="toolbar" aria-label={t.editor.toolbar} onKeyDown={onKeyDown} className="flex min-w-0 flex-1 items-center overflow-x-auto px-1 py-0.5 [scrollbar-width:thin]">
        {GROUPS.map((group, groupIndex) => (
          <div key={groupIndex} className={cx('flex shrink-0 items-center', groupIndex > 0 && 'ms-1 border-s border-line ps-1')}>
            {group.map((command, place) => {
              const index = GROUP_START[groupIndex]! + place;
              const active = flags[index * 2] === 'a';
              const unavailable = flags[index * 2 + 1] === 'd';
              const toggles = command.kind === 'block' || command.kind === 'mark';
              return (
                <IconButton
                  key={command.id}
                  icon={command.icon}
                  label={withShortcut(command)}
                  pressed={toggles ? active : undefined}
                  // Not the `disabled` attribute: a disabled button cannot hold the toolbar's tab stop.
                  aria-disabled={unavailable || undefined}
                  tabIndex={index === current ? 0 : -1}
                  // Keep the selection in the text while the button is pressed.
                  onMouseDown={(event) => event.preventDefault()}
                  onFocus={() => setCurrent(index)}
                  onClick={() => !unavailable && command.toggle(editor)}
                  className={cx('aria-disabled:cursor-not-allowed aria-disabled:opacity-50', active && 'bg-accent-soft shadow-[inset_0_-2px_0_var(--tn-accent)]')}
                />
              );
            })}
          </div>
        ))}
      </div>
      <Menu label={t.editor.blockMenu} icon={GripVertical} items={blockItems} />
    </div>
  );
}
