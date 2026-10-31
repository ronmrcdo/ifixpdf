import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {SourceFile} from '../domain/types';
import {loadPdf, InvalidPdfError} from '../pdf/load';
import {clearDraft, readDraft, type DraftRecord} from '../storage/draft';
import {recents} from '../storage/app-recents';
import {flushDraft, startDraftSync} from '../state/draft-sync';
import {useApp} from '../state/app';
import {documentStore, mergeStore} from '../state/workspaces';
import {FileMissingError} from '../platform/types';
import {navigate, openRecent, parseRoute, startup, writeRoute} from './route';

vi.mock('../pdf/load', async (orig) => ({
  ...(await orig<typeof import('../pdf/load')>()),
  loadPdf: vi.fn(),
}));
vi.mock('../pdf/registry', () => ({retain: vi.fn(), release: vi.fn(async () => {})}));
vi.mock('../storage/draft', () => ({readDraft: vi.fn(), clearDraft: vi.fn(async () => {})}));
vi.mock('../state/draft-sync', () => ({
  startDraftSync: vi.fn(() => () => {}),
  flushDraft: vi.fn(async () => {}),
}));

const file = (id: string, recentId?: string): SourceFile => ({
  id,
  name: `${id}.pdf`,
  pages: 1,
  size: 1,
  ...(recentId ? {recentId} : {}),
});
const draft = (
  view: 'preview' | 'edit',
  files = [file('f1')],
): {record: DraftRecord; bytes: Map<string, Uint8Array>} => ({
  record: {
    files,
    pages: files.map((f, i) => ({uid: `u${i}`, fileId: f.id, local: 0, rotation: 0})),
    currentPage: 0,
    view,
    selection: [],
    anchor: null,
    exportSettings: {
      name: 'Draft.pdf',
      rangeMode: 'all',
      customRange: '',
      useFileNamesAsTitle: true,
    },
    savedAt: 1,
  },
  bytes: new Map(files.map((f) => [f.id, new Uint8Array([1])])),
});
const recentsOpen = vi.fn();
const at = (search: string) => window.history.replaceState(null, '', `/index.html${search}`);

beforeEach(() => {
  vi.mocked(readDraft).mockReset().mockResolvedValue(null);
  vi.mocked(loadPdf)
    .mockReset()
    .mockImplementation(async (name) => {
      if (name === 'broken.pdf') throw new InvalidPdfError(name);
      return {pages: 2};
    });
  recentsOpen.mockReset();
  vi.spyOn(recents, 'open').mockImplementation(recentsOpen);
  vi.spyOn(recents, 'record')
    .mockReset()
    .mockResolvedValue({id: 'r1', name: 'x', pages: 1, size: 1, modified: 0});
  vi.mocked(startDraftSync)
    .mockReset()
    .mockReturnValue(() => {});
  vi.mocked(flushDraft).mockClear();
  useApp.setState({view: 'home', documentView: 'preview', workspace: 'merge', toast: null});
  at('');
});
afterEach(async () => {
  await documentStore.getState().reset();
  await mergeStore.getState().reset();
});

describe('parseRoute', () => {
  it.each([
    ['', {combineNew: false}],
    ['?view=home', {view: 'home', combineNew: false}],
    ['?view=preview', {view: 'preview', combineNew: false}],
    ['?view=edit', {view: 'edit', combineNew: false}],
    ['?view=settings', {combineNew: false}],
    ['?combine=new', {combineNew: true}],
    ['?combine=old', {combineNew: false}],
    ['?recent=abc', {recent: 'abc', combineNew: false}],
    ['?recent=abc&view=edit', {recent: 'abc', view: 'edit', combineNew: false}],
    ['?recent=', {combineNew: false}],
  ])('%s', (search, expected) => {
    expect(parseRoute(search)).toEqual(expected);
  });
});

