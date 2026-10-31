import {act, render} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {makePdf} from '../pdf/fixtures';
import {loadPdf} from '../pdf/load';
import {platform, type DropEvent, type PickedFile} from '../platform';
import {useApp, type View} from '../state/app';
import {documentStore, mergeStore} from '../state/workspaces';
import {createRecents} from '../storage/recents';
import {pickAndImport, useFileImport} from './useFileImport';

// Pass-through spy: counts parses at the module boundary.
vi.mock('../pdf/load', async (orig) => {
  const m = await orig<typeof import('../pdf/load')>();
  return {...m, loadPdf: vi.fn(m.loadPdf)};
});
vi.mock('../pdf/registry', () => ({retain: vi.fn(), release: vi.fn(async () => {})}));

const pdf = async (name: string, pages = 1, path?: string): Promise<PickedFile> => ({
  name,
  bytes: await makePdf(pages),
  ...(path && {path}),
});
const recents = () => createRecents(platform).list();

let emit: (e: DropEvent) => void;
const unsubscribe = vi.fn();

function Host() {
  useFileImport();
  return <main className="workspace" />;
}
const workspaceEl = () => document.querySelector('.workspace')!;
const drop = (files: PickedFile[]) =>
  act(async () => {
    emit({type: 'drop', files});
  });
// The import runs detached from the event: wait for the state it ends in, not a fixed time.
const until = (done: () => void) => vi.waitFor(done, {timeout: 5000});
// An ignored import does no I/O, so one macrotask lets every queued microtask run.
const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));
const opened = () => expect(documentStore.getState().files[0]?.recentId).toBeDefined();
const merged = (n: number) => () => {
  const {files} = mergeStore.getState();
  expect(files).toHaveLength(n);
  expect(files.every((f) => f.recentId)).toBe(true);
};
const toasted = () => expect(useApp.getState().toast).not.toBeNull();

beforeEach(async () => {
  vi.spyOn(platform, 'onFileDrop').mockImplementation((cb) => {
    emit = cb;
    return unsubscribe;
  });
  useApp.setState({view: 'home', toast: null});
  indexedDB.deleteDatabase('ifixpdf-local-documents');
});
afterEach(async () => {
  vi.restoreAllMocks();
  unsubscribe.mockClear();
  documentStore.setState({exporting: false});
  mergeStore.setState({exporting: false});
  await documentStore.getState().reset();
  await mergeStore.getState().reset();
});

/** `done` throws until the import has finished; omit it for an import that is ignored. */
const importAs = async (view: View, files: PickedFile[], done?: () => void) => {
  useApp.setState({view});
  render(<Host />);
  await drop(files);
  await (done ? until(done) : flush());
};

describe('dropping files', () => {
  it.each(['home', 'preview'] as const)(
    'on %s opens the first PDF only and goes to Preview',
    async (view) => {
      await importAs(view, [await pdf('a.pdf', 2), await pdf('b.pdf')], opened);
      const {files} = documentStore.getState();
      expect(files.map((f) => f.name)).toEqual(['a.pdf']);
      expect(useApp.getState().view).toBe('preview');
      expect(mergeStore.getState().files).toEqual([]);
      expect((await recents()).map((r) => [r.name, r.pages])).toEqual([['a.pdf', 2]]);
      expect(files[0]?.recentId).toBe((await recents())[0]?.id);
    },
  );

  it('on edit replaces the document and stays in Edit', async () => {
    await importAs('edit', [await pdf('a.pdf')], opened);
    expect(documentStore.getState().files.map((f) => f.name)).toEqual(['a.pdf']);
    expect(useApp.getState().view).toBe('edit');
  });

  it.each(['merge', 'settings'] as const)(
    'on %s adds every PDF to Merge and goes to Merge',
    async (view) => {
      await importAs(view, [await pdf('a.pdf'), await pdf('b.pdf', 3)], merged(2));
      expect(mergeStore.getState().files.map((f) => f.name)).toEqual(['a.pdf', 'b.pdf']);
      expect(documentStore.getState().files).toEqual([]);
      expect(useApp.getState().view).toBe('merge');
      expect((await recents()).map((r) => r.name).sort()).toEqual(['a.pdf', 'b.pdf']);
    },
  );

  it('an empty drop (no PDFs) does nothing', async () => {
    await importAs('merge', []);
    expect(mergeStore.getState().files).toEqual([]);
    expect(useApp.getState().toast).toBeNull();
  });

  it('an invalid PDF shows the error, records nothing and does not change view', async () => {
    await importAs('home', [{name: 'bad.pdf', bytes: new Uint8Array([1, 2, 3])}], toasted);
    expect(useApp.getState().toast).toMatchObject({
      text: 'Could not open bad.pdf. Use a valid PDF without a password.',
      tone: 'error',
    });
    expect(await recents()).toEqual([]);
    expect(useApp.getState().view).toBe('home');
  });

  it('in Merge, a bad file is reported while the good one is added and recorded', async () => {
    await importAs(
      'merge',
      [{name: 'bad.pdf', bytes: new Uint8Array([1])}, await pdf('ok.pdf')],
      merged(1),
    );
    expect(mergeStore.getState().files.map((f) => f.name)).toEqual(['ok.pdf']);
    expect((await recents()).map((r) => r.name)).toEqual(['ok.pdf']);
  });

  it('links each added file to its own pick when names collide', async () => {
    await importAs(
      'merge',
      [
        {name: 'a.pdf', bytes: new Uint8Array([1]), path: 'X/a.pdf'},
        await pdf('a.pdf', 1, 'Y/a.pdf'),
      ],
      merged(1),
    );
    expect((await recents()).map((r) => r.path)).toEqual(['Y/a.pdf']);
  });

  it('a recents failure does not block opening', async () => {
    vi.spyOn(indexedDB, 'open').mockImplementation(() => {
      throw new Error('blocked');
    });
    // The recents write fails, so opening (navigate to Preview) is the last observable step.
    await importAs('home', [await pdf('a.pdf')], () =>
      expect(useApp.getState().view).toBe('preview'),
    );
    expect(documentStore.getState().files.map((f) => f.name)).toEqual(['a.pdf']);
    expect(documentStore.getState().files[0]?.recentId).toBeUndefined();
    expect(useApp.getState().view).toBe('preview');
  });

  it('while the workspace is exporting nothing changes', async () => {
    documentStore.setState({exporting: true});
    await importAs('home', [await pdf('a.pdf')]);
    expect(documentStore.getState().files).toEqual([]);
    expect(useApp.getState().view).toBe('home');
  });

  it('opening the same file twice keeps one recent row (browser: same bytes)', async () => {
    const f = await pdf('a.pdf');
    await importAs('home', [f], opened);
    const first = documentStore.getState().files;
    await drop([{...f}]);
    await until(() => {
      expect(documentStore.getState().files).not.toBe(first);
      opened();
    });
    expect(await recents()).toHaveLength(1);
  });
});

