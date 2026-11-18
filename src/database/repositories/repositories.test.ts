import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { TypeNoteDB, db } from '@/database/db';
import { convertLegacyDoc } from '@/database/legacy';
import { createNotebook, getNotebook, listNotebooks, updateNotebookDetails } from './notebooks';
import { moveSibling } from './ordering';
import { createPage, docToPlainText, fillFileBlock, getPage, listPages, markPageOpened, movePage, savePageDraft } from './pages';
import { emptyTrash, listTrash, purgeBatch, restoreBatch, trashItem } from './trash';

const notebookInput = { name: 'Chemistry', description: '', coverColour: '#795b43' };

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('notebooks', () => {
  it('creates and edits a notebook without touching its pages', async () => {
    const notebook = await createNotebook(notebookInput);
    const page = await createPage({ notebookId: notebook.id, title: 'Atoms' });
    await updateNotebookDetails(notebook.id, { name: 'Chem', description: 'Term 1', coverColour: '#263B32' });
    expect(await getNotebook(notebook.id)).toMatchObject({ name: 'Chem', description: 'Term 1', cover: { kind: 'solid', colour: '#263b32' } });
    expect(await getPage(page.id)).toMatchObject({ title: 'Atoms', notebookId: notebook.id, rev: 1 });
  });

  it('rejects a cover colour that is not a hex value', async () => {
    await expect(createNotebook({ ...notebookInput, coverColour: 'red; background:url(x)' })).rejects.toMatchObject({ code: 'invalid-colour' });
    expect(await listNotebooks()).toHaveLength(0);
  });
});

