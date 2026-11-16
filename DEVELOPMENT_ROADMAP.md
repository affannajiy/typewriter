# Development Roadmap and Implementation Checklist

**Last updated:** 2026-11-16 · **Version:** 0.3.0

Status words: **Not started**, **In progress**, **Implemented** (works, not yet covered by an
automated test), **Tested** (works and has automated tests), **Blocked**.

| Milestone | State |
| --- | --- |
| 1 Foundation | Done, with the gaps listed below |
| 2 Database and organisation | Done, with the gaps listed below |
| 3 Writing editor | Done, with the gaps listed below |
| 4 Drawing | Not started (next) |
| 5 Writing atmosphere | In progress: typewriter sounds done early, at the owner's request |
| 6 PDF and audio | Not started |
| 7 Study features | Not started |
| 8 Polish and deployment | Not started (the deploy workflow exists but has never run) |

## Milestone 1 — Foundation

| Item | Status | Note |
| --- | --- | --- |
| React, TypeScript, Vite | Tested | Typecheck and production build pass |
| Tailwind CSS | Tested | v4, mapped to tokens |
| Design tokens | Tested | Contrast test for all six themes |
| Themes: Classic Atelier, Dark Academia, Minimalist, Forest, Midnight, Rose | Tested | Plus "Match system" |
| Custom accent colour | Tested | Readable text colour is computed; a weak accent shows a warning |
| Interface density, animation toggle, reduced motion | Implemented | Applied through tokens; no visual regression test |
| Responsive layout: sidebar, drawer, bottom bar | Tested | No-horizontal-scroll test on desktop and a 412 px phone |
| Routing | Tested | Hash routes, deep link and reload under the base path |
| Components: Button, IconButton, TextField, TextArea, SearchField, Card, Dialog, ConfirmDialog, Menu, Toast, Breadcrumbs, Segmented control, EmptyState, status indicator | Tested / Implemented | Button, Menu and ConfirmDialog have component tests. SearchField is built but not used: search lives in the command palette |
| Components: Toolbar, Content blocks | Tested | Arrived with the editor (Milestone 3) |
| Components: Tabs, Tooltip, Context menu, Floating action menu | Not started | Tooltips are native `title` for now |
| Resizable panels | Not started | Sidebar collapses to icons instead |
| Typography settings (font, size, line height, width) | Not started | Milestone 5 |
| Fonts bundled locally | Implemented | Inter, Lora, Cormorant Garamond. JetBrains Mono comes with code blocks |
| Centralised strings, logical CSS properties, `lang` and `dir` | Implemented | English only. RTL not tested |

## Milestone 2 — Database and organisation

| Item | Status | Note |
| --- | --- | --- |
| Dexie schema v1, repository layer | Tested | |
| Migrations | Implemented | Mechanism and rules documented. No migration exists yet, so none is tested |
| Folders: create, rename, nest, move, reorder | Tested | Cycle prevention tested |
| Notebooks: create, edit details, cover colour, move, reorder, favourite, tags | Tested | |
| Pages: create anywhere, move, reorder, favourite, pin, tags | Tested | |
| Tags: create, rename, recolour, delete, browse by tag | Tested (repository) / Implemented (screen) | |
| Favourites and pinned on the dashboard | Implemented | |
| Recently opened, recently modified | Implemented | |
| Autosave with honest status | Tested | "Saved" only after the write resolves; failure keeps the text and offers retry |
| Force save (Ctrl/Cmd + S), save on tab hide, warn on close while unsaved | Implemented | Not covered by an automated test |
| Trash: subtree delete, undo, restore, permanent delete with confirmation | Tested | Unit and end-to-end |
| Backup: full JSON export | Tested | End-to-end download test |
| Restore: validation, duplicate detection, three modes, atomic, undo for replace | Tested | Includes a mid-restore failure test |
| Storage usage, persistence request, low-storage warning | Implemented | Depends on the browser; not automated |
| Storage unavailable screen, error boundary | Implemented | Not automated |
| Drag and drop | Not started | "Move to…" and "Move up/down" are the working alternative |
| Notebook icon and accent colour | Not started | Milestone 5 |
| Bookshelf and list views | Implemented | |
| Dashboard customisation, quick capture, study corner, statistics | Not started | Milestones 5 to 8 |
| Global search | Tested | See Milestone 3 |
| Templates | Not started | Release 1.1 |
| Markdown export, PDF export | Not started | The editor's document model now exists |
| Backup reminders | Not started | Last backup date is shown in Settings |

**Acceptance (create, organise, save, close, reopen without loss):** met, proven by the
end-to-end test "a workspace survives closing and reopening the app".

## Milestone 3 — Writing editor

