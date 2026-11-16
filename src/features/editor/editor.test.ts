import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { docToPlainText } from '@/database/repositories/pages';
import { textToDoc } from '@/features/pages/plainDoc';
import type { DocNode } from '@/types/models';
import { withBlockIds } from './blockIds';
import { canMoveBlock, currentBlock, deleteBlockTr, duplicateBlockTr, moveBlockTr } from './blocks';
import { BLOCK_COMMANDS, EDITOR_COMMANDS, filterCommands, formatShortcut } from './commands';
import { isReadableDoc, schemaExtensions } from './extensions';
import { PAGE_GAP, geometryFor, paginate, sheetFor } from './pagination';

const editors: Editor[] = [];

function makeEditor(content: DocNode | string): Editor {
  const editor = new Editor({ element: document.createElement('div'), extensions: schemaExtensions(), content });
  editors.push(editor);
  return editor;
}

afterEach(() => {
  editors.splice(0).forEach((editor) => editor.destroy());
});

const p = (text: string, id?: string): DocNode => ({ type: 'paragraph', ...(id ? { attrs: { id } } : {}), content: [{ type: 'text', text }] });
const doc = (...content: DocNode[]): DocNode => ({ type: 'doc', content });

/** Texts of the top-level blocks, in order. */
const texts = (editor: Editor) => editor.state.doc.content.content.map((node) => node.textContent);
/** Every block ID in the document, in order. */
function ids(editor: Editor): string[] {
  const found: string[] = [];
  editor.state.doc.descendants((node) => {
    if ('id' in node.attrs) found.push(node.attrs.id as string);
  });
  return found;
}
const command = (id: string) => EDITOR_COMMANDS.find((c) => c.id === id)!;

describe('documents written before the editor', () => {
  it('load unchanged: one paragraph per line, no migration', () => {
    const legacy = textToDoc('Saturated hydrocarbons.\n\nGeneral formula CnH2n+2.');
    expect(isReadableDoc(legacy)).toBe(true);
    const editor = makeEditor(withBlockIds(legacy));
    expect(texts(editor)).toEqual(['Saturated hydrocarbons.', '', 'General formula CnH2n+2.']);
    expect(docToPlainText(editor.getJSON() as DocNode)).toBe('Saturated hydrocarbons.\n\nGeneral formula CnH2n+2.');
  });

  it('opening a document is not an edit', () => {
    let updates = 0;
    const editor = new Editor({ element: document.createElement('div'), extensions: schemaExtensions(), content: withBlockIds(textToDoc('One\nTwo')), onUpdate: () => updates++ });
    editors.push(editor);
    expect(updates).toBe(0);
  });
});

describe('unreadable documents', () => {
  it('refuses a node type this version does not know', () => {
    expect(isReadableDoc(doc(p('fine'), { type: 'hologram', content: [{ type: 'text', text: 'from the future' }] }))).toBe(false);
  });
  it('refuses an unknown mark', () => {
    expect(isReadableDoc(doc({ type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'sparkle' }] }] }))).toBe(false);
  });
  it('refuses a structure the schema forbids', () => {
    expect(isReadableDoc({ type: 'doc', content: [{ type: 'text', text: 'loose text' }] })).toBe(false);
  });
  it('accepts every block type the editor can make', () => {
    const editor = makeEditor('<h1>a</h1><ul><li><p>b</p></li></ul><ol><li><p>c</p></li></ol><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>d</p></li></ul><blockquote><p>e</p></blockquote><pre><code>f</code></pre><hr><p><strong>g</strong><em>h</em><u>i</u><code>j</code></p>');
    const json = editor.getJSON() as DocNode;
    expect(json.content?.map((node) => node.type)).toEqual(['heading', 'bulletList', 'orderedList', 'taskList', 'blockquote', 'codeBlock', 'horizontalRule', 'paragraph']);
    expect(isReadableDoc(json)).toBe(true);
  });
});

