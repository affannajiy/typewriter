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

const COPIED_STYLES = [
  'direction',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontVariant',
  'fontWeight',
  'letterSpacing',
  'lineHeight',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'tabSize',
  'textIndent',
  'textTransform',
  'wordSpacing',
] as const;

const PROBE = 'nnnnnnnnnn';

let mirror: { box: HTMLDivElement; marker: HTMLSpanElement; probe: HTMLSpanElement } | null = null;

function getMirror() {
  if (mirror) return mirror;
  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  // Fixed and invisible: it is laid out, but never seen and never scrolls the page.
  Object.assign(box.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    visibility: 'hidden',
    pointerEvents: 'none',
    boxSizing: 'border-box',
    border: '0',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
  });
  const marker = document.createElement('span');
  marker.textContent = '​';
  const probe = document.createElement('span');
  probe.textContent = PROBE;
  Object.assign(probe.style, { position: 'absolute', top: '0', left: '0', whiteSpace: 'pre' });
  document.body.append(box);
  mirror = { box, marker, probe };
  return mirror;
}

/**
 * Finds the caret in a textarea by laying out its current paragraph in a
 * hidden copy. Returns null where there is no layout (tests, hidden fields).
 */
export function measureCaret(field: HTMLTextAreaElement): CaretPlace | null {
  if (field.clientWidth === 0) return null;
  const { box, marker, probe } = getMirror();
  const style = getComputedStyle(field);
  for (const property of COPIED_STYLES) box.style[property] = style[property];
  box.style.width = `${field.clientWidth}px`;

  const caret = field.selectionStart ?? field.value.length;
  const start = field.value.lastIndexOf('\n', caret - 1) + 1;
  const nextBreak = field.value.indexOf('\n', caret);
  const end = nextBreak === -1 ? field.value.length : nextBreak;
  box.replaceChildren(field.value.slice(start, caret), marker, field.value.slice(caret, end), probe);

  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const lineHeight = parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 16) * 1.2;
  const width = field.clientWidth - paddingLeft - paddingRight;
  const fromLeft = marker.offsetLeft - paddingLeft;
  return {
    line: Math.max(0, Math.round((marker.offsetTop - paddingTop) / lineHeight)),
    x: style.direction === 'rtl' ? width - fromLeft : fromLeft,
    width,
    charWidth: probe.offsetWidth / PROBE.length,
  };
}
