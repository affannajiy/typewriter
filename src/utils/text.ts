/** Counting text. Shared by the page screen and the words-written log. */

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
