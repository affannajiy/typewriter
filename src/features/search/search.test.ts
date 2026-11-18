import { getSchema } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { schemaExtensions } from '@/features/editor/extensions';
import { findInDoc } from '@/features/editor/findInPage';
import type { Notebook, Page } from '@/types/models';
import { type SearchSource, findMatches, queryWords, searchEverything, snippetAt } from './search';

const base = { createdAt: 1, updatedAt: 1, rev: 1, deletedAt: null, trashBatchId: null };

const page = (id: string, title: string, plainText: string, extra: Partial<Page> = {}): Page => ({
  ...base,
  id,
  title,
  plainText,
  content: { type: 'doc' },
  notebookId: null,
  layout: 'continuous',
  favourite: false,
  pinned: false,
  order: 1,
  lastOpenedAt: null,
  ...extra,
});
const notebook = (id: string, name: string): Notebook => ({ ...base, id, name, description: '', cover: { kind: 'solid', colour: '#000000' }, icon: null, favourite: false, order: 1 });

const pages = [
  page('p1', 'Alkanes', 'Saturated hydrocarbons. General formula CnH2n+2. Hydrocarbons burn.', { notebookId: 'n1' }),
  page('p2', 'Alkenes', 'Unsaturated hydrocarbons with a double bond.', { notebookId: 'n1', updatedAt: 5 }),
  page('p3', 'The Printing Press', 'Gutenberg, around 1440. Movable type changed the café conversation.', { notebookId: 'n2' }),
  page('p5', 'Loose thoughts', 'A page outside every notebook about tide pools.'),
];
const source: SearchSource = {
  notebooks: [notebook('n1', 'Organic Chemistry'), notebook('n2', 'History')],
  pages,
  pdfTexts: new Map([['f1', ['Cover page', 'Lecture 4: hydrocarbons and their reactions.', 'More hydrocarbons here.']]]),
  fileNames: new Map([['f1', 'Lecture 4 slides']]),
  fileUses: new Map([['f1', [pages[3]!]]]),
};

/** Each group as "notebook: hit, hit". */
const grouped = (query: string) =>
  searchEverything(source, query).groups.map((g) => `${g.notebook?.id ?? 'loose'}: ${g.hits.map((h) => (h.kind === 'page' ? h.page.id : `pdf ${h.attachmentId}`)).join(', ')}`);

describe('search', () => {
  it('finds words inside the text of every notebook, grouped by notebook', () => {
    expect(grouped('hydrocarbons')).toEqual(['n1: p1, p2', 'loose: pdf f1']);
  });

  it('counts every match, not just the first', () => {
    const results = searchEverything(source, 'hydrocarbons');
    const alkanes = results.groups[0]!.hits[0]!;
    expect(alkanes).toMatchObject({ kind: 'page', count: 2 });
    expect(results.matches).toBe(2 + 1 + 2);
    expect(results.total).toBe(3);
  });

  it('needs every word, anywhere in the page', () => {
    expect(grouped('unsaturated bond')).toEqual(['n1: p2']);
    expect(grouped('unsaturated gutenberg')).toEqual([]);
  });

  it('ignores case and accents', () => {
    expect(grouped('CAFE')).toEqual(['n2: p3']);
    expect(queryWords('  Élan   élan ')).toEqual(['elan']);
  });

  it('lists a notebook whose name matches, even with nothing inside it matching', () => {
    const results = searchEverything(source, 'history');
    expect(results.groups[0]).toMatchObject({ notebook: { id: 'n2' }, nameMatched: true, hits: [] });
  });

  it('finds a PDF by its text and says on which pages', () => {
    const hit = searchEverything(source, 'reactions').groups[0]!.hits[0]!;
    expect(hit).toMatchObject({ kind: 'pdf', attachmentId: 'f1', firstPage: 2, pages: [2], count: 1, page: { id: 'p5' } });
  });

  it('does not find a PDF that no live page shows', () => {
    expect(grouped('reactions')).toHaveLength(1);
    expect(searchEverything({ ...source, fileUses: new Map() }, 'reactions').groups).toEqual([]);
  });

  it('returns nothing for an empty query', () => {
    expect(searchEverything(source, '   ')).toEqual({ groups: [], total: 0, matches: 0 });
  });
});

describe('matches and snippets', () => {
  it('finds every place of every word, joined where they overlap', () => {
    expect(findMatches('ab abc abcd', ['abc'])).toEqual([
      [3, 6],
      [7, 10],
    ]);
    expect(findMatches('cat catalog', ['cat', 'catalog'])).toEqual([
      [0, 3],
      [4, 11],
    ]);
  });

  it('maps matches back to the original text when folding changes its length', () => {
    // "ﬁ" folds to two letters: the match must still cover the original characters.
    const text = 'Le ﬁlm café';
    const [[start, end]] = findMatches(text, ['cafe']) as [[number, number]];
    expect(text.slice(start, end)).toBe('café');
  });

  it('marks the matches inside a snippet', () => {
    const text = `${'word '.repeat(30)}the needle is here and another needle there ${'more '.repeat(30)}`;
    const matches = findMatches(text, ['needle']);
    const snippet = snippetAt(text, matches, 0);
    expect(snippet.text.startsWith('…')).toBe(true);
    expect(snippet.marks).toHaveLength(2);
    for (const [a, b] of snippet.marks) expect(snippet.text.slice(a, b)).toBe('needle');
  });
});

describe('find in page', () => {
  it('finds every match in the document by its position, including across marks', () => {
    const schema = getSchema(schemaExtensions());
    const doc = schema.nodeFromJSON({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Atoms are ' }, { type: 'text', text: 'atomic', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'No match here.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'ATOM' }] },
      ],
    });
    const matches = findInDoc(doc, ['atom']);
    expect(matches).toHaveLength(3);
    expect(matches.map((m) => doc.textBetween(m.from, m.to))).toEqual(['Atom', 'atom', 'ATOM']);
  });
});
