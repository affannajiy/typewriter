# Testing

**Last run:** 2026-11-16 — typecheck clean, 183 unit and component tests passed, 12 end-to-end
tests passed (6 journeys × desktop and mobile), production build succeeded.

## How to run

```bash
npm run typecheck
```

```bash
npm test
```

```bash
npx playwright install chromium
```

```bash
npm run test:e2e
```

`test:e2e` builds the app and serves the production build under `/typewriter/`, so it also proves
the GitHub Pages base path.

## Approach

Many fast unit tests on the data layer, where a bug loses notes. A few component tests for the
shared controls. One end-to-end test per critical journey; variations are tested one level down.

## Unit and component tests (Vitest, jsdom, fake-indexeddb)

| File | Covers |
| --- | --- |
| `src/database/repositories/repositories.test.ts` | Folders (create, rename, nest, cycle refusal), notebooks (edit and move without touching pages, invalid colour), pages (draft save, plain text, missing page fails loudly, move keeps ID, open is not an edit, reorder), tags (case-insensitive reuse, delete strips references), trash (subtree batch, exact restore, restore when the parent is gone, permanent delete only of trashed rows) |
| `src/database/backup/backup.test.ts` | Round trip into an empty workspace including Trash and settings; the three restore modes; undo of a replace; a failure in the middle of a replace leaves the workspace untouched; dangling references and folder cycles repaired; rejection of non-JSON, foreign files, newer versions, wrong types (with the path), invalid colours, duplicate IDs, prototype keys; unknown fields and settings dropped |
| `src/services/autosave.test.ts` | Debounce; "saved" only after the write resolves; no overlapping writes; an edit during a write is not reported as saved; a failed write keeps its value and retries; flush; dispose writes outstanding text |
| `src/services/typewriterSound.test.ts` | Which edit plays which sound (typing, space, Enter, delete; paste, cut, undo silent); every sound builds; the bell rings alone, and with the carriage return only when asked; a longer line gives a longer return; no error without Web Audio, without panner, reverb or limiter, or when audio fails; one shared audio context; volume; silent at volume 0; a held key does not buzz but shift and return always play; sound settings validation; margin bell and wrap decisions (`carriageEvents`) |
| `src/styles/tokens.test.ts` | Reads `tokens.css` and checks WCAG contrast for every theme: 4.5:1 for text pairs, 3:1 for borders, focus and accent |
| `src/components/ui/ui.test.tsx` | Button loading state, icon button name and pressed state, Menu keyboard pattern, ConfirmDialog initial focus on the safe choice, settings validation, appearance applied to the document, plain-text document round trip, word and character counts |

## End-to-end tests (Playwright, Chromium, desktop and Pixel 7)

`e2e/workspace.spec.ts`

1. **A workspace survives closing and reopening.** Create a notebook and a page, type, wait for "Saved", reload at the deep link, open a second tab, check the library.
2. **Deleting is reversible, and permanent deletion asks first.** Trash a notebook with a page, restore it, trash again, open the permanent-delete dialog, check the count, the focused safe button, and that cancelling keeps the item.
3. **A backup restores a workspace on a clean browser.** Download a backup, restore it in a fresh browser context, open the restored page. Then choose a file that is not a backup and see the explanation.
4. **The theme applies everywhere and persists** across reload and navigation.
5. **No horizontal scroll** on any screen, with a very long notebook name.
6. **Typewriter sounds play only when turned on, and the choice persists.** Typing is silent by default; after the speaker button is pressed, typing asks the browser for audio; Enter on a short line rings one bell and returns the carriage; half a line of typing rings nothing; each wrap returns the carriage and rings once; the settings survive a reload and show in Settings.

## Not tested, or tested by hand only

| Area | State |
| --- | --- |
| Visual check | Done by hand once in Chromium at 1024 px and 375 px, light and dark |
| How the typewriter sounds actually sound | Not judged by ear. Measured once by rendering each sound offline in Chromium: no sound clips (highest peak 0.69 of full scale at full volume), the bell lasts about 1.1 s, and during the carriage slide the bell's tone is about 20 times stronger than the mechanism at that pitch. Listen and adjust |
| Shift sounds, paper feed on opening a page, the "Before the line ends" and "Off" bell modes in the page | Implemented, not automated (the bell-point decision itself is unit-tested) |
| Caret measurement (`measureCaret`) | Covered only by the end-to-end test: jsdom has no layout. Right-to-left text not tested |
| Typewriter sounds on iOS Safari and Android keyboards | Not run. Uses `InputEvent.inputType`, which both report |
| Full keyboard-only pass | Not done. Menu, dialogs and forms are covered by tests; a complete walk-through is owed |
| Screen reader pass | Not done |
| Firefox and Safari | Not run. Uses `<dialog>`, `:has()`, `color-mix()`: all in current versions of both |
| 320 px width and 200% text zoom | Not checked. Narrowest tested width is 375 px |
| Ctrl/Cmd + S, save on tab hide, close-while-unsaved warning | Implemented, not automated |
| Storage quota exceeded, storage unavailable | Messages exist. Not reproduced in a real browser |
| Database migration | No migration exists yet |
| Performance with a large workspace | Not measured. See ARCHITECTURE.md, decision D3 |
| GitHub Actions workflow and live Pages deployment | Written, never run |
| PWA install and offline | Not built |

A flaky test is fixed or quarantined the day it is found. One was found during this milestone
(a radio button checked before its database write landed) and fixed by waiting on the stored state.
