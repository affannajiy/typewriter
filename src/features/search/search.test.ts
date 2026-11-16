import { describe, expect, it } from 'vitest';
import type { Folder, Notebook, Page } from '@/types/models';
import { type SearchSource, queryWords, searchWorkspace, snippetAround } from './search';

const base = { createdAt: 1, updatedAt: 1, rev: 1, deletedAt: null, trashBatchId: null };

const page = (id: string, title: string, plainText: string, extra: Partial<Page> = {}): Page => ({
  ...base,
  id,
  title,
  plainText,
  content: { type: 'doc' },
  notebookId: null,
  folderId: null,
  layout: 'continuous',
  tagIds: [],
  favourite: false,
  pinned: false,
  order: 1,
  lastOpenedAt: null,
  ...extra,
});
const notebook = (id: string, name: string, folderId: string | null = null): Notebook => ({ ...base, id, name, description: '', folderId, cover: { kind: 'solid', colour: '#000000' }, icon: null, tagIds: [], favourite: false, order: 1 });
const folder = (id: string, name: string, parentId: string | null = null): Folder => ({ ...base, id, name, parentId, order: 1 });

const source: SearchSource = {
  folders: [folder('f1', 'Science'), folder('f2', 'Chemistry archive', 'f1')],
  notebooks: [notebook('n1', 'Organic Chemistry', 'f1'), notebook('n2', 'History')],
  pages: [
    page('p1', 'Alkanes', 'Saturated hydrocarbons. General formula CnH2n+2.', { notebookId: 'n1' }),
    page('p2', 'Alkenes', 'Unsaturated hydrocarbons with a double bond.', { notebookId: 'n1', updatedAt: 5 }),
    page('p3', 'The Printing Press', 'Gutenberg, around 1440. Movable type changed the café conversation.', { notebookId: 'n2' }),
    page('p4', 'Chemistry reading list', 'Nothing yet.', { folderId: 'f1' }),
    page('p5', 'Loose thoughts', 'A page at the top level about tide pools.'),
  ],
};

const found = (query: string) => searchWorkspace(source, query).map((hit) => `${hit.kind}:${hit.id}`);

describe('global search', () => {
  it('returns nothing for an empty or blank query', () => {
    expect(found('')).toEqual([]);
    expect(found('   ')).toEqual([]);
  });

  it('finds a page by a word in its text', () => {
    expect(found('gutenberg')).toEqual(['page:p3']);
  });

  it('finds pages, notebooks and folders by name', () => {
    expect(found('chemistry').sort()).toEqual(['folder:f2', 'notebook:n1', 'page:p4']);
  });

  it('requires every word, in the title or the text', () => {
    expect(found('hydrocarbons double')).toEqual(['page:p2']);
    expect(found('alkanes formula')).toEqual(['page:p1']);
    expect(found('hydrocarbons zebra')).toEqual([]);
  });

  it('ignores case and accents', () => {
    expect(found('GUTENBERG')).toEqual(['page:p3']);
    expect(found('cafe')).toEqual(['page:p3']);
    expect(found('café')).toEqual(['page:p3']);
  });

  it('puts a name match before a text match, and newer before older', () => {
    const extra: SearchSource = { ...source, pages: [...source.pages, page('p6', 'Notes', 'Alkanes burn cleanly.', { updatedAt: 9 })] };
    expect(searchWorkspace(extra, 'alkanes').map((hit) => hit.id)).toEqual(['p1', 'p6']);
    // Equal score: the most recently edited first.
    expect(found('hydrocarbons')).toEqual(['page:p2', 'page:p1']);
  });

  it('ranks an exact name above a name that only contains the query', () => {
    expect(found('history')[0]).toBe('notebook:n2');
    const hits = searchWorkspace({ ...source, pages: [...source.pages, page('p7', 'History of type', '')] }, 'history');
    expect(hits.map((hit) => hit.id)).toEqual(['n2', 'p7']);
  });

  it('says where each result lives', () => {
    const [hit] = searchWorkspace(source, 'gutenberg');
    expect(hit).toMatchObject({ kind: 'page', title: 'The Printing Press', location: 'History' });
    expect(searchWorkspace(source, 'reading list')[0]?.location).toBe('Science');
    expect(searchWorkspace(source, 'tide')[0]?.location).toBe('');
    expect(searchWorkspace(source, 'archive')[0]).toMatchObject({ kind: 'folder', location: 'Science' });
  });

  it('gives a snippet around the match in the text, and none for a name-only match', () => {
    expect(searchWorkspace(source, 'gutenberg')[0]?.snippet).toContain('Gutenberg, around 1440');
    expect(searchWorkspace(source, 'reading list')[0]?.snippet).toBe('');
  });

  it('respects the limit', () => {
    const many: SearchSource = { folders: [], notebooks: [], pages: Array.from({ length: 50 }, (_, i) => page(`x${i}`, `Note ${i}`, 'same words')) };
    expect(searchWorkspace(many, 'same', 12)).toHaveLength(12);
  });

  it('treats the query as plain text, not as a pattern', () => {
    expect(found('CnH2n+2.')).toEqual(['page:p1']);
    expect(found('.*')).toEqual([]);
    expect(found('[')).toEqual([]);
  });

  it('bounds the length of a query', () => {
    expect(queryWords('a'.repeat(5000))[0]).toHaveLength(200);
  });
});

describe('snippets', () => {
  const long = `${'Intro words here. '.repeat(10)}The needle is in this sentence. ${'More words after. '.repeat(20)}`;

  it('starts shortly before the match and marks the cut ends', () => {
    const snippet = snippetAround(long, ['needle']);
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet).toContain('needle');
    expect(snippet.length).toBeLessThanOrEqual(122);
  });

  it('shows a short text whole and flattens line breaks', () => {
    expect(snippetAround('one\ntwo\n\nthree', ['two'])).toBe('one two three');
  });
});
