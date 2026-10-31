# App preferences live in IndexedDB

- Status: Accepted
- Date: 2026-10-31

## Context

Audit finding #23. "Open PDF after saving" (`openAfter` in `src/state/app.ts`) reset to on at
every launch. Web storage (`localStorage`/`sessionStorage`) is banned by
`tests/unit/security.test.ts`.

## Decision

- Preferences are one record in IndexedDB `ifixpdf-prefs` v1, store `prefs`, key `app`
  (`src/storage/prefs.ts`), shaped `{openAfter: boolean}`.
- `readPrefs` validates on read: a missing or malformed record is `null`.
- `startup` in `src/shell/route.ts` reads prefs alongside the draft, applies them, then subscribes
  to `openAfter` and calls `writePrefs`. Subscribing after applying avoids writing the stored
  value back. Read and write failures are ignored and never toast.

## Consequences

- The toggle survives restarts; a damaged or unreadable store falls back to the default (on).
- New preferences extend the `app` record and its validation in `prefs.ts`.
- Web storage stays banned.
