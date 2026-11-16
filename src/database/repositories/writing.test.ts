import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCHEMA_VERSION, TypeNoteDB, db } from '@/database/db';
import { createBackup, parseBackup, restoreBackup, serialiseBackup } from '@/database/backup/backup';
import { summariseWriting } from '@/features/dashboard/stats';
import { textToDoc } from '@/features/pages/plainDoc';
import type { WritingDay } from '@/types/models';
import { dayKey } from '@/utils/dates';
import { createNotebook, getNotebook, updateNotebookDetails } from './notebooks';
import { createPage, savePageDraft } from './pages';
import { addWordsWritten, listWritingDays } from './writing';

beforeEach(async () => {
  await db.delete();
  await db.open();
});
afterEach(() => {
  vi.useRealTimers();
});

const today = () => dayKey();

describe('words written', () => {
  it('a save adds what it made longer; deleting does not subtract; the title does not count', async () => {
    const page = await createPage();
    await savePageDraft(page.id, { title: 'A long title of six words', content: textToDoc('One two three') });
    expect(await db.writingDays.get(today())).toMatchObject({ words: 3 });

    await savePageDraft(page.id, { title: 'A long title of six words', content: textToDoc('One two three four five') });
    expect((await db.writingDays.get(today()))?.words).toBe(5);

    await savePageDraft(page.id, { title: 'Short', content: textToDoc('One') });
    expect((await db.writingDays.get(today()))?.words).toBe(5);

    await savePageDraft(page.id, { title: 'Short', content: textToDoc('One again') });
    expect((await db.writingDays.get(today()))?.words).toBe(6);
  });

  it('is counted per calendar day and listed in date order', async () => {
    await db.transaction('rw', db.writingDays, async () => {
      await addWordsWritten(40, new Date(2026, 10, 15, 23, 59));
      await addWordsWritten(10, new Date(2026, 10, 14, 9));
      await addWordsWritten(5, new Date(2026, 10, 15, 8));
      await addWordsWritten(0, new Date(2026, 10, 16));
      await addWordsWritten(-3, new Date(2026, 10, 16));
    });
    const days = await listWritingDays('2026-11-01');
    expect(days.map(({ date, words }) => [date, words])).toEqual([
      ['2026-11-14', 10],
      ['2026-11-15', 45],
    ]);
  });

  it('commits with the page or not at all', async () => {
    const page = await createPage();
    // A save that fails (the page is gone) must not count words.
    await db.pages.delete(page.id);
    await expect(savePageDraft(page.id, { title: 'x', content: textToDoc('Lost words here') })).rejects.toMatchObject({ code: 'not-found' });
    expect(await db.writingDays.count()).toBe(0);
  });
});

describe('summariseWriting', () => {
  const day = (date: string, words: number): WritingDay => ({ date, words, updatedAt: 0 });
  const now = new Date(2026, 10, 17, 15);

  it('counts the streak back from today, and keeps it alive while today is still empty', () => {
    const days = [day('2026-11-13', 50), day('2026-11-15', 10), day('2026-11-16', 200), day('2026-11-17', 30)];
    expect(summariseWriting(days, now)).toMatchObject({ today: 30, streak: 3 });
    expect(summariseWriting(days.slice(0, 3), now)).toMatchObject({ today: 0, streak: 2 });
    expect(summariseWriting(days.slice(0, 2), now)).toMatchObject({ today: 0, streak: 0 });
    expect(summariseWriting([], now)).toMatchObject({ today: 0, streak: 0 });
  });

  it('lists the last seven days, oldest first, with empty days as zero', () => {
    const { week } = summariseWriting([day('2026-11-11', 7), day('2026-11-10', 99), day('2026-11-17', 1)], now);
    expect(week.map((d) => [d.key, d.words])).toEqual([
      ['2026-11-11', 7],
      ['2026-11-12', 0],
      ['2026-11-13', 0],
      ['2026-11-14', 0],
      ['2026-11-15', 0],
      ['2026-11-16', 0],
      ['2026-11-17', 1],
    ]);
  });
});

describe('notebook covers and icons', () => {
  const base = { name: 'Botany', description: '', coverColour: '#2f3e5c', folderId: null };

  it('start plain with no icon, and keep a finish and an icon', async () => {
    const plain = await createNotebook(base);
    expect(plain).toMatchObject({ cover: { kind: 'solid', colour: '#2f3e5c' }, icon: null });
    const dressed = await createNotebook({ ...base, coverKind: 'linen', icon: 'leaf' });
    expect(await getNotebook(dressed.id)).toMatchObject({ cover: { kind: 'linen' }, icon: 'leaf' });
  });

  it('an edit that leaves the finish and icon out keeps them', async () => {
    const notebook = await createNotebook({ ...base, coverKind: 'dots', icon: 'music' });
    await updateNotebookDetails(notebook.id, { name: 'Songs', description: '', coverColour: '#8a5567' });
    expect(await getNotebook(notebook.id)).toMatchObject({ name: 'Songs', cover: { kind: 'dots', colour: '#8a5567' }, icon: 'music' });
    await updateNotebookDetails(notebook.id, { name: 'Songs', description: '', coverColour: '#8a5567', coverKind: 'solid', icon: null });
    expect(await getNotebook(notebook.id)).toMatchObject({ cover: { kind: 'solid' }, icon: null });
  });

  it('rejects an unknown finish or icon', async () => {
    await expect(createNotebook({ ...base, coverKind: 'velvet' as never })).rejects.toMatchObject({ name: 'RepositoryError' });
    await expect(createNotebook({ ...base, icon: '<svg>' as never })).rejects.toMatchObject({ name: 'RepositoryError' });
  });
});

