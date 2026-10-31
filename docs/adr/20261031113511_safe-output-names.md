# Safe output file names and the "(edited)" default

- Status: Accepted
- Date: 2026-10-31

## Context

Audit findings #5 and #12. Output names came from the source file name or the user's text and
could hold path separators or Windows-reserved characters (`../x`). Preview/Edit also suggested
the original file's own name, so a quick Save as could overwrite the original, against the rule
"Originals stay untouched".

## Decision

- Every output-name helper in `src/domain/naming.ts` (`outputName`, `protectedName`,
  `splitZipName`, `splitPartName`, `extractName`, `editedName`) replaces `< > : " / \ | ? *` and
  control characters with `-` through a private `fileBase`.
- `exportTitle` keeps the unsanitized `base`; a title is metadata, not a path.
- `replaceWith` in `src/state/workspace.ts` sets the default name to `<name> (edited).pdf`
  (`editedName`), so the default never targets the original.

## Consequences

- A name such as `Q1/Q2` is saved as `Q1-Q2.pdf`.
- Users who want the original name type it in the Output file name field.
