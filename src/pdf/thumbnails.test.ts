import {releaseFile, renderBlob, thumbnail} from './thumbnails';
import {renderPage} from './render';

vi.mock('./render', () => ({renderPage: vi.fn(async () => {})}));

let n = 0;
beforeEach(() => {
  vi.mocked(renderPage).mockReset().mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['x'])));
  URL.createObjectURL = vi.fn(() => `blob:${n++}`);
  URL.revokeObjectURL = vi.fn();
});

describe('thumbnails', () => {
  it('shares in-flight renders', async () => {
    const [a, b] = await Promise.all([thumbnail('s1', 0, 0, 0.18), thumbnail('s1', 0, 0, 0.18)]);
    expect(a).toBe(b);
    expect(renderPage).toHaveBeenCalledTimes(1);
    expect(await thumbnail('s1', 0, 0, 0.18)).toBe(a); // cached
    expect(renderPage).toHaveBeenCalledTimes(1);
    releaseFile('s1');
  });
  it('does not cache failures', async () => {
    vi.mocked(renderPage).mockRejectedValueOnce(new Error('boom'));
    await expect(thumbnail('s2', 0, 0, 0.42)).rejects.toThrow('boom');
    await thumbnail('s2', 0, 0, 0.42);
    expect(renderPage).toHaveBeenCalledTimes(2);
    releaseFile('s2');
  });
  it('evicts the oldest past 300 and revokes its URL', async () => {
    const first = await thumbnail('s3', 0, 0, 0.18);
    for (let i = 1; i <= 300; i++) await thumbnail('s3', i, 0, 0.18);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(first);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    releaseFile('s3');
  });
  it('releaseFile revokes only that file', async () => {
    const a = await thumbnail('s4', 0, 0, 0.18);
    const b = await thumbnail('s5', 0, 0, 0.18);
    releaseFile('s4');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(a);
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(b);
    releaseFile('s5');
  });
  it('renderBlob returns the encoded canvas and rejects when encoding fails', async () => {
    expect(await renderBlob('s6', 0, 0, 0.18)).toBeInstanceOf(Blob);
    expect(renderPage).toHaveBeenCalledWith(expect.any(HTMLCanvasElement), 's6', 0, 0, 0.18);
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementationOnce((cb) => cb(null));
    await expect(renderBlob('s6', 0, 0, 0.18)).rejects.toThrow('Thumbnail encoding failed');
  });
});
