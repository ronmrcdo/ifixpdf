import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {PageInstance} from '../../domain/types';
import {pickAndImport} from '../../shell/useFileImport';
import {documentStore} from '../../state/workspaces';
import {PreviewView} from './PreviewView';

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
const open = (tab: 'document' | 'pages' = 'document') =>
  documentStore.setState({files: [{id: 'f', name: 'A.pdf', pages: 3, size: 1}], pages, tab});

beforeEach(() => vi.clearAllMocks());
afterEach(async () => {
  await documentStore.getState().reset();
});

describe('PreviewView', () => {
  it('shows the empty state and Open PDF opens the picker', async () => {
    render(<PreviewView />);
    expect(screen.getByRole('heading', {name: 'Open a PDF to preview'})).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Open PDF'}));
    expect(pickAndImport).toHaveBeenCalledOnce();
  });

  it('is read-only: no Undo, a read-only note and footer', () => {
    open();
    render(<PreviewView />);
    expect(screen.queryByRole('button', {name: 'Undo'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {name: 'Output'})).not.toBeInTheDocument();
    expect(screen.getByText('Read-only preview')).toBeInTheDocument();
    expect(screen.getByText('3 pages · Read-only')).toBeInTheDocument();
  });

  it('the Pages tab lists read-only thumbnails with no selection', () => {
    open('pages');
    render(<PreviewView />);
    expect(screen.getAllByRole('button', {name: /^Preview page \d/})).toHaveLength(3);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText('Page 2')).toBeInTheDocument();
  });

  it('clicking a thumbnail jumps to that page on the Document tab', async () => {
    open('pages');
    render(<PreviewView />);
    await userEvent.click(screen.getByRole('button', {name: 'Preview page 3'}));
    expect(documentStore.getState().currentPage).toBe(2);
    expect(documentStore.getState().tab).toBe('document');
  });
});
