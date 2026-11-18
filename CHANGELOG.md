# Changelog

Versions follow [Semantic Versioning](https://semver.org/). Before 1.0.0, the public contracts are the database schema and the backup file format. Each has its own version number.

## 0.8.0 — 2026-11-18 — The revamp

TypeNote is a notepad you type into like a typewriter. You open it, see your notebooks, and write. People use it for study, but it is no longer a study app. Milestone 8 (Polish and deployment), part 1: offline.

### Added

- Search everything from the home screen: notebook names, page titles, page text, and the text of PDFs in pages. Results are grouped by notebook, with the words marked and the number of matches. Ctrl/Cmd + K searches the same way and offers "Show all results".
- A page opened from a search shows the find bar. Each match is marked. Enter and Shift+Enter go to the next and previous match. The magnifier below a page also opens the find bar.
- A PDF opened from a search opens at the page with the words, marked.
- The app reads the text of each PDF once, in the background, so that search can find words in it.
- Typing test: 15, 30 or 60 seconds, with typewriter sounds, on a passage from your notes (one notebook or all) or a built-in passage. Shows words per minute, accuracy and time. Never saved.
- A Download button on recordings in a page.
- Offline use. After the first visit, the app, the editor, the PDF reader and the typing test open with no network. A message tells when the app is ready to work offline.
- Install as an app (web manifest and icons, including a maskable icon).
- When a new version is ready, a message offers Reload. The page never reloads automatically.

### Changed

- Home is the notebooks shelf, with loose pages below it. An empty shelf offers "Create your first notebook". A new notebook opens immediately.
- The sidebar is a slim column of icons: new page, search, notebooks, typing test, Trash, Settings. It fades while you type and comes back when you move the pointer. Phones have a bottom bar.
- The typewriter is on by default: key sounds, the bell, and the typewriter typeface. Choices already made in Settings stay.
- A recording that still runs when you leave its page is saved into its block (before: the Files screen).
- Database schema version 6 and backup format 3.

### Removed

- The dashboard (desk), writing streaks, the daily word goal and the words-per-day record.
- Flashcards, decks, review sessions and their settings (Study).
- The graph, page links (`[[`) and "Linked from". A link in a page becomes the text of its title.
- Tags.
- Folders. Notebooks from folders are on the shelf. Pages from folders are loose pages.
- The Files screen. PDFs and recordings stay in their pages.

### Upgrading

- The first open of 0.8.0 upgrades the database once. It deletes flashcards, tags, folders and the words-written record from this device. It keeps notebooks, pages, drawings, PDFs, recordings and highlights. If you want to keep the removed data, download a backup from 0.7.0 first.
- Backups from earlier versions still restore. Their notebooks and pages come back as above. The restore dialog tells that folders, tags, flashcards and writing stats are left out.

### Fixed

- (Found during this work.) The PDF.js worker is a `.mjs` file. It is now in the offline cache.
- (Found during this work.) Without the Files screen, a recording that finished after its page closed, and the download of all recordings, would be out of reach. Both now live in the block.

## 0.7.0 — 2026-11-17

Milestone 7 (Study features).

### Added

- Equations, drawn with KaTeX. Type `$x^2$` in a line for an inline equation, or `$$` and a space on an empty line for an equation block. Or use `/equation`, the toolbar, the palette, or Ctrl/Cmd + Shift + E. Click an equation (or select it and push Enter) to edit its LaTeX, with a live preview. A formula that cannot be read shows its source and the reason.
- Links between pages. Type `[[` and some letters of a title, then choose the page, or make a new one in the same place. A link shows the current title of the page. A link to a deleted page is struck through. Enter on a selected link follows it.
- "Linked from" below each page: the pages that link to it.
- Graph: each linked page as a point and each link as a line. Each point opens its page, from the mouse or the keyboard. Zoom and drag to look around. Pages without links on request. The same links are also listed as text.
- Flashcards, scheduled with FSRS (ts-fsrs). Study: decks with what each has to study today. A deck screen to add, edit, move and delete cards (Undo). A review session with Show answer and Again, Hard, Good, Easy, each with the time when the card comes back. Space, 1 to 4 and Z (undo the last answer) work from the keyboard. `$…$` in a card is an equation.
- "Make a flashcard" on a page: the card starts from the selected text, or the paragraph with the caret, and keeps the page it came from. With no deck yet, the dialog makes one.
- Settings → Study: new cards per deck per day (default 20) and target recall (default 90 %).
- The desk shows how many cards are waiting.
- Study and Graph in the navigation and in the palette (which now also offers Files).
- 43 more unit and component tests and 2 more end-to-end journeys (405 unit, 15 journeys).

### Changed

- Database schema version 5: tables for decks, flashcards and their review history. The upgrade changes no existing data.
- Backups carry decks, cards and review history. Backups from earlier versions still restore. Earlier versions refuse a 0.7.0 backup and ask for an update.
- Equation source and link titles are part of the searchable text and word count of a page.

### Known limits

- No links to a single block, no tables, no web links. The graph lays out at most 400 pages. Cards are text only, with no images or cloze deletions, and no Anki import.

## 0.6.0 — 2026-11-17

Milestone 6 (PDF and audio).

### Added

- PDFs in pages. Type `/pdf` (or use the toolbar or the palette) and choose a file. The page shows its name, pages and size. Open, or Enter on the block, opens the reader.
- A PDF reader: pages fit the width or zoom from 50 to 300 %, go to a page by number, download. Long PDFs stay light: the reader paints only the pages near the screen.
- Highlights in yellow, green, blue or red: select text, choose a color. Each highlight can have a note, saved as you type. Highlights stay on their words at any zoom. Delete offers Undo.
- Sound recording in pages. Type `/record`, then Record, Pause, Resume, and Stop and save. Or choose a sound file. A player in the page plays it.
- Files: each PDF and recording, the pages that use it, filter by kind, play, open, rename, download. You can delete a file that no page uses permanently, after a confirmation.
- PDFs, recordings and highlights are part of backups.
- 46 more unit and component tests and 2 more end-to-end journeys (362 unit, 13 journeys).

### Changed

- Database schema version 4: tables for files, their bytes, and highlights. The upgrade changes no existing data.
- Backup format version 2. Backups from earlier versions still restore. Earlier versions refuse a 0.6.0 backup and ask for an update. The restore limit is now 400 MB. The app refuses to make a larger backup, with a message.
- A permanent delete of a page also deletes the files that only it used.
- CSP: allows recordings to play from the device (`blob:`), the PDF.js worker, and WebAssembly for PDF image decoders. JavaScript `eval` stays forbidden.

### Fixed

- Code text in JetBrains Mono could use a different font in the production build: the build inlined a small font file and the CSP blocked it. Fonts are now always separate files.

### Known limits

- No highlights on scanned PDFs, no search in a PDF, highlights are not written into the file. Recordings stay in memory until stop. Backups carry files as text, a third larger.

## 0.5.0 — 2026-11-17

Milestone 5 (Writing atmosphere).

### Added

- Settings → Writing: the typeface of the page text (Book: Lora, Clean: Inter, Typewriter: JetBrains Mono), size, line spacing and column width, with a live sample.
- Paper ruling: plain, lined, squared or dotted, in both layouts. On ruled paper each block is a whole number of lines high, so the text stays on the rules, also below headings, code and drawings.
- Focus mode: the button below a page, or Ctrl/Cmd + Shift + F. Only the page and its save status stay. Escape leaves. "Fade other blocks" (on by default) keeps the current paragraph at full strength.
- Notebook covers: five finishes (plain cloth, linen, stripes, dots, grid) and twelve icons, in the notebook details.
- Three typewriter machines for the sounds: desk (as before), portable and office.
- "Your writing" on the desk: words written today, a daily goal (Settings → Writing), the streak of days, the words in all pages, and the last seven days as bars, with text for each day.
- 24 more unit and component tests and 1 more end-to-end journey (316 unit, 11 journeys).

### Changed

- Database schema version 3: a `writingDays` table, and notebooks get `icon`. The upgrade gives existing notebooks no icon and changes nothing else.
- Backups hold the words-written days and the new cover fields. Backups from earlier versions still restore. Earlier versions refuse a 0.5.0 backup and ask for an update.

### Known limits

- Typography and ruling are one setting for all pages. Words written counts what saves add, per device, from 0.5.0 on.

## 0.4.0 — 2026-11-17

Milestone 4 (Drawing).

### Added

- Drawings in pages. Type `/draw`, or use the toolbar or the command palette, to add a drawing block. It opens full screen. The page shows a preview, and "Open drawing" (or Enter on the selected block) opens it again.
- Pen and highlighter in five inks (ink, red, blue, green, yellow) and three widths. Pen pressure changes the line width. With a mouse or a finger, the speed does.
- Palm rejection: after a pen is used, a finger scrolls and does not draw.
- An eraser that removes only what it touches: a line cut in the middle becomes two.
- Lasso: select strokes, then move, resize or delete them.
- Undo and redo in the drawing, with buttons or Ctrl/Cmd + Z and Ctrl/Cmd + Shift + Z.
- "Add space below" makes the canvas taller.
- Download a drawing as a PNG image.
- Drawings are part of backups.
- Design tokens for drawing inks in every theme, with a contrast check.
- 48 more unit and component tests and 1 more end-to-end journey (292 unit, 10 journeys).

### Changed

- Database schema version 2: a new `drawings` table. The upgrade changes no existing data.
- Backups now hold drawings. Backups from earlier versions still restore. Earlier versions refuse a 0.4.0 backup and ask for an update.
- The editor file is 12 kB (gzip) larger, for the drawing engine (perfect-freehand, MIT, no dependencies).

### Security and data safety

- A drawing saves through the same autosaver as a page. "Saved" shows only after the write, and "Done" closes the drawing only after its last write. A failed write keeps the drawing open, with a retry.
- Strokes in a backup file are validated like all other data: known tool and ink, numbers only, size limits.
- A duplicated or pasted drawing block gets its own copy of the strokes, so a change to one never changes the other.
- A drawing is deleted only when its page is deleted permanently.

### Known limits

- Drawing happens full screen, not on the page. No shapes, text or images on the canvas. Drawing needs a pointer. Not yet tried with a real stylus.

## 0.3.0 — 2026-11-16

Milestone 3 (Writing editor).

### Added

- Rich-text editor (Tiptap 3) in place of the plain text box. Old pages open as they were, with no migration.
- Formatting: headings 1 to 3, bold, italic, underline, strikethrough, inline code, bulleted, numbered and check lists, quote, code block, divider. From the toolbar, from shortcuts, or by typing (`# `, `- `, `1. `, `[ ] `, `> `).
- Slash menu: type `/` and some letters to choose a block type.
- Block menu: move a block up or down (also Alt + Shift + ↑/↓), duplicate (Ctrl/Cmd + Shift + D), delete with Undo, turn into a different type.
- Stable block IDs in the document, kept through edits, moves and reloads.
- Search and commands (Ctrl/Cmd + K, or the Search button): find a page by its name or text, go to a screen, make a page, or run a formatting command.
- "Sheets of paper" layout, per page: the text is on sheets, and a block that would cross the bottom margin starts the next sheet. Paper size and margins in Settings → Paper.
- JetBrains Mono for code, bundled.
- `npm run lint`: ESLint with accessibility (jsx-a11y) and React hooks rules. Also runs in CI.
- 61 more unit and component tests and 3 more end-to-end journeys (244 unit, 9 journeys).

### Changed

- The editor loads when the first page opens, in its own file (145 kB gzip). The first screen does not wait for it.
- A long menu now scrolls inside itself and does not go off the screen.
- The navigation drawer closes on navigation without an extra render.

### Fixed

- A long notebook name could make the page screen and the dashboard scroll sideways on a phone.

### Security and data safety

- A page with content that this version cannot show (for example from a newer backup) opens read-only and stays exactly as stored. It is never flattened and saved over.

### Known limits

- No tables or links yet. A block taller than one sheet is not split. Paper settings apply to all pages.

## 0.2.1 — 2026-11-16

### Added

- Typewriter sounds while writing, modeled on a manual desk typewriter and synthesized with the Web Audio API, so there are no audio files to download or bundle:
  - Key: key lever, type slug on paper and platen, typebar ring and fall, escapement step. Each character has its own pitch and its own position between left and right.
  - Space bar, backspace (one tooth of the rack), shift down and shift up (the type basket).
  - Carriage return, on Enter and when a line wraps: line-feed clicks, the carriage slide back (longer for a longer line), the margin stop.
  - Paper feed into the platen when a page opens or sounds are turned on.
  - A short resonance for the body of the machine, and a limiter so that loud moments do not distort.
- Bell setting: "Every new line" (default: rings with each carriage return), "Before the line ends" (as on a real machine: about 7 characters before the end of the visual line), or "Off".
- Speaker button below the page to turn sounds on and off. Volume and a sample in Settings → Writing sounds.
- Sounds are off until turned on. Paste, cut, undo and redo are silent.
- 41 more unit tests and 1 more end-to-end journey (183 unit, 6 journeys).

### Fixed

- The bell on a new line was not audible: it was one quiet tone under the carriage ratchet. It is now a struck gong with overtones, rings for about a second, and starts before the mechanism.

### Known limits

- One machine. Sound packs stay in Milestone 5.
- The sounds were measured (level, no clipping, bell clearly above the mechanism), not judged by ear.
- Shift sounds need a hardware keyboard. The wrap and the margin bell follow the caret only in the page text.

## 0.2.0 — 2026-11-16

Milestones 1 (Foundation) and 2 (Database and organization).

### Added

- Project scaffold: React 19, TypeScript 7, Vite 8, Tailwind CSS 4, hash routing.
- Design tokens and six themes with "Match system", custom accent, density and animation settings.
- Application shell: collapsible sidebar, mobile top bar, drawer and bottom bar, skip link.
- Reusable controls: buttons, fields, dialog, confirm dialog, menu, toasts, breadcrumbs, segmented control, empty states.
- IndexedDB database (schema 1) through Dexie, with a repository layer.
- Nested folders, notebooks with colored covers, pages in a notebook, in a folder or on their own.
- Rename, move, reorder, favorite, pin and tags.
- Dashboard: continue working, pinned, favorites, recently modified.
- Plain-text page writing with autosave, save status, word and character counts, Ctrl/Cmd + S.
- Trash with undo, restore and confirmed permanent deletion.
- Backup to a JSON file and restore with three conflict modes. A replace restore can be undone.
- Storage usage, persistent-storage request and privacy statement in Settings.
- CSP in the production build.
- GitHub Actions workflow for GitHub Pages (not yet run).
- 142 unit and component tests, 5 end-to-end journeys on desktop and mobile.
- Project documentation.

### Known limits

- The page body is plain text until the rich-text editor comes in 0.3.0.
- No search, drag and drop, drawing, sounds, PDF, audio, flashcards, graph, PWA or offline shell yet.
