import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {loadPdf, InvalidPdfError} from '../pdf/load';
import {release, retain} from '../pdf/registry';
import {getBytes, putBytes} from '../pdf/bytes';
import {createWorkspaceStore, type SavedResult} from './workspace';
import {documentStore, mergeStore} from './workspaces';
import {useApp} from './app';
import type {PickedFile} from '../platform/types';
import type {DraftRecord} from '../storage/draft';

vi.mock('../pdf/load', async (orig) => ({
  ...(await orig<typeof import('../pdf/load')>()),
  loadPdf: vi.fn(),
}));
vi.mock('../pdf/registry', () => ({retain: vi.fn(), release: vi.fn(async () => {})}));
vi.mock('../pdf/bytes', async (orig) => {
  const real = await orig<typeof import('../pdf/bytes')>();
  return {...real, putBytes: vi.fn(real.putBytes)};
});

const pdf = (name: string, size = 3): PickedFile => ({name, bytes: new Uint8Array(size)});
const pageCount: Record<string, number> = {'a.pdf': 2, 'b.pdf': 3, 'c.pdf': 1};

beforeEach(() => {
  vi.mocked(loadPdf)
    .mockReset()
    .mockImplementation(async (name) => {
      const pages = pageCount[name];
      if (pages === undefined) throw new InvalidPdfError(name);
      return {pages};
    });
  vi.mocked(release).mockClear();
  vi.mocked(retain).mockClear();
  vi.mocked(putBytes).mockClear();
  useApp.setState({toast: null});
});

afterEach(async () => {
  await documentStore.getState().reset();
  await mergeStore.getState().reset();
});

/** loadPdf calls that resolve when the test says so. */
const deferLoads = () => {
  const resolvers: Record<string, () => void> = {};
  vi.mocked(loadPdf).mockImplementation(
    (name) => new Promise((r) => (resolvers[name] = () => r({pages: pageCount[name] ?? 1}))),
  );
  return resolvers;
};

const make = async (
  kind: 'document' | 'merge' = 'document',
  files = [pdf('a.pdf'), pdf('b.pdf')],
) => {
  const store = createWorkspaceStore(kind);
  await store.getState().addFiles(files);
  return store;
};
const uids = (store: Awaited<ReturnType<typeof make>>) => store.getState().pages.map((p) => p.uid);

describe('pristine', () => {
  it('is true on a new store and false as soon as replaceWith or addFiles is called', async () => {
    const a = createWorkspaceStore('document');
    expect(a.getState().pristine()).toBe(true);
    const pending = a.getState().replaceWith(pdf('a.pdf'));
    expect(a.getState().pristine()).toBe(false);
    await pending;
    const b = createWorkspaceStore('merge');
    const adding = b.getState().addFiles([pdf('a.pdf')]);
    expect(b.getState().pristine()).toBe(false);
    await adding;
  });

  it('is true again after reset', async () => {
    const s = await make();
    await s.getState().reset();
    expect(s.getState().pristine()).toBe(true);
  });
});

