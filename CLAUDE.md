# iFixPDF

Windows desktop PDF tool. Frontend is vanilla JavaScript + Vite (not React) inside a Tauri 2 shell. All PDF work runs in the frontend (PDF.js, pdf-lib, pdf-lib-encrypt, fflate); Rust only hosts the window and the updater plugin.

- [IMPLEMENTATION.md](IMPLEMENTATION.md) — milestones and release criteria, including export compression and installed-PC updates.
- [DESIGN.md](DESIGN.md) — accepted interface; read before UI changes.
- [VERIFICATION.md](VERIFICATION.md) — historical check results and their scope.

## Commands

- `pnpm install --frozen-lockfile`, `pnpm dev`, `pnpm build` (output `dist/`; the PDF-engine chunk size warning is expected), `pnpm preview --port 4173`.
- `pnpm check:updates` — Playwright check of Settings → Updates against a mocked Tauri bridge; set `PLAYWRIGHT` and `CHROME`.
- `pnpm tauri dev` / `pnpm tauri build` — native builds need a configured Windows machine.

## Source map

| Path | Purpose |
| --- | --- |
| `src/main.js` | App shell, Home, Preview, Edit, Merge, selection/history, drafts, import/export, routes, shortcuts |
| `src/document-actions.js` | Add password (AES-256 protected copy) and Split (ZIP) dialogs |
| `src/style.css` | Desktop interface and responsive overrides |
| `src/recents.js`, `src/draft.js` | IndexedDB storage of recent PDF bytes and the workspace draft |
| `src/updates.js`, `src/work.js` | Updates state machine and launch check; in-flight export tracking that defers install |
| `src/home.js`, `src/home.css`, `library.html`, `desk.html` | Earlier Library/Desk concepts; keep unless deliberately retired |
| `src/brand.js`, `public/brand/` | Brand mark, wordmark, icons |
| `src-tauri/` | Rust shell, `tauri.conf.json` (NSIS target, CSP), capabilities (window + updater only) |

Routes: `/index.html?view=home|preview|edit`, `?combine=new` (Merge; `combine` is the legacy internal name), `?recent=<id>` (append `&view=edit` to edit).

## Product rules

- Navigation: Home, Merge PDFs, Preview PDF, Edit PDF, Settings. Print Jobs and This Session / Project Pack were removed; keep them out.
- Home opens a PDF in read-only Preview. Page mutations belong in Edit; multi-document assembly belongs in Merge. Originals stay untouched.
- The app ships no sample or demo documents; it starts empty.
- Add password requires matching passwords of 8+ characters and never persists them.

## Invariants

- Pages are instances `{fileId, local, uid}`; duplicates get distinct uids. Export follows displayed order and applies rotations.
- Reorder patches keyed cards and cached thumbnails in place — replacing nodes causes the flicker the user reported.
- Undo/redo keeps 40 in-memory snapshots, separate from the IndexedDB draft.
- Keep existing storage keys unless shipping a tested migration.
- Native identifier `com.ifixpdf.desktop` and crate `ifixpdf` are fixed; changing them orphans user data and breaks upgrades.
- Release signing keys and endpoints stay out of source. Publishing releases or generating production credentials needs explicit user approval.

## Verification

- Treat planned milestones as pending until implemented and verified. Record browser and Windows results separately; native installer/updater success requires Windows evidence.
- After export changes, verify the generated PDFs: page count, order, rotation, password enforcement, ZIP contents.
