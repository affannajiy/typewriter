import { docToPlainText } from '@/database/repositories/pages';
import type { DocNode } from '@/types/models';

/**
 * Until the rich-text editor arrives (Milestone 3), the page body is edited
 * as plain text. It is still stored as a Tiptap-compatible document, one
 * paragraph per line, so no data migration is needed when the editor lands.
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
