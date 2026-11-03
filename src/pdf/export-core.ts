import * as pdfLib from 'pdf-lib';
import {
  PDFArray,
  type PDFContext,
  PDFDict,
  PDFDocument,
  PDFName,
  type PDFObject,
  type PDFPage,
  PDFPageLeaf,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
  degrees,
} from 'pdf-lib';
import {configure, lock} from 'pdf-lib-encrypt';
import {strFromU8, zipSync} from 'fflate';
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

const RESOURCES = PDFName.of('Resources');
const PARENT = PDFName.of('Parent');
const decodeName = (n: string): string =>
  n.replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(Number.parseInt(h, 16)));

// Every /Name token in the content: a superset of the resource names it uses.
function namesIn(streams: PDFStream[]): Set<string> {
  const names = new Set<string>();
  for (const s of streams) {
    if (!(s instanceof PDFRawStream)) throw new Error('Unreadable page content.');
    const text = strFromU8(decodePDFRawStream(s).decode(), true);
    for (const [, n] of text.matchAll(/\/([^\s/[\]()<>{}%]+)/g)) names.add(decodeName(n!));
  }
  return names;
}

// Keeps only the resources `owner`'s content names, recursing into what it keeps, so a
// resource dict shared with a redacted page cannot drag that page's content along on copy.
function prune(owner: PDFDict, content: PDFStream[], seen: Set<PDFDict>): void {
  if (seen.has(owner)) return;
  seen.add(owner);
  const res = owner.lookupMaybe(RESOURCES, PDFDict);
  if (!res) return;
  const names = namesIn(content);
  const kept = owner.context.obj({});
  for (const [category, value] of res.entries()) {
    const sub = owner.context.lookup(value);
    if (!(sub instanceof PDFDict)) {
      kept.set(category, value); // e.g. /ProcSet
      continue;
    }
    const keptSub = owner.context.obj({});
    for (const [name, ref] of sub.entries()) {
      if (!names.has(name.decodeText())) continue;
      keptSub.set(name, ref);
      pruneWithin(owner.context, ref, seen);
    }
    kept.set(category, keptSub);
  }
  owner.set(RESOURCES, kept);
}

// A kept resource with resources of its own: form or tiling pattern, Type3 font, soft-mask group.
function pruneWithin(ctx: PDFContext, value: PDFObject | undefined, seen: Set<PDFDict>): void {
  const obj = ctx.lookup(value);
  if (obj instanceof PDFStream) return prune(obj.dict, [obj], seen);
  if (!(obj instanceof PDFDict)) return;
  const procs = obj.get(PDFName.of('CharProcs'));
  if (procs) prune(obj, streamsOf(ctx, procs), seen);
  const smask = ctx.lookup(obj.get(PDFName.of('SMask')));
  if (smask instanceof PDFDict) pruneWithin(ctx, smask.get(PDFName.of('G')), seen);
}

const streamsOf = (ctx: PDFContext, value: PDFObject | undefined): PDFStream[] => {
  const obj = ctx.lookup(value);
  if (obj instanceof PDFStream) return [obj];
  if (obj instanceof PDFArray) return obj.asArray().flatMap((v) => streamsOf(ctx, v));
  if (obj instanceof PDFDict) return obj.values().flatMap((v) => streamsOf(ctx, v)); // AP states
  return [];
};

// Refs reachable from `roots`. Page dicts are not entered: each is kept or emptied on its own.
function reach(ctx: PDFContext, roots: Array<PDFObject | undefined>): Set<PDFRef> {
  const refs = new Set<PDFRef>();
  const seen = new Set<PDFObject>();
  const stack = roots.filter((r): r is PDFObject => r !== undefined);
  for (let obj = stack.pop(); obj; obj = stack.pop()) {
    if (seen.has(obj)) continue;
    seen.add(obj);
    if (obj instanceof PDFRef) {
      const target = ctx.lookup(obj);
      if (target instanceof PDFPageLeaf) continue;
      refs.add(obj);
      if (target) stack.push(target);
    } else if (obj instanceof PDFStream) stack.push(...obj.dict.values());
    else if (obj instanceof PDFDict) stack.push(...obj.values());
    else if (obj instanceof PDFArray) stack.push(...obj.asArray());
  }
  return refs;
}

