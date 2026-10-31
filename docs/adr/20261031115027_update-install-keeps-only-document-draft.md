# An update install saves only the document draft and re-checks exports

- Status: Accepted
- Date: 2026-10-31

## Context

Audit finding #4. `runInstall` (`src/updates/machine.ts`) checked `busy()` once, before
`saveDraft()`. An export started during the draft save could be cut short by the install.
The ready text ("Your workspace is saved") also implied that Merge work was saved too.

## Decision

- An install saves only the Preview/Edit `document` draft (`saveDraftNow`). Merge is never
  persisted (see `window-close-flushes-draft`).
- `runInstall` re-checks `busy()` after `await deps.saveDraft()`. If an export is now tracked, it
  shows "Install the update after your export finishes." and leaves the state at `ready`, as the
  first check does.
- The ready copy in `src/updates/UpdatesRow.tsx` says what is saved: "Your Preview and Edit draft
  is saved before restarting; Merge PDFs starts empty."

## Consequences

- Install never starts while an export is tracked, including one that starts during the save.
- Users can see that Merge contents are not kept across an update.
- The Retry path behaves as before: the user presses Restart and install again.
