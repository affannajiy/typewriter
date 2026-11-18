import { SCHEMA_VERSION, db } from '@/database/db';
import { newId, now } from '@/database/repositories/common';
import type { Annotation, Drawing, Id, Notebook, Page, SafetySnapshot } from '@/types/models';
import { bytesToBase64 } from '@/utils/base64';
import { BACKUP_FORMAT_VERSION, type BackupData, BackupError, type BackupFile, MAX_BACKUP_BYTES, parseBackup } from './validate';

export { BackupError, parseBackup, type BackupFile } from './validate';

/**
 * Backup and restore.
 *
 * Restore runs in one IndexedDB transaction: it either completes or leaves
 * the existing workspace exactly as it was. "Replace" also stores a safety
 * snapshot of the old workspace first, so the user can undo it.
 */

const allTables = () => [db.notebooks, db.pages, db.settings, db.drawings, db.attachments, db.attachmentData, db.annotations] as const;
const SNAPSHOTS_KEPT = 3;

async function readAll(): Promise<BackupData> {
  const [notebooks, pages, settings, drawings, attachments, attachmentData, annotations] = await Promise.all([
    db.notebooks.toArray(),
    db.pages.toArray(),
    db.settings.toArray(),
    db.drawings.toArray(),
    db.attachments.toArray(),
    db.attachmentData.toArray(),
    db.annotations.toArray(),
  ]);
  return { notebooks, pages, settings, drawings, attachments, attachmentData, annotations };
}

/** A full copy of the workspace, including items in the Trash. */
export async function createBackup(): Promise<BackupFile> {
  const data = await db.transaction('r', allTables(), readAll);
  return {
    app: 'typenote',
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data,
    droppedLegacy: false,
  };
}

/**
 * The backup as text. File bytes become base64. A backup larger than the app
 * can restore is refused here, so no one keeps a backup that cannot be used.
 */
export function serialiseBackup(file: BackupFile, limit = MAX_BACKUP_BYTES): string {
  const attachmentData = file.data.attachmentData.map((entry) => ({ id: entry.id, data: bytesToBase64(entry.bytes) }));
  const { droppedLegacy: _, ...written } = file;
  const text = JSON.stringify({ ...written, data: { ...file.data, attachmentData } });
  if (text.length > limit) throw new BackupError('export-too-large');
  return text;
}

