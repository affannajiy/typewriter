import { cx } from '@/components/ui/Button';
import { t } from '@/i18n/en';
import { renderMath } from '@/services/math';

/**
 * A formula drawn by KaTeX, or its source and the reason it cannot be drawn.
 * Apart from the editor's node view, so flashcards can show equations
 * without loading the editor.
 */
export function MathRender({ latex, display, className }: { latex: string; display: boolean; className?: string }) {
  if (latex.trim() === '') return <span className={cx('text-muted italic', className)}>{t.math.empty}</span>;
  const result = renderMath(latex, display);
  if (!result.ok) {
    return (
      <span className={cx('font-mono text-sm text-danger', className)} title={t.math.invalid(result.error)}>
        {latex}
      </span>
    );
  }
  // KaTeX's own markup, built from the formula with `trust: false` (services/math.ts).
  return <span className={className} dangerouslySetInnerHTML={{ __html: result.html }} />;
}
