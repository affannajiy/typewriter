import type { DocNode, Id, Page } from '@/types/models';

/**
 * Links between pages, read from the pages' documents (ARCHITECTURE.md, D16).
 *
 * A `pageLink` node names its target by ID. Nothing else stores the links:
 * the index below is derived from the documents the workspace query already
 * holds, and cached per page object, so it cannot fall out of step with them.
 */

export const PAGE_LINK_TYPE = 'pageLink';

/** Every page a document links to, once each, in order of first appearance. */
export function linksIn(doc: DocNode | undefined): Id[] {
  const found = new Set<Id>();
  const visit = (node: DocNode) => {
    if (node.type === PAGE_LINK_TYPE) {
      const id = node.attrs?.pageId;
      if (typeof id === 'string' && id !== '') found.add(id);
    }
    node.content?.forEach(visit);
  };
  if (doc) visit(doc);
  return [...found];
}

// A saved page is a new object, so a cache keyed by the object is never stale.
const cache = new WeakMap<Page, Id[]>();

export function pageLinks(page: Page): Id[] {
  let links = cache.get(page);
  if (!links) cache.set(page, (links = linksIn(page.content)));
  return links;
}

export interface LinkIndex {
  /** Pages each page links to, existing pages only, never itself. */
  outgoing: Map<Id, Id[]>;
  /** Pages that link to each page. */
  incoming: Map<Id, Id[]>;
}

/** Links among the given pages. A link to a page that is not in the list is left out. */
export function buildLinkIndex(pages: Page[]): LinkIndex {
  const known = new Set(pages.map((page) => page.id));
  const outgoing = new Map<Id, Id[]>();
  const incoming = new Map<Id, Id[]>();
  for (const page of pages) {
    const targets = pageLinks(page).filter((id) => id !== page.id && known.has(id));
    outgoing.set(page.id, targets);
    for (const target of targets) {
      const list = incoming.get(target);
      if (list) list.push(page.id);
      else incoming.set(target, [page.id]);
    }
  }
  return { outgoing, incoming };
}

/** Pages that link to `pageId`, by title. */
export function backlinks(pageId: Id, pages: Page[]): Page[] {
  return pages
    .filter((page) => page.id !== pageId && pageLinks(page).includes(pageId))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export interface LinkTarget {
  id: Id;
  title: string;
  /** Where the page lives, for telling apart pages with the same title. */
  location: string;
}

const fold = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

/**
 * Pages to offer after "[[", best first: titles that start with the query,
 * then titles that contain every word of it. An empty query offers the most
 * recently changed pages.
 */
export function matchTargets(targets: (LinkTarget & { updatedAt: number })[], query: string, limit = 8): LinkTarget[] {
  const words = fold(query).split(/\s+/u).filter(Boolean);
  if (words.length === 0) return [...targets].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  const whole = fold(query.trim());
  return targets
    .flatMap((target) => {
      const title = fold(target.title);
      if (!words.every((word) => title.includes(word))) return [];
      return [{ target, rank: title === whole ? 0 : title.startsWith(whole) ? 1 : 2 }];
    })
    .sort((a, b) => a.rank - b.rank || a.target.title.localeCompare(b.target.title))
    .slice(0, limit)
    .map((entry) => entry.target);
}
