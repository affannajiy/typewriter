import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { type FileUse, getAttachment, listAnnotations, listAttachments, listFileUses, readAttachmentBytes } from '@/database/repositories/attachments';
import { getDrawing } from '@/database/repositories/drawings';
import { getDeck, listCards, listDecks, listReviewLogs } from '@/database/repositories/flashcards';
import { listFolders } from '@/database/repositories/folders';
import { listNotebooks } from '@/database/repositories/notebooks';
import { listPages } from '@/database/repositories/pages';
import { readSettings } from '@/database/repositories/settings';
import { listTags } from '@/database/repositories/tags';
import { listTrash } from '@/database/repositories/trash';
import { listWritingDays } from '@/database/repositories/writing';
import { type AppSettings, resolveSettings } from '@/features/settings/model';
import type { Annotation, Attachment, Deck, Drawing, Flashcard, Folder, Id, Notebook, Page, ReviewLog, Tag, WritingDay } from '@/types/models';

/**
 * Live views of the workspace. Components read data only through these hooks,
 * which call repositories; they re-render when the underlying tables change.
 *
 * The whole workspace index is loaded at once and filtered in memory. That is
 * fine for thousands of items; see ARCHITECTURE.md for the scaling note.
 */

export interface Workspace {
  folders: Folder[];
  notebooks: Notebook[];
  pages: Page[];
  tags: Tag[];
}

/** Undefined while the first read is in progress. */
export function useWorkspace(): Workspace | undefined {
  return useLiveQuery(async () => {
    const [folders, notebooks, pages, tags] = await Promise.all([listFolders(), listNotebooks(), listPages(), listTags()]);
    return { folders, notebooks, pages, tags };
  }, []);
}

export const useTrash = () => useLiveQuery(listTrash, []);

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

/** Every day with words written, oldest first. One small row per day. Undefined while loading. */
export function useWritingDays(): WritingDay[] | undefined {
  return useLiveQuery(() => listWritingDays(''), []);
}

/** Every deck, in order. Undefined while loading. */
export const useDecks = (): Deck[] | undefined => useLiveQuery(listDecks, []);

/** One deck. Undefined while loading; null when there is no such deck. */
export function useDeck(id: Id): Deck | null | undefined {
  return useLiveQuery(async () => (await getDeck(id)) ?? null, [id]);
}

/** Every card, or one deck's, oldest first. Undefined while loading. */
export function useCards(deckId?: Id): Flashcard[] | undefined {
  return useLiveQuery(() => listCards(deckId), [deckId]);
}

/** Answers given since `since` (usually the start of today). Undefined while loading. */
export function useReviewLogs(since: number): ReviewLog[] | undefined {
  return useLiveQuery(() => listReviewLogs(since), [since]);
}

export function useSettings(): AppSettings {
  const raw = useLiveQuery(readSettings, []);
  return useMemo(() => resolveSettings(raw ?? {}), [raw]);
}

/** True once settings have been read from the database at least once. */
export function useSettingsLoaded(): boolean {
  return useLiveQuery(async () => (await readSettings(), true), []) ?? false;
}
