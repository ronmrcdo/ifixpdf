import {renderPage} from './render';

const page = {rotate: 90, getViewport: vi.fn(), render: vi.fn()};
vi.mock('./registry', () => ({acquire: async () => ({getPage: async () => page})}));

function task() {
  let reject!: (e: unknown) => void;
  let resolve!: () => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const cancel = vi.fn(() =>
    reject(Object.assign(new Error('x'), {name: 'RenderingCancelledException'})),
  );
  return {promise, cancel, resolve};
}
const ctx = {} as CanvasRenderingContext2D;
let canvas: HTMLCanvasElement;
beforeEach(() => {
  canvas = document.createElement('canvas');
  vi.spyOn(canvas, 'getContext').mockReturnValue(ctx);
  page.getViewport.mockReset().mockImplementation(({scale, rotation}) => ({
    width: 100 * scale,
    height: 100 * scale,
    rotation,
  }));
  page.render.mockReset();
});

describe('renderPage', () => {
  it('uses page rotate plus rotation and sizes the canvas', async () => {
    const t = task();
    page.render.mockReturnValue(t);
    t.resolve();
    await renderPage(canvas, 'f', 0, 270, 2);
    expect(page.getViewport).toHaveBeenCalledWith({scale: 2, rotation: 0}); // (90+270)%360
    expect([canvas.width, canvas.height]).toEqual([200, 200]);
  });
  it('cancels the previous task without rejecting either call', async () => {
    const t1 = task();
    const t2 = task();
    page.render.mockReturnValueOnce(t1).mockReturnValueOnce(t2);
    const p1 = renderPage(canvas, 'f', 0, 0, 1);
    await vi.waitFor(() => expect(page.render).toHaveBeenCalledTimes(1));
    const p2 = renderPage(canvas, 'f', 0, 0, 1);
    await vi.waitFor(() => expect(page.render).toHaveBeenCalledTimes(2));
    expect(t1.cancel).toHaveBeenCalled();
    t2.resolve();
    await expect(Promise.all([p1, p2])).resolves.toBeDefined();
  });
  it('clamps a 5000x5000 page at scale 4', async () => {
    const t = task();
    page.render.mockReturnValue(t);
    t.resolve();
    page.getViewport.mockImplementation(({scale, rotation}) => ({
      width: 5000 * scale,
      height: 5000 * scale,
      rotation,
    }));
    await renderPage(canvas, 'f', 0, 0, 4);
    expect(canvas.width).toBeLessThanOrEqual(8192);
    expect(canvas.width * canvas.height).toBeLessThanOrEqual(16_777_216);
    expect(canvas.width).toBeGreaterThan(4000);
  });
  it('propagates real render errors', async () => {
    page.render.mockReturnValue({promise: Promise.reject(new Error('boom')), cancel: vi.fn()});
    await expect(renderPage(canvas, 'f', 0, 0, 1)).rejects.toThrow('boom');
  });
});
