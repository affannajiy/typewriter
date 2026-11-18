# Architecture

TypeNote is a static single-page application. There is no server. All data is in the IndexedDB of the browser.

## Stack

Versions as installed at kickoff (2026-11-16). `package-lock.json` pins them.

| Layer | Choice | License |
| --- | --- | --- |
| Framework | React 19 | MIT |
| Language | TypeScript 7, strict, `noUncheckedIndexedAccess` | Apache-2.0 |
| Build | Vite 8 | MIT |
| Styling | Tailwind CSS 4 over CSS-variable tokens | MIT |
| Routing | React Router 8, hash mode | MIT |
| Database | Dexie 4 on IndexedDB, `dexie-react-hooks` | Apache-2.0 |
| Editor | Tiptap 3 (ProseMirror): core, React binding, starter kit, list, extensions, suggestion | MIT |
| Drawing | perfect-freehand 1.2 (stroke outlines only), with our own engine (D13) | MIT |
| PDF | PDF.js (`pdfjs-dist`) 6.5, loaded when the first PDF opens (D15) | Apache-2.0 |
| Equations | KaTeX 0.19, loaded with the editor (D16) | MIT |
| Offline | `vite-plugin-pwa` 2.0 with Workbox 7.4, build time only (D17) | MIT |
| Icons | Lucide | ISC |
| Fonts | Inter, Lora, Cormorant Garamond, JetBrains Mono via Fontsource, bundled | OFL-1.1 |
| Tests | Vitest 5, React Testing Library, fake-indexeddb, Playwright | MIT / Apache-2.0 |
| Lint | ESLint 9 with jsx-a11y and react-hooks, parsed by `@babel/eslint-parser` | MIT |

Runtime dependencies: 22 packages (9 at kickoff).

- Tiptap is 8 of the new packages, all from one project at one version.
- perfect-freehand has no dependencies.
- KaTeX has one dependency, commander, for its command line. It never gets into the browser build.
- pdfjs-dist lists `@napi-rs/canvas` as an optional Node dependency. npm installs it. The browser build never loads it.
- ts-fsrs was removed with the flashcards in 0.8.0 (D18).
- `npm audit`: 0 vulnerabilities on 2026-11-17. After vite-plugin-pwa: one moderate advisory in `minimatch` under `workbox-build`, a build tool that is not shipped.

## Layers

```
src/
  app/            App root: database open, error boundary, routes
  components/
    ui/           Reusable controls: Button, Dialog, Menu, Field, Toast, layout pieces
    navigation/   AppShell: the slim icon rail, the phone top bar and bottom bar
  features/       One folder per screen or concern
    pages/  trash/  settings/
    library/      Home: search field, notebooks shelf, loose pages; one notebook
    editor/       Rich text: schema, block IDs, commands, toolbar, slash menu, pagination, find in page
    drawing/      Drawing engine (geometry), drawing block, full-screen editor, PNG export
    files/        PDF and recording blocks, PDF reader, highlight geometry
    search/       Search over everything, results list, command palette
    typing/       Typing test: passages, scoring, screen
    organisation/ Shared item rows, menus, dialogs, actions
  hooks/          useData.ts: live queries over repositories
  database/
    db.ts         Dexie schema and versions
    legacy.ts     Converts pre-0.8.0 data, for the upgrade and the backup reader
    repositories/ All reads and writes of user data
    backup/       Backup format, validation, restore
  services/       autosave, storage facts, PDF.js wrapper (pdf.ts), PDF text reading (pdfIndex.ts), recorder, KaTeX (math.ts), sounds (typewriterSound.ts, carriage.ts)
  i18n/           en.ts: all interface strings
  styles/         tokens.css (themes), index.css (Tailwind mapping)
  types/          models.ts: the data model
  utils/          color, dates, errors
e2e/              Playwright journeys
```

### Rules

1. **Components never touch IndexedDB.** They call repository functions, or read through the hooks in `hooks/useData.ts`. Only `database/` imports `db`. (`app/App.tsx` calls `db.open()` once, to find unavailable storage.)
2. **Repositories own the data rules:** name cleanup, valid locations, revision bumps. Each multi-step write is one transaction.
3. **Expected failures are typed** (`RepositoryError`, `BackupError`). One place, `utils/errors.ts`, turns them into user messages. Unexpected failures get a generic message. Details go only to the console.
4. **No raw colors or strings in components.** Colors come from tokens, text from `i18n/en.ts`.
5. **Native elements first.** Dialogs are `<dialog>`, choices are radio inputs, links are links. The one custom ARIA widget is `Menu`. It has the full menu-button keyboard pattern and tests.

