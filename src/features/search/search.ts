import type { Id, Notebook, Page } from '@/types/models';

/**
 * Search over everything written: notebook names, page titles, the text of
 * every page (`plainText`, derived on every save), and the text of PDFs
 * placed in pages (read once, see services/pdfIndex.ts).
 *
 * It scans what is already in memory: no index to build or to keep in step.
 * Every word of the query must appear; case and accents are ignored. Items in
 * the Trash are not in the workspace, so they are not found.
 */

export const MAX_QUERY_LENGTH = 200;

/** Lower case, without accents: "Élan" and "elan" compare equal. */
export const fold = (text: string): string => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

export const queryWords = (query: string): string[] => [...new Set(fold(query.slice(0, MAX_QUERY_LENGTH)).split(/\s+/u).filter(Boolean))];

/** A piece of text and, inside it, where the words were found: [start, end) pairs. */
export interface Marked {
  text: string;
  marks: [number, number][];
}

/**
 * Text folded for matching, with the place of each folded character in the
 * original text. Folding can change the length ("ﬁ" becomes "fi"), so a
 * match found in the folded text is mapped back through `at`.
 */
interface Folded {
  text: string;
  /** at[i]: index in the original text of folded character i. One extra entry: the original length. */
  at: number[];
}

function foldWithMap(original: string): Folded {
  let text = '';
  const at: number[] = [];
  let index = 0;
  for (const char of original) {
    const folded = fold(char);
    for (let i = 0; i < folded.length; i++) at.push(index);
    text += folded;
    index += char.length;
  }
  at.push(original.length);
  return { text, at };
}

// Folding a long text on every key press is the costly part, so it is done once per text.
const foldCache = new Map<string, Folded>();
const FOLD_CACHE_SIZE = 2000;
function folded(original: string): Folded {
  let entry = foldCache.get(original);
  if (!entry) {
    entry = foldWithMap(original);
    if (foldCache.size >= FOLD_CACHE_SIZE) foldCache.delete(foldCache.keys().next().value!);
    foldCache.set(original, entry);
  }
  return entry;
}