describe('backups with schema version 3', () => {
  it('keep covers, icons and the words written', async () => {
    const notebook = await createNotebook({ name: 'Maths', description: '', coverColour: '#795b43', folderId: null, coverKind: 'grid', icon: 'calculator' });
    const page = await createPage();
    await savePageDraft(page.id, { title: 'x', content: textToDoc('Four words right here') });
    const text = serialiseBackup(await createBackup());
    await db.delete();
    await db.open();

    const file = parseBackup(text);
    expect(file.data.writingDays).toEqual([expect.objectContaining({ date: today(), words: 4 })]);
    await restoreBackup(file, 'merge-skip');
    expect(await getNotebook(notebook.id)).toMatchObject({ cover: { kind: 'grid' }, icon: 'calculator' });
    expect((await db.writingDays.get(today()))?.words).toBe(4);
  });

  it('a merge keeps this device’s day unless asked to take newer ones', async () => {
    const backup = (words: number, updatedAt: number) => {
      const file = { app: 'typenote', formatVersion: 1, schemaVersion: SCHEMA_VERSION, exportedAt: '', data: { folders: [], notebooks: [], pages: [], tags: [], settings: [], writingDays: [{ date: '2026-11-01', words, updatedAt }] } };
      return parseBackup(JSON.stringify(file));
    };
    await db.writingDays.put({ date: '2026-11-01', words: 10, updatedAt: 100 });
    await restoreBackup(backup(500, 200), 'merge-skip');
    expect((await db.writingDays.get('2026-11-01'))?.words).toBe(10);
    await restoreBackup(backup(500, 50), 'merge-newer');
    expect((await db.writingDays.get('2026-11-01'))?.words).toBe(10);
    await restoreBackup(backup(500, 200), 'merge-newer');
    expect((await db.writingDays.get('2026-11-01'))?.words).toBe(500);
  });

  it('an older file without icons or days restores; a damaged day, finish or icon rejects the file', async () => {
    const raw = (patch: (data: Record<string, unknown[]>) => void) => {
      const notebook = { id: 'n1', createdAt: 1, updatedAt: 1, rev: 1, deletedAt: null, trashBatchId: null, name: 'Old', description: '', folderId: null, cover: { kind: 'solid', colour: '#795b43' }, tagIds: [], favourite: false, order: 1 };
      const data: Record<string, unknown[]> = { folders: [], notebooks: [notebook], pages: [], tags: [], settings: [] };
      patch(data);
      return JSON.stringify({ app: 'typenote', formatVersion: 1, schemaVersion: 2, exportedAt: '', data });
    };
    expect(parseBackup(raw(() => undefined)).data).toMatchObject({ notebooks: [{ icon: null }], writingDays: [] });
    expect(() => parseBackup(raw((d) => (d.writingDays = [{ date: 'yesterday', words: 1, updatedAt: 1 }])))).toThrow(/writingDays\[0\]\.date/);
    expect(() => parseBackup(raw((d) => (d.writingDays = [{ date: '2026-11-01', words: -4, updatedAt: 1 }])))).toThrow(/writingDays\[0\]\.words/);
    expect(() => parseBackup(raw((d) => (d.writingDays = [{ date: '2026-11-01', words: 1, updatedAt: 1 }, { date: '2026-11-01', words: 2, updatedAt: 1 }])))).toThrow(/duplicate/);
    expect(() => parseBackup(raw((d) => ((d.notebooks![0] as { cover: object }).cover = { kind: 'url(x)', colour: '#795b43' })))).toThrow(/notebooks\[0\]\.cover\.kind/);
    expect(() => parseBackup(raw((d) => ((d.notebooks![0] as { icon: string }).icon = 'javascript:')))).toThrow(/notebooks\[0\]\.icon/);
  });
});

describe('schema version 3', () => {
  it('opens a version 2 database: notebooks get no icon, the words-written log starts empty', async () => {
    const name = 'typenote-migration-v3-test';
    await Dexie.delete(name);
    const old = new Dexie(name);
    // The released schemas, as they shipped.
    old.version(1).stores({
      folders: 'id, parentId, trashBatchId',
      notebooks: 'id, folderId, *tagIds, trashBatchId',
      pages: 'id, notebookId, folderId, *tagIds, updatedAt, trashBatchId',
      tags: 'id',
      settings: 'key',
      snapshots: 'id, createdAt',
    });
    old.version(2).stores({ drawings: 'id, pageId' });
    await old.table('notebooks').add({ id: 'n1', name: 'Kept', cover: { kind: 'solid', colour: '#263b32' }, folderId: null, tagIds: [], deletedAt: null, trashBatchId: null });
    await old.table('drawings').add({ id: 'd1', pageId: 'p1', width: 1000, height: 600, strokes: [] });
    old.close();

    const upgraded = new TypeNoteDB(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(SCHEMA_VERSION);
    expect(await upgraded.notebooks.get('n1')).toMatchObject({ name: 'Kept', cover: { kind: 'solid', colour: '#263b32' }, icon: null });
    expect(await upgraded.drawings.get('d1')).toMatchObject({ pageId: 'p1' });
    expect(await upgraded.writingDays.count()).toBe(0);
    upgraded.close();
    await Dexie.delete(name);
  });
});
