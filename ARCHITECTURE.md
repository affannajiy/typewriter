# Architecture

TypeNote is a static single-page application. There is no server. All data is in the browser's
IndexedDB.

## Stack

Versions are the ones installed at kickoff (2026-11-16); `package-lock.json` pins them.

| Layer | Choice | Licence |
| --- | --- | --- |
| Framework | React 19 | MIT |
| Language | TypeScript 7, strict, `noUncheckedIndexedAccess` | Apache-2.0 |
| Build | Vite 8 | MIT |
| Styling | Tailwind CSS 4 over CSS-variable tokens | MIT |
| Routing | React Router 8, hash mode | MIT |
| Database | Dexie 4 on IndexedDB, `dexie-react-hooks` | Apache-2.0 |
| Editor | Tiptap 3 (ProseMirror): core, React binding, starter kit, list, extensions, suggestion | MIT |
| Drawing | perfect-freehand 1.2 (stroke outlines only), our own engine around it (D13) | MIT |
| PDF | PDF.js (`pdfjs-dist`) 6.5, loaded when a PDF is first opened (D15) | Apache-2.0 |
| Icons | Lucide | ISC |
| Fonts | Inter, Lora, Cormorant Garamond, JetBrains Mono via Fontsource, bundled | OFL-1.1 |
| Tests | Vitest 5, React Testing Library, fake-indexeddb, Playwright | MIT / Apache-2.0 |
| Lint | ESLint 9 with jsx-a11y and react-hooks, parsed by `@babel/eslint-parser` | MIT |

