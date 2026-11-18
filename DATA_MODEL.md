# Data Model

Source: [`src/types/models.ts`](src/types/models.ts) and [`src/database/db.ts`](src/database/db.ts).
Database name: `typenote`. Schema version: **6**. Backup format version: **3**.

0.8.0 removed folders, tags, flashcards (decks, cards, review logs), the words-written log and page links. Their tables are gone (Migrations, version 6).

## Common fields

| Field | Type | On |
| --- | --- | --- |
| `id` | string (UUID v4) | All entities. Never used again, never changed by a move or rename. |
| `createdAt`, `updatedAt` | number, epoch ms | All entities |
| `rev` | number | All entities. Starts at 1, +1 on each edit. For future sync conflict detection. |
| `deletedAt` | number or null | Notebooks, pages. Null means live. |
| `trashBatchId` | string or null | Notebooks, pages. All items trashed in one action share it. |

## Tables

### `notebooks` — index: `id, trashBatchId`

| Field | Type | Note |
| --- | --- | --- |
| `name` | string, 1–200 | |
| `description` | string, 0–1000 | |
| `cover` | `{ kind, colour: '#rrggbb' }` | `kind` is the finish: `solid` (plain cloth), `linen`, `stripes`, `dots` or `grid`. The interface draws the pattern over the color. |
| `icon` | icon name or null | Since schema version 3. One of `book`, `feather`, `flask`, `calculator`, `globe`, `music`, `palette`, `leaf`, `heart`, `star`, `code`, `compass`. A name, never an image or markup. |
| `favourite` | boolean | |
| `order` | number | Position on the shelf |

### `pages` — index: `id, notebookId, updatedAt, trashBatchId`

| Field | Type | Note |
| --- | --- | --- |
| `title` | string, 1–200 | Empty becomes "Untitled" |
| `notebookId` | id or null | The notebook of the page. Null: a loose page, shown below the shelf. |
| `content` | document node | Tiptap/ProseMirror JSON. Source of truth for the body. |
| `plainText` | string | Derived from `content` on each save |
| `layout` | `'continuous'` or `'paginated'` | Chosen below the page. A change is an edit (`rev` + 1). |
| `favourite`, `pinned` | boolean | |
| `order` | number | |
| `lastOpenedAt` | number or null | Set on open. Does not change `updatedAt` or `rev`. |

#### The document (`content`)

- **Node types:** `doc`, `paragraph`, `heading` (`level` 1 to 3), `bulletList`, `orderedList`, `listItem`, `taskList`, `taskItem` (`checked`), `blockquote`, `codeBlock`, `horizontalRule`, `drawing` (`drawingId`), `pdf` (`attachmentId`), `audio` (`attachmentId`), `mathBlock` (`latex`), `mathInline` (`latex`), `hardBreak`, `text`.
- **Marks:** `bold`, `italic`, `underline`, `strike`, `code`.
- The list has one definition: `schemaExtensions()` in [`src/features/editor/extensions.ts`](src/features/editor/extensions.ts).
- Until 0.8.0 there was also an inline `pageLink` node. The upgrade turns each one into the text of its title.

Each block node has an `id` attribute. (Not block nodes: `doc`, `text`, and the inline nodes `mathInline` and `hardBreak`.) The ID is a UUID that stays with the block through edits, moves, type changes and reloads. A split block keeps its ID on the first half. A copy gets a new ID. Page breaks of the paginated layout are **not** in the document.

Pages written before 0.3.0 hold one `paragraph` per line, with no IDs. They load as they are. The editor adds IDs, and the next real edit stores them, so opening an old page does not change it. A document with a node or mark type that is not in the list shows read-only and is never written again.

- A `drawing` block holds only `drawingId`, the ID of a row in `drawings`. It adds no text to `plainText`. Two blocks never share a drawing: a duplicated or pasted block gets a new ID and a copy of the strokes.
- A `pdf` or `audio` block holds only `attachmentId`, the ID of a row in `attachments`, or null while the block is new and has no file. It adds no text. Two blocks can name the same file: the bytes of a file never change, so a copy needs no new file.
- An equation (`mathBlock`, `mathInline`, since 0.7.0) holds only its LaTeX source, at most 2,000 characters. KaTeX draws it on display. In `plainText`, an equation adds its source.

### `drawings` — index: `id, pageId` (schema version 2)

