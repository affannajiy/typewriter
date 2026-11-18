import { db } from '@/database/db';
import type { Id, PdfText } from '@/types/models';
import { now } from './common';

/** Text kept per PDF, at most. A longer text is cut: search finds words in the part kept. */
export const MAX_PDF_TEXT = 3_000_000;

export const listPdfTexts = (): Promise<PdfText[]> => db.pdfTexts.toArray();

/** PDFs whose text has not been read yet, oldest first. */
export async function pdfsWithoutText(): Promise<Id[]> {
  return db.transaction('r', db.attachments, db.pdfTexts, async () => {
    const done = new Set(await db.pdfTexts.toCollection().primaryKeys());
    const pdfs = await db.attachments.where('kind').equals('pdf').toArray();
    return pdfs.sort((a, b) => a.createdAt - b.createdAt).map((file) => file.id).filter((id) => !done.has(id));
  });
}

/** Store the text of a PDF. Ignored when the file was deleted meanwhile. */
export async function savePdfText(id: Id, pages: string[]): Promise<void> {
  let room = MAX_PDF_TEXT;
  const kept = pages.map((text) => {
    const part = text.slice(0, Math.max(0, room));
    room -= part.length;
    return part;
  });
  await db.transaction('rw', db.attachments, db.pdfTexts, async () => {
    if (!(await db.attachments.get(id))) return;
    await db.pdfTexts.put({ id, pages: kept, extractedAt: now() });
  });
}