## Decisions

Each record gives the context and the alternatives, so that we can examine it again later.

### D1. One document per page, not one row per block

The page body is one Tiptap/ProseMirror JSON document in `pages.content`. Blocks have stable IDs as node attributes (D10). Each save derives `pages.plainText` for search.

- *Why:* one atomic write per save, no ordering bugs, undo stays in the editor.
- *Alternative:* a `blocks` table. It is closer to the entity list in the specification and easier for per-block sync, but each save becomes a multi-row diff.
- *Consequence:* anything that needs the blocks of all pages (search) reads the documents (D12).

### D2. Soft delete with trash batches

A delete sets `deletedAt` and a shared `trashBatchId` on the item and its descendants. Restore and purge work on the batch. The batch root is the item whose parent is outside the batch, so no extra table is necessary.

- *Consequence:* only `purgeBatch()` and `emptyTrash()` remove rows, and both need a confirmation.

### D3. Whole-workspace live query

`useWorkspace()` loads all live notebooks and pages and filters in memory.

- *Why:* the simplest correct design. Navigation is instant.
- *Cost:* grows linearly with the item count, and page rows include their content. Measure before the end of Milestone 8. The planned fix is to move page content to its own table, so that the index stays small. Budget: workspace read under 100 ms at 5,000 pages.

### D4. Settings: one row per key, validated on read

`resolveSettings()` examines each stored value and uses the default if the value is bad. Thus a damaged or imported value cannot break the app. Theme, accent, density and motion are also copied to `localStorage`, only so that the first paint uses the correct theme. Each apply writes the copy again. The database wins.

### D5. Themes are attribute-scoped token sets

`data-theme` on `<html>` selects a block in `styles/tokens.css`. A test reads that file and checks WCAG contrast for every theme. Paper uses separate `--tn-paper-*` tokens, so interface theme and paper are independent. Density scales the Tailwind spacing unit. Motion is one duration token. It is zero when animations are off or the system asks for reduced motion.

### D6. Hash routing and a configurable base

`HashRouter` plus `TYPENOTE_BASE` (default `/typewriter/`). This works on GitHub Pages without a `404.html` redirect, and on Vercel with `TYPENOTE_BASE=/`.

### D7. Backup files are untrusted input

`database/backup/validate.ts` rebuilds each record from an allowlist of fields, with type, length and format checks. Colors must be 6-digit hex. Document depth has a limit. Prototype keys are rejected. The app refuses an invalid file as a whole. After a merge, `repairReferences()` makes each page whose notebook is missing into a loose page, and reports the count. A file from before 0.8.0 goes through `database/legacy.ts`. Its folders, tags, cards and writing days are not read (D18).

### D8. Content Security Policy

The production build adds a CSP meta tag: everything `'self'`, no inline scripts, no remote connections.

- `style-src` allows `'unsafe-inline'`, because user-chosen colors are style attributes. The app validates these values as hex before it stores them.
- A meta-tag CSP cannot set `frame-ancestors`. That needs a header, and GitHub Pages does not let us set headers.
- Since 0.6.0: `media-src 'self' blob:` (recordings play from object URLs made from stored bytes), `worker-src 'self'` (the PDF.js worker is a file of the app), and `'wasm-unsafe-eval'` in `script-src`, so that PDF.js can compile its bundled image decoders. This allows WebAssembly only. JavaScript `eval` stays forbidden.
- The build never inlines fonts as `data:` URLs (`assetsInlineLimit`), because `font-src` is `'self'`. Before 0.6.0, the build inlined one JetBrains Mono subset and the CSP blocked it in production. The new end-to-end CSP check found this.

### D9. Typewriter sounds are synthesized, not recorded

`src/services/typewriterSound.ts` builds each sound from filtered noise and short tones with the Web Audio API. There are no audio files to download, cache offline or license. The trade-off is realism. Recorded sound packs can come later, behind the same `playTypewriterSound(kind, volume, detail)` call.

