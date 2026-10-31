import {act, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {makePdf} from '../../pdf/fixtures';
import {FileMissingError, platform} from '../../platform';
import {useApp} from '../../state/app';
import {documentStore, mergeStore} from '../../state/workspaces';
import {recents} from '../../storage/app-recents';
import type {RecentEntry, RecentsRepository} from '../../storage/recents';
import {HomeView} from './HomeView';

vi.mock('../../pdf/registry', () => ({retain: vi.fn(), release: vi.fn(async () => {})}));
vi.mock('../../pdf/thumbnails', () => ({renderBlob: vi.fn(async () => new Blob(['png']))}));
vi.mock('../../pdf/bytes', () => ({putBytes: vi.fn()}));

const entry = (id: string, over: Partial<RecentEntry> = {}): RecentEntry => ({
  id,
  name: `${id}.pdf`,
  pages: 2,
  size: 2048,
  modified: Date.UTC(2026, 2, 5, 12),
  ...over,
});
let rows: RecentEntry[];
let repo: {[K in keyof RecentsRepository]: ReturnType<typeof vi.fn>};
const onAddPassword = vi.fn();
const user = () => userEvent.setup();
const show = async () => {
  render(<HomeView onAddPassword={onAddPassword} />);
  await screen.findByText('A.pdf');
};
const more = (name: string) => screen.getByRole('button', {name: `More actions for ${name}`});

beforeEach(() => {
  rows = [entry('A', {name: 'A.pdf'}), entry('B', {name: 'B.pdf', pages: 1, size: 2_000_000})];
  repo = {
    list: vi.fn(async () => rows),
    record: vi.fn(async (input: {name: string; thumbnail?: Blob}) => ({...entry('A'), ...input})),
    open: vi.fn(async (id: string) => ({
      entry: rows.find((r) => r.id === id)!,
      bytes: await makePdf(1),
    })),
    relocate: vi.fn(async () => entry('A')),
    updateThumbnail: vi.fn(async (id: string) => rows.find((r) => r.id === id)),
    remove: vi.fn(async (id: string) => {
      rows = rows.filter((r) => r.id !== id);
    }),
  };
  Object.assign(recents, repo); // the shared instance; this file's module graph is isolated
  useApp.setState({view: 'home', toast: null});
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await documentStore.getState().reset();
  await mergeStore.getState().reset();
  onAddPassword.mockClear();
});

describe('list', () => {
  it('shows Loading, then rows newest first with pages, size and date', async () => {
    render(<HomeView onAddPassword={onAddPassword} />);
    expect(screen.getByText('Loading recent documents…')).toBeInTheDocument();
    await screen.findByText('A.pdf');
    const names = screen.getAllByRole('checkbox').map((c) => c.getAttribute('aria-label'));
    expect(names).toEqual(['Select A.pdf', 'Select B.pdf']);
    expect(screen.getByText('2 pages · 2 KB')).toBeInTheDocument();
    expect(screen.getByText('1 pages · 1.9 MB')).toBeInTheDocument();
    expect(
      screen.getAllByText(
        new Date(rows[0]!.modified).toLocaleDateString(undefined, {month: 'short', day: 'numeric'}),
      ),
    ).toHaveLength(2);
    expect(screen.getByRole('button', {name: 'Open A.pdf'})).toBeInTheDocument();
  });

  it('shows the empty state with Add PDFs', async () => {
    rows = [];
    render(<HomeView onAddPassword={onAddPassword} />);
    expect(await screen.findByText('No recent PDFs yet')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Add PDFs'})).toBeInTheDocument();
  });

  it('shows an error text when listing fails', async () => {
    repo.list.mockRejectedValue(new Error('idb'));
    render(<HomeView onAddPassword={onAddPassword} />);
    expect(
      await screen.findByText('Recent documents could not be loaded. Add a PDF to continue.'),
    ).toBeInTheDocument();
  });

  it('Merge selected is disabled at 0 and shows the count', async () => {
    await show();
    const merge = screen.getByRole('button', {name: /^Merge selected/});
    expect(merge).toBeDisabled();
    await user().click(screen.getByRole('checkbox', {name: 'Select A.pdf'}));
    await user().click(screen.getByRole('checkbox', {name: 'Select B.pdf'}));
    expect(screen.getByRole('button', {name: 'Merge selected (2)'})).toBeEnabled();
    expect(
      screen.getByRole('checkbox', {name: 'Select A.pdf'}).closest('.recent-file'),
    ).toHaveClass('recent-selected');
    await user().click(screen.getByRole('checkbox', {name: 'Select A.pdf'}));
    expect(screen.getByRole('button', {name: 'Merge selected (1)'})).toBeEnabled();
  });
});

describe('opening', () => {
  it('the name opens the recent in Preview', async () => {
    await show();
    await user().click(screen.getByRole('button', {name: /^A\.pdf/}));
    await waitFor(() => expect(useApp.getState().view).toBe('preview'));
    expect(repo.open).toHaveBeenCalledWith('A');
    expect(documentStore.getState().files[0]).toMatchObject({name: 'A.pdf', recentId: 'A'});
  });

  it('a file that went missing flips the row to missing and shows an error toast', async () => {
    await show();
    repo.open.mockRejectedValueOnce(new FileMissingError('gone'));
    repo.list.mockImplementation(async () =>
      rows.map((r) => (r.id === 'A' ? {...r, missing: true} : r)),
    );
    await user().click(screen.getByRole('button', {name: 'Open A.pdf'}));
    expect(await screen.findByText('File not found')).toBeInTheDocument();
    expect(useApp.getState().toast).toMatchObject({tone: 'error'});
    expect(useApp.getState().view).toBe('home');
  });

  it('another open error shows the legacy error toast', async () => {
    await show();
    repo.open.mockRejectedValueOnce(new Error('bad'));
    await user().click(screen.getByRole('button', {name: 'Open A.pdf'}));
    await waitFor(() =>
      expect(useApp.getState().toast?.text).toBe(
        'Could not open that PDF. Choose a valid, unlocked PDF.',
      ),
    );
  });
});

describe('missing entries', () => {
  beforeEach(() => {
    rows = [entry('A', {name: 'A.pdf', missing: true, path: 'C:\\A.pdf'})];
  });

  it('shows File not found with Locate and Remove', async () => {
    render(<HomeView onAddPassword={onAddPassword} />);
    expect(await screen.findByText('File not found')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Locate…'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Remove'})).toBeInTheDocument();
  });

  it('Locate picks one file and relocates; the row stops showing File not found', async () => {
    render(<HomeView onAddPassword={onAddPassword} />);
    await screen.findByText('File not found');
    const bytes = new Uint8Array([1]);
    const pick = vi
      .spyOn(platform, 'pickPdfs')
      .mockResolvedValue([{name: 'New.pdf', bytes, path: 'D:\\New.pdf'}]);
    repo.relocate.mockImplementation(async () => {
      rows = [entry('A', {name: 'New.pdf'})];
      return rows[0]!;
    });
    await user().click(screen.getByRole('button', {name: 'Locate…'}));
    expect(pick).toHaveBeenCalledWith({multiple: false});
    expect(repo.relocate).toHaveBeenCalledWith('A', {name: 'New.pdf', bytes, path: 'D:\\New.pdf'});
    await waitFor(() => expect(screen.queryByText('File not found')).toBeNull());
    expect(screen.getByText('New.pdf')).toBeInTheDocument();
  });

  it('cancelling Locate changes nothing', async () => {
    render(<HomeView onAddPassword={onAddPassword} />);
    await screen.findByText('File not found');
    vi.spyOn(platform, 'pickPdfs').mockResolvedValue([]);
    await user().click(screen.getByRole('button', {name: 'Locate…'}));
    expect(repo.relocate).not.toHaveBeenCalled();
    expect(screen.getByText('File not found')).toBeInTheDocument();
  });

  it('a failing relocate shows an error toast', async () => {
    render(<HomeView onAddPassword={onAddPassword} />);
    await screen.findByText('File not found');
    vi.spyOn(platform, 'pickPdfs').mockResolvedValue([
      {name: 'x.pdf', bytes: new Uint8Array(1), path: 'D:\\x.pdf'},
    ]);
    repo.relocate.mockRejectedValue(new Error('idb'));
    await user().click(screen.getByRole('button', {name: 'Locate…'}));
    await waitFor(() =>
      expect(useApp.getState().toast).toMatchObject({
        text: 'Could not locate that PDF.',
        tone: 'error',
      }),
    );
  });

  it('Remove deletes the row', async () => {
    render(<HomeView onAddPassword={onAddPassword} />);
    await screen.findByText('File not found');
    await user().click(screen.getByRole('button', {name: 'Remove'}));
    expect(repo.remove).toHaveBeenCalledWith('A');
    expect(await screen.findByText('No recent PDFs yet')).toBeInTheDocument();
  });
});

