import { type StrokeOptions, getStroke } from 'perfect-freehand';
import type { Id, InkColour, Stroke } from '@/types/models';

/**
 * The drawing engine's pure part: no DOM, no database. Strokes are editable
 * data (points, not pixels), so they can be erased in part, selected, moved
 * and scaled, and drawn again at any size. Rendering turns each stroke into
 * an outline with perfect-freehand (ARCHITECTURE.md, D13).
 */

export interface Point {
  x: number;
  y: number;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** A stroke's points as [x, y, pressure] triples. */
export function triples(stroke: Pick<Stroke, 'points'>): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i + 2 < stroke.points.length; i += 3) out.push([stroke.points[i]!, stroke.points[i + 1]!, stroke.points[i + 2]!]);
  return out;
}

export function strokeOptions(stroke: Pick<Stroke, 'tool' | 'size' | 'pen'>, last = true): StrokeOptions {
  if (stroke.tool === 'highlighter') {
    // A flat marker: same width all along, no taper.
    return { size: stroke.size, thinning: 0, smoothing: 0.5, streamline: 0.5, simulatePressure: false, last };
  }
  return { size: stroke.size, thinning: 0.6, smoothing: 0.5, streamline: 0.45, simulatePressure: !stroke.pen, last, start: { taper: 0 }, end: { taper: 0 } };
}

const fmt = (n: number) => (Math.round(n * 100) / 100).toString();

/** The filled outline of a stroke as SVG path data. Empty for a stroke with no points. */
export function strokePath(stroke: Pick<Stroke, 'points' | 'tool' | 'size' | 'pen'>, last = true): string {
  const outline = getStroke(triples(stroke), strokeOptions(stroke, last));
  if (outline.length < 2) return '';
  // Quadratic curves through the midpoints give a smooth closed shape.
  let d = `M${fmt(outline[0]![0])},${fmt(outline[0]![1])}`;
  for (let i = 0; i < outline.length; i++) {
    const [x0, y0] = outline[i]!;
    const [x1, y1] = outline[(i + 1) % outline.length]!;
    d += ` Q${fmt(x0)},${fmt(y0)} ${fmt((x0 + x1) / 2)},${fmt((y0 + y1) / 2)}`;
  }
  return `${d} Z`;
}

/** How each ink colour is painted: a theme token, so ink reads on every paper. */
export const INK_TOKEN: Record<InkColour, string> = {
  ink: '--tn-text',
  red: '--tn-ink-red',
  blue: '--tn-ink-blue',
  green: '--tn-ink-green',
  yellow: '--tn-ink-yellow',
};

export const inkFill = (colour: InkColour) => `var(${INK_TOKEN[colour]})`;

/** A highlighter is translucent, so the writing under it stays readable. */
export const HIGHLIGHTER_OPACITY = 0.4;

