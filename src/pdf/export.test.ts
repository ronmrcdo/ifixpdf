import {afterEach, describe, expect, it, vi} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {makePdf} from './fixtures';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('export.ts without Worker', () => {
  it('falls back to export-core', async () => {
    vi.stubGlobal('Worker', undefined);
    const {buildPdf} = await import('./export');
    const out = await buildPdf({title: 't', sources: {a: await makePdf(2)}, pages: [{fileId: 'a', local: 1, rotation: 90}]});
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });
});

describe('export.ts fallback snapshot', () => {
  it('ignores pages mutated after the call', async () => {
    vi.stubGlobal('Worker', undefined);
    const {buildPdf} = await import('./export');
    const pages: Array<{fileId: string; local: number; rotation: 0}> = [
      {fileId: 'a', local: 0, rotation: 0},
      {fileId: 'a', local: 1, rotation: 0}
    ];
    const p = buildPdf({title: 't', sources: {a: await makePdf(2)}, pages});
    pages.length = 0;
    expect((await PDFDocument.load(await p)).getPageCount()).toBe(2);
  });
});

describe('export.ts with a Worker', () => {
  it('routes progress, result and error by id and transfers buffers', async () => {
    const posted: Array<{msg: {id: number; op: string}; transfer: Transferable[]}> = [];
    const workers: FakeWorker[] = [];
    class FakeWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      constructor() { workers.push(this); }
      postMessage(msg: {id: number; op: string}, transfer: Transferable[]) { posted.push({msg, transfer}); }
      reply(data: unknown) { this.onmessage?.({data} as MessageEvent); }
    }
    vi.stubGlobal('Worker', FakeWorker);
    const {protectPdf, buildPdf} = await import('./export');
    const progress = vi.fn();
    const bytes = new Uint8Array([1, 2, 3]);
    const p1 = buildPdf({title: 't', sources: {a: bytes}, pages: []}, progress);
    const p2 = protectPdf(new Uint8Array([9]), 'secret-pass');
    expect(posted.map((p) => p.msg.op)).toEqual(['build', 'protect']);
    expect(posted[0]!.transfer.length).toBe(1);
    const worker = workers[0]!;
    const [id1, id2] = posted.map((p) => p.msg.id);
    worker.reply({id: id1, progress: [1, 3]});
    expect(progress).toHaveBeenCalledWith(1, 3);
    worker.reply({id: id2, error: 'boom'});
    worker.reply({id: id1, result: new Uint8Array([7])});
    await expect(p2).rejects.toThrow('boom');
    expect(await p1).toEqual(new Uint8Array([7]));
  });

  const fake = () => {
    interface Fw { onerror: (() => void) | null; onmessageerror: (() => void) | null; terminate: ReturnType<typeof vi.fn>; posted: unknown[] }
    const workers: Fw[] = [];
    let throwOnPost = false;
    class FakeWorker {
      onmessage: unknown = null;
      onerror: (() => void) | null = null;
      onmessageerror: (() => void) | null = null;
      terminate = vi.fn();
      posted: unknown[] = [];
      constructor() { workers.push(this); }
      postMessage(msg: unknown) { if (throwOnPost) throw new Error('clone failed'); this.posted.push(msg); }
    }
    vi.stubGlobal('Worker', FakeWorker);
    return {workers, failPost: () => { throwOnPost = true; }};
  };
  const timeout = new Promise((r) => setTimeout(() => r('hung'), 200));

  it('rejects pending calls when the worker errors and recovers on the next call', async () => {
    const {workers} = fake();
    const {protectPdf} = await import('./export');
    const p = protectPdf(new Uint8Array([1]), 'secret-pass');
    workers[0]!.onerror!();
    await expect(Promise.race([p.catch(() => 'rejected'), timeout])).resolves.toBe('rejected');
    protectPdf(new Uint8Array([1]), 'secret-pass').catch(() => undefined);
    expect(workers.length).toBe(2);
  });

  it('rejects pending calls on messageerror', async () => {
    const {workers} = fake();
    const {protectPdf} = await import('./export');
    const p = protectPdf(new Uint8Array([1]), 'secret-pass');
    workers[0]!.onmessageerror!();
    await expect(Promise.race([p.catch(() => 'rejected'), timeout])).resolves.toBe('rejected');
  });

  it('does not leak a pending entry when postMessage throws', async () => {
    const {workers, failPost} = fake();
    const {protectPdf} = await import('./export');
    failPost();
    await expect(protectPdf(new Uint8Array([1]), 'secret-pass')).rejects.toThrow('clone failed');
    const {pendingCount} = await import('./export');
    expect(pendingCount()).toBe(0);
    workers[0]!.onerror!(); // nothing pending: must not throw
  });

  it('terminates a failed worker and ignores its late events', async () => {
    const {workers} = fake();
    const {protectPdf, pendingCount} = await import('./export');
    protectPdf(new Uint8Array([1]), 'secret-pass').catch(() => undefined);
    const a = workers[0]!;
    a.onerror!();
    expect(a.terminate).toHaveBeenCalled();
    const b = protectPdf(new Uint8Array([1]), 'secret-pass');
    expect(workers.length).toBe(2);
    a.onerror!(); // late event from the dead worker
    expect(pendingCount()).toBe(1);
    expect(await Promise.race([b.then(() => 'settled', () => 'settled'), new Promise((r) => setTimeout(() => r('open'), 50))])).toBe('open');
    protectPdf(new Uint8Array([1]), 'secret-pass').catch(() => undefined);
    expect(workers.length).toBe(2); // B was not orphaned
  });

  it('posts a snapshot of pages, not the live array', async () => {
    const {workers} = fake();
    const {buildPdf} = await import('./export');
    const pages: Array<{fileId: string; local: number; rotation: 0}> = [{fileId: 'a', local: 0, rotation: 0}, {fileId: 'a', local: 1, rotation: 0}];
    buildPdf({title: 't', sources: {a: new Uint8Array([1])}, pages}).catch(() => undefined);
    pages.reverse();
    const msg = workers[0]!.posted[0] as {spec: {pages: Array<{local: number}>}};
    expect(msg.spec.pages.map((p) => p.local)).toEqual([0, 1]);
  });

  it('protect fallback uses a copy of the bytes', async () => {
    vi.stubGlobal('Worker', undefined);
    const {protectPdf} = await import('./export');
    const bytes = await makePdf(1);
    const p = protectPdf(bytes, 'secret-pass');
    bytes.fill(0);
    await expect(p).resolves.toBeInstanceOf(Uint8Array);
  });
});
