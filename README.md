# iFixPDF

A Windows desktop PDF workspace for previewing, editing, merging, splitting and password-protecting PDFs. Built with vanilla JavaScript + Vite inside a Tauri 2 shell. All PDF processing runs locally in the frontend (PDF.js, pdf-lib, pdf-lib-encrypt, fflate).

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
| `pnpm check:updates` | Playwright check of Settings → Updates against a mocked Tauri bridge (set `PLAYWRIGHT` and `CHROME`) |
| `pnpm tauri dev` / `pnpm tauri build` | Native app and NSIS installer (Windows with the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)) |

## Features

- **Home** — recent PDFs, multi-file selection, right-click/More actions: View, Edit, Merge, Add password.
- **Preview** — read-only page browsing, zoom, fit and printing via the PDF viewer.
- **Edit** — reorder (drag or keyboard), rotate, duplicate, delete, extract, undo/redo, save an edited copy. Split exports page ranges or every page as a ZIP.
- **Merge** — Add PDFs → Arrange & review → Save PDF → Done, with source and cross-source page ordering. Originals are never modified.
- **Add password** — downloads an AES-256 protected copy.
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

`?view=home`, `?view=preview`, `?view=edit`, `?combine=new` (new Merge), `?recent=<id>`. `library.html` and `desk.html` are earlier alternative concepts.

## Project structure

```
src/            frontend (app shell, document actions, storage, updates)
public/brand/   logo and icons
src-tauri/      Rust shell, Tauri config and capabilities
tests/          Playwright checks
licenses/       third-party licenses
```

## Status

Working in the browser; not yet production-ready.

- Recents and drafts store PDF bytes in browser IndexedDB, and exports are browser downloads. Clearing browser data deletes them. Native open/save and a document repository are pending.
- The updater is wired but has no release endpoint or signing key, and is unverified on Windows.
- A Windows executable and installer have not been built or verified.
- Export compression is planned, not implemented.
- Opening password-protected PDFs is not supported.
- Fidelity with large or complex PDFs still needs validation.
- “Use file names as PDF title” sets the document title, not outline bookmarks.

## Documentation

- [IMPLEMENTATION.md](IMPLEMENTATION.md) — native Windows roadmap, compression, signed updates, release criteria
- [DESIGN.md](DESIGN.md) — accepted interface design
- [PRODUCT.md](PRODUCT.md) — product scope
- [VERIFICATION.md](VERIFICATION.md) — historical checks and their scope
- [CLAUDE.md](CLAUDE.md) — guide for coding agents
