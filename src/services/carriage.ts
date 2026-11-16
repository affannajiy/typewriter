/**
 * Where the "carriage" is: the caret's place on its visual line.
 *
 * A typewriter rings its bell a few characters before the right margin, and
 * the writer then returns the carriage. On screen the text wraps by itself,
 * so we watch the caret: it tells us when the margin is near (bell) and when
 * the text has moved to a new visual line (carriage return).
 */

export interface CaretPlace {
  /** Visual line inside the current paragraph, from 0. */
  line: number;
  /** Distance from the start of the line, in pixels. */
  x: number;
  /** Width of the writing line, in pixels. */
  width: number;
  /** Width of an average character, in pixels. */
  charWidth: number;
}

/** The bell rings this many characters before the margin. Real machines use 5 to 8. */
export const BELL_CHARACTERS = 7;

export interface CarriageEvents {
  /** The caret has just passed the bell point on its line. */
  bell: boolean;
  /** The text has wrapped: the caret is on a later visual line. */
  wrapped: boolean;
  /** How far along the line the caret was before, 0 to 1. */
  travel: number;
}

/** What happened to the carriage when typing moved the caret from `before` to `after`. */
export function carriageEvents(before: CaretPlace | null, after: CaretPlace): CarriageEvents {
  if (!before) return { bell: false, wrapped: false, travel: 0 };
  const travel = before.width > 0 ? Math.min(Math.max(before.x / before.width, 0), 1) : 0;
  if (after.line > before.line) return { bell: false, wrapped: true, travel };
  const bellPoint = after.width - BELL_CHARACTERS * after.charWidth;
  const bell = after.line === before.line && bellPoint > 0 && before.x < bellPoint && after.x >= bellPoint;
  return { bell, wrapped: false, travel };
}

const PROBE = 'nnnnnnnnnn';
const FONT_STYLES = ['fontFamily', 'fontSize', 'fontStyle', 'fontVariant', 'fontWeight', 'letterSpacing', 'textTransform', 'wordSpacing'] as const;

let probe: HTMLSpanElement | null = null;

/** Width of an average character in the element's font. */
function averageCharWidth(style: CSSStyleDeclaration): number {
  if (!probe) {
    probe = document.createElement('span');
    probe.setAttribute('aria-hidden', 'true');
    probe.textContent = PROBE;
    // Fixed and invisible: it is laid out, but never seen and never scrolls the page.
    Object.assign(probe.style, { position: 'fixed', top: '0', left: '0', visibility: 'hidden', pointerEvents: 'none', whiteSpace: 'pre' });
    document.body.append(probe);
  }
  for (const property of FONT_STYLES) probe.style[property] = style[property];
  return probe.offsetWidth / PROBE.length;
}

/** The part of an editor that the measurement needs. ProseMirror's view provides it. */
export interface CaretSource {
  state: { selection: { head: number; $head: { depth: number; before: (depth: number) => number } } };
  coordsAtPos: (pos: number) => { left: number; top: number };
  nodeDOM: (pos: number) => Node | null;
}

/**
 * Finds the caret inside its text block (paragraph, heading, list line) from
 * the editor's own layout. Returns null where there is no layout (tests) or
 * no text block (a selected divider).
 */
export function measureCaret(view: CaretSource): CaretPlace | null {
  try {
    const { head, $head } = view.state.selection;
    if ($head.depth === 0) return null;
    const block = view.nodeDOM($head.before($head.depth));
    if (!(block instanceof HTMLElement) || block.clientWidth === 0) return null;
    const style = getComputedStyle(block);
    const box = block.getBoundingClientRect();
    const caret = view.coordsAtPos(head);
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 16) * 1.2;
    const width = block.clientWidth - paddingLeft - paddingRight;
    const fromLeft = caret.left - box.left - paddingLeft;
    return {
      line: Math.max(0, Math.round((caret.top - box.top - paddingTop) / lineHeight)),
      x: style.direction === 'rtl' ? width - fromLeft : fromLeft,
      width,
      charWidth: averageCharWidth(style),
    };
  } catch {
    // A position that cannot be measured must never interrupt writing.
    return null;
  }
}
