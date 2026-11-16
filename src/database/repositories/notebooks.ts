import { db } from '@/database/db';
import { COVER_KINDS, type CoverKind, type Id, NOTEBOOK_ICONS, type Notebook, type NotebookIcon } from '@/types/models';
import { isHexColour } from '@/utils/colour';
import { RepositoryError, bump, cleanName, found, freshVersion, isLive, notTrashed, orderAfter } from './common';

export const DEFAULT_COVER_COLOUR = '#795b43';
export const MAX_DESCRIPTION_LENGTH = 1000;

export interface NotebookDetails {
  name: string;
  description: string;
  coverColour: string;
  /** Plain cloth by default. */
  coverKind?: CoverKind;
  icon?: NotebookIcon | null;
}

export async function listNotebooks(): Promise<Notebook[]> {
  return (await db.notebooks.toArray()).filter(isLive);
}

export const getNotebook = (id: Id) => db.notebooks.get(id);

function checkColour(colour: string): string {
  if (!isHexColour(colour)) throw new RepositoryError('invalid-colour', 'Colour must be a 6-digit hex value');
  return colour.toLowerCase();
}

function checkCover(details: NotebookDetails) {
  const kind = details.coverKind ?? 'solid';
  if (!COVER_KINDS.includes(kind)) throw new RepositoryError('invalid-colour', 'Unknown cover finish');
  const icon = details.icon ?? null;
  if (icon !== null && !NOTEBOOK_ICONS.includes(icon)) throw new RepositoryError('invalid-colour', 'Unknown notebook icon');
  return { cover: { kind, colour: checkColour(details.coverColour) }, icon };
}

export async function createNotebook(input: NotebookDetails & { folderId: Id | null }): Promise<Notebook> {
  const { cover, icon } = checkCover(input);
  return db.transaction('rw', db.notebooks, async () => {
    const siblings = (await listNotebooks()).filter((n) => n.folderId === input.folderId);
    const notebook: Notebook = {
      ...freshVersion(),
      ...notTrashed,
      name: cleanName(input.name, 'Untitled notebook'),
      description: input.description.trim().slice(0, MAX_DESCRIPTION_LENGTH),
      folderId: input.folderId,
      cover,
      icon,
      tagIds: [],
      favourite: false,
      order: orderAfter(siblings),
    };
    await db.notebooks.add(notebook);
    return notebook;
  });
}

/** Changing the cover or details never touches the notebook's pages. */
export async function updateNotebookDetails(id: Id, details: NotebookDetails): Promise<void> {
  checkCover(details);
  await db.transaction('rw', db.notebooks, async () => {
    const notebook = found(await db.notebooks.get(id), 'Notebook');
    // A field the caller leaves out keeps its stored value.
    const { cover, icon } = checkCover({ coverKind: notebook.cover.kind, icon: notebook.icon ?? null, ...details });
    await db.notebooks.update(
      id,
      bump(notebook, {
        name: cleanName(details.name, notebook.name),
        description: details.description.trim().slice(0, MAX_DESCRIPTION_LENGTH),
        cover,
        icon,
      }),
    );
  });
}

export async function setNotebookFavourite(id: Id, favourite: boolean): Promise<void> {
  await db.transaction('rw', db.notebooks, async () => {
    const notebook = found(await db.notebooks.get(id), 'Notebook');
    await db.notebooks.update(id, bump(notebook, { favourite }));
  });
}

export async function setNotebookTags(id: Id, tagIds: Id[]): Promise<void> {
  await db.transaction('rw', db.notebooks, async () => {
    const notebook = found(await db.notebooks.get(id), 'Notebook');
    await db.notebooks.update(id, bump(notebook, { tagIds: [...new Set(tagIds)] }));
  });
}

export async function moveNotebook(id: Id, folderId: Id | null): Promise<void> {
  await db.transaction('rw', db.notebooks, db.folders, async () => {
    const notebook = found(await db.notebooks.get(id), 'Notebook');
    if (folderId !== null) {
      const folder = found(await db.folders.get(folderId), 'Destination folder');
      if (!isLive(folder)) throw new RepositoryError('invalid-move', 'The destination folder is in the Trash');
    }
    if (notebook.folderId === folderId) return;
    const siblings = (await listNotebooks()).filter((n) => n.folderId === folderId);
    await db.notebooks.update(id, bump(notebook, { folderId, order: orderAfter(siblings) }));
  });
}
