# Every window close flushes the draft and waits for exports

- Status: Accepted
- Date: 2026-10-31

## Context

Audit finding #3. Only the titlebar Close button flushed the pending draft (`Titlebar.tsx`).
Alt+F4 and the taskbar close skipped it and lost the last edit, and any close could cut an
export short.

## Decision

- `Platform.window.onCloseRequested(handler)` (`src/platform/types.ts`, `tauri.ts`) wraps Tauri's
  `onCloseRequested`. The handler resolves `false` to keep the window open.
- `startup` in `src/shell/route.ts` registers one handler after `startDraftSync`. While `busy()`
  (`src/state/work.ts`) is true it shows "Wait for the save to finish." and keeps the window open;
  otherwise it awaits `flushDraft()` and lets the window close.
- Tauri skips `destroy()` if the handler throws, which would strand the window open, so the
  wrapper treats a throwing handler as "close".
- The titlebar Close button just calls `close()`; the handler does the flush.
- The capability adds `core:window:allow-destroy`, which Tauri needs to finish the close.

## Consequences

- Titlebar, Alt+F4 and taskbar closes behave the same.
- A user cannot close the window during an export; they retry once it finishes.
- A failed flush never blocks closing.
