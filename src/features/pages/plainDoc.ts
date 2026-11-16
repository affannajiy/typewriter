import { docToPlainText } from '@/database/repositories/pages';
import type { DocNode } from '@/types/models';

/**
 * Plain text and the page document.
 *
 * Before the rich-text editor (0.3.0), the page body was plain text stored as
 * one paragraph per line. `textToDoc` builds that shape. Pages in it still
 * exist and load unchanged, and the tests use it to prove that.
 */

export function textToDoc(text: string): DocNode {
  return {
    type: 'doc',
    content: text.split('\n').map((line) => (line === '' ? { type: 'paragraph' } : { type: 'paragraph', content: [{ type: 'text', text: line }] })),
  };
}

export const docToText = docToPlainText;

export function countWords(text: string): number {
  const words = text.trim().match(/\S+/gu);
  return words ? words.length : 0;
}

/** Counts user-perceived characters, so an emoji or accented letter is one. */
export function countCharacters(text: string): number {
  if (typeof Intl.Segmenter === 'function') {
    let count = 0;
    for (const _ of new Intl.Segmenter().segment(text)) count++;
    return count;
  }
  return [...text].length;
}
