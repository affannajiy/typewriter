# Changelog

Versions follow [Semantic Versioning](https://semver.org/). Before 1.0.0, the public contracts are
the database schema and the backup file format; both carry their own version numbers.

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
