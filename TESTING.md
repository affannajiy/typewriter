# Testing

**Last run:** 2026-11-18 (0.8.0). Typecheck clean, lint clean, 355 unit and component tests passed, 30 end-to-end tests passed (15 journeys × desktop and mobile), production build succeeded.

## How to run

```bash
npm run typecheck
```

```bash
npm run lint
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

`test:e2e` builds the app and serves the production build under `/typewriter/`. Thus it also proves the GitHub Pages base path.

## Approach

Many fast unit tests on the data layer, where a bug loses notes. A few component tests for the shared controls. One end-to-end test per critical journey. Variations get tests one level down.

## Unit and component tests (Vitest, jsdom, fake-indexeddb)

| File | Covers |
| --- | --- |
| `src/database/repositories/repositories.test.ts` | Notebooks: edit without a change to pages, invalid color. Pages: draft save, plain text, a missing page fails loudly, a move into or out of a notebook keeps the ID, open is not an edit, reorder. A recording that ended after its page closed goes into its block, or at the end of the page. Trash: a notebook and its pages as one batch, exact restore, a page comes back loose when its notebook is gone, permanent delete only of trashed rows. Page links in old documents become the text of their title. Schema version 6: a version 5 database with folders, tags, words written, decks and old settings opens with only notebooks and pages, flattened, links as text, removed settings gone. |
| `src/database/repositories/drawings.test.ts` | Drawings: the first save makes the row, updates bump the revision, height has limits. A copy gets its own strokes, once, and only from a drawing that exists. Kept through Trash and restore. Deleted with the page by a permanent delete or Empty Trash, and only then. Schema version 2: a version 1 database opens with its pages and settings intact and an empty `drawings` table. |
| `src/database/repositories/attachments.test.ts` | Files: bytes stored separately and not listed. Empty, unknown-type, fake-PDF and over-100-MB files refused, with nothing written. Rename is an edit. File IDs found at any depth in a document. Where a file is used, live and in the Trash. Delete refused while a live or trashed page uses the file, then removes bytes and highlights. A purge deletes only files that no remaining page uses, and leaves unrelated unused files. Empty Trash does the same. Highlights: reading order, edits bump the revision, rectangles stay inside the page, no-area and missing-file refused, delete and Undo restore it exactly. Backups: files, bytes and highlights round trip. A merge never replaces bytes. Replace brings files back. A backup over the limit is not made. Damaged base64, wrong size, a non-PDF, missing bytes, unknown kind or type, a highlight on a missing file or outside the page: each rejects the file and tells where. A format 1 backup restores. Schema version 4: a version 3 database opens intact with empty file tables. |
| `src/services/math.test.ts` | KaTeX output with MathML. An unreadable formula is explained. A formula over the length limit is refused. `\href`, raw HTML in `\text` and `\htmlStyle` make no link, element or style. `$…$` found in text. Prices, single and escaped dollars stay as text. |
| `src/features/files/highlights.test.ts` | Selection pieces merged per line with word gaps. Separate lines and distant pieces kept apart. Empty pieces dropped. Rectangles as page fractions, equal at two zooms. Clipping to the page. Boxes taller than a quarter page ignored. Hit test. Quote cleanup. Base64: round trip of 200 kB and of nothing. Invalid text refused. |
| `src/services/recorder.test.ts` | Not offered without MediaRecorder. Format choice. Record, pause (not counted), resume, stop with the bytes and length, microphone released. Refused, missing and failing microphones explained. Length and file-extension format. |
| `src/features/files/files.test.tsx` | PDF and recording blocks in the schema, with block IDs and no text. Slash menu and commands insert empty blocks. Enter on a selected PDF opens it. PDF block: a chosen file is stored with its page count and shown. A file that PDF.js cannot open is refused with a message. A missing file is explained. Recording block: record, pause, resume, stop and save into the block, with a player. A refused microphone is explained. Without recording support, only "Choose a sound file" shows. |
| `src/database/backup/backup.test.ts` | Drawings saved and restored with their page. A backup from before drawings restores. A damaged stroke (unknown ink, uneven points, a non-number) rejects the file and tells where. Round trip into an empty workspace, including Trash and settings. The three restore modes. Undo of a replace. A failure in the middle of a replace leaves the workspace unchanged. A page whose notebook is missing becomes a loose page. A pre-0.8.0 backup with folders, tags, cards, writing days and page links restores its notebooks and pages, flattened, links as text, and tells that the rest was left out. Rejects non-JSON, foreign files, newer versions, wrong types (with the path), invalid colors, duplicate IDs, prototype keys. Drops unknown fields and settings. |
| `src/services/autosave.test.ts` | Debounce. "Saved" only after the write resolves. No overlapping writes. An edit during a write is not reported as saved. A failed write keeps its value and retries. Flush. Dispose writes the remaining text. |
| `src/services/typewriterSound.test.ts` | Each machine has its own bell. A longer carriage passes more rack teeth (office > desk > portable). An unknown machine plays the desk machine. The machine setting defaults to desk. Which edit plays which sound (typing, space, Enter, delete; paste, cut, undo silent). Each sound builds. The bell rings alone, and with the carriage return only on request. A longer line gives a longer return. No error without Web Audio, without panner, reverb or limiter, or when audio fails. One shared audio context. Volume. Silent at volume 0. A held key does not buzz, but shift and return always play. Sound settings validation. Margin bell and wrap decisions (`carriageEvents`). |
| `src/styles/tokens.test.ts` | Reads `tokens.css` and checks WCAG contrast for every theme: 4.5:1 for text pairs, 3:1 for borders, focus, accent, and the red, blue and green drawing inks. |
| `src/features/drawing/geometry.test.ts` | Stroke outlines. Partial erase: a cut stroke becomes two and the first keeps its ID, full erase, no touch returns the same list, a cut between two far-apart points. Lasso inside test and the half-inside rule. Move only the selection. Scale around a corner, with the width. Scale limits. Bounds. Undo and redo, and a new change clears redo. |
| `src/features/drawing/DrawingEditor.test.tsx` | The full-screen editor: draws a stroke and shows "Saved" only after the write. Tool, ink and width are used. The highlighter is translucent. Undo and redo from buttons and keys. After a pen, touch does not draw. Lasso selects, delete removes, undo brings it back. A stored drawing opens as it was. "Add space below". Done writes before it closes. |
| `src/features/editor/editor.test.ts` | Old plain-text pages load unchanged. Opening is not an edit. Unreadable documents (unknown node, unknown mark, forbidden structure) are refused. Block IDs: fill, keep, replace repeats, nested, split, round trip, new content. Block operations: find, move with ID and caret, edges, duplicate with new IDs, delete and undo as one step, last block. Commands: turn into and back with the same ID, out of a list, between list kinds, marks, divider, undo availability. Slash-menu filter. Shortcut labels. Plain text of rich documents. Drawing blocks: in the schema, have a block ID, add no text. A duplicate gets its own drawing ID and asks for a copy, and undo removes it. The insert command opens the new drawing, but a check if it can run does not. Enter on a selected drawing opens it. Page-break arithmetic (`paginate`), including the property that no block that fits ever crosses a sheet edge. Sheet scaling. |
| `src/features/editor/screens.test.tsx` | The editor on screen: shows a stored page and reports no change on open. The toolbar formats and reports the new document. The toolbar is one tab stop with arrow-key movement. Each toolbar button has a name, and toggles report their state. Block menu: disabled entries, move, duplicate, delete, Undo. A page in the Trash is not editable and has no toolbar. Page layout stored as an edit only when it changes. Paper settings validation. Command palette: finds a page by its text, shows snippet and notebook, opens it with Enter. Lists the four destinations and "New loose page", and moves with arrow keys. Tells when nothing matches. |
| `src/features/search/search.test.ts` | Words in the text of each notebook, grouped by notebook. Each match counted. Each word required. Case and accents ignored. A notebook whose name matches shows even when nothing inside matches. A PDF found by its text, with its pages. A PDF that no live page shows is not found. Empty query. Overlapping matches joined, and mapped back to the original text when folding changes its length ("ﬁ"). Snippets with marks. Find in page: matches by document position, across marks. |
| `src/features/pages/atmosphere.test.tsx` | Writing settings: the typewriter defaults (mono type, sounds on), refusal of unknown values, removed settings ignored, applied to the page when they change. Focus mode: from the button, from Ctrl + Shift + F, Escape leaves, it ends with the page, "fade" only on request. Settings screen: typeface, ruling and machine stored and shown in the sample. |
| `src/features/typing/typingTest.test.ts` | Typing test: a passage only from the notes of the chosen notebook, long enough for a minute. Built-in passages when no note is long enough, and on request. Text made easy to type (one line, plain quotes and dashes). Each letter right, wrong or waiting. Mistakes counted when typed, also when fixed. Words per minute from right letters, raw speed, accuracy from keystrokes. |
| `src/components/ui/ui.test.tsx` | Button loading state, icon button name and pressed state, Menu keyboard pattern, ConfirmDialog initial focus on the safe choice, settings validation, appearance applied to the document, plain-text document round trip, word and character counts. |

## End-to-end tests (Playwright, Chromium, desktop and Pixel 7)

All in `e2e/workspace.spec.ts` unless the journey names a different file.

1. **A workspace survives closing and reopening.** The empty shelf offers the first notebook. It opens immediately. A page with two paragraphs, "Saved", reload at the deep link, a second tab. The old `#/library` address goes to the shelf.
2. **Deleting is reversible, and permanent deletion asks first.** Trash a notebook with a page, restore it, trash it again, open the permanent-delete dialog. Check the count, the focused safe button, and that Cancel keeps the item.
3. **A backup restores a workspace on a clean browser.** Download a backup, restore it in a fresh browser context, open the restored page. Then choose a file that is not a backup and see the explanation.
4. **The theme applies everywhere and persists** across reload and navigation.
5. **No horizontal scroll** on any screen, including a page with the editor: a very long notebook name with a page in it, and a word too long for a line.
6. **Typewriter sounds play only when on, and the choice persists.** On by default. Turned off, typing is silent. Turned on again, typing asks the browser for audio. Enter on a short line rings one bell and returns the carriage. Half a line of typing rings nothing. Each wrap returns the carriage and rings once. The settings survive a reload and show in Settings.
7. **Rich text from the keyboard, the slash menu and the toolbar survives a reload.** Slash menu with filter, arrow keys and Enter. Bold by shortcut. A list by typing `- `. A checklist from the toolbar, ticked. `/` inside code opens no menu. After reload the content and all block IDs are the same. A keyboard block move, then undo.
8. **Search finds words in every notebook and opens the page at them. The palette runs commands.** Ctrl/Cmd + K from Settings, a hit with snippet and notebook. Enter opens the page with the find bar at "1 of 1" and the word marked. Escape closes it. The home search field groups results under the notebook, marks the words, counts the matches and opens the page at the match. The Search button. "Nothing matches". A formatting command from the palette, after which typing continues in the text.
9. **The sheets layout breaks the text into pages, and the paper settings apply.** No block is cut by a sheet edge, also after text is added above a break and after a reload. The sheet count shows. Letter paper and wide margins change the shape and margins of the sheet.
10. **A drawing is made in a page, saved, reopened and downloaded as an image.** `/draw` adds a drawing and opens it. Two strokes with the mouse, one in red. The eraser cuts the red one in two. "Saved". The PNG download has the correct name. Done shows the preview, and the word count does not change. After a reload the preview is there, and a click to open it adds no stroke. Escape closes.
11. **The writing atmosphere.** Typewriter typeface, large text and lined paper in Settings. A notebook changed to stripes and a leaf icon, which survive a reload. A page with paragraphs and a heading in JetBrains Mono at 20 px on a ruled background, where each block starts exactly on a rule. Focus mode hides the toolbar and all navigation, typing continues, Escape brings them back, and the text is saved.
12. **A PDF in a page is read and highlighted with a note** (`e2e/files.spec.ts`). The test makes a two-page PDF (`e2e/pdfFixture.ts`) and adds it with `/pdf`. The card shows "PDF · 2 pages". The reader opens and paints the canvas. A line is selected and highlighted in yellow, and the highlight covers more than 80 % of the text box. A note is typed and "Note saved" shows. After a zoom in, the highlight still covers the text. "Go to page 2" scrolls page 2 into view. After a reload the highlight and note are there. The home search finds a word on the second PDF page, tells so, and opens the reader there with the word marked. No CSP violation in the log.
13. **A recording with the microphone** (`e2e/files.spec.ts`, Chromium stand-in microphone). `/record`, Record, the timer passes 0:02, Stop and save. The player decodes the sound from the stored bytes (no media error, metadata read). After a reload the player is there. The block downloads it with a `.webm`, `.ogg` or `.m4a` name. No CSP violation in the log.
14. **The typing test** (with a controlled clock). A page in a notebook gives the passage. 15 s. Ten right letters and one wrong, marked. After the time: "10 right · 1 wrong", 8 words per minute, "Results are not saved anywhere", and "New test" has focus.
15. **After one visit the app works with no network** (`e2e/offline.spec.ts`). Wait for "ready to work offline", go offline, reload. The empty shelf opens. A new loose page is written and saved (the editor file comes from the cache). A PDF is added and read (the PDF.js worker and the Helvetica stand-in font come from the cache). The typing test opens. No request fails.

