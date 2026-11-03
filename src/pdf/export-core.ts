import * as pdfLib from 'pdf-lib';
import {PDFDocument, type PDFPage, degrees} from 'pdf-lib';
import {configure, lock} from 'pdf-lib-encrypt';
import {zipSync} from 'fflate';
import type {Fills, Markup} from '../domain/markup';
import type {FileId, Rotation} from '../domain/types';
import {splitPartName} from '../domain/naming';
import {applyFills, drawMarkup} from './markup-draw';

export interface ExportSpec {
  pages: Array<{fileId: FileId; local: number; rotation: Rotation; markup?: readonly Markup[]}>;
  fills?: Fills;
  sources: Record<FileId, Uint8Array>;
  title: string;
}
export type Progress = (done: number, total: number) => void;

export async function loadSources(
  sources: Record<FileId, Uint8Array>,
  ids: Iterable<FileId>,
): Promise<Map<FileId, PDFDocument>> {
  const loaded = new Map<FileId, PDFDocument>();
  for (const id of new Set(ids)) {
    const bytes = sources[id];
    if (!bytes) throw new Error('Missing source file.');
    loaded.set(id, await PDFDocument.load(bytes));
  }
  return loaded;
}

export async function buildFrom(
  loaded: Map<FileId, PDFDocument>,
  pages: ExportSpec['pages'],
  title: string,
  fills: Fills = {},
  onProgress?: Progress,
): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const slots = new Array<PDFPage | undefined>(pages.length);
  // One copyPages per source shares resources across its pages; pdf-lib clones the page
  // dict per index, so a repeated page still gets its own /Rotate.
  for (const [fileId, doc] of loaded) {
    const values = fills[fileId];
    // Flatten before copyPages: pdf-lib drops /AcroForm on copy, leaving dead widgets.
    if (values && Object.keys(values).length) applyFills(doc, values);
    const at = pages.flatMap((p, i) => (p.fileId === fileId ? [i] : []));
    const copied = await out.copyPages(
      doc,
      at.map((i) => pages[i]!.local),
    );
    at.forEach((i, k) => {
      slots[i] = copied[k];
    });
  }
  for (const [i, item] of pages.entries()) {
    const page = slots[i];
    if (!page) throw new Error('Missing source page.');
    page.setRotation(degrees((page.getRotation().angle + item.rotation) % 360));
    if (item.markup?.length) await drawMarkup(page, item.markup, out);
    out.addPage(page);
    onProgress?.(i + 1, pages.length);
  }
  out.setTitle(title);
  out.setCreator('iFixPDF PDF workspace');
  return out.save();
}

export async function buildPdf(spec: ExportSpec, onProgress?: Progress): Promise<Uint8Array> {
  const loaded = await loadSources(
    spec.sources,
    spec.pages.map((p) => p.fileId),
  );
  return buildFrom(loaded, spec.pages, spec.title, spec.fills, onProgress);
}

export async function countPages(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes)).getPageCount();
}

export function protectPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  configure(pdfLib);
  return lock(bytes, password, {algo: 'aes256'});
}

export async function splitZip(
  spec: ExportSpec,
  groups: number[][],
  baseName: string,
  onProgress?: Progress,
): Promise<Uint8Array> {
  const parts = groups.map((group) =>
    group.map((n) => spec.pages[n]).filter((p): p is ExportSpec['pages'][number] => !!p),
  );
  const loaded = await loadSources(
    spec.sources,
    parts.flat().map((p) => p.fileId),
  );
  const entries: Record<string, Uint8Array> = {};
  for (const [i, pages] of parts.entries()) {
    // No fills here: export.ts builds fills and markup first, then splits that output.
    entries[splitPartName(baseName, i + 1)] = await buildFrom(loaded, pages, spec.title);
    onProgress?.(i + 1, groups.length);
  }
  return zipSync(entries);
}