describe('block IDs', () => {
  it('withBlockIds fills missing IDs, keeps existing ones and replaces repeats', () => {
    let n = 0;
    const input = doc(p('a', 'keep'), p('b'), p('c', 'keep'));
    const output = withBlockIds(input, () => `new-${++n}`);
    expect(output.content?.map((node) => node.attrs?.id)).toEqual(['keep', 'new-1', 'new-2']);
    // The input is not changed.
    expect(input.content?.[1]?.attrs).toBeUndefined();
  });

  it('reaches nested blocks', () => {
    const editor = makeEditor('<ul><li><p>one</p></li><li><p>two</p></li></ul>');
    const output = withBlockIds(editor.getJSON() as DocNode);
    const found: unknown[] = [];
    const walk = (node: DocNode) => {
      if (node.type !== 'doc' && node.type !== 'text') found.push(node.attrs?.id);
      node.content?.forEach(walk);
    };
    walk(output);
    // bulletList, 2 × (listItem + paragraph)
    expect(found).toHaveLength(5);
    expect(new Set(found).size).toBe(5);
    expect(found.every((id) => typeof id === 'string' && id.length > 0)).toBe(true);
  });

  it('a split block keeps its ID on the first half and the new half gets its own', () => {
    const editor = makeEditor(doc(p('HelloWorld', 'original')));
    editor.commands.setTextSelection(6);
    editor.commands.splitBlock();
    expect(texts(editor)).toEqual(['Hello', 'World']);
    const [first, second] = ids(editor);
    expect(first).toBe('original');
    expect(second).toBeTruthy();
    expect(second).not.toBe('original');
  });

  it('IDs survive an edit and a save-and-load round trip', () => {
    const editor = makeEditor(doc(p('one', 'a'), p('two', 'b')));
    editor.commands.insertContentAt(4, '!');
    const reloaded = makeEditor(withBlockIds(JSON.parse(JSON.stringify(editor.getJSON())) as DocNode));
    expect(ids(reloaded)).toEqual(['a', 'b']);
    expect(texts(reloaded)).toEqual(['one!', 'two']);
  });

  it('pasted or typed content with no ID is given one', () => {
    const editor = makeEditor(doc(p('one', 'a')));
    editor.commands.insertContentAt(editor.state.doc.content.size, '<p>two</p><h2>three</h2>');
    const all = ids(editor);
    // Three blocks, plus the empty paragraph the editor keeps after a final heading.
    expect(all.length).toBeGreaterThanOrEqual(3);
    expect(new Set(all).size).toBe(all.length);
    expect(all.every(Boolean)).toBe(true);
  });
});

