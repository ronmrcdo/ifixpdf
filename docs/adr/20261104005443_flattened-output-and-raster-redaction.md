# Flattened output and raster redaction

- Status: Accepted
- Date: 2026-11-04

## Context

Fill, Sign and Redact add form values, text, marks, signatures and redaction boxes to pages. A redaction that only covers text with a black box leaves the text extractable, so the saved file must not contain the original page at all.

## Decision

- Output is flattened: markup is drawn into page content, and a file's form is flattened only when at least one of its fields was filled. An export with no fills and no markup takes the old path with no drawing and no raster pass.
- Each page with a redaction is rendered at 200 dpi (JPEG) and replaced by a full-bleed image in a fresh document. Pass 1 builds the PDF, pass 2 rasterizes the redacted pages on the main thread and swaps them in (`replaceWithImages`). It fails closed: a missing image aborts the export.
- Before copying into the fresh document, `isolate` empties every object a redacted page reaches that the kept pages do not need to draw: everything reachable from redacted pages (taint), minus what kept pages reach through a drawing-key allowlist, with resources pruned to the names their content operators use, and kept annotations stripped of back-links. A key missing from the allowlist can blank a shared object on a kept page, never leak redacted content.
- Redacted pages are rendered with their annotations, so form values and comments already on those pages stay visible in the image. Annotations paint over page content, so every redaction rect is painted solid black on the canvas after rendering, before JPEG encoding (the black box is also drawn into the content in pass 1).
- Every export path (Save as, Extract, Split ZIP, Preview Save a copy, Preview Print) carries markup and fills. Split ZIP with markup first builds the full output (including rasterization), then splits that finished PDF.

## Consequences

- Redacted pages lose selectable text and cost more time and size (one JPEG per page).
- Redaction cannot be undone in saved files; the originals stay untouched.
- New object keys that must survive on kept pages have to be added to the drawing-key allowlist in `src/pdf/redact.ts`.
