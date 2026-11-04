import {act, render, screen} from '@testing-library/react';
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
  // A radio widget without an on-state has no value to store.
  widget({fieldType: 'Btn', fieldName: 'pay', radioButton: true, buttonValue: null}),
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
    expect(screen.getByRole('radio', {name: 'pay: net60'})).toBeChecked();
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

  it('text: the field MaxLen caps the input', async () => {
    getAnnotations.mockResolvedValue([
      widget({fieldType: 'Tx', fieldName: 'zip', fieldValue: '', maxLen: 5}),
      widget({fieldType: 'Tx', fieldName: 'free', fieldValue: '', maxLen: 0}),
    ]);
    setup();
    expect(await screen.findByRole('textbox', {name: 'zip'})).toHaveAttribute('maxLength', '5');
    expect(screen.getByRole('textbox', {name: 'free'})).not.toHaveAttribute('maxLength');
  });

  it('checkbox: widgets sharing a name with different exports store the ticked one', async () => {
    const box = (alternativeText: string, exportValue: string) =>
      widget({
        fieldType: 'Btn',
        fieldName: 'q1',
        alternativeText,
        checkBox: true,
        exportValue,
        fieldValue: 'Off',
      });
    getAnnotations.mockResolvedValue([box('Q1 yes', 'Yes'), box('Q1 no', 'No')]);
    setup();
    await userEvent.click(await screen.findByRole('checkbox', {name: 'Q1 no'}));
    expect(setField).toHaveBeenCalledWith('f', 'q1', 'No');
    expect(screen.getByRole('checkbox', {name: 'Q1 no'})).toBeChecked();
    expect(screen.getByRole('checkbox', {name: 'Q1 yes'})).not.toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', {name: 'Q1 no'}));
    expect(setField).toHaveBeenLastCalledWith('f', 'q1', false);
  });

  it('controls are disabled while an export runs', async () => {
    setup();
    await screen.findByRole('combobox', {name: 'city'});
    act(() => {
      store.getState().beginExport();
    });
    for (const el of document.querySelectorAll('input, textarea, select'))
      expect(el).toBeDisabled();
  });

  it('radio: choosing net60 sets pay to net60', async () => {
    setup();
    const net60 = await screen.findByRole('radio', {name: 'pay: net60'});
    await userEvent.click(net60);
    expect(setField).toHaveBeenCalledWith('f', 'pay', 'net60');
  });

  it('select: choosing an option sets it', async () => {
    setup();
    await userEvent.selectOptions(await screen.findByRole('combobox', {name: 'city'}), 'Rome');
    expect(setField).toHaveBeenCalledWith('f', 'city', 'Rome');
  });

  it('push buttons, signature fields, stateless radios and non-widgets render nothing', async () => {
    const {container} = setup();
    await screen.findByRole('combobox', {name: 'city'});
    expect(container.querySelectorAll('input, textarea, select')).toHaveLength(6);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('readOnly controls are disabled', async () => {
    setup(true);
    await screen.findByRole('combobox', {name: 'city'});
    for (const el of document.querySelectorAll('input, textarea, select'))
      expect(el).toBeDisabled();
  });

  it('readOnly hides fields under a redaction on the page, as the saved file does', async () => {
    getAnnotations.mockResolvedValue([
      widget({fieldType: 'Tx', fieldName: 'secret', fieldValue: 'x'}),
      widget({fieldType: 'Tx', fieldName: 'open', fieldValue: 'y', rect: [20, 100, 170, 120]}),
    ]);
    const redact = {
      id: 'r',
      kind: 'redact' as const,
      rect: {x: 100, y: 710, w: 5, h: 5},
      angle: 0 as const,
    };
    store.setState({pages: [{...page, markup: [redact]}]});
    setup(true);
    await screen.findByRole('textbox', {name: 'open'});
    expect(screen.queryByRole('textbox', {name: 'secret'})).toBeNull();
  });

  it('Edit keeps fields under a redaction so they stay editable', async () => {
    const redact = {
      id: 'r',
      kind: 'redact' as const,
      rect: {x: 100, y: 710, w: 5, h: 5},
      angle: 0 as const,
    };
    store.setState({pages: [{...page, markup: [redact]}]});
    setup();
    expect(await screen.findByRole('textbox', {name: 'name'})).toBeInTheDocument();
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
