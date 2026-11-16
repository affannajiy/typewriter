import { db } from '@/database/db';
import type { Folder, Id, ItemKind, ItemRef, Notebook, Page } from '@/types/models';
import { found, isLive, newId, now } from './common';
import { folderSubtreeIds } from './folders';
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
  /** True when the original location no longer exists and the item went to the top level. */
  relocated: boolean;
}

const tables = () => [db.folders, db.notebooks, db.pages] as const;

/** Move an item and its contents to the Trash. */
export async function trashItem(ref: ItemRef): Promise<{ batchId: Id; count: number }> {
  return db.transaction('rw', tables(), async () => {
    const batchId = newId();
    const mark: Partial<Page> = { deletedAt: now(), trashBatchId: batchId };
    const folders = (await db.folders.toArray()).filter(isLive);
    const notebooks = (await db.notebooks.toArray()).filter(isLive);
    const pages = (await db.pages.toArray()).filter(isLive);

    let folderIds = new Set<Id>();
    let notebookIds = new Set<Id>();
    let pageIds: Id[];

    if (ref.kind === 'page') {
      found(pages.find((p) => p.id === ref.id), 'Page');
      pageIds = [ref.id];
    } else {
      if (ref.kind === 'folder') {
        found(folders.find((f) => f.id === ref.id), 'Folder');
        folderIds = folderSubtreeIds(ref.id, folders);
        notebookIds = new Set(notebooks.filter((n) => n.folderId !== null && folderIds.has(n.folderId)).map((n) => n.id));
      } else {
        found(notebooks.find((n) => n.id === ref.id), 'Notebook');
        notebookIds = new Set([ref.id]);
      }
      pageIds = pages
        .filter(
          (p) => (p.folderId !== null && folderIds.has(p.folderId)) || (p.notebookId !== null && notebookIds.has(p.notebookId)),
        )
        .map((p) => p.id);
    }

    await db.folders.where('id').anyOf([...folderIds]).modify(mark);
    await db.notebooks.where('id').anyOf([...notebookIds]).modify(mark);
    await patchPages(pageIds, mark);
    return { batchId, count: folderIds.size + notebookIds.size + pageIds.length };
  });
}

interface Batch {
  folders: Folder[];
  notebooks: Notebook[];
  pages: Page[];
}

async function loadBatch(batchId: Id): Promise<Batch> {
  const [folders, notebooks, pages] = await Promise.all([
    db.folders.where('trashBatchId').equals(batchId).toArray(),
    db.notebooks.where('trashBatchId').equals(batchId).toArray(),
    db.pages.where('trashBatchId').equals(batchId).toArray(),
  ]);
  return { folders, notebooks, pages };
}

/** The root of a batch is the one item whose parent is not part of the batch. */
function findRoot(batch: Batch): { kind: ItemKind; item: Folder | Notebook | Page } | null {
  const folderIds = new Set(batch.folders.map((f) => f.id));
  const notebookIds = new Set(batch.notebooks.map((n) => n.id));
  const folder = batch.folders.find((f) => f.parentId === null || !folderIds.has(f.parentId));
  if (folder) return { kind: 'folder', item: folder };
  const notebook = batch.notebooks.find((n) => n.folderId === null || !folderIds.has(n.folderId));
  if (notebook) return { kind: 'notebook', item: notebook };
  const page = batch.pages.find(
    (p) => !(p.folderId !== null && folderIds.has(p.folderId)) && !(p.notebookId !== null && notebookIds.has(p.notebookId)),
  );
  return page ? { kind: 'page', item: page } : null;
}

const displayName = (kind: ItemKind, item: Folder | Notebook | Page) =>
  kind === 'page' ? (item as Page).title : (item as Folder | Notebook).name;

export async function listTrash(): Promise<TrashEntry[]> {
  const [folders, notebooks, pages] = await Promise.all([db.folders.toArray(), db.notebooks.toArray(), db.pages.toArray()]);
  const batches = new Map<Id, Batch>();
  const slot = (id: Id) => {
    let batch = batches.get(id);
    if (!batch) batches.set(id, (batch = { folders: [], notebooks: [], pages: [] }));
    return batch;
  };
  for (const f of folders) if (f.trashBatchId) slot(f.trashBatchId).folders.push(f);
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
      count: batch.folders.length + batch.notebooks.length + batch.pages.length,
      deletedAt: root.item.deletedAt ?? 0,
    });
  }
  return entries.sort((a, b) => b.deletedAt - a.deletedAt);
}

/**
 * Restore a batch to where it was. If the original parent is gone or is
 * itself in the Trash, the root item returns to the top level instead.
 */
export async function restoreBatch(batchId: Id): Promise<RestoreResult> {
  return db.transaction('rw', tables(), async () => {
    const batch = await loadBatch(batchId);
    const root = findRoot(batch);
    const unmark: Partial<Page> = { deletedAt: null, trashBatchId: null };
    await db.folders.where('trashBatchId').equals(batchId).modify(unmark);
    await db.notebooks.where('trashBatchId').equals(batchId).modify(unmark);
    await patchPages(batch.pages.map((p) => p.id), unmark);

    let relocated = false;
    const usable = async (table: typeof db.folders | typeof db.notebooks, id: Id | null) => {
      if (id === null) return true;
      const parent = await table.get(id);
      return parent !== undefined && isLive(parent);
    };
    if (root?.kind === 'folder') {
      const folder = root.item as Folder;
      if (!(await usable(db.folders, folder.parentId))) {
        await db.folders.update(folder.id, { parentId: null });
        relocated = true;
      }
    } else if (root?.kind === 'notebook') {
      const notebook = root.item as Notebook;
      if (!(await usable(db.folders, notebook.folderId))) {
        await db.notebooks.update(notebook.id, { folderId: null });
        relocated = true;
      }
    } else if (root?.kind === 'page') {
      const page = root.item as Page;
      if (!(await usable(db.folders, page.folderId)) || !(await usable(db.notebooks, page.notebookId))) {
        await patchPages([page.id], { folderId: null, notebookId: null });
        relocated = true;
      }
    }
    return { restored: batch.folders.length + batch.notebooks.length + batch.pages.length, relocated };
  });
}

/** Permanently delete one batch. This cannot be undone. */
export async function purgeBatch(batchId: Id): Promise<number> {
  return db.transaction('rw', tables(), async () => {
    const counts = await Promise.all([
      db.folders.where('trashBatchId').equals(batchId).delete(),
      db.notebooks.where('trashBatchId').equals(batchId).delete(),
      db.pages.where('trashBatchId').equals(batchId).delete(),
    ]);
    return counts.reduce((a, b) => a + b, 0);
  });
}

/** Permanently delete everything in the Trash. This cannot be undone. */
export async function emptyTrash(): Promise<number> {
  return db.transaction('rw', tables(), async () => {
    const trashed = (item: { deletedAt: number | null }) => item.deletedAt !== null;
    const counts = await Promise.all([
      db.folders.filter(trashed).delete(),
      db.notebooks.filter(trashed).delete(),
      db.pages.filter(trashed).delete(),
    ]);
    return counts.reduce((a, b) => a + b, 0);
  });
}
