import {afterEach, describe, expect, it, vi} from 'vitest';
import {PDFDocument} from 'pdf-lib';
import {unzipSync} from 'fflate';
import {TINY_JPEG, findSecret, makePdf} from './fixtures';
import type {Markup} from '../domain/markup';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('export.ts without Worker', () => {
  it('falls back to export-core', async () => {
    vi.stubGlobal('Worker', undefined);
    const {buildPdf} = await import('./export');
    const out = await buildPdf({
      title: 't',
      sources: {a: await makePdf(2)},
      pages: [{fileId: 'a', local: 1, rotation: 90}],
    });
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });
});

describe('export.ts fallback snapshot', () => {
  it('ignores pages mutated after the call', async () => {
    vi.stubGlobal('Worker', undefined);
    const {buildPdf} = await import('./export');
    const pages: Array<{fileId: string; local: number; rotation: 0}> = [
      {fileId: 'a', local: 0, rotation: 0},
      {fileId: 'a', local: 1, rotation: 0},
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
      constructor() {
        workers.push(this);
      }
      postMessage(msg: {id: number; op: string}, transfer: Transferable[]) {
        posted.push({msg, transfer});
      }
      reply(data: unknown) {
        this.onmessage?.({data} as MessageEvent);
      }
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
    interface Fw {
      onerror: (() => void) | null;
      onmessageerror: (() => void) | null;
      terminate: ReturnType<typeof vi.fn>;
      posted: unknown[];
    }
    const workers: Fw[] = [];
    let throwOnPost = false;
    class FakeWorker {
      onmessage: unknown = null;
      onerror: (() => void) | null = null;
      onmessageerror: (() => void) | null = null;
      terminate = vi.fn();
      posted: unknown[] = [];
      constructor() {
        workers.push(this);
      }
      postMessage(msg: unknown) {
        if (throwOnPost) throw new Error('clone failed');
        this.posted.push(msg);
      }
    }
    vi.stubGlobal('Worker', FakeWorker);
    return {
      workers,
      failPost: () => {
        throwOnPost = true;
      },
    };
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
    expect(
      await Promise.race([
        b.then(
          () => 'settled',
          () => 'settled',
        ),
        new Promise((r) => setTimeout(() => r('open'), 50)),
      ]),
    ).toBe('open');
    protectPdf(new Uint8Array([1]), 'secret-pass').catch(() => undefined);
    expect(workers.length).toBe(2); // B was not orphaned
  });

  it('posts a snapshot of pages, not the live array', async () => {
    const {workers} = fake();
    const {buildPdf} = await import('./export');
    const pages: Array<{fileId: string; local: number; rotation: 0}> = [
      {fileId: 'a', local: 0, rotation: 0},
      {fileId: 'a', local: 1, rotation: 0},
    ];
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

describe('export.ts countPages failures', () => {
  class FakeWorker {
    static last: FakeWorker;
    onmessage: ((e: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    posted: Array<{id: number}> = [];
    terminate = vi.fn();
    constructor() {
      FakeWorker.last = this;
    }
    postMessage(msg: {id: number}) {
      this.posted.push(msg);
    }
  }

  it('rejects when the worker replies with an error', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const {countPages} = await import('./export');
    const p = countPages(new Uint8Array([1]));
    FakeWorker.last.onmessage?.({
      data: {id: FakeWorker.last.posted[0]!.id, error: 'x'},
    } as MessageEvent);
    await expect(p).rejects.toThrow('x');
  });

  it('rejects a pending count when the worker fails', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const {countPages, pendingCount} = await import('./export');
    const p = countPages(new Uint8Array([1]));
    FakeWorker.last.onerror?.();
    await expect(p).rejects.toThrow('The export worker failed.');
    expect(pendingCount()).toBe(0);
  });
});

describe('export.ts countPages', () => {
  it('counts pages in the worker and leaves the caller bytes intact', async () => {
    const posted: Array<{id: number; op: string}> = [];
    const workers: FakeWorker[] = [];
    class FakeWorker {
      onmessage: ((e: MessageEvent) => void) | null = null;
      constructor() {
        workers.push(this);
      }
      postMessage(msg: {id: number; op: string}) {
        posted.push(msg);
      }
    }
    vi.stubGlobal('Worker', FakeWorker);
    const {countPages} = await import('./export');
    const bytes = new Uint8Array([1, 2, 3]);
    const p = countPages(bytes);
    expect(posted.map((m) => m.op)).toEqual(['count']);
    workers[0]!.onmessage?.({data: {id: posted[0]!.id, result: 3}} as MessageEvent);
    expect(await p).toBe(3);
    expect(bytes.byteLength).toBe(3);
  });
});

describe('export.ts redaction pass', () => {
  const redact: Markup = {id: 'r', kind: 'redact', rect: {x: 1, y: 1, w: 5, h: 5}, angle: 0};
  const spec = async () => ({
    title: 't',
    sources: {a: await makePdf(3)},
    pages: [
      {fileId: 'a', local: 0, rotation: 0 as const},
      {fileId: 'a', local: 1, rotation: 0 as const, markup: [redact]},
      {fileId: 'a', local: 2, rotation: 0 as const},
      {fileId: 'a', local: 1, rotation: 0 as const, markup: [redact]}, // duplicate of page 1
    ],
  });
  const images = (_b: Uint8Array, pages: {index: number}[]) =>
    Promise.resolve(pages.map(({index}) => ({index, jpeg: TINY_JPEG})));

  it('does not rasterize when nothing is redacted', async () => {
    vi.stubGlobal('Worker', undefined);
    const {buildPdf} = await import('./export');
    const raster = vi.fn(images);
    const progress = vi.fn();
    await buildPdf(
      {...(await spec()), pages: [{fileId: 'a', local: 0, rotation: 0}]},
      progress,
      raster,
    );
    expect(raster).not.toHaveBeenCalled();
    expect(progress).toHaveBeenLastCalledWith(1, 1);
  });

  it('rasterizes the redacted output pages and reports one combined progress', async () => {
    vi.stubGlobal('Worker', undefined);
    const {buildPdf} = await import('./export');
    const raster = vi.fn(
      async (
        b: Uint8Array,
        pages: {index: number}[],
        onProgress?: (d: number, t: number) => void,
      ) => {
        expect((await PDFDocument.load(b)).getPageCount()).toBe(4); // pass-1 output
        onProgress?.(1, 2);
        onProgress?.(2, 2);
        return images(b, pages);
      },
    );
    const progress = vi.fn();
    const out = await buildPdf(await spec(), progress, raster);
    expect(raster.mock.calls[0]![1]).toEqual([
      {index: 1, rects: [redact.rect]},
      {index: 3, rects: [redact.rect]},
    ]);
    expect(progress.mock.calls.map(([d, t]) => `${d}/${t}`)).toEqual([
      '1/6',
      '2/6',
      '3/6',
      '4/6',
      '5/6',
      '6/6',
    ]);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getPage(1).node.Contents()).toBeDefined();
  });

  it('fails closed when raster rejects or skips a page', async () => {
    vi.stubGlobal('Worker', undefined);
    const {buildPdf} = await import('./export');
    await expect(
      buildPdf(await spec(), undefined, () => Promise.reject(new Error('gpu'))),
    ).rejects.toThrow('gpu');
    await expect(
      buildPdf(await spec(), undefined, (b) => images(b, [{index: 1}])),
    ).rejects.toThrow();
  });

  it('runs the raster op in the worker and fails closed on its error', async () => {
    const posted: Array<{msg: {id: number; op: string}; transfer: Transferable[]}> = [];
    class FakeWorker {
      static last: FakeWorker;
      onmessage: ((e: MessageEvent) => void) | null = null;
      constructor() {
        FakeWorker.last = this;
      }
      postMessage(msg: {id: number; op: string}, transfer: Transferable[]) {
        posted.push({msg, transfer});
      }
    }
    vi.stubGlobal('Worker', FakeWorker);
    const {buildPdf} = await import('./export');
    const jpeg = TINY_JPEG.slice();
    const raster = vi.fn(async () => [
      {index: 1, jpeg},
      {index: 3, jpeg: TINY_JPEG.slice()},
    ]);
    const p = buildPdf(await spec(), undefined, raster);
    const reply = (data: unknown) => FakeWorker.last.onmessage?.({data} as MessageEvent);
    reply({id: posted[0]!.msg.id, result: new Uint8Array([1])});
    await vi.waitFor(() => expect(posted).toHaveLength(2));
    expect(posted[1]!.msg.op).toBe('raster');
    expect(posted[1]!.transfer).toHaveLength(3);
    expect(jpeg.byteLength).toBe(TINY_JPEG.byteLength); // caller's array survives the transfer
    reply({id: posted[1]!.msg.id, error: 'bad'});
    await expect(p).rejects.toThrow('bad');
  });

  it('splits a redacted spec from the rasterized output, rasterizing once', async () => {
    vi.stubGlobal('Worker', undefined);
    const {splitZip} = await import('./export');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont('Helvetica');
    for (const t of ['alpha', 'TOPSECRET', 'gamma']) {
      doc.addPage([200, 200]).drawText(t, {font, size: 12, x: 10, y: 100});
    }
    const sp = {
      title: 't',
      sources: {a: await doc.save()},
      pages: [0, 1, 2].map((local) => ({
        fileId: 'a',
        local,
        rotation: 0 as const,
        markup: local === 1 ? [redact] : undefined,
      })),
    };
    const raster = vi.fn(images);
    const progress = vi.fn();
    const files = unzipSync(
      await splitZip(
        sp,
        [
          [0, 1],
          [1, 2],
        ],
        'D.pdf',
        progress,
        raster,
      ),
    );
    expect(raster).toHaveBeenCalledTimes(1);
    expect(Object.keys(files)).toHaveLength(2);
    for (const bytes of Object.values(files)) {
      expect(await findSecret(bytes, 'TOPSECRET')).toEqual([]);
    }
    expect(await findSecret(Object.values(files)[0]!, 'alpha')).not.toEqual([]);
    expect(progress).toHaveBeenLastCalledWith(expect.any(Number), expect.any(Number));
    const [d, t] = progress.mock.calls.at(-1)!;
    expect(d).toBe(t);
  });
});
