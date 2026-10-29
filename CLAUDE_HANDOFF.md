# Claude handoff — iFixPDF

Prepared 29 October 2026. This is a continuation handoff for the existing project, not a request to replace its design or rewrite its stack. The user's latest request was to add installed-PC updates to the plan and prepare this handoff. Runtime updater integration is still pending.

## Start here

1. Read IMPLEMENTATION.md for milestones and completion criteria, DESIGN.md for the accepted interface, and package.json / src-tauri configuration for the actual stack.
2. Run `npm ci`, `npm run build`, and `npm run dev` from this directory. Inspect `/index.html?view=home` before changing UI. Build output is `dist/`; production preview uses `npm run preview -- --port 4173`.
3. On a configured Windows machine, establish the native baseline using `npm run tauri dev` and `npm run tauri build`. Report toolchain and platform limitations accurately.
4. Continue the requested milestone while keeping the current browser flows operational. The updater belongs in the first public native release; compression remains a proposed export feature to implement and verify.

## Accepted product decisions

- Name: **iFixPDF**. Preferred interface: original blue-grey Windows-style desktop shell, IBM Plex Sans, flat compact controls and Lucide icons. The user rejected the more website-like alternatives.
- Logo: folded white F on blue, with pale blue page fold. Assets are in `public/brand/`; shared UI markup is in `src/brand.js`. PNG and multi-resolution Windows ICO assets are supplied; Tauri references `src-tauri/icons/icon.png` and `icon.ico`.
- Main navigation: Home, Merge PDFs, Preview PDF, Edit PDF, Settings. Preserve removal of Print Jobs and This Session / Project Pack. Virtual-printer integration is outside the current release scope.
- Home: real recent PDF rows, selection checkboxes, right-click and visible More menu with View, Edit, Merge, Add password. Opening a PDF goes to read-only Preview, never directly to Merge.
- Preview: document/pages browsing, zoom, fit, navigation and manual printing. No output inspector, mutation controls or mutation keyboard shortcuts.
- Edit: reorder pages with drag or keyboard/buttons, rotate, multi-select, duplicate, delete, extract, split, undo/redo, save edited copy. Split creates PDFs by ranges or every page and downloads one ZIP; it leaves the workspace unchanged.
- Merge: Add PDFs → Arrange & review → Save PDF → Done, with source ordering and cross-source page ordering. Keep originals untouched and distinguish demo completion from a real requested download.
- Proposed compression: Original quality default, Balanced, Smallest file in Edit/Merge save settings, with measured output size, quality tradeoff and preview. No compression UI or optimizer is currently implemented.
- Planned update UX: Settings → Updates, version/check/release notes/download progress/restart-and-install, safe draft persistence and deferred restart. See IMPLEMENTATION.md for release details.

## Source map and implemented behavior

| File | Purpose |
| --- | --- |
| `src/main.js` | Preferred app shell, Home, read-only Preview, Merge/Edit, selection/history, drafts, import/export, routes and keyboard shortcuts |
| `src/document-actions.js` | Password dialog, AES-256 protected-copy export, Split dialog, ZIP output; native HTML dialog focus and success states |
| `src/style.css` | Preferred desktop interface and responsive overrides |
| `src/recents.js`, `src/draft.js` | Prototype IndexedDB storage of PDF bytes and workspace draft |
| `src/home.js`, `src/home.css` | Earlier Library/Desk alternatives; preserve unless deliberately retired |
| `src/brand.js`, `public/brand/` | Shared brand mark, SVG wordmark, PNG icon exports and identity preview |
| `src-tauri/src/main.rs` | Minimal Rust shell; no document service or updater registration |
| `src-tauri/tauri.conf.json` | iFixPDF product/window, NSIS target, icons, CSP and frontend commands |
| `src-tauri/capabilities/default.json` | Current window-control permissions; no updater/filesystem service yet |
| `VERIFICATION.md` | Historical browser/export checks; inspect dates and scope |