- Sounds are chosen from `InputEvent.inputType`, not from key codes. Thus on-screen keyboards work, and the editor can change freely.
- Sounds are on by default since 0.8.0 (off before). The app ignores audio failures: sound must never interrupt writing.
- Each sound is a short sequence of the events in a manual typewriter (lever, slug, typebar, escapement, rack, stop), not one sample. All voices go through one bus, a short convolution "body", a volume gain and a limiter. `renderTypewriterSound` renders a sound offline, so that tests can measure levels without listening.
- The margin bell and the wrap need the position of the caret on its visual line. `src/services/carriage.ts` reads it from the editor layout (`measureCaret`: the caret coordinates in its text block). A pure function (`carriageEvents`) makes the decision. The app measures only while sounds are on.
- `features/pages/useTypewriter.ts` turns an edit into sounds. `features/editor/RichEditor.tsx` tells it about each edit. The edit comes from the `beforeinput` event, or from the key for Enter and the delete keys (the editor often handles those itself). It is then matched with the next change of the editor. The `input` event does not work for this: the editor reads the changed text between two listeners of that event, so the note arrives after the change it describes.

### D10. The editor is Tiptap, in one feature folder

Only `features/editor/` imports Tiptap at run time. The page screen gives it a document and gets documents back.

- **One schema list.** `schemaExtensions()` defines the node and mark types. The editor, the readable-document check and the tests all use it.
- **Unknown content is never dropped.** ProseMirror discards what its schema does not know, and the next autosave would store the loss. `isReadableDoc()` examines a stored document first. If the check fails, the page opens read-only and shows the stored plain text.
- **Block IDs** are a node attribute (D1). Old documents get IDs when they load. A small plugin (`blockIds.ts`) keeps the IDs unique. Each whole-block action (`blocks.ts`) starts its own undo step.
- **One command list** (`commands.ts`) feeds the toolbar, slash menu, block menu and command palette. Thus a command has one name, icon and shortcut everywhere.
- **Loaded on demand.** The page screen is a lazy route, so Tiptap is not in the first download.
- *Not used:* the Tiptap link extension (it needs an interface first), tables, Pro extensions.
- *Alternative:* Lexical or plain ProseMirror. PRD decision 3 set Tiptap. With plain ProseMirror, we would write the same extensions by hand.

### D11. Pages are a view over one continuous document

In the paginated layout the document does not change. A plugin (`pagination.ts`) measures the top-level blocks. Before each block that would cross the bottom margin, it draws a spacer as a decoration. A pure function (`paginate`) decides where the breaks go. Tests run it without a browser.

- *Why:* the stored document, search, word counts and block IDs do not depend on the paper size. A paper change never rewrites a page.
- *Rule that keeps it exact:* blocks have space below them only, never above. Thus the margins of two blocks never collapse, and the position of a block without spacers follows from its position with spacers.
- *Limits:* a block taller than a sheet is not split. Paper size and margins are app settings, not page fields. There is no print style sheet yet.

### D12. Search scans the workspace in memory

`features/search/search.ts` scans notebook names, page titles, the `plainText` of each page, and the stored text of each PDF that a live page shows (`useSearchSource()`). There is no index, so nothing can get out of step with the data. Since 0.8.0 it returns each match with its position in the original text (folding can change the length: "ﬁ" folds to two letters), groups results by notebook, and gives snippets with marked matches.

- *PDF text* is the one thing stored for search. PDF.js reads it once per file, in the background when the browser is idle (`services/pdfIndex.ts`), into the `pdfTexts` table. It is derived data: not in backups, read again after a restore, deleted with its file.
- *Find in page* (`editor/findInPage.ts`) is a ProseMirror plugin: decorations over the matches, found again after each edit, plus a current match. It never changes the document or the selection, so it does not touch undo or the typewriter carriage.
- *Cost:* linear in the amount of text, per key press. The folded (lowercase, accent-free) text of each page is cached per page object. Budget: under 50 ms at 5,000 pages. Not measured yet.

### D13. Drawing: our own engine on perfect-freehand

PRD decision 2 left the drawing library open. We compared these on 2026-11-17 (versions from npm):

