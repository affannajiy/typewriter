# Development Roadmap and Implementation Checklist

**Last updated:** 2026-11-18 · **Version:** 0.8.0, the revamp (Milestone 8 in progress)

Status words: **Not started**, **In progress**, **Implemented** (works, no automated test yet), **Tested** (works and has automated tests), **Blocked**, **Removed** (removed in 0.8.0, D18).

This checklist shows the current product. Rows for features that 0.8.0 removed are collapsed into one "Removed" row per milestone. The 0.7.0 version of this file in git history has their full rows.

| Milestone | State |
| --- | --- |
| 1 Foundation | Done, with the gaps below |
| 2 Database and organization | Done, with the gaps below |
| 3 Writing editor | Done, with the gaps below |
| 4 Drawing | Done, with the gaps below |
| 5 Writing atmosphere | Done, with the gaps below |
| 6 PDF and audio | Done, with the gaps below |
| 7 Study features | Done. 0.8.0 removed all except equations. |
| 8 Polish and deployment | In progress. Done: offline, the 0.8.0 revamp. To do: deployment, bundle size, accessibility. |

## Milestone 1 — Foundation

| Item | Status | Note |
| --- | --- | --- |
| React, TypeScript, Vite | Tested | Typecheck and production build pass |
| Tailwind CSS | Tested | v4, mapped to tokens |
| Design tokens | Tested | Contrast test for all six themes |
| Themes: Classic Atelier, Dark Academia, Minimalist, Forest, Midnight, Rose | Tested | Plus "Match system" |
| Custom accent color | Tested | The app calculates a legible text color. A weak accent shows a warning. |
| Interface density, animation toggle, reduced motion | Implemented | Applied through tokens. No visual regression test. |
| Responsive layout: icon rail, phone top bar and bottom bar | Tested | No-horizontal-scroll test on desktop and on a 412 px phone |
| Routing | Tested | Hash routes, deep link and reload under the base path |
| Components: Button, IconButton, TextField, TextArea, SearchField, Card, Dialog, ConfirmDialog, Menu, Toast, Breadcrumbs, Segmented control, EmptyState, status indicator | Tested / Implemented | Button, Menu and ConfirmDialog have component tests |
| Components: Toolbar, Content blocks | Tested | Came with the editor (Milestone 3) |
| Components: Tabs, Tooltip, Context menu, Floating action menu | Not started | Tooltips are native `title` for now |
| Resizable panels | Not started | |
| Typography settings (font, size, line height, width) | Tested | Milestone 5. App-wide, not per notebook. |
| Fonts bundled locally | Implemented | Inter, Lora, Cormorant Garamond. JetBrains Mono comes with code blocks. |
| Central strings, logical CSS properties, `lang` and `dir` | Implemented | English only. RTL not tested. |

## Milestone 2 — Database and organization

| Item | Status | Note |
| --- | --- | --- |
| Dexie schema v1, repository layer | Tested | |
| Migrations | Tested | Each version step has a test that opens a database of the previous version (DATA_MODEL.md, Migrations) |
| Notebooks: create, edit details, cover color, move, reorder, favorite | Tested | |
| Pages: create in a notebook or loose, move, reorder, favorite, pin | Tested | |
| Autosave with honest status | Tested | "Saved" only after the write resolves. A failure keeps the text and offers retry. |
| Force save (Ctrl/Cmd + S), save on tab hide, warning on close while unsaved | Implemented | No automated test |
| Trash: delete a notebook with its pages, undo, restore, permanent delete with confirmation | Tested | Unit and end-to-end |
| Backup: full JSON export | Tested | End-to-end download test |
| Restore: validation, duplicate detection, three modes, atomic, undo for replace | Tested | Includes a test with a failure in the middle of a restore |
| Storage usage, persistence request, low-storage warning | Implemented | Depends on the browser. Not automated. |
| Storage-unavailable screen, error boundary | Implemented | Not automated |
| Drag and drop | Not started | "Move to…" and "Move up/down" are the working alternative |
| Notebook icon and cover finish | Tested | Milestone 5. No separate notebook accent color: the cover color is the notebook color. |
| Bookshelf and list views | Implemented | |
| Templates | Not started | Release 1.1 |
| Markdown export, PDF export | Not started | The editor document model exists now |
| Backup reminders | Not started | Settings shows the date of the last backup |
| Removed | Removed | Folders (nest, move, cycle checks), tags, dashboard (favorites, pinned, recent, writing stats, study corner, customization, quick capture) |

