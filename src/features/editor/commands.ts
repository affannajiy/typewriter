import type { ChainedCommands, Editor } from '@tiptap/core';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  type LucideIcon,
  Minus,
  Pilcrow,
  Redo2,
  SquareCode,
  Strikethrough,
  TextQuote,
  Underline,
  Undo2,
} from 'lucide-react';
import { t } from '@/i18n/en';

/**
 * Every formatting command, described once. The toolbar, the slash menu, the
 * block menu and the command palette all read this list, so a command has
 * the same name, icon and shortcut wherever it appears.
 */

export type CommandKind = 'block' | 'insert' | 'mark' | 'history';

export interface EditorCommand {
  id: string;
  label: string;
  icon: LucideIcon;
  kind: CommandKind;
  /** Extra words the slash menu and the palette match, besides the label. */
  keywords: string[];
  /** Written with "Mod" for Ctrl on Windows and Linux, Command on Apple devices. */
  shortcut?: string;
  /** What the toolbar button and the shortcut do: turn on, or off when already on. */
  toggle: (editor: Editor) => void;
  /** Block types only: make the current block this type, whatever it was. */
  turnInto?: (editor: Editor) => void;
  isActive: (editor: Editor) => boolean;
  isEnabled?: (editor: Editor) => boolean;
}

type Step = (chain: ChainedCommands) => ChainedCommands;

const run = (editor: Editor, step: Step) => void step(editor.chain().focus()).run();
/** Lift the block out of any list, quote or code block first, then apply the new type. */
const convert = (editor: Editor, step: Step) => {
  // Clearing a block resets its attributes. The block is still the same block, so it keeps its ID.
  const id: unknown = editor.state.selection.$from.parent.attrs.id;
  step(editor.chain().focus().clearNodes())
    .command(({ tr }) => {
      const { $from } = tr.selection;
      if (typeof id === 'string' && $from.depth > 0 && 'id' in $from.parent.attrs && $from.parent.attrs.id !== id) tr.setNodeAttribute($from.before(), 'id', id);
      return true;
    })
    .run();
};

function block(id: string, label: string, icon: LucideIcon, shortcut: string | undefined, keywords: string[], toggle: Step, set: Step, isActive: (editor: Editor) => boolean): EditorCommand {
  return { id, label, icon, kind: 'block', keywords, shortcut, toggle: (e) => run(e, toggle), turnInto: (e) => convert(e, set), isActive };
}

function mark(id: string, label: string, icon: LucideIcon, shortcut: string, keywords: string[], toggle: Step): EditorCommand {
  return { id, label, icon, kind: 'mark', keywords, shortcut, toggle: (e) => run(e, toggle), isActive: (e) => e.isActive(id) };
}

const inList = (editor: Editor) => editor.isActive('bulletList') || editor.isActive('orderedList') || editor.isActive('taskList');
const heading = (level: 1 | 2 | 3, label: string, icon: LucideIcon) =>
  block(`heading${level}`, label, icon, `Mod+Alt+${level}`, ['heading', 'title', `h${level}`], (c) => c.toggleHeading({ level }), (c) => c.setHeading({ level }), (e) => e.isActive('heading', { level }));

