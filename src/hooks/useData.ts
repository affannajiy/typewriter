import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { type FileUse, fileUses, getAttachment, listAnnotations, listAttachments, listFileUses, readAttachmentBytes } from '@/database/repositories/attachments';
import { getDrawing } from '@/database/repositories/drawings';
import { listNotebooks } from '@/database/repositories/notebooks';
import { listPages } from '@/database/repositories/pages';
import { listPdfTexts } from '@/database/repositories/pdfTexts';
import { readSettings } from '@/database/repositories/settings';
import { listTrash } from '@/database/repositories/trash';
import { type AppSettings, resolveSettings } from '@/features/settings/model';
import type { SearchSource } from '@/features/search/search';
import type { Annotation, Attachment, Drawing, Id, Notebook, Page } from '@/types/models';

/**
 * Live views of the workspace. Components read data only through these hooks,
 * which call repositories; they re-render when the underlying tables change.
 *
 * The whole workspace index is loaded at once and filtered in memory. That is
 * fine for thousands of items; see ARCHITECTURE.md for the scaling note.
 */

export interface Workspace {
  notebooks: Notebook[];
  pages: Page[];
}

/** Undefined while the first read is in progress. */
export function useWorkspace(): Workspace | undefined {
  return useLiveQuery(async () => {
    const [notebooks, pages] = await Promise.all([listNotebooks(), listPages()]);
    return { notebooks, pages };
  }, []);
}

export const useTrash = () => useLiveQuery(listTrash, []);

/**
 * What search looks through: the workspace, and the text of PDFs with the
 * live pages that show them. Undefined while the first read is in progress.
 */
export function useSearchSource(): SearchSource | undefined {
  return useLiveQuery(async () => {
    const [notebooks, pages, files, texts] = await Promise.all([listNotebooks(), listPages(), listAttachments(), listPdfTexts()]);
    const uses = new Map([...fileUses(pages)].map(([id, use]) => [id, use.live]));
    return {
      notebooks,
      pages,
      pdfTexts: new Map(texts.map((entry) => [entry.id, entry.pages])),
      fileNames: new Map(files.map((file) => [file.id, file.name])),
      fileUses: uses,
    };
  }, []);
}

/** A drawing's stored strokes. Undefined while loading; null when the drawing has never been saved. */
export function useDrawing(id: Id | null): Drawing | null | undefined {
  return useLiveQuery(async () => (id ? ((await getDrawing(id)) ?? null) : null), [id]);
}

/** Every file, newest first, without its bytes. Undefined while loading. */
export const useAttachments = (): Attachment[] | undefined => useLiveQuery(listAttachments, []);

/** Which pages use each file, live and in the Trash. Undefined while loading. */
export const useFileUses = (): Map<Id, FileUse> | undefined => useLiveQuery(listFileUses, []);

/** One file's details. Undefined while loading; null when there is no such file. */
export function useAttachment(id: Id | null): Attachment | null | undefined {
  return useLiveQuery(async () => (id ? ((await getAttachment(id)) ?? null) : null), [id]);
}

/**
 * One file's bytes, read once per ID: they never change. Undefined while
 * loading; null when the file is gone or could not be read.
 */
export function useAttachmentBytes(id: Id | null): ArrayBuffer | null | undefined {
  return useLiveQuery(async () => {
    if (!id) return null;
    try {
      return await readAttachmentBytes(id);
    } catch {
      return null;
    }
  }, [id]);
}

/** A PDF's highlights in reading order. Undefined while loading. */
export function useAnnotations(attachmentId: Id): Annotation[] | undefined {
  return useLiveQuery(() => listAnnotations(attachmentId), [attachmentId]);
}

export function useSettings(): AppSettings {
  const raw = useLiveQuery(readSettings, []);
  return useMemo(() => resolveSettings(raw ?? {}), [raw]);
}

/** True once settings have been read from the database at least once. */
export function useSettingsLoaded(): boolean {
  return useLiveQuery(async () => (await readSettings(), true), []) ?? false;
}