export function backupFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `typenote-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

export interface BackupSummary {
  counts: { notebooks: number; pages: number; files: number };
  /** Records in the file whose ID already exists in this workspace. */
  duplicates: number;
  workspaceIsEmpty: boolean;
  /** True when the file was made before 0.8.0 and held folders, tags, flashcards or writing stats, which are not restored. */
  droppedLegacy: boolean;
}

export async function analyseBackup(file: BackupFile): Promise<BackupSummary> {
  const current = await readAll();
  const existing = new Set<Id>([...current.notebooks, ...current.pages].map((r) => r.id));
  const { notebooks, pages } = file.data;
  return {
    counts: { notebooks: notebooks.length, pages: pages.length, files: file.data.attachments.length },
    duplicates: [...notebooks, ...pages].filter((r) => existing.has(r.id)).length,
    workspaceIsEmpty: existing.size === 0,
    droppedLegacy: file.droppedLegacy,
  };
}

export type RestoreMode = 'merge-skip' | 'merge-newer' | 'replace';

export interface RestoreReport {
  added: number;
  updated: number;
  skipped: number;
  /** References to missing items that were reset to the top level. */
  repaired: number;
  snapshotId: Id | null;
}

/**
 * Make every reference point at something that exists: a page whose
 * notebook is missing becomes a loose page.
 * Must run inside a read-write transaction on the content tables.
 */
export async function repairReferences(): Promise<number> {
  let repaired = 0;
  const notebookIds = new Set(await db.notebooks.toCollection().primaryKeys());
  await db.pages.toCollection().modify((p) => {
    if (p.notebookId !== null && !notebookIds.has(p.notebookId)) {
      p.notebookId = null;
      repaired++;
    }
  });
  return repaired;
}

async function saveSnapshot(): Promise<Id> {
  const snapshot: SafetySnapshot = { id: newId(), createdAt: now(), payload: serialiseBackup(await createBackup()) };
  await db.transaction('rw', db.snapshots, async () => {
    await db.snapshots.add(snapshot);
    const old = await db.snapshots.orderBy('createdAt').reverse().offset(SNAPSHOTS_KEPT).primaryKeys();
    await db.snapshots.bulkDelete(old);
  });
  return snapshot.id;
}

async function replaceAll(data: BackupData): Promise<void> {
  // The text read from PDFs is not in backups: it is read again from the restored files.
  await Promise.all([...allTables(), db.pdfTexts].map((table) => table.clear()));
  await db.notebooks.bulkAdd(data.notebooks);
  await db.pages.bulkAdd(data.pages);
  await db.settings.bulkAdd(data.settings);
  await db.drawings.bulkAdd(data.drawings);
  await db.attachments.bulkAdd(data.attachments);
  await db.attachmentData.bulkAdd(data.attachmentData);
  await db.annotations.bulkAdd(data.annotations);
}

export async function restoreBackup(file: BackupFile, mode: RestoreMode): Promise<RestoreReport> {
  const report: RestoreReport = { added: 0, updated: 0, skipped: 0, repaired: 0, snapshotId: null };
  const { data } = file;

  if (mode === 'replace') {
    report.snapshotId = await saveSnapshot();
    await db.transaction('rw', [...allTables(), db.pdfTexts], async () => {
      await replaceAll(data);
      report.added = data.notebooks.length + data.pages.length + data.attachments.length;
      report.repaired = await repairReferences();
    });
    return report;
  }

  await db.transaction('rw', allTables(), async () => {
    const merge = async <T extends { id: Id; updatedAt: number }>(
      table: { get(id: Id): PromiseLike<T | undefined>; put(item: T): PromiseLike<unknown> },
      incoming: T[],
    ) => {
      for (const item of incoming) {
        const existing = await table.get(item.id);
        if (!existing) {
          await table.put(item);
          report.added++;
        } else if (mode === 'merge-newer' && item.updatedAt > existing.updatedAt) {
          await table.put(item);
          report.updated++;
        } else {
          report.skipped++;
        }
      }
    };
    await merge<Notebook>(db.notebooks, data.notebooks);
    await merge<Page>(db.pages, data.pages);
    await merge<Drawing>(db.drawings, data.drawings);
    // A file's bytes never change, so they arrive with a new file and are never replaced.
    const bytes = new Map(data.attachmentData.map((entry) => [entry.id, entry]));
    for (const file of data.attachments) {
      const existing = await db.attachments.get(file.id);
      if (!existing) {
        await db.attachments.put(file);
        await db.attachmentData.put(bytes.get(file.id)!);
        report.added++;
      } else if (mode === 'merge-newer' && file.updatedAt > existing.updatedAt) {
        await db.attachments.put({ ...file, kind: existing.kind, mimeType: existing.mimeType, size: existing.size });
        report.updated++;
      } else {
        report.skipped++;
      }
    }
    // Highlights are notes on a file: they are merged like content.
    await merge<Annotation>(db.annotations, data.annotations);
    // Settings on this device win in a merge: only missing keys are added.
    for (const setting of data.settings) {
      if (!(await db.settings.get(setting.key))) await db.settings.put(setting);
    }
    report.repaired = await repairReferences();
  });
  return report;
}

export async function latestSnapshot(): Promise<Pick<SafetySnapshot, 'id' | 'createdAt'> | null> {
  const snapshot = await db.snapshots.orderBy('createdAt').last();
  return snapshot ? { id: snapshot.id, createdAt: snapshot.createdAt } : null;
}

/** Undo a "replace" restore by putting the safety snapshot back. */
export async function restoreSnapshot(id: Id): Promise<void> {
  const snapshot = await db.snapshots.get(id);
  if (!snapshot) throw new Error('Safety snapshot not found');
  const file = parseBackup(snapshot.payload);
  await db.transaction('rw', [...allTables(), db.pdfTexts, db.snapshots], async () => {
    await replaceAll(file.data);
    await db.snapshots.delete(id);
  });
}