| Candidate | License | Size (unpacked) | Verdict |
| --- | --- | --- | --- |
| `drawfn` 0.0.3 | MIT | 650 kB | Pre-release, a few weeks old, one organization. Too early to hold user drawings. |
| tldraw 5.6 | tldraw license | 15.6 MB | Production use needs a license key. Without one it shows a watermark. Its own document store would sit beside ours. Rejected on license. |
| Excalidraw 0.18 | MIT | 46.8 MB | Made for diagrams in a hand-drawn style, with its own interface and file format. No real pen pressure. Much too large for one block type. |
| perfect-freehand 1.2 + own engine | MIT | 112 kB, no dependencies | Chosen. Pressure-sensitive outlines from points. All else is ours and small. |

Design (`features/drawing/`):

- **Strokes are data.** A stroke is a flat list of `x, y, pressure` points with a tool, an ink name and a width (DATA_MODEL.md). perfect-freehand only turns points into an outline for drawing. Thus strokes can be partly erased, selected, moved and scaled, and nothing is lost to pixels.
- **Pure geometry** (`geometry.ts`): outline, partial erase (a cut stroke becomes two), lasso hit test, bounds, move and scale, undo history. Unit tests run it without a browser.
- **The block holds an ID, the table holds the strokes.** The page document has a `drawing` node with a `drawingId`. The strokes are a row in `drawings`. Typing in the page never rewrites a drawing, and a big drawing does not slow the page autosave. The drawing saves through the same autosaver as the page, so "Saved" means the same thing.
- **Copies.** A duplicated or pasted block gets a new drawing ID and a copy of the strokes (a plugin in `drawingNode.ts`, and a check in the block for blocks pasted from a different page). A change in one copy never changes the other.
- **Lifetime.** When the user deletes the block, the row stays, so editor undo can bring back the block with its strokes. The row goes when its page is deleted permanently.
- **Input.** Pointer events with coalesced samples. Real pressure from a pen, simulated from speed for mouse and touch. After a pen is used, touch scrolls and does not draw (palm rejection).
- **Inks are theme tokens** (`--tn-ink-*`), stored by name, so a drawing is legible on every paper. The PNG export paints with the values of the current theme.
- *Limits:* drawing happens in a full-screen editor. The page shows a preview. No shapes, text boxes or images on the canvas. Drawing needs a pointer: keyboard users can open, undo, redo, delete a selection and download, but not draw.

### D14. Writing atmosphere: settings as CSS variables, ruling on whole lines

Milestone 5. All of this is presentation, so it is in settings and stylesheets, not in pages.

- **Typography** (typeface, size, line spacing, column width) and **paper ruling** are app-wide settings. The page screen writes them as data attributes on `.tn-page`. `editor.css` turns them into variables (`--tn-text-font`, `--tn-text-size`, `--tn-leading`, `--tn-column`). `--tn-line` is one line of text: the pitch of the ruling. The sample on the settings screen uses the same markup and styles, so it shows exactly what a page will show.
- **Ruling** is one CSS background, one line high, on the text (continuous layout) or inside the margins of each sheet (sheets). For the ruling to sit under the text, each block must be a whole number of lines high. On ruled paper the stylesheet does this: block spacing is one line, headings and code blocks get line heights in whole lines, and the preview of a drawing is rounded up with CSS `round()` and container units. No script measures anything. Where `round()` is missing (older browsers), the text below a drawing moves off the rules. Nothing else changes.
- **The sheets are measured again** when the typeface, size, spacing or ruling changes, and again after the fonts load. Thus page breaks follow the new line height.
- **Focus mode** is a state of the page screen, not a setting. It sets `data-focus` on the root. The stylesheet then hides all elements marked `data-chrome` (sidebar, top bar, bottom bar, page breadcrumbs) and the toolbar. The Tiptap Focus extension marks the top-level block that holds the caret. The other blocks fade when "Fade other blocks" is on. The app listens for Escape in the capture phase, because the editor keymap takes it. While a menu, the slash menu or a dialog is open, Escape goes to them.
- **Covers** are a finish name and an icon name. The patterns are CSS gradients in two tokens (`--tn-cover-light`, `--tn-cover-shade`) over the cover color. The title color is calculated from that color. No image is stored or loaded.
- **Sound machines** are parameter sets for one synthesizer (`MACHINES` in `typewriterSound.ts`): pitch, mass, ring time, body resonance, carriage length, bell pitch. A new machine is a new row, not new code.

### D15. PDFs and recordings: files beside pages, PDF.js behind a wrapper

Milestone 6.