describe('addFiles', () => {
  it('loads, stores bytes, retains and appends pages', async () => {
    const store = await make('merge');
    const {files, pages, workflow, completed} = store.getState();
    expect(files.map((f) => [f.name, f.pages, f.size])).toEqual([
      ['a.pdf', 2, 3],
      ['b.pdf', 3, 3],
    ]);
    expect(pages.map((p) => [p.fileId, p.local, p.rotation])).toEqual([
      [files[0]!.id, 0, 0],
      [files[0]!.id, 1, 0],
      [files[1]!.id, 0, 0],
      [files[1]!.id, 1, 0],
      [files[1]!.id, 2, 0],
    ]);
    expect(getBytes(files[0]!.id)).toHaveLength(3);
    expect(retain).toHaveBeenCalledWith(files[0]!.id, 'merge');
    expect(workflow).toBe('review');
    expect(completed).toBeNull();
    expect(useApp.getState().toast?.text).toBe('2 PDFs added');
  });

  it('keeps the picked path on the source file', async () => {
    const store = await make('document', [{...pdf('a.pdf'), path: 'C:\\x\\a.pdf'}]);
    expect(store.getState().files[0]?.path).toBe('C:\\x\\a.pdf');
    expect(useApp.getState().toast?.text).toBe('1 PDF added');
  });

  it('notifies about a corrupt file and still adds the others', async () => {
    const notify = vi.spyOn(useApp.getState(), 'notify');
    const store = await make('merge', [pdf('a.pdf'), pdf('broken.pdf'), pdf('b.pdf')]);
    expect(notify).toHaveBeenCalledWith(
      'Could not open broken.pdf. Use a valid PDF without a password.',
      'error',
    );
    expect(store.getState().files.map((f) => f.name)).toEqual(['a.pdf', 'b.pdf']);
    notify.mockRestore();
  });

  it('adds nothing and pushes no history when every file fails', async () => {
    const store = createWorkspaceStore('merge');
    await store.getState().addFiles([pdf('broken.pdf')]);
    expect(store.getState().files).toEqual([]);
    expect(store.getState().workflow).toBe('add');
    store.getState().undo();
    expect(store.getState().files).toEqual([]);
  });

  it('pushes one history entry per call', async () => {
    const store = await make('merge');
    await store.getState().addFiles([pdf('c.pdf')]);
    store.getState().undo();
    expect(store.getState().files.map((f) => f.name)).toEqual(['a.pdf', 'b.pdf']);
    store.getState().undo();
    expect(store.getState().files).toEqual([]);
  });

  it('adding to merge leaves document unchanged (separate instances)', async () => {
    await documentStore.getState().addFiles([pdf('a.pdf')]);
    const before = documentStore.getState();
    await mergeStore.getState().addFiles([pdf('b.pdf'), pdf('c.pdf')]);
    expect(documentStore.getState()).toBe(before);
    expect(documentStore.getState().files.map((f) => f.name)).toEqual(['a.pdf']);
    expect(mergeStore.getState().files.map((f) => f.name)).toEqual(['b.pdf', 'c.pdf']);
  });

  it('a reset during loading discards the late files and leaves nothing behind', async () => {
    const store = await make('merge');
    vi.mocked(putBytes).mockClear();
    vi.mocked(retain).mockClear();
    const loads = deferLoads();
    const adding = store.getState().addFiles([pdf('c.pdf')]);
    await store.getState().reset();
    loads['c.pdf']!();
    await adding;
    expect(store.getState().files).toEqual([]);
    expect(store.getState().canUndo()).toBe(false);
    expect(putBytes).not.toHaveBeenCalled();
    expect(retain).not.toHaveBeenCalled();
  });

  it('does nothing while exporting', async () => {
    const store = await make();
    store.getState().beginExport();
    await store.getState().addFiles([pdf('c.pdf')]);
    expect(store.getState().files).toHaveLength(2);
  });
});

