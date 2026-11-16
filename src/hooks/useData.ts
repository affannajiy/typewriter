import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { getDrawing } from '@/database/repositories/drawings';
import { listFolders } from '@/database/repositories/folders';
import { listNotebooks } from '@/database/repositories/notebooks';
import { listPages } from '@/database/repositories/pages';
import { readSettings } from '@/database/repositories/settings';
import { listTags } from '@/database/repositories/tags';
import { listTrash } from '@/database/repositories/trash';
import { listWritingDays } from '@/database/repositories/writing';
import { type AppSettings, resolveSettings } from '@/features/settings/model';
import type { Drawing, Folder, Id, Notebook, Page, Tag, WritingDay } from '@/types/models';

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

/** Every day with words written, oldest first. One small row per day. Undefined while loading. */
export function useWritingDays(): WritingDay[] | undefined {
  return useLiveQuery(() => listWritingDays(''), []);
}

export function useSettings(): AppSettings {
  const raw = useLiveQuery(readSettings, []);
  return useMemo(() => resolveSettings(raw ?? {}), [raw]);
}

/** True once settings have been read from the database at least once. */
export function useSettingsLoaded(): boolean {
  return useLiveQuery(async () => (await readSettings(), true), []) ?? false;
}
