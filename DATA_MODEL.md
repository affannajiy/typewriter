# Data Model

Source: [`src/types/models.ts`](src/types/models.ts) and [`src/database/db.ts`](src/database/db.ts).
Database name: `typenote`. Schema version: **4**. Backup format version: **2**.

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
| `cover` | `{ kind, colour: '#rrggbb' }` | `kind` is the finish: `solid` (plain cloth), `linen`, `stripes`, `dots` or `grid`. The pattern is drawn by the interface over the colour |
| `icon` | icon name or null | Since schema version 3. One of `book`, `feather`, `flask`, `calculator`, `globe`, `music`, `palette`, `leaf`, `heart`, `star`, `code`, `compass`. A name, never an image or markup |
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
| `layout` | `'continuous'` or `'paginated'` | Chosen under the page. Changing it is an edit (`rev` + 1) |
| `tagIds` | id[] | |
| `favourite`, `pinned` | boolean | |
| `order` | number | |
| `lastOpenedAt` | number or null | Updated on open without changing `updatedAt` or `rev` |

#### The document (`content`)

Node types: `doc`, `paragraph`, `heading` (`level` 1 to 3), `bulletList`, `orderedList`, `listItem`,
`taskList`, `taskItem` (`checked`), `blockquote`, `codeBlock`, `horizontalRule`, `drawing` (`drawingId`),
`pdf` (`attachmentId`), `audio` (`attachmentId`), `hardBreak`, `text`.
Marks: `bold`, `italic`, `underline`, `strike`, `code`. The list is defined once, in
`schemaExtensions()` in [`src/features/editor/extensions.ts`](src/features/editor/extensions.ts).

Every block node (all of the above except `doc`, `hardBreak` and `text`) has an `id` attribute:
a UUID that stays with the block through edits, moves, type changes and reloads. A split block keeps
its ID on the first half; a copy gets a new one. Page breaks of the paginated layout are **not** in
the document.

Pages written before 0.3.0 hold one `paragraph` per line with no IDs. They load as they are. IDs are
added in the editor and stored with the next real edit, so opening an old page does not change it.
A document with a node or mark type outside the list above is shown read-only and is never rewritten.

A `drawing` block holds only `drawingId`, the ID of a row in `drawings`. It adds no text to
`plainText`. Two blocks never share a drawing: a duplicated or pasted block gets a new ID and a copy
of the strokes.

### `drawings` — index: `id, pageId` (schema version 2)

| Field | Type | Note |
| --- | --- | --- |
| `id`, `createdAt`, `updatedAt`, `rev` | | As above. No `deletedAt`: a drawing follows its page |
| `pageId` | id | The page whose document holds the block. Permanently deleting the page deletes its drawings |
| `width` | number | Canvas width in canvas units. Always 1000 today |
| `height` | number, 200–8000 | Grows with "Add space below" |
| `strokes` | Stroke[] | In drawing order. Highlighters are painted under pen strokes |

A **Stroke** is `{ id, tool, colour, size, pen, points }`: `tool` is `pen` or `highlighter`;
`colour` is an ink name (`ink`, `red`, `blue`, `green`, `yellow`), shown through the theme's
`--tn-ink-*` token; `size` is the base width in canvas units; `pen` is true when a stylus reported
real pressure; `points` is a flat list of `x, y, pressure` triples (pressure 0 to 1).

A row is created by the drawing's first save, so an empty drawing block leaves no row. Deleting a
drawing block from the page does not delete the row, so undo can bring it back.

A `pdf` or `audio` block holds only `attachmentId`, the ID of a row in `attachments`, or null while
the block is new and has no file. It adds no text. Unlike drawings, two blocks may name the same file:
a file's bytes never change, so a copy needs no copy.

### `attachments` — index: `id, kind` (schema version 4)

| Field | Type | Note |
| --- | --- | --- |
| `id`, `createdAt`, `updatedAt`, `rev` | | As above. No `deletedAt`: a file follows the pages that use it |
| `kind` | `pdf` or `audio` | |
| `name` | string, 1–200 | From the chosen file's name without its extension, or "Recording" and the date. Renaming is an edit |
| `mimeType` | string | `application/pdf` for a PDF; `audio/…` for a recording, for example `audio/webm;codecs=opus` |
| `size` | integer, 1 B to 100 MB | Bytes in `attachmentData` |
| `durationMs` | integer or null | Recordings: measured while recording; sound files: as the browser reports it |
| `pageCount` | integer or null | PDFs: from PDF.js when the file is added, corrected when it is opened |

### `attachmentData` — index: `id` (schema version 4)

`{ id, bytes: ArrayBuffer }`. Same ID as the attachment. Written once, in the same transaction as the
attachment, and never changed. Kept apart so that listing files does not load them.