## Not tested, or tested by hand only

| Area | State |
| --- | --- |
| Visual check | By hand once in Chromium at 1024 px and 375 px, light and dark |
| How the typewriter sounds really sound | Not judged by ear. Measured once by an offline render of each sound in Chromium: no clipping (highest peak 0.69 of full scale at full volume), the bell lasts about 1.1 s, and during the carriage slide the bell tone is about 20 times stronger than the mechanism at that pitch. Listen and adjust. |
| How the portable and office machines sound | Not judged by ear. Unit tests check the differences as numbers (bell pitch, carriage length). |
| Shift sounds, paper feed on page open, the "Before the line ends" and "Off" bell modes in the page | Implemented, not automated (the bell-point decision has a unit test) |
| Typewriter sounds on iOS Safari and Android keyboards | Not run. Uses `InputEvent.inputType`, which both report. |
| Caret measurement (`measureCaret`) and the measuring in the page-break plugin | Only the end-to-end tests cover them: jsdom has no layout. Right-to-left text not tested. |
| The read-only screen for a page this version cannot show | The check has a unit test. The screen is not automated. |
| Shortcuts other than bold, move block, undo and Ctrl/Cmd + K | Tiptap key bindings. Not automated here. |
| Input methods (IME), real phone keyboards, autocorrect | Not run. The slash menu and the sounds were driven only by a hardware-style keyboard. |
| The typing test with a phone keyboard or an input method | Not run. It reads a real text field, so it should work. Autocorrect is off on the field. |
| A block taller than one sheet | Known limit, not a failure: it is not split. `paginate` has a unit test for it. |
| Search speed and general performance with a large workspace | Not measured. Budgets: ARCHITECTURE.md, D3 and D12. |
| Full keyboard-only pass | Not done. Tests cover menus, dialogs and forms. A complete walk-through is still to do. |
| Screen reader pass | Not done |
| Firefox and Safari | Not run. Uses `<dialog>`, `:has()`, `color-mix()`, all in current versions of both. |
| 320 px width and 200 % text zoom | Not checked. The narrowest tested width is 375 px. |
| Ctrl/Cmd + S, save on tab hide, close-while-unsaved warning | Implemented, not automated |
| Storage quota exceeded, storage unavailable | The messages exist. Not reproduced in a real browser. |
| Database migration | Each step has a unit test with fake-indexeddb, 5 to 6 with each removed kind of data. Not run against a real browser database written by 0.7.0. |
| Ruled paper on sheets, dotted and squared ruling, the three typefaces in each theme | Lined paper in the continuous layout is measured end to end. The rest was examined by hand in Chromium, dark theme only. |
| Ruled paper with PDF and recording cards | Measured once by a throwaway script in Chromium, desktop and phone: each block started on a whole line. Not in the suite. |
| Equations on ruled paper | An equation block is at least two lines high, but a tall formula pushes the text below off the rules. Inline fractions make their line taller. Examined by hand only. |
| Focus mode fade | CSS on the Tiptap Focus extension, examined by hand. The test checks only the attribute. |
| The side rail fade while typing | The rule was examined in a browser (it applies while typing, not while the pointer moves). Not automated. |
| Drawing with a real stylus, pressure, palm rejection on a tablet | Not run. Tests use simulated pen events only. |
| Drag of a lasso selection to move or resize it | Examined by hand in Chromium (moves exactly as far as the drag). The math has unit tests. The drag is not automated. |
| A drawing with thousands of strokes | Not measured |
| The drawing editor in dark themes | Ink contrast is tested from the tokens. Not examined by eye. |
| GitHub Actions workflow and live Pages deployment | Written, never run |
| PWA install and update | Offline is end to end (above). App install (browser Install button, home-screen icon on a phone) not tried. The update prompt ("A new version of TypeNote is ready", Reload) is not automated: it needs two builds. |
| Recording on Safari, Firefox, iOS, Android, or with a real microphone | Not run. Only the Chromium stand-in microphone. |
| A recording that still runs when its block is removed or the page is left. The warning on tab close. | The unit test covers the write into its block in the stored page. The whole flow with a microphone is not automated. |
| A sound file in place of a recording | Component test only (jsdom cannot read lengths) |
| Real-world PDFs: large, scanned, damaged, encrypted, right-to-left or East Asian text | Not run. The test makes its own PDF. Character maps and fonts are shipped but not used by a test. |
| Selection of PDF text with a mouse drag or a finger | The end-to-end test selects with the Selection API. The rectangles come from the real layout. A drag is not automated. |
| Background PDF text reading for large or scanned PDFs | Only the two-page test PDF is searched end to end. A scan has no text to find. |
| The reader with a screen reader, and by keyboard only | Each control is a named native control, and the notes list reaches each highlight. No walk-through. |
| Equations with a screen reader | KaTeX writes MathML next to its drawing. The equation button has its LaTeX source as its name. Not tried with a screen reader. |

