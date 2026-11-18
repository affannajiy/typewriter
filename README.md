# TypeNote

A notepad you type into like a typewriter. It is private, local-first, and runs in the browser.

**Status:** 0.8.0, the revamp. Milestones 1 to 7 are complete. Milestone 8 (polish and deployment) has offline use and the revamp done. Deployment is still to do. [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) gives the state of each feature.

## What works today

- **Shelf.** The app opens on your notebooks. With no notebook, one button makes the first, and it opens ready to write. Pages in no notebook show below the shelf.
- **Typewriter.** Key strikes, space bar, backspace, shift, the carriage return with its bell (on Enter and when a line wraps), and paper feed when a page opens. Three machines: desk, portable, office. On by default, in the typewriter typeface. The speaker button below the page turns sound off. **Settings** changes the machine, volume, bell and typeface.
- **Search** from the home screen or with Ctrl/Cmd + K: notebook names, page titles, page text, and the text of PDFs in pages. Results are grouped by notebook, with the words marked. A page opens at the match. Enter and Shift+Enter step through the matches.
- **Typing test** with typewriter sounds: 15, 30 or 60 seconds, on a passage from your notes or a built-in one. Shows words per minute and accuracy. Never saved.
- **Rich-text editor** with autosave: headings, bold, italic, underline, lists, checklists, quotes, code, dividers. "Saved" shows only after the database confirms the write. Type `/` for a block menu.
- **Equations** (`$x^2$`, or `$$` on an empty line), drawn with KaTeX.
- **Drawings** in pages (`/draw`): pen (pressure-sensitive with a stylus) and highlighter in five inks, an eraser that cuts lines, a lasso to move, resize or delete, undo, PNG download.
- **PDFs and recordings** in pages (`/pdf`, `/record`). PDF reader with zoom, page numbers, highlights in four colors, and a note on each highlight. Record with the microphone (with pause) or use a sound file. Download from the block.
- **Layouts:** continuous, or sheets of paper (A4, Letter, A5, three margin widths). Paper: plain, lined, squared or dotted. The text stays on the rules.
- **Focus mode** (Ctrl/Cmd + Shift + F) shows only the page. The slim sidebar also fades while you type.
- **Covers** in any color, with a finish (linen, stripes, dots, grid) and an icon.
- **Offline** after the first visit. You can install it as an app.
- **Trash** with Undo. Nothing is purged automatically. Full backup to one JSON file. Restore with three conflict modes.
- **Appearance:** six themes, custom accent color, interface density, animation control. Follows the system light/dark setting.
- **Privacy:** no account, no server, no analytics. Notes stay in the IndexedDB of this browser.

## Run it locally

Node.js 24.

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

In CI, the base path comes from the repository name. For a local build under a different path, or at a domain root (for example Vercel), set `TYPENOTE_BASE`:

```bash
TYPENOTE_BASE=/ npm run build
```

Routing uses the URL hash (`/#/page/…`), so direct links and refresh work on any static host.

The deployed site is public, but it holds only the application. Your notes stay in your browser and are never part of the build.

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
| `$…$` · `$$` and a space on an empty line · Ctrl/Cmd + Shift + E | Inline equation · equation block · inline equation |
| Enter · Shift + Enter (find bar open) | Next match · previous match |
| Ctrl/Cmd + Z · Ctrl/Cmd + Shift + Z | Undo · redo |
| Tab / Shift + Tab | Move between controls |
| Enter / Space | Activate a control, open a menu |
| Arrow keys, Home, End | Move in an open menu or the formatting toolbar |
| Escape | Close a menu, dialog, find bar or the navigation drawer |

Each formatting button shows its shortcut in its tooltip, and the palette lists them. Custom key bindings are not available yet.

## Your data

- Notes are in IndexedDB in this browser profile. They are **not encrypted**. Anyone who can use the profile can read them.
- A browser can clear site data when a device is low on space. In **Settings → Storage and backup**, ask the browser to protect the data, and download backups.
- If you clear the site data for this page, you delete your notes. Export a backup first.

## Documentation

| File | Covers |
| --- | --- |
| [PRD.md](PRD.md) | Product scope and decisions |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Layers, rules, technical decisions with reasons |
| [DATA_MODEL.md](DATA_MODEL.md) | Entities, indexes, backup format, migrations |
| [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) | Milestones and the implementation checklist |
| [TESTING.md](TESTING.md) | What is tested, how, and what is not |
| [CHANGELOG.md](CHANGELOG.md) | Changes in each version |
| [rulebooks/](rulebooks/README.md) | UI/UX, security and engineering rules for the project |
