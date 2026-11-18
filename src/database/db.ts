import Dexie, { type EntityTable } from 'dexie';
import type { Annotation, Attachment, AttachmentData, DocNode, Drawing, Notebook, Page, PdfText, SafetySnapshot, SettingRecord } from '@/types/models';
import { REMOVED_SETTING_KEYS, convertLegacyDoc, dropLegacyFields } from './legacy';

/**
 * Current database schema version. Bump it together with a new
 * `this.version(n)` block. Never edit a released version block: add a new
 * one with an `.upgrade()` step so existing data is migrated, not lost.
 */
export const SCHEMA_VERSION = 6;

export class TypeNoteDB extends Dexie {
  notebooks!: EntityTable<Notebook, 'id'>;
  pages!: EntityTable<Page, 'id'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  snapshots!: EntityTable<SafetySnapshot, 'id'>;
  drawings!: EntityTable<Drawing, 'id'>;
  attachments!: EntityTable<Attachment, 'id'>;
  attachmentData!: EntityTable<AttachmentData, 'id'>;
  annotations!: EntityTable<Annotation, 'id'>;
  pdfTexts!: EntityTable<PdfText, 'id'>;

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
    // 0.7.0: flashcard decks, cards and their review history. New tables only.
    this.version(5)
      .stores({ decks: 'id', flashcards: 'id, deckId, due, sourcePageId', reviewLogs: 'id, cardId, deckId, reviewedAt' })
      .upgrade(async (tx) => {
        // Nothing to convert: there were no flashcards before 0.7.0.
        await tx.table('flashcards').count();
      });
    // 0.8.0, the revamp: a notepad, not a study app. Folders, tags, flashcards
    // and the words-written log are removed. Notebooks that were in folders
    // go to the shelf; pages that were in folders become loose pages. A page
    // link becomes the text of its title. A new table keeps the text of each
    // PDF, so search can find words in it.
    this.version(6)
      .stores({
        notebooks: 'id, trashBatchId',
        pages: 'id, notebookId, updatedAt, trashBatchId',
        pdfTexts: 'id',
        folders: null,
        tags: null,
        writingDays: null,
        decks: null,
        flashcards: null,
        reviewLogs: null,
      })
      .upgrade(async (tx) => {
        await tx
          .table('notebooks')
          .toCollection()
          .modify((notebook: Record<string, unknown>) => dropLegacyFields(notebook));
        await tx
          .table('pages')
          .toCollection()
          .modify((page: Record<string, unknown>) => {
            dropLegacyFields(page);
            page.content = convertLegacyDoc(page.content as DocNode);
          });
        await tx.table('settings').bulkDelete([...REMOVED_SETTING_KEYS]);
      });
  }
}

/** The single database instance. Only repositories and backup code import it. */
export const db = new TypeNoteDB();

/** Tables that hold user content, in the order used by backup and restore. */
export const contentTables = () => [db.notebooks, db.pages, db.settings, db.drawings, db.attachments, db.attachmentData, db.annotations] as const;