## Defects found before release

We fix or quarantine a flaky test on the day we find it. Milestone 2 had one: a radio button was checked before its database write completed. The fix waits for the stored state. The end-to-end helper `choose()` now does that for each radio button.

| Release | Defects |
| --- | --- |
| 0.8.0 | (1) A recording that still ran when its page was left would go where nothing shows it (the Files screen was gone). (2) No recording could be downloaded. Both now live in the block. (3) The typing test could start mid-sentence: the step back to a sentence start never examined the first word of the page. The end-to-end test found it by chance, and a unit test over 40 seeds now pins it. (4) A very long word in a search result made the phone screen scroll sideways (grid items size to their longest word). (5) The typing-test passage did not wrap (each space was inside an unbreakable span), seen in a screenshot and caught by the no-sideways-scroll journey on a phone. That journey also caught the "From" list of the test growing as wide as a very long notebook name. Suite changes: the service worker is blocked outside the offline journey (each fresh browser cached about 320 files during the test), and the per-test limit is 60 s, because typing now synthesizes sound by default. |
| 0.7.0 | (1) The scheduler library was in the first download, because the card repository imported it. (2) The study screens loaded the whole editor, because the KaTeX renderer shared a file with the equation view of the editor. (3) `$$` on an empty line did not make an equation block in a test that types like a keyboard: the rule expected exactly `$$` on the line, and the space was already in. The KaTeX security test first failed falsely: the escaped LaTeX source stays in the MathML annotation, so the test now checks for links and styles, not for the words. |
| 0.6.0 | (1) In production the build inlined one JetBrains Mono font subset (since 0.3.0) as a `data:` URL, and the CSP blocked it, so code text used a different font. The CSP watch of the new journeys found it. Fonts are now always files. (2) The Files screen pulled the whole editor into the first download (+360 kB), because it shared a file with the editor blocks. (3) On a phone the reader title was cut to a few letters. |
| 0.5.0 | (1) The daily-goal field could overwrite the typed text with a value stored a moment before. (2) Escape did not leave focus mode in a real browser, because the editor keymap takes it (the synthetic key of a test had no key code, so it got through). (3) On ruled paper the text below a drawing was off the rules (the drawing figure is inside a wrapper that the selector missed). Not in the product: the development server served an old copy of three files that a shell command changed in place. |
| 0.4.0 | (1) In development a selection moved twice as far as the drag (a side effect inside a React state updater, which StrictMode runs twice). (2) A drawing block counted as one character in the word count of the page. |
| 0.3.0 | (1) A block lost its ID when its type changed. (2) Undo of a block delete could also undo the action before it. (3) The typewriter sounds missed line wraps on desktop and played the carriage return twice on Android (the edit was noted one event too late). (4) A page break stayed with its old block after text was added above it. (5) A long notebook name made two screens scroll sideways on a phone. |