describe('context menu', () => {
  const items = () =>
    within(screen.getByRole('menu'))
      .getAllByRole('menuitem')
      .map((i) => i.textContent?.trim());

  it('opens from More with the five items and focuses the first', async () => {
    await show();
    await user().click(more('A.pdf'));
    expect(items()).toEqual([
      'View PDF',
      'Edit PDF',
      'Merge PDFs',
      'Add password…',
      'Remove from recents',
    ]);
    expect(screen.getByRole('menuitem', {name: 'View PDF'})).toHaveFocus();
  });

  it('opens on right-click of the row', async () => {
    await show();
    await user().pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('checkbox', {name: 'Select A.pdf'}).closest('.recent-file')!,
    });
    expect(screen.getByRole('menu', {name: 'Actions for A.pdf'})).toBeInTheDocument();
  });

  it('ArrowDown/ArrowUp wrap and Home/End jump', async () => {
    await show();
    const u = user();
    await u.click(more('A.pdf'));
    await u.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', {name: 'Remove from recents'})).toHaveFocus();
    await u.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', {name: 'View PDF'})).toHaveFocus();
    await u.keyboard('{End}');
    expect(screen.getByRole('menuitem', {name: 'Remove from recents'})).toHaveFocus();
    await u.keyboard('{Home}');
    expect(screen.getByRole('menuitem', {name: 'View PDF'})).toHaveFocus();
  });

  it('Escape closes and returns focus to More', async () => {
    await show();
    const u = user();
    await u.click(more('A.pdf'));
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(more('A.pdf')).toHaveFocus();
  });

  it('Tab closes and returns focus to More', async () => {
    await show();
    const u = user();
    await u.click(more('B.pdf'));
    await u.tab();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(more('B.pdf')).toHaveFocus();
  });

  it('an outside pointerdown and a resize close it', async () => {
    await show();
    const u = user();
    await u.click(more('A.pdf'));
    await u.click(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
    await u.click(more('A.pdf'));
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('clamps its position to an 8px margin', async () => {
    await show();
    vi.stubGlobal('innerWidth', 300);
    vi.stubGlobal('innerHeight', 300);
    await user().pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('checkbox', {name: 'Select A.pdf'}).closest('.recent-file')!,
      coords: {clientX: 0, clientY: 0},
    });
    const menu = screen.getByRole('menu');
    expect(menu.style.left).toBe('8px');
    expect(menu.style.top).toBe('8px');
  });

  it('View and Edit open the recent in that view', async () => {
    await show();
    const u = user();
    await u.click(more('A.pdf'));
    await u.click(screen.getByRole('menuitem', {name: 'Edit PDF'}));
    await waitFor(() => expect(useApp.getState().view).toBe('edit'));
    expect(documentStore.getState().tab).toBe('pages');
  });

  it('Add password… calls the stub with the entry', async () => {
    await show();
    const u = user();
    await u.click(more('B.pdf'));
    await u.click(screen.getByRole('menuitem', {name: 'Add password…'}));
    expect(onAddPassword).toHaveBeenCalledWith(rows[1]);
  });

  it('Remove from recents removes the row and touches no platform file API', async () => {
    await show();
    const spies = (['readPath', 'saveAs', 'openPath', 'reveal', 'pickPdfs'] as const).map((k) =>
      vi.spyOn(platform, k),
    );
    const u = user();
    await u.click(more('A.pdf'));
    await u.click(screen.getByRole('menuitem', {name: 'Remove from recents'}));
    await waitFor(() => expect(screen.queryByText('A.pdf')).toBeNull());
    expect(repo.remove).toHaveBeenCalledWith('A');
    spies.forEach((s) => expect(s).not.toHaveBeenCalled());
    expect(screen.getByText('B.pdf')).toBeInTheDocument();
  });
});

