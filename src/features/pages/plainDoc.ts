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

export { countCharacters, countWords } from '@/utils/text';
