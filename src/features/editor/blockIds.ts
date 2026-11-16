import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { DocNode } from '@/types/models';

/**
 * Stable block IDs (ARCHITECTURE.md, decision D1).
 *
 * Every block node carries an `id` attribute that survives edits, moves and
 * reloads, so later features (block links, backlinks, flashcard sources) can
 * point at a block. A block that is split keeps its ID on the first half;
 * a copy gets a new one.
 */

export const BLOCK_TYPES = ['paragraph', 'heading', 'blockquote', 'codeBlock', 'bulletList', 'orderedList', 'taskList', 'listItem', 'taskItem', 'horizontalRule', 'drawing'];

const blockTypes = new Set(BLOCK_TYPES);

export const newBlockId = (): string => crypto.randomUUID();

const usable = (id: unknown, seen: Set<string>): id is string => typeof id === 'string' && id !== '' && !seen.has(id);

/**
 * Returns the document with an ID on every block that has none, or that
 * repeats an earlier one. Documents written before block IDs existed load
 * through this, so they need no migration. The input is not changed.
 */
export function withBlockIds(doc: DocNode, makeId: () => string = newBlockId): DocNode {
  const seen = new Set<string>();
  const visit = (node: DocNode): DocNode => {
    const next: DocNode = { ...node };
    if (blockTypes.has(node.type)) {
      const id = node.attrs?.id;
      if (usable(id, seen)) seen.add(id);
      else next.attrs = { ...node.attrs, id: makeId() };
    }
    if (node.content) next.content = node.content.map(visit);
    return next;
  };
  return visit(doc);
}

/** Adds the `id` attribute to block nodes and keeps it present and unique while editing. */
export const BlockId = Extension.create({
  name: 'blockId',

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_TYPES,
        attributes: {
          id: {
            default: null,
            // The new half of a split block must not inherit the ID.
            keepOnSplit: false,
            parseHTML: (element) => element.getAttribute('data-id'),
            renderHTML: (attributes) => (attributes.id ? { 'data-id': attributes.id as string } : {}),
          },
        },
      },
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('blockId'),
        appendTransaction: (transactions, _oldState, state) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const seen = new Set<string>();
          const tr = state.tr;
          state.doc.descendants((node, pos) => {
            if (!blockTypes.has(node.type.name)) return;
            const id: unknown = node.attrs.id;
            if (usable(id, seen)) seen.add(id);
            else tr.setNodeAttribute(pos, 'id', newBlockId());
          });
          return tr.docChanged ? tr : null;
        },
      }),
    ];
  },
});