| Item | Status | Note |
| --- | --- | --- |
| Tiptap 3 in the page screen | Tested | Replaces the textarea. Pages written before load unchanged, with no migration (unit test) |
| Opening a page is not an edit | Tested | The editor reports no change on opening, so `updatedAt` and `rev` stay |
| A page this version cannot show is read-only | Tested (the check) / Implemented (the screen) | Unknown node or mark types are never dropped and saved over. The stored text is shown instead |
| Formatting: headings 1 to 3, bold, italic, underline, strikethrough, inline code, bulleted, numbered and check lists, quote, code block, divider | Tested | Toolbar, shortcuts, and typed shortcuts such as `- ` and `# ` |
| Toolbar | Tested | One tab stop, arrow keys inside. Scrolls sideways on a narrow screen |
| Stable block IDs | Tested | Kept through edits, moves, type changes, undo and reload; a split or a copy gets a new ID |
| Block menu: move up and down, duplicate, delete, turn into | Tested | Acts on the top-level block that holds the caret. Delete offers Undo |
| Slash-command menu | Tested | End-to-end and unit. Off inside code |
| Shortcuts | Tested (bold, move block, undo, Ctrl/Cmd + K) / Implemented (the rest) | The others come from Tiptap and are shown in the toolbar's tooltips and in the palette |
| Command palette (Ctrl/Cmd + K) | Tested | Search, go to a screen, new page, formatting commands for the open page |
| Global search over names and page text | Tested | Every word must match; case and accents ignored; name matches first. The Trash is not searched |
| Continuous and paginated layouts | Tested | Chosen per page, under the page. Stored in `pages.layout` |
| Paper size (A4, Letter, A5) and margins (narrow, normal, wide) | Tested | In Settings. One choice for all pages |
| Typewriter sounds in the editor | Tested | Same end-to-end journey as before, now through the editor |
| ESLint with accessibility rules | Tested | `npm run lint`, also in CI. jsx-a11y and React hooks rules. Clean |
| JetBrains Mono for code | Implemented | Bundled locally |

**Gaps, on purpose or still owed:**

- **Tables and links** are not in the editor. Pasted addresses stay plain text. Both need their own interface.
- **A block taller than one sheet is not split** in the paginated layout: it runs over the page edge. Page breaks fall between blocks only.
- **Paper size and margins are one setting for all pages**, not per page. There is no print or PDF output yet, so the sheets are a writing view.
- On a phone the sheet is scaled to the screen but the text is not, so a sheet holds less text than on paper.
- The block menu works on top-level blocks (a whole list, not one list item). There is no drag handle.
- **Custom key bindings** are not built.
- Search scans the workspace in memory on each key press. Measure with a large workspace before Milestone 8 (see ARCHITECTURE.md, D3 and D12). Matches are not highlighted in the snippet.
- ESLint reads TypeScript through Babel, so it has no type-aware rules. typescript-eslint does not support TypeScript 7 yet.
- Not run: input methods (IME), real phone keyboards, Firefox, Safari, screen readers.

## Milestone 4 — Drawing

Evaluate `drawfn`, tldraw, Excalidraw and a custom perfect-freehand engine against: stylus and
pressure, editable strokes, partial erase, lasso, object transforms, performance, import/export,
React 19 support, licence, maintenance. Wrap the winner behind our own interface. Then: inline
drawing block, full-screen canvas, persistence as editable data, PNG export.

## Milestone 5 — Writing atmosphere (started early)

| Item | Status | Note |
| --- | --- | --- |
| Typewriter sounds: key, space, backspace, bell, carriage return | Tested | Synthesised with Web Audio, no audio files. Off by default. Measured, not judged by ear |
| Carriage return with bell on Enter and when a line wraps | Tested | End-to-end test in a real browser. The caret's place is measured in a hidden copy of the paragraph |
| Bell setting: every new line, before the line ends (margin bell), off | Tested (default and validation) / Implemented (the two other modes) | |
| Shift down and up, paper feed when a page opens | Implemented | Sounds are unit-tested; the triggers are not automated |
| Sound on/off on the page, volume and sample in Settings | Tested | |
| Sound packs (other machines) | Not started | |
| Covers, paper styles, focus mode, typography settings, statistics | Not started | |

Since Milestone 3 the sounds follow the editor: the edit is taken from the browser's `beforeinput`
event (or from the key, for Enter and the delete keys), and the caret is measured from the editor
(`coordsAtPos`).

## Milestones 5 to 8

As in the master specification: sounds, covers, paper, focus mode, statistics (5); PDF.js reader,
annotations, recording, audio library (6); KaTeX, flashcards with FSRS, backlinks, graph (7);
dashboard polish, accessibility pass, PWA and offline, first real deployment (8).

## Open questions for the owner

1. Should the full master specification be pasted into `PRD.md`?
2. Licence for the project (currently `UNLICENSED` in `package.json`).
