# Per-user Windows install scope

- Status: Accepted
- Date: 2026-10-31

## Context

The Windows installer can install per machine (admin, UAC prompt) or per user. Updates run the new installer over the existing install, so the scope chosen for the first public release must match every later update.

## Decision

NSIS `installMode` is `currentUser` and the updater's `windows.installMode` is `passive` (`src-tauri/tauri.conf.json`). This is fixed from the first public release.

## Consequences

- Changing the scope later orphans existing installs: an updater or installer of the other scope would not replace them.
- No UAC prompt on install or update.
