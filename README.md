# iFixPDF — Windows PDF workspace

The preferred interface is `index.html`: Home, Merge PDFs, read-only Preview PDF, Edit PDF and Settings. `library.html` and `desk.html` are earlier alternative concepts. The product uses a custom folded-F logo, IBM Plex Sans and Lucide icons.

## Run

```sh
npm ci
npm run dev
```

For production preview, run `npm run build` then `npm run preview -- --port 4173`. Open `/index.html?view=home`.

On a Windows machine with the [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/), use `npm run tauri dev` or `npm run tauri build`. The Rust shell and NSIS/icon configuration are supplied, but a Windows executable and installer have not been built or verified here.

## Working prototype

Import unlocked PDFs; read, merge, rearrange, rotate, duplicate, delete, extract and save pages. Home has recent PDFs, multi-file selection and right-click/More actions for View, Edit, Merge and Add password. Password protection downloads a protected copy. Edit → Pages → Split PDF exports page ranges or every page into a ZIP.

Preview remains read-only with no output inspector. Edit has page controls and Save edited PDF. Merge uses Add → Arrange & review → Save PDF → Done. Page dragging retains the live grid and images. Multi-selection supports checkboxes, Ctrl/Cmd-click, Shift-click and Ctrl/Cmd+A; history uses Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y. Alt+Left/Right moves a focused page. Ctrl+O opens files, Ctrl+S saves and Ctrl+P uses the PDF viewer for printing.

Recents/drafts retain PDF bytes in local IndexedDB. Browser data deletion removes them; undo history lasts for the session. This is prototype storage, not a filesystem index. Exports use browser downloads, and manual printing opens a PDF viewer. Print Jobs and This Session / Project Pack have been removed.

Useful routes: `?view=home`, `?view=preview`, `?view=edit`, `?combine=new` (new Merge), `?demo=save`, `?demo=done`. Demo Done explicitly claims no download. Northstar samples are synthetic documents.

## Production work and Claude handoff

Start Claude with [CLAUDE.md](CLAUDE.md) and [CLAUDE_HANDOFF.md](CLAUDE_HANDOFF.md). [IMPLEMENTATION.md](IMPLEMENTATION.md) contains the native Windows roadmap, export compression, signed installed-PC updates and release acceptance criteria. Compression and the updater are planned, not implemented. [DESIGN.md](DESIGN.md) records the accepted design; [VERIFICATION.md](VERIFICATION.md) records historical checks and their scope.

PDF.js/pdf-lib and the encryption library run in the frontend; Rust supplies only the shell. Native open/save services, storage migration, Windows installation/upgrades/signing, large/complex PDF fidelity and password-required source import need implementation or production validation. Virtual-printer integration is outside the current release scope. The metadata option “Use file names as PDF title” writes a title, not outline bookmarks.
