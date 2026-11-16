# Changelog

Versions follow [Semantic Versioning](https://semver.org/). Before 1.0.0, the public contracts are
the database schema and the backup file format; both carry their own version numbers.

## 0.4.0 — 2026-11-17

Milestone 4 (Drawing).

### Added

- Drawings in pages. Type `/draw`, or use the toolbar or the command palette, to add a drawing
  block. It opens full screen; the page shows a preview, and "Open drawing" (or Enter on the
  selected block) opens it again.
- Pen and highlighter in five inks (ink, red, blue, green, yellow) and three widths. A pen's
  pressure changes the line's width; with a mouse or a finger, the speed does.
- Palm rejection: once a pen is used, a finger scrolls instead of drawing.
- Eraser that removes only what it touches: a line cut in the middle becomes two.
- Lasso: select strokes, then move, resize or delete them.
- Undo and redo in the drawing, with buttons or Ctrl/Cmd + Z and Ctrl/Cmd + Shift + Z.
- "Add space below" makes the canvas taller.
- Download a drawing as a PNG image.
- Drawings are part of backups.
- Design tokens for drawing inks in every theme, with a contrast check.
- 48 more unit and component tests and 1 more end-to-end journey (292 unit, 10 journeys).

### Changed

- Database schema version 2: a new `drawings` table. Opening the app upgrades the database; no
  existing data changes.
- Backups now hold drawings. Backups made by earlier versions still restore. A backup made by
  0.4.0 is refused by earlier versions, which ask to be updated.
- The editor file is 12 kB (gzip) larger, for the drawing engine (perfect-freehand, MIT, no
  dependencies).

### Security and data safety

- A drawing saves through the same autosaver as a page: "Saved" appears only after the write, and
  "Done" closes the drawing only after its last write. A failed write keeps the drawing open, with
  a retry.
- Strokes in a backup file are validated like everything else: known tool and ink, numbers only,
  bounded sizes.
- A duplicated or pasted drawing block gets its own copy of the strokes, so changing or deleting
  one never changes the other.
- A drawing is deleted only when its page is deleted permanently.

### Known limits

- Drawing happens full screen, not on the page. No shapes, text or images on the canvas. Drawing
  needs a pointer. Not yet tried with a real stylus. See DEVELOPMENT_ROADMAP.md, Milestone 4.

## 0.3.0 — 2026-11-16

Milestone 3 (Writing editor).

### Added

- Rich-text editor (Tiptap 3) in place of the plain text box. Pages written before open as they
  were: no migration.
- Formatting: headings 1 to 3, bold, italic, underline, strikethrough, inline code, bulleted,
  numbered and check lists, quote, code block, divider. From the toolbar, from shortcuts, or by
  typing (`# `, `- `, `1. `, `[ ] `, `> `).
- Slash menu: type `/` and a few letters to choose a block type.
- Block menu: move a block up or down (also Alt + Shift + ↑/↓), duplicate (Ctrl/Cmd + Shift + D),
  delete with Undo, and turn it into another type.
- Stable block IDs inside the document, kept through edits, moves and reloads.
- Search and commands (Ctrl/Cmd + K, or the Search button): find a page by its name or its text,
  go to a screen, make a page, or run a formatting command.
- "Sheets of paper" layout, chosen per page: the text is laid out on sheets, and a block that would
  cross the bottom margin starts the next sheet. Paper size and margins in Settings → Paper.
- JetBrains Mono for code, bundled.
- `npm run lint`: ESLint with accessibility (jsx-a11y) and React hooks rules. Also runs in CI.
- 61 more unit and component tests and 3 more end-to-end journeys (244 unit, 9 journeys).

### Changed

- The editor loads when a page is first opened, in its own file (145 kB gzip). The first screen
  does not wait for it.
- A long menu now scrolls inside itself instead of running off the screen.
- The navigation drawer closes on navigation without an extra render.

### Fixed

- A long notebook name could make the page screen and the dashboard scroll sideways on a phone.

### Security and data safety

- A page that holds content this version cannot show (for example from a newer backup) opens
  read-only and is left exactly as stored. It is never flattened and saved over.

### Known limits

- No tables or links yet. A block taller than one sheet is not split. Paper settings apply to all
  pages. See DEVELOPMENT_ROADMAP.md, Milestone 3, for the full list.

## 0.2.1 — 2026-11-16

### Added

- Typewriter sounds while writing, modelled on a manual desk typewriter and synthesised with the
  Web Audio API, so no audio files are downloaded or bundled:
  - Key: key lever, type slug on paper and platen, typebar ring and fall, escapement step. Each
    character has its own pitch and its own place between left and right.
  - Space bar, backspace (one tooth of the rack), shift down and shift up (the type basket).
  - Carriage return, on Enter and when a line wraps: line-feed clicks, the carriage sliding back
    (longer for a longer line), the margin stop.
  - Paper fed into the platen when a page opens or sounds are turned on.
  - A short resonance for the body of the machine, and a limiter so that loud moments do not distort.
- Bell setting: "Every new line" (default: rings with each carriage return), "Before the line
  ends" (as on a real machine: about 7 characters before the end of the visual line), or "Off".
- Speaker button under the page to turn sounds on and off. Volume and a sample in Settings → Writing sounds.
- Sounds are off until turned on. Paste, cut, undo and redo are silent.
- 41 more unit tests and 1 more end-to-end journey (183 unit, 6 journeys).

### Fixed

- The bell on a new line could not be heard: it was one quiet tone under the carriage ratchet. It is
  now a struck gong with overtones, rings for about a second, and starts before the mechanism.

### Known limits

- One machine. Sound packs remain in Milestone 5.
- The sounds were measured (level, no clipping, bell clearly above the mechanism), not judged by ear.
- Shift sounds need a hardware keyboard. The wrap and the margin bell follow the caret in the page text only.

## 0.2.0 — 2026-11-16

Milestones 1 (Foundation) and 2 (Database and organisation).

### Added

- Project scaffold: React 19, TypeScript 7, Vite 8, Tailwind CSS 4, hash routing.
- Design tokens and six themes with "Match system", custom accent, density and animation settings.
- Application shell: collapsible sidebar, mobile top bar, drawer and bottom bar, skip link.
- Reusable controls: buttons, fields, dialog, confirm dialog, menu, toasts, breadcrumbs, segmented control, empty states.
- IndexedDB database (schema 1) through Dexie, with a repository layer.
- Nested folders, notebooks with coloured covers, pages in a notebook, in a folder or on their own.
- Rename, move, reorder, favourite, pin and tags.
- Dashboard: continue working, pinned, favourites, recently modified.
- Plain-text page writing with autosave, save status, word and character counts, Ctrl/Cmd + S.
- Trash with undo, restore and confirmed permanent deletion.
- Backup to a JSON file and restore with three conflict modes; a replace restore can be undone.
- Storage usage, persistent-storage request and privacy statement in Settings.
- Content Security Policy in the production build.
- GitHub Actions workflow for GitHub Pages (not yet run).
- 142 unit and component tests, 5 end-to-end journeys on desktop and mobile.
- Project documentation.

### Known limits

- The page body is plain text until the rich-text editor arrives in 0.3.0.
- No search, drag and drop, drawing, sounds, PDF, audio, flashcards, graph, PWA or offline shell yet.
- See TESTING.md for what has not been tested.