**Acceptance (create, organize, save, close, reopen without loss):** met. Proof: the end-to-end test "a workspace survives closing and reopening the app".

## Milestone 3 — Writing editor

| Item | Status | Note |
| --- | --- | --- |
| Tiptap 3 in the page screen | Tested | Replaces the textarea. Old pages load unchanged, with no migration (unit test). |
| Opening a page is not an edit | Tested | The editor reports no change on open, so `updatedAt` and `rev` stay |
| A page that this version cannot show is read-only | Tested (the check) / Implemented (the screen) | Unknown node or mark types are never dropped and saved over. The stored text shows instead. |
| Formatting: headings 1 to 3, bold, italic, underline, strikethrough, inline code, bulleted, numbered and check lists, quote, code block, divider | Tested | Toolbar, shortcuts, and typed shortcuts such as `- ` and `# ` |
| Toolbar | Tested | One tab stop, arrow keys inside. Scrolls sideways on a narrow screen. |
| Stable block IDs | Tested | Kept through edits, moves, type changes, undo and reload. A split or a copy gets a new ID. |
| Block menu: move up and down, duplicate, delete, turn into | Tested | Acts on the top-level block that holds the caret. Delete offers Undo. |
| Slash-command menu | Tested | End-to-end and unit. Off inside code. |
| Shortcuts | Tested (bold, move block, undo, Ctrl/Cmd + K) / Implemented (the rest) | The others come from Tiptap. The toolbar tooltips and the palette show them. |
| Command palette (Ctrl/Cmd + K) | Tested | Search, go to a screen, new page, formatting commands for the open page |
| Continuous and paginated layouts | Tested | Chosen per page, below the page. Stored in `pages.layout`. |
| Paper size (A4, Letter, A5) and margins (narrow, normal, wide) | Tested | In Settings. One choice for all pages. |
| Typewriter sounds in the editor | Tested | Same end-to-end journey as before, now through the editor |
| ESLint with accessibility rules | Tested | `npm run lint`, also in CI. jsx-a11y and React hooks rules. Clean. |
| JetBrains Mono for code | Implemented | Bundled locally |

Search: see 0.8.0 below.

**Gaps (on purpose or still to do):**

- **No tables or web links** in the editor. Pasted addresses stay plain text.
- **A block taller than one sheet is not split** in the paginated layout. It goes past the page edge. Page breaks occur only between blocks.
- **Paper size and margins are one setting for all pages.** There is no print or PDF output yet, so the sheets are only a writing view.
- On a phone the sheet scales to the screen but the text does not. Thus a sheet holds less text than on paper.
- The block menu works on top-level blocks (a whole list, not one list item). There is no drag handle.
- **No custom key bindings.**
- Search scans the workspace in memory on each key press. Measure with a large workspace before the end of Milestone 8 (ARCHITECTURE.md, D3 and D12).
- ESLint reads TypeScript through Babel, so it has no type-aware rules. typescript-eslint does not support TypeScript 7 yet.
- Not run: input methods (IME), real phone keyboards, Firefox, Safari, screen readers.

## Milestone 4 — Drawing

| Item | Status | Note |
| --- | --- | --- |
| Library comparison: `drawfn`, tldraw, Excalidraw, custom on perfect-freehand | Done | Custom engine on perfect-freehand. Reasons and table: ARCHITECTURE.md, D13. |
| Schema v2: `drawings` table, with migration test | Tested | A version 1 database opens with its data intact |
| Strokes stored as editable data (points with pressure, tool, ink, width) | Tested | Not pixels. Saved through the same honest autosaver as pages. |
| Drawing block in the page: slash menu, toolbar, command palette, preview. Enter or a button opens it. | Tested | Unit and end-to-end. The block adds no words to the page. |
| Full-screen drawing editor | Tested | Native `<dialog>`. Escape clears a selection, then closes after the last write. |
| Pen and highlighter, five inks, three widths | Tested | Inks are theme tokens with a contrast test. The highlighter is translucent and goes under the pen. |
| Stylus pressure, palm rejection | Tested (palm rejection) / Implemented (pressure) | Pressure from the pen, otherwise simulated from speed. After a pen is used, touch does not draw (component test with simulated pen events). Not tried with a real stylus. |
| Partial erase | Tested | A stroke cut in the middle becomes two |
| Lasso select, move, resize, delete | Tested (select, delete, move and scale math) / Implemented (drag to move and resize) | Drag examined by hand in Chromium. No automated test. |
| Undo and redo in the drawing | Tested | Buttons and Ctrl/Cmd + Z, Ctrl/Cmd + Shift + Z, Ctrl/Cmd + Y |
| Duplicate or paste a drawing block | Tested (duplicate) / Implemented (paste from a different page) | The copy gets its own strokes |
| Drawing deleted with its page | Tested | Only on permanent delete of the page. Trash and restore keep it. |
| Backup and restore of drawings | Tested | Old backups without drawings still restore. Strokes validated like all untrusted input. |
| PNG export | Tested | End-to-end download. Twice the canvas size, on the paper color of the theme. |
| "Add space below" | Tested | Canvas grows by 300 units, up to 8,000 |

