import { describe, expect, it } from 'vitest';
import type { Stroke } from '@/types/models';
import { boundsOf, emptyHistory, eraseAt, insidePolygon, record, redo, selectInLasso, strokePath, transformStrokes, triples, undo } from './geometry';

/** A horizontal pen line from x0 to x1 at height y, one point every `step` units. */
function line(id: string, x0: number, x1: number, y: number, step = 5): Stroke {
  const points: number[] = [];
  for (let x = x0; x <= x1; x += step) points.push(x, y, 0.5);
  return { id, tool: 'pen', colour: 'ink', size: 4, pen: false, points };
}

let counter = 0;
const nextId = () => `new-${++counter}`;

describe('stroke outlines', () => {
  it('turns points into a closed SVG path, and nothing into nothing', () => {
    expect(strokePath(line('a', 0, 100, 10))).toMatch(/^M[\d.,-]+ Q.* Z$/);
    expect(strokePath({ tool: 'pen', size: 4, pen: false, points: [] })).toBe('');
  });

  it('reads the flat point list as triples', () => {
    expect(triples({ points: [1, 2, 0.3, 4, 5, 0.6] })).toEqual([
      [1, 2, 0.3],
      [4, 5, 0.6],
    ]);
  });
});

describe('the eraser', () => {
  it('cuts a stroke in two where it passes; the first part keeps the ID', () => {
    const result = eraseAt([line('a', 0, 100, 10)], { x: 50, y: 10 }, 6, nextId);
    expect(result).toHaveLength(2);
    expect(result[0]!.id).toBe('a');
    expect(result[1]!.id).not.toBe('a');
    const xs = result.map((stroke) => triples(stroke).map(([x]) => x));
    expect(Math.max(...xs[0]!)).toBeLessThan(50 - 6);
    expect(Math.min(...xs[1]!)).toBeGreaterThan(50 + 6);
    // Colour, tool and width are kept on both halves.
    expect(result[1]).toMatchObject({ tool: 'pen', colour: 'ink', size: 4 });
  });

  it('removes a stroke it covers entirely', () => {
    expect(eraseAt([line('a', 0, 10, 10)], { x: 5, y: 10 }, 20, nextId)).toEqual([]);
  });

  it('returns the same list when it touches nothing, so no undo step is made', () => {
    const strokes = [line('a', 0, 100, 10)];
    expect(eraseAt(strokes, { x: 50, y: 80 }, 6, nextId)).toBe(strokes);
  });

  it('also cuts between two far-apart points', () => {
    const sparse: Stroke = { ...line('a', 0, 0, 10), points: [0, 10, 0.5, 100, 10, 0.5] };
    const result = eraseAt([sparse], { x: 50, y: 10 }, 4, nextId);
    expect(result).toHaveLength(2);
    expect(result.map((stroke) => stroke.points.length)).toEqual([3, 3]);
  });
});

describe('the lasso', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('knows inside from outside', () => {
    expect(insidePolygon({ x: 50, y: 50 }, square)).toBe(true);
    expect(insidePolygon({ x: 150, y: 50 }, square)).toBe(false);
  });

  it('selects strokes that are mostly inside', () => {
    const inside = line('in', 10, 90, 50);
    // 16 points, 8 of them inside: exactly half counts.
    const half = line('half', 60, 135, 20);
    const outside = line('out', 200, 300, 50);
    expect([...selectInLasso([inside, half, outside], square)].sort()).toEqual(['half', 'in']);
    expect(selectInLasso([inside], square.slice(0, 2)).size).toBe(0);
  });
});

describe('moving and scaling', () => {
  it('moves only the selected strokes', () => {
    const [a, b] = transformStrokes([line('a', 0, 10, 0), line('b', 0, 10, 0)], new Set(['a']), { dx: 5, dy: 7, scale: 1, origin: { x: 0, y: 0 } });
    expect(triples(a!)[0]).toEqual([5, 7, 0.5]);
    expect(triples(b!)[0]).toEqual([0, 0, 0.5]);
  });

  it('scales around the origin and scales the line width too', () => {
    const [a] = transformStrokes([line('a', 10, 20, 10, 10)], new Set(['a']), { dx: 0, dy: 0, scale: 2, origin: { x: 10, y: 10 } });
    expect(triples(a!).map(([x, y]) => [x, y])).toEqual([
      [10, 10],
      [30, 10],
    ]);
    expect(a!.size).toBe(8);
  });

  it('keeps the scale within limits', () => {
    const [a] = transformStrokes([line('a', 0, 10, 0, 10)], new Set(['a']), { dx: 0, dy: 0, scale: 0, origin: { x: 0, y: 0 } });
    expect(triples(a!)[1]![0]).toBeCloseTo(1);
  });

  it('measures the box around strokes, including their width', () => {
    expect(boundsOf([line('a', 10, 20, 30)])).toEqual({ minX: 8, minY: 28, maxX: 22, maxY: 32 });
    expect(boundsOf([])).toBeNull();
  });
});

describe('undo history', () => {
  it('undoes and redoes whole changes, and a new change clears redo', () => {
    const s0: Stroke[] = [];
    const s1 = [line('a', 0, 10, 0)];
    const s2 = [...s1, line('b', 0, 10, 20)];
    let history = record(record(emptyHistory(), s0), s1);

    const back = undo(history, s2)!;
    expect(back.strokes).toBe(s1);
    const forward = redo(back.history, back.strokes)!;
    expect(forward.strokes).toBe(s2);

    history = record(back.history, s1);
    expect(history.future).toEqual([]);
    expect(undo(emptyHistory(), s0)).toBeNull();
    expect(redo(emptyHistory(), s0)).toBeNull();
  });
});
