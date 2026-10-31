import type {PDFDocumentProxy} from 'pdfjs-dist';
import {dropBytes, getBytes} from './bytes';
import {releaseFile} from './thumbnail-cache';

export type Owner = 'document' | 'merge' | 'home-thumb';

interface Entry {
  owners: Set<string>;
  proxy?: Promise<PDFDocumentProxy>;
}

const entries = new Map<string, Entry>();
export const liveDocuments = (): number => entries.size;

export function retain(fileId: string, owner: Owner): void {
  const entry = entries.get(fileId) ?? {owners: new Set<string>()};
  entry.owners.add(owner);
  entries.set(fileId, entry);
}

export async function release(fileId: string, owner: Owner): Promise<void> {
  const entry = entries.get(fileId);
  if (!entry?.owners.delete(owner) || entry.owners.size > 0) return;
  entries.delete(fileId);
  dropBytes(fileId);
  releaseFile(fileId);
  await entry.proxy?.then(
    (proxy) => proxy.destroy(),
    () => {},
  );
}

function entryFor(fileId: string): Entry {
  const entry = entries.get(fileId);
  if (!entry) throw new Error(`File ${fileId} is not retained`);
  return entry;
}

// Absolute: on http(s) origins (Tauri on Windows) pdf.js fetches these from its worker, whose base URL differs.
const pdfjsAsset = (dir: string): string =>
  new URL(`${import.meta.env.BASE_URL}pdfjs/${dir}/`, document.baseURI).href;

export function acquire(fileId: string): Promise<PDFDocumentProxy> {
  const entry = entryFor(fileId);
  entry.proxy ??= (async () => {
    const [pdfjs, worker] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    // pdf.js transfers the buffer to its worker, so hand it a copy.
    return pdfjs.getDocument({
      data: getBytes(fileId).slice(),
      cMapUrl: pdfjsAsset('cmaps'),
      cMapPacked: true,
      standardFontDataUrl: pdfjsAsset('standard_fonts'),
    }).promise;
  })();
  return entry.proxy;
}
