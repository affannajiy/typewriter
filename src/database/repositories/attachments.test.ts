import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { createBackup, parseBackup, restoreBackup, serialiseBackup } from '@/database/backup/backup';
import { BackupError } from '@/database/backup/validate';
import { SCHEMA_VERSION, TypeNoteDB, db } from '@/database/db';
import type { DocNode } from '@/types/models';
import { attachmentIdsIn } from '@/utils/docFiles';
import {
  addAnnotation,
  addAttachment,
  deleteAnnotation,
  deleteAttachment,
  getAttachment,
  isAllowedMime,
  listAnnotations,
  listAttachments,
  listFileUses,
  readAttachmentBytes,
  renameAttachment,
  restoreAnnotation,
  updateAnnotation,
} from './attachments';
import { RepositoryError } from './common';
import { createPage, savePageDraft } from './pages';
import { emptyTrash, purgeBatch, trashItem } from './trash';

const encoder = new TextEncoder();
const pdfBytes = (text = 'hello') => encoder.encode(`%PDF-1.4\n% ${text}\n%%EOF`).buffer;
const soundBytes = (n = 64) => new Uint8Array(Array.from({ length: n }, (_, i) => i % 256)).buffer;

const addPdf = (name = 'Paper') => addAttachment({ kind: 'pdf', name, mimeType: 'application/pdf', bytes: pdfBytes(name), pageCount: 3 });
const addSound = (name = 'Lecture') => addAttachment({ kind: 'audio', name, mimeType: 'audio/webm;codecs=opus', bytes: soundBytes(), durationMs: 65_000 });

const docWith = (...blocks: DocNode[]): DocNode => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Notes' }] }, ...blocks] });
const pdfBlock = (attachmentId: string | null): DocNode => ({ type: 'pdf', attrs: { attachmentId } });
const audioBlock = (attachmentId: string | null): DocNode => ({ type: 'audio', attrs: { attachmentId } });

async function pageWith(title: string, ...blocks: DocNode[]) {
  const page = await createPage({ title });
  await savePageDraft(page.id, { title, content: docWith(...blocks) });
  return page;
}

