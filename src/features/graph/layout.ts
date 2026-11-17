import type { Id } from '@/types/models';

/**
 * Places the pages of the graph: a force-directed layout (Fruchterman and
 * Reingold). Linked pages pull together, all pages push apart, and a weak
 * pull to the middle keeps separate groups on screen. Pure and repeatable:
 * the start positions come from the page IDs, so the same pages and links
 * always give the same picture, and a test can check it.
 *
 * The cost is pages² per step. The screen caps the number of pages
 * (MAX_GRAPH_NODES) and the number of steps falls as the graph grows.
 */

export interface GraphEdge {
  from: Id;
  to: Id;
}

export interface Point {
  x: number;
  y: number;
}

export const MAX_GRAPH_NODES = 400;
export const GRAPH_SIZE = 1000;

/** A number from 0 to 1 that depends only on the text. */
function hash(text: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100_000) / 100_000;
}

export function layoutGraph(ids: Id[], edges: GraphEdge[], size = GRAPH_SIZE): Map<Id, Point> {
  const n = ids.length;
  const positions = new Map<Id, Point>();
  if (n === 0) return positions;
  const centre = size / 2;
  if (n === 1) {
    positions.set(ids[0]!, { x: centre, y: centre });
    return positions;
  }

  const index = new Map(ids.map((id, i) => [id, i]));
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  ids.forEach((id, i) => {
    xs[i] = size * (0.25 + 0.5 * hash(id, 1));
    ys[i] = size * (0.25 + 0.5 * hash(id, 2));
  });
  const links = edges.flatMap((edge) => {
    const a = index.get(edge.from);
    const b = index.get(edge.to);
    return a === undefined || b === undefined || a === b ? [] : [[a, b] as const];
  });

  const area = size * size;
  const k = 0.75 * Math.sqrt(area / n);
  const steps = Math.max(60, Math.min(300, Math.round(60_000 / n)));
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  let temperature = size / 10;
  const cooling = temperature / (steps + 1);

  for (let step = 0; step < steps; step++) {
    dx.fill(0);
    dy.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ddx = xs[i]! - xs[j]!;
        let ddy = ys[i]! - ys[j]!;
        let distance = Math.hypot(ddx, ddy);
        if (distance < 0.01) {
          // Two pages on the same spot: part them in a fixed direction.
          ddx = 0.01 * (hash(ids[i]!, j) - 0.5);
          ddy = 0.01 * (hash(ids[j]!, i) - 0.5);
          distance = 0.01;
        }
        const force = (k * k) / distance;
        dx[i] = dx[i]! + (ddx / distance) * force;
        dy[i] = dy[i]! + (ddy / distance) * force;
        dx[j] = dx[j]! - (ddx / distance) * force;
        dy[j] = dy[j]! - (ddy / distance) * force;
      }
    }
    for (const [a, b] of links) {
      const ddx = xs[a]! - xs[b]!;
      const ddy = ys[a]! - ys[b]!;
      const distance = Math.max(0.01, Math.hypot(ddx, ddy));
      const force = (distance * distance) / k;
      dx[a] = dx[a]! - (ddx / distance) * force;
      dy[a] = dy[a]! - (ddy / distance) * force;
      dx[b] = dx[b]! + (ddx / distance) * force;
      dy[b] = dy[b]! + (ddy / distance) * force;
    }
    for (let i = 0; i < n; i++) {
      // Gravity: unlinked pages and separate groups stay near the middle.
      dx[i] = dx[i]! + (centre - xs[i]!) * 0.05 * (k / size) * n;
      dy[i] = dy[i]! + (centre - ys[i]!) * 0.05 * (k / size) * n;
      const length = Math.hypot(dx[i]!, dy[i]!);
      if (length > 0) {
        const move = Math.min(length, temperature);
        xs[i] = xs[i]! + (dx[i]! / length) * move;
        ys[i] = ys[i]! + (dy[i]! / length) * move;
      }
    }
    temperature -= cooling;
  }

  // Fit the result into the square, with a margin for the labels.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, xs[i]!);
    maxX = Math.max(maxX, xs[i]!);
    minY = Math.min(minY, ys[i]!);
    maxY = Math.max(maxY, ys[i]!);
  }
  const margin = size * 0.08;
  const scale = (size - 2 * margin) / Math.max(maxX - minX, maxY - minY, 1);
  const offsetX = (size - (maxX - minX) * scale) / 2;
  const offsetY = (size - (maxY - minY) * scale) / 2;
  ids.forEach((id, i) => {
    positions.set(id, { x: offsetX + (xs[i]! - minX) * scale, y: offsetY + (ys[i]! - minY) * scale });
  });
  return positions;
}
