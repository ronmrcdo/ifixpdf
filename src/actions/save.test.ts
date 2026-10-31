import {PDFDocument} from 'pdf-lib';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {platform, type SavedFile} from '../platform';
import {recents} from '../storage/app-recents';
import {useApp} from '../state/app';
import {busy} from '../state/work';
import type {WorkspaceStore} from '../state/workspace';
import {documentStore, mergeStore} from '../state/workspaces';
import {continueToSave, extractSelection, outputIndices, printDocument, saveCopy, saveOrContinue, saveOutput} from './save';

vi.mock('../pdf/registry', () => ({retain: vi.fn(), release: vi.fn(async () => {})}));

// One page per width, so a saved page's width tells which source page it is.
async function sized(widths: number[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (const w of widths) doc.addPage([w, 100]);
  return doc.save();
}
const read = async (bytes: Uint8Array) => {
  const doc = await PDFDocument.load(bytes);
  return doc.getPages().map((p) => ({width: p.getWidth(), rotation: p.getRotation().angle}));
};

let saved: Uint8Array[];
const savedFile = (name: string): SavedFile => ({name, folder: '/docs', path: `/docs/${name}`});
const saveAs = () => vi.mocked(platform.saveAs);
const toast = () => useApp.getState().toast;

/** saveAs calls that finish when the test says so. */
function holdSaveAs() {
  const release: Array<() => void> = [];
  saveAs().mockImplementation((bytes, name) => new Promise((r) => { saved.push(bytes); release.push(() => r(savedFile(name))) }));
  return release;
}

async function open(store: WorkspaceStore, name = 'Report.pdf', widths = [100, 200, 300]) {
  await store.getState().addFiles([{name, bytes: await sized(widths)}]);
  store.getState().setExportSettings({name});
  useApp.setState({toast: null});
}

beforeEach(() => {
  saved = [];
  vi.spyOn(platform, 'saveAs').mockImplementation(async (bytes, name) => { saved.push(bytes); return savedFile(name) });
  vi.spyOn(platform, 'openPath').mockResolvedValue();
  vi.spyOn(recents, 'record').mockResolvedValue({id: 'r', name: 'x', pages: 1, size: 1, modified: 0});
  useApp.setState({toast: null, openAfter: false, view: 'edit', workspace: 'document'});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await documentStore.getState().reset();
  await mergeStore.getState().reset();
});

describe('outputIndices', () => {
  const state = (rangeMode: 'all' | 'current' | 'custom', customRange = '', currentPage = 1) =>
    ({pages: [0, 1, 2].map((i) => ({uid: `u${i}`, fileId: 'f', local: i, rotation: 0 as const})), currentPage, exportSettings: {name: 'x', rangeMode, customRange, useFileNamesAsTitle: true}});
  it('all, current and custom (in the order typed)', () => {
    expect(outputIndices(state('all'))).toEqual([0, 1, 2]);
    expect(outputIndices(state('current'))).toEqual([1]);
    expect(outputIndices(state('custom', '3, 1'))).toEqual([2, 0]);
  });
  it('throws the range message for a bad custom range', () => {
    expect(() => outputIndices(state('custom', '2-9'))).toThrow('Choose page numbers from 1 to 3.');
    expect(() => outputIndices(state('custom', ''))).toThrow('Enter pages such as 1-3, 5.');
  });
});

describe('saveOutput', () => {
  it('saves every page in displayed order with rotation, records the path and toasts in Edit', async () => {
    await open(documentStore);
    const s = documentStore.getState();
    s.move(0, new Set([s.pages[2]!.uid]));
    s.rotate(90, new Set([documentStore.getState().pages[1]!.uid]));
    await saveOutput(documentStore);
    expect(saveAs()).toHaveBeenCalledWith(expect.any(Uint8Array), 'Report.pdf', 'pdf');
    expect(await read(saved[0]!)).toEqual([{width: 300, rotation: 0}, {width: 100, rotation: 90}, {width: 200, rotation: 0}]);
    expect(recents.record).toHaveBeenCalledWith({name: 'Report.pdf', bytes: saved[0], pages: 3, path: '/docs/Report.pdf'});
    expect(toast()).toMatchObject({text: 'Saved Report.pdf.', tone: 'info'});
    expect(documentStore.getState()).toMatchObject({exporting: false, progress: null, completed: {name: 'Report.pdf', folder: '/docs', path: '/docs/Report.pdf', pages: 3, size: saved[0]!.byteLength}});
  });

  it('applies the current and custom range modes', async () => {
    await open(documentStore);
    documentStore.getState().goTo(1);
    documentStore.getState().setExportSettings({rangeMode: 'current'});
    await saveOutput(documentStore);
    expect((await read(saved[0]!)).map((p) => p.width)).toEqual([200]);
    documentStore.getState().setExportSettings({rangeMode: 'custom', customRange: '3, 1-2'});
    await saveOutput(documentStore);
    expect((await read(saved[1]!)).map((p) => p.width)).toEqual([300, 100, 200]);
  });

  it('an invalid custom range shows its message and opens no dialog', async () => {
    await open(documentStore);
    documentStore.getState().setExportSettings({rangeMode: 'custom', customRange: '2-9'});
    await saveOutput(documentStore);
    expect(saveAs()).not.toHaveBeenCalled();
    expect(toast()).toMatchObject({text: 'Choose page numbers from 1 to 3.', tone: 'error'});
    expect(documentStore.getState().exporting).toBe(false);
  });

  it('uses the default name when the name is blank', async () => {
    await open(documentStore);
    documentStore.getState().setExportSettings({name: '  '});
    await saveOutput(documentStore);
    expect(saveAs()).toHaveBeenCalledWith(expect.any(Uint8Array), 'Merged document.pdf', 'pdf');
  });

  it('does nothing without pages', async () => {
    await saveOutput(documentStore);
    expect(saveAs()).not.toHaveBeenCalled();
    expect(toast()?.text).toBe('Add a PDF before saving.');
  });

  it('called twice at once opens one dialog', async () => {
    await open(documentStore);
    const release = holdSaveAs();
    const first = saveOutput(documentStore);
    const second = saveOutput(documentStore);
    await vi.waitFor(() => expect(release).toHaveLength(1));
    await second;
    expect(toast()).toMatchObject({text: 'Wait for the save to finish.', tone: 'info'});
    release[0]!();
    await first;
    expect(saveAs()).toHaveBeenCalledOnce();
  });

  it('rotating or deleting during the build does not change the output', async () => {
    await open(documentStore);
    const release = holdSaveAs();
    const pending = saveOutput(documentStore);
    const all = new Set(documentStore.getState().pages.map((p) => p.uid));
    documentStore.getState().rotate(90, all); // blocked by the export lock
    documentStore.getState().remove(all);
    expect(documentStore.getState().pages).toHaveLength(3);
    // Even a change that bypasses the lock cannot reach the frozen snapshot.
    documentStore.setState({pages: documentStore.getState().pages.map((p) => ({...p, rotation: 180 as const})).slice(1)});
    await vi.waitFor(() => expect(release).toHaveLength(1));
    release[0]!();
    await pending;
    expect(await read(saved[0]!)).toEqual([100, 200, 300].map((width) => ({width, rotation: 0})));
  });

  it('shows build progress on the store and clears it after', async () => {
    await open(documentStore);
    const release = holdSaveAs();
    const pending = saveOutput(documentStore);
    expect(documentStore.getState().exporting).toBe(true);
    await vi.waitFor(() => expect(release).toHaveLength(1));
    expect(documentStore.getState().progress).toEqual([3, 3]);
    release[0]!();
    await pending;
    expect(documentStore.getState().progress).toBeNull();
  });

  it('a Merge save finished after switching to Edit lands in Merge only', async () => {
    await open(mergeStore, 'A.pdf');
    mergeStore.getState().setWorkflow('save');
    await open(documentStore, 'Doc.pdf');
    useApp.setState({view: 'merge', workspace: 'merge'});
    const release = holdSaveAs();
    const pending = saveOutput(mergeStore);
    await vi.waitFor(() => expect(release).toHaveLength(1));
    useApp.getState().setView('edit');
    release[0]!();
    await pending;
    expect(mergeStore.getState()).toMatchObject({workflow: 'done', completed: {name: 'A.pdf', pages: 3}});
    expect(documentStore.getState()).toMatchObject({completed: null, exporting: false});
    expect(toast()).toBeNull(); // Merge shows Done, not a toast
    expect(useApp.getState().view).toBe('edit');
  });

  it('a cancel leaves everything unchanged', async () => {
    await open(mergeStore, 'A.pdf');
    mergeStore.getState().setWorkflow('save');
    useApp.setState({openAfter: true});
    saveAs().mockResolvedValue(null);
    await saveOutput(mergeStore);
    expect(mergeStore.getState()).toMatchObject({workflow: 'save', completed: null, exporting: false});
    expect(recents.record).not.toHaveBeenCalled();
    expect(platform.openPath).not.toHaveBeenCalled();
    expect(toast()).toBeNull();
  });

  it('a write error toasts and stays on Save', async () => {
    await open(mergeStore, 'A.pdf');
    mergeStore.getState().setWorkflow('save');
    saveAs().mockRejectedValue(new Error('disk full'));
    await saveOutput(mergeStore);
    expect(toast()).toMatchObject({text: 'Could not save the PDF. Try a different file.', tone: 'error'});
    expect(mergeStore.getState()).toMatchObject({workflow: 'save', completed: null, exporting: false});
    expect(recents.record).not.toHaveBeenCalled();
  });

  it('a recents failure does not fail the save', async () => {
    await open(documentStore);
    vi.mocked(recents.record).mockRejectedValue(new Error('quota'));
    await saveOutput(documentStore);
    expect(toast()?.text).toBe('Saved Report.pdf.');
  });

  it('opens the saved file when Open after saving is on, and says so when that fails', async () => {
    await open(documentStore);
    useApp.setState({openAfter: true});
    await saveOutput(documentStore);
    expect(platform.openPath).toHaveBeenCalledWith('/docs/Report.pdf', saved[0]);
    vi.mocked(platform.openPath).mockRejectedValue(new Error('no app'));
    await saveOutput(documentStore);
    expect(toast()).toMatchObject({text: 'Saved, but could not open the PDF.'});
    expect(documentStore.getState().completed?.name).toBe('Report.pdf');
  });

  it('is tracked for the update deferral while it runs', async () => {
    await open(documentStore);
    const release = holdSaveAs();
    const pending = saveOutput(documentStore);
    expect(busy()).toBe(true);
    await vi.waitFor(() => expect(release).toHaveLength(1));
    release[0]!();
    await pending;
    expect(busy()).toBe(false);
  });
});

describe('saveOrContinue', () => {
  beforeEach(() => vi.stubGlobal('matchMedia', vi.fn(() => ({matches: false}))));
  afterEach(() => vi.unstubAllGlobals());

  it('Merge in review goes to the Save step instead of saving', async () => {
    await open(mergeStore, 'A.pdf');
    mergeStore.getState().setTab('pages');
    await saveOrContinue(mergeStore);
    expect(saveAs()).not.toHaveBeenCalled();
    expect(mergeStore.getState()).toMatchObject({workflow: 'save', tab: 'document', showOutput: false});
    await saveOrContinue(mergeStore);
    expect(saveAs()).toHaveBeenCalledOnce();
  });

  it('Edit saves straight away', async () => {
    await open(documentStore);
    await saveOrContinue(documentStore);
    expect(saveAs()).toHaveBeenCalledOnce();
  });

  it('continueToSave needs pages and opens the output panel on narrow windows', async () => {
    continueToSave(mergeStore);
    expect(toast()?.text).toBe('Add at least one PDF to continue.');
    expect(mergeStore.getState().workflow).toBe('add');
    await open(mergeStore, 'A.pdf');
    vi.mocked(matchMedia).mockReturnValue({matches: true} as MediaQueryList);
    continueToSave(mergeStore);
    expect(mergeStore.getState().showOutput).toBe(true);
  });
});

describe('saveCopy', () => {
  it('saves the whole document under its name, ignoring the range mode', async () => {
    await open(documentStore);
    documentStore.getState().setExportSettings({rangeMode: 'current'});
    await saveCopy(documentStore);
    expect(saveAs()).toHaveBeenCalledWith(expect.any(Uint8Array), 'Report.pdf', 'pdf');
    expect((await read(saved[0]!)).map((p) => p.width)).toEqual([100, 200, 300]);
    expect(toast()?.text).toBe('Saved Report.pdf.');
    expect(documentStore.getState().completed).toBeNull();
  });

  it('says so when the copy fails, and a cancel is silent', async () => {
    await open(documentStore);
    saveAs().mockResolvedValueOnce(null);
    await saveCopy(documentStore);
    expect(toast()).toBeNull();
    saveAs().mockRejectedValueOnce(new Error('disk full'));
    await saveCopy(documentStore);
    expect(toast()).toMatchObject({text: 'Could not save a copy of this PDF.', tone: 'error'});
    expect(documentStore.getState().exporting).toBe(false);
  });
});

describe('extractSelection', () => {
  it('saves the selected pages in displayed order under an en-dash name', async () => {
    await open(documentStore, 'Report.pdf', [100, 200, 300, 400]);
    const {pages} = documentStore.getState();
    documentStore.setState({selection: {uids: new Set([pages[3]!.uid, pages[0]!.uid, pages[1]!.uid]), anchor: null}});
    await extractSelection(documentStore);
    expect(saveAs()).toHaveBeenCalledWith(expect.any(Uint8Array), 'Report – pages 1–2, 4.pdf', 'pdf');
    expect((await read(saved[0]!)).map((p) => p.width)).toEqual([100, 200, 400]);
    expect(toast()?.text).toBe('3 pages extracted to Report – pages 1–2, 4.pdf. Your document is unchanged.');
    expect(documentStore.getState().pages).toEqual(pages);
    expect(documentStore.getState().completed).toBeNull();
  });

  it('does nothing without a selection, and says so when saving fails', async () => {
    await open(documentStore);
    await extractSelection(documentStore);
    expect(saveAs()).not.toHaveBeenCalled();
    documentStore.getState().selectAll();
    saveAs().mockRejectedValueOnce(new Error('disk full'));
    await extractSelection(documentStore);
    expect(toast()).toMatchObject({text: 'Could not save the extracted pages.', tone: 'error'});
  });
});

describe('printDocument', () => {
  let blobs: Blob[];
  beforeEach(() => {
    blobs = [];
    URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return 'blob:print' });
    URL.revokeObjectURL = vi.fn();
  });

  it('opens the whole document as a blob PDF tab and explains how to print', async () => {
    const tab = vi.spyOn(window, 'open').mockReturnValue(null);
    await open(documentStore);
    documentStore.getState().setExportSettings({rangeMode: 'current'});
    await printDocument(documentStore);
    expect(saveAs()).not.toHaveBeenCalled();
    expect(tab).toHaveBeenCalledWith('blob:print', '_blank', 'noopener');
    expect(blobs[0]!.type).toBe('application/pdf');
    expect((await read(new Uint8Array(await blobs[0]!.arrayBuffer()))).map((p) => p.width)).toEqual([100, 200, 300]);
    expect(toast()?.text).toBe('Use Print in the PDF viewer to choose your printer.');
  });

  it('turns a failure into a toast, not a rejection', async () => {
    vi.spyOn(window, 'open').mockImplementation(() => { throw new Error('blocked') });
    await open(documentStore);
    await expect(printDocument(documentStore)).resolves.toBeUndefined();
    expect(toast()).toMatchObject({text: 'Could not open the PDF for printing.', tone: 'error'});
    expect(documentStore.getState().exporting).toBe(false);
  });

  it('does nothing while another export runs', async () => {
    const tab = vi.spyOn(window, 'open').mockReturnValue(null);
    await open(documentStore);
    documentStore.getState().beginExport();
    await printDocument(documentStore);
    expect(tab).not.toHaveBeenCalled();
    documentStore.getState().endExport();
  });
});