describe('pages', () => {
  it('saves a draft and derives plain text', async () => {
    const page = await createPage();
    const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }, { type: 'paragraph' }, { type: 'paragraph', content: [{ type: 'text', text: 'world' }] }] };
    await savePageDraft(page.id, { title: '', content });
    const saved = await getPage(page.id);
    expect(saved).toMatchObject({ title: 'Untitled', plainText: 'Hello\n\nworld', rev: 2 });
    expect(saved?.content).toEqual(content);
    expect(docToPlainText(content)).toBe('Hello\n\nworld');
  });

  it('fails loudly when saving a page that does not exist', async () => {
    await expect(savePageDraft('missing', { title: 'x', content: { type: 'doc' } })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('moves a page out of a notebook and into another, keeping its ID', async () => {
    const notebook = await createNotebook(notebookInput);
    const other = await createNotebook({ ...notebookInput, name: 'Physics' });
    const page = await createPage({ notebookId: notebook.id });
    await movePage(page.id, { notebookId: null });
    expect(await getPage(page.id)).toMatchObject({ id: page.id, notebookId: null });
    await movePage(page.id, { notebookId: other.id });
    expect(await getPage(page.id)).toMatchObject({ id: page.id, notebookId: other.id });
    await expect(movePage(page.id, { notebookId: 'missing' })).rejects.toMatchObject({ code: 'not-found' });
  });

  it('puts a recording that ended after its page closed into its block, or at the end when the block is gone', async () => {
    const page = await createPage();
    const content = { type: 'doc', content: [{ type: 'paragraph', attrs: { id: 'b1' } }, { type: 'audio', attrs: { id: 'b2', attachmentId: null } }] };
    await savePageDraft(page.id, { title: 'Lecture', content });
    await fillFileBlock(page.id, 'b2', 'audio', 'rec-1');
    expect((await getPage(page.id))?.content.content?.[1]).toEqual({ type: 'audio', attrs: { id: 'b2', attachmentId: 'rec-1' } });
    await fillFileBlock(page.id, 'gone', 'audio', 'rec-2');
    const blocks = (await getPage(page.id))?.content.content ?? [];
    expect(blocks).toHaveLength(3);
    expect(blocks[2]).toEqual({ type: 'audio', attrs: { attachmentId: 'rec-2' } });
  });

  it('does not count opening a page as an edit', async () => {
    const page = await createPage();
    await markPageOpened(page.id);
    const opened = await getPage(page.id);
    expect(opened?.lastOpenedAt).not.toBeNull();
    expect(opened).toMatchObject({ rev: 1, updatedAt: page.updatedAt });
  });

  it('reorders siblings and stops at the ends', async () => {
    const first = await createPage({ title: 'First' });
    const second = await createPage({ title: 'Second' });
    expect(await moveSibling({ kind: 'page', id: second.id }, 'up')).toBe(true);
    const titles = (await listPages()).sort((a, b) => a.order - b.order).map((p) => p.title);
    expect(titles).toEqual(['Second', 'First']);
    expect(await moveSibling({ kind: 'page', id: second.id }, 'up')).toBe(false);
    expect(await moveSibling({ kind: 'page', id: first.id }, 'down')).toBe(false);
  });
});

describe('trash', () => {
  async function seed() {
    const notebook = await createNotebook(notebookInput);
    const inNotebook = await createPage({ notebookId: notebook.id, title: 'Atoms' });
    const second = await createPage({ notebookId: notebook.id, title: 'Bonds' });
    const loose = await createPage({ title: 'Loose' });
    return { notebook, inNotebook, second, loose };
  }

  it('moves a notebook and its pages to the Trash as one batch', async () => {
    const tree = await seed();
    const { count } = await trashItem({ kind: 'notebook', id: tree.notebook.id });
    expect(count).toBe(3);
    expect(await listNotebooks()).toHaveLength(0);
    expect((await listPages()).map((p) => p.title)).toEqual(['Loose']);
    const trash = await listTrash();
    expect(trash).toHaveLength(1);
    expect(trash[0]).toMatchObject({ name: 'Chemistry', count: 3, root: { kind: 'notebook', id: tree.notebook.id } });
    // Nothing was removed from the database.
    expect(await db.pages.count()).toBe(3);
  });

  it('restores a batch to exactly where it was', async () => {
    const tree = await seed();
    const { batchId } = await trashItem({ kind: 'notebook', id: tree.notebook.id });
    expect(await restoreBatch(batchId)).toEqual({ restored: 3, relocated: false });
    expect(await getPage(tree.inNotebook.id)).toMatchObject({ notebookId: tree.notebook.id, deletedAt: null, trashBatchId: null });
    expect(await getNotebook(tree.notebook.id)).toMatchObject({ deletedAt: null });
    expect(await listTrash()).toHaveLength(0);
  });

  it('restores a page as a loose page when its notebook is gone', async () => {
    const tree = await seed();
    const pageBatch = await trashItem({ kind: 'page', id: tree.inNotebook.id });
    const notebookBatch = await trashItem({ kind: 'notebook', id: tree.notebook.id });
    expect(notebookBatch.count).toBe(2); // The page already in the Trash keeps its own batch.
    await purgeBatch(notebookBatch.batchId);
    expect(await restoreBatch(pageBatch.batchId)).toEqual({ restored: 1, relocated: true });
    expect(await getPage(tree.inNotebook.id)).toMatchObject({ notebookId: null, deletedAt: null });
  });

  it('deletes permanently only what is in the Trash', async () => {
    const tree = await seed();
    await trashItem({ kind: 'notebook', id: tree.notebook.id });
    expect(await emptyTrash()).toBe(3);
    expect(await getNotebook(tree.notebook.id)).toBeUndefined();
    expect(await getPage(tree.inNotebook.id)).toBeUndefined();
    expect((await listPages()).map((p) => p.title)).toEqual(['Loose']);
  });
});

describe('legacy documents', () => {
  it('turns a page link into the text of its title and joins the text around it', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'See ' }, { type: 'pageLink', attrs: { pageId: 'p2', title: 'Atoms' } }, { type: 'text', text: ' first.' }] },
        { type: 'paragraph', content: [{ type: 'pageLink', attrs: { pageId: 'p3', title: '' } }] },
      ],
    };
    expect(convertLegacyDoc(doc)).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'See Atoms first.' }] },
        { type: 'paragraph', content: [] },
      ],
    });
  });

  it('returns the same document when there is nothing to convert', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Plain' }] }] };
    expect(convertLegacyDoc(doc)).toBe(doc);
  });
});

