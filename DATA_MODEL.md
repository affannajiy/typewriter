# Data Model

Source: [`src/types/models.ts`](src/types/models.ts) and [`src/database/db.ts`](src/database/db.ts).
Database name: `typenote`. Schema version: **1**. Backup format version: **1**.

## Common fields

| Field | Type | On |
| --- | --- | --- |
| `id` | string (UUID v4) | every entity. Never reused, never changed by a move or rename. |
| `createdAt`, `updatedAt` | number, epoch ms | every entity |
| `rev` | number | every entity. Starts at 1, +1 on each edit. Ready for sync conflict detection. |
| `deletedAt` | number or null | folders, notebooks, pages. Null means live. |
| `trashBatchId` | string or null | folders, notebooks, pages. Shared by everything trashed in one action. |

## Tables

### `folders` — index: `id, parentId, trashBatchId`

| Field | Type | Note |
| --- | --- | --- |
| `name` | string, 1–200 | |
| `parentId` | id or null | Null is the top level. A folder can never be inside its own subtree. |
| `order` | number | Position among live siblings |

### `notebooks` — index: `id, folderId, *tagIds, trashBatchId`

| Field | Type | Note |
| --- | --- | --- |
| `name` | string, 1–200 | |
| `description` | string, 0–1000 | |
| `folderId` | id or null | |
| `cover` | `{ kind: 'solid', colour: '#rrggbb' }` | More kinds in Milestone 5 |
| `tagIds` | id[] | |
| `favourite` | boolean | |
| `order` | number | |

### `pages` — index: `id, notebookId, folderId, *tagIds, updatedAt, trashBatchId`

| Field | Type | Note |
| --- | --- | --- |
| `title` | string, 1–200 | Empty becomes "Untitled" |
| `notebookId`, `folderId` | id or null | The one canonical location. At most one is set; both null is the top level. |
| `content` | document node | Tiptap/ProseMirror JSON. Source of truth for the body. |
| `plainText` | string | Derived from `content` on every save |
| `layout` | `'continuous'` or `'paginated'` | Only stored for now |
| `tagIds` | id[] | |
| `favourite`, `pinned` | boolean | |
| `order` | number | |
| `lastOpenedAt` | number or null | Updated on open without changing `updatedAt` or `rev` |

Until the editor lands, the body is plain text stored as one `paragraph` node per line. That is
already a valid Tiptap document, so Milestone 3 needs no migration.

### `tags` — index: `id`

`name` (1–40, unique ignoring case, enforced by the repository), `colour` (`#rrggbb`).
Deleting a tag removes its ID from every notebook and page in the same transaction.

### `settings` — index: `key`

`{ key, value, updatedAt }`. Known keys and their validators are in
[`src/features/settings/model.ts`](src/features/settings/model.ts).

### `snapshots` — index: `id, createdAt`

`{ id, createdAt, payload }`. A serialised backup taken automatically before a "replace" restore.
The newest 3 are kept. Not included in backups.

## Relationships

```
folder ─┬─< folder          (parentId)
        ├─< notebook        (folderId)
        └─< page            (folderId)
notebook ─< page            (notebookId)
tag >─< notebook, page      (tagIds)
```

Moving an item changes only its parent field and `order`. IDs are stable, so future links,
backlinks and flashcard sources keep working after a move.

## Trash

`trashItem()` marks the item and all live descendants with one `trashBatchId`. An item that was
already in the Trash keeps its own batch. `restoreBatch()` clears the marks; if the root's old
parent is gone or trashed, the root returns to the top level and the user is told.

## Backup file

```json
{
  "app": "typenote",
  "formatVersion": 1,
  "schemaVersion": 1,
  "exportedAt": "2026-11-16T11:00:00.000Z",
  "data": { "folders": [], "notebooks": [], "pages": [], "tags": [], "settings": [] }
}
```

Includes trashed items. Limit: 200 MB. A file with a higher `formatVersion` or `schemaVersion` than
the app knows is refused with a message to update.

| Restore mode | Existing ID | New ID | Settings |
| --- | --- | --- | --- |
| Add what is missing | kept | added | only missing keys added |
| …and take newer | replaced if backup `updatedAt` is later | added | only missing keys added |
| Replace everything | whole workspace replaced, after a safety snapshot | — | replaced |

## Migrations

Never edit a released `this.version(n)` block. Add `this.version(n + 1).stores({...}).upgrade(tx => ...)`,
bump `SCHEMA_VERSION`, add a migration test with data in the old shape, and extend
`parseBackup()` to upgrade older backup files.

## Planned entities

Attachment, Drawing, PDF Annotation, Audio Recording, Deck, Flashcard, Review Log, Link,
Page Snapshot. Each arrives with its milestone, as a new schema version.