const distanceToSegment = (p: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

/**
 * Erases the parts of strokes that lie within `radius` of `at`. A stroke cut
 * in the middle becomes two strokes; the first keeps the ID. Returns the same
 * array when nothing was touched, so a caller can skip an undo entry.
 */
export function eraseAt(strokes: Stroke[], at: Point, radius: number, makeId: () => Id): Stroke[] {
  let changed = false;
  const out: Stroke[] = [];
  for (const stroke of strokes) {
    const reach = radius + stroke.size / 2;
    const points = triples(stroke);
    const hit = points.map(([x, y]) => Math.hypot(x - at.x, y - at.y) <= reach);
    if (!hit.some(Boolean)) {
      // A gap between two far-apart points can still pass under the eraser.
      const crosses = points.some((p, i) => i > 0 && distanceToSegment(at, { x: points[i - 1]![0], y: points[i - 1]![1] }, { x: p[0], y: p[1] }) <= reach);
      if (!crosses) {
        out.push(stroke);
        continue;
      }
    }
    changed = true;
    const pieces: number[][] = [];
    let piece: number[] = [];
    points.forEach(([x, y, p], i) => {
      const cut = hit[i] || (i > 0 && !hit[i - 1] && distanceToSegment(at, { x: points[i - 1]![0], y: points[i - 1]![1] }, { x, y }) <= reach);
      if (cut && piece.length > 0) {
        pieces.push(piece);
        piece = [];
      }
      if (!hit[i]) piece.push(x, y, p);
    });
    if (piece.length > 0) pieces.push(piece);
    pieces.forEach((kept, index) => out.push({ ...stroke, id: index === 0 ? stroke.id : makeId(), points: kept }));
  }
  return changed ? out : strokes;
}

/** Ray casting: true when the point is inside the polygon. */
export function insidePolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Strokes with at least half of their points inside the lasso. */
export function selectInLasso(strokes: Stroke[], lasso: Point[]): Set<Id> {
  const selected = new Set<Id>();
  if (lasso.length < 3) return selected;
  for (const stroke of strokes) {
    const points = triples(stroke);
    if (points.length === 0) continue;
    const inside = points.filter(([x, y]) => insidePolygon({ x, y }, lasso)).length;
    if (inside * 2 >= points.length) selected.add(stroke.id);
  }
  return selected;
}

/** The box around the strokes, including their width. Null for no strokes. */
export function boundsOf(strokes: Stroke[]): Box | null {
  let box: Box | null = null;
  for (const stroke of strokes) {
    const pad = stroke.size / 2;
    for (const [x, y] of triples(stroke)) {
      box = box
        ? { minX: Math.min(box.minX, x - pad), minY: Math.min(box.minY, y - pad), maxX: Math.max(box.maxX, x + pad), maxY: Math.max(box.maxY, y + pad) }
        : { minX: x - pad, minY: y - pad, maxX: x + pad, maxY: y + pad };
    }
  }
  return box;
}

export interface Transform {
  dx: number;
  dy: number;
  /** Uniform scale around `origin`, applied before the move. */
  scale: number;
  origin: Point;
}

export const IDENTITY: Transform = { dx: 0, dy: 0, scale: 1, origin: { x: 0, y: 0 } };

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 10;

/** Moves and scales the chosen strokes. Line width scales with them. */
export function transformStrokes(strokes: Stroke[], ids: ReadonlySet<Id>, transform: Transform): Stroke[] {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, transform.scale));
  const { dx, dy, origin } = transform;
  return strokes.map((stroke) => {
    if (!ids.has(stroke.id)) return stroke;
    const points = stroke.points.slice();
    for (let i = 0; i + 2 < points.length; i += 3) {
      points[i] = origin.x + (points[i]! - origin.x) * scale + dx;
      points[i + 1] = origin.y + (points[i + 1]! - origin.y) * scale + dy;
    }
    return { ...stroke, size: Math.min(200, Math.max(0.5, stroke.size * scale)), points };
  });
}

/** Lowest point any stroke reaches, so the canvas is never made shorter than its content. */
export function contentBottom(strokes: Stroke[]): number {
  return boundsOf(strokes)?.maxY ?? 0;
}

/** Undo history of a drawing. Each entry is the whole list of strokes before a change. */
export interface History {
  past: Stroke[][];
  future: Stroke[][];
}

export const HISTORY_LIMIT = 200;

export const emptyHistory = (): History => ({ past: [], future: [] });

/** Records `before` as the state an undo returns to. A new change clears redo. */
export function record(history: History, before: Stroke[]): History {
  return { past: [...history.past, before].slice(-HISTORY_LIMIT), future: [] };
}

export function undo(history: History, current: Stroke[]): { history: History; strokes: Stroke[] } | null {
  const previous = history.past.at(-1);
  if (!previous) return null;
  return { history: { past: history.past.slice(0, -1), future: [current, ...history.future] }, strokes: previous };
}

export function redo(history: History, current: Stroke[]): { history: History; strokes: Stroke[] } | null {
  const next = history.future[0];
  if (!next) return null;
  return { history: { past: [...history.past, current], future: history.future.slice(1) }, strokes: next };
}
