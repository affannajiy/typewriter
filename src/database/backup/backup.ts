import { SCHEMA_VERSION, db } from '@/database/db';
import { newId, now } from '@/database/repositories/common';
import type { Drawing, Folder, Id, Notebook, Page, SafetySnapshot, Tag } from '@/types/models';
import { BACKUP_FORMAT_VERSION, type BackupData, type BackupFile, parseBackup } from './validate';

export { BackupError, parseBackup, type BackupFile } from './validate';

/**
 * Backup and restore.
 *
 * Restore runs in one IndexedDB transaction: it either completes or leaves
 * the existing workspace exactly as it was. "Replace" also stores a safety
 * snapshot of the old workspace first, so the user can undo it.
 */

const allTables = () => [db.folders, db.notebooks, db.pages, db.tags, db.settings, db.drawings, db.writingDays] as const;
const SNAPSHOTS_KEPT = 3;

async function readAll(): Promise<BackupData> {
  const [folders, notebooks, pages, tags, settings, drawings, writingDays] = await Promise.all([
    db.folders.toArray(),
    db.notebooks.toArray(),
    db.pages.toArray(),
    db.tags.toArray(),
    db.settings.toArray(),
    db.drawings.toArray(),
    db.writingDays.toArray(),
  ]);
  return { folders, notebooks, pages, tags, settings, drawings, writingDays };
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
  };
}

export const serialiseBackup = (file: BackupFile): string => JSON.stringify(file);

export function backupFileName(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `typenote-backup-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`;
}

export interface BackupSummary {
  counts: { folders: number; notebooks: number; pages: number; tags: number };
  /** Records in the file whose ID already exists in this workspace. */
  duplicates: number;
  workspaceIsEmpty: boolean;
}

export async function analyseBackup(file: BackupFile): Promise<BackupSummary> {
  const current = await readAll();
  const existing = new Set<Id>([...current.folders, ...current.notebooks, ...current.pages, ...current.tags].map((r) => r.id));
  const { folders, notebooks, pages, tags } = file.data;
  const incoming = [...folders, ...notebooks, ...pages, ...tags];
  return {
    counts: { folders: folders.length, notebooks: notebooks.length, pages: pages.length, tags: tags.length },
    duplicates: incoming.filter((r) => existing.has(r.id)).length,
    workspaceIsEmpty: existing.size === 0,
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
 * Make every reference point at something that exists: a missing parent
 * becomes the top level, a missing tag is dropped, a folder cycle is cut.
 * Must run inside a read-write transaction on the content tables.
 */
export async function repairReferences(): Promise<number> {
  let repaired = 0;
  const folders = await db.folders.toArray();
  const folderIds = new Set(folders.map((f) => f.id));
  const parentOf = new Map(folders.map((f) => [f.id, f.parentId]));

  for (const folder of folders) {
    let broken = folder.parentId !== null && !folderIds.has(folder.parentId);
    // Walk up the parents. Meeting this folder again means a cycle.
    const seen = new Set<Id>();
    for (let cursor = folder.parentId; !broken && cursor !== null; cursor = parentOf.get(cursor) ?? null) {
      if (cursor === folder.id || seen.has(cursor)) broken = true;
      seen.add(cursor);
    }
    if (broken) {
      await db.folders.update(folder.id, { parentId: null });
      parentOf.set(folder.id, null);
      repaired++;
    }
  }

  const notebookIds = new Set((await db.notebooks.toArray()).map((n) => n.id));
  const tagIds = new Set((await db.tags.toArray()).map((t) => t.id));

  await db.notebooks.toCollection().modify((n) => {
    if (n.folderId !== null && !folderIds.has(n.folderId)) {
      n.folderId = null;
      repaired++;
    }
    const kept = n.tagIds.filter((t) => tagIds.has(t));
    if (kept.length !== n.tagIds.length) n.tagIds = kept;
  });
  await db.pages.toCollection().modify((p) => {
    if (p.folderId !== null && !folderIds.has(p.folderId)) {
      p.folderId = null;
      repaired++;
    }
    if (p.notebookId !== null && !notebookIds.has(p.notebookId)) {
      p.notebookId = null;
      repaired++;
    }
    const kept = p.tagIds.filter((t) => tagIds.has(t));
    if (kept.length !== p.tagIds.length) p.tagIds = kept;
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
  await Promise.all(allTables().map((table) => table.clear()));
  await db.folders.bulkAdd(data.folders);
  await db.notebooks.bulkAdd(data.notebooks);
  await db.pages.bulkAdd(data.pages);
  await db.tags.bulkAdd(data.tags);
  await db.settings.bulkAdd(data.settings);
  await db.drawings.bulkAdd(data.drawings);
  await db.writingDays.bulkAdd(data.writingDays);
}

export async function restoreBackup(file: BackupFile, mode: RestoreMode): Promise<RestoreReport> {
  const report: RestoreReport = { added: 0, updated: 0, skipped: 0, repaired: 0, snapshotId: null };
  const { data } = file;

  if (mode === 'replace') {
    report.snapshotId = await saveSnapshot();
    await db.transaction('rw', allTables(), async () => {
      await replaceAll(data);
      report.added = data.folders.length + data.notebooks.length + data.pages.length + data.tags.length;
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
    await merge<Folder>(db.folders, data.folders);
    await merge<Notebook>(db.notebooks, data.notebooks);
    await merge<Page>(db.pages, data.pages);
    await merge<Tag>(db.tags, data.tags);
    await merge<Drawing>(db.drawings, data.drawings);
    // Words-written days are history, not content: they are not counted in the report.
    for (const day of data.writingDays) {
      const existing = await db.writingDays.get(day.date);
      if (!existing || (mode === 'merge-newer' && day.updatedAt > existing.updatedAt)) await db.writingDays.put(day);
    }
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
  await db.transaction('rw', [...allTables(), db.snapshots], async () => {
    await replaceAll(file.data);
    await db.snapshots.delete(id);
  });
}
