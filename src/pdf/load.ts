export class InvalidPdfError extends Error {
  constructor(name: string, cause?: unknown) {
    super(`${name} is not a valid, unlocked PDF.`, {cause});
    this.name = 'InvalidPdfError';
  }
}

/** The single validation path: parse with pdf-lib (rejects encrypted files) and require 1+ pages. */
export async function loadPdf(name: string, bytes: Uint8Array): Promise<{pages: number}> {
  if (bytes.byteLength === 0) throw new InvalidPdfError(name);
  const {countPages} = await import('./export');
  let pages: number;
  try {
    pages = await countPages(bytes);
  } catch (error) {
    throw new InvalidPdfError(name, error);
  }
  if (pages === 0) throw new InvalidPdfError(name);
  return {pages};
}