- **A file is two rows.** `attachments` holds the details, `attachmentData` holds the bytes. The app writes them together and never changes them. A block reads the details only.
- **Blocks name files. Files do not name pages.** The app finds where a file is used from the page documents (`attachmentIdsIn`). Thus moving, duplicating or pasting a block needs no bookkeeping, and two blocks can share a file. The cost is a scan of all pages when a file is deleted or pages are purged.
- **Editing never deletes a file.** When the user removes a block, the file stays (undo works). A file goes only when the last page that used it is purged, after a confirmation. (Until 0.8.0 the Files screen could also delete an unused file.)
- **PDF.js** is imported only by `services/pdf.ts`, only at first use, with its worker as a separate file. A small Vite plugin copies its data files (fonts, character maps, color profiles, image decoders) into `dist/pdfjs/`. In development they come from `node_modules`. The scripting sandbox is left out, and XFA forms are off. The reader paints a page only when it is within one and a half screens, and releases the canvas when it leaves. Thus memory stays bounded for long PDFs.
- **Highlights are geometry plus text.** The text layer is from PDF.js. The screen rectangles of a selection are clipped to the page, merged per line, and stored as fractions of the page (`highlights.ts`, pure, with unit tests). Thus they fit at any zoom. They are drawn under the text layer with `mix-blend-mode: multiply`, in the ink colors of the theme. A PDF page stays white in every theme (`--tn-pdf-paper`).
- **Recording** uses MediaRecorder at 64 kbit/s and keeps the pieces in memory until stop. The time that the app shows and stores does not include pauses. Format order: Opus in WebM or Ogg, then AAC in MP4. Browsers do not know the length of a WebM recording until they read all of it, so the player seeks to the end once.
- **Backups** hold the bytes as base64 (format 2 and later), validated like all input (D7). The app checks the 400 MB limit when it makes a backup, so it never makes a backup that it cannot restore.
- *Alternatives:* files as Blobs (fine in current browsers, but ArrayBuffers are the safest across engines and test tools). A zipped backup (better, needs a dependency, planned). The full PDF.js viewer (`web/pdf_viewer`), which brings its own interface and styles: rejected.

### D16. Equations (Milestone 7)

Milestone 7 also added page links, backlinks, a graph and FSRS flashcards. 0.8.0 removed them (D18). Their design is in the 0.7.0 version of this file in git history.

- **Equations are atoms that hold LaTeX.** `mathInline` and `mathBlock` store only the source. KaTeX draws them each time (`services/math.ts`, the only importer, with a small cache). The user edits the source in a dialog, so it never mixes with the page text, and editor undo covers the change.
- **Safe rendering.** KaTeX runs with `trust: false` (no links, classes, styles or ids from the formula), `throwOnError` (an unreadable formula shows its source and the reason, never half a drawing), and size and macro limits. It writes MathML for screen readers. Its fonts and styles are files of the app, so the CSP did not change.
- **Loading.** The renderer (`MathRender.tsx`) is separate from the editor node view. KaTeX (264 kB) loads with the editor.
- *Alternatives:* the Tiptap mathematics extension (same rendering, but it edits in place and mixes the source with the page text). MathJax (larger, and slower to draw many formulas).

### D17. Offline: a precaching service worker, updates on request

- **What.** `vite-plugin-pwa` with Workbox `generateSW`. At build time it lists every file in `dist/` (scripts, styles, fonts, icons, and the PDF.js worker, fonts, character maps and decoders). It writes `sw.js`, which stores all of them on the first visit. After that, every screen, the editor and the PDF reader open with no network. A web manifest and icons make the app installable.
- **Why precache everything.** The app has no server data. When the files are stored, the app is complete. If we cache only what was opened, the PDF reader or the typing test would fail offline the first time someone needs it. Cost: about 6.5 MB and 320 files on the first visit, most of it PDF.js (worker 1.3 MB, character maps 1.5 MB, decoders 1.4 MB) and all font subsets.
- **Updates wait for the person.** `registerType: 'prompt'`: a new version installs in the background, and a toast tells that it is ready, with Reload. Nothing reloads automatically, so an update never interrupts writing. A toast also tells once that the app is ready to work offline.
- **User data does not go through the worker.** It is in IndexedDB. The worker serves only the files of the app. It makes no requests to other sites (the CSP forbids them).
- *Alternatives:* a hand-written service worker (the file list changes with each build and must match the hashed names). `autoUpdate` (reloads the page while the person writes). Caching on first use (fails offline for anything not yet opened).