describe('page actions', () => {
  it('rotate then move keeps the rotation on the same uid', async () => {
    const store = await make();
    const [first, second] = uids(store);
    store.getState().rotate(90, new Set([second!]));
    store.getState().move(0, new Set([second!]));
    const pages = store.getState().pages;
    expect(pages.map((p) => p.uid).slice(0, 2)).toEqual([second, first]);
    expect(pages[0]!.rotation).toBe(90);
    expect(pages[1]!.rotation).toBe(0);
  });

  it('page actions default to the selection', async () => {
    const store = await make();
    const [a, b] = uids(store);
    store.getState().select(b!, {ctrl: false, shift: false});
    store.getState().rotate(-90);
    expect(store.getState().pages[1]!.rotation).toBe(270);
    store.getState().duplicate();
    expect(store.getState().pages).toHaveLength(6);
    expect(store.getState().pages[2]!.rotation).toBe(270);
    store.getState().remove();
    expect(store.getState().pages.map((p) => p.uid)).not.toContain(b);
    expect(store.getState().selection.uids.size).toBe(0);
    expect(store.getState().pages[0]!.uid).toBe(a);
  });

  it('remove clamps currentPage and prunes selection', async () => {
    const store = await make();
    const all = uids(store);
    store.getState().goTo(4);
    store.getState().selectAll();
    store.getState().remove(new Set(all.slice(2)));
    expect(store.getState().currentPage).toBe(1);
    expect([...store.getState().selection.uids]).toEqual(all.slice(0, 2));
  });

  it('refuses to delete every page', async () => {
    const store = await make();
    const before = store.getState().pages;
    store.getState().selectAll();
    store.getState().remove();
    expect(store.getState().pages).toBe(before);
    expect(useApp.getState().toast?.text).toBe('A PDF needs at least one page.');
    store.getState().undo(); // only the add is on the stack, so the refused remove pushed nothing
    expect(store.getState().pages).toHaveLength(0);
  });

  it('currentPage follows its page through a move', async () => {
    const store = await make();
    const all = uids(store);
    store.getState().goTo(0);
    store.getState().move(4, new Set([all[0]!]));
    expect(store.getState().currentPage).toBe(4);
  });

  it('moveFile and removeFile work on file groups', async () => {
    const store = await make();
    const [a, b] = store.getState().files;
    store.getState().moveFile(b!.id, -1);
    expect(store.getState().files.map((f) => f.id)).toEqual([b!.id, a!.id]);
    expect(store.getState().pages.map((p) => p.fileId)).toEqual([
      b!.id,
      b!.id,
      b!.id,
      a!.id,
      a!.id,
    ]);
    store.getState().removeFile(b!.id);
    expect(store.getState().files.map((f) => f.id)).toEqual([a!.id]);
    expect(store.getState().pages).toHaveLength(2);
  });

  it('moveFileTo moves a file group in one undo step', async () => {
    const store = await make();
    const [a, b] = store.getState().files;
    store.getState().moveFileTo(a!.id, 1);
    expect(store.getState().files.map((f) => f.id)).toEqual([b!.id, a!.id]);
    expect(store.getState().pages.map((p) => p.fileId)).toEqual([
      b!.id,
      b!.id,
      b!.id,
      a!.id,
      a!.id,
    ]);
    store.getState().undo();
    expect(store.getState().files.map((f) => f.id)).toEqual([a!.id, b!.id]);
  });

  it('an edit resets a completed merge back to review', async () => {
    const store = await make('merge');
    store.getState().beginExport();
    store.getState().endExport(saved);
    store.getState().rotate(90, new Set(uids(store)));
    expect(store.getState().workflow).toBe('review');
    expect(store.getState().completed).toBeNull();
  });

  // make() leaves exactly one undo step (addFiles); a single undo emptying the store proves no step was added.
  const expectOnlyAddStep = (store: Awaited<ReturnType<typeof make>>) => {
    store.getState().undo();
    expect(store.getState().files).toEqual([]);
    expect(store.getState().canUndo()).toBe(false);
  };

  it('page actions with an empty selection or unknown uids push no undo step and keep state', async () => {
    const store = await make();
    const before = store.getState();
    for (const uids of [undefined, new Set(['no-such-uid'])]) {
      store.getState().rotate(90, uids);
      store.getState().duplicate(uids);
      store.getState().remove(uids);
      store.getState().move(3, uids);
    }
    store.getState().moveFile(before.files[0]!.id, -1);
    expect(store.getState()).toBe(before);
    expectOnlyAddStep(store);
  });

  it('moving a file with no pages left still reorders files as an undoable step', async () => {
    const store = await make();
    const [a, b] = store.getState().files;
    store.getState().remove(
      new Set(
        store
          .getState()
          .pages.filter((p) => p.fileId === b!.id)
          .map((p) => p.uid),
      ),
    );
    store.getState().moveFile(b!.id, -1);
    expect(store.getState().files.map((f) => f.id)).toEqual([b!.id, a!.id]);
    store.getState().undo();
    expect(store.getState().files.map((f) => f.id)).toEqual([a!.id, b!.id]);
  });

  it('a move that leaves the order as it is pushes no undo step', async () => {
    const store = await make();
    const before = store.getState();
    store.getState().move(0, new Set([before.pages[0]!.uid]));
    expect(store.getState()).toBe(before);
    expectOnlyAddStep(store);
    expect(store.getState().canRedo()).toBe(true);
  });

  it('move while exporting changes nothing', async () => {
    const store = await make();
    const before = store.getState().pages;
    store.getState().beginExport();
    store.getState().move(4, new Set([before[0]!.uid]));
    store.getState().rotate(90, new Set([before[0]!.uid]));
    store.getState().remove(new Set([before[0]!.uid]));
    store.getState().duplicate(new Set([before[0]!.uid]));
    store.getState().removeFile(store.getState().files[0]!.id);
    store.getState().moveFile(store.getState().files[0]!.id, 1);
    expect(store.getState().pages).toBe(before);
  });
});

