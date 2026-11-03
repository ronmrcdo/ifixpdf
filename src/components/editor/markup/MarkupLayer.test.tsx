import {act, fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {PDFPageProxy, PageViewport} from 'pdfjs-dist';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {Markup} from '../../../domain/markup';
import type {PageInstance} from '../../../domain/types';
import {createWorkspaceStore, type WorkspaceStore} from '../../../state/workspace';
import {pngOf} from '../../../test/png';
import type {PageView} from '../Stage';
import {MarkupLayer} from './MarkupLayer';
import {useTool} from './tool';

// Scale 1, rotation 0, page 800 pt tall: PDF y runs up, viewport y runs down.
const H = 800;
const viewport = {
  scale: 1,
  rotation: 0,
  width: 600,
  height: H,
  convertToPdfPoint: (x: number, y: number) => [x, H - y],
  convertToViewportRectangle: ([x1, y1, x2, y2]: number[]) => [x1, H - y1!, x2, H - y2!],
} as unknown as PageViewport;
const page: PageInstance = {uid: 'u0', fileId: 'f', local: 0, rotation: 0};
const view: PageView = {page, viewport, pdfPage: {rotate: 0} as PDFPageProxy};

let store: WorkspaceStore;
const markup = () => store.getState().pages[0]?.markup ?? [];
const seed = (...items: Markup[]) => store.setState({pages: [{...page, markup: items}]});
const layer = () => document.querySelector<HTMLElement>('.markup-layer')!;
const click = (x: number, y: number, el: HTMLElement = layer()) => {
  fireEvent.pointerDown(el, {clientX: x, clientY: y, pointerId: 1, button: 0});
  fireEvent.pointerUp(el, {clientX: x, clientY: y, pointerId: 1, button: 0});
};
// Float-safe rect match.
const near = (r: {x: number; y: number; w: number; h: number}) => ({
  x: expect.closeTo(r.x),
  y: expect.closeTo(r.y),
  w: expect.closeTo(r.w),
  h: expect.closeTo(r.h),
});
const setup = (readOnly = false) =>
  render(<MarkupLayer store={store} view={view} readOnly={readOnly} />);

const text = (over: Partial<Markup & {kind: 'text'}> = {}): Markup => ({
  id: 't1',
  kind: 'text',
  text: 'Hi',
  size: 12,
  angle: 0,
  rect: {x: 100, y: 600, w: 12, h: 14.4},
  ...over,
});
const check: Markup = {id: 'c1', kind: 'check', angle: 0, rect: {x: 200, y: 600, w: 14, h: 14}};
const redact: Markup = {id: 'r1', kind: 'redact', angle: 0, rect: {x: 10, y: 10, w: 50, h: 30}};

beforeEach(() => {
  store = createWorkspaceStore('document');
  store.setState({files: [{id: 'f', name: 'A.pdf', pages: 1, size: 1}], pages: [page]});
  // jsdom has no canvas: 6 px per character at any size is enough to size a text rect.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    font: '',
    measureText: (s: string) => ({width: s.length * 6}),
  } as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
  useTool.setState({tool: null, signature: null, selected: null});
  vi.restoreAllMocks();
});

