# TypeNote

Your personal digital writing atelier: a private, local-first notebook that runs in the browser.

**Status:** Milestones 1 to 6 of 8 are complete (foundation, database and organisation, writing editor,
drawing, writing atmosphere, PDF and audio). Study features are not built yet.
See [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) for the exact state of every feature.

## What works today

- PDFs and sound recordings in pages (`/pdf`, `/record`). A PDF reader with zoom, page numbers, highlights in four colours and a note on each highlight. Recording with the microphone, with pause; or a sound file. A Files screen lists every file and where it is used.
- Folders (nested), notebooks with coloured covers, and pages. A page can live in a notebook, in a folder, or on its own.
- Rename, move, reorder, favourite and pin. Tags across the whole workspace.
- A rich-text editor with autosave: headings, bold, italic, underline, lists, checklists, quotes, code and dividers. "Saved" appears only after the database confirms the write.
- Type `/` for a menu of block types. Move, duplicate, delete or convert a block from the block menu.
- Search and commands with Ctrl/Cmd + K: find a page by its name or its text, jump to a screen, or format the open page.
- Drawings in pages: type `/draw`. Pen (pressure-sensitive with a stylus) and highlighter in five inks, an eraser that cuts lines, a lasso to move, resize or delete, undo, and PNG download.
- Two layouts per page: continuous, or sheets of paper (A4, Letter or A5, with three margin widths).
- Your choice of typeface (Lora, Inter or JetBrains Mono), text size, line spacing and column width, on plain, lined, squared or dotted paper. The text stays on the rules.
- Focus mode (Ctrl/Cmd + Shift + F): only the page, with the paragraph you are writing in full strength.
- Notebook covers in any colour, with a finish (linen, stripes, dots, grid) and an icon.
- Your writing on the desk: words written today against a daily goal, your streak, and the last seven days.
- Typewriter sounds while you write, modelled on a manual desk machine: key strikes, space bar, backspace, shift, the carriage return with its bell on Enter and when a line wraps, and paper being fed in when a page opens. Three machines: desk, portable and office. Off by default; turn them on with the speaker button under the page, or in **Settings → Writing sounds**, where the machine, the volume and the bell are set.
- Trash: deleting moves an item and its contents to the Trash, with Undo. Nothing is purged automatically.
- Full backup to one JSON file, and restore with three conflict modes. A "replace" restore can be undone.
- Six themes, custom accent colour, interface density, animation control. Follows the system light/dark setting.
- Desktop sidebar, mobile bottom bar and drawer. Menus, dialogs and forms are keyboard-operable.
- No account, no server, no analytics. Notes stay in this browser's IndexedDB.

## Run it locally

Developed and tested with Node.js 24.

```bash
npm install
```

```bash
npm run dev
```

Open <http://localhost:5173/typewriter/>.

| Command | Does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run typecheck` | Strict TypeScript check |
| `npm run lint` | ESLint: accessibility and React hooks rules |
| `npm test` | Unit and component tests (Vitest) |
| `npm run test:e2e` | Builds, then runs browser tests on desktop and mobile (Playwright). First run: `npx playwright install chromium` |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build |

## Deploy to GitHub Pages

1. Push this repository to GitHub.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main`. The workflow in `.github/workflows/deploy.yml` typechecks, lints, tests, builds and deploys.

The base path is taken from the repository name in CI. For a local build under another path, or at a
domain root (for example Vercel), set `TYPENOTE_BASE`:

```bash
TYPENOTE_BASE=/ npm run build
```

Routing uses the URL hash (`/#/page/…`), so direct links and refresh work on any static host.

The deployed site is public, but it contains only the application. Your notes are stored in your own
browser and are never part of the build.

## Keyboard

| Keys | Action |
| --- | --- |
| Ctrl/Cmd + K | Search and commands |
| Ctrl/Cmd + S | Save the open page now |
| Ctrl/Cmd + Shift + F · Escape | Focus mode on and off · leave it |
| Ctrl/Cmd + B, I, U, E | Bold, italic, underline, inline code |
| Ctrl/Cmd + Alt + 1, 2, 3, 0 | Heading 1, 2, 3, plain text |
| Ctrl/Cmd + Shift + 8, 7, 9 | Bulleted list, numbered list, checklist |
| Ctrl/Cmd + Shift + B · Ctrl/Cmd + Alt + C | Quote · code block |
| Alt + Shift + ↑ / ↓ | Move the current block up or down |
| Ctrl/Cmd + Shift + D | Duplicate the current block |
| `/` in the text | Menu of block types |
| Ctrl/Cmd + Z · Ctrl/Cmd + Shift + Z | Undo · redo |
| Tab / Shift + Tab | Move between controls |
| Enter / Space | Activate a control, open a menu |
| Arrow keys, Home, End | Move inside an open menu or the formatting toolbar |
| Escape | Close a menu, dialog or the navigation drawer |

Each formatting button shows its shortcut in its tooltip, and the palette lists them. Custom key bindings are not built yet.

## Your data

- Notes live in IndexedDB in this browser profile. They are **not encrypted**: anyone who can use the profile can read them.
- A browser may clear site data when a device runs low on space. Use **Settings → Storage and backup** to ask the browser to protect the data and to download backups.
- Clearing site data for this page deletes your notes. Export a backup first.

## Documentation

| File | Covers |
| --- | --- |
| [PRD.md](PRD.md) | Product scope and the decisions made so far |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers, rules, and technical decisions with reasons |
| [DATA_MODEL.md](DATA_MODEL.md) | Entities, indexes, backup format, migrations |
| [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) | Milestones and the implementation checklist |
| [TESTING.md](TESTING.md) | What is tested, how, and what is not |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each version |
| [rulebooks/](rulebooks/README.md) | UI/UX, security and engineering rules the project follows |
