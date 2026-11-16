import { Node, mergeAttributes } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { type ReactNodeViewProps, ReactNodeViewRenderer } from '@tiptap/react';
import type { ComponentType } from 'react';
import type { AttachmentKind, Id } from '@/types/models';

/**
 * The PDF and recording blocks. The page's document holds only the file's
 * ID (`attachmentId`); the file is a row of its own (DATA_MODEL.md). A new
 * block has no file yet and offers to choose or record one. Two blocks may
 * show the same file: a file's bytes never change, so copies need no copy.
 */

export interface FileNodeOptions {
  /** Shows the block in the editor. Left out where only the schema is needed. */
  view: ComponentType<ReactNodeViewProps> | null;
  /** Opens the file: the PDF reader. By default, through the app's hash route. */
  onOpen: (attachmentId: Id) => void;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fileBlocks: {
      /** Inserts an empty PDF block at the selection. */
      insertPdf: () => ReturnType;
      /** Inserts an empty recording block at the selection. */
      insertAudio: () => ReturnType;
    };
  }
}

/** Opens the PDF reader. The app routes by the address's hash (ARCHITECTURE.md, D6). */
export const openFileRoute = (attachmentId: Id) => {
  window.location.hash = `#/file/${attachmentId}`;
};

function fileNode(kind: AttachmentKind, command: 'insertPdf' | 'insertAudio') {
  return Node.create<FileNodeOptions>({
    name: kind,
    group: 'block',
    atom: true,
    selectable: true,
    draggable: false,

    addOptions() {
      return { view: null, onOpen: openFileRoute };
    },

    addAttributes() {
      return {
        attachmentId: {
          default: null,
          parseHTML: (element) => element.getAttribute('data-attachment-id'),
          renderHTML: (attributes) => (attributes.attachmentId ? { 'data-attachment-id': attributes.attachmentId as string } : {}),
        },
      };
    },

    parseHTML() {
      return [{ tag: `div[data-type="${kind}"]` }];
    },

    renderHTML({ HTMLAttributes }) {
      return ['div', mergeAttributes(HTMLAttributes, { 'data-type': kind })];
    },

    addNodeView() {
      const { view } = this.options;
      return view ? ReactNodeViewRenderer(view) : null;
    },

    addCommands() {
      return {
        [command]:
          () =>
          ({ commands }: { commands: { insertContent: (content: unknown) => boolean } }) =>
            commands.insertContent({ type: kind, attrs: { attachmentId: null } }),
      };
    },

    addKeyboardShortcuts() {
      return {
        // Enter on a selected PDF opens it, as its button does.
        Enter: ({ editor }) => {
          const { selection } = editor.state;
          if (kind !== 'pdf' || !(selection instanceof NodeSelection) || selection.node.type.name !== kind) return false;
          const id: unknown = selection.node.attrs.attachmentId;
          if (typeof id !== 'string' || id === '') return false;
          this.options.onOpen(id);
          return true;
        },
      };
    },
  });
}

export const PdfNode = fileNode('pdf', 'insertPdf');
export const AudioNode = fileNode('audio', 'insertAudio');
