import { Node, mergeAttributes } from '@tiptap/core';
import { NodeSelection, Plugin, PluginKey } from '@tiptap/pm/state';
import { type ReactNodeViewProps, ReactNodeViewRenderer } from '@tiptap/react';
import type { ComponentType } from 'react';
import type { Id } from '@/types/models';

/**
 * The drawing block. The page's document holds only the drawing's ID; the
 * strokes are a row of their own (DATA_MODEL.md), so typing in the page does
 * not rewrite them and a large drawing does not slow the autosave.
 */

export interface DrawingNodeOptions {
  /** The page that holds the document. Null where no page is known (checks, tests). */
  pageId: Id | null;
  /** Shows the block in the editor. Left out where only the schema is needed. */
  view: ComponentType<ReactNodeViewProps> | null;
  /** Opens the full-screen drawing editor. */
  onOpen: (drawingId: Id) => void;
  /** A block was copied: give the copy its own strokes. */
  onCopy: (fromId: Id, toId: Id) => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    drawing: {
      /** Inserts an empty drawing at the selection and opens it. */
      insertDrawing: () => ReturnType;
    };
  }
}

export const newDrawingId = (): Id => crypto.randomUUID();

export const DrawingNode = Node.create<DrawingNodeOptions>({
  name: 'drawing',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { pageId: null, view: null, onOpen: () => {}, onCopy: () => {} };
  },

  addAttributes() {
    return {
      drawingId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-drawing-id'),
        renderHTML: (attributes) => (attributes.drawingId ? { 'data-drawing-id': attributes.drawingId as string } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-drawing-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-type': 'drawing' })];
  },

  addNodeView() {
    const { view } = this.options;
    return view ? ReactNodeViewRenderer(view) : null;
  },

  addCommands() {
    return {
      insertDrawing:
        () =>
        ({ commands, dispatch }) => {
          const drawingId = newDrawingId();
          const inserted = commands.insertContent({ type: this.name, attrs: { drawingId } });
          // Open only when the command really ran, not when the editor only asked whether it could.
          if (inserted && dispatch) queueMicrotask(() => this.options.onOpen(drawingId));
          return inserted;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Enter on a selected drawing opens it, as a click on its button does.
      Enter: ({ editor }) => {
        const { selection } = editor.state;
        if (!(selection instanceof NodeSelection) || selection.node.type.name !== this.name) return false;
        const id: unknown = selection.node.attrs.drawingId;
        if (typeof id !== 'string' || !editor.isEditable) return false;
        this.options.onOpen(id);
        return true;
      },
    };
  },

  addProseMirrorPlugins() {
    const { name, options } = this;
    return [
      new Plugin({
        key: new PluginKey('drawingIds'),
        // A duplicated or pasted block arrives with the original's drawing ID.
        // The later one gets a new ID and a copy of the strokes, so drawing in
        // one never changes the other.
        appendTransaction: (transactions, _oldState, state) => {
          if (!transactions.some((transaction) => transaction.docChanged)) return null;
          const seen = new Set<string>();
          const copies: [Id, Id][] = [];
          const tr = state.tr;
          state.doc.descendants((node, pos) => {
            if (node.type.name !== name) return;
            const id: unknown = node.attrs.drawingId;
            if (typeof id === 'string' && id !== '' && !seen.has(id)) {
              seen.add(id);
              return;
            }
            const fresh = newDrawingId();
            tr.setNodeAttribute(pos, 'drawingId', fresh);
            seen.add(fresh);
            if (typeof id === 'string' && id !== '') copies.push([id, fresh]);
          });
          if (!tr.docChanged) return null;
          if (copies.length > 0) queueMicrotask(() => copies.forEach(([from, to]) => options.onCopy(from, to)));
          return tr;
        },
      }),
    ];
  },
});
