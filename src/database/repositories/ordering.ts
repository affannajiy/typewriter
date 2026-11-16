import { db } from '@/database/db';
import type { Folder, ItemRef, Notebook, Page } from '@/types/models';
import { bump, byOrder, found, isLive } from './common';
import { patchPages } from './pages';

type Ordered = Folder | Notebook | Page;

/** Live items of the same kind that share a location with the given item. */
async function siblingsOf(ref: ItemRef): Promise<{ item: Ordered; siblings: Ordered[] }> {
  if (ref.kind === 'folder') {
    const item = found(await db.folders.get(ref.id), 'Folder');
    const all = (await db.folders.toArray()).filter(isLive);
    return { item, siblings: all.filter((f) => f.parentId === item.parentId) };
  }
  if (ref.kind === 'notebook') {
    const item = found(await db.notebooks.get(ref.id), 'Notebook');
    const all = (await db.notebooks.toArray()).filter(isLive);
    return { item, siblings: all.filter((n) => n.folderId === item.folderId) };
  }
  const item = found(await db.pages.get(ref.id), 'Page');
  const all = (await db.pages.toArray()).filter(isLive);
  return { item, siblings: all.filter((p) => p.notebookId === item.notebookId && p.folderId === item.folderId) };
}

/**
 * Move an item one place up or down among its siblings by swapping order
 * values. This is the keyboard and single-pointer way to reorder (WCAG 2.5.7).
 * Returns false when the item is already at that end.
 */
export async function moveSibling(ref: ItemRef, direction: 'up' | 'down'): Promise<boolean> {
  return db.transaction('rw', db.folders, db.notebooks, db.pages, async () => {
    const { item, siblings } = await siblingsOf(ref);
    const sorted = siblings.sort(byOrder);
    const index = sorted.findIndex((s) => s.id === item.id);
    const neighbour = sorted[direction === 'up' ? index - 1 : index + 1];
    if (!neighbour) return false;
    const swap: [Ordered, number][] = [
      [item, neighbour.order],
      [neighbour, item.order],
    ];
    for (const [entity, order] of swap) {
      const patch = bump(entity, { order });
      if (ref.kind === 'folder') await db.folders.update(entity.id, patch as Partial<Folder>);
      else if (ref.kind === 'notebook') await db.notebooks.update(entity.id, patch as Partial<Notebook>);
      else await patchPages([entity.id], patch as Partial<Page>);
    }
    return true;
  });
}
