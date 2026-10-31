import {act, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {PageInstance} from '../../domain/types';
import {thumbnail} from '../../pdf/thumbnails';
import {useApp} from '../../state/app';
import {createWorkspaceStore, type WorkspaceStore} from '../../state/workspace';
import {extractSelection} from '../../actions/save';
import {PageGrid} from './PageGrid';

vi.mock('../../pdf/registry', () => ({
  retain: vi.fn(),
  release: vi.fn(async () => {}),
  acquire: vi.fn(),
}));
vi.mock('../../actions/save', () => ({extractSelection: vi.fn()}));
vi.mock('../../pdf/thumbnails', () => ({
  thumbnail: vi.fn(
    async (fileId: string, local: number, rotation: number) =>
      `blob:${fileId}-${local}-${rotation}`,
  ),
}));

// One entry per observed element; `show` reports elements as intersecting, like the browser would on scroll.
let observed: Array<{
  el: Element;
  cb: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  live: boolean;
}> = [];
class FakeObserver {
  constructor(
    private cb: IntersectionObserverCallback,
    private options?: IntersectionObserverInit,
  ) {}
  observe(el: Element) {
    observed.push({el, cb: this.cb, options: this.options, live: true});
  }
  unobserve(el: Element) {
    observed
      .filter((o) => o.el === el)
      .forEach((o) => {
        o.live = false;
      });
  }
  disconnect() {
    observed
      .filter((o) => o.cb === this.cb)
      .forEach((o) => {
        o.live = false;
      });
  }
}
const report = (els: Element[], isIntersecting: boolean) =>
  act(() => {
    for (const o of observed.filter((o) => o.live && els.includes(o.el))) {
      o.cb(
        [{target: o.el, isIntersecting} as IntersectionObserverEntry],
        o as unknown as IntersectionObserver,
      );
    }
  });
const imgs = () => [...document.querySelectorAll<HTMLImageElement>('.page-card img')];

const make = (n: number): PageInstance[] =>
  Array.from({length: n}, (_, i) => ({uid: `u${i}`, fileId: 'f', local: i, rotation: 0}));
let store: WorkspaceStore;
const setup = (n = 4, props: {onSplit?: () => void} = {}) => {
  store = createWorkspaceStore('document');
  store.setState({
    files: [{id: 'f', name: 'A.pdf', pages: n, size: 1}],
    pages: make(n),
    tab: 'pages',
  });
  return render(<PageGrid store={store} {...props} />);
};
const order = () => store.getState().pages.map((p) => p.uid);
const selected = () => [...store.getState().selection.uids];
const preview = (n: number) => screen.getByRole('button', {name: `Preview page ${n}`});

beforeEach(() => {
  observed = [];
  vi.stubGlobal('IntersectionObserver', FakeObserver);
  vi.mocked(thumbnail).mockClear();
  useApp.setState({toast: null});
});
afterEach(() => vi.unstubAllGlobals());

describe('lazy thumbnails', () => {
  it('requests thumbnails only for the cards reported visible', async () => {
    setup(24); // enough to leave cards unrequested; 200 cards made this slow enough to time out under load
    expect(thumbnail).not.toHaveBeenCalled();
    report(imgs().slice(0, 12), true);
    await waitFor(() => expect(thumbnail).toHaveBeenCalledTimes(12));
    expect(thumbnail).toHaveBeenCalledWith('f', 0, 0, 0.42);
    await waitFor(() => expect(imgs()[0]).toHaveAttribute('src', 'blob:f-0-0'));
    expect(imgs()[12]).not.toHaveAttribute('src');
  });

  it('observes with a 200px margin', () => {
    setup(1);
    expect(observed[0]!.options?.rootMargin).toBe('200px');
  });

  it('keeps the thumbnail once it has been visible', async () => {
    setup(2);
    const img = imgs()[0]!;
    report([img], true);
    await waitFor(() => expect(img).toHaveAttribute('src', 'blob:f-0-0'));
    report([img], false);
    expect(img).toHaveAttribute('src', 'blob:f-0-0');
    report([img], true);
    expect(thumbnail, 'scrolling back does not ask again').toHaveBeenCalledTimes(1);
  });

  it('shows "Preview unavailable" when the thumbnail fails', async () => {
    vi.mocked(thumbnail).mockRejectedValueOnce(new Error('bad page'));
    setup(1);
    report(imgs(), true);
    await waitFor(() => expect(imgs()[0]).toHaveAttribute('alt', 'Preview unavailable'));
  });

  it('a move keeps the card, its img and its src, with no new thumbnail request', async () => {
    setup(3);
    report(imgs(), true);
    await waitFor(() => expect(imgs()[0]).toHaveAttribute('src', 'blob:f-0-0'));
    const card = document.querySelector('[data-uid="u0"]')!;
    const img = card.querySelector('img')!;
    vi.mocked(thumbnail).mockClear();
    act(() => store.getState().move(2, new Set(['u0'])));
    expect(document.querySelector('[data-uid="u0"]')).toBe(card);
    expect(card.querySelector('img')).toBe(img);
    expect(img).toHaveAttribute('src', 'blob:f-0-0');
    expect(
      [...document.querySelectorAll('.page-card')].map((c) => (c as HTMLElement).dataset.uid),
    ).toEqual(['u1', 'u2', 'u0']);
    expect(thumbnail).not.toHaveBeenCalled();
  });

  it('a rotation requests the rotated thumbnail', async () => {
    setup(1);
    report(imgs(), true);
    await waitFor(() => expect(imgs()[0]).toHaveAttribute('src', 'blob:f-0-0'));
    act(() => store.getState().rotate(90, new Set(['u0'])));
    await waitFor(() => expect(imgs()[0]).toHaveAttribute('src', 'blob:f-0-90'));
  });
});

describe('card', () => {
  it('labels the card, thumbnail, checkbox and move buttons with its position', () => {
    setup(2);
    const card = screen.getByRole('group', {name: 'Page 2, A.pdf'});
    expect(card).toHaveAttribute('data-uid', 'u1');
    expect(within(card).getByRole('checkbox', {name: 'Select page 2'})).not.toBeChecked();
    expect(within(card).getByRole('button', {name: 'Preview page 2'})).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(within(card).getByText('Page 2')).toBeInTheDocument();
    expect(within(card).getByTitle('A.pdf')).toHaveTextContent('A.pdf');
  });

  it('the grid is the Delete/Ctrl+A shortcut scope', () => {
    setup(1);
    expect(preview(1).closest('[data-shortcut-scope="grid"]')).not.toBeNull();
  });
});

describe('selection', () => {
  it('click selects one page and makes it current; Ctrl toggles; Meta toggles', async () => {
    setup(4);
    await userEvent.click(preview(2));
    expect(selected()).toEqual(['u1']);
    expect(store.getState().currentPage).toBe(1);
    expect(screen.getByRole('group', {name: 'Page 2, A.pdf'})).toHaveClass('is-selected');
    expect(preview(2)).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(preview(4), {}); // plain click replaces
    expect(selected()).toEqual(['u3']);
    fireEvent.click(preview(1), {ctrlKey: true});
    expect(selected()).toEqual(['u3', 'u0']);
    fireEvent.click(preview(1), {metaKey: true});
    expect(selected()).toEqual(['u3']);
  });

  it('Shift-click selects the range from the anchor', () => {
    setup(5);
    fireEvent.click(preview(2));
    fireEvent.click(preview(4), {shiftKey: true});
    expect(selected()).toEqual(['u1', 'u2', 'u3']);
    fireEvent.click(preview(1), {shiftKey: true});
    expect(selected()).toEqual(['u0', 'u1']);
  });

  it('the checkbox toggles its page; Shift on the checkbox extends the range', async () => {
    setup(4);
    await userEvent.click(screen.getByRole('checkbox', {name: 'Select page 1'}));
    await userEvent.click(screen.getByRole('checkbox', {name: 'Select page 3'}));
    expect(selected()).toEqual(['u0', 'u2']);
    expect(screen.getByRole('checkbox', {name: 'Select page 3'})).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', {name: 'Select page 4'}), {shiftKey: true}); // anchor is page 3
    expect(selected()).toEqual(['u2', 'u3']);
    await userEvent.click(screen.getByRole('checkbox', {name: 'Select page 4'}));
    expect(selected()).toEqual(['u2']);
  });

  it('select-all: unchecked at 0, indeterminate when some, checked when all; it selects and clears all', async () => {
    setup(3);
    const all = screen.getByRole('checkbox', {name: 'Select all pages'}) as HTMLInputElement;
    expect(screen.getByText('0 selected')).toBeInTheDocument();
    expect(all.checked).toBe(false);
    expect(all.indeterminate).toBe(false);
    await userEvent.click(preview(2));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(all.indeterminate).toBe(true);
    expect(all.checked).toBe(false);
    await userEvent.click(all);
    expect(selected()).toEqual(['u0', 'u1', 'u2']);
    expect(all.checked).toBe(true);
    expect(all.indeterminate).toBe(false);
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    await userEvent.click(all);
    expect(selected()).toEqual([]);
    expect(all.checked).toBe(false);
  });
});

describe('opening a page', () => {
  it('double-click opens the page on the Document tab', async () => {
    setup(3);
    await userEvent.dblClick(preview(3));
    expect(store.getState().tab).toBe('document');
    expect(store.getState().currentPage).toBe(2);
  });

  it('Enter opens the page on the Document tab', async () => {
    setup(3);
    preview(2).focus();
    await userEvent.keyboard('{Enter}');
    expect(store.getState().tab).toBe('document');
    expect(store.getState().currentPage).toBe(1);
  });
});

describe('moving with the keyboard and buttons', () => {
  it('Alt+Right and Alt+Left move the page and keep focus on the same card', async () => {
    setup(3);
    preview(1).focus();
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(order()).toEqual(['u1', 'u0', 'u2']);
    expect((document.activeElement?.closest('.page-card') as HTMLElement).dataset.uid).toBe('u0');
    expect(document.activeElement).toHaveAccessibleName('Preview page 2');
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(order()).toEqual(['u1', 'u2', 'u0']);
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}'); // already last: nothing
    expect(order()).toEqual(['u1', 'u2', 'u0']);
    await userEvent.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(order()).toEqual(['u1', 'u0', 'u2']);
    expect((document.activeElement?.closest('.page-card') as HTMLElement).dataset.uid).toBe('u0');
  });

  it('plain arrows do not move pages', async () => {
    setup(3);
    preview(1).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(order()).toEqual(['u0', 'u1', 'u2']);
  });

  it('earlier/later buttons move the page and are disabled at the ends', async () => {
    setup(3);
    expect(screen.getByRole('button', {name: 'Move page 1 earlier'})).toBeDisabled();
    expect(screen.getByRole('button', {name: 'Move page 3 later'})).toBeDisabled();
    expect(screen.getByRole('button', {name: 'Move page 2 earlier'})).toBeEnabled();
    await userEvent.click(screen.getByRole('button', {name: 'Move page 2 later'}));
    expect(order()).toEqual(['u0', 'u2', 'u1']);
    await userEvent.click(screen.getByRole('button', {name: 'Move page 2 earlier'}));
    expect(order()).toEqual(['u2', 'u0', 'u1']);
  });

  it('Later disables on the new last card when the page after it is deleted', () => {
    setup(2);
    expect(screen.getByRole('button', {name: 'Move page 1 later'})).toBeEnabled();
    act(() => store.getState().remove(new Set(['u1'])));
    expect(screen.getByRole('button', {name: 'Move page 1 later'})).toBeDisabled();
  });

  it('moving a selected page moves the whole selection', async () => {
    setup(5);
    fireEvent.click(preview(1));
    fireEvent.click(preview(2), {ctrlKey: true});
    await userEvent.click(screen.getByRole('button', {name: 'Move page 2 later'}));
    expect(order()).toEqual(['u2', 'u0', 'u1', 'u3', 'u4']);
  });

  it('moving an unselected page moves only it', async () => {
    setup(4);
    fireEvent.click(preview(1));
    await userEvent.click(screen.getByRole('button', {name: 'Move page 3 earlier'}));
    expect(order()).toEqual(['u0', 'u2', 'u1', 'u3']);
  });
});