describe('schema version 6', () => {
  it('opens a version 5 database: folders, tags and study data go, notebooks and pages stay', async () => {
    const name = 'typenote-v5-upgrade';
    await Dexie.delete(name);
    const old = new Dexie(name);
    old.version(1).stores({
      folders: 'id, parentId, trashBatchId',
      notebooks: 'id, folderId, *tagIds, trashBatchId',
      pages: 'id, notebookId, folderId, *tagIds, updatedAt, trashBatchId',
      tags: 'id',
      settings: 'key',
      snapshots: 'id, createdAt',
    });
    old.version(2).stores({ drawings: 'id, pageId' });
    old.version(3).stores({ writingDays: 'date' });
    old.version(4).stores({ attachments: 'id, kind', attachmentData: 'id', annotations: 'id, attachmentId' });
    old.version(5).stores({ decks: 'id', flashcards: 'id, deckId, due, sourcePageId', reviewLogs: 'id, cardId, deckId, reviewedAt' });
    await old.open();
    const base = { createdAt: 1, updatedAt: 1, rev: 1, deletedAt: null, trashBatchId: null, order: 1 };
    await old.table('folders').add({ ...base, id: 'f1', name: 'School', parentId: null });
    await old.table('tags').add({ id: 't1', createdAt: 1, updatedAt: 1, rev: 1, name: 'Exam', colour: '#123456' });
    await old.table('notebooks').add({ ...base, id: 'n1', name: 'Chemistry', description: '', folderId: 'f1', cover: { kind: 'solid', colour: '#795b43' }, icon: null, tagIds: ['t1'], favourite: false });
    const page = { ...base, layout: 'continuous', favourite: false, pinned: false, lastOpenedAt: null, plainText: '' };
    await old.table('pages').add({
      ...page,
      id: 'p1',
      title: 'Atoms',
      notebookId: 'n1',
      folderId: null,
      tagIds: ['t1'],
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Read ' }, { type: 'pageLink', attrs: { pageId: 'p2', title: 'Timetable' } }] }] },
    });
    await old.table('pages').add({ ...page, id: 'p2', title: 'Timetable', notebookId: null, folderId: 'f1', tagIds: [], content: { type: 'doc', content: [{ type: 'paragraph' }] } });
    await old.table('writingDays').add({ date: '2026-11-01', words: 300, updatedAt: 1 });
    await old.table('decks').add({ id: 'd1', createdAt: 1, updatedAt: 1, rev: 1, name: 'Deck', description: '', order: 1 });
    await old.table('settings').bulkAdd([
      { key: 'dailyGoal', value: 500, updatedAt: 1 },
      { key: 'studyRetention', value: 90, updatedAt: 1 },
      { key: 'theme', value: 'forest', updatedAt: 1 },
    ]);
    old.close();

    const upgraded = new TypeNoteDB(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(6);
    const tableNames = upgraded.tables.map((table) => table.name);
    for (const gone of ['folders', 'tags', 'writingDays', 'decks', 'flashcards', 'reviewLogs']) expect(tableNames).not.toContain(gone);

    const notebook = (await upgraded.notebooks.get('n1')) as unknown as Record<string, unknown>;
    expect(notebook).toMatchObject({ name: 'Chemistry' });
    expect(notebook).not.toHaveProperty('folderId');
    expect(notebook).not.toHaveProperty('tagIds');

    const atoms = (await upgraded.pages.get('p1')) as unknown as Record<string, unknown>;
    expect(atoms).toMatchObject({ notebookId: 'n1', content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Read Timetable' }] }] } });
    expect(atoms).not.toHaveProperty('tagIds');
    // A page that was in a folder is now a loose page.
    const timetable = (await upgraded.pages.get('p2')) as unknown as Record<string, unknown>;
    expect(timetable).toMatchObject({ notebookId: null });
    expect(timetable).not.toHaveProperty('folderId');

    expect((await upgraded.settings.toArray()).map((row) => row.key)).toEqual(['theme']);
    upgraded.close();
    await Dexie.delete(name);
  });
});
