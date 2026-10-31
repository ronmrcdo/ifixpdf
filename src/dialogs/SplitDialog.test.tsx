import {act, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {unzipSync} from 'fflate';
import {PDFDocument} from 'pdf-lib';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {PageInstance, SourceFile} from '../domain/types';
import {makePdf} from '../pdf/fixtures';
import {platform} from '../platform';
import {documentStore} from '../state/workspaces';
import {DialogHost, showSplitDialog, useDialogs} from './host';

vi.mock('../pdf/registry', () => ({retain: vi.fn(), release: vi.fn(async () => {})}));

let saved: Uint8Array[];
const ranges = () => screen.getByLabelText(/^Ranges/);
const submit = () => screen.getByRole('button', {name: /Split & save ZIP|Splitting PDF…/});

async function open() {
  const bytes = await makePdf(5);
  const file: SourceFile = {id: 'f', name: 'Report.pdf', pages: 5, size: bytes.length};
  const pages: PageInstance[] = Array.from({length: 5}, (_, i) => ({
    uid: `u${i}`,
    fileId: 'f',
    local: i,
    rotation: i === 1 ? 90 : 0,
  }));
  documentStore.setState({files: [file], pages});
  vi.spyOn(documentStore.getState(), 'snapshotForExport').mockReturnValue({
    pages,
    sources: {f: bytes},
    title: '',
  } as never);
  const user = userEvent.setup();
  render(
    <>
      <button type="button">Opener</button>
      <DialogHost />
    </>,
  );
  screen.getByRole('button', {name: 'Opener'}).focus();
  act(() =>
    showSplitDialog({
      count: 5,
      name: 'Report.pdf',
      spec: documentStore.getState().snapshotForExport(),
    }),
  );
  return user;
}

beforeEach(() => {
  useDialogs.setState({active: null});
  saved = [];
  vi.spyOn(platform, 'saveAs').mockImplementation(async (bytes, name) => {
    saved.push(bytes);
    return {name, folder: '/d'};
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  documentStore.setState({exporting: false});
  await documentStore.getState().reset();
});

describe('SplitDialog', () => {
  it('defaults the ranges, with help text and a live summary', async () => {
    await open();
    expect(ranges()).toHaveValue('1-2, 3-5');
    expect(
      screen.getByText(
        'Each comma creates a separate PDF. Example: 1-3, 4-6. Available pages: 1–5.',
      ),
    ).toBeVisible();
    expect(document.querySelector('.split-results')).toHaveTextContent(
      '2 PDFs · 5 of 5 pages included',
    );
  });

  it('summarises 1-2, 3 as 2 PDFs and one range as 1 PDF', async () => {
    const user = await open();
    await user.clear(ranges());
    await user.type(ranges(), '1-2, 3');
    expect(document.querySelector('.split-results')).toHaveTextContent(
      '2 PDFs · 3 of 5 pages included',
    );
    await user.clear(ranges());
    await user.type(ranges(), '4');
    expect(document.querySelector('.split-results')).toHaveTextContent(
      '1 PDF · 1 of 5 pages included',
    );
  });

  it.each([
    ['1-3, 3', 'Ranges overlap. Include each page only once.'],
    ['1-9', 'Choose pages from 1 to 5.'],
    ['abc', 'Enter ranges such as 1-3, 4-6.'],
  ])('rejects %s inline and blocks submit', async (text, message) => {
    const user = await open();
    await user.clear(ranges());
    await user.type(ranges(), text);
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(submit()).toBeDisabled();
  });

  it('Every page hides the ranges and summarises one PDF per page', async () => {
    const user = await open();
    await user.selectOptions(screen.getByLabelText('Split by'), 'every');
    expect(screen.getByLabelText(/^Ranges/)).not.toBeVisible();
    expect(document.querySelector('.split-results')).toHaveTextContent(
      '5 PDFs · 5 of 5 pages included',
    );
  });

  it('saves a ZIP with the right entries and page counts, applying rotation', async () => {
    const user = await open();
    await user.click(submit());
    expect(await screen.findByRole('heading', {name: '2 PDFs ready'})).toBeVisible();
    expect(platform.saveAs).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      'Report — split.zip',
      'zip',
    );
    const zip = unzipSync(saved[0]!);
    expect(Object.keys(zip)).toEqual(['Report — part 1.pdf', 'Report — part 2.pdf']);
    const first = await PDFDocument.load(zip['Report — part 1.pdf']!);
    expect(first.getPageCount()).toBe(2);
    expect(first.getPage(1).getRotation().angle).toBe(90);
    expect((await PDFDocument.load(zip['Report — part 2.pdf']!)).getPageCount()).toBe(3);
    expect(documentStore.getState().exporting).toBe(false);
    await user.click(screen.getByRole('button', {name: 'Done'}));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', {name: 'Opener'})).toHaveFocus();
  });

  it('a cancelled Save as keeps the form open', async () => {
    vi.mocked(platform.saveAs).mockResolvedValue(null);
    const user = await open();
    await user.click(submit());
    await waitFor(() => expect(submit()).toBeEnabled());
    expect(screen.queryByRole('heading', {name: /ready$/})).toBeNull();
    expect(documentStore.getState().exporting).toBe(false);
  });

  it('a failed save shows the error inline', async () => {
    vi.mocked(platform.saveAs).mockRejectedValue(new Error('disk full'));
    const user = await open();
    await user.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not split this PDF. Try again.',
    );
    expect(submit()).toBeEnabled();
  });

  it('does nothing while another export holds the lock', async () => {
    const user = await open();
    documentStore.setState({exporting: true});
    await user.click(submit());
    await waitFor(() => expect(submit()).toBeEnabled());
    expect(platform.saveAs).not.toHaveBeenCalled();
  });

  it('Esc closes and returns focus to the opener', async () => {
    await open();
    document.querySelector('dialog')!.dispatchEvent(new Event('cancel', {cancelable: true}));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByRole('button', {name: 'Opener'})).toHaveFocus();
  });
});
