import { db } from '@/database/db';
import type { Annotation, Attachment, AttachmentKind, HighlightColour, Id, Page } from '@/types/models';
import { attachmentIdsIn } from '@/utils/docFiles';
import { RepositoryError, bump, cleanName, found, freshVersion } from './common';

/**
 * Attachments: PDFs and sound recordings.
 *
 * A file is added once and its bytes never change. Pages show it through a
 * block that names its ID, and two blocks may name the same file. A file is
 * deleted only on purpose: by the user, from Files, once no page uses it; or
 * with the last page that used it, when that page is deleted permanently.
 * Removing the block alone keeps the file, so undo brings it back.
 */

/** The largest file the app accepts, in bytes. Backups hold files as text, so this keeps them restorable. */
export const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;

const MIME_PATTERN = /^[a-z]+\/[a-z0-9.+-]+(;\s*[a-z0-9-]+=[a-z0-9.,"' +-]+)*$/i;

export function isAllowedMime(kind: AttachmentKind, mimeType: string): boolean {
  if (mimeType.length > 100 || !MIME_PATTERN.test(mimeType)) return false;
  return kind === 'pdf' ? mimeType === 'application/pdf' : mimeType.toLowerCase().startsWith('audio/');
}

/** True when the bytes start like a PDF file ("%PDF-" in the first kilobyte), wherever the file came from. */
export function looksLikePdf(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(1024, bytes.byteLength));
  return String.fromCharCode(...head).includes('%PDF-');
}

export interface NewAttachment {
  kind: AttachmentKind;
  name: string;
  mimeType: string;
  bytes: ArrayBuffer;
  durationMs?: number | null;
  pageCount?: number | null;
}

/** Store a new file and its bytes in one transaction. Checks size and type. */
export async function addAttachment(input: NewAttachment): Promise<Attachment> {
  const size = input.bytes.byteLength;
  if (size === 0) throw new RepositoryError('invalid-file', 'Empty file');
  if (size > MAX_ATTACHMENT_BYTES) throw new RepositoryError('file-too-large', 'File too large');
  if (!isAllowedMime(input.kind, input.mimeType)) throw new RepositoryError('invalid-file', 'Unsupported file type');
  if (input.kind === 'pdf' && !looksLikePdf(input.bytes)) throw new RepositoryError('invalid-file', 'Not a PDF');
  const attachment: Attachment = {
    ...freshVersion(),
    kind: input.kind,
    name: cleanName(input.name, input.kind === 'pdf' ? 'Document' : 'Recording'),
    mimeType: input.mimeType,
    size,
    durationMs: input.durationMs ?? null,
    pageCount: input.pageCount ?? null,
  };
  await db.transaction('rw', db.attachments, db.attachmentData, async () => {
    await db.attachments.add(attachment);
    await db.attachmentData.add({ id: attachment.id, bytes: input.bytes });
  });
  return attachment;
}

export const getAttachment = (id: Id) => db.attachments.get(id);

/** All files, newest first. Bytes are not loaded. */
export async function listAttachments(): Promise<Attachment[]> {
  return (await db.attachments.toArray()).sort((a, b) => b.createdAt - a.createdAt);
}

/** The file's bytes. Throws when the file is gone. */
export async function readAttachmentBytes(id: Id): Promise<ArrayBuffer> {
  return found(await db.attachmentData.get(id), 'File').bytes;
}

export async function renameAttachment(id: Id, name: string): Promise<void> {
  await db.transaction('rw', db.attachments, async () => {
    const current = found(await db.attachments.get(id), 'File');
    await db.attachments.update(id, bump(current, { name: cleanName(name, current.name) }));
  });
}

/** Facts learned after the file was stored, such as a PDF's page count. Not an edit: no revision. */
export async function noteAttachmentFacts(id: Id, facts: Partial<Pick<Attachment, 'pageCount' | 'durationMs'>>): Promise<void> {
  await db.attachments.update(id, facts);
}

/** Where a file is used: the pages whose document names it, live and in the Trash. */
export interface FileUse {
  live: Page[];
  trashed: Page[];
}

export function fileUses(pages: Page[]): Map<Id, FileUse> {
  const uses = new Map<Id, FileUse>();
  for (const page of pages) {
    for (const id of attachmentIdsIn(page.content)) {
      let use = uses.get(id);
      if (!use) uses.set(id, (use = { live: [], trashed: [] }));
      (page.deletedAt === null ? use.live : use.trashed).push(page);
    }
  }
  return uses;
}

/** Where every file is used, read from all pages, including those in the Trash. */
export async function listFileUses(): Promise<Map<Id, FileUse>> {
  return fileUses(await db.pages.toArray());
}

async function deleteAttachmentRows(ids: Id[]): Promise<void> {
  if (ids.length === 0) return;
  await db.attachments.bulkDelete(ids);
  await db.attachmentData.bulkDelete(ids);
  await db.annotations.where('attachmentId').anyOf(ids).delete();
  await db.pdfTexts.bulkDelete(ids);
}

/**
 * Permanently delete a file, its bytes and its highlights. Refused while any
 * page, in the Trash or not, still has a block for it.
 */
export async function deleteAttachment(id: Id): Promise<void> {
  await db.transaction('rw', [db.pages, db.attachments, db.attachmentData, db.annotations, db.pdfTexts], async () => {
    found(await db.attachments.get(id), 'File');
    const pages = await db.pages.toArray();
    if (pages.some((page) => attachmentIdsIn(page.content).has(id))) throw new RepositoryError('file-in-use', 'File is used by a page');
    await deleteAttachmentRows([id]);
  });
}

/**
 * Part of a permanent page deletion: the files those pages used that no other
 * page uses go with them. Must run inside a transaction that includes pages,
 * attachments, attachmentData, annotations and pdfTexts, before the pages are deleted.
 */
export async function deleteAttachmentsOnlyIn(pageIds: Id[]): Promise<number> {
  if (pageIds.length === 0) return 0;
  const leaving = new Set(pageIds);
  const pages = await db.pages.toArray();
  const candidates = new Set<Id>();
  const kept = new Set<Id>();
  for (const page of pages) attachmentIdsIn(page.content, leaving.has(page.id) ? candidates : kept);
  const ids = [...candidates].filter((id) => !kept.has(id));
  await deleteAttachmentRows(ids);
  return ids.length;
}

/* Highlights in PDFs. */

export async function listAnnotations(attachmentId: Id): Promise<Annotation[]> {
  const items = await db.annotations.where('attachmentId').equals(attachmentId).toArray();
  return items.sort((a, b) => a.page - b.page || (a.rects[1] ?? 0) - (b.rects[1] ?? 0) || a.createdAt - b.createdAt);
}

export interface NewAnnotation {
  attachmentId: Id;
  page: number;
  colour: HighlightColour;
  rects: number[];
  quote: string;
  note?: string;
}

export const MAX_NOTE_LENGTH = 10_000;
export const MAX_QUOTE_LENGTH = 10_000;

export async function addAnnotation(input: NewAnnotation): Promise<Annotation> {
  if (input.rects.length === 0 || input.rects.length % 4 !== 0) throw new RepositoryError('invalid-file', 'Highlight without area');
  const annotation: Annotation = {
    ...freshVersion(),
    attachmentId: input.attachmentId,
    page: input.page,
    colour: input.colour,
    rects: input.rects.map((value) => Math.min(1, Math.max(0, value))),
    quote: input.quote.slice(0, MAX_QUOTE_LENGTH),
    note: (input.note ?? '').slice(0, MAX_NOTE_LENGTH),
  };
  await db.transaction('rw', db.attachments, db.annotations, async () => {
    found(await db.attachments.get(input.attachmentId), 'File');
    await db.annotations.add(annotation);
  });
  return annotation;
}

export async function updateAnnotation(id: Id, patch: Partial<Pick<Annotation, 'colour' | 'note'>>): Promise<void> {
  await db.transaction('rw', db.annotations, async () => {
    const current = found(await db.annotations.get(id), 'Highlight');
    const clean = { ...patch };
    if (clean.note !== undefined) clean.note = clean.note.slice(0, MAX_NOTE_LENGTH);
    await db.annotations.update(id, bump(current, clean));
  });
}

/** Deletes a highlight and returns it, so the interface can offer Undo. */
export async function deleteAnnotation(id: Id): Promise<Annotation> {
  return db.transaction('rw', db.annotations, async () => {
    const current = found(await db.annotations.get(id), 'Highlight');
    await db.annotations.delete(id);
    return current;
  });
}

/** Undo for deleteAnnotation: puts the highlight back as it was, if its file still exists. */
export async function restoreAnnotation(annotation: Annotation): Promise<void> {
  await db.transaction('rw', db.attachments, db.annotations, async () => {
    found(await db.attachments.get(annotation.attachmentId), 'File');
    await db.annotations.put(annotation);
  });
}