**Gaps (on purpose or still to do):**

- **Drawing happens full screen**, not on the page. The page shows a preview.
- No shapes, straight lines, text boxes, images or zoom on the canvas. No SVG export or import.
- **Drawing needs a pointer.** Keyboard users can open a drawing, undo, redo, delete a selection and download it, but cannot draw. The canvas announces only its number of strokes.
- Not tried with a real stylus (Apple Pencil, S Pen, Wacom) or on iOS Safari. Pressure and palm rejection have tests with simulated pen events only.
- No performance budget measured for a drawing with thousands of strokes. The outline of each stroke is calculated once and kept while the stroke does not change.
- A drawing whose block was deleted stays until its page is deleted permanently (necessary for undo).
- The selection is a box with one resize corner. No rotation.

## Milestone 5 — Writing atmosphere

| Item | Status | Note |
| --- | --- | --- |
| Typewriter sounds: key, space, backspace, bell, carriage return | Tested | Synthesized with Web Audio, no audio files. On by default since 0.8.0. Measured, not judged by ear. |
| Carriage return with bell on Enter and when a line wraps | Tested | End-to-end test in a real browser. The caret position comes from the editor (`coordsAtPos`). |
| Bell setting: every new line, before the line ends (margin bell), off | Tested (default and validation) / Implemented (the other two modes) | |
| Shift down and up, paper feed when a page opens | Implemented | The sounds have unit tests. The triggers are not automated. |
| Sound on/off on the page, volume and sample in Settings | Tested | |
| Sound machines: desk, portable, office | Tested | Parameter sets for the same synthesizer: pitch, mass, ring time, body, carriage length, bell. Chosen in Settings. Not judged by ear. |
| Typography: typeface (Lora, Inter, JetBrains Mono), size, line spacing, column width | Tested | Settings → Writing, with a live sample. Unit, component and end-to-end. |
| Paper ruling: plain, lined, squared, dotted | Tested | In both layouts. On ruled paper each block is a whole number of lines, so the text stays on the rules (end-to-end measures it). |
| Focus mode | Tested | Button below the page or Ctrl/Cmd + Shift + F. Escape leaves. Hides the app around the page, and the toolbar. Can fade all blocks except the current one. |
| Notebook covers: five finishes and twelve icons | Tested | Schema version 3 adds `icon` |
| Removed | Removed | Words written (today, daily goal, streak, last seven days) and its `writingDays` table |

**Gaps (on purpose or still to do):**

- **Settings are app-wide.** Typeface, ruling and paper are not chosen per notebook or per page.
- On ruled paper, headings keep their size, but their line height is a whole number of lines. Thus headings are a little looser than on plain paper. A new block type must also get whole-line heights (ARCHITECTURE.md, D14).
- Focus mode does not keep the caret line in the middle of the screen (no "typewriter scrolling").
- No cover images, title position on the cover, or custom paper colors. Cover patterns are CSS.
- The sound machines were tuned by numbers, not by ear.
- The faded blocks in focus mode have less contrast than WCAG asks for text. That is the purpose of the setting. "Keep all blocks" turns it off.

## Milestone 6 — PDF and audio

