import { BookOpen, FileText, Folder as FolderIcon, Pin, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { Workspace } from '@/hooks/useData';
import { t } from '@/i18n/en';
import type { Folder, Id, Notebook, Page, Tag } from '@/types/models';
import { formatRelative } from '@/utils/dates';
import { NotebookCover } from './covers';
import { ItemMenu } from './ItemMenu';

export const pagePath = (id: Id) => `/page/${id}`;
export const notebookPath = (id: Id) => `/notebook/${id}`;
export const folderPath = (id: Id | null) => (id ? `/library/folder/${id}` : '/library');

export { NOTEBOOK_ICON_GLYPHS, NotebookCover } from './covers';

export function TagChip({ tag, to }: { tag: Tag; to?: string }) {
  const body = (
    <>
      <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: tag.colour }} />
      {tag.name}
    </>
  );
  const className = 'inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs text-ink';
  return to ? (
    <Link to={to} className={`${className} hover:bg-accent-soft`}>
      {body}
    </Link>
  ) : (
    <span className={className}>{body}</span>
  );
}

/** Small marks for favourite and pinned. Each has a text alternative. */
function Flags({ favourite, pinned }: { favourite?: boolean; pinned?: boolean }) {
  return (
    <>
      {favourite && (
        <span title={t.organise.isFavourite} className="shrink-0 text-accent">
          <Star size={14} aria-hidden fill="currentColor" />
          <span className="sr-only">{t.organise.isFavourite}</span>
        </span>
      )}
      {pinned && (
        <span title={t.organise.isPinned} className="shrink-0 text-accent">
          <Pin size={14} aria-hidden fill="currentColor" />
          <span className="sr-only">{t.organise.isPinned}</span>
        </span>
      )}
    </>
  );
}

function Row({ to, icon, title, meta, flags, menu }: { to: string; icon: ReactNode; title: string; meta: string; flags?: ReactNode; menu?: ReactNode }) {
  return (
    // min-w-0: inside a grid, a row must be allowed to be narrower than its longest name.
    <li className="flex min-w-0 items-center gap-1 rounded-lg border border-line bg-surface ps-3 pe-1 hover:border-line-strong">
      <Link to={to} className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded py-2">
        {icon}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium text-ink">{title}</span>
            {flags}
          </span>
          <span className="block truncate text-xs text-muted">{meta}</span>
        </span>
      </Link>
      {menu}
    </li>
  );
}

interface RowProps {
  workspace: Workspace;
  position?: { index: number; count: number };
}

export function FolderRow({ folder, workspace, position }: RowProps & { folder: Folder }) {
  const count =
    workspace.folders.filter((f) => f.parentId === folder.id).length +
    workspace.notebooks.filter((n) => n.folderId === folder.id).length +
    workspace.pages.filter((p) => p.folderId === folder.id).length;
  return (
    <Row
      to={folderPath(folder.id)}
      icon={<FolderIcon size={20} aria-hidden className="shrink-0 text-muted" />}
      title={folder.name}
      meta={t.library.itemCount(count)}
      menu={<ItemMenu entry={{ kind: 'folder', item: folder }} workspace={workspace} position={position} />}
    />
  );
}

export function NotebookRow({ notebook, workspace, position }: RowProps & { notebook: Notebook }) {
  const count = workspace.pages.filter((p) => p.notebookId === notebook.id).length;
  return (
    <Row
      to={notebookPath(notebook.id)}
      icon={<NotebookCover notebook={notebook} size="thumb" />}
      title={notebook.name}
      meta={`${t.library.pageCount(count)} · ${t.library.edited(formatRelative(notebook.updatedAt))}`}
      flags={<Flags favourite={notebook.favourite} />}
      menu={<ItemMenu entry={{ kind: 'notebook', item: notebook }} workspace={workspace} position={position} />}
    />
  );
}

export function PageRow({ page, workspace, position, showLocation = false }: RowProps & { page: Page; showLocation?: boolean }) {
  const location = showLocation ? pageLocationName(page, workspace) : null;
  const edited = t.library.edited(formatRelative(page.updatedAt));
  return (
    <Row
      to={pagePath(page.id)}
      icon={<FileText size={20} aria-hidden className="shrink-0 text-muted" />}
      title={page.title}
      meta={location ? `${location} · ${edited}` : edited}
      flags={<Flags favourite={page.favourite} pinned={page.pinned} />}
      menu={<ItemMenu entry={{ kind: 'page', item: page }} workspace={workspace} position={position} />}
    />
  );
}

/** A notebook as a bookshelf card. The menu sits outside the link, so both are reachable. */
export function NotebookCard({ notebook, workspace, position }: RowProps & { notebook: Notebook }) {
  const count = workspace.pages.filter((p) => p.notebookId === notebook.id).length;
  return (
    <li className="flex flex-col gap-2">
      <Link to={notebookPath(notebook.id)} className="block rounded-md transition-transform duration-(--tn-motion) hover:-translate-y-0.5">
        <NotebookCover notebook={notebook} />
      </Link>
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm">
            <BookOpen size={14} aria-hidden className="shrink-0 text-muted" />
            <span className="truncate text-muted">{t.library.pageCount(count)}</span>
            <Flags favourite={notebook.favourite} />
          </p>
        </div>
        <ItemMenu entry={{ kind: 'notebook', item: notebook }} workspace={workspace} position={position} />
      </div>
    </li>
  );
}

/** Where a page lives, in words. */
export function pageLocationName(page: Page, workspace: Workspace): string {
  if (page.notebookId) return workspace.notebooks.find((n) => n.id === page.notebookId)?.name ?? t.organise.topLevel;
  if (page.folderId) return workspace.folders.find((f) => f.id === page.folderId)?.name ?? t.organise.topLevel;
  return t.organise.topLevel;
}

/** The chain of folders from the top level down to the given folder. */
export function folderTrail(folderId: Id | null, folders: Folder[]): Folder[] {
  const trail: Folder[] = [];
  const seen = new Set<Id>();
  for (let cursor = folderId; cursor !== null && !seen.has(cursor); ) {
    seen.add(cursor);
    const folder = folders.find((f) => f.id === cursor);
    if (!folder) break;
    trail.unshift(folder);
    cursor = folder.parentId;
  }
  return trail;
}
