import katex from 'katex';
import 'katex/dist/katex.min.css';

/**
 * Equations with KaTeX. The only file that imports it, so it is bundled with
 * the screens that show equations (the editor, flashcards), not the first load.
 *
 * KaTeX builds its output from the formula: it never runs scripts and, with
 * `trust: false`, makes no links, images or classes from what was typed. Its
 * fonts are files of the app, so the Content Security Policy is unchanged.
 */

export const MAX_LATEX_LENGTH = 2000;

export type MathResult = { ok: true; html: string } | { ok: false; error: string };

const cache = new Map<string, MathResult>();
const CACHE_SIZE = 500;

/** The formula as HTML with MathML for screen readers, or the reason it cannot be shown. */
export function renderMath(latex: string, display: boolean): MathResult {
  const key = `${display ? 'D' : 'I'}${latex}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let result: MathResult;
  if (latex.length > MAX_LATEX_LENGTH) {
    result = { ok: false, error: 'too-long' };
  } else {
    try {
      const html = katex.renderToString(latex, {
        displayMode: display,
        throwOnError: true,
        output: 'htmlAndMathml',
        trust: false,
        strict: 'ignore',
        // Limits against formulas that would make the page huge or slow.
        maxSize: 20,
        maxExpand: 500,
      });
      result = { ok: true, html };
    } catch (error) {
      result = { ok: false, error: error instanceof Error ? error.message.replace(/^KaTeX parse error:\s*/, '') : 'error' };
    }
  }
  if (cache.size >= CACHE_SIZE) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}

export type TextPart = { kind: 'text'; text: string } | { kind: 'math'; latex: string };

/**
 * Splits text into plain runs and `$…$` equations, as in a flashcard. A `$`
 * followed by a space or a digit-only run like "$5 and $6" is left as text:
 * the formula must start and end with a non-space character. `\$` is a dollar sign.
 */
export function splitMath(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const pattern = /(?<!\\)\$([^\s$](?:[^$\n]*?[^\s$\\])?)\$/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parts.push({ kind: 'text', text: text.slice(last, match.index) });
    parts.push({ kind: 'math', latex: match[1]! });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts.map((part) => (part.kind === 'text' ? { ...part, text: part.text.replace(/\\\$/g, '$') } : part));
}
