import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { useToast } from '@/components/ui/Toast';
import { createPage } from '@/database/repositories/pages';
import { restoreBatch, trashItem } from '@/database/repositories/trash';
import { t } from '@/i18n/en';
import type { ItemRef, PageLocation } from '@/types/models';
import { describeError } from '@/utils/errors';

/** Run a data operation and report a failure to the user instead of dropping it. */
export function useGuarded() {
  const toast = useToast();
  return useCallback(
    async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await work();
      } catch (error) {
        toast({ tone: 'error', message: describeError(error) });
        return undefined;
      }
    },
    [toast],
  );
}

/** Workspace actions shared by several screens. */
export function useItemActions() {
  const toast = useToast();
  const guarded = useGuarded();
  const navigate = useNavigate();

  /** Move to Trash, with Undo. Deletion is reversible, so there is no confirm dialog. */
  const trash = useCallback(
    (ref: ItemRef, name: string) =>
      guarded(async () => {
        const { batchId, count } = await trashItem(ref);
        toast({
          message: t.trash.moved(name, count),
          action: { label: t.common.undo, run: () => void guarded(() => restoreBatch(batchId)) },
        });
      }),
    [guarded, toast],
  );

  const newPage = useCallback(
    (location: Partial<PageLocation> = {}) =>
      guarded(async () => {
        const page = await createPage(location);
        navigate(`/page/${page.id}`);
      }),
    [guarded, navigate],
  );

  return { trash, newPage, guarded };
}