Runtime dependencies: 20 packages (9 at kickoff; Tiptap is 8 of the new ones, all from one
project and one version; perfect-freehand has no dependencies of its own; pdfjs-dist is Mozilla's).
pdfjs-dist lists `@napi-rs/canvas` as an optional dependency for Node; npm installs it, the browser
build never loads it. `npm audit` reports 0 vulnerabilities (2026-11-17).

## Layers

```
src/
  app/            App root: database open, error boundary, routes
  components/
    ui/           Reusable controls: Button, Dialog, Menu, Field, Toast, layout pieces
    navigation/   AppShell: sidebar, top bar, drawer, bottom bar
  features/       One folder per screen or concern
    dashboard/  library/  pages/  tags/  trash/  settings/
    editor/       Rich text: schema, block IDs, commands, toolbar, slash menu, pagination
    drawing/      Drawing engine (geometry), the drawing block, the full-screen editor, PNG export
    dashboard/    The desk, and the words-written summary (stats.ts, WritingStats)
    files/        PDF and recording blocks, the PDF reader, highlight geometry, the Files screen
    search/       Global search and the command palette
    organisation/ Shared item rows, menus, dialogs, actions
  hooks/          useData.ts: live queries over repositories
  database/
    db.ts         Dexie schema and versions
    repositories/ All reads and writes of user data
    backup/       Backup format, validation, restore
  services/       autosave, storage facts, PDF.js wrapper (pdf.ts), recorder
  i18n/           en.ts: every interface string
  styles/         tokens.css (themes), index.css (Tailwind mapping)
  types/          models.ts: the data model
  utils/          colour, dates, errors
e2e/              Playwright journeys
```

### Rules

1. **Components never touch IndexedDB.** They call repository functions, or read through the hooks in `hooks/useData.ts`. Only `database/` imports `db`. (`app/App.tsx` calls `db.open()` once, to detect unavailable storage.)
2. **Repositories own the rules of the data:** name cleaning, valid locations, cycle checks, revision bumps. Every multi-step write is one transaction.
3. **Expected failures are typed** (`RepositoryError`, `BackupError`) and turned into user messages in one place, `utils/errors.ts`. Unexpected ones get a generic message; details go to the console only.
4. **No raw colours or strings in components.** Colours come from tokens, text from `i18n/en.ts`.
5. **Native elements first.** Dialogs are `<dialog>`, choices are radio inputs, links are links. The one custom ARIA widget is `Menu`, which implements the full menu-button keyboard pattern and is tested.

## Decisions

Each records the context and the alternatives, so it can be revisited.

### D1. One document per page, not one row per block

The page body is a single Tiptap/ProseMirror JSON document in `pages.content`. Blocks get stable IDs
as node attributes (D10). `pages.plainText` is derived on every save for search.

- *Why:* one atomic write per save, no ordering bugs, undo stays inside the editor.
- *Alternative:* a `blocks` table. Closer to the specification's entity list and friendlier to per-block sync, but every save becomes a multi-row diff.
- *Consequence:* block links and backlinks need a derived index (Milestone 7). Search does without one for now (D12).

### D2. Soft delete with trash batches

Deleting sets `deletedAt` and a shared `trashBatchId` on the item and its descendants. Restore and
purge work on the batch. The batch root is found by structure (the item whose parent is outside the
batch), so no extra table is needed.

- *Consequence:* rows are removed only by `purgeBatch()` and `emptyTrash()`, both behind a confirmation.

### D3. Whole-workspace live query

`useWorkspace()` loads all live folders, notebooks, pages and tags and filters in memory.

- *Why:* simplest correct design; navigation is instant.
- *Cost grows* linearly with item count, and page rows include their content. Measure before Milestone 8; the planned fix is to split page content into its own table so the index stays small. Budget: workspace read under 100 ms at 5,000 pages.

### D4. Settings: one row per key, validated on read

`resolveSettings()` checks every stored value and falls back to the default. A damaged or imported
value cannot break the app. Theme, accent, density and motion are mirrored to `localStorage` only so
the first paint uses the right theme; the mirror is rewritten on every apply and the database wins.

### D5. Themes are attribute-scoped token sets

`data-theme` on `<html>` selects a block in `styles/tokens.css`. A test reads that file and checks
WCAG contrast for every theme. Paper themes will use separate `--tn-paper-*` tokens, so interface
theme and paper are independent. Density scales Tailwind's spacing unit. Motion is one duration
token that is zero when animations are off or the system asks for reduced motion.

### D6. Hash routing and a configurable base

`HashRouter` plus `TYPENOTE_BASE` (default `/typewriter/`). Works on GitHub Pages without a
`404.html` redirect, and unchanged on Vercel with `TYPENOTE_BASE=/`.

### D7. Backup files are untrusted input

`database/backup/validate.ts` rebuilds every record from an allowlist of fields with type, length
and format checks; colours must be 6-digit hex; document depth is capped; prototype keys are
rejected. An invalid file is refused whole. After a merge, `repairReferences()` resets dangling
parents to the top level and cuts folder cycles, and reports how many.

### D8. Content Security Policy

The production build adds a CSP meta tag: everything `'self'`, no inline scripts, no remote
connections. `style-src` allows `'unsafe-inline'` because user-chosen colours are applied as style
attributes; those values are validated as hex before they are stored. A meta-tag CSP cannot set
`frame-ancestors`; that needs a header, which GitHub Pages does not let us set.

Since 0.6.0: `media-src 'self' blob:` (recordings play from object URLs made from stored bytes),
`worker-src 'self'` (PDF.js's worker is a file of the app), and `'wasm-unsafe-eval'` in
`script-src`, which lets PDF.js compile its bundled image decoders. It allows WebAssembly only;
JavaScript `eval` stays forbidden. Fonts are never inlined as `data:` URLs by the build
(`assetsInlineLimit`), because `font-src` is `'self'`: before 0.6.0 one JetBrains Mono subset was
inlined and blocked in production, which the new end-to-end check found.

### D9. Typewriter sounds are synthesised, not recorded

`src/services/typewriterSound.ts` builds each sound from filtered noise and short tones with the Web
Audio API. No audio files: nothing to download, cache for offline use, or licence, and the Content
Security Policy needs no `media-src`. The trade-off is realism; recorded sound packs can be added
later behind the same `playTypewriterSound(kind, volume, detail)` call. Sounds are chosen from
`InputEvent.inputType`, not key codes, so on-screen keyboards work and the editor can change freely.
Sounds are off by default, and an audio failure is swallowed: sound must never interrupt writing.

Each sound is a short sequence of the events inside a manual typewriter (lever, slug, typebar,
escapement, rack, stop), not one sample. All voices pass through one bus, a short convolution
"body", a volume gain and a limiter. `renderTypewriterSound` renders a sound offline so that levels
can be measured without listening.

The margin bell and the wrap need the caret's place on its visual line. `src/services/carriage.ts`
reads it from the editor's own layout (`measureCaret`: the caret's coordinates inside its text block)
and decides with a pure function (`carriageEvents`). It is measured only while sounds are on.
`features/pages/useTypewriter.ts` turns an edit into sounds; `features/editor/RichEditor.tsx` tells
it about each edit. The edit is noted from the `beforeinput` event, or from the key for Enter and
the delete keys (which the editor often handles itself), and is matched with the editor's next
change. `input` cannot be used for this: the editor reads the changed text between two listeners of
that event, so the note would arrive after the change it describes.

### D10. The editor is Tiptap, wrapped in one feature folder

`features/editor/` is the only place that imports Tiptap at run time. The page screen gives it a
document and gets documents back.

- **One schema list.** `schemaExtensions()` defines the node and mark types. The editor, the
  readable-document check and the tests all use it.
- **Unknown content is never dropped.** ProseMirror discards what its schema does not know, and the
  next autosave would store the loss. `isReadableDoc()` checks a stored document first; if it fails,
  the page opens read-only and shows the stored plain text.
- **Block IDs** are a node attribute (D1), added to old documents when they load and kept unique by a
  small plugin (`blockIds.ts`). Whole-block actions (`blocks.ts`) each start their own undo step.
- **One command list** (`commands.ts`) feeds the toolbar, the slash menu, the block menu and the
  command palette, so a command has one name, icon and shortcut everywhere.
- **Loaded on demand.** The page screen is a lazy route, so Tiptap is not in the first download.
- *Not used:* Tiptap's link extension (needs an interface first), tables, and its Pro extensions.
- *Alternative:* Lexical or plain ProseMirror. Tiptap was fixed by PRD decision 3; plain ProseMirror
  would mean writing the same extensions by hand.

### D11. Pages are a view over one continuous document

In the paginated layout the document is unchanged. A plugin (`pagination.ts`) measures the top-level
blocks and draws a spacer, as a decoration, before any block that would cross the bottom margin.
Where the breaks fall is decided by a pure function (`paginate`), tested without a browser.

- *Why:* the stored document, search, word counts and block IDs do not depend on the paper size.
  Changing the paper never rewrites a page.
- *Rule that keeps it exact:* blocks have space below them only, never above, so the margins of two
  blocks never collapse and a block's position without spacers can be computed from its position
  with them.
- *Limits:* a block taller than a sheet is not split. Paper size and margins are application
  settings, not page fields. There is no print style sheet yet.

### D12. Search scans the workspace in memory

`features/search/search.ts` filters the workspace that `useWorkspace()` already holds: names, and
`plainText` for pages. No index is built or stored, so nothing can fall out of step with the data.

- *Cost:* linear in the amount of text, per key press. The folded (lower-case, accent-free) text of
  each page is cached per page object. Budget: under 50 ms at 5,000 pages. Not measured yet.
- *Planned:* the derived index of D1, when block links and backlinks need it (Milestone 7).

### D13. Drawing: our own engine on perfect-freehand

PRD decision 2 left the drawing library open. Evaluated on 2026-11-17 (versions from npm):

| Candidate | Licence | Size (unpacked) | Verdict |
| --- | --- | --- | --- |
| `drawfn` 0.0.3 | MIT | 650 kB | Pre-release, a few weeks old, one organisation. Too early to hold user drawings. |
| tldraw 5.6 | tldraw licence | 15.6 MB | Production use needs a licence key; without one it shows a watermark. Its own document store would sit beside ours. Rejected on licence. |
| Excalidraw 0.18 | MIT | 46.8 MB | Built for diagrams in a hand-drawn style, with its own interface and file format. No real pen pressure. Far too large for one block type. |
| perfect-freehand 1.2 + own engine | MIT | 112 kB, no dependencies | Chosen. Pressure-sensitive outlines from points; everything else is ours and small. |

How it is built (`features/drawing/`):

- **Strokes are data.** A stroke is a flat list of `x, y, pressure` points with a tool, an ink name
  and a width (DATA_MODEL.md). perfect-freehand only turns points into an outline when drawing.
  So strokes can be erased in part, selected, moved and scaled, and nothing is lost to pixels.
- **Pure geometry** (`geometry.ts`): outline, partial erase (a cut stroke becomes two), lasso hit
  test, bounds, move and scale, undo history. Unit-tested without a browser.
- **The block holds an ID, the table holds the strokes.** The page's document has a `drawing` node
  with a `drawingId`; the strokes are a row in `drawings`. Typing in the page never rewrites a
  drawing, and a big drawing does not slow the page's autosave. The drawing saves through the same
  autosaver as the page, so "Saved" means the same thing.
- **Copies.** A duplicated or pasted block gets a new drawing ID and a copy of the strokes (a plugin
  in `drawingNode.ts`, and a check in the block for blocks pasted from another page). Drawing in one
  copy never changes the other.
- **Lifetime.** Deleting the block keeps the row, so the editor's undo can bring the block back with
  its strokes. Rows go when their page is deleted permanently.
- **Input.** Pointer events with coalesced samples; real pressure from a pen, simulated from speed
  for mouse and touch. Once a pen is used, touch scrolls instead of drawing (palm rejection).
- **Inks are theme tokens** (`--tn-ink-*`), stored by name, so a drawing reads on every paper. The
  PNG export paints with the current theme's values.
- *Limits:* drawing happens in a full-screen editor; the page shows a preview. No shapes, text boxes
  or images on the canvas. Drawing itself needs a pointer: keyboard users can open, undo, redo,
  delete a selection and download, but not draw.

### D14. Writing atmosphere: settings as CSS variables, ruling on whole lines

Milestone 5. Everything here is presentation, so it lives in settings and stylesheets, not in pages.

- **Typography** (typeface, size, line spacing, column width) and **paper ruling** are app-wide
  settings. The page screen writes them as data attributes on `.tn-page`; `editor.css` turns them
  into variables (`--tn-text-font`, `--tn-text-size`, `--tn-leading`, `--tn-column`). One more,
  `--tn-line`, is one line of text: the pitch of the ruling. The settings screen's sample uses the
  same markup and styles, so it shows exactly what a page will.
- **Ruling** is one CSS background, a line high, on the text (continuous layout) or inside each
  sheet's margins (sheets). For it to sit under the text, every block must be a whole number of
  lines high. On ruled paper the stylesheet makes that so: block spacing is one line, headings and
  code blocks get line heights in whole lines, and a drawing's preview is rounded up with CSS
  `round()` and container units. No script measures anything. Where `round()` is missing (older
  browsers) the text below a drawing drifts off the rules; nothing else changes.
- **The sheets are measured again** when the typeface, size, spacing or ruling changes, and once
  more when the fonts have loaded, so page breaks follow the new line height.
- **Focus mode** is a state of the page screen, not a setting: it sets `data-focus` on the root,
  and the stylesheet hides everything marked `data-chrome` (sidebar, top bar, bottom bar, the
  page's breadcrumbs and tags) and the toolbar. Tiptap's Focus extension marks the top-level block
  holding the caret; the others fade when "Fade other blocks" is on. Escape is heard in the capture
  phase, because the editor's own keymap claims it; while a menu, the slash menu or a dialog is
  open, Escape is theirs.
- **Covers** are a finish name and an icon name. The patterns are CSS gradients in two tokens
  (`--tn-cover-light`, `--tn-cover-shade`) over the cover's colour; the title colour is still
  computed from that colour. No image is stored or loaded.
- **Sound machines** are parameter sets for one synthesiser (`MACHINES` in `typewriterSound.ts`):
  pitch, mass, ring time, body resonance, carriage length and bell pitch. A new machine is a new
  row, not new code. Still no audio files.
- **Words written** are counted by the page repository inside the save transaction
  (`writingDays`, DATA_MODEL.md). The dashboard reads them; nothing is sent anywhere.

### D15. PDFs and recordings: files beside pages, PDF.js behind a wrapper

Milestone 6.

- **A file is two rows.** `attachments` holds the details, `attachmentData` the bytes, written
  together and never changed. Lists (Files, a block) read details only.
- **Blocks name files; files do not name pages.** Where a file is used is read from the pages'
  documents (`attachmentIdsIn`). So moving, duplicating or pasting a block needs no bookkeeping, and
  two blocks may share a file. The cost is a scan of all pages when deleting a file or purging pages.
- **Deletion is never a side effect of editing.** Removing a block keeps the file (undo works). A
  file goes only when the user deletes it from Files (refused while any page, even in the Trash,
  uses it) or when the last page that used it is purged, both behind a confirmation.
- **PDF.js** is imported only by `services/pdf.ts`, and only on first use, with its worker as a
  separate file. Its data files (fonts, character maps, colour profiles, image decoders) are copied
  into `dist/pdfjs/` by a small Vite plugin and served from `node_modules` in development; the
  scripting sandbox is left out, and XFA forms are off. The reader paints a page only when it is
  within one and a half screens and releases the canvas when it leaves, so memory stays bounded for
  long PDFs.
- **Highlights are geometry plus text.** The text layer is PDF.js's own. A selection's screen
  rectangles are clipped to the page, merged per line and stored as fractions of the page
  (`highlights.ts`, pure and unit-tested), so they fit at any zoom. They are drawn under the text
  layer with `mix-blend-mode: multiply`, in the theme's ink colours. A PDF page itself stays white in
  every theme (`--tn-pdf-paper`).
- **Recording** uses MediaRecorder at 64 kbit/s and keeps pieces in memory until stopped; the time
  shown and stored is measured without pauses. Formats are chosen in order (Opus in WebM or Ogg, AAC
  in MP4). The player seeks to the end once to learn a WebM recording's length, which browsers do
  not know until they have read it.
- **Backups** hold the bytes as base64 (format 2), validated like all input (D7). The 400 MB limit
  is checked when a backup is made, so a backup that could not be restored is never produced.
- *Alternatives:* storing files as Blobs (fine in current browsers, but ArrayBuffers are the safest
  across engines and test tools); a zipped backup (better, needs a dependency; planned); pdf.js's
  full viewer (`web/pdf_viewer`), which brings its own interface and styles, rejected.

## Security and privacy posture

- No network requests after load. No analytics, no third-party scripts, fonts bundled.
- No authentication, sessions, secrets or server: those rulebook sections are **not applicable**.
- Data at rest is **not encrypted**. The interface says so. An "application lock" will not be offered until real key management is designed (specification §26).
- Retention: user data is kept until the user deletes it. Trash is never purged automatically. Safety snapshots: the last 3 are kept.
- Supply chain: lockfile committed, CI installs with `npm ci`, direct dependencies checked for licence and maintenance at kickoff.

## Known limits and debt

| Item | Note |
| --- | --- |
| ESLint has no type-aware rules | It parses TypeScript with Babel, because typescript-eslint needs the TypeScript 5/6 compiler API and the project uses TypeScript 7. Move to typescript-eslint when it supports 7. |
| Ruled paper aligns only blocks the stylesheet knows (text, headings, lists, quotes, code, dividers, drawings) | A future block type must be given whole-line heights, or the text below it drifts off the rules (D14). |
| A drawing whose block was deleted stays until its page is deleted permanently | Needed for undo (D13). Page purge is the only cleanup. |
| Finding where files are used scans every page's document | On each change in Files, and on file delete and page purge. Fine for thousands of pages; measure with D3. |
| No service worker | The app needs the network to load. PWA and offline shell are Milestone 8. |
| Initial JS is 527 kB (165 kB gzip); the editor and drawing are a second file of 494 kB (159 kB gzip), loaded with the first page; the reader is 14 kB, PDF.js 444 kB (134 kB gzip) and its worker 1.3 MB, loaded with the first PDF | The page and file screens are split out. Budget for Milestone 8: initial JS under 200 kB gzip. |
| Sidebar is not resizable | It collapses to icons. Resizable panels are deferred. |
| Tooltips are native `title` | No custom tooltip component yet. Icon-only buttons also carry `aria-label`. |
| Backup is a single JSON string in memory, files as base64 | Since 0.6.0 it carries PDFs and recordings: a third larger than the files, and capped at 400 MB (a browser string limit). A zipped, streamed format is the fix before files grow common. A "replace" restore's safety snapshot is a full copy, files included. |
| Two tabs editing the same page | Last write wins. No conflict prompt yet. An open editor does not show the other tab's changes until reload. |
| Dialog components and React StrictMode | A dialog that is mounted already open must not close itself from the native `close` event: in development React runs its effect twice. The command palette listens to `cancel` instead. `Dialog` and the drawer are always mounted, so they are not affected. |
| All font subsets are emitted | Only the needed ones are fetched by the browser, but `dist/` carries all of them. |