describe('undo/redo', () => {
  it('restores files, pages, currentPage and selection', async () => {
    const store = await make();
    const [a] = uids(store);
    store.getState().select(a!, {ctrl: false, shift: false});
    store.getState().goTo(3);
    store.getState().removeFile(store.getState().files[1]!.id);
    expect(store.getState().currentPage).toBe(1);
    store.getState().undo();
    expect(store.getState().files).toHaveLength(2);
    expect(store.getState().currentPage).toBe(3);
    expect([...store.getState().selection.uids]).toEqual([a]);
    store.getState().redo();
    expect(store.getState().files).toHaveLength(1);
  });

  it('keeps at most 40 snapshots across 41 edits', async () => {
    const store = await make();
    const [a] = uids(store);
    for (let i = 0; i < 41; i++) store.getState().rotate(90, new Set([a!]));
    for (let i = 0; i < 50; i++) store.getState().undo();
    // 41 rotations of 90° = 90°; 40 undos leave the first rotation in place.
    expect(store.getState().pages[0]!.rotation).toBe(90);
    expect(store.getState().pages).toHaveLength(5);
  });

  it('is a no-op while exporting and with no history', async () => {
    const store = createWorkspaceStore('document');
    const before = store.getState();
    store.getState().undo();
    store.getState().redo();
    expect(store.getState()).toBe(before);
    const loaded = await make();
    loaded.getState().rotate(90, new Set(uids(loaded)));
    loaded.getState().beginExport();
    loaded.getState().undo();
    expect(loaded.getState().pages[0]!.rotation).toBe(90);
  });
});

describe('navigation', () => {
  it('setShowOutput sets the Output panel flag without touching history', async () => {
    const store = await make();
    const undoable = store.getState().canUndo();
    store.getState().setShowOutput(true);
    expect(store.getState().showOutput).toBe(true);
    store.getState().setShowOutput(false);
    expect(store.getState().showOutput).toBe(false);
    expect(store.getState().canUndo()).toBe(undoable);
  });

  it('goTo clamps to the page range', async () => {
    const store = await make();
    store.getState().goTo(99);
    expect(store.getState().currentPage).toBe(4);
    store.getState().goTo(-3);
    expect(store.getState().currentPage).toBe(0);
  });

  it('select uses click modifiers; selectAll selects every page', async () => {
    const store = await make();
    const all = uids(store);
    store.getState().select(all[1]!, {ctrl: false, shift: false});
    store.getState().select(all[3]!, {ctrl: false, shift: true});
    expect([...store.getState().selection.uids]).toEqual(all.slice(1, 4));
    store.getState().selectAll();
    expect(store.getState().selection.uids.size).toBe(5);
  });

  it('clearSelection empties the selection and anchor without an undo step', async () => {
    const store = await make();
    store.getState().selectAll();
    const undoable = store.getState().canUndo();
    store.getState().clearSelection();
    expect(store.getState().selection.uids.size).toBe(0);
    expect(store.getState().selection.anchor).toBeNull();
    expect(store.getState().canUndo()).toBe(undoable);
  });

  it('setTab, setZoom and setExportSettings update fields', async () => {
    const store = createWorkspaceStore('document');
    expect(store.getState().zoom).toBe('fit');
    expect(store.getState().exportSettings).toEqual({
      name: 'Merged document.pdf',
      rangeMode: 'all',
      customRange: '',
      useFileNamesAsTitle: true,
    });
    store.getState().setTab('pages');
    store.getState().setZoom(150);
    store.getState().setExportSettings({name: 'x.pdf'});
    expect(store.getState().tab).toBe('pages');
    expect(store.getState().zoom).toBe(150);
    expect(store.getState().exportSettings.name).toBe('x.pdf');
    expect(store.getState().exportSettings.rangeMode).toBe('all');
  });

  it('setWorkflow sets the workflow', () => {
    const store = createWorkspaceStore('merge');
    expect(store.getState().workflow).toBe('add');
    store.getState().setWorkflow('review');
    expect(store.getState().workflow).toBe('review');
  });
});

