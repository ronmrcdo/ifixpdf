# iFixPDF

A Windows desktop PDF workspace using Tauri 2 + Rust. The preferred browser prototype is a compact blue-grey desktop shell with Home, Merge PDFs, read-only Preview PDF, Edit PDF and Settings. IBM Plex Sans, Lucide controls and the folded-F iFixPDF logo define the interface. The frontend is React 19 + TypeScript (strict) on Vite.

Working frontend features include PDF.js preview, pdf-lib merge/export, page reorder/rotation, multi-selection, duplicate/delete/extract, session undo/redo, IndexedDB recents/drafts, Home document actions, AES-256 protected-copy export and range/every-page Split to ZIP. Home opens Preview; Edit owns mutations and its save inspector. Merge has Add → Arrange → Save → Done stages. Print Jobs and This Session / Project Pack were explicitly removed.

Installed-PC updates (manual check, Settings → About) and native file saves (Rust `save_as` command) are implemented and verified in the browser only. Compression in Edit/Merge save settings is planned in IMPLEMENTATION.md and not implemented. Windows build/installer verification and signing remain pending. Rust currently supplies only the shell; there is no shipped Windows executable. Manual PDF-viewer printing is available.

The app ships no sample documents and starts with an empty workspace. Browser PDF bytes are stored locally in origin-scoped IndexedDB; production should use an explicitly designed native document repository and retention policy.
