import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/**
 * Paginated layout.
 *
 * The document stays one continuous ProseMirror document. Pages are a view:
 * a spacer is drawn before any block that would cross the bottom margin, so
 * the block starts on the next sheet. Spacers are decorations, not content:
 * they are never saved, searched or exported.
 *
 * Limit: a block taller than one sheet (a very long paragraph or code block)
 * is not split. It runs over the page edge.
 */

export const PAGE_SIZES = {
  a4: { width: 794, height: 1123 },
  letter: { width: 816, height: 1056 },
  a5: { width: 559, height: 794 },
} as const;
export type PageSize = keyof typeof PAGE_SIZES;

/** CSS pixels at 96 per inch: 0.5, 1 and 1.5 inches. */
export const PAGE_MARGINS = { narrow: 48, normal: 96, wide: 144 } as const;
export type PageMargin = keyof typeof PAGE_MARGINS;

/** Space between two sheets on screen, in pixels. */
export const PAGE_GAP = 24;

export interface Sheet {
  width: number;
  height: number;
  margin: number;
}

/**
 * The sheet as drawn. A sheet wider than the space available is scaled down
 * with its margins, so the proportions stay those of the paper.
 */
export function sheetFor(size: PageSize, margin: PageMargin, available: number): Sheet {
  const paper = PAGE_SIZES[size];
  const scale = available > 0 ? Math.min(1, available / paper.width) : 1;
  return { width: Math.round(paper.width * scale), height: Math.round(paper.height * scale), margin: Math.round(PAGE_MARGINS[margin] * scale) };
}

export interface PageGeometry {
  /** Height of the writing area of one sheet. */
  contentHeight: number;
  /** Distance from the top of one writing area to the top of the next. */
  stride: number;
}

export const geometryFor = (sheet: Sheet): PageGeometry => ({ contentHeight: sheet.height - 2 * sheet.margin, stride: sheet.height + PAGE_GAP });

export interface MeasuredBlock {
  /** Where the block would start with no spacers at all. */
  top: number;
  height: number;
}

export interface Pagination {
  /** Height of the spacer before each block. 0 means none. */
  spacers: number[];
  pages: number;
}

/** Decides where the page breaks fall. Pure, so it is tested without a browser. */
export function paginate(blocks: MeasuredBlock[], geometry: PageGeometry): Pagination {
  const { contentHeight, stride } = geometry;
  if (contentHeight <= 0) return { spacers: blocks.map(() => 0), pages: 1 };
  let pushed = 0;
  let bottom = 0;
  const spacers = blocks.map((block) => {
    const top = block.top + pushed;
    const onPage = top % stride;
    const fits = block.height <= contentHeight;
    // Move a block that crosses the bottom margin, or that starts below it.
    const crosses = fits && onPage + block.height > contentHeight;
    const inMargin = onPage >= contentHeight && onPage > 0;
    const spacer = crosses || inMargin ? stride - onPage : 0;
    pushed += spacer;
    bottom = Math.max(bottom, top + spacer + block.height);
    return spacer;
  });
  // A block that ends exactly on a page's last line still belongs to that page.
  const pages = Math.max(1, Math.floor(Math.max(bottom - 1, 0) / stride) + 1);
  return { spacers, pages };
}

export interface PaginationOptions {
  /** Null while the layout is continuous. Read on every measurement. */
  getGeometry: () => PageGeometry | null;
  onPages: (pages: number) => void;
}

const paginationKey = new PluginKey<DecorationSet>('pagination');

// jsdom has no animation frames; a timer does the same job there.
const nextFrame = (work: () => void): number => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(work) : (setTimeout(work, 0) as unknown as number));
const cancelFrame = (handle: number) => (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(handle) : clearTimeout(handle));
const SPACER_CLASS = 'tn-page-spacer';

function spacerElement(height: number): HTMLElement {
  const element = document.createElement('div');
  element.className = SPACER_CLASS;
  element.style.height = `${height}px`;
  element.contentEditable = 'false';
  element.setAttribute('aria-hidden', 'true');
  return element;
}

class PaginationView {
  private frame = 0;
  private observer: ResizeObserver | null = null;

  constructor(
    private view: EditorView,
    private options: PaginationOptions,
  ) {
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.schedule());
      this.observer.observe(view.dom);
    }
    this.schedule();
  }

  update() {
    this.schedule();
  }

  destroy() {
    cancelFrame(this.frame);
    this.observer?.disconnect();
  }

  private schedule() {
    cancelFrame(this.frame);
    this.frame = nextFrame(() => this.measure());
  }

  private measure() {
    const { view } = this;
    if (view.isDestroyed) return;
    const geometry = this.options.getGeometry();
    const { doc } = view.state;

    if (!geometry) {
      this.options.onPages(1);
      this.apply([], DecorationSet.empty);
      return;
    }

    // The height of the spacers above each element, so that a block's
    // natural position does not depend on the spacers already drawn.
    const above = new Map<Element, number>();
    let spacerSum = 0;
    for (const child of Array.from(view.dom.children)) {
      if (child.classList.contains(SPACER_CLASS)) spacerSum += (child as HTMLElement).offsetHeight;
      else above.set(child, spacerSum);
    }

    const positions: number[] = [];
    const blocks: MeasuredBlock[] = [];
    doc.forEach((_node, offset) => {
      const element = view.nodeDOM(offset);
      if (!(element instanceof HTMLElement)) return;
      positions.push(offset);
      blocks.push({ top: element.offsetTop - (above.get(element) ?? 0), height: element.offsetHeight });
    });

    const { spacers, pages } = paginate(blocks, geometry);
    this.options.onPages(pages);
    const decorations: Decoration[] = [];
    const wanted: string[] = [];
    spacers.forEach((height, index) => {
      if (height <= 0) return;
      const pos = positions[index]!;
      wanted.push(`${pos}:${height}`);
      decorations.push(Decoration.widget(pos, () => spacerElement(height), { side: -1, key: `page-spacer-${height}`, height }));
    });
    this.apply(wanted, DecorationSet.create(doc, decorations));
  }

  /**
   * Dispatches only when the breaks differ from the ones on screen, so that
   * measuring settles instead of looping. The comparison is with the spacers
   * as they are now, by position: after an edit above a break, the old spacer
   * has travelled with its block and is in the wrong place, even when the
   * break is again "before the 21st block".
   */
  private apply(wanted: string[], decorations: DecorationSet) {
    const current = (paginationKey.getState(this.view.state) ?? DecorationSet.empty).find().map((decoration) => `${decoration.from}:${(decoration.spec as { height: number }).height}`);
    if (current.sort().join('|') === [...wanted].sort().join('|')) return;
    this.view.dispatch(this.view.state.tr.setMeta(paginationKey, decorations).setMeta('addToHistory', false));
  }
}

export const Pagination = Extension.create<PaginationOptions>({
  name: 'pagination',

  addOptions() {
    return { getGeometry: () => null, onPages: () => {} };
  },

  addProseMirrorPlugins() {
    const options = this.options;
    return [
      new Plugin<DecorationSet>({
        key: paginationKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => (tr.getMeta(paginationKey) as DecorationSet | undefined) ?? set.map(tr.mapping, tr.doc),
        },
        props: {
          decorations: (state) => paginationKey.getState(state),
        },
        view: (view) => new PaginationView(view, options),
      }),
    ];
  },
});