describe('selection bar', () => {
  it('Delete removes the selected cards', async () => {
    setup(4);
    fireEvent.click(preview(2));
    fireEvent.click(preview(4), {ctrlKey: true});
    await userEvent.click(screen.getByRole('button', {name: 'Delete selected pages'}));
    expect(order()).toEqual(['u0', 'u2']);
    expect(document.querySelectorAll('.page-card')).toHaveLength(2);
    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });

  it('Rotate turns the selected pages clockwise; Duplicate copies them', async () => {
    setup(3);
    fireEvent.click(preview(2));
    await userEvent.click(screen.getByRole('button', {name: 'Rotate selected pages'}));
    expect(store.getState().pages.map((p) => p.rotation)).toEqual([0, 90, 0]);
    await userEvent.click(screen.getByRole('button', {name: 'Duplicate selected pages'}));
    expect(store.getState().pages).toHaveLength(4);
    expect(store.getState().pages[2]).toMatchObject({local: 1, rotation: 90});
    expect(document.querySelectorAll('.page-card')).toHaveLength(4);
  });

  it('Extract saves the selection through extractSelection', async () => {
    setup(3);
    fireEvent.click(preview(2));
    await userEvent.click(screen.getByRole('button', {name: 'Extract selected pages'}));
    expect(extractSelection).toHaveBeenCalledWith(store);
    expect(store.getState().pages).toHaveLength(3);
  });

  it.each(['Rotate', 'Duplicate', 'Extract', 'Delete'])(
    '%s with nothing selected toasts and changes nothing',
    async (name) => {
      setup(2);
      const before = store.getState().pages;
      await userEvent.click(screen.getByRole('button', {name: `${name} selected pages`}));
      expect(useApp.getState().toast?.text).toBe('Select one or more pages first.');
      expect(store.getState().pages).toBe(before);
    },
  );

  it('Split PDF shows only when the view supplies it', async () => {
    const onSplit = vi.fn();
    const {unmount} = setup(2, {onSplit});
    await userEvent.click(screen.getByRole('button', {name: 'Split PDF'}));
    expect(onSplit).toHaveBeenCalledTimes(1);
    unmount();
    setup(2);
    expect(screen.queryByRole('button', {name: 'Split PDF'})).toBeNull();
  });

  it('shows the drag hint', () => {
    setup(1);
    expect(
      screen.getByText(
        'Drag to reorder · Ctrl-click to select · Shift-click for a range · Double-click to preview',
      ),
    ).toBeInTheDocument();
  });
});
