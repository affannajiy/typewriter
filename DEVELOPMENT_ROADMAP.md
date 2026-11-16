# Development Roadmap and Implementation Checklist

**Last updated:** 2026-11-16 · **Version:** 0.2.1

Status words: **Not started**, **In progress**, **Implemented** (works, not yet covered by an
automated test), **Tested** (works and has automated tests), **Blocked**.

| Milestone | State |
| --- | --- |
| 1 Foundation | Done, with the gaps listed below |
| 2 Database and organisation | Done, with the gaps listed below |
| 3 Writing editor | Not started |
| 4 Drawing | Not started |
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
| Components: Button, IconButton, TextField, TextArea, SearchField, Card, Dialog, ConfirmDialog, Menu, Toast, Breadcrumbs, Segmented control, EmptyState, status indicator | Tested / Implemented | Button, Menu and ConfirmDialog have component tests. SearchField is built but not used yet |
| Components: Tabs, Tooltip, Context menu, Toolbar, Floating action menu, Content blocks | Not started | Arrive with the editor. Tooltips are native `title` for now |
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
| Global search | Not started | Planned with Milestone 3, once rich content exists |
| Templates | Not started | Release 1.1 |
| Markdown export, PDF export | Not started | Need the editor's document model |
| Backup reminders | Not started | Last backup date is shown in Settings |

**Acceptance (create, organise, save, close, reopen without loss):** met, proven by the
end-to-end test "a workspace survives closing and reopening the app".

## Milestone 3 — Writing editor (next)

Split into deliverables:

1. Tiptap in the page screen, replacing the textarea; documents load without migration.
2. Formatting: headings, bold, italic, underline, lists, checklist, quote, code, divider.
3. Stable block IDs; block menu (duplicate, delete, move, convert).
4. Slash-command menu.
5. Shortcuts and command palette (Ctrl/Cmd + K).
6. Continuous and paginated layouts with page size and margins.
7. Global search over titles and `plainText`.
8. ESLint with accessibility rules.

Libraries to validate first: Tiptap 3 with React 19, its table and task-list extensions, bundle cost.

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

The sounds are driven by the browser's input events, so they will keep working when Tiptap replaces
the textarea in Milestone 3. Two things change then: where the handlers are attached, and
`measureCaret`, which must read the caret from the editor (`coordsAtPos`) instead of a textarea.

## Milestones 5 to 8

As in the master specification: sounds, covers, paper, focus mode, statistics (5); PDF.js reader,
annotations, recording, audio library (6); KaTeX, flashcards with FSRS, backlinks, graph (7);
dashboard polish, accessibility pass, PWA and offline, first real deployment (8).

## Open questions for the owner

1. Should the full master specification be pasted into `PRD.md`?
2. Licence for the project (currently `UNLICENSED` in `package.json`).
