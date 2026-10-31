import {act, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {PageInstance, SourceFile} from '../../domain/types';
import {platform} from '../../platform';
import {pickAndImport} from '../../shell/useFileImport';
import {useApp} from '../../state/app';
import type {SavedResult} from '../../state/workspace';
import {mergeStore} from '../../state/workspaces';
import {MergeView} from './MergeView';

vi.mock('../../pdf/registry', () => ({
  retain: vi.fn(),
  release: vi.fn(async () => {}),
  acquire: vi.fn(() => new Promise(() => {})),
}));
vi.mock('../../pdf/thumbnails', () => ({thumbnail: vi.fn(async () => 'blob:x')}));
vi.mock('../../shell/useFileImport', async (orig) => ({
  ...(await orig<object>()),
  pickAndImport: vi.fn(),
}));
vi.mock('../../platform', async (orig) => {
  const real = await orig<typeof import('../../platform')>();
  return {
    ...real,
    platform: {...real.platform, openPath: vi.fn(async () => {}), reveal: vi.fn(async () => {})},
  };
});

const files: SourceFile[] = [
  {id: 'a', name: 'A.pdf', pages: 2, size: 2048},
  {id: 'b', name: 'B.pdf', pages: 1, size: 4096},
];
const pages: PageInstance[] = [
  {uid: 'a0', fileId: 'a', local: 0, rotation: 0},
  {uid: 'a1', fileId: 'a', local: 1, rotation: 0},
  {uid: 'b0', fileId: 'b', local: 0, rotation: 0},
];
const open = () => mergeStore.setState({files, pages, workflow: 'review'});
const saved: SavedResult = {
  name: 'Merged.pdf',
  folder: 'C:\\Docs',
  path: 'C:\\Docs\\Merged.pdf',
  pages: 3,
  size: 2048,
  bytes: new Uint8Array([1]),
};
const done = (result: SavedResult = saved) =>
  mergeStore.setState({files, pages, workflow: 'done', completed: result});
const step = (name: string) =>
  within(screen.getByRole('navigation', {name: 'Merge PDF workflow'})).getByRole('button', {
    name: new RegExp(name),
  });
const row = (name: string) => screen.getByRole('button', {name: `Preview ${name}`});

beforeEach(() => {
  vi.clearAllMocks();
  useApp.setState({view: 'merge', toast: null});
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({matches: false})),
  );
});
afterEach(async () => {
  vi.unstubAllGlobals();
  await mergeStore.getState().reset();
});