describe('block operations', () => {
  const three = () => makeEditor(doc(p('one', 'a'), p('two', 'b'), p('three', 'c')));
  const apply = (editor: Editor, tr: ReturnType<typeof moveBlockTr>) => {
    expect(tr).not.toBeNull();
    editor.view.dispatch(tr!);
  };

  it('finds the block that holds the caret', () => {
    const editor = three();
    editor.commands.setTextSelection(7);
    expect(currentBlock(editor.state)).toMatchObject({ index: 1, pos: 5 });
  });

  it('moves a block up and down with its ID, and keeps the caret in it', () => {
    const editor = three();
    editor.commands.setTextSelection(7);
    apply(editor, moveBlockTr(editor.state, -1));
    expect(texts(editor)).toEqual(['two', 'one', 'three']);
    expect(ids(editor)).toEqual(['b', 'a', 'c']);
    expect(currentBlock(editor.state)?.index).toBe(0);
    apply(editor, moveBlockTr(editor.state, 1));
    apply(editor, moveBlockTr(editor.state, 1));
    expect(texts(editor)).toEqual(['one', 'three', 'two']);
    expect(currentBlock(editor.state)?.index).toBe(2);
  });

  it('does not move past the first or last place', () => {
    const editor = three();
    editor.commands.setTextSelection(2);
    expect(canMoveBlock(editor.state, -1)).toBe(false);
    expect(moveBlockTr(editor.state, -1)).toBeNull();
    editor.commands.setTextSelection(12);
    expect(canMoveBlock(editor.state, 1)).toBe(false);
  });

  it('duplicates a block below itself, and the copy gets a new ID', () => {
    const editor = three();
    editor.commands.setTextSelection(7);
    apply(editor, duplicateBlockTr(editor.state));
    expect(texts(editor)).toEqual(['one', 'two', 'two', 'three']);
    const all = ids(editor);
    expect(all[1]).toBe('b');
    expect(new Set(all).size).toBe(4);
    expect(currentBlock(editor.state)?.index).toBe(2);
  });

  it('duplicates a whole list as one block, with new IDs inside', () => {
    const editor = makeEditor('<ul><li><p>one</p></li><li><p>two</p></li></ul>');
    editor.commands.setTextSelection(4);
    // Give the first list its IDs, as the page screen does.
    editor.commands.setContent(withBlockIds(editor.getJSON() as DocNode));
    editor.commands.setTextSelection(4);
    apply(editor, duplicateBlockTr(editor.state));
    const lists = editor.state.doc.content.content.filter((node) => node.type.name === 'bulletList');
    expect(lists.map((node) => node.textContent)).toEqual(['onetwo', 'onetwo']);
    // The editor may add an empty paragraph after a list; every block ID is still distinct.
    const all = ids(editor);
    expect(all.length).toBeGreaterThanOrEqual(10);
    expect(new Set(all).size).toBe(all.length);
  });

  it('deletes a block, and one undo brings it back', () => {
    const editor = three();
    editor.commands.setTextSelection(7);
    apply(editor, deleteBlockTr(editor.state));
    expect(texts(editor)).toEqual(['one', 'three']);
    editor.commands.undo();
    expect(texts(editor)).toEqual(['one', 'two', 'three']);
    expect(ids(editor)).toEqual(['a', 'b', 'c']);
  });

  it('deleting the only block leaves an empty paragraph', () => {
    const editor = makeEditor(doc(p('alone', 'a')));
    apply(editor, deleteBlockTr(editor.state));
    expect(editor.state.doc.childCount).toBe(1);
    expect(texts(editor)).toEqual(['']);
  });
});

describe('commands', () => {
  it('turns a block into another type and back to text', () => {
    const editor = makeEditor(doc(p('title', 'a')));
    command('heading2').turnInto?.(editor);
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 2, id: 'a' } });
    expect(command('heading2').isActive(editor)).toBe(true);
    command('paragraph').turnInto?.(editor);
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: 'paragraph', attrs: { id: 'a' } });
  });

  it('turns a list item into a heading by lifting it out of the list', () => {
    const editor = makeEditor('<ul><li><p>item</p></li></ul>');
    editor.commands.setTextSelection(4);
    command('heading1').turnInto?.(editor);
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } });
    expect(editor.state.doc.textContent).toBe('item');
  });

  it('converts between list kinds and makes a checklist', () => {
    const editor = makeEditor(doc(p('milk', 'a')));
    command('bulletList').turnInto?.(editor);
    expect(editor.isActive('bulletList')).toBe(true);
    command('taskList').turnInto?.(editor);
    expect(editor.isActive('taskList')).toBe(true);
    expect(editor.isActive('bulletList')).toBe(false);
    expect(editor.state.doc.textContent).toBe('milk');
  });

  it('toggles marks on a selection', () => {
    const editor = makeEditor(doc(p('bold move', 'a')));
    editor.commands.setTextSelection({ from: 1, to: 5 });
    for (const id of ['bold', 'italic', 'underline', 'code']) {
      command(id).toggle(editor);
      expect(command(id).isActive(editor), id).toBe(true);
      command(id).toggle(editor);
      expect(command(id).isActive(editor), id).toBe(false);
    }
  });

  it('inserts a divider', () => {
    const editor = makeEditor(doc(p('above', 'a')));
    command('horizontalRule').toggle(editor);
    expect(editor.getJSON().content?.map((node) => node.type)).toContain('horizontalRule');
  });

  it('undo is unavailable until there is something to undo', () => {
    const editor = makeEditor(doc(p('text', 'a')));
    expect(command('undo').isEnabled?.(editor)).toBe(false);
    command('bold').toggle(editor);
    editor.commands.insertContent('x');
    expect(command('undo').isEnabled?.(editor)).toBe(true);
  });

  it('every command has a distinct ID and a label', () => {
    expect(new Set(EDITOR_COMMANDS.map((c) => c.id)).size).toBe(EDITOR_COMMANDS.length);
    expect(EDITOR_COMMANDS.every((c) => c.label.length > 0)).toBe(true);
  });

  it('the slash menu filters by label and keyword, ignoring case and accents', () => {
    expect(filterCommands(BLOCK_COMMANDS, '').length).toBe(BLOCK_COMMANDS.length);
    expect(filterCommands(BLOCK_COMMANDS, 'head').map((c) => c.id)).toEqual(['heading1', 'heading2', 'heading3']);
    expect(filterCommands(BLOCK_COMMANDS, 'TODO').map((c) => c.id)).toEqual(['taskList']);
    expect(filterCommands(BLOCK_COMMANDS, 'h2').map((c) => c.id)).toEqual(['heading2']);
    expect(filterCommands(BLOCK_COMMANDS, 'quôte').map((c) => c.id)).toEqual(['blockquote']);
    expect(filterCommands(BLOCK_COMMANDS, 'zzz')).toEqual([]);
    // A label that starts with the query comes before a keyword match.
    expect(filterCommands(BLOCK_COMMANDS, 'code')[0]?.id).toBe('codeBlock');
  });

  it('shows shortcuts the way the keyboard is labelled', () => {
    expect(formatShortcut('Mod+Shift+8', false)).toBe('Ctrl+Shift+8');
    expect(formatShortcut('Mod+Alt+1', true)).toBe('⌘⌥1');
  });
});