The frontend is vanilla JavaScript + Vite, not React. Dependencies include PDF.js, pdf-lib, pdf-lib-encrypt, fflate, Lucide, IBM Plex Sans and Tauri API. Rust currently provides only the shell. Browser downloads and viewer tabs are not native filesystem saves or Windows spooler integration.

Page order uses unique page-instance IDs: `{fileId, local, uid}`. Duplicated source pages must get distinct IDs. Export assembles the displayed order and applies rotations. Reorder patches keyed cards and cached thumbnail images in place; preserve this to avoid the screen-refresh flicker the user reported. Undo/redo retains up to 40 session snapshots; IndexedDB draft persistence is separate from session history.

Source/view caches live in memory. Recents and drafts currently retain PDF bytes in origin-scoped IndexedDB; pins for alternatives use localStorage. Keep existing storage keys during cosmetic renames unless implementing a tested migration. Native document identity, storage limits, sensitive-data retention and database migrations need production design.

Add password exports a protected copy, checks matching passwords of at least eight characters, and does not persist the password. Password-required source import/unlock is not implemented. Encryption output was independently tested using PDF.js with correct, missing and wrong passwords; that is not a full security review. Audit library suitability and test a broad PDF corpus before shipping.

## Routes and checks

- `/index.html?view=home`: preferred Home.
- `/index.html?view=preview` or `?view=edit`: populated viewer/editor examples.
- `/index.html?combine=new`: new Merge flow. Legacy internal `combine` keys remain for compatibility; visible wording is Merge.
- `/index.html?demo=save` and `?demo=done`: save and explicitly labeled completion demonstrations.
- `/index.html?recent=<id>`: stored recent in Preview; append `&view=edit` to edit it.
- `/library.html` and `/desk.html`: alternate concepts.

Previously passed browser checks cover read-only Preview, Home routing/context menus, selected-file Merge, page selection/history/reorder without node replacement, valid exports with page order/rotation, password validation/enforcement, Split ZIP page counts, and responsive widths 1440/768/390. The production build passed after branding. The PDF-engine bundle still emits Vite's size warning.

Test paths are not a portable suite in the source bundle. In the original workspace, ad hoc Playwright scripts and PDF fixtures live in `../../work/` relative to this project; they contain machine-specific runtime/Chrome paths. Inspect and adapt them if present, or create portable focused checks. Do not assume those files accompany this handoff.

After changing export behavior, verify actual generated PDFs, page counts/order/rotation, text/search preservation where promised, password enforcement and ZIP contents. Check Home → Preview → Edit, Merge Save/Done, keyboard focus, multi-selection and retained thumbnail nodes. Browser tests do not verify native installation, upgrades, code signing or printing.

## Windows updater handoff

Current code has no updater dependency, Rust registration, signing key, endpoint, CI release workflow or Updates settings UI. The roadmap specifies Tauri 2 updater + NSIS + GitHub Releases/static HTTPS manifest as the starting architecture. Read the current official guide linked in IMPLEMENTATION.md before implementation and pin compatible dependencies/toolchain.

Keep release secrets outside source and archives. A public verification key is configuration; the private signer stays in protected release infrastructure. Production hosting and signing ownership need user-supplied decisions. Prepare modules, development fixtures and UI before those inputs block release; label unconfigured development state accurately. Do not publish releases, generate production credentials or claim auto-update readiness from mocked progress.

Product display name is iFixPDF, while native identifier is still `com.folio.pdfworkspace` and Rust crate is `folio`. Preserve upgrade/data continuity when settling identity; confirm existing installed-build identity before changing it. Version is currently 0.1.0. Include updater support before public release; older installations without it need a manual installer upgrade first.

## Handoff completion expectations

When implementing a milestone, deliver the working change, relevant source/docs, actual test results and remaining release inputs. Retain the user's established scope and explain material limitations. Ask only for missing decisions that block the next concrete step. Publishing and external communication require explicit user authorization.
