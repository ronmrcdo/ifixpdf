# iFixPDF

Windows desktop PDF tool. Frontend is React 19 + TypeScript (strict) on Vite 6, state in Zustand 5, page reorder with dnd-kit, tests in Vitest and Playwright, inside a Tauri 2 shell. All PDF work runs in the frontend (PDF.js, pdf-lib, pdf-lib-encrypt, fflate); Rust hosts the window and the updater, dialog, fs, opener and persisted-scope plugins, and owns Save as (the `save_as` command: native save dialog plus atomic write).

- [IMPLEMENTATION.md](IMPLEMENTATION.md) — milestones and release criteria, including export compression and installed-PC updates.
- [DESIGN.md](DESIGN.md) — accepted interface; read before UI changes.
- [VERIFICATION.md](VERIFICATION.md) — check results and their scope, including the pending Windows checklist.
- [PRODUCT.md](PRODUCT.md) — product scope and what is implemented versus pending.
- [docs/adr/](docs/adr/) — architecture decisions; read before changing the area they cover.

## Commands

- `pnpm install --frozen-lockfile`, `pnpm dev`, `pnpm build` (output `dist/`; the PDF-engine chunk size warning is expected), `pnpm preview --port 4173`.
- `pnpm typecheck`, `pnpm lint` (Biome check: lint and formatting), `pnpm format` (Biome formatter: 2 spaces, 100 columns, single quotes), `pnpm test` (Vitest, jsdom).
- `pnpm test:e2e` — Playwright on system Chrome (`CHROME` overrides), mocked Tauri bridge from `tests/e2e/fixtures.ts`. Run `pnpm exec playwright test --workers=1`; timing-sensitive specs flake under load.
- `pnpm tauri dev` / `pnpm tauri build` — native builds need a configured Windows machine.

## Source map

| Path | Purpose |
| --- | --- |
| `src/main.tsx`, `src/App.tsx` | Entry and root |
| `src/shell/` | App frame (titlebar, sidebar, statusbar, header actions), routes (`route.ts`), shortcuts, file import, toasts, view transitions |
| `src/views/` | Home, Preview, Edit, Merge, Settings (incl. About) |
| `src/components/` | Shared UI: Dialog, editor (toolbar, stage, output inspector), page grid and cards |
| `src/dialogs/` | Add password and Split dialogs |
| `src/actions/save.ts` | Save as for every export |
| `src/state/` | Zustand stores: app, per-workspace document state (document and Merge), draft sync, export tracking (`work.ts`) |
| `src/domain/` | Pure logic: page model, history, selection, ranges, naming, formatting |
| `src/pdf/` | Load, render, thumbnail cache, export (worker plus core), document registry |
| `src/platform/` | Tauri/browser adapter: dialogs, fs, opener, updater |
| `src/storage/` | IndexedDB: recents and the document draft |
| `src/updates/` | Manual-only updates state machine and Settings row |
| `src/styles/` | CSS by area; breakpoints from DESIGN.md |
| `src/test/` | Vitest setup |
| `tests/e2e/`, `tests/unit/` | Playwright specs and fixtures; unit tests outside `src/` |
| `public/brand/` | Brand mark, wordmark, icons |
| `vite.config.ts` | Serves and bundles pdf.js CMaps and standard fonts under `/pdfjs/` |
| `src-tauri/` | Rust shell, `tauri.conf.json` (NSIS target, CSP), capabilities (no `core:default`; window minimize, toggle-maximize, close, destroy, start-dragging, internal-toggle-maximize; event listen/unlisten; resources close; updater check/download/install; dialog open; fs read-file; app `allow-save-as`; opener reveal-item-in-dir, open-path `**/*.pdf`, open-url to the GitHub repo) |
| `docs/adr/` | Architecture decision records (`<timestamp>_<title>.md`) |

Routes: `/index.html?view=home|preview|edit`, `?combine=new` (Merge; `combine` is the legacy internal name), `?recent=<id>` (append `&view=edit` to edit). The URL is written with `history.replaceState` only.

## Product rules

- Navigation: Home, Merge PDFs, Preview PDF, Edit PDF, Settings. Print Jobs and This Session / Project Pack were removed; keep them out.
- A workspace holds at most 2,000 pages (`MAX_PAGES`, `src/state/workspace.ts`).
- Saving goes through the Rust `save_as` command (native dialog, atomic temp-then-rename write); the webview has no `fs` write or `dialog` save permission.
- Home opens a PDF in read-only Preview. Page mutations belong in Edit; multi-document assembly belongs in Merge. Originals stay untouched.
- The app ships no sample or demo documents; it starts empty.
- Updates are manual only: no launch check; the app connects only when the user presses Check for updates.
- Add password requires matching passwords of 8–64 characters. Passwords live in form state only: never stored, logged or put in a store.

## Invariants

- Pages are `{uid, fileId, local, rotation}`; rotation (0/90/180/270) is per uid, duplicates get a new uid and inherit it. Export follows displayed order and adds rotation to the page's intrinsic `/Rotate`.
- Reorder patches keyed cards and cached thumbnails in place; remounting cards causes the flicker the user reported.
- Undo/redo keeps 40 in-memory snapshots per workspace, separate from the draft.
- Merge is never persisted. Only the Preview/Edit `document` draft is, and it keeps its own byte copy.
- Recents on desktop are path-based and store no bytes; byte copies deduped by SHA-256 exist only in browser mode.
- Each workspace has one export lock; every export runs inside `track()` (`src/state/work.ts`) so installing an update waits for it.
- IndexedDB `ifixpdf-prefs` holds the "Open PDF after saving" preference (`src/storage/prefs.ts`).
- Keep existing storage keys unless shipping a tested migration. No legacy-data migrations exist by owner decision.
- Native identifier `com.ifixpdf.desktop` and crate `ifixpdf` are fixed; changing them orphans user data and breaks upgrades.
- CSP stays `script-src 'self'` with workers on `worker-src 'self' blob:`; no `unsafe-eval`, no `dangerouslySetInnerHTML`.
- Release signing keys and endpoints stay out of source. Publishing releases or generating production credentials needs explicit user approval.

## Architecture decisions (ADRs)

- Before changing code, read the ADRs in `docs/adr/` whose topic touches the files or behavior you are changing (`ls docs/adr/`, then read the matching ones). Treat accepted ADRs like invariants.
- A change that contradicts an accepted ADR needs a new ADR that supersedes it; then set the old one's Status to `Superseded by <file>`. Never otherwise edit an accepted ADR.
- New decision → new file `docs/adr/<YYYYMMDDHHmmss>_<kebab-title>.md` (timestamp from `date +%Y%m%d%H%M%S`), so files never collide or overwrite. Sections: Status, Date, Context, Decision, Consequences.

## Verification

- Treat planned milestones as pending until implemented and verified. Record browser and Windows results separately; native installer/updater success requires Windows evidence.
- After export changes, verify the generated PDFs: page count, order, rotation, password enforcement, ZIP contents.
