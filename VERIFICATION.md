# Verification

Production build passes (`npm run build`). Vite warns about the PDF engine chunk size; the engine and worker are bundled locally.

Browser checks passed:
- Three sample PDFs combine to 9 pages; source removal produces 6 pages.
- Export downloads a real PDF; reimport confirms its expected page count.
- Preview navigation, 9 page thumbnails, rotation controls, and source reordering operate without page errors.
- Prototype queue add/pause/resume and empty-state controls work.
- Home recent documents persist after reload. Search, pin filters, list/grid switching and selection work.
- Opening Estimate.pdf from either Home reopens a 2-page PDF in the editor.
- Desk reopening also passes at 390px after the review fix.
- Library and Desk have no document-level horizontal overflow at 390px.

Design Taste source lint: 0 failures. Browser inspector: editor at 1440/1280/768/390 and both Homes at 1440/768/390 report 0 failures. Compact 11–12px secondary text remains an advisory appropriate to the desktop utility prototype. Desk's empty preview triggers an empty-area advisory on a fresh database; populated screenshots show the actual PDF preview. Inspector Home screenshots use empty-state storage; supplied user-facing screenshots use generated sample PDFs.

Impeccable's engine-based context and detector could not run because its engine is not installed and its default cache is not writable. References, craft-floor review and a separate finish reviewer were used. Reviewer disposition: ship as a design prototype; no desktop-blocking defect found. A mobile-only reopening issue was subsequently corrected and verified.

Windows compilation, native dialog/download behavior, Windows spooler, printer driver, installer and DPI/accessibility verification on Windows have not been performed. No Windows executable is claimed.

## Desktop revision
Browser checks confirm File menu interaction, Library details/large-icon switching, document filtering and PDF reopening, and Workbench preview selection. Both revised layouts fit 1280/768/390 widths without document-level horizontal overflow. Zero browser page errors. Title controls invoke Tauri window methods only inside Tauri; the browser shows an explanatory notification. Windows execution remains unverified.

## First-concept refinement
Exporting custom range 1-2, 5 produces 3 PDF pages and preserves the 90-degree rotation of page 1. Current-page mode produces 1 page. Invalid range1-90 reports the valid9-page limit. Output range text survives rotation, and navigating to page5 highlights Statement of work.pdf. Reordering the rotated proposal to the second position moves its current page to4 and preserves90 degrees in the exported file. In-app Home lists recent PDFs and reopens Estimate.pdf with2 pages; queue add still works. Fit shows the full page. No page errors or horizontal overflow at1280/768/390.

## Guided Combine flow and per-page ordering
Browser checks pass Add/previous-draft recovery/import4pages/review/save/download4pages/completion/redownload/back/Home entry and compact save-panel visibility. Review layouts have no document overflow at1280/768/390. Native drag moved CHARLIE before ALPHA/BRAVO across file boundaries; button and Alt-arrow alternatives worked. Text extraction from the exported PDF confirmed CHARLIE, ALPHA, BRAVO in that exact order. Per-page rotation is checked after reordering. No page errors were observed.

## Priority editing and simulation update

Production build and source lint pass. Real browser checks confirm Shift-range selection, checkbox selection, duplicate (4→7), undo (7→4), redo (4→7), delete (4→1), extraction of 3 real pages, and recovery of a four-page draft after returning to the main editor. A native drag retained the exact grid and thumbnail image DOM elements, with zero editor subtree rebuilds. Export text extraction verified ALPHA, ALPHA, BRAVO, CHARLIE, DELTA and rotations 90,90,0,0,0 after duplication/rotation. Page editing uses original source documents and assembles output lazily.

The Save/Done demo routes label completion as a preview without claiming a download. Actual Save still downloads. Print simulation progress advances to completion; pause holds progress, resume queues behind any active job, cancel stops a job, and restart resets it. No documents are sent to a printer. Desktop/compact captures showed no document overflow at 1280/768/390. Browser page errors: none in the main editing/export/simulation checks.

Review fixes guard deleted selection anchors, restore anchors with history, scope page Delete/Backspace/Ctrl+A and undo/redo shortcuts to the visible editor, and preserve focus across repeated Alt-arrow moves. Targeted regression checks cover Shift-click after deleting its anchor and Delete/Ctrl+A/Ctrl+Z while Print Jobs is active.

