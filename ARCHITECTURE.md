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
| Icons | Lucide | ISC |
| Fonts | Inter, Lora, Cormorant Garamond, JetBrains Mono via Fontsource, bundled | OFL-1.1 |
| Tests | Vitest 5, React Testing Library, fake-indexeddb, Playwright | MIT / Apache-2.0 |
| Lint | ESLint 9 with jsx-a11y and react-hooks, parsed by `@babel/eslint-parser` | MIT |

Runtime dependencies: 18 packages (9 at kickoff; Tiptap is 8 of the new ones, all from one
project and one version). `npm audit` reports 0 vulnerabilities (2026-11-16).

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
    search/       Global search and the command palette
    organisation/ Shared item rows, menus, dialogs, actions
  hooks/          useData.ts: live queries over repositories
  database/
    db.ts         Dexie schema and versions
    repositories/ All reads and writes of user data
    backup/       Backup format, validation, restore
  services/       autosave, storage facts
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
| No service worker | The app needs the network to load. PWA and offline shell are Milestone 8. |
| Initial JS is 483 kB (152 kB gzip); the editor is a second file of 452 kB (145 kB gzip), loaded with the first page | Only the page screen is split out. Budget for Milestone 8: initial JS under 200 kB gzip. |
| Sidebar is not resizable | It collapses to icons. Resizable panels are deferred. |
| Tooltips are native `title` | No custom tooltip component yet. Icon-only buttons also carry `aria-label`. |
| Backup is a single JSON string in memory | Fine for text. Binary attachments (Milestone 6) need a streamed or zipped format. |
| Two tabs editing the same page | Last write wins. No conflict prompt yet. An open editor does not show the other tab's changes until reload. |
| Dialog components and React StrictMode | A dialog that is mounted already open must not close itself from the native `close` event: in development React runs its effect twice. The command palette listens to `cancel` instead. `Dialog` and the drawer are always mounted, so they are not affected. |
| All font subsets are emitted | Only the needed ones are fetched by the browser, but `dist/` carries all of them. |
