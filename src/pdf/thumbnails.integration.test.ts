import {thumbnail} from './thumbnails';
import {release, retain} from './registry';
import {renderPage} from './render';

vi.mock('./render', () => ({renderPage: vi.fn(async () => {})}));

let n = 0;
beforeEach(() => {
  vi.mocked(renderPage).mockReset().mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['x'])));
  URL.createObjectURL = vi.fn(() => `blob:i${n++}`);
  URL.revokeObjectURL = vi.fn();
});

describe('registry release -> thumbnails', () => {
  it('revokes a file thumbnail URLs on the last release', async () => {
    retain('i1', 'document');
    const url = await thumbnail('i1', 0, 0, 0.18);
    await release('i1', 'document');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
  });
  it('revokes a build that finishes after release and does not serve it after re-retain', async () => {
    let finish!: () => void;
    vi.mocked(renderPage).mockImplementationOnce(() => new Promise<void>((r) => (finish = r)));
    retain('i2', 'document');
    const stale = thumbnail('i2', 0, 0, 0.18);
    await vi.waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1));
    await release('i2', 'document');
    finish();
    await expect(stale).rejects.toThrow('File released');
    const staleUrl = vi.mocked(URL.createObjectURL).mock.results[0]?.value;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(staleUrl);
    retain('i2', 'document');
    const fresh = await thumbnail('i2', 0, 0, 0.18);
    expect(fresh).not.toBe(staleUrl);
    expect(renderPage).toHaveBeenCalledTimes(2);
    await release('i2', 'document');
  });
  it('does not share an in-flight build across a release', async () => {
    let finish!: () => void;
    vi.mocked(renderPage).mockImplementationOnce(() => new Promise<void>((r) => (finish = r)));
    retain('i3', 'document');
    const stale = thumbnail('i3', 0, 0, 0.18);
    await vi.waitFor(() => expect(renderPage).toHaveBeenCalledTimes(1));
    await release('i3', 'document');
    retain('i3', 'document');
    await thumbnail('i3', 0, 0, 0.18);
    finish();
    await expect(stale).rejects.toThrow('File released');
    expect(renderPage).toHaveBeenCalledTimes(2);
    await release('i3', 'document');
  });
});
