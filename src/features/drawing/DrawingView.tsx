import { memo } from 'react';
import type { Stroke } from '@/types/models';
import { HIGHLIGHTER_OPACITY, inkFill, strokePath } from './geometry';

/** One stroke as a filled outline. Memoised: an unchanged stroke is never recomputed. */
export const StrokeShape = memo(function StrokeShape({ stroke, last = true }: { stroke: Stroke; last?: boolean }) {
  const d = strokePath(stroke, last);
  if (!d) return null;
  return <path d={d} fill={inkFill(stroke.colour)} fillOpacity={stroke.tool === 'highlighter' ? HIGHLIGHTER_OPACITY : undefined} data-stroke={stroke.id} />;
});

/** Highlighters go under the pen, as on paper. */
export function paintOrder(strokes: Stroke[]): Stroke[] {
  return [...strokes.filter((s) => s.tool === 'highlighter'), ...strokes.filter((s) => s.tool !== 'highlighter')];
}

export const StrokeLayer = memo(function StrokeLayer({ strokes }: { strokes: Stroke[] }) {
  return (
    <g>
      {paintOrder(strokes).map((stroke) => (
        <StrokeShape key={stroke.id} stroke={stroke} />
      ))}
    </g>
  );
});

/** A drawing shown at the width of its container. Not interactive. */
export function DrawingView({ strokes, width, height, label }: { strokes: Stroke[]; width: number; height: number; label: string }) {
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${width} ${height}`} className="block h-auto w-full" preserveAspectRatio="xMidYMin meet">
      <StrokeLayer strokes={strokes} />
    </svg>
  );
}
