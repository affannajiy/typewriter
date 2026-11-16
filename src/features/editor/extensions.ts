import { type AnyExtension, Extension, getSchema } from '@tiptap/core';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';
import { Suggestion, type SuggestionProps } from '@tiptap/suggestion';
import { t } from '@/i18n/en';
import type { DocNode } from '@/types/models';
import { BlockId } from './blockIds';
import { duplicateBlock, moveBlock } from './blocks';
import { BLOCK_COMMANDS, type EditorCommand, filterCommands } from './commands';
import { Pagination, type PaginationOptions } from './pagination';

/** What the slash menu shows. Null when it is closed. */
export interface SlashState {
  items: EditorCommand[];
  /** Where the "/" is on screen, for placing the menu. */
  rect: DOMRect | null;
  choose: (command: EditorCommand) => void;
}

/** How the editor's slash plugin talks to the React menu. */
export interface SlashBridge {
  onChange: (state: SlashState | null) => void;
  /** Returns true when the menu used the key (arrows, Enter). */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

const toSlashState = (props: SuggestionProps<EditorCommand, EditorCommand>): SlashState => ({
  items: props.items,
  rect: props.clientRect?.() ?? null,
  choose: (command) => props.command(command),
});

/** Typing "/" opens a menu of block types, filtered by what is typed after it. */
const SlashCommands = Extension.create<{ bridge: SlashBridge }>({
  name: 'slashCommands',

  addOptions() {
    return { bridge: { onChange: () => {}, onKeyDown: () => false } };
  },

  addProseMirrorPlugins() {
    const { bridge } = this.options;
    return [
      Suggestion<EditorCommand, EditorCommand>({
        editor: this.editor,
        char: '/',
        // Code is typed literally: a path such as /usr/bin must not open a menu.
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          return !$from.parent.type.spec.code && !$from.marks().some((mark) => mark.type.spec.code);
        },
        items: ({ query }) => filterCommands(BLOCK_COMMANDS, query),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run();
          props.turnInto?.(editor);
        },
        render: () => ({
          onStart: (props) => bridge.onChange(toSlashState(props)),
          onUpdate: (props) => bridge.onChange(toSlashState(props)),
          onKeyDown: ({ event }) => bridge.onKeyDown(event),
          onExit: () => bridge.onChange(null),
        }),
      }),
    ];
  },
});

/** Shortcuts for whole blocks. The formatting shortcuts come with their extensions. */
const BlockKeymap = Extension.create({
  name: 'blockKeymap',
  addKeyboardShortcuts() {
    return {
      'Alt-Shift-ArrowUp': () => moveBlock(this.editor, -1),
      'Alt-Shift-ArrowDown': () => moveBlock(this.editor, 1),
      'Mod-Shift-d': () => duplicateBlock(this.editor),
    };
  },
});

export const BLOCK_SHORTCUTS = { moveUp: 'Alt+Shift+↑', moveDown: 'Alt+Shift+↓', duplicate: 'Mod+Shift+D' };

/** The document schema: the same list everywhere a document is read or checked. */
export function schemaExtensions(): AnyExtension[] {
  return [
    // Links need their own interface (open, edit, remove). Until it exists, pasted addresses stay plain text.
    StarterKit.configure({ link: false, heading: { levels: [1, 2, 3] } }),
    TaskList,
    TaskItem.configure({ nested: true, a11y: { checkboxLabel: (_node, checked) => (checked ? t.editor.taskDone : t.editor.taskNotDone) } }),
    BlockId,
  ];
}

let schema: ReturnType<typeof getSchema> | null = null;

/**
 * True when this version of the editor can show the whole document. A
 * document from a newer version, or a damaged one, may hold node types this
 * schema does not know. Opening it in the editor would drop them, and the
 * next autosave would then overwrite the stored page. The page screen shows
 * such a page read-only instead.
 */
export function isReadableDoc(doc: DocNode): boolean {
  try {
    schema ??= getSchema(schemaExtensions());
    schema.nodeFromJSON(doc).check();
    return true;
  } catch {
    return false;
  }
}

export interface EditorWiring {
  slash: SlashBridge;
  pagination: PaginationOptions;
}

export function editorExtensions(wiring: EditorWiring): AnyExtension[] {
  return [
    ...schemaExtensions(),
    Placeholder.configure({ placeholder: t.page.bodyPlaceholder }),
    SlashCommands.configure({ bridge: wiring.slash }),
    BlockKeymap,
    Pagination.configure(wiring.pagination),
  ];
}
