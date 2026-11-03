import {hasMarkup, hasRedaction} from '../domain/markup';
import type {ExportSpec, Progress} from './export-core';
import type {ExportRequest} from './export.worker';
import type {RasterImage} from './rasterize';

export type {ExportSpec} from './export-core';

interface Pending {
  resolve: (b: Uint8Array | number) => void;
  reject: (e: Error) => void;
  onProgress?: Progress;
}
type Reply =
  | {id: number; progress: [number, number]}
  | {id: number; result: Uint8Array | number}
  | {id: number; error: string};
type Call = DistributiveOmit<ExportRequest>;
type DistributiveOmit<T> = T extends unknown ? Omit<T, 'id'> : never;

let worker: Worker | null | undefined;
let nextId = 0;
const pending = new Map<number, Pending>();
export const pendingCount = (): number => pending.size; // test hook

// Settle everything in flight and drop the worker so the next call builds a fresh one.
function failAll(w: Worker, message: string): void {
  if (w !== worker) return; // late event from an already replaced worker
  w.terminate();
  worker = undefined;
  for (const p of pending.values()) p.reject(new Error(message));
  pending.clear();
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    const w = new Worker(new URL('./export.worker.ts', import.meta.url), {type: 'module'});
    worker = w;
    w.onmessage = (e: MessageEvent<Reply>) => {
      const msg = e.data;
      const p = pending.get(msg.id);
      if (!p) return;
      if ('progress' in msg) return p.onProgress?.(...msg.progress);
      pending.delete(msg.id);
      if ('error' in msg) p.reject(new Error(msg.error));
      else p.resolve(msg.result);
    };
    w.onerror = () => failAll(w, 'The export worker failed.');
    w.onmessageerror = () => failAll(w, 'The export worker sent an unreadable reply.');
  } catch {
    worker = null; // no Worker support: run in-thread
  }
  return worker;
}

// Immutable snapshot taken before any await. Bytes are copied only for a worker, so
// the caller's buffers survive the transfer; in-thread they are read-only and shared.
const snapshot = (spec: ExportSpec, copyBytes: boolean): ExportSpec => ({
  ...spec,
  pages: spec.pages.map((p) => ({...p})),
  sources: copyBytes
    ? Object.fromEntries(Object.entries(spec.sources).map(([k, v]) => [k, v.slice()]))
    : spec.sources,
});

function transfers(req: ExportRequest): Transferable[] {
  if (req.op === 'protect' || req.op === 'count') return [req.bytes.buffer];
  if (req.op === 'raster') return [req.bytes.buffer, ...req.images.map((i) => i.jpeg.buffer)];
  return Object.values(req.spec.sources).map((b) => b.buffer);
}

function inWorker<T extends Uint8Array | number>(
  w: Worker,
  call: Call,
  onProgress?: Progress,
): Promise<T> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    // The op determines the result type; the worker reply is only known as a union.
    pending.set(id, {resolve: resolve as Pending['resolve'], reject, onProgress});
    const req = {...call, id} as ExportRequest;
    try {
      w.postMessage(req, transfers(req));
    } catch (e) {
      pending.delete(id);
      reject(e);
    }
  });
}

export type Raster = (
  bytes: Uint8Array,
  indices: number[],
  onProgress?: Progress,
) => Promise<RasterImage[]>;
// Lazy: pdf.js rendering for redaction loads only when a redaction is exported.
const rasterizePages: Raster = async (...args) =>
  (await import('./rasterize')).rasterizePages(...args);

async function build(spec: ExportSpec, onProgress?: Progress): Promise<Uint8Array> {
  const w = getWorker();
  const snap = snapshot(spec, !!w);
  if (w) return inWorker(w, {op: 'build', spec: snap}, onProgress);
  return (await import('./export-core')).buildPdf(snap, onProgress);
}

/** Pass 1 builds the PDF; pass 2 swaps every redacted page for an image. Fails closed. */
export async function buildPdf(
  spec: ExportSpec,
  onProgress?: Progress,
  raster: Raster = rasterizePages,
): Promise<Uint8Array> {
  const redacted = spec.pages.flatMap((p, i) => (hasRedaction(p) ? [i] : []));
  if (!redacted.length) return build(spec, onProgress);
  const done = spec.pages.length;
  const total = done + redacted.length;
  const bytes = await build(spec, onProgress && ((d) => onProgress(d, total)));
  const images = await raster(bytes, redacted, onProgress && ((d) => onProgress(done + d, total)));
  if (images.map((i) => i.index).join() !== redacted.join()) {
    throw new Error('A redacted page was not rendered.');
  }
  const w = getWorker();
  // Copies, so whatever raster or its caller still holds survives the transfer.
  const copies = images.map((i) => ({index: i.index, jpeg: i.jpeg.slice()}));
  if (w) return inWorker(w, {op: 'raster', bytes: bytes.slice(), images: copies});
  return (await import('./export-core')).replaceWithImages(bytes, copies);
}

export async function protectPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const w = getWorker();
  const copy = bytes.slice(); // snapshot before any await
  if (w) return inWorker(w, {op: 'protect', bytes: copy, password});
  return (await import('./export-core')).protectPdf(copy, password);
}

export async function countPages(bytes: Uint8Array): Promise<number> {
  const w = getWorker();
  const copy = bytes.slice(); // snapshot before any await
  if (w) return inWorker<number>(w, {op: 'count', bytes: copy});
  return (await import('./export-core')).countPages(copy);
}

/** With markup or fills, builds (and rasterizes redactions) first, then splits that finished output so no part
 *  skips the redaction pass. Progress covers both stages. */
export async function splitZip(
  spec: ExportSpec,
  groups: number[][],
  baseName: string,
  onProgress?: Progress,
  raster?: Raster,
): Promise<Uint8Array> {
  if (hasMarkup(spec.pages, spec.fills)) {
    const built = spec.pages.length + spec.pages.filter(hasRedaction).length; // buildPdf's progress total
    const out = await buildPdf(
      spec,
      onProgress && ((d) => onProgress(d, built + groups.length)),
      raster,
    );
    const flat: ExportSpec = {
      title: spec.title,
      sources: {out},
      pages: Array.from({length: spec.pages.length}, (_, local) => ({
        fileId: 'out',
        local,
        rotation: 0 as const,
      })),
    };
    return splitZip(
      flat,
      groups,
      baseName,
      onProgress && ((d) => onProgress(built + d, built + groups.length)),
    );
  }
  const w = getWorker();
  const snap = snapshot(spec, !!w);
  const parts = groups.map((g) => [...g]);
  if (w) return inWorker(w, {op: 'split', spec: snap, groups: parts, baseName}, onProgress);
  return (await import('./export-core')).splitZip(snap, parts, baseName, onProgress);
}
