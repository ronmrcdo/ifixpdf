# Export copies pages in batches

- Status: Accepted
- Date: 2026-10-31

## Context

Audit findings #1 and #2. `buildPdf` in `src/pdf/export-core.ts` called `copyPages` once per
page. Each call makes a new `PDFObjectCopier`, so resources shared by many pages (fonts, images)
were copied again for every page: a 20-page source that shares one 200 KB image exported at
about 20 times its size. `splitZip` called `buildPdf` per part, so it parsed each source once per
part.

## Decision

- Each export loads every source once (`loadSources`) and `buildFrom` copies all of a source's
  pages with a single `copyPages` call, so shared resources are copied once per export.
- `splitZip` loads the sources once for all parts and runs `buildFrom` per part.
- A repeated page goes in the same `copyPages` call. pdf-lib 1.17.1 clones the page dict for each
  index (`PDFObjectCopier.copyPDFPage` in
  `node_modules/pdf-lib/cjs/core/PDFObjectCopier.js`), so each copy keeps its own `/Rotate`.
  Never reuse one copied page for two display slots.

## Consequences

- Output size follows the source size, not the page count.
- Each split part still copies shared resources into its own file, as it should.
- The test `gives a page used twice its own rotation` in `src/pdf/export-core.test.ts` fails if
  a copied page is reused for two slots.
