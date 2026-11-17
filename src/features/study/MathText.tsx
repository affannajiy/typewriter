import { useMemo } from 'react';
import { MathRender } from '@/features/editor/MathRender';
import { splitMath } from '@/services/math';

/** Card text: plain text with `$…$` equations drawn by KaTeX. Line breaks are kept. */
export function MathText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => splitMath(text), [text]);
  return (
    <span className={className ? `whitespace-pre-wrap ${className}` : 'whitespace-pre-wrap'}>
      {parts.map((part, index) => (part.kind === 'text' ? <span key={index}>{part.text}</span> : <MathRender key={index} latex={part.latex} display={false} />))}
    </span>
  );
}
