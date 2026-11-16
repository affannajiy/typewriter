import { db } from '@/database/db';
import type { Id, Stroke } from '@/types/models';
import { bump, now } from './common';

/**
 * Drawings. A drawing row is created by its first save, not when the block
 * is inserted, so an empty drawing block leaves nothing behind. Rows are not
 * deleted when the block is deleted from the page: undo must be able to bring
 * the block back with its strokes. They go when the page is deleted
 * permanently (see trash.ts).
 */

/** Canvas width in canvas units. Every drawing has the same width, so strokes keep their place at any screen size. */
export const DRAWING_WIDTH = 1000;
export const DEFAULT_DRAWING_HEIGHT = 600;
export const MIN_DRAWING_HEIGHT = 200;
export const MAX_DRAWING_HEIGHT = 8000;

export const clampHeight = (height: number) => Math.round(Math.min(MAX_DRAWING_HEIGHT, Math.max(MIN_DRAWING_HEIGHT, height)));

export const getDrawing = (id: Id) => db.drawings.get(id);

export const listDrawingsOfPage = (pageId: Id) => db.drawings.where('pageId').equals(pageId).toArray();

export interface DrawingDraft {
  height: number;
  strokes: Stroke[];
}

/**
 * The autosave write for a drawing: creates it on the first save, updates it
 * afterwards. Resolves after IndexedDB has committed.
 */
export async function saveDrawing(id: Id, pageId: Id, draft: DrawingDraft): Promise<void> {
  await db.transaction('rw', db.drawings, async () => {
    const current = await db.drawings.get(id);
    const height = clampHeight(draft.height);
    if (current) {
      await db.drawings.update(id, bump(current, { height, strokes: draft.strokes }));
      return;
    }
    const time = now();
    await db.drawings.add({ id, pageId, createdAt: time, updatedAt: time, rev: 1, width: DRAWING_WIDTH, height, strokes: draft.strokes });
  });
}

/**
 * Gives a copied drawing block its own strokes. Does nothing when the copy
 * already exists (the block was copied before) or the source has no row yet
 * (the source was still empty).
 */
export async function copyDrawing(fromId: Id, toId: Id, pageId: Id): Promise<void> {
  await db.transaction('rw', db.drawings, async () => {
    if (await db.drawings.get(toId)) return;
    const source = await db.drawings.get(fromId);
    if (!source) return;
    const time = now();
    await db.drawings.add({ ...structuredClone(source), id: toId, pageId, createdAt: time, updatedAt: time, rev: 1 });
  });
}

/** Part of a permanent page deletion. Must run inside a transaction that includes the drawings table. */
export async function deleteDrawingsOfPages(pageIds: Id[]): Promise<number> {
  if (pageIds.length === 0) return 0;
  return db.drawings.where('pageId').anyOf(pageIds).delete();
}