describe('writeRoute', () => {
  const spy = () => vi.spyOn(window.history, 'replaceState');
  afterEach(() => vi.restoreAllMocks());

  it('Home writes ?view=home', () => {
    const s = spy();
    writeRoute('home', {files: []});
    expect(s).toHaveBeenCalledWith(null, '', 'index.html?view=home');
  });
  it('Preview with one file writes ?recent=<id>', () => {
    const s = spy();
    writeRoute('preview', {files: [file('f1')], recentId: 'r1'});
    expect(s).toHaveBeenCalledWith(null, '', 'index.html?recent=r1');
  });
  it('Edit with one file adds &view=edit', () => {
    const s = spy();
    writeRoute('edit', {files: [file('f1')], recentId: 'r1'});
    expect(s).toHaveBeenCalledWith(null, '', 'index.html?recent=r1&view=edit');
  });
  it.each([
    ['preview with 2 files', 'preview', [file('a'), file('b')], 'r1'],
    ['preview with no files', 'preview', [], undefined],
    ['preview with one file but no recent id', 'preview', [file('a')], undefined],
    ['merge', 'merge', [file('a')], 'r1'],
    ['settings', 'settings', [file('a')], 'r1'],
  ] as const)('%s does not write', (_, view, files, recentId) => {
    const s = spy();
    writeRoute(view, {files: [...files], ...(recentId ? {recentId} : {})});
    expect(s).not.toHaveBeenCalled();
  });
});

/** A browser whose view transition applies its update later, as Chrome does: the callbacks wait in `queue`. */
const queue: Array<() => void> = [];
const asyncTransitions = () => {
  queue.length = 0;
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({matches: false})),
  );
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: (cb: () => void) => {
      queue.push(cb);
      return {ready: Promise.resolve(), finished: Promise.resolve(), skipTransition() {}};
    },
  });
};
const applyTransitions = () => {
  while (queue.length) queue.shift()?.();
};
afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition');
  vi.unstubAllGlobals();
});

describe('navigate with a view transition that applies later', () => {
  beforeEach(asyncTransitions);

  it('keeps the old view and tab until the transition applies, then changes both together', () => {
    useApp.setState({view: 'preview'});
    documentStore.getState().setTab('document');
    navigate('edit');
    expect(useApp.getState().view).toBe('preview');
    expect(documentStore.getState().tab).toBe('document');
    applyTransitions();
    expect(useApp.getState().view).toBe('edit');
    expect(documentStore.getState().tab).toBe('pages');
  });

  it('the last navigation wins even when an earlier one has not applied yet', () => {
    navigate('edit');
    navigate('home'); // home is still the shown view, but a change to edit is pending
    applyTransitions();
    expect(useApp.getState().view).toBe('home');
  });

  it('a draft saved in Edit with ?view=home ends on Home', async () => {
    vi.mocked(readDraft).mockResolvedValue(draft('edit'));
    at('?view=home');
    await startup();
    applyTransitions();
    expect(useApp.getState().view).toBe('home');
  });

  it('navigating to the view already shown starts no transition', async () => {
    navigate('settings');
    applyTransitions();
    await new Promise((r) => setTimeout(r, 0)); // the first transition finishes
    const before = queue.length;
    navigate('settings');
    expect(queue.length).toBe(before);
  });
});

describe('navigate', () => {
  it('sets the view and the document tab for Preview and Edit', () => {
    navigate('edit');
    expect(useApp.getState().view).toBe('edit');
    expect(documentStore.getState().tab).toBe('pages');
    navigate('preview');
    expect(documentStore.getState().tab).toBe('document');
    navigate('settings');
    expect(useApp.getState().view).toBe('settings');
    expect(documentStore.getState().tab).toBe('document');
  });

  it('writes a pending document draft when leaving for Merge, as the legacy workspace switch did', () => {
    navigate('edit');
    expect(flushDraft).not.toHaveBeenCalled();
    navigate('merge');
    expect(flushDraft).toHaveBeenCalledOnce();
  });
});