| Item | Status | Note |
| --- | --- | --- |
| Schema v4: `attachments`, `attachmentData`, `annotations`, with migration test | Tested | A version 3 database opens with its pages intact |
| Files stored on the device, bytes separate from details | Tested | A file list never loads the bytes. 100 MB per file. Type and size checked. A "PDF" must start like one. |
| PDF block: `/pdf`, toolbar, palette. Choose a file. Name, pages and size. Open, or Enter on the block. | Tested | Unit and end-to-end. If PDF.js cannot open the file, the app refuses it with a message. |
| PDF reader (PDF.js 6.5) | Tested | Its own screen, `#/file/<id>`. Pages painted only near the screen and released far from it. Selectable text layer. Fit to width, zoom 50 to 300 %. Go to page by number. Download. |
| Highlights in four colors, with a note on each | Tested | Select text, choose a color. Stored as fractions of the page, so they stay on the words at any zoom (end-to-end checks it after a zoom). Notes save as you type, "Note saved" after the write. Delete has Undo. |
| Recording block: `/record`. Record, pause, resume, stop and save. | Tested | Unit with a stand-in recorder. End-to-end with the Chromium stand-in microphone. Opus in WebM or Ogg, AAC in MP4 on Safari, 64 kbit/s. Stops automatically at 100 MB. |
| A recording that runs when its block goes is saved. Closing the tab asks first. | Implemented | Since 0.8.0 it goes into its block (see 0.8.0). The whole flow is not automated. |
| Sound file in place of a recording | Tested (component) | The browser reads the length when it can |
| Player for recordings | Tested | Plays from the stored bytes through a blob: URL. End-to-end checks that it decodes under the CSP. |
| Deleting files | Tested | With the last page that used it, on permanent delete of that page. Removing the block keeps the file, so undo works. |
| Backups with files (format 2) | Tested | Bytes as base64. Checked like each record (type, size, bytes match, PDF signature, highlights on known files). A backup over 400 MB is refused when it is made, not on restore. Format 1 files still restore. |
| PDF.js data files served from the app | Tested | Fonts, character maps, color profiles and image decoders copied into `dist/pdfjs/` (3.2 MB). No other site is contacted. |
| Removed | Removed | Files screen ("audio library"): list, filter, rename, delete unused files |

**Gaps (on purpose or still to do):**

- **Highlights need a text layer.** A scanned PDF has no text to select, so you cannot highlight it. No free drawing, shapes, sticky notes or ink on PDF pages.
- No outline or thumbnails, no page rotation. Highlights do not show in the page that holds the PDF, and highlight text is not in search.
- **No PDF export of a page.** Annotations are not written into the PDF file. Highlights stay in TypeNote and its backups.
- **Recordings stay in memory until stop.** A crash or a closed tab during a recording loses it. No timestamps that link a recording to the notes typed during it.
- **Backups are one JSON text with base64 bytes.** Thus files take a third more space in a backup. If the backup of a workspace would be more than 400 MB, you cannot back it up until you delete or download files. A zipped format is the fix (ARCHITECTURE.md, Known limits).
- Two blocks can show the same file (a duplicated or pasted block). This is on purpose: the bytes of a file never change, and its highlights are shared.
- On ruled paper, a PDF or recording card has a minimum height in whole lines. But if the controls of a card wrap to more rows on a narrow screen (an empty recording block, a recording in progress), the text below can move off the rules.
- Not tried: recording on Safari or Firefox, iOS, a real microphone, large or damaged real-world PDFs, right-to-left PDFs, a screen reader in the reader.

## Milestone 7 — Study features

| Item | Status | Note |
| --- | --- | --- |
| Library check: KaTeX | Done | KaTeX 0.19.1, MIT, no browser dependencies, `npm audit` clean. Reasons: ARCHITECTURE.md, D16. |
| Equations: inline and block, drawn with KaTeX | Tested | `$x^2$` and `$$` typed, `/equation`, toolbar, palette, Ctrl/Cmd + Shift + E. Unit and end-to-end. The end-to-end test checks that the KaTeX font loads under the CSP. |
| Edit the LaTeX of an equation in a dialog with a preview | Implemented | Enter saves. An empty formula removes it. Cancel on a new equation removes it. The insert and the stored result have tests. The dialog does not. |
| An unreadable formula shows its source and the reason | Tested (the renderer) / Implemented (the view) | KaTeX with `trust: false`. A unit test checks that no links, raw HTML or styles come out. |
| Removed | Removed | Page links (`[[`), backlinks, the graph, decks, flashcards, FSRS (ts-fsrs), review sessions, Settings → Study, schema v5 tables |

**Gaps (on purpose or still to do):**

- **Equations on ruled paper:** a tall formula pushes the text below off the rules (ARCHITECTURE.md, Known limits). Equation source counts as words.
- Not run: a screen reader on equations, Firefox, Safari.

## Milestone 8 — Polish and deployment

From the master specification: accessibility pass, PWA and offline, first real deployment. "Dashboard polish" went with the dashboard (0.8.0).

