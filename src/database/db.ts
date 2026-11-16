import Dexie, { type EntityTable } from 'dexie';
import type { Annotation, Attachment, AttachmentData, Drawing, Folder, Notebook, Page, SafetySnapshot, SettingRecord, Tag, WritingDay } from '@/types/models';

/**
 * Current database schema version. Bump it together with a new
 * `this.version(n)` block. Never edit a released version block: add a new
 * one with an `.upgrade()` step so existing data is migrated, not lost.
 */
export const SCHEMA_VERSION = 4;

export class TypeNoteDB extends Dexie {
  folders!: EntityTable<Folder, 'id'>;
  notebooks!: EntityTable<Notebook, 'id'>;
  pages!: EntityTable<Page, 'id'>;
  tags!: EntityTable<Tag, 'id'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  snapshots!: EntityTable<SafetySnapshot, 'id'>;
  drawings!: EntityTable<Drawing, 'id'>;
  writingDays!: EntityTable<WritingDay, 'date'>;
  attachments!: EntityTable<Attachment, 'id'>;
  attachmentData!: EntityTable<AttachmentData, 'id'>;
  annotations!: EntityTable<Annotation, 'id'>;

  constructor(name = 'typenote') {
    super(name);
    // Only indexed fields are listed. `*` marks a multi-entry (array) index.
    // Released. Do not edit.
    this.version(1).stores({
      folders: 'id, parentId, trashBatchId',
      notebooks: 'id, folderId, *tagIds, trashBatchId',
      pages: 'id, notebookId, folderId, *tagIds, updatedAt, trashBatchId',
      tags: 'id',
      settings: 'key',
      snapshots: 'id, createdAt',
    });
    // 0.4.0: drawings. A new table only; no existing row changes shape.
    this.version(2)
      .stores({ drawings: 'id, pageId' })
      .upgrade(async (tx) => {
        // Nothing to convert: pages written before 0.4.0 hold no drawing blocks.
        // Counted so the step fails loudly if the new table was not created.
        await tx.table('drawings').count();
      });
    // 0.5.0: notebook icons and the words-written log. Notebooks gain `icon`;
    // no index changes on existing tables.
    this.version(3)
      .stores({ writingDays: 'date' })
      .upgrade(async (tx) => {
        await tx
          .table('notebooks')
          .toCollection()
          .modify((notebook: Record<string, unknown>) => {
            if (notebook.icon === undefined) notebook.icon = null;
          });
      });
    // 0.6.0: PDFs and recordings, their bytes, and PDF highlights. New tables only.
    this.version(4)
      .stores({ attachments: 'id, kind', attachmentData: 'id', annotations: 'id, attachmentId' })
      .upgrade(async (tx) => {
        // Nothing to convert: pages written before 0.6.0 hold no file blocks.
        await tx.table('attachments').count();
      });
  }
}

/** The single database instance. Only repositories and backup code import it. */
export const db = new TypeNoteDB();

/** Tables that hold user content, in the order used by backup and restore. */
export const contentTables = () => [db.folders, db.notebooks, db.pages, db.tags, db.settings, db.drawings, db.writingDays, db.attachments, db.attachmentData, db.annotations] as const;
