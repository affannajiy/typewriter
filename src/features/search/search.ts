import type { Folder, Id, Notebook, Page } from '@/types/models';

/**
 * Global search over the names of folders, notebooks and pages, and over the
 * text of pages (`plainText`, derived on every save).
 *
 * It scans the workspace that is already in memory: no index to build or to
 * keep in step. Every word of the query must appear; case and accents are
 * ignored. Items in the Trash are not in the workspace, so they are not found.
 */

export interface SearchSource {
  folders: Folder[];
  notebooks: Notebook[];
  pages: Page[];
}

export interface SearchHit {
  kind: 'page' | 'notebook' | 'folder';
  id: Id;
  title: string;
  /** For a page whose text matched: the text around the first match. */
  snippet: string;
  /** Name of the notebook or folder that holds the item. Empty at the top level. */
  location: string;
}

export const MAX_QUERY_LENGTH = 200;

/** Lower case, without accents: "Élan" and "elan" compare equal. */
export const fold = (text: string): string => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

export const queryWords = (query: string): string[] => fold(query.slice(0, MAX_QUERY_LENGTH)).split(/\s+/u).filter(Boolean);

// Folding a long text on every key press is the costly part, so it is done once per page object.
const foldedText = new WeakMap<Page, string>();
function foldedBody(page: Page): string {
  let text = foldedText.get(page);
  if (text === undefined) {
    text = fold(page.plainText);
    foldedText.set(page, text);
  }
  return text;
}

const SNIPPET_BEFORE = 30;
const SNIPPET_LENGTH = 120;

/** A short piece of the text around the first word found, cut at word boundaries where it can be. */
export function snippetAround(text: string, words: string[]): string {
  const flat = text.replace(/\s+/gu, ' ').trim();
  const lower = flat.toLowerCase();
  const found = words.map((word) => lower.indexOf(word)).filter((index) => index >= 0);
  const at = found.length > 0 ? Math.min(...found) : 0;
  let start = Math.max(0, at - SNIPPET_BEFORE);
  if (start > 0) {
    const space = flat.indexOf(' ', start);
    if (space >= 0 && space < at) start = space + 1;
  }
  const end = Math.min(flat.length, start + SNIPPET_LENGTH);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
}

interface Ranked {
  hit: SearchHit;
  score: number;
  updatedAt: number;
}

function titleScore(title: string, words: string[]): number {
  const folded = fold(title);
  if (!words.every((word) => folded.includes(word))) return 0;
  // An exact name first, then a name that starts with the query, then any name match.
  if (folded === words.join(' ')) return 100;
  return folded.startsWith(words[0]!) ? 60 : 40;
}

export function searchWorkspace(source: SearchSource, query: string, limit = 20): SearchHit[] {
  const words = queryWords(query);
  if (words.length === 0) return [];
  const notebookName = new Map(source.notebooks.map((n) => [n.id, n.name]));
  const folderName = new Map(source.folders.map((f) => [f.id, f.name]));
  const inFolder = (id: Id | null) => (id ? (folderName.get(id) ?? '') : '');
  const ranked: Ranked[] = [];

  for (const page of source.pages) {
    const inTitle = titleScore(page.title, words);
    const body = foldedBody(page);
    const title = fold(page.title);
    const inBody = words.every((word) => body.includes(word) || title.includes(word)) && words.some((word) => body.includes(word));
    if (!inTitle && !inBody) continue;
    ranked.push({
      score: inTitle + (inBody ? 10 : 0),
      updatedAt: page.updatedAt,
      hit: {
        kind: 'page',
        id: page.id,
        title: page.title,
        snippet: inBody ? snippetAround(page.plainText, words) : '',
        location: page.notebookId ? (notebookName.get(page.notebookId) ?? '') : inFolder(page.folderId),
      },
    });
  }
  for (const notebook of source.notebooks) {
    const score = titleScore(notebook.name, words);
    if (score) ranked.push({ score, updatedAt: notebook.updatedAt, hit: { kind: 'notebook', id: notebook.id, title: notebook.name, snippet: '', location: inFolder(notebook.folderId) } });
  }
  for (const folder of source.folders) {
    const score = titleScore(folder.name, words);
    if (score) ranked.push({ score, updatedAt: folder.updatedAt, hit: { kind: 'folder', id: folder.id, title: folder.name, snippet: '', location: inFolder(folder.parentId) } });
  }

  // Best match first; among equals, the most recently edited.
  return ranked
    .sort((a, b) => b.score - a.score || b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map((entry) => entry.hit);
}