describe('parsing', () => {
  it('parses each opened file exactly once, single open', async () => {
    vi.mocked(loadPdf).mockClear();
    await importAs('home', [await pdf('a.pdf', 2), await pdf('b.pdf')], opened);
    expect(loadPdf).toHaveBeenCalledTimes(1);
  });

  it('parses each file exactly once in Merge', async () => {
    vi.mocked(loadPdf).mockClear();
    await importAs(
      'merge',
      [await pdf('a.pdf'), await pdf('b.pdf', 2), await pdf('c.pdf')],
      merged(3),
    );
    expect(loadPdf).toHaveBeenCalledTimes(3);
  });

  it('ignored imports (exporting) record nothing', async () => {
    mergeStore.setState({exporting: true});
    await importAs('merge', [await pdf('a.pdf')]);
    expect(await recents()).toEqual([]);
  });

  it('in Merge, attaches each recent id to its file', async () => {
    await importAs('merge', [await pdf('a.pdf'), await pdf('b.pdf', 2)], merged(2));
    const rows = await recents();
    expect(
      mergeStore
        .getState()
        .files.map((f) => f.recentId)
        .sort(),
    ).toEqual(rows.map((r) => r.id).sort());
  });
});

describe('drop highlight', () => {
  it('over adds drop-active to the workspace, leave and drop clear it', async () => {
    render(<Host />);
    act(() => emit({type: 'over'}));
    expect(workspaceEl()).toHaveClass('drop-active');
    act(() => emit({type: 'leave'}));
    expect(workspaceEl()).not.toHaveClass('drop-active');
    act(() => emit({type: 'over'}));
    await drop([]);
    expect(workspaceEl()).not.toHaveClass('drop-active');
  });

  it('a failed drop clears the highlight and shows the open-failure toast', () => {
    render(<Host />);
    act(() => emit({type: 'over'}));
    act(() => emit({type: 'error'}));
    expect(workspaceEl()).not.toHaveClass('drop-active');
    expect(useApp.getState().toast).toMatchObject({
      text: 'Could not open that PDF. Choose a valid, unlocked PDF.',
      tone: 'error',
    });
  });

  it('unsubscribes on unmount', () => {
    render(<Host />).unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('pickAndImport', () => {
  it.each([
    ['home', false],
    ['preview', false],
    ['edit', false],
    ['merge', true],
    ['settings', true],
  ] as const)('%s asks for multiple=%s', async (view, multiple) => {
    useApp.setState({view});
    const pick = vi.spyOn(platform, 'pickPdfs').mockResolvedValue([]);
    await pickAndImport();
    expect(pick).toHaveBeenCalledWith({multiple});
  });

  it('imports what the picker returns', async () => {
    useApp.setState({view: 'merge'});
    vi.spyOn(platform, 'pickPdfs').mockResolvedValue([await pdf('a.pdf'), await pdf('b.pdf')]);
    await pickAndImport();
    expect(mergeStore.getState().files).toHaveLength(2);
  });

  it('files picked in Merge still go to Merge when the view changes while they are read', async () => {
    useApp.setState({view: 'merge'});
    const picked = [await pdf('a.pdf'), await pdf('b.pdf')];
    vi.spyOn(platform, 'pickPdfs').mockImplementation(async () => {
      useApp.setState({view: 'preview'});
      return picked;
    });
    await pickAndImport();
    expect(mergeStore.getState().files).toHaveLength(2);
    expect(documentStore.getState().files).toEqual([]);
    expect(useApp.getState().view).toBe('merge');
  });

  it('a cancelled picker does nothing', async () => {
    vi.spyOn(platform, 'pickPdfs').mockResolvedValue([]);
    await pickAndImport();
    expect(useApp.getState().toast).toBeNull();
  });

  it('a picker failure shows a toast', async () => {
    vi.spyOn(platform, 'pickPdfs').mockRejectedValue(new Error('denied'));
    await pickAndImport();
    expect(useApp.getState().toast).toMatchObject({
      text: 'Could not open that PDF. Choose a valid, unlocked PDF.',
      tone: 'error',
    });
  });
});
