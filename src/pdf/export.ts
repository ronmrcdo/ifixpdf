import type {ExportSpec, Progress} from './export-core';
import type {ExportRequest} from './export.worker';

export type {ExportSpec} from './export-core';

interface Pending { resolve: (b: Uint8Array) => void; reject: (e: Error) => void; onProgress?: Progress }
type Reply = {id: number; progress: [number, number]} | {id: number; result: Uint8Array} | {id: number; error: string};
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
  sources: copyBytes ? Object.fromEntries(Object.entries(spec.sources).map(([k, v]) => [k, v.slice()])) : spec.sources
});

function inWorker(w: Worker, call: Call, onProgress?: Progress): Promise<Uint8Array> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, {resolve, reject, onProgress});
    const req = {...call, id} as ExportRequest;
    const transfer: Transferable[] =
      req.op === 'protect' ? [req.bytes.buffer] : Object.values(req.spec.sources).map((b) => b.buffer);
    try {
      w.postMessage(req, transfer);
    } catch (e) {
      pending.delete(id);
      reject(e);
    }
  });
}

export async function buildPdf(spec: ExportSpec, onProgress?: Progress): Promise<Uint8Array> {
  const w = getWorker();
  const snap = snapshot(spec, !!w);
  if (w) return inWorker(w, {op: 'build', spec: snap}, onProgress);
  return (await import('./export-core')).buildPdf(snap, onProgress);
}

export async function protectPdf(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const w = getWorker();
  const copy = bytes.slice(); // snapshot before any await
  if (w) return inWorker(w, {op: 'protect', bytes: copy, password});
  return (await import('./export-core')).protectPdf(copy, password);
}

export async function splitZip(spec: ExportSpec, groups: number[][], baseName: string, onProgress?: Progress): Promise<Uint8Array> {
  const w = getWorker();
  const snap = snapshot(spec, !!w);
  const parts = groups.map((g) => [...g]);
  if (w) return inWorker(w, {op: 'split', spec: snap, groups: parts, baseName}, onProgress);
  return (await import('./export-core')).splitZip(snap, parts, baseName, onProgress);
}
