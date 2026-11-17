import { describe, expect, it } from 'vitest';
import { GRAPH_SIZE, layoutGraph } from './layout';

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('graph layout', () => {
  it('places nothing, one page in the middle, and every page inside the square', () => {
    expect(layoutGraph([], []).size).toBe(0);
    expect(layoutGraph(['a'], []).get('a')).toEqual({ x: GRAPH_SIZE / 2, y: GRAPH_SIZE / 2 });
    const ids = Array.from({ length: 30 }, (_, i) => `page-${i}`);
    const edges = ids.slice(1).map((id, i) => ({ from: ids[i]!, to: id }));
    const positions = layoutGraph(ids, edges);
    for (const point of positions.values()) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(GRAPH_SIZE);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(GRAPH_SIZE);
    }
  });

  it('gives the same picture for the same pages and links', () => {
    const ids = ['x', 'y', 'z', 'w'];
    const edges = [
      { from: 'x', to: 'y' },
      { from: 'z', to: 'w' },
    ];
    expect([...layoutGraph(ids, edges)]).toEqual([...layoutGraph(ids, edges)]);
  });

  it('draws linked pages closer together than unlinked ones, and keeps pages apart', () => {
    // Two groups of three, linked inside each group only.
    const ids = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3'];
    const edges = [
      { from: 'a1', to: 'a2' },
      { from: 'a2', to: 'a3' },
      { from: 'a3', to: 'a1' },
      { from: 'b1', to: 'b2' },
      { from: 'b2', to: 'b3' },
      { from: 'b3', to: 'b1' },
      { from: 'ghost', to: 'a1' },
    ];
    const p = layoutGraph(ids, edges);
    const inside = distance(p.get('a1')!, p.get('a2')!);
    const across = distance(p.get('a1')!, p.get('b1')!);
    expect(inside).toBeLessThan(across);
    for (const a of ids) for (const b of ids) if (a !== b) expect(distance(p.get(a)!, p.get(b)!)).toBeGreaterThan(10);
  });
});