export const EDITOR_COMMANDS: EditorCommand[] = [
  {
    id: 'paragraph',
    label: t.editor.commands.paragraph,
    icon: Pilcrow,
    kind: 'block',
    keywords: ['text', 'plain', 'normal'],
    shortcut: 'Mod+Alt+0',
    toggle: (e) => convert(e, (c) => c),
    turnInto: (e) => convert(e, (c) => c),
    isActive: (e) => e.isActive('paragraph') && !inList(e) && !e.isActive('blockquote'),
  },
  heading(1, t.editor.commands.heading1, Heading1),
  heading(2, t.editor.commands.heading2, Heading2),
  heading(3, t.editor.commands.heading3, Heading3),
  block('bulletList', t.editor.commands.bulletList, List, 'Mod+Shift+8', ['unordered', 'points', 'ul'], (c) => c.toggleBulletList(), (c) => c.toggleBulletList(), (e) => e.isActive('bulletList')),
  block('orderedList', t.editor.commands.orderedList, ListOrdered, 'Mod+Shift+7', ['numbered', 'steps', 'ol'], (c) => c.toggleOrderedList(), (c) => c.toggleOrderedList(), (e) => e.isActive('orderedList')),
  block('taskList', t.editor.commands.taskList, ListChecks, 'Mod+Shift+9', ['todo', 'task', 'checkbox', 'tick'], (c) => c.toggleTaskList(), (c) => c.toggleTaskList(), (e) => e.isActive('taskList')),
  block('blockquote', t.editor.commands.blockquote, TextQuote, 'Mod+Shift+B', ['quote', 'citation'], (c) => c.toggleBlockquote(), (c) => c.setBlockquote(), (e) => e.isActive('blockquote')),
  block('codeBlock', t.editor.commands.codeBlock, SquareCode, 'Mod+Alt+C', ['code', 'snippet', 'pre', 'monospace'], (c) => c.toggleCodeBlock(), (c) => c.setCodeBlock(), (e) => e.isActive('codeBlock')),
  {
    id: 'horizontalRule',
    label: t.editor.commands.divider,
    icon: Minus,
    kind: 'insert',
    keywords: ['divider', 'line', 'rule', 'separator', 'hr'],
    toggle: (e) => run(e, (c) => c.setHorizontalRule()),
    turnInto: (e) => run(e, (c) => c.setHorizontalRule()),
    isActive: () => false,
  },
  mark('bold', t.editor.commands.bold, Bold, 'Mod+B', ['strong'], (c) => c.toggleBold()),
  mark('italic', t.editor.commands.italic, Italic, 'Mod+I', ['emphasis'], (c) => c.toggleItalic()),
  mark('underline', t.editor.commands.underline, Underline, 'Mod+U', [], (c) => c.toggleUnderline()),
  mark('strike', t.editor.commands.strike, Strikethrough, 'Mod+Shift+S', ['strikethrough', 'crossed'], (c) => c.toggleStrike()),
  mark('code', t.editor.commands.inlineCode, Code, 'Mod+E', ['monospace'], (c) => c.toggleCode()),
  {
    id: 'undo',
    label: t.editor.commands.undo,
    icon: Undo2,
    kind: 'history',
    keywords: [],
    shortcut: 'Mod+Z',
    toggle: (e) => run(e, (c) => c.undo()),
    isActive: () => false,
    isEnabled: (e) => e.can().undo(),
  },
  {
    id: 'redo',
    label: t.editor.commands.redo,
    icon: Redo2,
    kind: 'history',
    keywords: [],
    shortcut: 'Mod+Shift+Z',
    toggle: (e) => run(e, (c) => c.redo()),
    isActive: () => false,
    isEnabled: (e) => e.can().redo(),
  },
];

/** The commands that change or insert a block: what the slash menu offers. */
export const BLOCK_COMMANDS = EDITOR_COMMANDS.filter((command) => command.turnInto);

const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

/** Commands whose label or keywords contain every word of the query. An empty query matches all. */
export function filterCommands(commands: EditorCommand[], query: string): EditorCommand[] {
  const words = fold(query).split(/\s+/u).filter(Boolean);
  if (words.length === 0) return commands;
  const scored = commands.flatMap((command) => {
    const label = fold(command.label);
    const haystack = [label, command.id.toLowerCase(), ...command.keywords];
    if (!words.every((word) => haystack.some((entry) => entry.includes(word)))) return [];
    // A label that starts with the query comes first.
    return [{ command, rank: label.startsWith(words[0]!) ? 0 : 1 }];
  });
  return scored.sort((a, b) => a.rank - b.rank).map((entry) => entry.command);
}

const isApple = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/u.test(navigator.platform);

/** "Mod+Shift+8" as the user's keyboard shows it: "Ctrl+Shift+8" or "⌘⇧8". */
export function formatShortcut(shortcut: string, apple = isApple()): string {
  const keys = shortcut.split('+');
  if (!apple) return keys.map((key) => (key === 'Mod' ? 'Ctrl' : key)).join('+');
  const symbols: Record<string, string> = { Mod: '⌘', Shift: '⇧', Alt: '⌥' };
  return keys.map((key) => symbols[key] ?? key).join('');
}