const saved: SavedResult = {
  name: 'out.pdf',
  folder: 'C:\\out',
  pages: 5,
  size: 10,
  bytes: new Uint8Array(10),
};

describe('export', () => {
  it('canUndo and canRedo are false while exporting', async () => {
    const store = await make();
    store.getState().rotate(90, new Set(uids(store)));
    store.getState().undo();
    expect([store.getState().canUndo(), store.getState().canRedo()]).toEqual([true, true]);
    store.getState().beginExport();
    expect([store.getState().canUndo(), store.getState().canRedo()]).toEqual([false, false]);
  });

  it('beginExport twice → second is false; endExport unlocks', async () => {
    const store = await make();
    expect(store.getState().beginExport()).toBe(true);
    expect(store.getState().beginExport()).toBe(false);
    store.getState().endExport();
    expect(store.getState().exporting).toBe(false);
    expect(store.getState().completed).toBeNull();
    expect(store.getState().beginExport()).toBe(true);
  });

  it('keeps the saved result only in Merge', async () => {
    const merge = await make('merge');
    merge.getState().beginExport();
    merge.getState().endExport(saved);
    expect(merge.getState().completed).toBe(saved);
    expect(merge.getState().workflow).toBe('done');
    const doc = await make('document');
    doc.getState().beginExport();
    doc.getState().endExport(saved);
    expect(doc.getState().completed).toBeNull();
    expect(doc.getState().workflow).toBe('review');
  });

  it('snapshotForExport is a frozen copy unaffected by later edits', async () => {
    const store = await make();
    store.getState().setExportSettings({useFileNamesAsTitle: false, name: 'Report.pdf'});
    const spec = store.getState().snapshotForExport();
    const [a] = uids(store);
    store.getState().rotate(90, new Set([a!]));
    expect(spec.pages[0]).toEqual({fileId: store.getState().files[0]!.id, local: 0, rotation: 0});
    expect(spec.pages).toHaveLength(5);
    expect(spec.title).toBe('Report');
    expect(Object.keys(spec.sources)).toEqual(store.getState().files.map((f) => f.id));
    expect(Object.isFrozen(spec)).toBe(true);
    expect(Object.isFrozen(spec.pages)).toBe(true);
    expect(Object.isFrozen(spec.pages[0])).toBe(true);
    expect(Object.isFrozen(spec.sources)).toBe(true);
  });
});

