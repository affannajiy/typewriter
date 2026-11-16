import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/database/db';
import { RepositoryError } from './common';
import { createFolder, listFolders, moveFolder, renameFolder } from './folders';
import { createNotebook, getNotebook, listNotebooks, moveNotebook, setNotebookTags, updateNotebookDetails } from './notebooks';
import { moveSibling } from './ordering';
import { createPage, docToPlainText, getPage, listPages, markPageOpened, movePage, savePageDraft, setPageTags } from './pages';
import { createTag, deleteTag, listTags } from './tags';
import { emptyTrash, listTrash, purgeBatch, restoreBatch, trashItem } from './trash';

const notebookInput = { name: 'Chemistry', description: '', coverColour: '#795b43', folderId: null };

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('folders', () => {
  it('creates, renames and nests folders', async () => {
    const parent = await createFolder({ name: '  School  ', parentId: null });
    const child = await createFolder({ name: 'Year 1', parentId: parent.id });
    await renameFolder(child.id, 'Year One');
    const folders = await listFolders();
    expect(folders.find((f) => f.id === parent.id)?.name).toBe('School');
    expect(folders.find((f) => f.id === child.id)).toMatchObject({ name: 'Year One', parentId: parent.id, rev: 2 });
  });

  it('keeps the old name when the new one is blank', async () => {
    const folder = await createFolder({ name: 'Keep', parentId: null });
    await renameFolder(folder.id, '   ');
    expect((await listFolders())[0]?.name).toBe('Keep');
  });

  it('refuses to move a folder into itself or its own subfolder', async () => {
    const a = await createFolder({ name: 'A', parentId: null });
    const b = await createFolder({ name: 'B', parentId: a.id });
    await expect(moveFolder(a.id, a.id)).rejects.toBeInstanceOf(RepositoryError);
    await expect(moveFolder(a.id, b.id)).rejects.toMatchObject({ code: 'invalid-move' });
    expect((await listFolders()).find((f) => f.id === a.id)?.parentId).toBeNull();
  });
});

describe('notebooks', () => {
  it('creates, edits and moves a notebook without touching its pages', async () => {
    const folder = await createFolder({ name: 'Science', parentId: null });
    const notebook = await createNotebook(notebookInput);
    const page = await createPage({ notebookId: notebook.id, title: 'Atoms' });
    await updateNotebookDetails(notebook.id, { name: 'Chem', description: 'Term 1', coverColour: '#263B32' });
    await moveNotebook(notebook.id, folder.id);
    expect(await getNotebook(notebook.id)).toMatchObject({ name: 'Chem', description: 'Term 1', folderId: folder.id, cover: { kind: 'solid', colour: '#263b32' } });
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

  it('moves a page and keeps its ID', async () => {
    const notebook = await createNotebook(notebookInput);
    const folder = await createFolder({ name: 'Loose', parentId: null });
    const page = await createPage({ notebookId: notebook.id });
    await movePage(page.id, { notebookId: null, folderId: folder.id });
    expect(await getPage(page.id)).toMatchObject({ id: page.id, notebookId: null, folderId: folder.id });
    await expect(movePage(page.id, { notebookId: notebook.id, folderId: folder.id })).rejects.toMatchObject({ code: 'invalid-move' });
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

describe('tags', () => {
  it('reuses a tag with the same name, ignoring case', async () => {
    const a = await createTag('Exam');
    const b = await createTag('  exam ');
    expect(b.id).toBe(a.id);
    expect(await listTags()).toHaveLength(1);
  });

  it('removes a deleted tag from notebooks and pages, and keeps the items', async () => {
    const tag = await createTag('Exam');
    const other = await createTag('Draft');
    const notebook = await createNotebook(notebookInput);
    const page = await createPage();
    await setNotebookTags(notebook.id, [tag.id]);
    await setPageTags(page.id, [tag.id, other.id]);
    await deleteTag(tag.id);
    expect((await getNotebook(notebook.id))?.tagIds).toEqual([]);
    expect((await getPage(page.id))?.tagIds).toEqual([other.id]);
  });
});

describe('trash', () => {
  async function seedTree() {
    const folder = await createFolder({ name: 'School', parentId: null });
    const sub = await createFolder({ name: 'Year 1', parentId: folder.id });
    const notebook = await createNotebook({ ...notebookInput, folderId: sub.id });
    const inNotebook = await createPage({ notebookId: notebook.id, title: 'Atoms' });
    const inFolder = await createPage({ folderId: folder.id, title: 'Timetable' });
    const outside = await createPage({ title: 'Outside' });
    return { folder, sub, notebook, inNotebook, inFolder, outside };
  }

  it('moves a folder and everything inside it to the Trash as one batch', async () => {
    const tree = await seedTree();
    const { count } = await trashItem({ kind: 'folder', id: tree.folder.id });
    expect(count).toBe(5);
    expect(await listFolders()).toHaveLength(0);
    expect(await listNotebooks()).toHaveLength(0);
    expect((await listPages()).map((p) => p.title)).toEqual(['Outside']);
    const trash = await listTrash();
    expect(trash).toHaveLength(1);
    expect(trash[0]).toMatchObject({ name: 'School', count: 5, root: { kind: 'folder', id: tree.folder.id } });
    // Nothing was removed from the database.
    expect(await db.pages.count()).toBe(3);
  });

  it('restores a batch to exactly where it was', async () => {
    const tree = await seedTree();
    const { batchId } = await trashItem({ kind: 'folder', id: tree.folder.id });
    const result = await restoreBatch(batchId);
    expect(result).toEqual({ restored: 5, relocated: false });
    expect(await getPage(tree.inNotebook.id)).toMatchObject({ notebookId: tree.notebook.id, deletedAt: null, trashBatchId: null });
    expect(await getNotebook(tree.notebook.id)).toMatchObject({ folderId: tree.sub.id, deletedAt: null });
    expect(await listTrash()).toHaveLength(0);
  });

  it('restores an item to the top level when its old location is gone', async () => {
    const tree = await seedTree();
    const pageBatch = await trashItem({ kind: 'page', id: tree.inNotebook.id });
    const folderBatch = await trashItem({ kind: 'folder', id: tree.folder.id });
    expect(folderBatch.count).toBe(4); // The page already in the Trash keeps its own batch.
    await purgeBatch(folderBatch.batchId);
    const result = await restoreBatch(pageBatch.batchId);
    expect(result).toEqual({ restored: 1, relocated: true });
    expect(await getPage(tree.inNotebook.id)).toMatchObject({ notebookId: null, folderId: null, deletedAt: null });
  });

  it('deletes permanently only what is in the Trash', async () => {
    const tree = await seedTree();
    await trashItem({ kind: 'notebook', id: tree.notebook.id });
    expect(await emptyTrash()).toBe(2);
    expect(await getNotebook(tree.notebook.id)).toBeUndefined();
    expect(await getPage(tree.inNotebook.id)).toBeUndefined();
    expect((await listPages()).map((p) => p.title).sort()).toEqual(['Outside', 'Timetable']);
    expect(await listFolders()).toHaveLength(2);
  });
});
