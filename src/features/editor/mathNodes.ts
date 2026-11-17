import { InputRule, Node, mergeAttributes } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { type ReactNodeViewProps, ReactNodeViewRenderer } from '@tiptap/react';
import type { ComponentType } from 'react';

/**
 * Equations. `mathInline` sits in a line of text, `mathBlock` is a block of
 * its own, centred. Both are atoms that hold only their LaTeX source in
 * `latex`; KaTeX draws them (services/math.ts). Editing happens in a dialog,
 * so the formula's source never mixes with the page's text.
 *
 * Typed shortcuts: `$x^2$` makes an inline equation; `$$` and a space at the
 * start of an empty line makes an equation block.
 */

export interface MathNodeOptions {
  /** Shows the equation in the editor. Left out where only the schema is needed. */
  view: ComponentType<ReactNodeViewProps> | null;
}

/** Sent to an equation's element to open its editor (Enter on a selected equation). */
export const MATH_EDIT_EVENT = 'tn-math-edit';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    math: {
      /** Inserts an empty inline equation and opens its editor. */
      insertMathInline: (latex?: string) => ReturnType;
      /** Inserts an empty equation block and opens its editor. */
      insertMathBlock: (latex?: string) => ReturnType;
    };
  }
  interface Storage {
    mathInline: MathStorage;
    mathBlock: MathStorage;
  }
}

interface MathStorage {
  /** Set by the insert commands: the next equation view to appear opens its editor. */
  openNext: boolean;
}

/** `$…$` just typed: a formula that starts and ends with a non-space, after a space or the start of the line. */
export const INLINE_MATH_RULE = /(?:^|[\s([{])\$([^\s$](?:[^$\n]*[^\s$\\])?)\$$/;
/** `$$` and a space alone on a line. */
export const BLOCK_MATH_RULE = /^\$\$\s$/;

const latexAttribute = {
  latex: {
    default: '',
    parseHTML: (element: HTMLElement) => element.getAttribute('data-latex') ?? '',
    renderHTML: (attributes: Record<string, unknown>) => ({ 'data-latex': String(attributes.latex ?? '') }),
  },
};

const enterOpens = (name: string) => ({
  Enter: ({ editor }: { editor: { state: { selection: unknown }; view: { nodeDOM: (pos: number) => globalThis.Node | null } } }) => {
    const selection = editor.state.selection;
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== name) return false;
    const dom = editor.view.nodeDOM(selection.from);
    if (!(dom instanceof HTMLElement)) return false;
    dom.dispatchEvent(new CustomEvent(MATH_EDIT_EVENT));
    return true;
  },
});

export const MathInline = Node.create<MathNodeOptions, MathStorage>({
  name: 'mathInline',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addOptions() {
    return { view: null };
  },
  addStorage() {
    return { openNext: false };
  },
  addAttributes() {
    return latexAttribute;
  },
  parseHTML() {
    return [{ tag: 'span[data-type="math-inline"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'math-inline' })];
  },
  renderText({ node }) {
    return `$${String(node.attrs.latex)}$`;
  },
  addNodeView() {
    const { view } = this.options;
    return view ? ReactNodeViewRenderer(view, { as: 'span' }) : null;
  },
  addCommands() {
    return {
      insertMathInline:
        (latex = '') =>
        ({ commands }) => {
          this.storage.openNext = latex === '';
          return commands.insertContent({ type: this.name, attrs: { latex } });
        },
    };
  },
  addKeyboardShortcuts() {
    return { ...enterOpens(this.name), 'Mod-Shift-e': () => this.editor.commands.insertMathInline() };
  },
  addInputRules() {
    return [
      new InputRule({
        find: INLINE_MATH_RULE,
        handler: ({ state, range, match }) => {
          const latex = match[1]!;
          // The character before the "$" stays: only "$…$" becomes the equation.
          const start = range.from + match[0].indexOf('$');
          state.tr.replaceWith(start, range.to, this.type.create({ latex }));
        },
      }),
    ];
  },
});

export const MathBlock = Node.create<MathNodeOptions, MathStorage>({
  name: 'mathBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: false,

  addOptions() {
    return { view: null };
  },
  addStorage() {
    return { openNext: false };
  },
  addAttributes() {
    return latexAttribute;
  },
  parseHTML() {
    return [{ tag: 'div[data-type="math-block"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'math-block' })];
  },
  renderText({ node }) {
    return `$$${String(node.attrs.latex)}$$`;
  },
  addNodeView() {
    const { view } = this.options;
    return view ? ReactNodeViewRenderer(view) : null;
  },
  addCommands() {
    return {
      insertMathBlock:
        (latex = '') =>
        ({ commands }) => {
          this.storage.openNext = latex === '';
          return commands.insertContent({ type: this.name, attrs: { latex } });
        },
    };
  },
  addKeyboardShortcuts() {
    return enterOpens(this.name);
  },
  addInputRules() {
    return [
      new InputRule({
        find: BLOCK_MATH_RULE,
        handler: ({ state, range }) => {
          const $from = state.doc.resolve(range.from);
          // Only on a line of its own: "$$ " in the middle of text stays text. The space may or may not be in yet.
          if ($from.parent.type.name !== 'paragraph' || !/^\$\$\s?$/.test($from.parent.textContent)) return null;
          this.storage.openNext = true;
          // The whole line becomes the equation block.
          state.tr.replaceWith($from.before(), $from.after(), this.type.create({ latex: '' }));
        },
      }),
    ];
  },
});