describe('replaceWith and reset', () => {
  it('replaceWith releases the old files, clears history and resets view state', async () => {
    const store = await make();
    const old = store.getState().files.map((f) => f.id);
    store.getState().selectAll();
    store.getState().goTo(3);
    store.getState().setZoom(200);
    await store.getState().replaceWith(pdf('c.pdf'));
    expect(
      old.map((id) => vi.mocked(release).mock.calls.some(([f, o]) => f === id && o === 'document')),
    ).toEqual([true, true]);
    const s = store.getState();
    expect(s.files.map((f) => f.name)).toEqual(['c.pdf']);
    expect(s.pages).toHaveLength(1);
    expect(s.currentPage).toBe(0);
    expect(s.selection.uids.size).toBe(0);
    expect(s.exportSettings.name).toBe('c (edited).pdf');
    expect(s.zoom).toBe('fit');
    store.getState().undo();
    expect(store.getState().files.map((f) => f.name)).toEqual(['c.pdf']);
  });

  it('the later of two overlapping replaceWith calls wins, and the stale one leaves nothing behind', async () => {
    const store = createWorkspaceStore('document');
    const loads = deferLoads();
    const first = store.getState().replaceWith(pdf('a.pdf'));
    const second = store.getState().replaceWith(pdf('c.pdf'));
    loads['c.pdf']!();
    await second;
    loads['a.pdf']!();
    await first;
    const {files} = store.getState();
    expect(files.map((f) => f.name)).toEqual(['c.pdf']);
    expect(vi.mocked(putBytes).mock.calls.map(([id]) => id)).toEqual([files[0]!.id]);
    expect(vi.mocked(retain).mock.calls).toEqual([[files[0]!.id, 'document']]);
    expect(release).not.toHaveBeenCalled();
  });

  it('the later replaceWith wins when the earlier one finishes loading first', async () => {
    const store = createWorkspaceStore('document');
    const loads = deferLoads();
    const first = store.getState().replaceWith(pdf('a.pdf'));
    const second = store.getState().replaceWith(pdf('c.pdf'));
    loads['a.pdf']!();
    await first;
    expect(store.getState().files).toEqual([]);
    loads['c.pdf']!();
    await second;
    expect(store.getState().files.map((f) => f.name)).toEqual(['c.pdf']);
    expect(putBytes).toHaveBeenCalledTimes(1);
  });

  it('replaceWith keeps the current document when the file is invalid', async () => {
    const store = await make();
    await store.getState().replaceWith(pdf('broken.pdf'));
    expect(release).not.toHaveBeenCalled();
    expect(store.getState().files).toHaveLength(2);
    expect(useApp.getState().toast).toMatchObject({
      text: 'Could not open broken.pdf. Use a valid PDF without a password.',
      tone: 'error',
    });
  });

  it('reset releases every file it retained, including removed ones, and clears state', async () => {
    const store = await make('merge');
    const ids = store.getState().files.map((f) => f.id);
    store.getState().removeFile(ids[0]!);
    await store.getState().reset();
    for (const id of ids) expect(release).toHaveBeenCalledWith(id, 'merge');
    expect(store.getState().files).toEqual([]);
    expect(store.getState().workflow).toBe('add');
    store.getState().undo();
    expect(store.getState().files).toEqual([]);
  });

  it('reset is a no-op while exporting', async () => {
    const store = await make();
    store.getState().beginExport();
    await store.getState().reset();
    expect(release).not.toHaveBeenCalled();
    expect(store.getState().files).toHaveLength(2);
  });
});

describe('restore', () => {
  const record = (over: Partial<DraftRecord> = {}): DraftRecord => ({
    files: [
      {id: 'f1', name: 'a.pdf', pages: 2, size: 3, recentId: 'r1'},
      {id: 'f2', name: 'b.pdf', pages: 1, size: 4},
    ],
    pages: [
      {uid: 'u1', fileId: 'f1', local: 0, rotation: 90},
      {uid: 'u2', fileId: 'f1', local: 1, rotation: 0},
      {uid: 'u3', fileId: 'f2', local: 0, rotation: 0},
    ],
    currentPage: 2,
    view: 'edit',
    selection: ['u2', 'gone'],
    anchor: 'u2',
    exportSettings: {
      name: 'Mine.pdf',
      rangeMode: 'custom',
      customRange: '1-2',
      useFileNamesAsTitle: false,
    },
    savedAt: 1,
    ...over,
  });
  const bytesFor = () =>
    new Map([
      ['f1', new Uint8Array([1])],
      ['f2', new Uint8Array([2])],
    ]);

  it('puts the bytes back, retains each file and sets the draft fields with no undo step', async () => {
    const store = createWorkspaceStore('document');
    const bytes = bytesFor();
    await store.getState().restore(record(), bytes);
    expect(getBytes('f1')).toBe(bytes.get('f1'));
    expect(vi.mocked(retain).mock.calls).toEqual([
      ['f1', 'document'],
      ['f2', 'document'],
    ]);
    const s = store.getState();
    expect(s.files.map((f) => f.id)).toEqual(['f1', 'f2']);
    expect(s.files[0]!.recentId).toBe('r1');
    expect(s.pages.map((p) => p.uid)).toEqual(['u1', 'u2', 'u3']);
    expect(s.currentPage).toBe(2);
    expect([...s.selection.uids]).toEqual(['u2']);
    expect(s.selection.anchor).toBe('u2');
    expect(s.exportSettings).toEqual(record().exportSettings);
    expect(s.workflow).toBe('review');
    expect(s.canUndo()).toBe(false);
    expect(loadPdf).not.toHaveBeenCalled();
  });

  it('clamps an out-of-range currentPage', async () => {
    const store = createWorkspaceStore('document');
    await store.getState().restore(record({currentPage: 9}), bytesFor());
    expect(store.getState().currentPage).toBe(2);
  });

  it('releases what the workspace held before, and reset later releases the restored files', async () => {
    const store = await make();
    const old = store.getState().files.map((f) => f.id);
    await store.getState().restore(record(), bytesFor());
    for (const id of old) expect(release).toHaveBeenCalledWith(id, 'document');
    vi.mocked(release).mockClear();
    await store.getState().reset();
    expect(
      vi
        .mocked(release)
        .mock.calls.map(([id]) => id)
        .sort(),
    ).toEqual(['f1', 'f2']);
  });
});

