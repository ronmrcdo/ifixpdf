import {act, fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {PageInstance} from '../../domain/types';
import {acquire} from '../../pdf/registry';
import {renderPage} from '../../pdf/render';
import {useApp} from '../../state/app';
import {createWorkspaceStore} from '../../state/workspace';
import {Stage} from './Stage';

vi.mock('../../pdf/registry', () => ({
  retain: vi.fn(),
  release: vi.fn(async () => {}),
  acquire: vi.fn(),
}));
vi.mock('../../pdf/render', () => ({renderPage: vi.fn(async () => {})}));

const pages: PageInstance[] = [0, 1, 2].map((i) => ({
  uid: `u${i}`,
  fileId: 'f',
  local: i,
  rotation: 0,
}));
let store: ReturnType<typeof createWorkspaceStore>;
beforeEach(() => {
  store = createWorkspaceStore('document');
  store.setState({files: [{id: 'f', name: 'A.pdf', pages: 3, size: 1}], pages});
  useApp.setState({toast: null});
});
const stageEl = () => document.querySelector<HTMLElement>('#paper-stage')!;
const wheel = (deltaY: number, ctrlKey = false) =>
  act(() => {
    stageEl().dispatchEvent(
      new WheelEvent('wheel', {deltaY, ctrlKey, bubbles: true, cancelable: true}),
    );
  });

describe('Stage page', () => {
  it('labels the canvas with the page, total and file name', () => {
    render(<Stage store={store} readOnly caption="A.pdf" />);
    expect(screen.getByRole('img', {name: 'Page 1 of 3, A.pdf'})).toBeInstanceOf(HTMLCanvasElement);
    act(() => store.getState().goTo(2));
    expect(screen.getByRole('img', {name: 'Page 3 of 3, A.pdf'})).toBeInTheDocument();
  });

  it('is the arrow-key shortcut scope and a focusable scroller', () => {
    render(<Stage store={store} readOnly caption="A.pdf" />);
    expect(stageEl().closest('[data-shortcut-scope="stage"]')).not.toBeNull();
    expect(stageEl()).toHaveAttribute('tabindex', '0');
  });

  it('Preview shows the caption and read-only page count, without rotate', () => {
    render(<Stage store={store} readOnly caption="A.pdf" />);
    expect(screen.getByText('3 pages · Read-only')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Rotate current page clockwise'})).toBeNull();
  });

  it('Edit and Merge show the current source and rotate the current page', async () => {
    render(<Stage store={store} caption="Document preview" />);
    expect(screen.getByText('Document preview')).toBeInTheDocument();
    expect(screen.getByTitle('A.pdf')).toHaveTextContent('A.pdf');
    act(() => store.getState().goTo(1));
    await userEvent.click(screen.getByRole('button', {name: 'Rotate current page clockwise'}));
    expect(store.getState().pages.map((p) => p.rotation)).toEqual([0, 90, 0]);
  });
});

describe('Stage zoom', () => {
  it('starts at Fit with Fit pressed', () => {
    render(<Stage store={store} readOnly caption="A.pdf" />);
    expect(document.querySelector('.zoom-value')).toHaveTextContent('Fit');
    expect(screen.getByRole('button', {name: 'Fit page'})).toHaveAttribute('aria-pressed', 'true');
  });

  it('zoom in/out step by 10 and Fit returns to Fit', async () => {
    render(<Stage store={store} readOnly caption="A.pdf" />);
    act(() => store.getState().setZoom(100));
    await userEvent.click(screen.getByRole('button', {name: 'Zoom in'}));
    expect(document.querySelector('.zoom-value')).toHaveTextContent('110%');
    expect(screen.getByRole('button', {name: 'Fit page'})).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', {name: 'Zoom out'}));
    await userEvent.click(screen.getByRole('button', {name: 'Zoom out'}));
    expect(store.getState().zoom).toBe(90);
    await userEvent.click(screen.getByRole('button', {name: 'Fit page'}));
    expect(store.getState().zoom).toBe('fit');
  });

  it('Ctrl+wheel zooms and does not flip', () => {
    render(<Stage store={store} readOnly caption="A.pdf" />);
    act(() => store.getState().setZoom(100));
    wheel(-100, true);
    expect(store.getState().zoom).toBe(110);
    expect(store.getState().currentPage).toBe(0);
  });
});

describe('Stage navigation', () => {
  it('Prev/Next move a page and are disabled at the ends', async () => {
    render(<Stage store={store} readOnly caption="A.pdf" />);
    const prev = screen.getByRole('button', {name: 'Previous page'});
    const next = screen.getByRole('button', {name: 'Next page'});
    expect(prev).toBeDisabled();
    await userEvent.click(next);
    await userEvent.click(next);
    expect(store.getState().currentPage).toBe(2);
    expect(next).toBeDisabled();
    expect(prev).toBeEnabled();
    expect(screen.getByRole('spinbutton', {name: 'Go to page'})).toHaveValue(3);
  });

  it('the page jump goes to a valid page', () => {
    render(<Stage store={store} readOnly caption="A.pdf" />);
    const jump = screen.getByRole('spinbutton', {name: 'Go to page'});
    expect(jump).toHaveAttribute('max', '3');
    fireEvent.input(jump, {target: {value: '3'}});
    expect(store.getState().currentPage).toBe(0); // commits on change, not on every keystroke
    fireEvent.change(jump, {target: {value: '3'}});
    expect(store.getState().currentPage).toBe(2);
  });

  for (const bad of ['0', '4', '1.5', '']) {
    it(`the page jump resets "${bad}" and explains the range`, () => {
      render(<Stage store={store} readOnly caption="A.pdf" />);
      act(() => store.getState().goTo(1));
      const jump = screen.getByRole<HTMLInputElement>('spinbutton', {name: 'Go to page'});
      jump.value = bad;
      act(() => {
        jump.dispatchEvent(new Event('change', {bubbles: true}));
      });
      expect(jump.value).toBe('2');
      expect(store.getState().currentPage).toBe(1);
      expect(useApp.getState().toast?.text).toBe('Choose a page from 1 to 3.');
    });
  }

  it('the wheel flips one page per gesture on the Document tab', () => {
    render(<Stage store={store} readOnly caption="A.pdf" />);
    wheel(100);
    wheel(100);
    expect(store.getState().currentPage).toBe(1);
  });

  it('the wheel does not flip on the Pages tab', () => {
    render(<Stage store={store} readOnly caption="A.pdf" />);
    act(() => store.getState().setTab('pages'));
    wheel(100);
    expect(store.getState().currentPage).toBe(0);
  });
});

describe('Stage landing', () => {
  it('a flip that could not render does not make a later render jump to the bottom', async () => {
    const page = {rotate: 0, getViewport: () => ({width: 612, height: 792})};
    vi.mocked(acquire).mockResolvedValue({getPage: async () => page} as unknown as Awaited<
      ReturnType<typeof acquire>
    >); // only getPage is used
    render(<Stage store={store} readOnly caption="A.pdf" />);
    act(() => store.getState().goTo(1));
    wheel(-100); // flips back to page 1 while the stage has no height (jsdom), so nothing renders
    expect(store.getState().currentPage).toBe(0);
    const scrolls: number[] = [];
    Object.defineProperties(stageEl(), {
      clientHeight: {get: () => 500},
      clientWidth: {get: () => 600},
      scrollHeight: {get: () => 2000},
      scrollTop: {
        get: () => 0,
        set: (v: number) => {
          scrolls.push(v);
        },
      },
    });
    act(() => store.getState().setZoom(150));
    await waitFor(() => expect(renderPage).toHaveBeenCalled());
    expect(scrolls).toEqual([0]);
  });
});
