# TypeNote — Product Requirements

**Tagline:** Your personal digital writing atelier.

> This file records the product scope in short form and the decisions taken on top of the master
> specification. The full master specification (30 parts, version 1.0) was given in the project
> kickoff conversation. It has **not** been copied into the repository yet: paste it below the
> last heading of this file to keep the complete text under version control.

## Product

A personal note-taking, writing and knowledge-management web application. Local-first, private by
default, usable offline, with typed and handwritten content side by side. Minimalist interface with
Dark Academia accents.

**Users:** students, writers, researchers, and anyone who wants a private, customisable notebook.

**Never required:** an account, a backend, cloud storage, paid APIs, external AI services.

## Releases

| Release | Scope |
| --- | --- |
| 1 — Atelier | Dashboard, folders/notebooks/pages, rich-text block editor, continuous and paginated layouts, basic drawing, typewriter sounds, themes, paper styles, covers, tags, search, backup/restore, PWA, basic PDF attachments |
| 1.1 — Study Desk | Full PDF reader and annotations, audio recording and library, equations, flashcards with FSRS, backlinks, knowledge graph, templates, daily notes, version history |
| 2 — Archive | Optional sync, transcription, handwriting recognition, collaboration. Not to be built early. |

## Priorities

1. Reliability: stable architecture and local-first storage.
2. Writing experience.
3. Identity: atelier design and typewriter sounds.
4. Study functionality.
5. Refinement: mobile, accessibility, performance, offline, deployment.

Data integrity is never traded for polish. A feature is done only when it works through the real
interface, persists, survives reload, handles bad input and errors, works by keyboard and touch,
has tests, and has its limits written down.

## Decisions taken at kickoff

Two briefs were supplied: the master specification and a shorter five-feature brief. Where they
disagree, **the master specification governs**. The short brief informs the first vertical slices
(sounds, sketching, export) only.

| # | Question | Decision |
| --- | --- | --- |
| 1 | Which brief governs? | The master specification. So: Dexie (not localforage), folders/notebooks/pages (not a flat note list), the atelier palette and Lora (not cream and monospace). |
| 2 | Drawing library | Not fixed in advance. `drawfn` (0.0.3 at kickoff) is evaluated at Milestone 4 against tldraw, Excalidraw and a custom engine, behind our own canvas interface. The choice and its limits are then recorded. **Decided 2026-11-17:** our own engine on perfect-freehand (ARCHITECTURE.md, D13). |
| 3 | How page content is stored | One Tiptap document per page is the source of truth. Blocks carry stable IDs inside it. A derived index serves search, backlinks and block links. |
| 4 | Repository and base path | Repository `typewriter`. Base path from `TYPENOTE_BASE`, default `/typewriter/`. |
| 5 | Routing | Hash routing, so deep links and refresh work on GitHub Pages. |
| 6 | Deleting a folder or notebook | The whole subtree goes to the Trash as one unit and restores as one. Nothing is purged automatically. |
| 7 | Restore conflicts | The user chooses each time: add missing (default), add missing and take newer, or replace everything. Replace keeps a safety snapshot and can be undone. |
| 8 | First launch | An empty desk with guidance. No sample content. |
| 9 | End-to-end tests | Playwright from Milestone 2, one test per critical journey. |
| 10 | Version control | Local commits per verified milestone. Pushing is left to the owner. |

## Scope notes that differ from the master specification

These are deliberate and are tracked in the roadmap:

- Notebooks have an **icon** and a cover **finish** (Milestone 5). A separate notebook **accent colour** was not added: the cover colour already marks the notebook.
- Reordering is by "Move up" / "Move down" and "Move to…". **Drag and drop** is added later; the menu actions stay as its keyboard and single-pointer alternative.
- Study features (Milestone 7) arrived before Release 1's PWA work, as the roadmap orders them.
  Links go to whole pages only; block links wait for a need. Flashcards are text with equations, with
  no images, cloze deletions or Anki import.
- There is one implicit workspace. A `Workspace` entity is added only if multiple workspaces become a requirement.