describe('startup', () => {
  it('with nothing saved and no query goes Home without a toast', async () => {
    await startup();
    expect(useApp.getState()).toMatchObject({view: 'home', toast: null});
    expect(startDraftSync).toHaveBeenCalledWith(documentStore);
  });

  it('drops a draft that fails to restore and still starts draft sync', async () => {
    vi.mocked(readDraft).mockResolvedValue(draft('edit'));
    const restore = vi
      .spyOn(documentStore.getState(), 'restore')
      .mockRejectedValue(new Error('bad'));
    await expect(startup()).resolves.toBeUndefined();
    restore.mockRestore();
    expect(clearDraft).toHaveBeenCalledOnce();
    expect(startDraftSync).toHaveBeenCalledOnce();
    expect(useApp.getState()).toMatchObject({view: 'home', toast: null});
  });

  it('restores the draft into the document store, then starts draft sync', async () => {
    vi.mocked(readDraft).mockResolvedValue(draft('edit'));
    vi.mocked(startDraftSync).mockImplementation(() => {
      expect(documentStore.getState().files.map((f) => f.id)).toEqual(['f1']);
      return () => {};
    });
    await startup();
    expect(startDraftSync).toHaveBeenCalledTimes(1);
    expect(loadPdf).not.toHaveBeenCalled();
  });

  it('with no view and a draft opens the draft view with the restored toast', async () => {
    vi.mocked(readDraft).mockResolvedValue(draft('edit'));
    await startup();
    expect(useApp.getState()).toMatchObject({
      view: 'edit',
      documentView: 'edit',
      workspace: 'document',
    });
    expect(documentStore.getState().tab).toBe('pages');
    expect(useApp.getState().toast).toMatchObject({
      text: 'Your saved draft has been restored.',
      tone: 'info',
    });
  });

  it('a draft with ?view=home stays Home, keeps the document workspace and shows no toast', async () => {
    vi.mocked(readDraft).mockResolvedValue(draft('preview'));
    at('?view=home');
    await startup();
    expect(useApp.getState()).toMatchObject({view: 'home', workspace: 'document', toast: null});
    expect(documentStore.getState().files).toHaveLength(1);
  });

  it('reads the query before anything can rewrite it', async () => {
    at('?view=edit');
    vi.mocked(readDraft).mockImplementation(async () => {
      at('?view=home'); // the first render writes Home's route while the draft loads
      return null;
    });
    await startup();
    expect(useApp.getState().view).toBe('edit');
  });

  it('?view= opens that view', async () => {
    at('?view=edit');
    await startup();
    expect(useApp.getState().view).toBe('edit');
    expect(documentStore.getState().tab).toBe('pages');
  });

  it('a draft that cannot be read is ignored', async () => {
    vi.mocked(readDraft).mockRejectedValue(new Error('quota'));
    await startup();
    expect(useApp.getState()).toMatchObject({view: 'home', toast: null});
  });

  it('does not override a view the user chose while the draft was loading', async () => {
    let release: (d: ReturnType<typeof draft>) => void = () => {};
    vi.mocked(readDraft).mockReturnValue(
      new Promise((r) => {
        release = r;
      }),
    );
    const started = startup();
    navigate('preview');
    release(draft('edit'));
    await started;
    expect(useApp.getState().view).toBe('preview');
    expect(useApp.getState().toast).toBeNull();
  });

  it('?combine=new opens Merge even with a draft', async () => {
    vi.mocked(readDraft).mockResolvedValue(draft('edit'));
    at('?combine=new');
    await startup();
    expect(useApp.getState()).toMatchObject({view: 'merge', workspace: 'merge', toast: null});
    expect(documentStore.getState().files).toHaveLength(1);
  });

  it('?recent= opens that recent in Preview, replacing a restored draft', async () => {
    vi.mocked(readDraft).mockResolvedValue(draft('edit'));
    recentsOpen.mockResolvedValue({
      entry: {id: 'r1', name: 'Report.pdf', pages: 2, size: 3, modified: 1, path: 'C:\\Report.pdf'},
      bytes: new Uint8Array(3),
    });
    at('?recent=r1');
    await startup();
    expect(recentsOpen).toHaveBeenCalledWith('r1');
    const [opened] = documentStore.getState().files;
    expect(opened).toMatchObject({name: 'Report.pdf', recentId: 'r1', path: 'C:\\Report.pdf'});
    expect(useApp.getState()).toMatchObject({view: 'preview', toast: null});
  });

  it('?recent=&view=edit opens it in Edit', async () => {
    recentsOpen.mockResolvedValue({
      entry: {id: 'r1', name: 'Report.pdf', pages: 2, size: 3, modified: 1},
      bytes: new Uint8Array(3),
    });
    at('?recent=r1&view=edit');
    await startup();
    expect(useApp.getState().view).toBe('edit');
    expect(documentStore.getState().tab).toBe('pages');
  });

  it('a recent that cannot be opened shows an error toast and falls back to the requested view', async () => {
    recentsOpen.mockRejectedValue(new Error('Unknown recent entry'));
    at('?recent=gone&view=edit');
    await startup();
    expect(useApp.getState().toast).toMatchObject({
      text: 'Could not open that PDF. Choose a valid, unlocked PDF.',
      tone: 'error',
    });
    expect(useApp.getState().view).toBe('edit');
  });

  it('a failed recent keeps its error toast instead of the restored-draft toast, and goes Home', async () => {
    vi.mocked(readDraft).mockResolvedValue(draft('edit'));
    recentsOpen.mockRejectedValue(new Error('quota'));
    at('?recent=gone');
    await startup();
    expect(useApp.getState().toast).toMatchObject({tone: 'error'});
    expect(useApp.getState().view).toBe('home');
    expect(documentStore.getState().files.map((f) => f.id)).toEqual(['f1']);
  });

  it('a recent that is not a valid PDF keeps the invalid-PDF toast and the restored draft', async () => {
    vi.mocked(readDraft).mockResolvedValue(draft('preview'));
    recentsOpen.mockResolvedValue({
      entry: {id: 'r1', name: 'broken.pdf', pages: 2, size: 3, modified: 1},
      bytes: new Uint8Array(3),
    });
    at('?recent=r1');
    await startup();
    expect(useApp.getState().toast).toMatchObject({
      text: 'Could not open broken.pdf. Use a valid PDF without a password.',
      tone: 'error',
    });
    expect(documentStore.getState().files.map((f) => f.id)).toEqual(['f1']);
    expect(useApp.getState().view).toBe('home');
  });
});

