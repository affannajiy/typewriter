import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/database/db';
import { createFolder, listFolders } from '@/database/repositories/folders';
import { createNotebook, listNotebooks } from '@/database/repositories/notebooks';
import { createPage, getPage, listPages, renamePage, setPageTags } from '@/database/repositories/pages';
import { readSettings, writeSetting } from '@/database/repositories/settings';
import { createTag } from '@/database/repositories/tags';
import { trashItem } from '@/database/repositories/trash';
import { getDrawing, saveDrawing } from '@/database/repositories/drawings';
import { BackupError, analyseBackup, createBackup, latestSnapshot, parseBackup, restoreBackup, restoreSnapshot, serialiseBackup } from './backup';

async function reset() {
  await db.delete();
  await db.open();
}

async function seed() {
  const folder = await createFolder({ name: 'School', parentId: null });
  const notebook = await createNotebook({ name: 'Chemistry', description: 'Term 1', coverColour: '#795b43', folderId: folder.id });
  const tag = await createTag('Exam');
  const page = await createPage({ notebookId: notebook.id, title: 'Atoms' });
  await setPageTags(page.id, [tag.id]);
  const trashed = await createPage({ title: 'Old draft' });
  await trashItem({ kind: 'page', id: trashed.id });
  await writeSetting('theme', 'midnight');
  return { folder, notebook, tag, page, trashed };
}

beforeEach(reset);

describe('backup round trip', () => {
  it('restores a full workspace, including the Trash and settings, into an empty one', async () => {
    const seeded = await seed();
    const text = serialiseBackup(await createBackup());
    await reset();

    const file = parseBackup(text);
    expect(await analyseBackup(file)).toMatchObject({ counts: { folders: 1, notebooks: 1, pages: 2, tags: 1 }, duplicates: 0, workspaceIsEmpty: true });
    const report = await restoreBackup(file, 'merge-skip');

    expect(report).toMatchObject({ added: 5, updated: 0, skipped: 0, repaired: 0 });
    expect(await getPage(seeded.page.id)).toMatchObject({ title: 'Atoms', notebookId: seeded.notebook.id, tagIds: [seeded.tag.id] });
    expect((await getPage(seeded.trashed.id))?.deletedAt).not.toBeNull();
    expect((await readSettings()).theme).toBe('midnight');
  });
});

describe('restore modes', () => {
  it('merge-skip leaves existing items exactly as they are', async () => {
    const { page } = await seed();
    const file = await createBackup();
    await renamePage(page.id, 'Edited locally');
    expect((await analyseBackup(file)).duplicates).toBe(5);
    const report = await restoreBackup(file, 'merge-skip');
    expect(report).toMatchObject({ added: 0, skipped: 5 });
    expect((await getPage(page.id))?.title).toBe('Edited locally');
  });

  it('merge-newer takes the backup copy only when it is more recent', async () => {
    const { page, notebook } = await seed();
    const file = await createBackup();
    const incoming = file.data.pages.find((p) => p.id === page.id)!;
    incoming.title = 'Newer in backup';
    incoming.updatedAt += 60_000;
    file.data.notebooks.find((n) => n.id === notebook.id)!.name = 'Same age, ignored';
    const report = await restoreBackup(file, 'merge-newer');
    expect(report).toMatchObject({ added: 0, updated: 1, skipped: 4 });
    expect((await getPage(page.id))?.title).toBe('Newer in backup');
    expect((await listNotebooks())[0]?.name).toBe('Chemistry');
  });

  it('replace swaps the workspace and can be undone from the safety snapshot', async () => {
    await seed();
    const file = await createBackup();
    await reset();
    const mine = await createPage({ title: 'Only on this device' });

    const report = await restoreBackup(file, 'replace');
    expect(report.snapshotId).not.toBeNull();
    expect(await getPage(mine.id)).toBeUndefined();
    expect((await listPages()).map((p) => p.title)).toEqual(['Atoms']);

    const snapshot = await latestSnapshot();
    await restoreSnapshot(snapshot!.id);
    expect((await listPages()).map((p) => p.title)).toEqual(['Only on this device']);
    expect(await listFolders()).toHaveLength(0);
    expect(await latestSnapshot()).toBeNull();
  });

  it('leaves the workspace untouched when a replace fails part-way', async () => {
    await seed();
    const file = await createBackup();
    await reset();
    const mine = await createPage({ title: 'Must survive' });
    const failure = vi.spyOn(db.pages, 'bulkAdd').mockRejectedValueOnce(new Error('disk full'));

    await expect(restoreBackup(file, 'replace')).rejects.toThrow('disk full');
    failure.mockRestore();
    expect((await listPages()).map((p) => p.id)).toEqual([mine.id]);
    expect(await listFolders()).toHaveLength(0);
  });

  it('moves items with a missing parent to the top level and cuts folder cycles', async () => {
    await seed();
    const file = await createBackup();
    await reset();
    const [folder] = file.data.folders;
    file.data.folders.push({ ...folder!, id: 'loop-a', parentId: 'loop-b' }, { ...folder!, id: 'loop-b', parentId: 'loop-a' });
    file.data.notebooks[0]!.folderId = 'gone';
    file.data.pages[0]!.tagIds = ['gone-tag'];

    const report = await restoreBackup(file, 'merge-skip');
    expect(report.repaired).toBe(2);
    expect((await listNotebooks())[0]?.folderId).toBeNull();
    expect((await getPage(file.data.pages[0]!.id))?.tagIds).toEqual([]);
    const loops = (await listFolders()).filter((f) => f.id.startsWith('loop-'));
    expect(loops.filter((f) => f.parentId === null)).toHaveLength(1);
  });
});

