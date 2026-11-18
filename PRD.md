# TypeNote — Product Requirements

**Tagline:** Your personal digital writing atelier.

> This file gives the product scope in short form and the decisions made on top of the master specification (30 parts, version 1.0). The full specification came in the project kickoff conversation. It is not in the repository yet. To keep it under version control, paste it below the last heading of this file.

## Product

**Since 0.8.0: a notepad you type into like a typewriter.** You open the site and see your notebooks. If there are none, you make one. Then you write, with typewriter sounds and type. Drawings, PDFs and recordings are inside pages. The app works offline. People use it for study, but it is not a study app: no dashboard, no streaks, no flashcards.

- Local-first, private by default, works offline. Typed and handwritten content side by side.
- Minimal interface with Dark Academia accents.
- **Users:** students, writers, researchers, and anyone who wants a private notebook they can customize.
- **Never required:** an account, a backend, cloud storage, paid APIs, external AI services.

## Releases (master specification)

| Release | Scope |
| --- | --- |
| 1 — Atelier | Dashboard, folders/notebooks/pages, rich-text block editor, continuous and paginated layouts, basic drawing, typewriter sounds, themes, paper styles, covers, tags, search, backup/restore, PWA, basic PDF attachments |
| 1.1 — Study Desk | Full PDF reader and annotations, audio recording and library, equations, flashcards with FSRS, backlinks, knowledge graph, templates, daily notes, version history |
| 2 — Archive | Optional sync, transcription, handwriting recognition, collaboration. Do not build early. |

## The 0.8.0 revamp (decided 2026-11-18)

The owner made the product smaller. Where these decisions and the specification or the table above disagree, these decisions apply.

| Area | Decision |
| --- | --- |
| Home | The notebooks shelf, with a search field above it and loose pages below it. An empty shelf offers "Create your first notebook" (and a loose page). A new notebook opens immediately. |
| Removed | Dashboard (desk), writing streaks, daily word goal, words-per-day log. Flashcards, decks, review, FSRS. Knowledge graph. Tags. Folders. Page links (`[[`) and "Linked from". The Files screen. |
| Kept | Notebooks and pages, loose pages, editor, equations, drawing, PDFs and recordings in pages, PDF reader, themes and paper, focus mode, Trash, backup, offline, install. |
| Frame | A slim icon rail (new page, search, notebooks, typing test, Trash, Settings) that fades while you type. Phones: a top bar with search and a bottom bar. |
| Typewriter | On by default: key sounds, the bell, and the typewriter (mono) typeface. |
| Search | One search over notebook names, page titles, page text and the text of PDFs in pages. Results are grouped by notebook, with marked words and a match count. A page opens at the match, with a find bar that steps through each match (Enter, Shift+Enter). A PDF opens at the page with the match, with the words marked. |
| Typing test | 15, 30 or 60 s, with typewriter sounds. The text comes from your notes (all notebooks or one) or from built-in passages. The app shows the result (WPM, accuracy, time) and never stores it. |
| Old data | Schema version 6 removes the cut tables. Notebooks in folders go to the shelf. Pages in folders become loose pages. A page link becomes the text of its title. Old backups restore the same way and tell what they left out. |

## Priorities

1. Reliability: stable architecture and local-first storage.
2. Writing experience.
3. Identity: atelier design and typewriter sounds.
4. Study functions.
5. Refinement: mobile, accessibility, performance, offline, deployment.

Never trade data integrity for polish. A feature is done only when it works through the real interface, persists, survives reload, handles bad input and errors, works by keyboard and touch, has tests, and has its limits written down.

## Decisions at kickoff

There were two briefs: the master specification and a shorter five-feature brief. Where they disagree, **the master specification applies**. The short brief only informed the first vertical slices (sounds, sketching, export).

| # | Question | Decision |
| --- | --- | --- |
| 1 | Which brief applies? | The master specification: Dexie (not localforage), folders/notebooks/pages (not a flat note list), the atelier palette and Lora (not cream and monospace). |
| 2 | Drawing library | Open at kickoff. Milestone 4 compared `drawfn` (0.0.3) with tldraw, Excalidraw and a custom engine, behind our own canvas interface. **Decided 2026-11-17:** our own engine on perfect-freehand (ARCHITECTURE.md, D13). |
| 3 | Page content storage | One Tiptap document per page is the source of truth. Blocks have stable IDs inside it. A derived index serves search, backlinks and block links. |
| 4 | Repository and base path | Repository `typewriter`. Base path from `TYPENOTE_BASE`, default `/typewriter/`. |
| 5 | Routing | Hash routing, so deep links and refresh work on GitHub Pages. |
| 6 | Deleting a notebook | The notebook and its pages go to the Trash as one unit and restore as one unit. Nothing is purged automatically. (Folders were removed in 0.8.0.) |
| 7 | Restore conflicts | The user chooses each time: add missing (default), add missing and take newer, or replace everything. Replace keeps a safety snapshot and can be undone. |
| 8 | First launch | An empty shelf that offers to make the first notebook. No sample content. (Before 0.8.0: an empty desk.) |
| 9 | End-to-end tests | Playwright from Milestone 2, one test per critical journey. |
| 10 | Version control | Local commits per verified milestone. The owner does the push. |

## Scope that differs from the master specification

The roadmap tracks these:

- Notebooks have an **icon** and a cover **finish** (Milestone 5). There is no separate notebook **accent color**, because the cover color already marks the notebook.
- Reordering uses "Move up", "Move down" and "Move to…". **Drag and drop** comes later. The menu actions stay as its keyboard and single-pointer alternative.
- Study features (Milestone 7) came before the Release 1 PWA work, in roadmap order. The 0.8.0 revamp then removed all of them except equations.
- There is one implicit workspace. Add a `Workspace` entity only if multiple workspaces become a requirement.