const rejectsWith = async (work: Promise<unknown>, code: string) => {
  const error = await work.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(RepositoryError);
  expect((error as RepositoryError).code).toBe(code);
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('attachments', () => {
  it('stores a file and its bytes apart, and lists files newest first without their bytes', async () => {
    const pdf = await addPdf();
    const sound = await addSound();
    expect(pdf).toMatchObject({ kind: 'pdf', name: 'Paper', size: pdfBytes('Paper').byteLength, pageCount: 3, durationMs: null, rev: 1 });
    expect(new Uint8Array(await readAttachmentBytes(pdf.id))).toEqual(new Uint8Array(pdfBytes('Paper')));
    const listed = await listAttachments();
    expect(listed.map((file) => file.id)).toEqual(sound.createdAt >= pdf.createdAt ? [sound.id, pdf.id] : [pdf.id, sound.id]);
    expect(listed[0]).not.toHaveProperty('bytes');
  });

  it('refuses empty files, unknown types, and a "PDF" that is not one', async () => {
    await rejectsWith(addAttachment({ kind: 'pdf', name: 'x', mimeType: 'application/pdf', bytes: new ArrayBuffer(0) }), 'invalid-file');
    await rejectsWith(addAttachment({ kind: 'pdf', name: 'x', mimeType: 'application/pdf', bytes: encoder.encode('<html>').buffer }), 'invalid-file');
    await rejectsWith(addAttachment({ kind: 'audio', name: 'x', mimeType: 'video/mp4', bytes: soundBytes() }), 'invalid-file');
    await rejectsWith(addAttachment({ kind: 'pdf', name: 'x', mimeType: 'text/html', bytes: pdfBytes() }), 'invalid-file');
    expect(await db.attachments.count()).toBe(0);
    expect(await db.attachmentData.count()).toBe(0);
    expect(isAllowedMime('audio', 'audio/webm;codecs=opus')).toBe(true);
    expect(isAllowedMime('audio', 'audio/mp4')).toBe(true);
    expect(isAllowedMime('audio', 'audio/x"><script')).toBe(false);
  });

  it('refuses a file over 100 MB', async () => {
    await rejectsWith(addAttachment({ kind: 'audio', name: 'Long', mimeType: 'audio/webm', bytes: new ArrayBuffer(100 * 1024 * 1024 + 1) }), 'file-too-large');
  });

  it('a rename is an edit; an empty name keeps the old one', async () => {
    const file = await addSound();
    await renameAttachment(file.id, '  Week 3   seminar ');
    expect(await getAttachment(file.id)).toMatchObject({ name: 'Week 3 seminar', rev: 2 });
    await renameAttachment(file.id, '   ');
    expect(await getAttachment(file.id)).toMatchObject({ name: 'Week 3 seminar', rev: 3 });
  });

  it('finds the files a document names, at any depth and once each', () => {
    const doc = docWith(pdfBlock('a'), { type: 'blockquote', content: [audioBlock('b')] }, pdfBlock('a'), pdfBlock(null));
    expect([...attachmentIdsIn(doc)].sort()).toEqual(['a', 'b']);
  });

  it('knows which pages use a file, live and in the Trash', async () => {
    const file = await addPdf();
    const live = await pageWith('Live', pdfBlock(file.id));
    const trashed = await pageWith('Old', pdfBlock(file.id));
    await trashItem({ kind: 'page', id: trashed.id });
    const use = (await listFileUses()).get(file.id);
    expect(use?.live.map((p) => p.id)).toEqual([live.id]);
    expect(use?.trashed.map((p) => p.id)).toEqual([trashed.id]);
  });

  it('is deleted on request only when no page uses it, with its bytes and highlights', async () => {
    const file = await addPdf();
    const page = await pageWith('Reading', pdfBlock(file.id));
    await addAnnotation({ attachmentId: file.id, page: 1, colour: 'yellow', rects: [0.1, 0.1, 0.5, 0.02], quote: 'Hi' });

    await rejectsWith(deleteAttachment(file.id), 'file-in-use');
    // A page in the Trash still counts: restoring it must bring the file back.
    await trashItem({ kind: 'page', id: page.id });
    await rejectsWith(deleteAttachment(file.id), 'file-in-use');

    // The block removed from the page: now it may go.
    await db.pages.where('id').equals(page.id).modify((row) => {
      row.content = docWith();
    });
    await deleteAttachment(file.id);
    expect(await getAttachment(file.id)).toBeUndefined();
    expect(await db.attachmentData.get(file.id)).toBeUndefined();
    expect(await db.annotations.count()).toBe(0);
  });

  it('goes with the last page that used it when that page is deleted permanently, and stays while another page uses it', async () => {
    const shared = await addPdf('Shared');
    const own = await addSound('Own');
    const kept = await addSound('Kept, unused');
    const first = await pageWith('First', pdfBlock(shared.id), audioBlock(own.id));
    await pageWith('Second', pdfBlock(shared.id));

    const { batchId } = await trashItem({ kind: 'page', id: first.id });
    // Still in the Trash: nothing is deleted.
    expect(await db.attachments.count()).toBe(3);
    await purgeBatch(batchId);

    expect(await getAttachment(own.id)).toBeUndefined();
    expect(await db.attachmentData.get(own.id)).toBeUndefined();
    expect(await getAttachment(shared.id)).toBeDefined();
    // A file no page used was not touched by a purge it had nothing to do with.
    expect(await getAttachment(kept.id)).toBeDefined();
  });

  it('emptying the Trash deletes the files only its pages used', async () => {
    const file = await addSound();
    const page = await pageWith('Lecture', audioBlock(file.id));
    await trashItem({ kind: 'page', id: page.id });
    await emptyTrash();
    expect(await db.attachments.count()).toBe(0);
    expect(await db.attachmentData.count()).toBe(0);
  });
});

describe('highlights', () => {
  it('are kept in reading order and edited with a revision', async () => {
    const file = await addPdf();
    const low = await addAnnotation({ attachmentId: file.id, page: 2, colour: 'green', rects: [0.1, 0.8, 0.5, 0.02], quote: 'Low' });
    const high = await addAnnotation({ attachmentId: file.id, page: 2, colour: 'blue', rects: [0.1, 0.2, 0.5, 0.02], quote: 'High' });
    const first = await addAnnotation({ attachmentId: file.id, page: 1, colour: 'yellow', rects: [0.1, 0.9, 0.5, 0.02], quote: 'First', note: 'n' });
    expect((await listAnnotations(file.id)).map((a) => a.id)).toEqual([first.id, high.id, low.id]);

    await updateAnnotation(low.id, { note: 'Check this', colour: 'red' });
    expect((await listAnnotations(file.id)).at(-1)).toMatchObject({ note: 'Check this', colour: 'red', rev: 2 });
  });

  it('keep rectangles inside the page and refuse a highlight with no area', async () => {
    const file = await addPdf();
    const item = await addAnnotation({ attachmentId: file.id, page: 1, colour: 'yellow', rects: [-0.2, 0.5, 1.4, 0.1], quote: 'x' });
    expect(item.rects).toEqual([0, 0.5, 1, 0.1]);
    await rejectsWith(addAnnotation({ attachmentId: file.id, page: 1, colour: 'yellow', rects: [], quote: 'x' }), 'invalid-file');
    await rejectsWith(addAnnotation({ attachmentId: 'missing', page: 1, colour: 'yellow', rects: [0, 0, 1, 1], quote: 'x' }), 'not-found');
  });

  it('a deleted highlight comes back with Undo exactly as it was', async () => {
    const file = await addPdf();
    const item = await addAnnotation({ attachmentId: file.id, page: 1, colour: 'yellow', rects: [0.1, 0.1, 0.3, 0.02], quote: 'Q', note: 'N' });
    const removed = await deleteAnnotation(item.id);
    expect(await listAnnotations(file.id)).toEqual([]);
    await restoreAnnotation(removed);
    expect(await listAnnotations(file.id)).toEqual([item]);
  });
});

describe('files in backups', () => {
  it('round trip with their bytes, highlights and the pages that show them', async () => {
    const pdf = await addPdf();
    const sound = await addSound();
    await pageWith('Seminar', pdfBlock(pdf.id), audioBlock(sound.id));
    const note = await addAnnotation({ attachmentId: pdf.id, page: 1, colour: 'blue', rects: [0.1, 0.1, 0.3, 0.02], quote: 'Q', note: 'N' });
    const text = serialiseBackup(await createBackup());
    expect(text).not.toContain('"bytes"');

    await db.delete();
    await db.open();
    const file = parseBackup(text);
    expect(file.formatVersion).toBe(3);
    expect(file.data.attachments).toHaveLength(2);
    const report = await restoreBackup(file, 'merge-skip');
    expect(report.added).toBe(4); // one page, two files, one highlight

    expect(new Uint8Array(await readAttachmentBytes(sound.id))).toEqual(new Uint8Array(soundBytes()));
    expect(new Uint8Array(await readAttachmentBytes(pdf.id))).toEqual(new Uint8Array(pdfBytes('Paper')));
    expect(await getAttachment(sound.id)).toMatchObject({ name: 'Lecture', durationMs: 65_000, mimeType: 'audio/webm;codecs=opus' });
    expect(await listAnnotations(pdf.id)).toEqual([note]);
  });

  it('a merge never replaces a file’s bytes, only its name when asked for newer', async () => {
    const file = await addSound();
    const text = serialiseBackup(await createBackup());
    const parsed = parseBackup(text);
    parsed.data.attachments[0]!.name = 'Renamed elsewhere';
    parsed.data.attachments[0]!.updatedAt += 1000;
    parsed.data.attachmentData[0]!.bytes = soundBytes(8);
    parsed.data.attachments[0]!.size = 8;
    await restoreBackup(parsed, 'merge-newer');
    expect(await getAttachment(file.id)).toMatchObject({ name: 'Renamed elsewhere', size: 64 });
    expect((await readAttachmentBytes(file.id)).byteLength).toBe(64);
  });

  it('a replace and its undo bring files back', async () => {
    const before = await addSound('Before');
    const text = serialiseBackup(await createBackup());
    await addPdf('Added later');
    const report = await restoreBackup(parseBackup(text), 'replace');
    expect((await listAttachments()).map((f) => f.name)).toEqual(['Before']);
    expect(report.snapshotId).not.toBeNull();
    expect((await readAttachmentBytes(before.id)).byteLength).toBe(64);
  });

  it('a backup larger than can be restored is not made', async () => {
    await addSound();
    const file = await createBackup();
    expect(() => serialiseBackup(file, 100)).toThrow(BackupError);
    try {
      serialiseBackup(file, 100);
    } catch (error) {
      expect((error as BackupError).code).toBe('export-too-large');
    }
  });

  it('a damaged file entry rejects the whole backup and says where', async () => {
    await addPdf();
    await addAnnotation({ attachmentId: (await listAttachments())[0]!.id, page: 1, colour: 'yellow', rects: [0, 0, 1, 0.1], quote: 'q' });
    const good = JSON.parse(serialiseBackup(await createBackup())) as { data: Record<string, Record<string, unknown>[]> };
    const variant = (change: (data: Record<string, Record<string, unknown>[]>) => void) => {
      const copy = structuredClone(good);
      change(copy.data);
      return JSON.stringify(copy);
    };
    const expectInvalid = (text: string, path: string) => {
      try {
        parseBackup(text);
        expect.unreachable('should be rejected');
      } catch (error) {
        expect(error).toBeInstanceOf(BackupError);
        expect((error as BackupError).detail).toBe(path);
      }
    };
    expectInvalid(variant((d) => (d.attachmentData![0]!.data = 'not base64!')), 'attachmentData[0].data');
    expectInvalid(variant((d) => (d.attachments![0]!.size = 3)), 'attachmentData[0].data');
    expectInvalid(variant((d) => (d.attachmentData![0]!.data = btoa('<html>not a pdf</html>'))), 'attachmentData[0].data');
    expectInvalid(variant((d) => (d.attachmentData = [])), 'attachments[0].id');
    expectInvalid(variant((d) => (d.attachments![0]!.kind = 'video')), 'attachments[0].kind');
    expectInvalid(variant((d) => (d.attachments![0]!.mimeType = 'text/html')), 'attachments[0].mimeType');
    expectInvalid(variant((d) => (d.annotations![0]!.attachmentId = 'gone')), 'annotations[0].attachmentId');
    expectInvalid(variant((d) => (d.annotations![0]!.rects = [0, 0, 2, 0.1])), 'annotations[0].rects[2]');
    expectInvalid(variant((d) => (d.annotations![0]!.colour = 'purple')), 'annotations[0].colour');
  });

  it('a backup made before files existed still restores', async () => {
    const old = JSON.stringify({ app: 'typenote', formatVersion: 1, schemaVersion: 3, exportedAt: '2026-11-17T00:00:00.000Z', data: { folders: [], notebooks: [], pages: [], tags: [], settings: [] } });
    const file = parseBackup(old);
    expect(file.data).toMatchObject({ attachments: [], attachmentData: [], annotations: [] });
    await restoreBackup(file, 'merge-skip');
    expect(await db.attachments.count()).toBe(0);
  });
});

describe('schema version 4', () => {
  it('opens a version 3 database with its content intact and empty file tables', async () => {
    const name = 'typenote-migration-v4-test';
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
    old.version(3).stores({ writingDays: 'date' });
    await old.table('pages').add({ id: 'p1', title: 'Kept', notebookId: null, folderId: null, content: docWith(), plainText: 'Notes', tagIds: [], deletedAt: null, trashBatchId: null });
    await old.table('writingDays').add({ date: '2026-11-17', words: 12, updatedAt: 1 });
    old.close();

    const upgraded = new TypeNoteDB(name);
    await upgraded.open();
    expect(upgraded.verno).toBe(SCHEMA_VERSION);
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(4);
    expect(await upgraded.pages.get('p1')).toMatchObject({ title: 'Kept', plainText: 'Notes' });
    // The words-written log was removed in schema version 6.
    expect(await upgraded.attachments.count()).toBe(0);
    expect(await upgraded.attachmentData.count()).toBe(0);
    expect(await upgraded.annotations.count()).toBe(0);
    upgraded.close();
    await Dexie.delete(name);
  });
});
