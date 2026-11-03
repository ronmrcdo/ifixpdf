import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {PDFPageProxy, PageViewport} from 'pdfjs-dist';
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest';
import type {PageInstance} from '../../../domain/types';
import {
  createWorkspaceStore,
  type WorkspaceState,
  type WorkspaceStore,
} from '../../../state/workspace';
import type {PageView} from '../Stage';
import {FieldLayer} from './FieldLayer';
import {useTool} from './tool';

const H = 800;
const viewport = {
  scale: 1,
  rotation: 0,
  // Flipped corners on purpose: the layer must normalize them.
  convertToViewportRectangle: ([x1, y1, x2, y2]: number[]) => [x2, H - y1!, x1, H - y2!],
} as unknown as PageViewport;
const page: PageInstance = {uid: 'u0', fileId: 'f', local: 0, rotation: 0};

const widget = (over: Record<string, unknown>) => ({
  subtype: 'Widget',
  alternativeText: '',
  rect: [20, 700, 170, 720],
  ...over,
});
const ANNOTATIONS = [
  widget({fieldType: 'Tx', fieldName: 'name', fieldValue: '', multiLine: false}),
  widget({fieldType: 'Tx', fieldName: 'notes', fieldValue: 'a\nb', multiLine: true}),
  widget({
    fieldType: 'Btn',
    fieldName: 'agree',
    alternativeText: 'I agree',
    checkBox: true,
    exportValue: 'Yes',
    fieldValue: 'Off',
  }),
  widget({fieldType: 'Btn', fieldName: 'pay', radioButton: true, buttonValue: 'net30'}),
  widget({fieldType: 'Btn', fieldName: 'pay', radioButton: true, buttonValue: 'net60'}),
  widget({
    fieldType: 'Ch',
    fieldName: 'city',
    fieldValue: [],
    options: [
      {exportValue: 'Paris', displayValue: 'Paris'},
      {exportValue: 'Rome', displayValue: 'Rome'},
    ],
  }),
  widget({fieldType: 'Btn', fieldName: 'submit', pushButton: true}),
  widget({fieldType: 'Sig', fieldName: 'sig'}),
  {subtype: 'Link', rect: [0, 0, 10, 10]},
];

let store: WorkspaceStore;
let setField: Mock<WorkspaceState['setField']>;
let getAnnotations: ReturnType<typeof vi.fn>;
const view = (): PageView => ({
  page,
  viewport,
  pdfPage: {rotate: 0, getAnnotations} as unknown as PDFPageProxy,
});
const setup = (readOnly = false) =>
  render(<FieldLayer store={store} view={view()} readOnly={readOnly} />);

beforeEach(() => {
  store = createWorkspaceStore('document');
  store.setState({files: [{id: 'f', name: 'A.pdf', pages: 1, size: 1}], pages: [page]});
  setField = vi.fn(store.getState().setField);
  store.setState({setField});
  getAnnotations = vi.fn().mockResolvedValue(ANNOTATIONS);
});
afterEach(() => {
  useTool.setState({tool: null});
  vi.restoreAllMocks();
});

describe('FieldLayer', () => {
  it('places each widget at its normalized viewport rect', async () => {
    setup();
    const input = await screen.findByRole('textbox', {name: 'name'});
    expect(getAnnotations).toHaveBeenCalledWith({intent: 'display'});
    expect(input.style).toMatchObject({left: '20px', top: '80px', width: '150px', height: '20px'});
  });

  it('text: typing then blur sets the field once', async () => {
    setup();
    const input = await screen.findByRole('textbox', {name: 'name'});
    await userEvent.type(input, 'Ann');
    expect(setField).not.toHaveBeenCalled();
    await userEvent.tab();
    expect(setField).toHaveBeenCalledTimes(1);
    expect(setField).toHaveBeenCalledWith('f', 'name', 'Ann');
    expect(store.getState().fills).toEqual({f: {name: 'Ann'}});
  });

  it('text: Enter commits; a blur with no change sets nothing', async () => {
    setup();
    const input = await screen.findByRole('textbox', {name: 'name'});
    await userEvent.click(input);
    await userEvent.tab();
    expect(setField).not.toHaveBeenCalled();
    await userEvent.type(input, 'Bo{Enter}');
    expect(setField).toHaveBeenCalledWith('f', 'name', 'Bo');
  });

  it('multiline text is a textarea showing the field value', async () => {
    setup();
    const area = await screen.findByRole('textbox', {name: 'notes'});
    expect(area.tagName).toBe('TEXTAREA');
    expect(area).toHaveValue('a\nb');
  });

  it('a fill overrides the field value', async () => {
    store.setState({fills: {f: {name: 'Zed', agree: true, pay: 'net60', city: 'Rome'}}});
    setup();
    expect(await screen.findByRole('textbox', {name: 'name'})).toHaveValue('Zed');
    expect(screen.getByRole('checkbox', {name: 'I agree'})).toBeChecked();
    expect(screen.getAllByRole('radio', {name: 'pay'})[1]).toBeChecked();
    expect(screen.getByRole('combobox', {name: 'city'})).toHaveValue('Rome');
  });

  it('text: unsupported characters show the inline error and do not commit', async () => {
    setup();
    const input = await screen.findByRole('textbox', {name: 'name'});
    await userEvent.type(input, '日本');
    expect(screen.getByRole('alert')).toHaveTextContent("This character isn't supported: 日, 本");
    await userEvent.tab();
    expect(setField).not.toHaveBeenCalled();
  });

  it('checkbox: toggling sets true; the aria-label is the alternative text', async () => {
    setup();
    await userEvent.click(await screen.findByRole('checkbox', {name: 'I agree'}));
    expect(setField).toHaveBeenCalledWith('f', 'agree', true);
  });

  it('radio: choosing net60 sets pay to net60', async () => {
    setup();
    const radios = await screen.findAllByRole('radio', {name: 'pay'});
    await userEvent.click(radios[1]!);
    expect(setField).toHaveBeenCalledWith('f', 'pay', 'net60');
  });

  it('select: choosing an option sets it', async () => {
    setup();
    await userEvent.selectOptions(await screen.findByRole('combobox', {name: 'city'}), 'Rome');
    expect(setField).toHaveBeenCalledWith('f', 'city', 'Rome');
  });

  it('push buttons, signature fields and non-widgets render nothing', async () => {
    const {container} = setup();
    await screen.findByRole('combobox', {name: 'city'});
    expect(container.querySelectorAll('input, textarea, select')).toHaveLength(6);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('readOnly controls are disabled', async () => {
    setup(true);
    await screen.findByRole('combobox', {name: 'city'});
    for (const el of document.querySelectorAll('input, textarea, select'))
      expect(el).toBeDisabled();
  });

  it('marks the layer while a tool is active so the markup layer takes the clicks', async () => {
    useTool.setState({tool: 'text'});
    const {container} = setup();
    await screen.findByRole('combobox', {name: 'city'});
    expect(container.querySelector('.field-layer')).toHaveAttribute('data-tool');
  });

  it('fetches annotations once per page across re-renders and remounts', async () => {
    const v = view();
    const {rerender, unmount} = render(<FieldLayer store={store} view={v} />);
    await screen.findByRole('combobox', {name: 'city'});
    rerender(<FieldLayer store={store} view={{...v}} />);
    unmount();
    render(<FieldLayer store={store} view={v} />);
    await screen.findByRole('combobox', {name: 'city'});
    expect(getAnnotations).toHaveBeenCalledTimes(1);
  });
});