describe('replaceWith recentId', () => {
  it('keeps the recent id on the opened file, and none when not given', async () => {
    const store = createWorkspaceStore('document');
    await store.getState().replaceWith(pdf('a.pdf'), 'r9');
    expect(store.getState().files[0]!.recentId).toBe('r9');
    await store.getState().replaceWith(pdf('c.pdf'));
    expect(store.getState().files[0]).not.toHaveProperty('recentId');
  });
});

describe('setRecentId', () => {
  it('attaches the id without a history entry', async () => {
    const store = createWorkspaceStore('document');
    await store.getState().replaceWith(pdf('a.pdf'));
    const id = store.getState().files[0]!.id;
    store.getState().setRecentId(id, 'r5');
    expect(store.getState().files[0]!.recentId).toBe('r5');
    expect(store.getState().canUndo()).toBe(false);
  });

  it('ignores an unknown file', async () => {
    const store = createWorkspaceStore('document');
    await store.getState().replaceWith(pdf('a.pdf'));
    const files = store.getState().files;
    store.getState().setRecentId('nope', 'r5');
    expect(store.getState().files).toBe(files);
  });
});

describe('page cap', () => {
  const MSG = 'iFixPDF works with up to 2,000 pages at a time.';

  it('refuses files that would pass 2,000 pages, before retaining them', async () => {
    pageCount['big.pdf'] = 1999;
    const store = await make('document', [pdf('big.pdf')]);
    vi.mocked(retain).mockClear();
    vi.mocked(putBytes).mockClear();
    const notify = vi.spyOn(useApp.getState(), 'notify');
    await store.getState().addFiles([pdf('a.pdf')]);
    expect(store.getState().pages).toHaveLength(1999);
    expect(retain).not.toHaveBeenCalled();
    expect(putBytes).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(MSG, 'error');
    notify.mockRestore();
  });

  it('refuses to open a PDF over 2,000 pages', async () => {
    pageCount['huge.pdf'] = 2001;
    const notify = vi.spyOn(useApp.getState(), 'notify');
    const store = createWorkspaceStore('document');
    await store.getState().replaceWith(pdf('huge.pdf'));
    expect(store.getState().files).toEqual([]);
    expect(retain).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(MSG, 'error');
    notify.mockRestore();
  });

  it('refuses a duplicate that would pass 2,000 pages', async () => {
    pageCount['max.pdf'] = 2000;
    const store = await make('document', [pdf('max.pdf')]);
    store.getState().duplicate(new Set([store.getState().pages[0]!.uid]));
    expect(store.getState().pages).toHaveLength(2000);
    store.getState().undo(); // only the add is on the stack, so the refused duplicate pushed nothing
    expect(store.getState().pages).toHaveLength(0);
  });

  it('still lets an over-cap workspace shrink', async () => {
    pageCount['max.pdf'] = 2000;
    const store = await make('document', [pdf('max.pdf')]);
    store.getState().remove(new Set([store.getState().pages[0]!.uid]));
    expect(store.getState().pages).toHaveLength(1999);
  });
});