/** Every place where one of the words appears, in the original text, sorted, overlaps joined. */
export function findMatches(original: string, words: string[]): [number, number][] {
  if (words.length === 0 || original === '') return [];
  const { text, at } = folded(original);
  const found: [number, number][] = [];
  for (const word of words) {
    for (let from = text.indexOf(word); from >= 0; from = text.indexOf(word, from + word.length)) {
      found.push([at[from]!, at[from + word.length]!]);
    }
  }
  found.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const joined: [number, number][] = [];
  for (const range of found) {
    const last = joined[joined.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else joined.push([...range]);
  }
  return joined;
}

/** True when every word appears somewhere in the texts together. */
function hasAll(texts: string[], words: string[]): boolean {
  const all = texts.map((t) => folded(t).text);
  return words.every((word) => all.some((t) => t.includes(word)));
}

const SNIPPET_BEFORE = 40;
const SNIPPET_LENGTH = 140;

/** A short piece of the text around one match, cut at word boundaries where it can be, with every match inside marked. */
export function snippetAt(original: string, matches: [number, number][], index: number): Marked {
  const [start] = matches[index] ?? [0, 0];
  let from = Math.max(0, start - SNIPPET_BEFORE);
  if (from > 0) {
    const space = original.indexOf(' ', from);
    if (space >= 0 && space < start) from = space + 1;
  }
  let to = Math.min(original.length, from + SNIPPET_LENGTH);
  if (to < original.length) {
    const space = original.lastIndexOf(' ', to);
    if (space > start) to = space;
  }
  const lead = from > 0 ? '…' : '';
  const piece = original.slice(from, to);
  // Whitespace runs become one space; the marks must follow, so map each character.
  let text = lead;
  const at: number[] = [];
  let lastSpace = false;
  for (let i = 0; i < piece.length; i++) {
    const char = piece[i]!;
    const space = /\s/u.test(char);
    at.push(text.length);
    if (space && lastSpace) continue;
    text += space ? ' ' : char;
    lastSpace = space;
  }
  at.push(text.length);
  if (to < original.length) text += '…';
  const marks = matches
    .filter(([a, b]) => a >= from && b <= to)
    .map(([a, b]): [number, number] => [at[a - from]!, at[b - from]!]);
  return { text, marks };
}

/** Text with no match: the name as it is, nothing marked. */
const plain = (text: string): Marked => ({ text, marks: [] });

const SNIPPETS_PER_PAGE = 3;

/** A page that matched: by its title, its text, or both. */
export interface PageHit {
  kind: 'page';
  page: Page;
  title: Marked;
  /** Matches in the page's text. */
  count: number;
  /** Up to three places in the text, each around a different match. */
  snippets: Marked[];
}

/** A PDF in a page whose text matched. */
export interface PdfHit {
  kind: 'pdf';
  attachmentId: Id;
  name: Marked;
  /** The page that shows the PDF. The result is listed in that page's notebook. */
  page: Page;
  /** Matches in the PDF, on all its pages. */
  count: number;
  /** The first PDF page with a match, from 1. */
  firstPage: number;
  /** PDF pages with a match, from 1. */
  pages: number[];
  snippet: Marked;
}

export type SearchHit = PageHit | PdfHit;

/** Results in one notebook, or among the loose pages (notebook null). */
export interface SearchGroup {
  notebook: Notebook | null;
  /** The notebook's name, marked when it matched. */
  name: Marked;
  /** True when the notebook's own name matched. */
  nameMatched: boolean;
  hits: SearchHit[];
}

export interface SearchResults {
  groups: SearchGroup[];
  /** Pages and PDFs found, before any limit. */
  total: number;
  /** Matches in all text, before any limit. */
  matches: number;
}

export interface SearchSource {
  notebooks: Notebook[];
  pages: Page[];
  /** The stored text of PDFs by attachment ID. */
  pdfTexts?: Map<Id, string[]>;
  /** File names by attachment ID. */
  fileNames?: Map<Id, string>;
  /** For each file, the live pages that show it. */
  fileUses?: Map<Id, Page[]>;
}

interface Scored {
  hit: SearchHit;
  score: number;
  updatedAt: number;
}

/** A title that holds the whole query ranks first, then one that starts with it. */
function titleScore(title: string, words: string[], query: string): number {
  const text = folded(title).text;
  if (!words.every((word) => text.includes(word))) return 0;
  if (text === query) return 100;
  return text.startsWith(words[0]!) ? 60 : 40;
}

/** Search everything. `limit` caps the hits kept; `total` and `matches` count them all. */
export function searchEverything(source: SearchSource, query: string, limit = 200): SearchResults {
  const words = queryWords(query);
  if (words.length === 0) return { groups: [], total: 0, matches: 0 };
  const whole = words.join(' ');
  const scored: Scored[] = [];
  let matches = 0;

  for (const page of source.pages) {
    if (!hasAll([page.title, page.plainText], words)) continue;
    const inTitle = titleScore(page.title, words, whole);
    const found = findMatches(page.plainText, words);
    if (!inTitle && found.length === 0) continue;
    matches += found.length;
    // Snippets around matches that are apart from each other, not three of the same line.
    const snippets: Marked[] = [];
    let shownTo = -1;
    for (let i = 0; i < found.length && snippets.length < SNIPPETS_PER_PAGE; i++) {
      if (found[i]![0] < shownTo) continue;
      snippets.push(snippetAt(page.plainText, found, i));
      shownTo = found[i]![0] + SNIPPET_LENGTH;
    }
    scored.push({
      score: inTitle + Math.min(found.length, 20),
      updatedAt: page.updatedAt,
      hit: { kind: 'page', page, title: { text: page.title, marks: findMatches(page.title, words) }, count: found.length, snippets },
    });
  }

  for (const [attachmentId, texts] of source.pdfTexts ?? []) {
    const shownIn = source.fileUses?.get(attachmentId) ?? [];
    if (shownIn.length === 0) continue;
    const name = source.fileNames?.get(attachmentId) ?? '';
    if (!hasAll([name, ...texts], words)) continue;
    let count = 0;
    const pages: number[] = [];
    let snippet: Marked | null = null;
    texts.forEach((text, index) => {
      const found = findMatches(text, words);
      if (found.length === 0) return;
      count += found.length;
      pages.push(index + 1);
      snippet ??= snippetAt(text, found, 0);
    });
    const nameMarks = findMatches(name, words);
    if (count === 0 && nameMarks.length === 0) continue;
    matches += count;
    // A file shown in several pages is listed under each, so it is found from every notebook that holds it.
    for (const page of shownIn) {
      scored.push({
        score: titleScore(name, words, whole) / 2 + Math.min(count, 20),
        updatedAt: page.updatedAt,
        hit: { kind: 'pdf', attachmentId, name: { text: name, marks: nameMarks }, page, count, firstPage: pages[0] ?? 1, pages, snippet: snippet ?? plain('') },
      });
    }
  }

  scored.sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt);
  const total = scored.length;

  // Group by notebook, keeping the order of each notebook's best hit.
  const notebookOf = new Map(source.notebooks.map((n) => [n.id, n]));
  const groups = new Map<Id | null, SearchGroup>();
  const groupFor = (notebook: Notebook | null): SearchGroup => {
    const key = notebook?.id ?? null;
    let group = groups.get(key);
    if (!group) {
      const nameMarks = notebook ? findMatches(notebook.name, words) : [];
      group = { notebook, name: notebook ? { text: notebook.name, marks: nameMarks } : plain(''), nameMatched: notebook ? titleScore(notebook.name, words, whole) > 0 : false, hits: [] };
      groups.set(key, group);
    }
    return group;
  };
  // Notebooks whose name matches come first, even when nothing inside them does.
  for (const notebook of [...source.notebooks].sort((a, b) => titleScore(b.name, words, whole) - titleScore(a.name, words, whole))) {
    if (titleScore(notebook.name, words, whole) > 0) groupFor(notebook);
  }
  for (const { hit } of scored.slice(0, limit)) {
    groupFor(hit.page.notebookId ? (notebookOf.get(hit.page.notebookId) ?? null) : null).hits.push(hit);
  }
  return { groups: [...groups.values()], total, matches };
}
