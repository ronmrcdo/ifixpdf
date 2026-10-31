import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {PageInstance} from '../../domain/types';
import {createWorkspaceStore} from '../../state/workspace';
import {Toolbar} from './Toolbar';

vi.mock('../../pdf/registry', () => ({
  retain: vi.fn(),
  release: vi.fn(async () => {}),
  acquire: vi.fn(),
}));

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
});

describe('Toolbar tabs', () => {
  it('follow the ARIA tabs pattern', () => {
    render(<Toolbar store={store} readOnly />);
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    const [doc, grid] = screen.getAllByRole('tab');
    expect(doc).toHaveTextContent('Document');
    expect(doc).toHaveAttribute('aria-selected', 'true');
    expect(doc).toHaveAttribute('tabindex', '0');
    expect(grid).toHaveTextContent('Pages');
    expect(grid).toHaveAttribute('aria-selected', 'false');
    expect(grid).toHaveAttribute('tabindex', '-1');
  });

  it('clicking a tab selects it', async () => {
    render(<Toolbar store={store} readOnly />);
    await userEvent.click(screen.getByRole('tab', {name: 'Pages'}));
    expect(store.getState().tab).toBe('pages');
    expect(screen.getByRole('tab', {name: 'Pages'})).toHaveAttribute('aria-selected', 'true');
  });

  it('Left and Right move between tabs and keep focus on the tab moved to', async () => {
    render(<Toolbar store={store} readOnly />);
    screen.getByRole('tab', {name: 'Document'}).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(store.getState().tab).toBe('pages');
    expect(screen.getByRole('tab', {name: 'Pages'})).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(store.getState().tab).toBe('document');
    expect(screen.getByRole('tab', {name: 'Document'})).toHaveFocus();
  });
});

describe('Toolbar extras', () => {
  it('Preview shows the read-only note and no history controls', () => {
    render(<Toolbar store={store} readOnly />);
    expect(screen.getByText('Read-only preview')).toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Undo'})).toBeNull();
    expect(screen.queryByRole('button', {name: 'Redo'})).toBeNull();
  });

  it('Edit and Merge show Undo/Redo that follow the history', async () => {
    render(<Toolbar store={store} />);
    expect(screen.queryByText('Read-only preview')).toBeNull();
    const undo = screen.getByRole('button', {name: 'Undo'});
    const redo = screen.getByRole('button', {name: 'Redo'});
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
    act(() => store.getState().rotate(90, new Set(['u0'])));
    expect(undo).toBeEnabled();
    await userEvent.click(undo);
    expect(store.getState().pages[0]?.rotation).toBe(0);
    expect(undo).toBeDisabled();
    expect(redo).toBeEnabled();
    await userEvent.click(redo);
    expect(store.getState().pages[0]?.rotation).toBe(90);
  });

  it('Edit and Merge have an Output toggle for the narrow layout; Preview has none', async () => {
    render(<Toolbar store={store} />);
    await userEvent.click(screen.getByRole('button', {name: 'Output'}));
    expect(store.getState().showOutput).toBe(true);
    await userEvent.click(screen.getByRole('button', {name: 'Output'}));
    expect(store.getState().showOutput).toBe(false);
  });
});