| Item | Status | Note |
| --- | --- | --- |
| Library check: vite-plugin-pwa | Done | 2.0.0 with Workbox 7.4, MIT, build time only. `npm audit`: one moderate advisory in `minimatch` under `workbox-build` (a build tool, not shipped). Reasons: ARCHITECTURE.md, D17. |
| Offline: all files precached. The app opens and works with no network. | Tested | End-to-end: write a page, read a PDF and open the typing test while offline |
| Installable: web manifest, icons (192, 512, maskable, Apple touch) | Implemented | Install not tried in a browser |
| "Ready to work offline" and "new version ready" messages. An update applies only on Reload. | Tested (offline message) / Implemented (update) | The update needs two builds. Not automated. |
| First real deployment (GitHub Pages) | Not started | The workflow exists and never ran. Needs Pages turned on in the repository settings, and approval from the owner. |
| Initial JS under 200 kB gzip | Not started | Now 173 kB, but the editor (163 kB gzip) loads with the first page |
| Workspace read under 100 ms at 5,000 pages | Not started | Not measured (D3) |
| Accessibility pass (keyboard, screen reader, 320 px, 200 % zoom) | Not started | |

**Gaps (on purpose or still to do):**

- The first visit stores about 6.5 MB, PDF.js data included, also for someone who never opens a PDF.
- Not run: app install, an update from one build to the next, Firefox and Safari offline.

## 0.8.0 — The revamp

Decided with the owner on 2026-11-18 (PRD.md, "The 0.8.0 revamp"): a typewriter notepad, not a study app.

| Item | Status | Note |
| --- | --- | --- |
| Schema v6: drop folders, tags, writing days, decks, cards, review logs. Flatten notebooks and pages. Page links to text. `pdfTexts` table. | Tested | Upgrade test from a version 5 database with each removed kind of data |
| Backup format 3. Format 1 and 2 files still restore, and the app tells which parts it left out. | Tested | Unit (old file with folders, tags, cards, page links) and end-to-end (format 3 round trip) |
| Home: the shelf, loose pages below, "Create your first notebook" on an empty shelf. A new notebook opens immediately. | Tested | End-to-end |
| Old addresses (`#/library…`) go home | Tested | End-to-end |
| Slim icon rail, bottom bar on phones, the rail fades while typing | Tested (rail, bottom bar) / Implemented (fade) | The fade was examined in the browser (the rule applies). No test. |
| Typewriter on by default: sounds and the mono typeface | Tested | Unit (defaults) and end-to-end (sounds) |
| Removed: dashboard, streaks, goal, Study, graph, tags, folders, page links, Files screen | Done | Code, routes, settings and strings removed |
| Search: page text, titles, notebook names and PDF text. Grouped by notebook. Marked words. Match counts. | Tested | Unit and end-to-end. Each word must match. Case and accents are ignored. The Trash is not searched. |
| PDF text read once in the background, stored, and read again after a restore | Tested (search) / Implemented (indexer) | The end-to-end PDF search uses the indexer. A damaged PDF is skipped for the session. |
| A page opens at the match. Find bar with Enter / Shift+Enter, wraps, Escape closes. | Tested | Unit (match by document position) and end-to-end |
| A PDF opens at the page with the match, with the words marked | Tested | End-to-end |
| Typing test: 15/30/60 s, my notes (one notebook or all) or built-in passages, sounds, WPM and accuracy, nothing stored | Tested | Unit (passages, scoring) and end-to-end (with a controlled clock) |
| A recording that ends after its page closed goes into its block (before: the Files screen) | Tested | Unit (`fillFileBlock`) |
| Download a recording from its block (before: the Files screen) | Tested | End-to-end |

**Gaps (on purpose or still to do):**

- Search finds the text of a PDF only after the app reads it. A large PDF takes a few seconds in the background. Until then its words are not found. A PDF with no text layer (a scan) has no words.
- A match in the source of an equation counts in the search results but is not marked in the page.
- The typing test needs a dozen words in a page to use notes. With fewer notes, a passage repeats.
- You cannot rename files now (that was in the Files screen). A file that no page uses stays in the database until a page that used it is deleted permanently.
- The PDF match marks whole runs of text as PDF.js lays them out. A word split across two runs is not found.

## Open questions for the owner

1. Paste the full master specification into `PRD.md`?
2. License for the project (now `UNLICENSED` in `package.json`).