Home recent-file routing was corrected to Preview PDF. The document tab and Preview navigation are selected, and the Combine stepper is absent. Both Home Open and direct recent-file links were checked; Home Combine still starts the Add PDFs workflow.

## Separate Preview/Edit workspaces

Preview has zero output forms and zero mutation controls. Its Pages view shows nine read-only thumbnails and no draggable page cards; Delete/Ctrl+A do not change the document. Entering Edit exposes the four batch tools. Undo remains in Edit PDF, edited export produces the expected nine-page PDF and stays in Edit, and Home recent-file opening continues to use Preview. Both layouts passed the inspector at1440/768/390 with no failures; compact text remains an advisory.

## Home actions, Merge, password protection, and Split (29 October 2026)

Chrome workflow checks passed with no page errors: no Print Jobs or session project navigation; Home right-click and More menus; checkbox selection into Merge; password mismatch validation; protected-copy download; Edit PDF split ranges to ZIP; no document overflow at 1440, 768, and 390px. PDF.js independently rejected missing and incorrect passwords and opened the AES-256 output with the correct password (2 pages). Both ZIP entries parsed as valid 2-page PDFs. Production build passed. The finish reviewer approved the extension after preserving accessible names in both dialog success states.

## Settings → Updates (29 October 2026, Linux)

`npm run check:updates` passed in Chrome against a mocked `__TAURI_INTERNALS__` bridge with no page errors: the browser build shows version 0.1.0 and no update controls; native states cover not configured, up to date, offline, check error with Retry, a quiet launch check when nothing is available, a launch toast when 0.2.0 is available, release notes rendered as text (an HTML payload did not execute), download failure with Retry, 40% progress, and the ready state. Restart and install was deferred while a real export was running, refused without installing when the IndexedDB draft write failed, and otherwise invoked install only after a 3-file draft had been saved. Disabling the export guard made the check fail. After the change, header export still downloaded a valid 9-page PDF. Production build passed with the existing chunk-size warning.

`cargo generate-lockfile` resolved `tauri` 2.12.5 with `tauri-plugin-updater` 2.14.0; `tauri info` read the config. The Rust crate was not compiled because WebKitGTK/libsoup development libraries are absent on this Linux machine. No Windows build, signature verification or real upgrade has been performed.

Older scripts in `../../work/` (`check-combine-workflow`, `check-selection-regressions`, `check-page-drag`, `check-output-history`) fail identically on the pre-change build: they expect the removed Print Jobs/"New combine" UI or skip Merge's Continue-to-save step.

## Save flows, Preview paging, About and manual updates (30 October 2026, Linux browser)

Passed in Chrome against a mocked Tauri bridge, no page errors: `pnpm check:workspaces`, `check:save`, `check:preview`, `check:legal`, `check:about`, `check:updates`; `pnpm build` succeeded (chunk size warning expected); `cargo check --manifest-path src-tauri/Cargo.toml` finished.

`check:about`: Settings shows About with the brand mark, version 0.1.0, developer Ron Mercado, the EULA privacy paragraph, the MIT license text, 7 open-source license entries with text, and Check for updates inside About; the GitHub link calls `window.open` in the browser and `plugin:opener|open_url` with the repository URL in the mocked native bridge; the sidebar Settings item matches Home in size and hover style at 1440, 1100, 900 and 500px. `check:updates`: no `plugin:updater|check` within 4 s of a mocked native launch; an update is found only after pressing Check for updates.

Pending Windows evidence (nothing below was run on Windows or against real plugins):
- Save as dialog writes real files, and cancel writes nothing.
- Open PDF and Show in folder after saving; the opener `**/*.pdf` scope is a case-sensitive glob on Windows, so a `.PDF` file may fail Open PDF.
- GitHub link opens in the default browser.
- Installer shows the license page from `EULA.txt`.
- Installed-app update check, download and install.

## Platform layer and persisted scope (30 October 2026, Linux, React rewrite Task 2.1)