describe('openRecent', () => {
  const opens = (path?: string) =>
    recentsOpen.mockResolvedValue({
      entry: {
        id: 'r1',
        name: 'Report.pdf',
        pages: 9,
        size: 3,
        modified: 1,
        ...(path ? {path} : {}),
      },
      bytes: new Uint8Array(3),
    });
  it('records the open (pages read from the store, path kept) so the row moves to the top', async () => {
    opens('C:\\Report.pdf');
    expect(await openRecent('r1')).toBe(true);
    expect(recents.record).toHaveBeenCalledWith({
      name: 'Report.pdf',
      bytes: new Uint8Array(3),
      pages: 2,
      path: 'C:\\Report.pdf',
    });
  });
  it('a recording failure still opens', async () => {
    opens();
    vi.mocked(recents.record).mockRejectedValue(new Error('quota'));
    expect(await openRecent('r1')).toBe(true);
    expect(useApp.getState().toast).toBeNull();
  });
  it('while the document is saving: one wait toast, nothing opened', async () => {
    documentStore.setState({files: [file('f1')]});
    documentStore.getState().beginExport();
    opens();
    expect(await openRecent('r1')).toBe(false);
    documentStore.getState().endExport();
    expect(recentsOpen).not.toHaveBeenCalled();
    expect(useApp.getState().toast).toMatchObject({
      text: 'Wait for the save to finish.',
      tone: 'info',
    });
  });
  it('does not record when the open fails', async () => {
    recentsOpen.mockRejectedValue(new Error('bad'));
    expect(await openRecent('r1')).toBe(false);
    expect(recents.record).not.toHaveBeenCalled();
  });
  it('does not record an invalid PDF', async () => {
    recentsOpen.mockResolvedValue({
      entry: {id: 'r1', name: 'broken.pdf', pages: 2, size: 3, modified: 1},
      bytes: new Uint8Array(3),
    });
    expect(await openRecent('r1')).toBe(false);
    expect(recents.record).not.toHaveBeenCalled();
  });
  it('a missing file says so and returns false', async () => {
    recentsOpen.mockRejectedValue(new FileMissingError('gone'));
    expect(await openRecent('r1')).toBe(false);
    expect(useApp.getState().toast).toMatchObject({
      text: 'That PDF was not found. Locate it or remove it from recents.',
      tone: 'error',
    });
  });
});
