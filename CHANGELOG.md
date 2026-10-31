What's new in iFixPDF, newest first.

## v0.1.2 — November 2026

- **New** — Write release notes and push automatically
- **New** — Pick the version interactively in pnpm release
- **New** — Add third-party notice for libraries bundled in the Linux AppImage
- **New** — Generate third-party notices and gate licenses
- **New** — Add release body and tag preflight
- **New** — Add changelog helpers and pnpm release
- **New** — Remember "Open PDF after saving"
- **New** — Save through the Rust save_as command
- **New** — Add a save_as command that writes atomically
- **New** — Bundle pdf.js CMaps and standard fonts
- **New** — Restyle the workspace as a continuous light surface
- **Fixed** — Show plain names for generated license notices
- **Fixed** — Push main and tag atomically, document latest.json check
- **Fixed** — Create notices folder, block builds after a cancelled draft, warn on partial drafts
- **Fixed** — Add LGPL-2.0 text and missing notices, tighten AppImage notice test
- **Fixed** — Drop safety claim and fix update wording in release body
- **Fixed** — Keep expected git errors off the console
- **Fixed** — Make the read-scope grant after Save as best effort
- **Fixed** — Say the Preview and Edit draft could not be saved
- **Fixed** — Overwrite a stale draft when a file opened during startup wins
- **Fixed** — Keep the version label right-aligned without the draft note
- **Fixed** — Show whether the draft actually saved
- **Fixed** — Re-check exports after saving the draft
- **Fixed** — Flush the draft on every window close
- **Fixed** — Let a file opened during startup win over the draft
- **Fixed** — Drop a damaged draft instead of failing startup
- **Fixed** — Keep the saved result only in Merge
- **Fixed** — Refuse to delete every page
- **Fixed** — Make output names safe and default to "(edited)"
- **Fixed** — Check the recent is a valid PDF before Add password
- **Fixed** — Reject a thumbnail build that outlives its file
- **Fixed** — Cap a workspace at 2,000 pages
- **Fixed** — Match Merge picks by name and path
- **Fixed** — Send only the sources the chosen range uses
- **Fixed** — Copy pages per source in one batch

## v0.1.1 — November 2026

Beta release for testing.