### D18. The 0.8.0 revamp: a typewriter notepad

The owner made the product smaller (PRD.md, "The 0.8.0 revamp"). Removed: dashboard, streaks and goal, words-written log, flashcards, graph, tags, folders, page links, Files screen. Added: search over everything and a typing test.

- *Data:* schema version 6 deletes the six removed tables and the removed settings, removes `folderId` and `tagIds` from notebooks and pages, and turns each page link into the text of its title. Nothing that a person wrote in a page is lost. A notebook from a folder goes on the shelf. A page from a folder becomes a loose page. The same conversion (`database/legacy.ts`) reads old backups, so a 0.7.0 backup and a 0.7.0 database give the same result.
- *Why delete and not hide:* each future version would have to keep hidden tables valid and carry them in each backup, for features that are gone. The changelog tells people to keep a 0.7.0 backup if they want that data.
- *Typing test:* a real (invisible) text field gets the keys, so phone keyboards and input methods work. The passage is drawn letter by letter over it. It uses the page typewriter sounds through `useTypewriter`. Nothing is stored, by design: no history, no best score.
- *Frame:* the rail fades through a `data-typing` attribute on the root. A key that types a character in a page sets it. Any pointer movement clears it. Focus in the rail keeps the rail visible.

## Security and privacy

- No network requests after load. No analytics, no third-party scripts, bundled fonts.
- No authentication, sessions, secrets or server. Those rulebook sections are **not applicable**.
- Data at rest is **not encrypted**. The interface tells the user. There will be no "application lock" until real key management has a design (specification §26).
- Retention: user data stays until the user deletes it. The Trash is never purged automatically. The app keeps the last 3 safety snapshots.
- Supply chain: the lockfile is committed, CI installs with `npm ci`, and direct dependencies were checked for license and maintenance at kickoff.

## Known limits and debt

| Item | Note |
| --- | --- |
| ESLint has no type-aware rules | It parses TypeScript with Babel, because typescript-eslint needs the TypeScript 5/6 compiler API and the project uses TypeScript 7. Move to typescript-eslint when it supports 7. |
| Ruled paper aligns only the blocks that the stylesheet knows (text, headings, lists, quotes, code, dividers, drawings, equations, file cards) | A new block type must get whole-line heights, or the text below it moves off the rules (D14). |
| An equation block on ruled paper | At least two lines high. A taller formula pushes the text below off the rules (D14). Inline fractions make their line taller. |
| A drawing whose block was deleted stays until its page is deleted permanently | Necessary for undo (D13). Page purge is the only cleanup. |
| A file that no page uses stays until a page that used it is purged | Since 0.8.0 there is no screen that shows or deletes it (D15). |
| Finding where files are used scans the document of each page | On page purge and on file delete. Fine for thousands of pages. Measure with D3. |
| The first visit stores about 6.5 MB | Every file is precached (D17), PDF.js data and all font subsets included, also for someone who never opens a PDF. On a slow connection "ready to work offline" takes some time. |
| Bundle sizes | Initial JS 546 kB (173 kB gzip). Editor and drawing: a second file of 506 kB (163 kB gzip), loaded with the first page. KaTeX 264 kB (79 kB gzip), with the editor. Reader 14 kB. PDF.js 444 kB (134 kB gzip) and its worker 1.3 MB, with the first PDF. Budget for Milestone 8: initial JS under 200 kB gzip. |
| Backup is one JSON string in memory, files as base64 | It is a third larger than the files, with a limit of 400 MB (a browser string limit). The fix is a zipped, streamed format, before files become common. The safety snapshot of a "replace" restore is a full copy, files included. |
| Two tabs edit the same page | The last write wins. No conflict prompt yet. An open editor does not show the changes of the other tab until reload. |
| Dialogs and React StrictMode | A dialog that mounts already open must not close itself from the native `close` event, because React runs its effect twice in development. The command palette listens to `cancel`. `Dialog` and the drawer are always mounted, so they are not affected. |
| All font subsets are emitted | `dist/` has all of them. Since D17 the service worker stores all `.woff2` subsets (not the `.woff` fallbacks). |
| Tooltips are native `title` | No custom tooltip component yet. Icon-only buttons also have `aria-label`. |