describe('plain text of a rich document', () => {
  it('has one line per block, including list items and line breaks', () => {
    const editor = makeEditor('<h1>Title</h1><ul><li><p>one</p></li><li><p>two</p></li></ul><p>a<br>b</p><blockquote><p>quoted</p></blockquote>');
    expect(docToPlainText(editor.getJSON() as DocNode)).toBe('Title\none\ntwo\na\nb\nquoted');
  });
});

describe('paginated layout', () => {
  const geometry = { contentHeight: 900, stride: 1100 };
  const stack = (heights: number[]) => {
    let top = 0;
    return heights.map((height) => {
      const block = { top, height };
      top += height;
      return block;
    });
  };

  it('needs no break while everything fits on one sheet', () => {
    expect(paginate(stack([300, 300, 300]), geometry)).toEqual({ spacers: [0, 0, 0], pages: 1 });
  });

  it('moves a block that would cross the bottom margin to the next sheet', () => {
    const result = paginate(stack([400, 400, 200, 100]), geometry);
    // The third block would end at 1000 > 900: it starts the second sheet at 1100.
    expect(result.spacers).toEqual([0, 0, 300, 0]);
    expect(result.pages).toBe(2);
  });

  it('breaks again on every later sheet', () => {
    const result = paginate(stack(Array.from({ length: 10 }, () => 400)), geometry);
    expect(result.spacers).toEqual([0, 0, 300, 0, 300, 0, 300, 0, 300, 0]);
    expect(result.pages).toBe(5);
  });

  it('no block that fits on a sheet ever crosses a sheet edge', () => {
    const heights = [120, 340, 80, 560, 30, 30, 700, 250, 899, 10, 400, 400, 400];
    const blocks = stack(heights);
    const { spacers } = paginate(blocks, geometry);
    let pushed = 0;
    blocks.forEach((block, index) => {
      pushed += spacers[index]!;
      const onPage = (block.top + pushed) % geometry.stride;
      expect(onPage + block.height, `block ${index}`).toBeLessThanOrEqual(geometry.contentHeight);
    });
  });

  it('lets a block taller than a sheet run over, and continues after it', () => {
    const result = paginate(stack([100, 2000, 100]), geometry);
    expect(result.spacers[1]).toBe(0);
    // The block after it starts on a fresh sheet if it landed in a margin.
    expect(result.pages).toBeGreaterThanOrEqual(2);
  });

  it('a block that ends exactly on the last line stays on its sheet', () => {
    expect(paginate(stack([450, 450]), geometry)).toEqual({ spacers: [0, 0], pages: 1 });
  });

  it('an empty document is one sheet', () => {
    expect(paginate([], geometry)).toEqual({ spacers: [], pages: 1 });
  });

  it('scales the sheet and its margins to the space available', () => {
    expect(sheetFor('a4', 'normal', 1000)).toEqual({ width: 794, height: 1123, margin: 96 });
    const small = sheetFor('a4', 'normal', 397);
    expect(small).toEqual({ width: 397, height: 562, margin: 48 });
    expect(sheetFor('letter', 'wide', 0)).toEqual({ width: 816, height: 1056, margin: 144 });
    expect(geometryFor(small)).toEqual({ contentHeight: 562 - 96, stride: 562 + PAGE_GAP });
  });
});

