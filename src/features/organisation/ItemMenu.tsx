import { ArrowDown, ArrowUp, FolderInput, Pencil, Pin, PinOff, Star, StarOff, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Menu, type MenuItem } from '@/components/ui/Menu';
import { setNotebookFavourite, updateNotebookDetails } from '@/database/repositories/notebooks';
import { moveSibling } from '@/database/repositories/ordering';
import { movePage, renamePage, setPageFlags } from '@/database/repositories/pages';
import type { Workspace } from '@/hooks/useData';
import { t } from '@/i18n/en';
import type { Notebook, Page, PageLocation } from '@/types/models';
import { MoveDialog, NameDialog, NotebookDialog } from './dialogs';
import { useItemActions } from './useItemActions';

export type Item = { kind: 'notebook'; item: Notebook } | { kind: 'page'; item: Page };

export const itemName = (entry: Item): string => (entry.kind === 'page' ? entry.item.title : entry.item.name);

interface ItemMenuProps {
  entry: Item;
  workspace: Workspace;
  /** Position among siblings, to disable "Move up" at the top and "Move down" at the bottom. */
  position?: { index: number; count: number };
  /** Called after the item is moved to the Trash, for example to leave its screen. */
  onTrashed?: () => void;
  /** Hide Rename where the name is edited in place, as on the page screen. */
  noRename?: boolean;
}

/** The actions menu shared by every notebook and page. */
export function ItemMenu({ entry, workspace, position, onTrashed, noRename }: ItemMenuProps) {
  const { trash, guarded } = useItemActions();
  const [dialog, setDialog] = useState<'rename' | 'move' | null>(null);
  const { kind, item } = entry;
  const name = itemName(entry);
  const ref = { kind, id: item.id };

  const items: MenuItem[] = [
    ...(noRename ? [] : [{ id: 'rename', label: kind === 'notebook' ? t.notebook.editDetails : t.organise.rename, icon: Pencil, onSelect: () => setDialog('rename') }]),
    // Notebooks all sit on the shelf; only a page has somewhere to move to.
    ...(kind === 'page' ? [{ id: 'move', label: t.organise.moveTo, icon: FolderInput, onSelect: () => setDialog('move') }] : []),
  ];
  if (position) {
    items.push(
      { id: 'up', label: t.organise.moveUp, icon: ArrowUp, disabled: position.index === 0, onSelect: () => void guarded(() => moveSibling(ref, 'up')) },
      { id: 'down', label: t.organise.moveDown, icon: ArrowDown, disabled: position.index === position.count - 1, onSelect: () => void guarded(() => moveSibling(ref, 'down')) },
    );
  }
  if (entry.kind === 'notebook') {
    const { id, favourite } = entry.item;
    items.push({ id: 'fav', label: favourite ? t.organise.unfavourite : t.organise.favourite, icon: favourite ? StarOff : Star, onSelect: () => void guarded(() => setNotebookFavourite(id, !favourite)) });
  }
  if (entry.kind === 'page') {
    const { id, favourite, pinned } = entry.item;
    items.push(
      { id: 'fav', label: favourite ? t.organise.unfavourite : t.organise.favourite, icon: favourite ? StarOff : Star, onSelect: () => void guarded(() => setPageFlags(id, { favourite: !favourite })) },
      { id: 'pin', label: pinned ? t.organise.unpin : t.organise.pin, icon: pinned ? PinOff : Pin, onSelect: () => void guarded(() => setPageFlags(id, { pinned: !pinned })) },
    );
  }
  items.push({
    id: 'trash',
    label: t.organise.moveToTrash,
    icon: Trash2,
    danger: true,
    onSelect: () => void trash(ref, name).then(onTrashed),
  });

  const move = (location: PageLocation) => void guarded(() => movePage(item.id, location));

  return (
    <>
      <Menu label={t.organise.actionsFor(name)} items={items} />
      {entry.kind === 'notebook' ? (
        <NotebookDialog open={dialog === 'rename'} onClose={() => setDialog(null)} notebook={entry.item} onSubmit={(details) => void guarded(() => updateNotebookDetails(item.id, details))} />
      ) : (
        <NameDialog
          open={dialog === 'rename'}
          onClose={() => setDialog(null)}
          title={t.organise.renameTitle(name)}
          label={t.organise.name}
          initial={name}
          submitLabel={t.organise.rename}
          onSubmit={(next) => void guarded(() => renamePage(item.id, next))}
        />
      )}
      {entry.kind === 'page' && <MoveDialog open={dialog === 'move'} onClose={() => setDialog(null)} workspace={workspace} itemName={name} current={{ notebookId: entry.item.notebookId }} onMove={move} />}
    </>
  );
}
