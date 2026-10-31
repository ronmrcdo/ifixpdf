import {dropBytes, getBytes, putBytes} from './bytes';
import {acquire, liveDocuments, release, retain} from './registry';
import {makePdf} from './fixtures';

const destroy = vi.fn(async () => {});
vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: vi.fn(() => ({promise: Promise.resolve({destroy, numPages: 1})})),
  PDFWorker: vi.fn(),
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({default: 'worker.js'}));

beforeEach(() => destroy.mockClear());

describe('registry', () => {
  it('destroys and drops bytes when the last owner releases', async () => {
    putBytes('f1', await makePdf(1));
    retain('f1', 'document');
    await acquire('f1');
    expect(liveDocuments()).toBe(1);
    await release('f1', 'document');
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(() => getBytes('f1')).toThrow();
    expect(liveDocuments()).toBe(0);
  });
  it('keeps the file while another owner remains', async () => {
    putBytes('f2', await makePdf(1));
    retain('f2', 'document');
    retain('f2', 'merge');
    retain('f2', 'merge'); // idempotent
    await acquire('f2');
    await release('f2', 'document');
    expect(destroy).not.toHaveBeenCalled();
    expect(getBytes('f2')).toBeInstanceOf(Uint8Array);
    await release('f2', 'home-thumb'); // non-owner
    expect(destroy).not.toHaveBeenCalled();
    await release('f2', 'merge');
    expect(destroy).toHaveBeenCalledTimes(1);
  });
  it('shares one pdf.js document across concurrent acquires', async () => {
    const {getDocument} = await import('pdfjs-dist');
    vi.mocked(getDocument).mockClear();
    putBytes('f3', await makePdf(1));
    retain('f3', 'document');
    const [a, b] = await Promise.all([acquire('f3'), acquire('f3')]);
    expect(a).toBe(b);
    expect(getDocument).toHaveBeenCalledTimes(1);
    await release('f3', 'document');
  });
  it('acquires every document through one PDFWorker with eval off', async () => {
    vi.resetModules(); // the worker is module state; start from none
    const {getDocument, PDFWorker} = await import('pdfjs-dist');
    const {putBytes} = await import('./bytes');
    const {acquire, release, retain} = await import('./registry');
    for (const id of ['w1', 'w2', 'w3']) {
      putBytes(id, await makePdf(1));
      retain(id, 'document');
      await acquire(id);
    }
    expect(PDFWorker).toHaveBeenCalledTimes(1);
    const worker = vi.mocked(PDFWorker).mock.instances[0];
    expect(getDocument).toHaveBeenCalledTimes(3);
    for (const [params] of vi.mocked(getDocument).mock.calls) {
      expect(params).toEqual(expect.objectContaining({worker, isEvalSupported: false}));
    }
    for (const id of ['w1', 'w2', 'w3']) await release(id, 'document');
  });
  it('points pdf.js at the bundled CMaps and standard fonts as absolute URLs', async () => {
    const {getDocument} = await import('pdfjs-dist');
    vi.mocked(getDocument).mockClear();
    putBytes('f4', await makePdf(1));
    retain('f4', 'document');
    await acquire('f4');
    expect(getDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        cMapUrl: new URL('/pdfjs/cmaps/', document.baseURI).href,
        cMapPacked: true,
        standardFontDataUrl: new URL('/pdfjs/standard_fonts/', document.baseURI).href,
      }),
    );
    await release('f4', 'document');
  });
  it('dropBytes makes getBytes throw', () => {
    putBytes('x', new Uint8Array(1));
    dropBytes('x');
    expect(() => getBytes('x')).toThrow();
  });
});
