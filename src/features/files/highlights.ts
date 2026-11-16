/**
 * Highlight geometry. A text selection reports one rectangle per piece of
 * text on screen; a highlight stores them as fractions of the page, merged
 * into one rectangle per line, so it fits the page at any zoom.
 */

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Rectangles smaller than this, in pixels, are gaps and line ends, not text. */
const MIN_SIZE = 1;

/**
 * Two pieces are on one line when their vertical extents overlap by more
 * than half of the smaller height. Pieces on one line that touch or overlap
 * become one rectangle.
 */
function sameLine(a: Box, b: Box): boolean {
  const overlap = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return overlap > Math.min(a.height, b.height) / 2;
}

function touches(a: Box, b: Box, gap: number): boolean {
  return a.left <= b.left + b.width + gap && b.left <= a.left + a.width + gap;
}

function union(a: Box, b: Box): Box {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  return { left, top, width: Math.max(a.left + a.width, b.left + b.width) - left, height: Math.max(a.top + a.height, b.top + b.height) - top };
}

/** Merges pieces on one line that touch. The gap allowed is a fraction of the line's height, for the space between words. */
export function mergeLines(rects: Box[]): Box[] {
  const sorted = rects.filter((r) => r.width >= MIN_SIZE && r.height >= MIN_SIZE).sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: Box[] = [];
  for (const rect of sorted) {
    const index = lines.findIndex((line) => sameLine(line, rect) && touches(line, rect, Math.min(line.height, rect.height) * 0.6));
    if (index === -1) lines.push({ ...rect });
    else lines[index] = union(lines[index]!, rect);
  }
  // A merge can make two lines touch that did not before.
  for (let changed = true; changed; ) {
    changed = false;
    outer: for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        if (sameLine(lines[i]!, lines[j]!) && touches(lines[i]!, lines[j]!, Math.min(lines[i]!.height, lines[j]!.height) * 0.6)) {
          lines[i] = union(lines[i]!, lines[j]!);
          lines.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  return lines.sort((a, b) => a.top - b.top || a.left - b.left);
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const round = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * Screen rectangles of a selection on one page, as the flat list a highlight
 * stores: x, y, width, height, each 0 to 1 of the page. Pieces outside the
 * page are cut off; nothing left means an empty list.
 */
export function toPageRects(rects: Box[], page: Box): number[] {
  if (page.width <= 0 || page.height <= 0) return [];
  // A box taller than a quarter of the page is a container the selection passed over, not a line of text.
  const inside = rects.flatMap((r) => {
    if (r.height > page.height / 4) return [];
    const left = Math.max(r.left, page.left);
    const top = Math.max(r.top, page.top);
    const right = Math.min(r.left + r.width, page.left + page.width);
    const bottom = Math.min(r.top + r.height, page.top + page.height);
    return right > left && bottom > top ? [{ left, top, width: right - left, height: bottom - top }] : [];
  });
  return mergeLines(inside).flatMap((r) => {
    const x = clamp((r.left - page.left) / page.width);
    const y = clamp((r.top - page.top) / page.height);
    return [round(x), round(y), round(clamp(r.width / page.width)), round(clamp(r.height / page.height))];
  });
}

/** The stored list as boxes, for drawing. */
export function fromPageRects(rects: number[]): Box[] {
  const boxes: Box[] = [];
  for (let i = 0; i + 3 < rects.length; i += 4) boxes.push({ left: rects[i]!, top: rects[i + 1]!, width: rects[i + 2]!, height: rects[i + 3]! });
  return boxes;
}

/** True when a point, in fractions of the page, is inside one of the rectangles. */
export function hitsRects(rects: number[], x: number, y: number): boolean {
  return fromPageRects(rects).some((r) => x >= r.left && x <= r.left + r.width && y >= r.top && y <= r.top + r.height);
}

/** Selected text, tidied: line breaks and runs of spaces become one space. */
export function cleanQuote(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
