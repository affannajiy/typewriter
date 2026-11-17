import { describe, expect, it } from 'vitest';
import type { DocNode, Page } from '@/types/models';
import { backlinks, buildLinkIndex, linksIn, matchTargets } from './links';

const link = (pageId: string, title = 'x'): DocNode => ({ type: 'pageLink', attrs: { pageId, title } });
const para = (...content: DocNode[]): DocNode => ({ type: 'paragraph', content });
const doc = (...content: DocNode[]): DocNode => ({ type: 'doc', content });

function page(id: string, title: string, content: DocNode = doc()): Page {
  return { id, title, content, createdAt: 0, updatedAt: 0, rev: 1, deletedAt: null, trashBatchId: null, notebookId: null, folderId: null, plainText: '', layout: 'continuous', tagIds: [], favourite: false, pinned: false, order: 0, lastOpenedAt: null };
}

describe('links between pages', () => {
  it('reads the pages a document links to, once each, in order, at any depth', () => {
    const content = doc(para({ type: 'text', text: 'See ' }, link('b'), link('a')), { type: 'bulletList', content: [{ type: 'listItem', content: [para(link('b'), link('c'))] }] }, para(link('')));
    expect(linksIn(content)).toEqual(['b', 'a', 'c']);
    expect(linksIn(undefined)).toEqual([]);
  });

  it('indexes links both ways, leaving out self-links and pages not in the list', () => {
    const pages = [page('a', 'A', doc(para(link('b'), link('a'), link('gone')))), page('b', 'B', doc(para(link('c')))), page('c', 'C', doc(para(link('b'))))];
    const index = buildLinkIndex(pages);
    expect(index.outgoing.get('a')).toEqual(['b']);
    expect(index.incoming.get('b')).toEqual(['a', 'c']);
    expect(index.incoming.get('a')).toBeUndefined();
    expect(backlinks('b', pages).map((p) => p.title)).toEqual(['A', 'C']);
    expect(backlinks('a', pages)).toEqual([]);
  });

  it('follows a page as it is saved: the cache is per page object', () => {
    const before = page('a', 'A', doc(para(link('b'))));
    expect(backlinks('b', [before, page('b', 'B')])).toHaveLength(1);
    const after = { ...before, content: doc(para({ type: 'text', text: 'no link' })) };
    expect(backlinks('b', [after, page('b', 'B')])).toHaveLength(0);
  });

  it('offers pages for a query: exact titles, then titles that start with it, then the rest', () => {
    const targets = [
      { id: '1', title: 'Cell biology notes', location: '', updatedAt: 1 },
      { id: '2', title: 'Biology', location: '', updatedAt: 2 },
      { id: '3', title: 'Biology exam', location: '', updatedAt: 3 },
      { id: '4', title: 'Chemistry', location: '', updatedAt: 4 },
    ];
    expect(matchTargets(targets, 'biology').map((t) => t.id)).toEqual(['2', '3', '1']);
    expect(matchTargets(targets, 'BIO exam').map((t) => t.id)).toEqual(['3']);
    expect(matchTargets(targets, 'ché').map((t) => t.id)).toEqual(['4']);
    expect(matchTargets(targets, '', 2).map((t) => t.id)).toEqual(['4', '3']);
  });
});
