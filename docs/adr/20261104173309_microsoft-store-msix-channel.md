# The Microsoft Store is a second Windows channel (MSIX)

- Status: Accepted
- Date: 2026-11-03

## Context

iFixPDF ships to Windows through GitHub releases (NSIS installer, in-app updater). The Microsoft
Store requires an MSIX package, and Store apps must not update themselves: the Store does it.

## Decision

- The Store build is the same executable packaged as MSIX. The Rust command `is_store_install`
  (`GetCurrentPackageFullName`; false off Windows) tells the frontend it runs packaged.
- A packaged run disables the updater: `UpdateStatus` has a terminal `store` state, entered at
  startup and by `runCheck`, with the copy "Updates come from the Microsoft Store." No check,
  download or install runs.
- The GitHub channel is unchanged: manual updates only, NSIS installer.
- The two installs keep separate data (MSIX redirects app data), so settings, recents and drafts
  are not shared between them.
- The WebView2 runtime is assumed present.

## Consequences

- One capability is added: `allow-is-store-install` (app command in `src-tauri/build.rs`).
- Users who switch channels start with empty recents and preferences.
- A packaged build whose detection fails (invoke error) falls back to the normal updater path.
