# iFixPDF

A Windows desktop PDF workspace for previewing, editing, merging, splitting and password-protecting PDFs. Built with React 19 + TypeScript + Vite inside a Tauri 2 shell. All PDF processing runs locally in the frontend (PDF.js, pdf-lib, pdf-lib-encrypt, fflate).

## Getting started

Requires Node.js and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `/index.html?view=home`.

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Vite dev server |
| `pnpm build` | Production build to `dist/` |
| `pnpm preview --port 4173` | Serve the production build |
| `pnpm typecheck` / `pnpm lint` | TypeScript (strict) and Biome |
| `pnpm test` | Vitest unit and component tests |
| `pnpm test:e2e` | Playwright browser tests in `tests/e2e` against a mocked Tauri bridge (`CHROME` overrides the browser; use `--workers=1`) |
| `pnpm tauri dev` / `pnpm tauri build` | Native app and NSIS installer (Windows with the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)) |

## Features

- **Home** — recent PDFs, multi-file selection, right-click/More actions: View, Edit, Merge, Add password.
- **Preview** — read-only page browsing, zoom, fit and printing via the PDF viewer.
- **Edit** — reorder (drag or keyboard), rotate, duplicate, delete, extract, undo/redo, save an edited copy. Split exports page ranges or every page as a ZIP.
- **Merge** — Add PDFs → Arrange & review → Save PDF → Done, with source and cross-source page ordering. Originals are never modified.
- **Add password** — saves an AES-256 protected copy.
- **Settings → Updates** — check, release notes, download progress and restart-to-install.

The app ships no sample documents; open your own PDFs.

### Keyboard shortcuts

| Action | Keys |
| --- | --- |
| Open / Save / Print | Ctrl+O / Ctrl+S / Ctrl+P |
| Select all, add to selection, range select | Ctrl/Cmd+A, Ctrl/Cmd-click, Shift-click |
| Undo / Redo | Ctrl/Cmd+Z / Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y |
| Move focused page | Alt+Left / Alt+Right |

### Routes

`?view=home`, `?view=preview`, `?view=edit`, `?combine=new` (new Merge), `?recent=<id>`.

## Project structure

```
src/            React + TypeScript frontend (shell, views, state, pdf, storage, platform)
public/brand/   logo and icons
src-tauri/      Rust shell, Tauri config and capabilities
tests/          Playwright e2e specs and unit tests
licenses/       third-party licenses
```

## Status

Working in the browser; not yet production-ready.

- In the desktop app, recents store file paths, not PDF bytes; the browser build keeps byte copies of recents in IndexedDB. The Preview/Edit draft keeps its own byte copy. Clearing app or browser data deletes them.
- Exports use a native Save as dialog in the desktop app. Native open, drag-and-drop and Save as are implemented but not yet verified on Windows.
- The updater is wired but has no release endpoint or signing key, and is unverified on Windows.
- A Windows executable and installer have not been built or verified.
- Export compression is planned, not implemented.
- Opening password-protected PDFs is not supported.
- Fidelity with large or complex PDFs still needs validation.
- “Use file names as PDF title” sets the document title, not outline bookmarks.

## How to release

1. Write the entry in `CHANGELOG.md`, newest first, for users rather than developers:
   - Heading `## vX.Y.Z — Month YYYY`, then a one-sentence summary.
   - Optional `### Featured: <title>` with a short paragraph and a three-step **How to use it** list naming buttons as they appear in the app.
   - Then 3–6 items, each labeled **New**, **Improved** or **Fixed**, with a bold short title and one or two sentences. No nested bullets.
   - Say "you"; no file names, code, hashes, library names or jargon; skip behind-the-scenes work.
2. On `main` with a clean tree, run `pnpm release X.Y.Z`. It bumps `package.json`, `Cargo.toml` and `Cargo.lock`, commits `chore(release): vX.Y.Z` and tags it. Without an entry it lists the `feat`/`fix` commits since the last tag and stops.
3. Push the command it prints: `git push origin main vX.Y.Z`.
4. Review the draft release on GitHub, then publish it.

## Documentation

- [IMPLEMENTATION.md](IMPLEMENTATION.md) — native Windows roadmap, compression, signed updates, release criteria
- [DESIGN.md](DESIGN.md) — accepted interface design
- [PRODUCT.md](PRODUCT.md) — product scope
- [VERIFICATION.md](VERIFICATION.md) — historical checks and their scope
- [CLAUDE.md](CLAUDE.md) — guide for coding agents
