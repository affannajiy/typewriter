import { db } from '@/database/db';
import type { Id, Tag } from '@/types/models';
import { isHexColour } from '@/utils/colour';
import { RepositoryError, bump, cleanName, found, freshVersion } from './common';

export const TAG_COLOURS = ['#795b43', '#b08a50', '#3f5a3c', '#4a6a8a', '#8a5567', '#6b5b95', '#a14a3b', '#56565a'] as const;
export const MAX_TAG_LENGTH = 40;

const normalise = (name: string) => name.trim().toLowerCase();

export async function listTags(): Promise<Tag[]> {
  const tags = await db.tags.toArray();
  return tags.sort((a, b) => a.name.localeCompare(b.name));
}

/** Create a tag. A name that already exists (ignoring case) returns the existing tag. */
export async function createTag(name: string, colour: string = TAG_COLOURS[0]): Promise<Tag> {
  if (!isHexColour(colour)) throw new RepositoryError('invalid-colour', 'Colour must be a 6-digit hex value');
  return db.transaction('rw', db.tags, async () => {
    const clean = cleanName(name, 'tag').slice(0, MAX_TAG_LENGTH);
    const existing = (await db.tags.toArray()).find((t) => normalise(t.name) === normalise(clean));
    if (existing) return existing;
    const tag: Tag = { ...freshVersion(), name: clean, colour: colour.toLowerCase() };
    await db.tags.add(tag);
    return tag;
  });
}

export async function updateTag(id: Id, patch: { name?: string; colour?: string }): Promise<void> {
  if (patch.colour !== undefined && !isHexColour(patch.colour)) {
    throw new RepositoryError('invalid-colour', 'Colour must be a 6-digit hex value');
  }
  await db.transaction('rw', db.tags, async () => {
    const tag = found(await db.tags.get(id), 'Tag');
    const name = patch.name === undefined ? tag.name : cleanName(patch.name, tag.name).slice(0, MAX_TAG_LENGTH);
    await db.tags.update(id, bump(tag, { name, colour: patch.colour?.toLowerCase() ?? tag.colour }));
  });
}

/** Delete a tag and remove it from every notebook and page. The items themselves stay. */
export async function deleteTag(id: Id): Promise<void> {
  await db.transaction('rw', db.tags, db.notebooks, db.pages, async () => {
    const strip = <T extends { tagIds: Id[] }>(item: T) => {
      item.tagIds = item.tagIds.filter((t) => t !== id);
    };
    await db.notebooks.where('tagIds').equals(id).modify(strip);
    await db.pages.where('tagIds').equals(id).modify(strip);
    await db.tags.delete(id);
  });
}
