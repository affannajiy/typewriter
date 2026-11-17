import { describe, expect, it } from 'vitest';
import { MAX_LATEX_LENGTH, renderMath, splitMath } from './math';

describe('renderMath', () => {
  it('draws a formula as HTML with MathML for screen readers', () => {
    const result = renderMath('\\frac{a}{b}', false);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.html).toContain('katex');
      expect(result.html).toContain('<math');
    }
    const display = renderMath('x^2', true);
    expect(display.ok && display.html.includes('katex-display')).toBe(true);
  });

  it('explains a formula it cannot read instead of throwing', () => {
    const result = renderMath('\\frac{a', false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toMatch(/^KaTeX/);
    expect(renderMath('x'.repeat(MAX_LATEX_LENGTH + 1), false)).toEqual({ ok: false, error: 'too-long' });
  });

  it('makes no links, scripts or styles from what was typed', () => {
    const link = renderMath('\\href{javascript:alert(1)}{x}', false);
    // The source stays in the MathML annotation as escaped text; what matters is that nothing links.
    expect(link.ok && /href=|<a[\s>]/.test(link.html)).toBe(false);
    const html = renderMath('\\text{<img src=x onerror=alert(1)>}', false);
    expect(html.ok).toBe(true);
    if (html.ok) expect(html.html).not.toContain('<img');
    const style = renderMath('\\htmlStyle{color:red}{x}', false);
    expect(style.ok && /style="[^"]*color:\s*red/.test(style.html)).toBe(false);
  });
});

describe('splitMath', () => {
  it('finds $…$ equations in card text', () => {
    expect(splitMath('Solve $x^2 = 4$ for $x$.')).toEqual([
      { kind: 'text', text: 'Solve ' },
      { kind: 'math', latex: 'x^2 = 4' },
      { kind: 'text', text: ' for ' },
      { kind: 'math', latex: 'x' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('leaves prices, lone dollars and escaped dollars as text', () => {
    expect(splitMath('It costs $5 and $6.')).toEqual([{ kind: 'text', text: 'It costs $5 and $6.' }]);
    expect(splitMath('A $ sign')).toEqual([{ kind: 'text', text: 'A $ sign' }]);
    expect(splitMath('Pay \\$3 or \\$4')).toEqual([{ kind: 'text', text: 'Pay $3 or $4' }]);
    expect(splitMath('')).toEqual([]);
  });
});