describe('drawing blocks', () => {
  const drawing = (drawingId: string, id?: string): DocNode => ({ type: 'drawing', attrs: { drawingId, ...(id ? { id } : {}) } });
  const drawingIds = (editor: Editor) => editor.state.doc.content.content.filter((node) => node.type.name === 'drawing').map((node) => node.attrs.drawingId as string);

  it('are part of the schema, carry a block ID and add no text', () => {
    const stored = doc(p('Before'), drawing('d1', 'b1'), p('After'));
    expect(isReadableDoc(stored)).toBe(true);
    expect(docToPlainText(stored)).toBe('Before\nAfter');
    const editor = makeEditor(stored);
    expect(drawingIds(editor)).toEqual(['d1']);
    expect(ids(editor)).toContain('b1');
  });

  it('a duplicated drawing gets its own drawing ID and asks for a copy of the strokes', async () => {
    const copies: [string, string][] = [];
    const editor = new Editor({
      element: document.createElement('div'),
      extensions: schemaExtensions({ onCopy: (from, to) => copies.push([from, to]) }),
      content: doc(drawing('d1', 'b1'), p('After')),
    });
    editors.push(editor);
    editor.commands.setNodeSelection(0);
    editor.view.dispatch(duplicateBlockTr(editor.state)!);
    const [original, copy] = drawingIds(editor);
    expect(original).toBe('d1');
    expect(copy).not.toBe('d1');
    await Promise.resolve();
    expect(copies).toEqual([['d1', copy]]);
    // Undo removes the copy again; the original is untouched.
    editor.commands.undo();
    expect(drawingIds(editor)).toEqual(['d1']);
  });

  it('the insert command adds an empty drawing and opens it; the slash menu offers it', async () => {
    const opened: string[] = [];
    const editor = new Editor({ element: document.createElement('div'), extensions: schemaExtensions({ onOpen: (id) => opened.push(id) }), content: doc(p('')) });
    editors.push(editor);
    command('drawing').turnInto!(editor);
    const [id] = drawingIds(editor);
    expect(id).toEqual(expect.any(String));
    await Promise.resolve();
    expect(opened).toEqual([id]);
    expect(filterCommands(BLOCK_COMMANDS, 'sketch').map((c) => c.id)).toEqual(['drawing']);
    // Only asking whether it could run must not open anything.
    expect(editor.can().insertDrawing()).toBe(true);
    await Promise.resolve();
    expect(opened).toHaveLength(1);
  });

  it('Enter on a selected drawing opens it', () => {
    const opened: string[] = [];
    const editor = new Editor({ element: document.createElement('div'), extensions: schemaExtensions({ onOpen: (id) => opened.push(id) }), content: doc(drawing('d1'), p('After')) });
    editors.push(editor);
    editor.commands.setNodeSelection(0);
    editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, new KeyboardEvent('keydown', { key: 'Enter' })));
    expect(opened).toEqual(['d1']);
  });
});