describe('Merge from Home', () => {
  const merge = async (label: RegExp | string) =>
    user().click(screen.getByRole('button', {name: label}));

  it('Merge selected opens the checked files on the Pages tab in review', async () => {
    await show();
    mergeStore.setState({workflow: 'add', tab: 'document'});
    await user().click(screen.getByRole('checkbox', {name: 'Select A.pdf'}));
    await user().click(screen.getByRole('checkbox', {name: 'Select B.pdf'}));
    await merge('Merge selected (2)');
    await waitFor(() => expect(useApp.getState().view).toBe('merge'));
    expect(mergeStore.getState().files.map((f) => f.name)).toEqual(['A.pdf', 'B.pdf']);
    expect(mergeStore.getState()).toMatchObject({tab: 'pages', workflow: 'review'});
    expect(useApp.getState().toast?.text).toBe('2 PDFs ready to merge.');
    expect(documentStore.getState().files).toHaveLength(0);
  });

  it('the menu merges the clicked file with the checked ones, deduped', async () => {
    await show();
    const u = user();
    await u.click(screen.getByRole('checkbox', {name: 'Select A.pdf'}));
    await u.click(more('A.pdf'));
    await u.click(screen.getByRole('menuitem', {name: 'Merge PDFs'}));
    await waitFor(() => expect(useApp.getState().view).toBe('merge'));
    expect(mergeStore.getState().files.map((f) => f.name)).toEqual(['A.pdf']);
    expect(useApp.getState().toast?.text).toBe('Add another PDF to merge with this document.');
  });

  it('replaces what Merge held', async () => {
    await show();
    await mergeStore.getState().addFiles([{name: 'Old.pdf', bytes: await makePdf(1)}]);
    const u = user();
    await u.click(more('B.pdf'));
    await u.click(screen.getByRole('menuitem', {name: 'Merge PDFs'}));
    await waitFor(() => expect(useApp.getState().view).toBe('merge'));
    expect(mergeStore.getState().files.map((f) => f.name)).toEqual(['B.pdf']);
  });

  it('a missing file stops the merge with an error toast and refreshes the row', async () => {
    await show();
    repo.open.mockRejectedValueOnce(new FileMissingError('gone'));
    await user().click(more('A.pdf'));
    await user().click(screen.getByRole('menuitem', {name: 'Merge PDFs'}));
    await waitFor(() => expect(useApp.getState().toast?.tone).toBe('error'));
    expect(useApp.getState().view).toBe('home');
    expect(mergeStore.getState().files).toHaveLength(0);
    expect(repo.list).toHaveBeenCalledTimes(2);
  });

  it('an addFiles rejection shows a toast and stays Home with no unhandled rejection', async () => {
    await show();
    vi.spyOn(mergeStore.getState(), 'addFiles').mockRejectedValueOnce(new Error('idb'));
    await user().click(more('A.pdf'));
    await user().click(screen.getByRole('menuitem', {name: 'Merge PDFs'}));
    await waitFor(() =>
      expect(useApp.getState().toast).toMatchObject({
        text: 'Could not prepare those PDFs for merging.',
        tone: 'error',
      }),
    );
    expect(useApp.getState().view).toBe('home');
  });

  it('counts only the files actually added, and stays Home when none were', async () => {
    await show();
    repo.open.mockImplementation(async (id: string) => ({
      entry: rows.find((r) => r.id === id)!,
      bytes: id === 'B' ? new Uint8Array([1]) : await makePdf(1),
    }));
    const u = user();
    await u.click(screen.getByRole('checkbox', {name: 'Select B.pdf'}));
    await u.click(more('A.pdf'));
    await u.click(screen.getByRole('menuitem', {name: 'Merge PDFs'}));
    await waitFor(() => expect(useApp.getState().view).toBe('merge'));
    expect(mergeStore.getState().files.map((f) => f.name)).toEqual(['A.pdf']);
    expect(useApp.getState().toast?.text).toBe('Add another PDF to merge with this document.');
  });

  it('navigates nowhere when every file is invalid', async () => {
    await show();
    repo.open.mockImplementation(async (id: string) => ({
      entry: rows.find((r) => r.id === id)!,
      bytes: new Uint8Array([1]),
    }));
    await user().click(more('A.pdf'));
    await user().click(screen.getByRole('menuitem', {name: 'Merge PDFs'}));
    await waitFor(() => expect(useApp.getState().toast?.text).toMatch(/^Could not open A\.pdf/));
    expect(useApp.getState().view).toBe('home');
  });

  it.each([
    ['Merge selected', true],
    ['the menu Merge PDFs', false],
  ] as const)('%s while Merge is saving: one wait toast, no navigation', async (_, viaToolbar) => {
    await show();
    await mergeStore.getState().addFiles([{name: 'Old.pdf', bytes: await makePdf(1)}]);
    mergeStore.getState().beginExport();
    const u = user();
    await u.click(screen.getByRole('checkbox', {name: 'Select A.pdf'}));
    if (viaToolbar) await merge('Merge selected (1)');
    else {
      await u.click(more('A.pdf'));
      await u.click(screen.getByRole('menuitem', {name: 'Merge PDFs'}));
    }
    await waitFor(() =>
      expect(useApp.getState().toast).toMatchObject({
        text: 'Wait for the save to finish.',
        tone: 'info',
      }),
    );
    expect(useApp.getState().view).toBe('home');
    expect(repo.open).not.toHaveBeenCalled();
    expect(mergeStore.getState().files.map((f) => f.name)).toEqual(['Old.pdf']);
    mergeStore.getState().endExport();
  });

  it('the toolbar Merge PDFs opens Merge', async () => {
    await show();
    await merge('Merge PDFs');
    expect(useApp.getState().view).toBe('merge');
  });
});

