import {getBytes} from './bytes';
import {rasterizePages} from './rasterize';
import {acquire, release, retain} from './registry';

const calls: string[] = [];
const page = {
  rotate: 90,
  getViewport: vi.fn(({scale}: {scale: number}) => ({
    width: 100 * scale,
    height: 50 * scale,
    // flips the corners, as pdf.js does under rotation
    convertToViewportRectangle: ([x1, y1, x2, y2]: number[]) => [
      x2! * 2,
      y2! * 2,
      x1! * 2,
      y1! * 2,
    ],
  })),
  render: vi.fn(() => {
    calls.push('render');
    return {promise: Promise.resolve()};
  }),
  cleanup: vi.fn(),
};
vi.mock('pdfjs-dist', () => ({AnnotationMode: {DISABLE: 0, ENABLE: 1}}));
vi.mock('./registry', () => ({
  acquire: vi.fn(async () => ({getPage: async () => page})),
  retain: vi.fn(),
  release: vi.fn(async () => {}),
}));

let blob: Blob | null;
beforeEach(() => {
  blob = new Blob([new Uint8Array([0xff, 0xd8])]);
  calls.length = 0;
  const ctx = {
    fillRect: (...r: number[]) => calls.push(`fill ${r.join(' ')}`),
    set fillStyle(v: string) {
      calls.push(`style ${v}`);
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(blob));
  vi.mocked(release).mockClear();
});

describe('rasterizePages', () => {
  it('renders each page at 200 dpi with annotations, paints its redactions black after, and releases the bytes', async () => {
    const progress = vi.fn();
    const rect = {x: 1, y: 2, w: 3, h: 4};
    const out = await rasterizePages(
      new Uint8Array([1]),
      [
        {index: 2, rects: [rect, {x: 10, y: 10, w: 1, h: 1}]},
        {index: 5, rects: [rect]},
      ],
      progress,
    );
    expect(out).toEqual([
      {index: 2, jpeg: new Uint8Array([0xff, 0xd8])},
      {index: 5, jpeg: new Uint8Array([0xff, 0xd8])},
    ]);
    const id = vi.mocked(retain).mock.calls[0]![0];
    expect(retain).toHaveBeenCalledWith(id, 'export');
    expect(getBytes(id)).toEqual(new Uint8Array([1]));
    expect(acquire).toHaveBeenCalledWith(id);
    expect(page.getViewport).toHaveBeenCalledWith({scale: 200 / 72, rotation: 90});
    expect(page.render).toHaveBeenCalledWith(expect.objectContaining({annotationMode: 1}));
    // [1,2,4,6] converts to [8,12,2,4]: normalized to x 2, y 4, 6 × 8
    expect(calls).toEqual([
      'render',
      'style #000',
      'fill 2 4 6 8',
      'fill 20 20 2 2',
      'render',
      'style #000',
      'fill 2 4 6 8',
    ]);
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
    await expect(rasterizePages(new Uint8Array([1]), [{index: 0, rects: []}])).rejects.toThrow();
    expect(release).toHaveBeenCalledTimes(1);
  });
});
