# CLAUDE.md

Guidance for Claude Code in this repository.

TypeNote is a local-first typewriter notepad that runs in the browser. Stack: React 19, TypeScript 7 (strict, `noUncheckedIndexedAccess`), Vite 8, Tailwind 4, Dexie 4 on IndexedDB. No backend, no account, no network calls.

- Scope and decisions: `PRD.md`. Layers, rules and decision records (D1, D2, ...): `ARCHITECTURE.md`. Data model and schema versions: `DATA_MODEL.md`.
- Progress: `DEVELOPMENT_ROADMAP.md`. "Tested" means an automated test exists.
- Test coverage per file: `TESTING.md`. General principles: `rulebooks/` (UI-UX, Security, Engineering). Read `rulebooks/README.md` to find the one a change needs. Do not copy them here.
- Since 0.8.0 the product is a typewriter notepad only. Folders, tags, flashcards, writing stats, page links and the graph were removed (D18). Do not add them again.

## Commands

Node 24.

```bash
npm run dev            # http://localhost:5173/typewriter/
npm run typecheck      # tsc --noEmit
npm run lint           # ESLint (jsx-a11y, react-hooks)
npm test               # Vitest, jsdom + fake-indexeddb, src/**/*.test.{ts,tsx}
npm run test:e2e       # builds, serves the production build on :4173/typewriter/, runs Playwright (desktop + Pixel 7)
npm run build          # tsc --noEmit && vite build
```

- One unit test file: `npx vitest run src/features/search/search.test.ts`. One test by name: add `-t "name"`.
- One e2e file or project: `npx playwright test e2e/files.spec.ts --project=desktop`. The first run needs `npx playwright install chromium`.
- E2E runs against the production build, so it also checks the CSP and the `/typewriter/` base path. It reuses a preview that already runs on :4173.
- CI (`.github/workflows/deploy.yml`) runs typecheck, lint, unit tests and build on push to `main`, then deploys to GitHub Pages. CI does not run e2e.
- `TYPENOTE_BASE` sets the base path (default `/typewriter/`, `/` for a domain root). Routing is `HashRouter`.

## Architecture

- **Data flow:** components read through the hooks in `src/hooks/useData.ts` (Dexie live queries) and write through the functions in `src/database/repositories/`. Only `src/database/` imports `db` (`app/App.tsx` calls `db.open()` once). Repositories own validation, revision bumps and transactions. Each multi-step write is one transaction.
- **Pages:** each page is one Tiptap/ProseMirror JSON document in `pages.content`, with stable block IDs as node attributes. Each save derives `pages.plainText` for search. Drawings, file bytes, PDF highlights and PDF text have their own tables. Nodes in the document refer to them by ID.
- **Editor:** only `src/features/editor/` imports Tiptap at run time. `schemaExtensions()` is the single schema list (editor, `isReadableDoc()` check, tests). `commands.ts` is the single command list (toolbar, slash menu, block menu, command palette). A stored document that the schema cannot read opens read-only. Never let ProseMirror drop unknown content. Pagination is decorations over one continuous document (`pagination.ts`, pure `paginate`).
- **Delete:** soft delete with `deletedAt` and a shared `trashBatchId`. Only `purgeBatch()` and `emptyTrash()` remove rows, after a confirmation. A file is deleted only when no live or trashed page uses it.
- **Backup:** `src/database/backup/` treats backup files as untrusted input. `validate.ts` rebuilds records from an allowlist. `database/legacy.ts` converts pre-0.8.0 data (database upgrade and old backups).
- **Search** (`features/search/search.ts`) scans the whole workspace in memory, with no index. Only PDF text is stored (`pdfTexts`: derived, filled in the background by `services/pdfIndex.ts`, not in backups).
- **Typewriter sounds:** Web Audio synthesis (`services/typewriterSound.ts`), chosen from `InputEvent.inputType`, connected through `features/pages/useTypewriter.ts` and `services/carriage.ts`. Audio failures are ignored.
- **Errors:** expected failures are typed (`RepositoryError`, `BackupError`). Only `utils/errors.ts` turns them into user messages.
- **CSP:** the production build adds a strict CSP from `vite.config.ts` (`'self'` only, no remote connections). The build copies the PDF.js assets. Fonts must not be inlined as `data:` URLs. A new browser capability can need a CSP change there.

## Rules for this codebase

- Components never import `@/database/db`. Use repositories and the hooks in `src/hooks/useData.ts`.
- Interface text goes in `src/i18n/en.ts`. Colors come from tokens in `src/styles/tokens.css` (a test checks WCAG contrast for every theme).
- Never delete or overwrite user data without a confirmation or an undo. Never show "Saved" before the write resolves.
- A schema change is a new `version(n)` block in `src/database/db.ts`, with an upgrade step and a test. Never edit a released block.
- Use native elements first (`<dialog>`, radio inputs, links). The one custom ARIA widget is `Menu`.
- Before you call a milestone done, run `npm run typecheck`, `npm run lint`, `npm test` and `npm run test:e2e`. Then update `DEVELOPMENT_ROADMAP.md`, `TESTING.md` and `CHANGELOG.md`.