describe('MarkupLayer placing', () => {
  it('check: a click adds a 14 pt check whose rect contains the converted point', () => {
    useTool.setState({tool: 'check'});
    setup();
    click(100, 100);
    const [item] = markup();
    expect(item).toMatchObject({kind: 'check', angle: 0, rect: {w: 14, h: 14}});
    expect(item!.rect.x).toBeLessThanOrEqual(100);
    expect(item!.rect.x + item!.rect.w).toBeGreaterThanOrEqual(100);
    expect(item!.rect.y).toBeLessThanOrEqual(700);
    expect(item!.rect.y + item!.rect.h).toBeGreaterThanOrEqual(700);
    expect(item!.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('new items take the page angle: intrinsic /Rotate plus the user rotation', () => {
    useTool.setState({tool: 'dot'});
    store.setState({pages: [{...page, rotation: 90}]});
    render(
      <MarkupLayer
        store={store}
        view={{...view, page: {...page, rotation: 90}, pdfPage: {rotate: 180} as PDFPageProxy}}
      />,
    );
    click(50, 50);
    expect(markup()[0]).toMatchObject({kind: 'dot', angle: 270});
  });

  it('redact: a drag adds a rect of the converted extent; a 0-px drag adds nothing', () => {
    useTool.setState({tool: 'redact'});
    setup();
    click(10, 10);
    expect(markup()).toEqual([]);
    fireEvent.pointerDown(layer(), {clientX: 10, clientY: 10, pointerId: 1});
    fireEvent.pointerMove(layer(), {clientX: 40, clientY: 30, pointerId: 1});
    fireEvent.pointerUp(layer(), {clientX: 60, clientY: 40, pointerId: 1});
    expect(markup()).toEqual([
      expect.objectContaining({kind: 'redact', rect: {x: 10, y: 760, w: 50, h: 30}}),
    ]);
  });

  it('redact: a tiny drag is grown to 4 × 4 pt', () => {
    useTool.setState({tool: 'redact'});
    setup();
    fireEvent.pointerDown(layer(), {clientX: 10, clientY: 10, pointerId: 1});
    fireEvent.pointerUp(layer(), {clientX: 11, clientY: 11, pointerId: 1});
    expect(markup()[0]?.rect).toMatchObject({w: 4, h: 4});
  });

  it('with no tool, a click places nothing', () => {
    setup();
    click(100, 100);
    expect(markup()).toEqual([]);
  });
});

describe('MarkupLayer text', () => {
  it('a click opens an input; Hi + Enter adds one text item in one history step', async () => {
    useTool.setState({tool: 'text'});
    setup();
    click(100, 100);
    const input = screen.getByRole('textbox', {name: 'Text'});
    expect(input).toHaveFocus();
    await userEvent.type(input, 'Hi{Enter}');
    expect(markup()).toEqual([
      expect.objectContaining({
        kind: 'text',
        text: 'Hi',
        size: 12,
        // display top-left at the click; width measured, height one line
        rect: near({x: 100, y: 700 - 14.4, w: 12, h: 14.4}),
      }),
    ]);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    act(() => store.getState().undo());
    expect(markup()).toEqual([]);
  });

  it('Escape on an empty input adds nothing', async () => {
    useTool.setState({tool: 'text'});
    setup();
    click(100, 100);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(markup()).toEqual([]);
  });

  it('blur commits; newlines and tabs are normalized', () => {
    useTool.setState({tool: 'text'});
    setup();
    click(100, 100);
    const input = screen.getByRole('textbox', {name: 'Text'});
    fireEvent.change(input, {target: {value: 'a\r\nb\tc\rd'}});
    fireEvent.blur(input);
    expect(markup()[0]).toMatchObject({text: 'a\nb c\nd'});
    expect(markup()[0]?.rect.h).toBeCloseTo(3 * 14.4);
  });

  it('refuses unsupported characters with an inline error and does not commit', async () => {
    useTool.setState({tool: 'text'});
    setup();
    click(100, 100);
    const input = screen.getByRole('textbox', {name: 'Text'});
    expect(input).not.toHaveAttribute('aria-describedby');
    await userEvent.type(input, '日本');
    expect(screen.getByRole('alert')).toHaveTextContent("This character isn't supported: 日, 本");
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription("This character isn't supported: 日, 本");
    await userEvent.keyboard('{Enter}');
    fireEvent.blur(input);
    expect(markup()).toEqual([]);
    expect(screen.getByRole('textbox', {name: 'Text'})).toBeInTheDocument();
  });

  it('Enter on a text item edits it; the new text replaces the old in one step', async () => {
    seed(text());
    setup();
    screen.getByRole('button', {name: 'Text: Hi'}).focus();
    await userEvent.keyboard('{Enter}');
    const input = screen.getByRole('textbox', {name: 'Text'});
    expect(input).toHaveValue('Hi');
    await userEvent.clear(input);
    await userEvent.type(input, 'Hello{Enter}');
    expect(markup()).toEqual([expect.objectContaining({id: 't1', text: 'Hello'})]);
    expect(markup()[0]?.rect).toEqual(near({x: 100, y: 600, w: 30, h: 14.4}));
  });
});

describe('MarkupLayer popup', () => {
  it('A+ steps the size, A− is disabled at 8, trash removes', async () => {
    seed(text());
    useTool.setState({selected: 't1'});
    setup();
    const update = vi.spyOn(store.getState(), 'updateMarkup');
    await userEvent.click(screen.getByRole('button', {name: 'Larger text'}));
    expect(update).toHaveBeenCalledWith('u0', 't1', expect.objectContaining({size: 14}));
    expect(markup()[0]).toMatchObject({
      size: 14,
      rect: near({x: 100, y: 614.4 - 16.8, w: 12, h: 16.8}),
    });
    act(() => seed(text({size: 8})));
    expect(screen.getByRole('button', {name: 'Smaller text'})).toBeDisabled();
    const remove = vi.spyOn(store.getState(), 'removeMarkup');
    await userEvent.click(screen.getByRole('button', {name: 'Delete text'}));
    expect(remove).toHaveBeenCalledWith('u0', 't1');
    expect(markup()).toEqual([]);
  });

  it('More has one item, Duplicate, which adds a copy 12 pt down-right', async () => {
    seed(text());
    useTool.setState({selected: 't1'});
    setup();
    await userEvent.click(screen.getByRole('button', {name: 'More'}));
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual(['Duplicate']);
    await userEvent.click(items[0]!);
    const [, copy] = markup();
    expect(copy).toMatchObject({kind: 'text', text: 'Hi', rect: {x: 112, y: 588}});
    expect(copy?.id).not.toBe('t1');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('only the selected text item has a popup', () => {
    seed(check);
    useTool.setState({selected: 'c1'});
    setup();
    expect(screen.queryByRole('button', {name: 'Larger text'})).not.toBeInTheDocument();
  });
});

describe('MarkupLayer keyboard and drag', () => {
  it('Tab reaches each item; focus selects; Escape deselects; Delete and Backspace remove', async () => {
    seed(text(), check, redact);
    setup();
    await userEvent.tab();
    expect(screen.getByRole('button', {name: 'Text: Hi'})).toHaveFocus();
    expect(useTool.getState().selected).toBe('t1');
    await userEvent.tab();
    expect(screen.getByRole('button', {name: 'Check mark'})).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(useTool.getState().selected).toBeNull();
    await userEvent.keyboard('{Delete}');
    expect(markup().map((m) => m.id)).toEqual(['t1', 'r1']);
    screen.getByRole('button', {name: 'Redaction'}).focus();
    await userEvent.keyboard('{Backspace}');
    expect(markup().map((m) => m.id)).toEqual(['t1']);
  });

  it('dragging an item calls updateMarkup once, on pointerup', () => {
    seed(check);
    setup();
    const update = vi.spyOn(store.getState(), 'updateMarkup');
    const item = screen.getByRole('button', {name: 'Check mark'});
    fireEvent.pointerDown(item, {clientX: 200, clientY: 190, pointerId: 1});
    fireEvent.pointerMove(item, {clientX: 205, clientY: 195, pointerId: 1});
    fireEvent.pointerMove(item, {clientX: 210, clientY: 200, pointerId: 1});
    expect(update).not.toHaveBeenCalled();
    fireEvent.pointerUp(item, {clientX: 210, clientY: 200, pointerId: 1});
    expect(update).toHaveBeenCalledOnce();
    expect(markup()[0]?.rect).toEqual({x: 210, y: 590, w: 14, h: 14});
  });

  it('a click on an item without moving selects it and does not update', () => {
    seed(check);
    useTool.setState({tool: 'check'});
    setup();
    click(200, 190, screen.getByRole('button', {name: 'Check mark'}));
    expect(useTool.getState().selected).toBe('c1');
    expect(markup()).toHaveLength(1);
  });
});

describe('MarkupLayer signatures', () => {
  const PNG = pngOf(300, 100);
  const sig: Markup = {
    id: 's1',
    kind: 'signature',
    image: PNG,
    angle: 0,
    rect: {x: 100, y: 600, w: 150, h: 50},
  };

  it('a click places one 150 pt signature centered on it, keeping the aspect, then resets the tool', () => {
    useTool.setState({tool: 'sign', signature: PNG});
    setup();
    click(200, 100);
    expect(markup()).toEqual([
      expect.objectContaining({
        kind: 'signature',
        image: PNG,
        angle: 0,
        rect: {x: 125, y: 675, w: 150, h: 50},
      }),
    ]);
    expect(useTool.getState().tool).toBeNull();
    expect(useTool.getState().selected).toBe(markup()[0]?.id);
    expect(screen.getByRole('button', {name: 'Signature'}).querySelector('img')).toHaveAttribute(
      'src',
      PNG,
    );
  });

  it('on a page shown at 90°, 150 pt is the width along the display', () => {
    useTool.setState({tool: 'sign', signature: PNG});
    const turned = {...page, rotation: 90 as const};
    store.setState({pages: [turned]});
    render(<MarkupLayer store={store} view={{...view, page: turned}} />);
    click(200, 100);
    expect(markup()[0]).toMatchObject({angle: 90, rect: {x: 175, y: 625, w: 50, h: 150}});
  });

  it('without a signature, a click places nothing', () => {
    useTool.setState({tool: 'sign', signature: null});
    setup();
    click(200, 100);
    expect(markup()).toEqual([]);
  });

  it('a selected signature has 4 corner handles; others and text have none', () => {
    seed(sig, check);
    useTool.setState({selected: 'c1'});
    const {rerender} = setup();
    expect(screen.queryAllByRole('button', {name: /^Resize signature/})).toHaveLength(0);
    act(() => useTool.setState({selected: 's1'}));
    rerender(<MarkupLayer store={store} view={view} />);
    expect(
      screen.getAllByRole('button', {name: /^Resize signature/}).map((b) => b.ariaLabel),
    ).toEqual([
      'Resize signature, top-left',
      'Resize signature, top-right',
      'Resize signature, bottom-left',
      'Resize signature, bottom-right',
    ]);
  });

  it('dragging a corner resizes with the aspect kept, commits once on pointerup, against the opposite corner', () => {
    seed(sig);
    useTool.setState({selected: 's1'});
    setup();
    const update = vi.spyOn(store.getState(), 'updateMarkup');
    const handle = screen.getByRole('button', {name: 'Resize signature, bottom-right'});
    // the box is left 100, top 150, 150 × 50
    fireEvent.pointerDown(handle, {clientX: 250, clientY: 200, pointerId: 1});
    fireEvent.pointerMove(handle, {clientX: 300, clientY: 200, pointerId: 1});
    expect(screen.getByRole('button', {name: 'Signature'})).toHaveStyle({width: '200px'});
    fireEvent.pointerMove(handle, {clientX: 325, clientY: 210, pointerId: 1});
    expect(update).not.toHaveBeenCalled();
    fireEvent.pointerUp(handle, {clientX: 325, clientY: 210, pointerId: 1});
    expect(update).toHaveBeenCalledOnce();
    expect(markup()[0]?.rect).toEqual(near({x: 100, y: 575, w: 225, h: 75}));
    act(() => store.getState().undo());
    expect(markup()[0]?.rect).toEqual(sig.rect);
  });

  it('a corner drag stops at 24 pt wide; a click on a handle changes nothing', () => {
    seed(sig);
    useTool.setState({selected: 's1'});
    setup();
    const handle = screen.getByRole('button', {name: 'Resize signature, top-left'});
    const update = vi.spyOn(store.getState(), 'updateMarkup');
    fireEvent.pointerDown(handle, {clientX: 100, clientY: 150, pointerId: 1});
    fireEvent.pointerUp(handle, {clientX: 100, clientY: 150, pointerId: 1});
    expect(update, 'a click on a handle is not an edit').not.toHaveBeenCalled();
    fireEvent.pointerDown(handle, {clientX: 100, clientY: 150, pointerId: 1});
    fireEvent.pointerMove(handle, {clientX: 249, clientY: 199, pointerId: 1});
    fireEvent.pointerUp(handle, {clientX: 249, clientY: 199, pointerId: 1});
    // the bottom-right corner (250, 600) stays put
    expect(markup()[0]?.rect).toEqual(near({x: 226, y: 600, w: 24, h: 8}));
  });

  it('Delete removes a selected signature', async () => {
    seed(sig);
    setup();
    screen.getByRole('button', {name: 'Signature'}).focus();
    await userEvent.keyboard('{Delete}');
    expect(markup()).toEqual([]);
  });
});

describe('MarkupLayer read-only', () => {
  it('no buttons, no popup, ignores clicks, redactions solid black', () => {
    seed(text(), redact);
    useTool.setState({tool: 'check', selected: 't1'});
    setup(true);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryByRole('button', {name: 'Larger text'})).not.toBeInTheDocument();
    click(100, 100);
    expect(markup()).toHaveLength(2);
    expect(screen.getByRole('img', {name: 'Redaction'})).toHaveStyle({backgroundColor: '#000'});
    expect(screen.getByRole('img', {name: 'Text: Hi'})).toBeInTheDocument();
  });

  it('while editing, redactions are see-through (hatched)', () => {
    seed(redact);
    setup();
    expect(screen.getByRole('button', {name: 'Redaction'})).toHaveClass('hatched');
  });
});
