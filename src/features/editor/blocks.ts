import type { Editor } from '@tiptap/core';
import { closeHistory } from '@tiptap/pm/history';
import { type EditorState, NodeSelection, Selection, type Transaction } from '@tiptap/pm/state';

/**
 * Operations on whole blocks. A "block" here is a top-level node of the
 * document: a paragraph, a heading, a whole list, a quote, a code block or a
 * divider. Each function builds one transaction that starts its own entry
 * in the undo history: one undo reverts exactly that action, never also the
 * typing just before it.
 */

const start = (state: EditorState): Transaction => closeHistory(state.tr);

interface CurrentBlock {
  index: number;
  pos: number;
  size: number;
}

/** The top-level block that holds the selection, or null in an empty spot. */
export function currentBlock(state: EditorState): CurrentBlock | null {
  const { $from } = state.selection;
  const index = $from.index(0);
  if (index >= state.doc.childCount) return null;
  return { index, pos: $from.posAtIndex(index, 0), size: state.doc.child(index).nodeSize };
}

/** Puts the selection at the same place inside a block that now starts at `pos`. */
function selectIn(tr: Transaction, pos: number, offset: number): Transaction {
  const node = tr.doc.nodeAt(pos);
  if (node && node.isAtom) return tr.setSelection(NodeSelection.create(tr.doc, pos));
  const inside = Math.min(pos + Math.max(offset, 1), pos + (node ? node.nodeSize - 1 : 1));
  return tr.setSelection(Selection.near(tr.doc.resolve(inside)));
}

export function canMoveBlock(state: EditorState, direction: -1 | 1): boolean {
  const block = currentBlock(state);
  if (!block) return false;
  const target = block.index + direction;
  return target >= 0 && target < state.doc.childCount;
}

export function moveBlockTr(state: EditorState, direction: -1 | 1): Transaction | null {
  const block = currentBlock(state);
  if (!block || !canMoveBlock(state, direction)) return null;
  const node = state.doc.child(block.index);
  const neighbour = state.doc.child(block.index + direction);
  const offset = state.selection.from - block.pos;
  const target = direction < 0 ? block.pos - neighbour.nodeSize : block.pos + neighbour.nodeSize;
  const tr = start(state).delete(block.pos, block.pos + block.size).insert(target, node);
  return selectIn(tr, target, offset).scrollIntoView();
}

export function duplicateBlockTr(state: EditorState): Transaction | null {
  const block = currentBlock(state);
  if (!block) return null;
  const node = state.doc.child(block.index);
  const target = block.pos + block.size;
  // The copy carries the original's block IDs; the BlockId plugin replaces them.
  const tr = start(state).insert(target, node);
  return selectIn(tr, target, state.selection.from - block.pos).scrollIntoView();
}

export function deleteBlockTr(state: EditorState): Transaction | null {
  const block = currentBlock(state);
  if (!block) return null;
  const end = block.pos + block.size;
  const paragraph = state.schema.nodes.paragraph;
  // A document must keep at least one block.
  const tr = state.doc.childCount === 1 && paragraph ? start(state).replaceWith(block.pos, end, paragraph.create()) : start(state).delete(block.pos, end);
  const near = Math.min(block.pos, tr.doc.content.size);
  return tr.setSelection(Selection.near(tr.doc.resolve(near), block.index === 0 ? 1 : -1)).scrollIntoView();
}

function apply(editor: Editor, tr: Transaction | null): boolean {
  if (!tr) return false;
  editor.view.dispatch(tr);
  editor.view.focus();
  return true;
}

export const moveBlock = (editor: Editor, direction: -1 | 1) => apply(editor, moveBlockTr(editor.state, direction));
export const duplicateBlock = (editor: Editor) => apply(editor, duplicateBlockTr(editor.state));
export const deleteBlock = (editor: Editor) => apply(editor, deleteBlockTr(editor.state));
