import { db } from '@/database/db';
import type { Folder, Id } from '@/types/models';
import { RepositoryError, bump, cleanName, found, freshVersion, isLive, notTrashed, orderAfter } from './common';

export async function listFolders(): Promise<Folder[]> {
  return (await db.folders.toArray()).filter(isLive);
}

export const getFolder = (id: Id) => db.folders.get(id);

export async function createFolder(input: { name: string; parentId: Id | null }): Promise<Folder> {
  return db.transaction('rw', db.folders, async () => {
    const siblings = (await listFolders()).filter((f) => f.parentId === input.parentId);
    const folder: Folder = {
      ...freshVersion(),
      ...notTrashed,
      name: cleanName(input.name, 'Untitled folder'),
      parentId: input.parentId,
      order: orderAfter(siblings),
    };
    await db.folders.add(folder);
    return folder;
  });
}

export async function renameFolder(id: Id, name: string): Promise<void> {
  await db.transaction('rw', db.folders, async () => {
    const folder = found(await db.folders.get(id), 'Folder');
    await db.folders.update(id, bump(folder, { name: cleanName(name, folder.name) }));
  });
}

/** IDs of the folder and every folder nested inside it. */
export function folderSubtreeIds(rootId: Id, folders: Pick<Folder, 'id' | 'parentId'>[]): Set<Id> {
  const ids = new Set<Id>([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parentId !== null && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Move a folder. A folder cannot move into itself or one of its own subfolders. */
export async function moveFolder(id: Id, parentId: Id | null): Promise<void> {
  await db.transaction('rw', db.folders, async () => {
    const folders = await listFolders();
    const folder = found(
      folders.find((f) => f.id === id),
      'Folder',
    );
    if (parentId !== null) {
      found(
        folders.find((f) => f.id === parentId),
        'Destination folder',
      );
      if (folderSubtreeIds(id, folders).has(parentId)) {
        throw new RepositoryError('invalid-move', 'A folder cannot be moved into itself');
      }
    }
    if (folder.parentId === parentId) return;
    const siblings = folders.filter((f) => f.parentId === parentId);
    await db.folders.update(id, bump(folder, { parentId, order: orderAfter(siblings) }));
  });
}