describe('backup validation', () => {
  const valid = async () => {
    await seed();
    return JSON.parse(serialiseBackup(await createBackup())) as { app: string; formatVersion: number; data: { pages: Record<string, unknown>[]; notebooks: Record<string, unknown>[]; settings: unknown[] } };
  };
  const codeOf = (text: string) => {
    try {
      parseBackup(text);
      return 'accepted';
    } catch (error) {
      return error instanceof BackupError ? error.code : 'other';
    }
  };

  it('rejects text that is not JSON, or not a TypeNote backup', () => {
    expect(codeOf('not json at all')).toBe('not-json');
    expect(codeOf('{"notes":[]}')).toBe('not-typenote');
    expect(codeOf('[]')).toBe('not-typenote');
  });

  it('rejects a backup from a newer version', async () => {
    const raw = await valid();
    raw.formatVersion = 99;
    expect(codeOf(JSON.stringify(raw))).toBe('newer-version');
  });

  it('rejects a record with a wrong type and says where', async () => {
    const raw = await valid();
    raw.data.pages[0]!.title = 42;
    expect(() => parseBackup(JSON.stringify(raw))).toThrowError(/pages\[0\]\.title/);
  });

  it('rejects a cover colour that is not a hex value', async () => {
    const raw = await valid();
    raw.data.notebooks[0]!.cover = { kind: 'solid', colour: 'url(https://example.com/x)' };
    expect(codeOf(JSON.stringify(raw))).toBe('invalid-record');
  });

  it('rejects the same ID twice', async () => {
    const raw = await valid();
    raw.data.pages.push(raw.data.pages[0]!);
    expect(codeOf(JSON.stringify(raw))).toBe('duplicate-id');
  });

  it('rejects document content that tries to reach the object prototype', async () => {
    const raw = await valid();
    const text = JSON.stringify(raw).replace('"type":"paragraph"', '"type":"paragraph","attrs":{"__proto__":{"polluted":true}}');
    expect(codeOf(text)).toBe('invalid-record');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('drops unknown fields and unknown or invalid settings', async () => {
    const raw = await valid();
    raw.data.pages[0]!.onload = 'alert(1)';
    raw.data.settings.push({ key: 'theme', value: 'not-a-theme' }, { key: 'evil', value: true });
    const file = parseBackup(JSON.stringify(raw));
    expect(file.data.pages[0]).not.toHaveProperty('onload');
    expect(file.data.settings.map((s) => s.key)).toEqual(['theme']);
    expect(file.data.settings[0]?.value).toBe('midnight');
  });
});

describe('drawings in a backup', () => {
  const stroke = { id: 's1', tool: 'pen', colour: 'red', size: 6, pen: true, points: [1, 2, 0.5, 3, 4, 0.6] } as const;

  it('are saved and restored with their page', async () => {
    const page = await createPage({ title: 'Sketch' });
    await saveDrawing('d1', page.id, { height: 900, strokes: [{ ...stroke, points: [...stroke.points] }] });
    const text = serialiseBackup(await createBackup());
    await reset();

    const file = parseBackup(text);
    expect(file.schemaVersion).toBe(2);
    expect(file.data.drawings).toHaveLength(1);
    await restoreBackup(file, 'merge-skip');
    expect(await getDrawing('d1')).toMatchObject({ pageId: page.id, height: 900, strokes: [stroke] });
  });

  it('a backup made before drawings existed still restores', async () => {
    await seed();
    const raw = JSON.parse(serialiseBackup(await createBackup())) as { schemaVersion: number; data: Record<string, unknown> };
    raw.schemaVersion = 1;
    delete raw.data.drawings;
    const file = parseBackup(JSON.stringify(raw));
    expect(file.data.drawings).toEqual([]);
    await reset();
    await expect(restoreBackup(file, 'replace')).resolves.toMatchObject({ added: 5 });
  });

  it('a damaged stroke rejects the file and says where', async () => {
    const page = await createPage({ title: 'Sketch' });
    await saveDrawing('d1', page.id, { height: 600, strokes: [{ ...stroke, points: [...stroke.points] }] });
    const raw = JSON.parse(serialiseBackup(await createBackup())) as { data: { drawings: { strokes: Record<string, unknown>[] }[] } };
    const original = JSON.stringify(raw);

    raw.data.drawings[0]!.strokes[0]!.colour = 'url(x)';
    expect(() => parseBackup(JSON.stringify(raw))).toThrowError(/drawings\[0\]\.strokes\[0\]\.colour/);

    const uneven = JSON.parse(original) as typeof raw;
    uneven.data.drawings[0]!.strokes[0]!.points = [1, 2];
    expect(() => parseBackup(JSON.stringify(uneven))).toThrowError(/strokes\[0\]\.points/);

    const notNumbers = JSON.parse(original) as typeof raw;
    notNumbers.data.drawings[0]!.strokes[0]!.points = [1, 2, '3'];
    expect(() => parseBackup(JSON.stringify(notNumbers))).toThrowError(/points\[2\]/);
  });
});