| Field | Type | Note |
| --- | --- | --- |
| `id`, `createdAt`, `updatedAt`, `rev` | | As above. No `deletedAt`: a drawing follows its page. |
| `pageId` | id | The page whose document holds the block. A permanent delete of the page deletes its drawings. |
| `width` | number | Canvas width in canvas units. Always 1000 now. |
| `height` | number, 200–8000 | Grows with "Add space below" |
| `strokes` | Stroke[] | In drawing order. Highlighters paint under pen strokes. |

A **Stroke** is `{ id, tool, colour, size, pen, points }`:

- `tool`: `pen` or `highlighter`.
- `colour`: an ink name (`ink`, `red`, `blue`, `green`, `yellow`), shown through the `--tn-ink-*` token of the theme.
- `size`: the base width in canvas units.
- `pen`: true when a stylus gave real pressure.
- `points`: a flat list of `x, y, pressure` triples (pressure 0 to 1).

The first save of a drawing makes its row, so an empty drawing block has no row. When the user deletes a drawing block from the page, the row stays, so undo can bring it back.

### `attachments` — index: `id, kind` (schema version 4)

| Field | Type | Note |
| --- | --- | --- |
| `id`, `createdAt`, `updatedAt`, `rev` | | As above. No `deletedAt`: a file follows the pages that use it. |
| `kind` | `pdf` or `audio` | |
| `name` | string, 1–200 | The name of the chosen file without its extension, or "Recording" and the date. A rename is an edit. |
| `mimeType` | string | `application/pdf` for a PDF. `audio/…` for a recording, for example `audio/webm;codecs=opus`. |
| `size` | integer, 1 B to 100 MB | Bytes in `attachmentData` |
| `durationMs` | integer or null | Recordings: measured during recording. Sound files: as the browser reports it. |
| `pageCount` | integer or null | PDFs: from PDF.js when the file is added, corrected when it opens. |

### `attachmentData` — index: `id` (schema version 4)

`{ id, bytes: ArrayBuffer }`. Same ID as the attachment. Written once, in the same transaction as the attachment, and never changed. It is a separate table, so that a list of files does not load the bytes.

### `annotations` — index: `id, attachmentId` (schema version 4)

| Field | Type | Note |
| --- | --- | --- |
| `id`, `createdAt`, `updatedAt`, `rev` | | As above |
| `attachmentId` | id | The PDF. Deleted with it. |
| `page` | integer ≥ 1 | PDF page number |
| `colour` | `yellow`, `green`, `blue` or `red` | Shown through the ink tokens of the theme |
| `rects` | number[] | `x, y, width, height` quadruples, each 0 to 1 of the page, one per line of text |
| `quote` | string, up to 10,000 | The highlighted text, with spaces cleaned |
| `note` | string, up to 10,000 | Empty when there is no note |

### Lifetime of files

The app deletes a file only when the last page that used it is deleted permanently (purge of a Trash batch, or Empty Trash). Its bytes, highlights and PDF text go with it. When the user removes a block, the file stays, so editor undo can bring the block back. Since 0.8.0 there is no Files screen, so a file that no block names is not visible until a block names it again. (Until 0.8.0 the Files screen could also delete a file that no page, live or trashed, used, after a confirmation.)

### `pdfTexts` — index: `id` (schema version 6)

| Field | Type | Note |
| --- | --- | --- |
| `id` | id | The attachment ID of the PDF |
| `pages` | string[] | The text of each page, page 1 first, as PDF.js reads it. At most 3,000,000 characters in total. |
| `extractedAt` | number | |

Derived from the bytes of the file, for search. Read once in the background. Deleted with the file. Not in backups (read again after a restore).

### `settings` — index: `key`

`{ key, value, updatedAt }`. The known keys and their validators are in [`src/features/settings/model.ts`](src/features/settings/model.ts).

### `snapshots` — index: `id, createdAt`

`{ id, createdAt, payload }`. A serialized backup that the app makes automatically before a "replace" restore. The app keeps the newest 3. Not in backups.

## Relationships

```
notebook ─< page            (notebookId; null for a loose page)
page ─< drawing             (pageId; the page document names it by drawingId)
page >─< attachment         (the page document names it by attachmentId; no field on the file)
attachment ─ attachmentData (same id)
attachment ─< annotation    (attachmentId)
attachment ─ pdfText        (same id, PDFs only)
```

A page move changes only `notebookId` and `order`. IDs are stable.

## Trash

