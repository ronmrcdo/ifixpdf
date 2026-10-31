# Save as is a Rust command; the webview cannot write files

- Status: Accepted
- Date: 2026-10-31

## Context

Audit findings #5 and #11. Saving ran in the webview: `plugin:dialog|save` picked a path and
`plugin:fs|write_file` wrote it, so the capability granted `dialog:allow-save` and
`fs:allow-write-file`. Any script in the webview could overwrite any file in the fs scope, and
`writeFile` truncated the target before writing, so a failed write destroyed the old file.

## Decision

- Saving goes through the app command `save_as` (`src-tauri/src/main.rs`). The body is the raw
  bytes; the `name` header is URI-encoded and `kind` is `pdf` or `zip`. Rust validates `kind`
  (`save_filter`, an unknown kind is an error), shows the native save dialog, then `write_atomic`
  writes `<path>.ifixpdf-tmp`, syncs it and renames it over the target. It returns the path, or
  `null` on cancel (`src/platform/tauri.ts` keeps the `saveAs` return shape).
- `src-tauri/build.rs` declares an app manifest for `save_as`, so app commands go through the ACL;
  `capabilities/default.json` grants `allow-save-as` to the main window.
- The webview has no `fs:allow-write-file` and no `dialog:allow-save`
  (`tests/unit/security.test.ts`, `tests/unit/legal.test.ts`).
- The saved path is added to the fs read scope, as the dialog plugin's save did, so recents can
  reopen it.

## Consequences

- A failed save leaves the old file intact and no temp file behind.
- Picked, dropped and saved files and dropped folders stay persisted as read scope
  (persisted-scope); a webview script can still read them. That is the remaining risk.
- New app commands need an entry in the manifest and a capability permission.