### `annotations` — index: `id, attachmentId` (schema version 4)

| Field | Type | Note |
| --- | --- | --- |
| `id`, `createdAt`, `updatedAt`, `rev` | | As above |
| `attachmentId` | id | The PDF. Deleted with it |
| `page` | integer ≥ 1 | PDF page number |
| `colour` | `yellow`, `green`, `blue` or `red` | Shown through the theme's ink tokens |
| `rects` | number[] | `x, y, width, height` quadruples, each 0 to 1 of the page, one per line of text |
| `quote` | string, up to 10,000 | The highlighted text, spaces tidied |
| `note` | string, up to 10,000 | Empty when there is none |

### Lifetime of files

A file is deleted only in two ways: from Files, by the user, after a confirmation and only when no
page (in the Trash or not) has a block for it; or when the last page that used it is deleted
permanently (purging a Trash batch, or emptying the Trash). Its bytes and highlights go with it.
Removing a block keeps the file, so the editor's undo can bring the block back; such a file is listed
in Files as "Not in any page".

### `writingDays` — index: `date` (schema version 3)

| Field | Type | Note |
| --- | --- | --- |
| `date` | `YYYY-MM-DD` | The key. The local calendar day on this device |
| `words` | integer ≥ 0 | Words written that day |
| `updatedAt` | number | |

A page save that makes the page's text longer adds the difference in words, in the same
transaction as the page write; a save that makes it shorter adds nothing. So the count is "words
added", not a net change: retyping deleted text counts again, and undoing a deletion counts. The
title is not counted. Nothing else writes this table except a restore.

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
page ─< drawing             (pageId; the page's document names it by drawingId)
page >─< attachment         (the page's document names it by attachmentId; no field on the file)
attachment ─ attachmentData (same id)
attachment ─< annotation    (attachmentId)
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
  "data": { "folders": [], "notebooks": [], "pages": [], "tags": [], "settings": [], "drawings": [], "writingDays": [],
            "attachments": [], "attachmentData": [{ "id": "…", "data": "<base64>" }], "annotations": [] }
}
```

Includes trashed items. `attachments`, `attachmentData` and `annotations` are missing from files made
before format 2 (schema version 4) and are read as empty. Every file must have its bytes and the
reverse; the decoded size must equal `size`; a PDF's bytes must start like a PDF; the media type must
fit the kind; a highlight must name a file in the backup and have rectangles inside the page. A file's
bytes are never replaced by a merge: "take newer" updates only its name. A backup that would be larger
than the restore limit (400 MB) is refused when it is made. `drawings` is missing from files made before schema version 2, and
`writingDays` and notebook `icon` before version 3; they are read as empty and as no icon. A day
must be a real `YYYY-MM-DD` key with a whole, non-negative word count, once per file. A cover
finish or icon outside the lists above rejects the file. Each stroke is checked: known tool and ink, numbers only, whole triples, at most 50,000
points per stroke and 20,000 strokes per drawing. Limit: 400 MB. A file with a higher `formatVersion` or `schemaVersion` than
the app knows is refused with a message to update.

| Restore mode | Existing ID | New ID | Settings |
| --- | --- | --- | --- |
| Add what is missing | kept | added | only missing keys added |
| …and take newer | replaced if backup `updatedAt` is later | added | only missing keys added |
| Replace everything | whole workspace replaced, after a safety snapshot | — | replaced |

Words-written days follow the same rule as content, keyed by date, but are not counted in the
restore report: they are history, not items.

## Migrations

| Version | Released in | Change | Upgrade step |
| --- | --- | --- | --- |
| 1 | first release | First schema | — |
| 2 | 0.4.0 | New table `drawings: 'id, pageId'` | Nothing to convert: no existing row changes. Tested by opening a version 1 database (`drawings.test.ts`) |
| 3 | 0.5.0 | New table `writingDays: 'date'`; notebooks gain `icon` | Every notebook without `icon` gets `icon: null`. Tested by opening a version 2 database with a notebook and a drawing (`writing.test.ts`) |
| 4 | 0.6.0 | New tables `attachments: 'id, kind'`, `attachmentData: 'id'`, `annotations: 'id, attachmentId'` | Nothing to convert. Tested by opening a version 3 database with a page and a words-written day (`attachments.test.ts`) |

Never edit a released `this.version(n)` block. Add `this.version(n + 1).stores({...}).upgrade(tx => ...)`,
bump `SCHEMA_VERSION`, add a migration test with data in the old shape, and extend
`parseBackup()` to upgrade older backup files.

## Planned entities

Deck, Flashcard, Review Log, Link, Page Snapshot. Each arrives with its milestone, as a new schema version.
