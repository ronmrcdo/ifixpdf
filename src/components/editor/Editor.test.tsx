import {render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {PageInstance} from '../../domain/types';
import {createWorkspaceStore} from '../../state/workspace';
import {documentStore, mergeStore} from '../../state/workspaces';
import {EditView} from '../../views/edit/EditView';
import {MergeView} from '../../views/merge/MergeView';
import {PreviewView} from '../../views/preview/PreviewView';
import {Editor} from './Editor';

vi.mock('../../pdf/registry', () => ({retain: vi.fn(), release: vi.fn(async () => {}), acquire: vi.fn(() => new Promise(() => {}))}));
vi.mock('../../pdf/thumbnails', () => ({thumbnail: vi.fn(async () => 'blob:x')}));

const pages: PageInstance[] = [{uid: 'u0', fileId: 'f', local: 0, rotation: 0}];
const fill = (store: typeof documentStore) => store.setState({files: [{id: 'f', name: 'A.pdf', pages: 1, size: 1}], pages, workflow: 'review'});

afterEach(async () => {
  vi.restoreAllMocks();
  await documentStore.getState().reset();
  await mergeStore.getState().reset();
});

describe('Editor', () => {
  it.each([
    ['Toolbar', <Editor.Toolbar />], ['Row', <Editor.Row>x</Editor.Row>], ['Stage', <Editor.Stage caption="c" />],
    ['Pages', <Editor.Pages />], ['ReadOnlyPages', <Editor.ReadOnlyPages />], ['Output', <Editor.Output kind="document" />]
  ])('%s outside Editor.Root throws a clear error', (_, part) => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // React logs the thrown render error
    expect(() => render(part)).toThrow('Editor parts must be inside Editor.Root');
  });

  it('Root adds no DOM; the parts read its store', () => {
    const store = createWorkspaceStore('document');
    fill(store);
    store.setState({showOutput: true});
    const {container} = render(<Editor.Root store={store}><Editor.Toolbar /><Editor.Row><Editor.Stage caption="Cap" /><Editor.Output kind="document" /></Editor.Row></Editor.Root>);
    expect(container.firstElementChild).toHaveClass('toolbar');
    expect(container.querySelector('.editor')).toHaveClass('show-output');
    expect(screen.getByText('Cap')).toBeInTheDocument();
    expect(screen.getByRole('complementary', {name: 'Output settings'})).toBeInTheDocument();
  });

  it.each([
    ['Preview', PreviewView, documentStore, ['Root', 'Toolbar', 'Stage']],
    ['Edit', EditView, documentStore, ['Root', 'Toolbar', 'Row', 'Stage', 'Output']],
    ['Merge', MergeView, mergeStore, ['Root', 'Toolbar', 'Row', 'Sources', 'Stage', 'Output']]
  ] as const)('%s renders through the Editor slots with its own store', (_, View, store, parts) => {
    const spies = parts.map((p) => vi.spyOn(Editor, p));
    fill(store);
    render(<View />);
    spies.forEach((spy) => expect(spy).toHaveBeenCalled());
    expect(spies[0]!.mock.calls[0]![0]).toMatchObject({store});
  });
});