describe('workflow bar', () => {
  it('at 0 pages shows the Add stage; Arrange, Save and Done are disabled', async () => {
    render(<MergeView />);
    expect(screen.getByRole('heading', {name: 'Choose PDFs to merge'})).toBeInTheDocument();
    for (const name of ['Arrange & review', 'Save PDF', 'Done']) expect(step(name)).toBeDisabled();
    expect(step('Add PDFs')).toHaveAttribute('aria-current', 'step');
    expect(screen.getByText('Start a new document')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Add PDF files'}));
    await userEvent.click(step('Add PDFs'));
    expect(pickAndImport).toHaveBeenCalledTimes(2);
  });

  it('with pages: steps enabled except Done, earlier steps complete, and the summary counts', () => {
    open();
    render(<MergeView />);
    for (const name of ['Add PDFs', 'Arrange & review', 'Save PDF'])
      expect(step(name)).toBeEnabled();
    expect(step('Done')).toBeDisabled();
    expect(step('Arrange & review')).toHaveAttribute('aria-current', 'step');
    expect(step('Add PDFs').closest('li')).toHaveClass('complete');
    expect(screen.getByText('2 files · 3 pages')).toBeInTheDocument();
  });

  it('Save moves to the Save step and focuses the file name on the next frame; Arrange goes back and closes the panel', async () => {
    open();
    render(<MergeView />);
    await userEvent.click(step('Save PDF'));
    expect(mergeStore.getState().workflow).toBe('save');
    await waitFor(() => expect(document.getElementById('output-name')).toHaveFocus());
    expect(screen.getByRole('heading', {name: 'Save merged PDF'})).toBeInTheDocument();
    mergeStore.getState().setShowOutput(true);
    await userEvent.click(step('Arrange & review'));
    expect(mergeStore.getState().workflow).toBe('review');
    expect(mergeStore.getState().showOutput).toBe(false);
  });

  it('Save opens the output panel at 760px or narrower', async () => {
    vi.mocked(matchMedia).mockReturnValue({matches: true} as MediaQueryList);
    open();
    render(<MergeView />);
    await userEvent.click(step('Save PDF'));
    expect(mergeStore.getState().showOutput).toBe(true);
  });
});

describe('sources pane', () => {
  it('lists each file with its included pages, size and count, then the add zone and total', async () => {
    open();
    render(<MergeView />);
    const pane = screen.getByRole('region', {name: 'Source PDFs'});
    expect(within(pane).getByText('Source files')).toBeInTheDocument();
    expect(pane.querySelector('.count-badge')).toHaveTextContent('2');
    expect(row('A.pdf')).toHaveTextContent('Pages 1–2 · 2 KB');
    expect(row('B.pdf')).toHaveTextContent('Pages 3 · 4 KB');
    expect(within(pane).getByText('2 included')).toBeInTheDocument();
    expect(within(pane).getByText('3 pages in your merged PDF')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Move A.pdf up'})).toBeDisabled();
    expect(screen.getByRole('button', {name: 'Move B.pdf down'})).toBeDisabled();
    await userEvent.click(within(pane).getByRole('button', {name: 'Add PDFs or drop them here'}));
    expect(pickAndImport).toHaveBeenCalledOnce();
  });

  it('moving a file down reorders its page group', async () => {
    open();
    render(<MergeView />);
    await userEvent.click(screen.getByRole('button', {name: 'Move A.pdf down'}));
    expect(mergeStore.getState().files.map((f) => f.id)).toEqual(['b', 'a']);
    expect(mergeStore.getState().pages.map((p) => p.uid)).toEqual(['b0', 'a0', 'a1']);
    expect(row('A.pdf')).toHaveTextContent('Pages 2–3');
    await userEvent.click(screen.getByRole('button', {name: 'Move A.pdf up'}));
    expect(mergeStore.getState().pages.map((p) => p.uid)).toEqual(['a0', 'a1', 'b0']);
  });

  it('Remove drops the file and its pages', async () => {
    open();
    render(<MergeView />);
    await userEvent.click(screen.getByRole('button', {name: 'Remove A.pdf'}));
    expect(mergeStore.getState().files.map((f) => f.id)).toEqual(['b']);
    expect(mergeStore.getState().pages.map((p) => p.uid)).toEqual(['b0']);
  });

  it('selecting a row jumps to its first included page on the Document tab and marks it selected', async () => {
    open();
    mergeStore.setState({tab: 'pages'});
    render(<MergeView />);
    await userEvent.click(row('B.pdf'));
    expect(mergeStore.getState().currentPage).toBe(2);
    expect(mergeStore.getState().tab).toBe('document');
    expect(row('B.pdf')).toHaveAttribute('aria-pressed', 'true');
    expect(row('B.pdf').closest('.file')).toHaveClass('selected');
    expect(row('A.pdf')).toHaveAttribute('aria-pressed', 'false');
  });

  it('selecting a fully deleted source toasts and stays put', async () => {
    open();
    render(<MergeView />);
    act(() => mergeStore.getState().remove(new Set(['b0'])));
    expect(row('B.pdf')).toHaveTextContent('No pages included');
    expect(screen.getByText('0 included')).toBeInTheDocument();
    act(() => mergeStore.getState().goTo(1));
    await userEvent.click(row('B.pdf'));
    expect(useApp.getState().toast?.text).toBe(
      'No pages from this source are currently included. Use Undo to restore them.',
    );
    expect(mergeStore.getState().currentPage).toBe(1);
  });

  it('thumbnails the first page of each file at scale 0.18', async () => {
    const {thumbnail} = await import('../../pdf/thumbnails');
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(private cb: IntersectionObserverCallback) {}
        observe(el: Element) {
          this.cb(
            [{target: el, isIntersecting: true} as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
        }
        disconnect() {}
      },
    );
    open();
    render(<MergeView />);
    await waitFor(() => expect(thumbnail).toHaveBeenCalledWith('b', 0, 0, 0.18));
    expect(thumbnail).toHaveBeenCalledWith('a', 0, 0, 0.18);
  });
});

describe('Done screen', () => {
  it('shows the folder, the file card and Show in folder when there is a path', async () => {
    done();
    render(<MergeView />);
    expect(screen.getByRole('heading', {name: 'Your merged PDF is saved'})).toBeInTheDocument();
    expect(
      screen.getByText('Saved to C:\\Docs. Your source files are unchanged.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Merged.pdf')).toBeInTheDocument();
    expect(screen.getByText('3 pages · 2 KB · PDF document')).toBeInTheDocument();
    expect(step('Done')).toHaveAttribute('aria-current', 'step');
    expect(step('Done')).toBeDisabled();
    expect(screen.queryByRole('region', {name: 'Source PDFs'})).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Open PDF'}));
    expect(platform.openPath).toHaveBeenCalledWith('C:\\Docs\\Merged.pdf', saved.bytes);
    await userEvent.click(screen.getByRole('button', {name: 'Show in folder'}));
    expect(platform.reveal).toHaveBeenCalledWith('C:\\Docs\\Merged.pdf');
  });

  it('without a path: Saved as the name, Show in folder hidden, Open PDF falls back to the bytes', async () => {
    done({name: 'Merged.pdf', folder: '', pages: 3, size: 2048, bytes: saved.bytes});
    render(<MergeView />);
    expect(
      screen.getByText('Saved as Merged.pdf. Your source files are unchanged.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Show in folder'})).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Open PDF'}));
    expect(platform.openPath).toHaveBeenCalledWith('', saved.bytes);
  });

  it('Open PDF and Show in folder failures toast', async () => {
    vi.mocked(platform.openPath).mockRejectedValueOnce(new Error('x'));
    vi.mocked(platform.reveal).mockRejectedValueOnce(new Error('x'));
    done();
    render(<MergeView />);
    await userEvent.click(screen.getByRole('button', {name: 'Open PDF'}));
    await waitFor(() => expect(useApp.getState().toast?.text).toBe('Could not open the PDF.'));
    await userEvent.click(screen.getByRole('button', {name: 'Show in folder'}));
    await waitFor(() => expect(useApp.getState().toast?.text).toBe('Could not open the folder.'));
  });

  it('Back to document returns to review; View recent PDFs goes Home', async () => {
    done();
    render(<MergeView />);
    await userEvent.click(screen.getByRole('button', {name: 'Back to document'}));
    expect(mergeStore.getState().workflow).toBe('review');
    expect(screen.getByRole('region', {name: 'Source PDFs'})).toBeInTheDocument();
    act(() => mergeStore.getState().setWorkflow('done'));
    await userEvent.click(screen.getByRole('button', {name: 'View recent PDFs'}));
    expect(useApp.getState().view).toBe('home');
  });

  it('a failed Merge more PDFs toasts instead of rejecting unhandled', async () => {
    const reset = mergeStore.getState().reset;
    mergeStore.setState({
      reset: vi.fn(async () => {
        throw new Error('busy');
      }),
    });
    done();
    render(<MergeView />);
    await userEvent.click(screen.getByRole('button', {name: 'Merge more PDFs'}));
    await waitFor(() =>
      expect(useApp.getState().toast).toMatchObject({
        text: 'Could not start a new merge. Try again.',
        tone: 'error',
      }),
    );
    mergeStore.setState({reset});
  });

  it('Merge more PDFs starts an empty merge on the Add stage', async () => {
    done();
    render(<MergeView />);
    await userEvent.click(screen.getByRole('button', {name: 'Merge more PDFs'}));
    await waitFor(() =>
      expect(screen.getByRole('heading', {name: 'Choose PDFs to merge'})).toBeInTheDocument(),
    );
    expect(mergeStore.getState().files).toEqual([]);
    expect(mergeStore.getState().workflow).toBe('add');
  });
});
