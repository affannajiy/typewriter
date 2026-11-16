import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, TypeNoteDB, db } from '@/database/db';
import type { Stroke } from '@/types/models';
import { MAX_DRAWING_HEIGHT, copyDrawing, getDrawing, listDrawingsOfPage, saveDrawing } from './drawings';
import { createPage } from './pages';
import { emptyTrash, purgeBatch, restoreBatch, trashItem } from './trash';

const stroke = (id: string): Stroke => ({ id, tool: 'pen', colour: 'blue', size: 6, pen: true, points: [10, 10, 0.4, 20, 25, 0.7] });

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('drawings', () => {
  it('is created by its first save and updated by the next, with the revision counted', async () => {
    const page = await createPage({ title: 'Sketches' });
    expect(await getDrawing('d1')).toBeUndefined();

    await saveDrawing('d1', page.id, { height: 600, strokes: [stroke('s1')] });
    expect(await getDrawing('d1')).toMatchObject({ pageId: page.id, width: 1000, height: 600, rev: 1, strokes: [stroke('s1')] });

    await saveDrawing('d1', page.id, { height: 99_999, strokes: [stroke('s1'), stroke('s2')] });
    const saved = await getDrawing('d1');
    expect(saved).toMatchObject({ rev: 2, height: MAX_DRAWING_HEIGHT });
    expect(saved?.strokes).toHaveLength(2);
  });

  it('a copy gets its own strokes, once, and only from a drawing that exists', async () => {
    const page = await createPage({ title: 'A' });
    const other = await createPage({ title: 'B' });
    await saveDrawing('d1', page.id, { height: 600, strokes: [stroke('s1')] });

    await copyDrawing('d1', 'd2', other.id);
    expect(await getDrawing('d2')).toMatchObject({ pageId: other.id, rev: 1, strokes: [stroke('s1')] });

    // Editing the original does not change the copy.
    await saveDrawing('d1', page.id, { height: 600, strokes: [] });
    expect((await getDrawing('d2'))?.strokes).toHaveLength(1);

    // A second copy request with the same target leaves it alone.
    await saveDrawing('d2', other.id, { height: 600, strokes: [stroke('s1'), stroke('s3')] });
    await copyDrawing('d1', 'd2', other.id);
    expect((await getDrawing('d2'))?.strokes).toHaveLength(2);

    await copyDrawing('missing', 'd3', page.id);
    expect(await getDrawing('d3')).toBeUndefined();
  });

  it('stays while its page is in the Trash and comes back with it', async () => {
    const page = await createPage({ title: 'Sketches' });
    await saveDrawing('d1', page.id, { height: 600, strokes: [stroke('s1')] });
    const { batchId } = await trashItem({ kind: 'page', id: page.id });
    expect(await getDrawing('d1')).toBeDefined();
    await restoreBatch(batchId);
    expect(await listDrawingsOfPage(page.id)).toHaveLength(1);
  });

  it('is deleted with its page, by deleting the page permanently or by emptying the Trash', async () => {
    const first = await createPage({ title: 'One' });
    const second = await createPage({ title: 'Two' });
    const kept = await createPage({ title: 'Kept' });
    await saveDrawing('d1', first.id, { height: 600, strokes: [stroke('s1')] });
    await saveDrawing('d2', second.id, { height: 600, strokes: [stroke('s2')] });
    await saveDrawing('d3', kept.id, { height: 600, strokes: [stroke('s3')] });

    const { batchId } = await trashItem({ kind: 'page', id: first.id });
    await purgeBatch(batchId);
    expect(await getDrawing('d1')).toBeUndefined();

    await trashItem({ kind: 'page', id: second.id });
    await emptyTrash();
    expect(await getDrawing('d2')).toBeUndefined();
    expect(await getDrawing('d3')).toBeDefined();
  });
});

describe('schema version 2', () => {
  it('opens a version 1 database with its data intact and an empty drawings table', async () => {
    const name = 'typenote-migration-test';
    await Dexie.delete(name);
    const old = new Dexie(name);
    // The released version 1 schema, as it shipped.
    old.version(1).stores({
      folders: 'id, parentId, trashBatchId',
      notebooks: 'id, folderId, *tagIds, trashBatchId',
      pages: 'id, notebookId, folderId, *tagIds, updatedAt, trashBatchId',
      tags: 'id',
      settings: 'key',
      snapshots: 'id, createdAt',
    });
    const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Kept' }] }] };
    await old.table('pages').add({ id: 'p1', title: 'Old page', content, plainText: 'Kept', notebookId: null, folderId: null, tagIds: [], deletedAt: null, trashBatchId: null });
    await old.table('settings').add({ key: 'theme', value: 'forest', updatedAt: 1 });
    old.close();

    const upgraded = new TypeNoteDB(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(SCHEMA_VERSION);
    expect(await upgraded.pages.get('p1')).toMatchObject({ title: 'Old page', content, plainText: 'Kept' });
    expect(await upgraded.settings.get('theme')).toMatchObject({ value: 'forest' });
    expect(await upgraded.drawings.count()).toBe(0);
    expect(await upgraded.drawings.where('pageId').equals('p1').count()).toBe(0);
    upgraded.close();
    await Dexie.delete(name);
  });
});