`trashItem()` marks a page, or a notebook and its live pages, with one `trashBatchId`. A page that was already in the Trash keeps its own batch. `restoreBatch()` clears the marks. If the notebook of a page is gone or trashed, the page comes back as a loose page, and the app tells the user.

## Backup file

```json
{
  "app": "typenote",
  "formatVersion": 3,
  "schemaVersion": 6,
  "exportedAt": "2026-11-18T11:00:00.000Z",
  "data": { "notebooks": [], "pages": [], "settings": [], "drawings": [],
            "attachments": [], "attachmentData": [{ "id": "…", "data": "<base64>" }], "annotations": [] }
}
```

A backup includes trashed items.

**Older files** are read as follows:

| Missing or extra | Made before | Read as |
| --- | --- | --- |
| `drawings` missing | schema version 2 | Empty |
| Notebook `icon` missing | schema version 3 | No icon |
| `attachments`, `attachmentData`, `annotations` missing | format 2 (schema version 4) | Empty |
| `folders`, `tags`, `writingDays`, `decks`, `flashcards`, `reviewLogs` present | format 3 (0.8.0) | Not read. The restore dialog tells the user. Notebooks and pages lose `folderId` and `tagIds` (a page from a folder becomes a loose page), and page links become text, as in the version 6 upgrade (`src/database/legacy.ts`). |

**Checks.** Any failure rejects the whole file:

- A file with a higher `formatVersion` or `schemaVersion` than the app knows is refused, with a message to update.
- A cover finish or icon that is not in the lists above.
- Strokes: known tool and ink, numbers only, whole triples, at most 50,000 points per stroke and 20,000 strokes per drawing.
- Files: each file has its bytes and each bytes entry has its file. The decoded size equals `size`. The bytes of a PDF start like a PDF. The media type fits the kind. A highlight names a file in the backup and has rectangles inside the page.
- Size limit: 400 MB. The app refuses to make a larger backup.

A merge never replaces the bytes of a file: "take newer" updates only its name.

| Restore mode | Existing ID | New ID | Settings |
| --- | --- | --- | --- |
| Add what is missing | kept | added | only missing keys added |
| …and take newer | replaced if backup `updatedAt` is later | added | only missing keys added |
| Replace everything | whole workspace replaced, after a safety snapshot | — | replaced |

## Migrations

| Version | Released in | Change | Upgrade step |
| --- | --- | --- | --- |
| 1 | first release | First schema | — |
| 2 | 0.4.0 | New table `drawings: 'id, pageId'` | Nothing to convert. Test: open a version 1 database (`drawings.test.ts`). |
| 3 | 0.5.0 | New table `writingDays: 'date'`. Notebooks get `icon`. | Each notebook without `icon` gets `icon: null`. (Its test was removed with the words-written log in 0.8.0.) |
| 4 | 0.6.0 | New tables `attachments: 'id, kind'`, `attachmentData: 'id'`, `annotations: 'id, attachmentId'` | Nothing to convert. Test: open a version 3 database with a page and a words-written day (`attachments.test.ts`). |
| 5 | 0.7.0 | New tables `decks: 'id'`, `flashcards: 'id, deckId, due, sourcePageId'`, `reviewLogs: 'id, cardId, deckId, reviewedAt'` | Nothing to convert. (Its test was removed with the flashcards in 0.8.0. The version 6 test starts from a version 5 database.) |
| 6 | 0.8.0 | Tables `folders`, `tags`, `writingDays`, `decks`, `flashcards`, `reviewLogs` deleted. Indexes `notebooks: 'id, trashBatchId'`, `pages: 'id, notebookId, updatedAt, trashBatchId'`. New table `pdfTexts: 'id'`. | Notebooks and pages lose `folderId` and `tagIds`. Each `pageLink` node becomes a text node with its title, joined to the text around it. The settings `recentCount`, `dailyGoal`, `studyNewPerDay`, `studyRetention` and `sidebarCollapsed` are deleted. Test: open a version 5 database with each removed kind of data (`repositories.test.ts`). |

To change the schema:

1. Do not edit a released `this.version(n)` block.
2. Add `this.version(n + 1).stores({...}).upgrade(tx => ...)`.
3. Increase `SCHEMA_VERSION`.
4. Add a migration test with data in the old shape.
5. Extend `parseBackup()` to upgrade older backup files.

## Planned entities

Page Snapshot (version history), if the owner wants it. It would come as a new schema version.
