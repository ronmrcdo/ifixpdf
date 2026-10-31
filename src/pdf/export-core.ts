import * as pdfLib from 'pdf-lib';
import {PDFDocument, degrees} from 'pdf-lib';
import {configure, lock} from 'pdf-lib-encrypt';
import {zipSync} from 'fflate';
import type {FileId, Rotation} from '../domain/types';
import {splitPartName} from '../domain/naming';

export interface ExportSpec {
  pages: Array<{fileId: FileId; local: number; rotation: Rotation}>;
  sources: Record<FileId, Uint8Array>;
  title: string;
}
export type Progress = (done: number, total: number) => void;

export async function buildPdf(spec: ExportSpec, onProgress?: Progress): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  const loaded = new Map<FileId, Promise<PDFDocument>>();
  const total = spec.pages.length;
  for (const [i, item] of spec.pages.entries()) {
    const bytes = spec.sources[item.fileId];
    if (!bytes) throw new Error('Missing source file.');
    if (!loaded.has(item.fileId)) loaded.set(item.fileId, PDFDocument.load(bytes));
    const [page] = await out.copyPages(await loaded.get(item.fileId)!, [item.local]);
    if (!page) throw new Error('Missing source page.');
    page.setRotation(degrees((page.getRotation().angle + item.rotation) % 360));
    out.addPage(page);
    onProgress?.(i + 1, total);
  }
  out.setTitle(spec.title);
  out.setCreator('iFixPDF PDF workspace');
  return out.save();
}

export function protectPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  configure(pdfLib);
  return lock(bytes, password, {algo: 'aes256'});
}

export async function splitZip(spec: ExportSpec, groups: number[][], baseName: string, onProgress?: Progress): Promise<Uint8Array> {
  const entries: Record<string, Uint8Array> = {};
  for (const [i, group] of groups.entries()) {
    const pages = group.map((n) => spec.pages[n]).filter((p): p is ExportSpec['pages'][number] => !!p);
    entries[splitPartName(baseName, i + 1)] = await buildPdf({...spec, pages});
    onProgress?.(i + 1, groups.length);
  }
  return zipSync(entries);
}
