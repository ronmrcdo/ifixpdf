import {buildPdf, protectPdf, splitZip, type ExportSpec} from './export-core';

export type ExportRequest =
  | {id: number; op: 'build'; spec: ExportSpec}
  | {id: number; op: 'protect'; bytes: Uint8Array; password: string}
  | {id: number; op: 'split'; spec: ExportSpec; groups: number[][]; baseName: string};

const run = (req: ExportRequest, progress: (done: number, total: number) => void): Promise<Uint8Array> => {
  if (req.op === 'build') return buildPdf(req.spec, progress);
  if (req.op === 'protect') return protectPdf(req.bytes, req.password);
  return splitZip(req.spec, req.groups, req.baseName, progress);
};

// The DOM lib types `self` as Window; this file runs in a dedicated worker.
const ctx = self as unknown as {postMessage(message: unknown, transfer?: Transferable[]): void};

self.onmessage = async (e: MessageEvent<ExportRequest>) => {
  const {id} = e.data;
  try {
    const result = await run(e.data, (done, total) => ctx.postMessage({id, progress: [done, total]}));
    ctx.postMessage({id, result}, [result.buffer]);
  } catch (err) {
    // Never echo the request: it may carry a password.
    ctx.postMessage({id, error: err instanceof Error ? err.message : 'Export failed.'});
  }
};