`pnpm test` (Vitest, mocked `__TAURI_INTERNALS__` bridge in jsdom), `pnpm typecheck` and `pnpm lint` passed. `cargo check --manifest-path src-tauri/Cargo.toml` finished with `tauri-plugin-persisted-scope` 2.4.2 registered after `tauri-plugin-fs`; the build script accepted the tightened capability (no `core:default`; adds `dialog:allow-open`, `fs:allow-read-file`, `core:event:allow-listen|unlisten`, `core:resources:allow-close`). Rust was checked, not built or run.

Pending Windows evidence:
- Picked and dropped PDFs read through the fs scope, and still read after an app restart (persisted scope).
- A deleted or moved recent reports as missing (`FileMissingError`).
- Native drag-drop events arrive with `dragDropEnabled` on; window controls still work without `core:default`.

## React + TypeScript rewrite: browser results (2026-10-30, Linux Chrome via Playwright)

Browser only; nothing here ran on Windows or against real Tauri plugins. The legacy app is removed; layout parity was checked against `tests/e2e/legacy-layout.json` (since removed with those checks), 84 legacy measurements (each view, stage and width) recorded before deletion. Changing one CSS value (sidebar column 190px to 200px) failed `shell panes match the legacy app at 1440px`; restored.

- `pnpm install --frozen-lockfile`, `pnpm typecheck` (strict), `pnpm lint`: pass.
- `pnpm test` (Vitest, jsdom): 49 files, 718 tests passed.
- `pnpm exec playwright test --workers=1`: 189 passed, 0 skipped.
  - axe (`a11y.spec.ts`): no violations in the views and in the open Add password and Split dialogs; Esc closes dialogs and returns focus; toasts announce through `role=status` / `role=alert`.
  - perf (`perf.spec.ts`): 300 pages render at most 40 thumbnails before scrolling, no long task over 200 ms, 0 live documents after close.
  - security (`tests/unit/security.test.ts`, run by `pnpm test`): no raw-HTML or eval sinks, strict CSP, narrow capabilities, no web storage, no dev hooks in the build; `save.spec.ts` checks Add password leaves the password in no IndexedDB store.
- `pnpm build`: passes; `dist/` holds only the app (`index.html`, `assets/`, `brand/`); the PDF-engine chunk size warning is expected.
- Rust was not compiled here for this task; `cargo check` passed in Task 2.1 (see above).

Windows checklist for the owner (all pending):
- [ ] Native Open (picker), drag-and-drop and Save as write and read real files; cancel writes nothing.
- [ ] Show in folder after saving.
- [ ] Recents survive a restart (persisted scope) and Locate re-links a moved or deleted file.
- [ ] Wheel and inertia page flipping feels right in WebView2.
- [ ] Pointer reorder feel and auto-scroll while dragging.
- [ ] Print through the PDF viewer.
- [ ] The export worker runs under the shipped CSP.
- [ ] Reduced capabilities (no `core:default`) work, including window controls.
- [ ] fs read scope is limited to picked, dropped or saved paths; the webview has no file write permission (saving goes through the Rust `save_as` command).
- [ ] Double-click on the titlebar maximizes and restores the window.
- [ ] Upgrade from a profile that has used the legacy app: Home lists recents, opening and editing work, and the draft saves and restores (the legacy recents and draft are dropped, not migrated).
- [ ] Save as over an existing file replaces it; no `.ifixpdf-tmp` file is left next to it.
- [ ] Save as into a read-only folder shows the error toast; an existing file there is intact.
- [ ] Cancelling the native save dialog writes nothing and shows no toast.
- [ ] Alt+F4 after an edit saves the draft; it restores on the next launch.
- [ ] Closing the window during an export waits for it or does not corrupt the saved file.
- [ ] A file saved with Save as reopens from Home recents after a restart.

Open owner decision: dropping a folder grants a recursive fs scope that persisted-scope keeps across restarts (read only: `fs:allow-write-file` was removed when Save as moved to Rust, `docs/adr/20261031120305_rust-owned-save-as.md`). tauri-plugin-fs grants it in Rust (`allow_directory(path, true)`, tauri-plugin-fs 2.7.1 `src/lib.rs:632-647`) before JavaScript sees the drop, so ignoring folder drops in JavaScript does not remove the grant. Options: accept and document it, or a Rust-side change (forbid the directory again after the drop, or a custom drop handler).
