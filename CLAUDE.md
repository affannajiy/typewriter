# TypeNote — working notes for AI assistants

Local-first note-taking web app. React + TypeScript + Vite + Tailwind + Dexie. No backend.

- Scope and decisions: `PRD.md`. Architecture and rules: `ARCHITECTURE.md`. Data: `DATA_MODEL.md`.
- Progress and what is next: `DEVELOPMENT_ROADMAP.md`. Keep its checklist honest: "Tested" needs an automated test.
- General rules live in `rulebooks/`. Read `rulebooks/README.md` to pick the one a change needs; do not paste them here.

## Rules for this codebase

- Components never import `@/database/db`. Use repositories and the hooks in `src/hooks/useData.ts`.
- Interface text goes in `src/i18n/en.ts`. Colours come from tokens in `src/styles/tokens.css`.
- Never delete or overwrite user data without a confirmation or an undo. Never show "Saved" before the write resolves.
- A schema change is a new `version(n)` block with an upgrade step and a test. Never edit a released block.
- Use native elements first (`<dialog>`, radio inputs, links).
- Before calling a milestone done: `npm run typecheck`, `npm test`, `npm run test:e2e`, then update the roadmap, TESTING.md and CHANGELOG.md.
