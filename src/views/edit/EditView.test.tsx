import {act, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {PageInstance} from '../../domain/types';
import {AppShell} from '../../shell/AppShell';
import {pickAndImport} from '../../shell/useFileImport';
import {useApp} from '../../state/app';
import {documentStore} from '../../state/workspaces';
import {EditView} from './EditView';

vi.mock('../../pdf/registry', () => ({
  retain: vi.fn(),
  release: vi.fn(async () => {}),
  acquire: vi.fn(),
}));
vi.mock('../../pdf/thumbnails', () => ({thumbnail: vi.fn(async () => 'blob:x')}));
vi.mock('../../shell/useFileImport', async (orig) => ({
  ...(await orig<object>()),
  pickAndImport: vi.fn(),
}));

const pages: PageInstance[] = [0, 1, 2].map((i) => ({
  uid: `u${i}`,
  fileId: 'f',
  local: i,
  rotation: 0,
}));
const open = () =>
  documentStore.setState({
    files: [{id: 'f', name: 'A.pdf', pages: 3, size: 1}],
    pages,
    tab: 'pages',
  });

beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  await documentStore.getState().reset();
});

describe('EditView', () => {
  it('shows the empty state and Open PDF opens the picker', async () => {
    render(<EditView />);
    expect(screen.getByRole('heading', {name: 'Open a PDF to edit'})).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Open PDF'}));
    expect(pickAndImport).toHaveBeenCalledOnce();
  });

  it('has no sources pane, but undo/redo, the page grid and the output region', () => {
    open();
    render(<EditView />);
    expect(screen.queryByRole('region', {name: 'Source PDFs'})).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Undo'})).toBeInTheDocument();
    expect(screen.getByRole('complementary', {name: 'Output settings'})).toBeInTheDocument();
    expect(screen.getAllByRole('group', {name: /^Page \d/})).toHaveLength(3);
  });

  it('the Output button toggles the output panel (below 760px)', async () => {
    open();
    const {container} = render(<EditView />);
    const editor = container.querySelector('.editor');
    expect(editor).not.toHaveClass('show-output');
    await userEvent.click(screen.getByRole('button', {name: 'Output'}));
    expect(editor).toHaveClass('show-output');
    await userEvent.click(screen.getByRole('button', {name: 'Output'}));
    expect(editor).not.toHaveClass('show-output');
  });

  it('Split PDF calls onSplit', async () => {
    open();
    const onSplit = vi.fn();
    render(<EditView onSplit={onSplit} />);
    await userEvent.click(screen.getByRole('button', {name: 'Split PDF'}));
    expect(onSplit).toHaveBeenCalledOnce();
  });
});

describe('Edit PDF from Preview', () => {
  it('opens Edit with the same pages and history', async () => {
    open();
    documentStore.getState().rotate(90, new Set(['u1']));
    useApp.setState({view: 'preview'});
    render(<AppShell />);
    expect(screen.queryByRole('button', {name: 'Undo'})).not.toBeInTheDocument();
    const before = documentStore.getState().pages;
    await userEvent.click(
      within(document.querySelector('.header-actions') as HTMLElement).getByRole('button', {
        name: 'Edit PDF',
      }),
    );
    expect(useApp.getState().view).toBe('edit');
    expect(documentStore.getState().pages).toBe(before);
    expect(screen.getByRole('button', {name: 'Undo'})).toBeEnabled();
    act(() => documentStore.getState().undo());
    expect(documentStore.getState().pages.every((p) => p.rotation === 0)).toBe(true);
  });
});
