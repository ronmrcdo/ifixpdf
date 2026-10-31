import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {saveOrContinue} from '../../actions/save';
import type {PageInstance} from '../../domain/types';
import {useApp} from '../../state/app';
import {createWorkspaceStore, type WorkspaceStore} from '../../state/workspace';
import {OutputInspector} from './OutputInspector';

vi.mock('../../actions/save', async (orig) => ({
  ...(await orig<object>()),
  saveOrContinue: vi.fn(),
}));

const pages: PageInstance[] = [0, 1, 2].map((i) => ({
  uid: `u${i}`,
  fileId: 'f',
  local: i,
  rotation: 0,
}));
let store: WorkspaceStore;
const setup = (kind: 'document' | 'merge' = 'document') => {
  store = createWorkspaceStore(kind);
  store.setState({
    files: [{id: 'f', name: 'Report.pdf', pages: 3, size: 1}],
    pages,
    exportSettings: {
      name: 'Report.pdf',
      rangeMode: 'all',
      customRange: '',
      useFileNamesAsTitle: true,
    },
  });
  return render(<OutputInspector store={store} kind={kind} />);
};
const summary = () => document.getElementById('export-summary');
const pagesSelect = () => screen.getByRole('combobox', {name: 'Pages'});

beforeEach(() => {
  vi.clearAllMocks();
  useApp.setState({openAfter: true});
});
afterEach(() => vi.unstubAllGlobals());

describe('OutputInspector', () => {
  it('Edit: heading, name, quality note, page options, checkboxes, summary and Save; no printer', () => {
    setup();
    expect(screen.getByRole('complementary', {name: 'Output settings'})).toBeInTheDocument();
    expect(screen.getByRole('heading', {name: 'Save edited PDF'})).toBeInTheDocument();
    expect(screen.getByRole('textbox', {name: 'Output file name'})).toHaveValue('Report.pdf');
    expect(screen.getByText('Original quality')).toBeInTheDocument();
    expect(screen.getByText('Source page content is preserved.')).toBeInTheDocument();
    expect([...pagesSelect().querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'All pages (3)',
      'Current page (1)',
      'Custom range…',
    ]);
    expect(screen.getByRole('checkbox', {name: 'Use file names as PDF title'})).toBeChecked();
    expect(screen.getByRole('checkbox', {name: 'Open PDF after saving'})).toBeChecked();
    expect(screen.getByText('Edited document')).toBeInTheDocument();
    expect(summary()).toHaveTextContent('3 pages · Complete document');
    expect(screen.getByRole('button', {name: 'Save edited PDF'})).toBeEnabled();
    expect(screen.getByText('Ready when you are. Originals stay untouched.')).toBeInTheDocument();
    expect(screen.queryByText(/printer/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', {name: /Page range/})).not.toBeInTheDocument();
  });

  it('Merge: review shows Continue to save; the Save step shows its heading and instruction', () => {
    setup('merge');
    act(() => store.getState().setWorkflow('review'));
    expect(screen.getByRole('heading', {name: 'Output settings'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Continue to save'})).toBeInTheDocument();
    expect(screen.getByText('Merged document')).toBeInTheDocument();
    act(() => store.getState().setWorkflow('save'));
    expect(screen.getByRole('heading', {name: 'Save merged PDF'})).toBeInTheDocument();
    expect(
      screen.getByText('Check the name and pages, then save your document.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Save merged PDF'})).toBeInTheDocument();
  });

  it('editing the name, title and open-after options updates the stores', async () => {
    setup();
    const name = screen.getByRole('textbox', {name: 'Output file name'});
    await userEvent.clear(name);
    await userEvent.type(name, 'Final.pdf');
    expect(store.getState().exportSettings.name).toBe('Final.pdf');
    await userEvent.click(screen.getByRole('checkbox', {name: 'Use file names as PDF title'}));
    expect(store.getState().exportSettings.useFileNamesAsTitle).toBe(false);
    await userEvent.click(screen.getByRole('checkbox', {name: 'Open PDF after saving'}));
    expect(useApp.getState().openAfter).toBe(false);
  });

  it('Current page counts one page from the current position', async () => {
    setup();
    act(() => store.getState().goTo(2));
    await userEvent.selectOptions(pagesSelect(), 'current');
    expect(store.getState().exportSettings.rangeMode).toBe('current');
    expect(screen.getByRole('option', {name: 'Current page (3)'})).toBeInTheDocument();
    expect(summary()).toHaveTextContent('1 page · Selected pages');
  });

  it('Custom focuses the range input and validates it inline', async () => {
    setup();
    await userEvent.selectOptions(pagesSelect(), 'custom');
    const range = screen.getByRole('textbox', {name: /Page range/});
    await vi.waitFor(() => expect(range).toHaveFocus());
    expect(range).toHaveAttribute('aria-invalid', 'false');
    expect(summary()).toHaveTextContent('Check page range');
    expect(screen.getByRole('alert')).toHaveTextContent(''); // empty input: no message yet
    await userEvent.type(range, '2-9');
    expect(store.getState().exportSettings.customRange).toBe('2-9');
    expect(screen.getByRole('alert')).toHaveTextContent('Choose page numbers from 1 to 3.');
    expect(range).toHaveAttribute('aria-invalid', 'true');
    expect(summary()).toHaveTextContent('Check page range');
    await userEvent.clear(range);
    await userEvent.type(range, '1, 3');
    expect(range).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByRole('alert')).toHaveTextContent('');
    expect(summary()).toHaveTextContent('2 pages · Selected pages');
  });

  it('the primary button saves through saveOrContinue, and is disabled while exporting or empty', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', {name: 'Save edited PDF'}));
    expect(saveOrContinue).toHaveBeenCalledWith(store);
    act(() => void store.getState().beginExport());
    expect(screen.getByRole('button', {name: 'Save edited PDF'})).toBeDisabled();
    act(() => {
      store.getState().endExport();
      store.setState({pages: []});
    });
    expect(screen.getByRole('button', {name: 'Save edited PDF'})).toBeDisabled();
  });
});
