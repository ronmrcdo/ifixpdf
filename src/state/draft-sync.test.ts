import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {clearDraft, writeDraft} from '../storage/draft';
import {loadPdf} from '../pdf/load';
import {createWorkspaceStore} from './workspace';
import {flushDraft, saveDraftNow, startDraftSync} from './draft-sync';
import {useApp} from './app';

vi.mock('../storage/draft', () => ({writeDraft: vi.fn(async () => {}), clearDraft: vi.fn(async () => {})}));
vi.mock('../pdf/load', () => ({loadPdf: vi.fn(async () => ({pages: 2}))}));
vi.mock('../pdf/registry', () => ({retain: vi.fn(), release: vi.fn(async () => {})}));

let stop: () => void = () => {};
const setup = async () => {
  const store = createWorkspaceStore('document');
  await store.getState().addFiles([{name: 'a.pdf', bytes: new Uint8Array([1, 2])}]);
  stop = startDraftSync(store);
  return store;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(writeDraft).mockReset().mockResolvedValue();
  vi.mocked(clearDraft).mockClear();
  vi.mocked(loadPdf).mockClear();
  useApp.setState({view: 'home', documentView: 'preview', toast: null});
  useApp.getState().setView('edit');
});
afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe('draft sync', () => {
  it('5 rapid changes → 1 writeDraft after 300 ms', async () => {
    const store = await setup();
    for (const n of ['1', '2', '3', '4', '5']) store.getState().setExportSettings({name: `${n}.pdf`});
    await vi.advanceTimersByTimeAsync(299);
    expect(writeDraft).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(writeDraft).toHaveBeenCalledTimes(1);
    const [record, bytes] = vi.mocked(writeDraft).mock.calls[0]!;
    const s = store.getState();
    expect(record).toMatchObject({files: s.files, pages: s.pages, currentPage: 0, view: 'edit', selection: [], anchor: null});
    expect(record.exportSettings.name).toBe('5.pdf');
    expect(typeof record.savedAt).toBe('number');
    expect([...bytes]).toEqual([[s.files[0]!.id, new Uint8Array([1, 2])]]);
  });

  it('switching Preview and Edit alone writes the draft with the new view', async () => {
    await setup();
    useApp.getState().setView('preview');
    await vi.advanceTimersByTimeAsync(300);
    expect(writeDraft).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeDraft).mock.calls[0]![0].view).toBe('preview');
  });

  it('a view switch with no document files writes nothing', async () => {
    stop = startDraftSync(createWorkspaceStore('document'));
    useApp.getState().setView('preview');
    await vi.advanceTimersByTimeAsync(300);
    expect(writeDraft).not.toHaveBeenCalled();
    expect(clearDraft).not.toHaveBeenCalled();
  });

  it('leaving to a non-document view writes nothing', async () => {
    await setup();
    useApp.getState().setView('home');
    await vi.advanceTimersByTimeAsync(300);
    expect(writeDraft).not.toHaveBeenCalled();
  });

  it('records the last document view, not the current one', async () => {
    const store = await setup();
    useApp.getState().setView('settings');
    store.getState().setExportSettings({name: 'x.pdf'});
    await flushDraft();
    expect(vi.mocked(writeDraft).mock.calls[0]![0].view).toBe('edit');
  });

  it('maps selection and records preview after Preview', async () => {
    const store = await setup();
    useApp.getState().setView('preview');
    useApp.getState().setView('home');
    store.getState().selectAll();
    await vi.advanceTimersByTimeAsync(300);
    const [record] = vi.mocked(writeDraft).mock.calls[0]!;
    expect(record.view).toBe('preview');
    expect(record.selection).toEqual(store.getState().pages.map((p) => p.uid));
    expect(record.anchor).toBe(store.getState().pages[0]!.uid);
  });

  it('ignores changes that are not part of the draft', async () => {
    const store = await setup();
    store.getState().setZoom(150);
    store.getState().setTab('pages');
    await vi.advanceTimersByTimeAsync(1000);
    expect(writeDraft).not.toHaveBeenCalled();
  });

  it('an empty document clears the draft instead of writing', async () => {
    const store = await setup();
    store.getState().removeFile(store.getState().files[0]!.id);
    await vi.advanceTimersByTimeAsync(300);
    expect(clearDraft).toHaveBeenCalledTimes(1);
    expect(writeDraft).not.toHaveBeenCalled();
  });

  it('a failed write shows the error toast', async () => {
    const store = await setup();
    vi.mocked(writeDraft).mockRejectedValueOnce(new Error('quota'));
    store.getState().setExportSettings({name: 'x.pdf'});
    await vi.advanceTimersByTimeAsync(300);
    expect(useApp.getState().toast).toMatchObject({text: 'Draft could not be saved. Export your PDF to keep your work.', tone: 'error'});
  });

  it('flushDraft writes immediately and cancels the pending debounce', async () => {
    const store = await setup();
    store.getState().setExportSettings({name: 'x.pdf'});
    await flushDraft();
    expect(writeDraft).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(writeDraft).toHaveBeenCalledTimes(1);
  });

  it('flushDraft with nothing pending writes nothing', async () => {
    await setup();
    await flushDraft();
    expect(writeDraft).not.toHaveBeenCalled();
  });

  it('writes never overlap', async () => {
    const store = await setup();
    let finish!: () => void;
    vi.mocked(writeDraft).mockImplementationOnce(() => new Promise<void>((r) => (finish = r)));
    store.getState().setExportSettings({name: 'x.pdf'});
    await vi.advanceTimersByTimeAsync(300);
    store.getState().setExportSettings({name: 'y.pdf'});
    await vi.advanceTimersByTimeAsync(300);
    expect(writeDraft).toHaveBeenCalledTimes(1);
    finish();
    await flushDraft();
    expect(writeDraft).toHaveBeenCalledTimes(2);
    expect(vi.mocked(writeDraft).mock.calls[1]![0].exportSettings.name).toBe('y.pdf');
  });

  it('the returned stop function unsubscribes', async () => {
    const store = await setup();
    stop();
    store.getState().setExportSettings({name: 'x.pdf'});
    await vi.advanceTimersByTimeAsync(1000);
    expect(writeDraft).not.toHaveBeenCalled();
  });
});

describe('saveDraftNow', () => {
  it('writes even with nothing pending', async () => {
    await setup();
    await saveDraftNow();
    expect(writeDraft).toHaveBeenCalledTimes(1);
  });
  it('rejects when the write fails, without a toast, and later writes still run', async () => {
    const store = await setup();
    vi.mocked(writeDraft).mockRejectedValueOnce(new Error('quota'));
    useApp.setState({toast: null});
    await expect(saveDraftNow()).rejects.toThrow('quota');
    expect(useApp.getState().toast).toBeNull();
    await saveDraftNow();
    expect(writeDraft).toHaveBeenCalledTimes(2);
    store.getState().setExportSettings({name: 'z.pdf'});
    await vi.advanceTimersByTimeAsync(300);
    expect(writeDraft).toHaveBeenCalledTimes(3);
  });
  it('cancels a pending debounce', async () => {
    const store = await setup();
    store.getState().setExportSettings({name: 'x.pdf'});
    await saveDraftNow();
    await vi.advanceTimersByTimeAsync(1000);
    expect(writeDraft).toHaveBeenCalledTimes(1);
  });
});
