import { db } from '@/database/db';
import type { DocNode, Id, Page, PageLayout, PageLocation } from '@/types/models';
import { RepositoryError, bump, cleanName, found, freshVersion, isLive, notTrashed, now, orderAfter } from './common';

export const EMPTY_DOC: DocNode = { type: 'doc', content: [{ type: 'paragraph' }] };
export const UNTITLED_PAGE = 'Untitled';

/** Flatten a document to plain text, one line per block. Used for search and previews. */
export function docToPlainText(doc: DocNode): string {
  const lines: string[] = [];
  const visit = (node: DocNode): string => {
    if (typeof node.text === 'string') return node.text;
    // A line break inside a block separates words, so it must not vanish.
    if (node.type === 'hardBreak') return '\n';
    return (node.content ?? []).map(visit).join('');
  };
  const walk = (node: DocNode) => {
    const children = node.content ?? [];
    const isLeafBlock = children.length === 0 || children.every((c) => typeof c.text === 'string' || !c.content);
    if (node.type !== 'doc' && isLeafBlock) lines.push(visit(node));
    else children.forEach(walk);
  };
  walk(doc);
  return lines.join('\n');
}

/**
 * Apply a patch to pages without the revision bump of a normal edit.
 * Uses modify() with a function because Dexie's update() key-path type
 * cannot follow the recursive document type.
 */
export async function patchPages(ids: Id[], patch: Partial<Page>): Promise<void> {
  await db.pages
    .where('id')
    .anyOf(ids)
    .modify((page) => {
      Object.assign(page, patch);
    });
}

export async function listPages(): Promise<Page[]> {
  return (await db.pages.toArray()).filter(isLive);
}

export const getPage = (id: Id) => db.pages.get(id);

const sameLocation = (page: PageLocation, location: PageLocation) =>
  page.notebookId === location.notebookId && page.folderId === location.folderId;

async function checkLocation(location: PageLocation): Promise<void> {
  if (location.notebookId !== null && location.folderId !== null) {
    throw new RepositoryError('invalid-move', 'A page has one location: a notebook or a folder');
  }
  if (location.notebookId !== null) {
    const notebook = found(await db.notebooks.get(location.notebookId), 'Destination notebook');
    if (!isLive(notebook)) throw new RepositoryError('invalid-move', 'The destination notebook is in the Trash');
  }
  if (location.folderId !== null) {
    const folder = found(await db.folders.get(location.folderId), 'Destination folder');
    if (!isLive(folder)) throw new RepositoryError('invalid-move', 'The destination folder is in the Trash');
  }
}

export async function createPage(input: Partial<PageLocation> & { title?: string } = {}): Promise<Page> {
  const location: PageLocation = { notebookId: input.notebookId ?? null, folderId: input.folderId ?? null };
  return db.transaction('rw', db.pages, db.notebooks, db.folders, async () => {
    await checkLocation(location);
    const siblings = (await listPages()).filter((p) => sameLocation(p, location));
    const page: Page = {
      ...freshVersion(),
      ...notTrashed,
      ...location,
      title: cleanName(input.title ?? '', UNTITLED_PAGE),
      content: EMPTY_DOC,
      plainText: '',
      layout: 'continuous',
      tagIds: [],
      favourite: false,
      pinned: false,
      order: orderAfter(siblings),
      lastOpenedAt: null,
    };
    await db.pages.add(page);
    return page;
  });
}

/**
 * The autosave write. Resolves only after IndexedDB has committed the
 * transaction, so the caller may then show "Saved".
 */
export async function savePageDraft(id: Id, draft: { title: string; content: DocNode }): Promise<void> {
  await db.transaction('rw', db.pages, async () => {
    const page = found(await db.pages.get(id), 'Page');
    await patchPages(
      [id],
      bump(page, {
        title: cleanName(draft.title, UNTITLED_PAGE),
        content: draft.content,
        plainText: docToPlainText(draft.content),
      }),
    );
  });
}

export async function renamePage(id: Id, title: string): Promise<void> {
  await db.transaction('rw', db.pages, async () => {
    const page = found(await db.pages.get(id), 'Page');
    await patchPages([id], bump(page, { title: cleanName(title, page.title) }));
  });
}

export async function setPageFlags(id: Id, flags: { favourite?: boolean; pinned?: boolean }): Promise<void> {
  await db.transaction('rw', db.pages, async () => {
    const page = found(await db.pages.get(id), 'Page');
    await patchPages([id], bump(page, flags));
  });
}

export async function setPageTags(id: Id, tagIds: Id[]): Promise<void> {
  await db.transaction('rw', db.pages, async () => {
    const page = found(await db.pages.get(id), 'Page');
    await patchPages([id], bump(page, { tagIds: [...new Set(tagIds)] }));
  });
}

export async function setPageLayout(id: Id, layout: PageLayout): Promise<void> {
  await db.transaction('rw', db.pages, async () => {
    const page = found(await db.pages.get(id), 'Page');
    if (page.layout !== layout) await patchPages([id], bump(page, { layout }));
  });
}

/** Opening a page is not an edit: it does not change `updatedAt` or `rev`. */
export async function markPageOpened(id: Id): Promise<void> {
  await patchPages([id], { lastOpenedAt: now() });
}

/** Moving keeps the page ID, so links and references to the page survive. */
export async function movePage(id: Id, location: PageLocation): Promise<void> {
  await db.transaction('rw', db.pages, db.notebooks, db.folders, async () => {
    const page = found(await db.pages.get(id), 'Page');
    await checkLocation(location);
    if (sameLocation(page, location)) return;
    const siblings = (await listPages()).filter((p) => sameLocation(p, location));
    await patchPages([id], bump(page, { ...location, order: orderAfter(siblings) }));
  });
}
