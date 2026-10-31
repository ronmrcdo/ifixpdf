import {render} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {PageInstance, SourceFile} from '../domain/types';
import {platform} from '../platform';
import {useApp} from '../state/app';
import {documentStore, mergeStore} from '../state/workspaces';
import {printDocument, saveCopy, saveOrContinue} from '../actions/save';
import {useShortcuts} from './shortcuts';

vi.mock('../pdf/registry', () => ({retain: vi.fn(), release: vi.fn(async () => {})}));
vi.mock('../actions/save', () => ({
  saveCopy: vi.fn(),
  saveOrContinue: vi.fn(),
  printDocument: vi.fn(),
  extractSelection: vi.fn(),
}));

const file: SourceFile = {id: 'f', name: 'f.pdf', pages: 3, size: 1};
const pages: PageInstance[] = [0, 1, 2].map((i) => ({
  uid: `f-${i}`,
  fileId: 'f',
  local: i,
  rotation: 0,
}));

function Host() {
  useShortcuts();
  return (
    <>
      <div data-shortcut-scope="grid">
        <button type="button">grid</button>
      </div>
      <div data-shortcut-scope="stage">
        <button type="button">stage</button>
      </div>
      <button type="button">outside</button>
      <input aria-label="field" />
    </>
  );
}
const focus = (name: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent === name)!.focus();

beforeEach(() => {
  useApp.setState({view: 'edit', workspace: 'document'});
  documentStore.setState({files: [file], pages});
  render(<Host />);
});
afterEach(async () => {
  vi.restoreAllMocks();
  documentStore.setState({exporting: false});
  await documentStore.getState().reset();
  await mergeStore.getState().reset();
});

describe('useShortcuts', () => {
  it('Ctrl+O opens the picker, even from a field', async () => {
    const pick = vi.spyOn(platform, 'pickPdfs').mockResolvedValue([]);
    await userEvent.click(document.querySelector('input')!);
    await userEvent.keyboard('{Control>}o{/Control}');
    expect(pick).toHaveBeenCalledTimes(1);
  });

  it('Delete removes the selection only when focus is in the grid', async () => {
    documentStore.getState().select('f-1', {ctrl: false, shift: false});
    focus('outside');
    await userEvent.keyboard('{Delete}');
    expect(documentStore.getState().pages).toHaveLength(3);
    focus('grid');
    await userEvent.keyboard('{Delete}');
    expect(documentStore.getState().pages.map((p) => p.uid)).toEqual(['f-0', 'f-2']);
  });

  it('Delete with nothing selected asks for a selection and changes nothing', async () => {
    focus('grid');
    await userEvent.keyboard('{Delete}');
    expect(documentStore.getState().pages).toHaveLength(3);
    expect(useApp.getState().toast?.text).toBe('Select one or more pages first.');
  });

  it('Ctrl+A selects all in the grid, and Ctrl+Z undoes', async () => {
    focus('grid');
    await userEvent.keyboard('{Control>}a{/Control}');
    expect(documentStore.getState().selection.uids.size).toBe(3);
    await userEvent.keyboard('{Delete}');
    expect(documentStore.getState().pages).toHaveLength(0);
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(documentStore.getState().pages).toHaveLength(3);
    await userEvent.keyboard('{Control>}y{/Control}');
    expect(documentStore.getState().pages).toHaveLength(0);
  });

  it('arrows flip pages only from the stage', async () => {
    focus('outside');
    await userEvent.keyboard('{ArrowRight}');
    expect(documentStore.getState().currentPage).toBe(0);
    focus('stage');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(documentStore.getState().currentPage).toBe(2);
    await userEvent.keyboard('{ArrowLeft}');
    expect(documentStore.getState().currentPage).toBe(1);
  });

  it('is silent while a dialog is open', async () => {
    const pick = vi.spyOn(platform, 'pickPdfs').mockResolvedValue([]);
    const dialog = Object.assign(document.createElement('dialog'), {open: true});
    document.body.append(dialog);
    await userEvent.keyboard('{Control>}o{/Control}');
    dialog.remove();
    expect(pick).not.toHaveBeenCalled();
  });

  it('Ctrl+S is swallowed (no browser save page) and Ctrl+Z follows the active workspace, not the other one', async () => {
    const event = new KeyboardEvent('keydown', {
      key: 's',
      ctrlKey: true,
      cancelable: true,
      bubbles: true,
    });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    useApp.setState({view: 'merge', workspace: 'merge'});
    documentStore.getState().remove(new Set(['f-0']));
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(documentStore.getState().pages).toHaveLength(2);
  });

  it('Ctrl+S saves a copy in Preview and the output in Edit and Merge; Ctrl+P prints the active workspace', async () => {
    vi.mocked(saveCopy).mockClear();
    vi.mocked(saveOrContinue).mockClear();
    vi.mocked(printDocument).mockClear();
    useApp.setState({view: 'preview', workspace: 'document'});
    await userEvent.keyboard('{Control>}s{/Control}');
    expect(saveCopy).toHaveBeenCalledWith(documentStore);
    expect(saveOrContinue).not.toHaveBeenCalled();
    await userEvent.keyboard('{Control>}p{/Control}');
    expect(printDocument).toHaveBeenLastCalledWith(documentStore);
    useApp.setState({view: 'edit', workspace: 'document'});
    await userEvent.keyboard('{Control>}s{/Control}');
    expect(saveOrContinue).toHaveBeenLastCalledWith(documentStore);
    useApp.setState({view: 'merge', workspace: 'merge'});
    await userEvent.keyboard('{Control>}s{/Control}');
    expect(saveOrContinue).toHaveBeenLastCalledWith(mergeStore);
    await userEvent.keyboard('{Control>}p{/Control}');
    expect(printDocument).toHaveBeenLastCalledWith(mergeStore);
    expect(saveCopy).toHaveBeenCalledOnce();
  });

  it('Ctrl+S and Ctrl+P do nothing while the workspace exports', async () => {
    vi.mocked(saveOrContinue).mockClear();
    vi.mocked(printDocument).mockClear();
    documentStore.setState({exporting: true});
    await userEvent.keyboard('{Control>}s{/Control}{Control>}p{/Control}');
    expect(saveOrContinue).not.toHaveBeenCalled();
    expect(printDocument).not.toHaveBeenCalled();
  });
});
