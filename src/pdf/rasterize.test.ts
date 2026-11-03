import {getBytes} from './bytes';
import {rasterizePages} from './rasterize';
import {acquire, release, retain} from './registry';

const page = {
  rotate: 90,
  getViewport: vi.fn(({scale}: {scale: number}) => ({width: 100 * scale, height: 50 * scale})),
  render: vi.fn(() => ({promise: Promise.resolve()})),
  cleanup: vi.fn(),
};
vi.mock('pdfjs-dist', () => ({AnnotationMode: {DISABLE: 0}}));
vi.mock('./registry', () => ({
  acquire: vi.fn(async () => ({getPage: async () => page})),
  retain: vi.fn(),
  release: vi.fn(async () => {}),
}));

let blob: Blob | null;
beforeEach(() => {
  blob = new Blob([new Uint8Array([0xff, 0xd8])]);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    {} as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(blob));
  vi.mocked(release).mockClear();
});

describe('rasterizePages', () => {
  it('renders each page at 200 dpi without annotations and releases the bytes', async () => {
    const progress = vi.fn();
    const out = await rasterizePages(new Uint8Array([1]), [2, 5], progress);
    expect(out).toEqual([
      {index: 2, jpeg: new Uint8Array([0xff, 0xd8])},
      {index: 5, jpeg: new Uint8Array([0xff, 0xd8])},
    ]);
    const id = vi.mocked(retain).mock.calls[0]![0];
    expect(retain).toHaveBeenCalledWith(id, 'export');
    expect(getBytes(id)).toEqual(new Uint8Array([1]));
    expect(acquire).toHaveBeenCalledWith(id);
    expect(page.getViewport).toHaveBeenCalledWith({scale: 200 / 72, rotation: 90});
    expect(page.render).toHaveBeenCalledWith(expect.objectContaining({annotationMode: 0}));
    expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalledWith(
      expect.any(Function),
      'image/jpeg',
      0.85,
    );
    expect(progress).toHaveBeenLastCalledWith(2, 2);
    expect(release).toHaveBeenCalledWith(id, 'export');
  });

  it('rejects and still releases when encoding fails', async () => {
    blob = null;
    await expect(rasterizePages(new Uint8Array([1]), [0])).rejects.toThrow();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
