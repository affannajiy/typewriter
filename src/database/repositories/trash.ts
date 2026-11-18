import { db } from '@/database/db';
import type { Id, ItemKind, ItemRef, Notebook, Page } from '@/types/models';
import { RepositoryError, found, isLive, newId, now } from './common';
import { deleteAttachmentsOnlyIn } from './attachments';
import { deleteDrawingsOfPages } from './drawings';
import { patchPages } from './pages';

/**
 * Trash.
 *
 * Deleting an item moves it, and everything inside it, to the Trash as one
 * batch. A batch restores as a unit. Nothing is ever purged automatically:
 * rows leave the database only through purgeBatch() or emptyTrash().
 */

export interface TrashEntry {
  batchId: Id;
  root: ItemRef;
  name: string;
  /** Number of items in the batch, including the root. */
  count: number;
  deletedAt: number;
}

export interface RestoreResult {
  restored: number;
  /** True when a page's notebook no longer exists and the page came back as a loose page. */
  relocated: boolean;
}

const tables = () => [db.notebooks, db.pages] as const;
/** What a permanent deletion also touches: drawings and files belong to pages. */
const fileTables = () => [db.drawings, db.attachments, db.attachmentData, db.annotations, db.pdfTexts] as const;

/** Move an item and its contents to the Trash. */
export async function trashItem(ref: ItemRef): Promise<{ batchId: Id; count: number }> {
  return db.transaction('rw', tables(), async () => {
    const batchId = newId();
    const mark: Partial<Page> = { deletedAt: now(), trashBatchId: batchId };
    const pages = (await db.pages.toArray()).filter(isLive);
    let notebookIds: Id[] = [];
    let pageIds: Id[];

    if (ref.kind === 'page') {
      found(pages.find((p) => p.id === ref.id), 'Page');
      pageIds = [ref.id];
    } else {
      const notebook = found(await db.notebooks.get(ref.id), 'Notebook');
      if (!isLive(notebook)) throw new RepositoryError('not-found', 'Notebook not found');
      notebookIds = [ref.id];
      pageIds = pages.filter((p) => p.notebookId === ref.id).map((p) => p.id);
    }

    await db.notebooks.where('id').anyOf(notebookIds).modify(mark);
    await patchPages(pageIds, mark);
    return { batchId, count: notebookIds.length + pageIds.length };
  });
}

interface Batch {
  notebooks: Notebook[];
  pages: Page[];
}

async function loadBatch(batchId: Id): Promise<Batch> {
  const [notebooks, pages] = await Promise.all([
    db.notebooks.where('trashBatchId').equals(batchId).toArray(),
    db.pages.where('trashBatchId').equals(batchId).toArray(),
  ]);
  return { notebooks, pages };
}

/**
 * The root of a batch: its notebook, or else the one page whose notebook is
 * not part of the batch. A batch made before 0.8.0 from a folder can hold
 * several notebooks: the first one names it.
 */
function findRoot(batch: Batch): { kind: ItemKind; item: Notebook | Page } | null {
  const notebook = batch.notebooks[0];
  if (notebook) return { kind: 'notebook', item: notebook };
  const page = batch.pages[0];
  return page ? { kind: 'page', item: page } : null;
}

const displayName = (kind: ItemKind, item: Notebook | Page) => (kind === 'page' ? (item as Page).title : (item as Notebook).name);

export async function listTrash(): Promise<TrashEntry[]> {
  const [notebooks, pages] = await Promise.all([db.notebooks.toArray(), db.pages.toArray()]);
  const batches = new Map<Id, Batch>();
  const slot = (id: Id) => {
    let batch = batches.get(id);
    if (!batch) batches.set(id, (batch = { notebooks: [], pages: [] }));
    return batch;
  };
  for (const n of notebooks) if (n.trashBatchId) slot(n.trashBatchId).notebooks.push(n);
  for (const p of pages) if (p.trashBatchId) slot(p.trashBatchId).pages.push(p);

  const entries: TrashEntry[] = [];
  for (const [batchId, batch] of batches) {
    const root = findRoot(batch);
    if (!root) continue;
    entries.push({
      batchId,
      root: { kind: root.kind, id: root.item.id },
      name: displayName(root.kind, root.item),
      count: batch.notebooks.length + batch.pages.length,
      deletedAt: root.item.deletedAt ?? 0,
    });
  }
  return entries.sort((a, b) => b.deletedAt - a.deletedAt);
}

/**
 * Restore a batch to where it was. A page whose notebook is gone, or is
 * itself in the Trash, comes back as a loose page instead.
 */
export async function restoreBatch(batchId: Id): Promise<RestoreResult> {
  return db.transaction('rw', tables(), async () => {
    const batch = await loadBatch(batchId);
    const unmark: Partial<Page> = { deletedAt: null, trashBatchId: null };
    await db.notebooks.where('trashBatchId').equals(batchId).modify(unmark);
    await patchPages(batch.pages.map((p) => p.id), unmark);

    let relocated = false;
    for (const page of batch.pages) {
      if (page.notebookId === null) continue;
      const notebook = await db.notebooks.get(page.notebookId);
      if (notebook === undefined || !isLive(notebook)) {
        await patchPages([page.id], { notebookId: null });
        relocated = true;
      }
    }
    return { restored: batch.notebooks.length + batch.pages.length, relocated };
  });
}

/** Permanently delete one batch. This cannot be undone. */
export async function purgeBatch(batchId: Id): Promise<number> {
  return db.transaction('rw', [...tables(), ...fileTables()], async () => {
    // A page's drawings go with it, and so do files no other page uses.
    const pageIds = await db.pages.where('trashBatchId').equals(batchId).primaryKeys();
    await deleteDrawingsOfPages(pageIds);
    await deleteAttachmentsOnlyIn(pageIds);
    const counts = await Promise.all([
      db.notebooks.where('trashBatchId').equals(batchId).delete(),
      db.pages.where('trashBatchId').equals(batchId).delete(),
    ]);
    return counts.reduce((a, b) => a + b, 0);
  });
}

/** Permanently delete everything in the Trash. This cannot be undone. */
export async function emptyTrash(): Promise<number> {
  return db.transaction('rw', [...tables(), ...fileTables()], async () => {
    const trashed = (item: { deletedAt: number | null }) => item.deletedAt !== null;
    const pageIds = await db.pages.filter(trashed).primaryKeys();
    await deleteDrawingsOfPages(pageIds);
    await deleteAttachmentsOnlyIn(pageIds);
    const counts = await Promise.all([
      db.notebooks.filter(trashed).delete(),
      db.pages.filter(trashed).delete(),
    ]);
    return counts.reduce((a, b) => a + b, 0);
  });
}