const CONTENTS = PDFName.of('Contents');
const ANNOTS = PDFName.of('Annots');
// Links from an annotation back into the form tree, a thread or another page.
const BACK_CHAIN = ['Parent', 'IRT', 'Popup', 'P'].map((n) => PDFName.of(n));

// Cuts every path from the kept pages to a dropped page (redacted, or an orphan copy reached
// through a link /Dest). Kept pages keep only the resources they draw and lose annotation
// back-links; then anything a dropped page reaches that kept content does not is emptied, so an
// unforeseen reference from a kept page can only ever copy an empty dict.
function isolate(doc: PDFDocument, kept: PDFPage[]): void {
  const ctx = doc.context;
  const keep = new Set(kept.map((p) => p.ref));
  const dropped = ctx
    .enumerateIndirectObjects()
    .flatMap(([ref, obj]) => (obj instanceof PDFPageLeaf && !keep.has(ref) ? [{ref, obj}] : []));
  const tainted = reach(
    ctx,
    dropped.flatMap(({obj}) => obj.entries().flatMap(([k, v]) => (k === PARENT ? [] : [v]))),
  );
  const seen = new Set<PDFDict>();
  const drawn: Array<PDFObject | undefined> = [];
  const allowed = new Set<PDFRef>(); // copied as-is, not followed
  for (const page of kept) {
    const contents = page.node.get(CONTENTS);
    prune(page.node, streamsOf(ctx, contents), seen);
    drawn.push(contents, page.node.get(RESOURCES));
    const list = page.node.get(ANNOTS);
    if (list instanceof PDFRef) allowed.add(list);
    for (const annot of page.node.lookupMaybe(ANNOTS, PDFArray)?.asArray() ?? []) {
      if (annot instanceof PDFRef) allowed.add(annot);
      const dict = ctx.lookup(annot);
      if (!(dict instanceof PDFDict)) continue;
      for (const key of BACK_CHAIN) dict.delete(key); // pdf-lib drops /AcroForm on copy anyway
      const ap = dict.get(PDFName.of('AP'));
      for (const form of streamsOf(ctx, ap)) prune(form.dict, [form], seen);
      drawn.push(ap);
    }
  }
  for (const ref of reach(ctx, drawn)) allowed.add(ref);
  for (const {ref} of dropped) ctx.assign(ref, ctx.obj({}));
  for (const ref of tainted) if (!allowed.has(ref)) ctx.assign(ref, ctx.obj({}));
}

/** Swaps each listed page for a full-bleed JPEG and copies everything into a fresh document. */
export async function replaceWithImages(
  bytes: Uint8Array,
  images: Array<{index: number; jpeg: Uint8Array}>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const jpegs = new Map(images.map((i) => [i.index, i.jpeg]));
  if (images.some((i) => !pages[i.index])) throw new Error('Redacted page is out of range.');
  const keptAt = pages.flatMap((_, i) => (jpegs.has(i) ? [] : [i]));
  isolate(
    doc,
    keptAt.map((i) => pages[i]!),
  );
  const out = await PDFDocument.create();
  const copied = await out.copyPages(doc, keptAt);
  let k = 0;
  for (const [i, page] of pages.entries()) {
    const jpeg = jpegs.get(i);
    if (!jpeg) {
      out.addPage(copied[k++]);
      continue;
    }
    const {width, height} = page.getCropBox();
    const [w, h] = page.getRotation().angle % 180 ? [height, width] : [width, height];
    const image = await out.embedJpg(jpeg);
    out.addPage([w, h]).drawImage(image, {x: 0, y: 0, width: w, height: h});
  }
  out.setTitle(doc.getTitle() ?? '');
  out.setCreator(doc.getCreator() ?? '');
  return out.save();
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
    entries[splitPartName(baseName, i + 1)] = await buildFrom(
      loaded,
      pages,
      spec.title,
      spec.fills,
    );
    onProgress?.(i + 1, groups.length);
  }
  return zipSync(entries);
}