describe('thumbnails', () => {
  let fire: Array<(e: Array<{isIntersecting: boolean}>) => void>;
  const observe = () => fire.forEach((cb) => cb([{isIntersecting: true}]));
  beforeEach(() => {
    fire = [];
    rows = [entry('A', {name: 'A.pdf'})];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (e: Array<{isIntersecting: boolean}>) => void) {
          fire.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    URL.createObjectURL = vi.fn(() => 'blob:thumb');
    URL.revokeObjectURL = vi.fn();
  });

  it('renders a missing thumbnail once on first view and saves the Blob without changing modified', async () => {
    await show();
    await act(async () => {
      observe();
      observe();
    });
    await waitFor(() => expect(repo.updateThumbnail).toHaveBeenCalledTimes(1));
    expect(repo.updateThumbnail.mock.calls[0]![0]).toBe('A');
    expect(repo.updateThumbnail.mock.calls[0]![1]).toBeInstanceOf(Blob);
    expect(repo.record).not.toHaveBeenCalled();
    await waitFor(() => expect(document.querySelector('img[src="blob:thumb"]')).not.toBeNull());
  });

  it('removing a row while its thumbnail renders does not bring it back', async () => {
    const {renderBlob} = await import('../../pdf/thumbnails');
    let finish!: (b: Blob) => void;
    vi.mocked(renderBlob).mockImplementationOnce(
      () =>
        new Promise<Blob>((r) => {
          finish = r;
        }),
    );
    await show();
    await act(async () => {
      observe();
    });
    // The render must be in flight before the row is removed, or finish is not set yet.
    await waitFor(() => expect(renderBlob).toHaveBeenCalled(), {timeout: 5000});
    const u = user();
    await u.click(more('A.pdf'));
    await u.click(screen.getByRole('menuitem', {name: 'Remove from recents'}));
    await screen.findByText('No recent PDFs yet', undefined, {timeout: 5000});
    await act(async () => {
      finish(new Blob(['png']));
    });
    await waitFor(() => expect(repo.updateThumbnail).toHaveBeenCalled(), {timeout: 5000});
    expect(repo.record).not.toHaveBeenCalled();
    expect(screen.queryByText('A.pdf')).toBeNull();
  });

  it('a stored thumbnail is displayed and its URL revoked on unmount', async () => {
    rows = [entry('A', {name: 'A.pdf', thumbnail: new Blob(['t'])})];
    const {unmount} = render(<HomeView onAddPassword={onAddPassword} />);
    await screen.findByText('A.pdf');
    await waitFor(() => expect(document.querySelector('img[src="blob:thumb"]')).not.toBeNull());
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:thumb');
    expect(repo.record).not.toHaveBeenCalled();
  });

  it('a render failure keeps the placeholder and is not retried', async () => {
    const {renderBlob} = await import('../../pdf/thumbnails');
    vi.mocked(renderBlob).mockRejectedValue(new Error('boom'));
    await show();
    await act(async () => {
      observe();
    });
    await act(async () => {
      observe();
    });
    expect(renderBlob).toHaveBeenCalledTimes(1);
    expect(repo.record).not.toHaveBeenCalled();
    expect(document.querySelector('.recent-file img')).not.toHaveAttribute('src');
  });
});
