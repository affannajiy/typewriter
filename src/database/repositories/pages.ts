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
    // An equation is searchable by its source.
    if (node.type === 'mathInline' || node.type === 'mathBlock') return String(node.attrs?.latex ?? '');
    return (node.content ?? []).map(visit).join('');
  };
  const walk = (node: DocNode) => {
    // A drawing holds no text: it is not a line, not even an empty one.
    if (node.type === 'drawing') return;
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

const sameLocation = (page: PageLocation, location: PageLocation) => page.notebookId === location.notebookId;

async function checkLocation(location: PageLocation): Promise<void> {
  if (location.notebookId !== null) {
    const notebook = found(await db.notebooks.get(location.notebookId), 'Destination notebook');
    if (!isLive(notebook)) throw new RepositoryError('invalid-move', 'The destination notebook is in the Trash');
  }
}

export async function createPage(input: Partial<PageLocation> & { title?: string } = {}): Promise<Page> {
  const location: PageLocation = { notebookId: input.notebookId ?? null };
  return db.transaction('rw', db.pages, db.notebooks, async () => {
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
  await db.transaction('rw', db.pages, db.notebooks, async () => {
    const page = found(await db.pages.get(id), 'Page');
    await checkLocation(location);
    if (sameLocation(page, location)) return;
    const siblings = (await listPages()).filter((p) => sameLocation(p, location));
    await patchPages([id], bump(page, { ...location, order: orderAfter(siblings) }));
  });
}

/**
 * Put a file into its empty block in the stored page: used when a recording
 * finishes after its page was closed, so the editor is no longer there to do
 * it. The block is found by its block ID. If it is gone, or was never saved,
 * a new block with the file goes at the end of the page, so the recording
 * is never left where no page shows it.
 */
export async function fillFileBlock(pageId: Id, blockId: string | null, kind: 'audio' | 'pdf', attachmentId: Id): Promise<void> {
  await db.transaction('rw', db.pages, async () => {
    const page = await db.pages.get(pageId);
    if (!page) return;
    let filled = false;
    const visit = (node: DocNode): DocNode => {
      if (!filled && blockId !== null && node.type === kind && node.attrs?.id === blockId && !node.attrs?.attachmentId) {
        filled = true;
        return { ...node, attrs: { ...node.attrs, attachmentId } };
      }
      return node.content ? { ...node, content: node.content.map(visit) } : node;
    };
    let content = visit(page.content);
    if (!filled) content = { ...content, content: [...(content.content ?? []), { type: kind, attrs: { attachmentId } }] };
    await patchPages([pageId], bump(page, { content, plainText: docToPlainText(content) }));
  });
}
