import Dexie, { type EntityTable } from 'dexie';
import type { Folder, Notebook, Page, SafetySnapshot, SettingRecord, Tag } from '@/types/models';

/**
 * Current database schema version. Bump it together with a new
 * `this.version(n)` block. Never edit a released version block: add a new
 * one with an `.upgrade()` step so existing data is migrated, not lost.
 */
export const SCHEMA_VERSION = 1;

export class TypeNoteDB extends Dexie {
  folders!: EntityTable<Folder, 'id'>;
  notebooks!: EntityTable<Notebook, 'id'>;
  pages!: EntityTable<Page, 'id'>;
  tags!: EntityTable<Tag, 'id'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  snapshots!: EntityTable<SafetySnapshot, 'id'>;

  constructor(name = 'typenote') {
    super(name);
    // Only indexed fields are listed. `*` marks a multi-entry (array) index.
    this.version(1).stores({
      folders: 'id, parentId, trashBatchId',
      notebooks: 'id, folderId, *tagIds, trashBatchId',
      pages: 'id, notebookId, folderId, *tagIds, updatedAt, trashBatchId',
      tags: 'id',
      settings: 'key',
      snapshots: 'id, createdAt',
    });
  }
}

/** The single database instance. Only repositories and backup code import it. */
export const db = new TypeNoteDB();

/** Tables that hold user content, in the order used by backup and restore. */
export const contentTables = () => [db.folders, db.notebooks, db.pages, db.tags, db.settings] as const;
