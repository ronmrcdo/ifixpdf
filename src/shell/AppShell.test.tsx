import {act, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {PageInstance, SourceFile} from '../domain/types';
import {putBytes} from '../pdf/bytes';
import {makePdf} from '../pdf/fixtures';
import {InvalidPdfError, loadPdf} from '../pdf/load';
import {platform} from '../platform';
import {useApp, type View} from '../state/app';
import {documentStore, mergeStore} from '../state/workspaces';
import {printDocument, saveOrContinue} from '../actions/save';
import {AppShell} from './AppShell';

vi.mock('../pdf/registry', () => ({retain: vi.fn(), release: vi.fn(async () => {})}));
vi.mock('../pdf/load', async (orig) => {
  const m = await orig<typeof import('../pdf/load')>();
  return {...m, loadPdf: vi.fn(m.loadPdf)};
});
vi.mock('../state/draft-sync', async (orig) => ({
  ...(await orig<object>()),
  flushDraft: vi.fn(async () => {}),
}));
vi.mock('../actions/save', async (orig) => ({
  ...(await orig<object>()),
  saveOrContinue: vi.fn(),
  printDocument: vi.fn(),
}));

const file = (id: string, pages: number): SourceFile => ({id, name: `${id}.pdf`, pages, size: 1});
const pagesOf = (f: SourceFile): PageInstance[] =>
  Array.from({length: f.pages}, (_, i) => ({
    uid: `${f.id}-${i}`,
    fileId: f.id,
    local: i,
    rotation: 0,
  }));
const fill = (store: typeof documentStore, files: SourceFile[]) =>
  store.setState({files, pages: files.flatMap(pagesOf)});
const nav = () => screen.getByRole('navigation', {name: 'Main'});
const at = (view: View) => act(() => useApp.getState().setView(view));
const actions = () =>
  [...document.querySelectorAll('.header-actions button')].map(
    (b) => b.getAttribute('aria-label') ?? b.textContent?.trim(),
  );

beforeEach(() => {
  useApp.setState({
    view: 'home',
    documentView: 'preview',
    workspace: 'merge',
    toast: null,
    draft: 'saved',
  });
});
afterEach(async () => {
  documentStore.setState({exporting: false});
  mergeStore.setState({exporting: false});
  await documentStore.getState().reset();
  await mergeStore.getState().reset();
  vi.useRealTimers();
});

describe('sidebar', () => {
  it('lists the five views and marks the active one', () => {
    render(<AppShell />);
    const items = within(nav())
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(items).toEqual(['Home', 'Merge PDFs', 'Preview PDF', 'Edit PDF', 'Settings']);
    expect(within(nav()).getByRole('button', {name: 'Home'})).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      within(nav()).queryByText(/Your documents/),
      'device storage is said on Home and in the editor, not the rail',
    ).toBeNull();
  });

  it('clicking an item moves aria-current and never reloads', async () => {
    render(<AppShell />);
    const before = nav();
    const href = window.location.href;
    await userEvent.click(within(nav()).getByRole('button', {name: 'Settings'}));
    expect(useApp.getState().view).toBe('settings');
    expect(within(nav()).getByRole('button', {name: 'Settings'})).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav()).getByRole('button', {name: 'Home'})).not.toHaveAttribute('aria-current');
    expect(nav()).toBe(before);
    expect(window.location.href).toBe(href);
    expect(within(nav()).getByRole('button', {name: 'Settings'})).toHaveAttribute('type', 'button');
  });

  it('Edit opens on the Pages tab', async () => {
    render(<AppShell />);
    await userEvent.click(within(nav()).getByRole('button', {name: 'Edit PDF'}));
    expect(documentStore.getState().tab).toBe('pages');
  });
});

describe('header', () => {
  it.each([
    ['home', 'Home', 'Recent PDFs and your current workspace.'],
    ['merge', 'Merge PDFs', 'A few files. One well-ordered document.'],
    ['preview', 'Preview PDF', 'Read and inspect your document.'],
    ['edit', 'Edit PDF', 'Organize pages and save an edited copy.'],
    ['settings', 'Settings', 'A workspace that works your way.'],
  ] as const)('%s title and subtitle', (view, title, subtitle) => {
    useApp.setState({view});
    render(<AppShell />);
    expect(screen.getByRole('heading', {level: 1})).toHaveTextContent(title);
    expect(document.getElementById('view-subtitle')).toHaveTextContent(subtitle);
  });

  it('Preview and Edit with one file show its name as the subtitle', () => {
    fill(documentStore, [file('a', 2)]);
    documentStore.getState().setExportSettings({name: 'Report.pdf'});
    useApp.setState({view: 'edit'});
    render(<AppShell />);
    expect(document.getElementById('view-subtitle')).toHaveTextContent('Report.pdf');
  });

  it('actions per view, as today', () => {
    render(<AppShell />);
    expect(actions()).toEqual(['Open PDF']);
    at('merge');
    expect(actions()).toEqual(['Add files']);
    at('preview');
    expect(actions()).toEqual(['Open PDF', 'Edit PDF']);
    at('edit');
    expect(actions()).toEqual(['Open PDF', 'Save PDF']);
    expect(screen.getByRole('button', {name: 'Save PDF'})).toBeDisabled();
    at('settings');
    expect(actions()).toEqual([]);
  });

  it('Preview with a document adds Print and enables Edit PDF, which opens Edit on Pages', async () => {
    fill(documentStore, [file('a', 2)]);
    useApp.setState({view: 'preview'});
    render(<AppShell />);
    expect(actions()).toEqual(['Open PDF', 'Print PDF', 'Edit PDF']);
    const edit = within(document.querySelector('.header-actions') as HTMLElement).getByRole(
      'button',
      {name: 'Edit PDF'},
    );
    expect(edit).toBeEnabled();
    await userEvent.click(edit);
    expect(useApp.getState().view).toBe('edit');
    expect(documentStore.getState().tab).toBe('pages');
  });

  it('Edit PDF is disabled in Preview with no document', () => {
    useApp.setState({view: 'preview'});
    render(<AppShell />);
    expect(
      within(document.querySelector('.header-actions') as HTMLElement).getByRole('button', {
        name: 'Edit PDF',
      }),
    ).toBeDisabled();
  });

  it('Merge in review shows New merge and Continue to save; New merge clears Merge only', async () => {
    fill(mergeStore, [file('a', 1), file('b', 2)]);
    mergeStore.setState({workflow: 'review'});
    fill(documentStore, [file('d', 1)]);
    useApp.setState({view: 'merge'});
    render(<AppShell />);
    expect(actions()).toEqual(['New merge', 'Add files', 'Continue to save']);
    await userEvent.click(screen.getByRole('button', {name: 'New merge'}));
    expect(mergeStore.getState().files).toEqual([]);
    expect(documentStore.getState().files).toHaveLength(1);
    expect(actions()).toEqual(['Add files']);
  });

  it('Merge in save and done', () => {
    fill(mergeStore, [file('a', 1)]);
    mergeStore.setState({workflow: 'save'});
    useApp.setState({view: 'merge'});
    render(<AppShell />);
    expect(actions()).toEqual(['New merge', 'Add files', 'Save PDF']);
    act(() => mergeStore.setState({workflow: 'done'}));
    expect(actions()).toEqual(['Add files']);
  });

  it('Save is disabled while exporting', () => {
    fill(documentStore, [file('a', 1)]);
    documentStore.setState({exporting: true});
    useApp.setState({view: 'edit'});
    render(<AppShell />);
    expect(screen.getByRole('button', {name: 'Save PDF'})).toBeDisabled();
  });

  it('Save PDF, Continue to save and Print PDF act on their own workspace', async () => {
    fill(documentStore, [file('a', 1)]);
    fill(mergeStore, [file('m', 1)]);
    mergeStore.setState({workflow: 'review'});
    useApp.setState({view: 'edit'});
    render(<AppShell />);
    await userEvent.click(screen.getByRole('button', {name: 'Save PDF'}));
    expect(saveOrContinue).toHaveBeenLastCalledWith(documentStore);
    at('merge');
    await userEvent.click(
      within(document.querySelector('.header-actions') as HTMLElement).getByRole('button', {
        name: 'Continue to save',
      }),
    );
    expect(saveOrContinue).toHaveBeenLastCalledWith(mergeStore);
    at('preview');
    await userEvent.click(screen.getByRole('button', {name: 'Print PDF'}));
    expect(printDocument).toHaveBeenCalledWith(documentStore);
  });
});

describe('statusbar', () => {
  const status = () => document.getElementById('status');

  it('is a polite status region', () => {
    render(<AppShell />);
    expect(status()).toHaveAttribute('role', 'status');
    expect(status()).toHaveTextContent('Ready to add PDFs');
  });

  it('has no draft note in Merge', () => {
    fill(mergeStore, [file('m', 1)]);
    fill(documentStore, [file('a', 2)]);
    useApp.setState({workspace: 'merge', draft: 'failed'});
    render(<AppShell />);
    expect(document.getElementById('draft-status')).toBeNull();
  });

  it('has no draft note in the document workspace without files', () => {
    useApp.setState({view: 'edit', workspace: 'document'});
    render(<AppShell />);
    expect(document.getElementById('draft-status')).toBeNull();
  });

  it('tells whether the document draft saved', () => {
    fill(documentStore, [file('a', 2)]);
    useApp.setState({view: 'edit', workspace: 'document'});
    render(<AppShell />);
    expect(document.getElementById('draft-status')).toHaveTextContent('Draft saved on this device');
    act(() => useApp.setState({draft: 'failed'}));
    expect(document.getElementById('draft-status')).toHaveTextContent('Draft not saved');
  });

  it('counts the active workspace; Home and Settings keep the last one', () => {
    fill(documentStore, [file('a', 2)]);
    fill(mergeStore, [file('m', 1), file('n', 1), file('o', 3)]);
    render(<AppShell />);
    expect(status()).toHaveTextContent('3 files · 5 pages · Ready');
    at('preview');
    expect(status()).toHaveTextContent('1 files · 2 pages · Ready');
    at('settings');
    expect(status()).toHaveTextContent('1 files · 2 pages · Ready');
  });

  it('shows Processing while the active workspace exports', () => {
    fill(documentStore, [file('a', 2)]);
    documentStore.setState({exporting: true});
    useApp.setState({view: 'edit', workspace: 'document'});
    render(<AppShell />);
    expect(status()).toHaveTextContent('Processing PDF…');
    act(() => documentStore.setState({progress: [1, 3]}));
    expect(status()).toHaveTextContent(/^Processing PDF… 33%$/);
  });
});

describe('toast', () => {
  const region = (role: 'status' | 'alert') =>
    screen.getAllByRole(role).find((el) => el.id !== 'status')!;

  it('keeps both regions mounted with no toast', () => {
    render(<AppShell />);
    expect(region('status')).toHaveAttribute('aria-live', 'polite');
    expect(region('status')).toBeEmptyDOMElement();
    expect(region('alert')).toBeEmptyDOMElement();
  });

  it('info goes to the status region, errors to the alert region', () => {
    render(<AppShell />);
    const info = region('status'),
      alert = region('alert');
    act(() => useApp.getState().notify('2 PDFs added'));
    expect(info).toHaveTextContent('2 PDFs added');
    expect(alert).toBeEmptyDOMElement();
    act(() => useApp.getState().notify('Could not open x.pdf.', 'error'));
    expect(alert).toHaveTextContent('Could not open x.pdf.');
    expect(info).toBeEmptyDOMElement();
    expect(region('alert')).toBe(alert);
  });

  it('each toast is a fresh node, so its entry animation replays', () => {
    render(<AppShell />);
    act(() => useApp.getState().notify('Same'));
    const first = region('status').firstChild;
    act(() => useApp.getState().notify('Same'));
    expect(region('status').firstChild).not.toBe(first);
  });

  it('clears after 4.5 s, and a newer toast restarts the clock', () => {
    vi.useFakeTimers();
    render(<AppShell />);
    act(() => useApp.getState().notify('One'));
    act(() => vi.advanceTimersByTime(4000));
    act(() => useApp.getState().notify('Two'));
    act(() => vi.advanceTimersByTime(4000));
    expect(region('status')).toHaveTextContent('Two');
    act(() => vi.advanceTimersByTime(500));
    expect(useApp.getState().toast).toBeNull();
    act(() => vi.advanceTimersByTime(160)); // its slide-out
    expect(region('status')).toBeEmptyDOMElement();
  });
});

describe('route', () => {
  it('writes the URL as the view changes', () => {
    const spy = vi.spyOn(window.history, 'replaceState');
    render(<AppShell />);
    expect(spy).toHaveBeenLastCalledWith(null, '', 'index.html?view=home');
    spy.mockClear();
    at('settings');
    expect(spy).not.toHaveBeenCalled();
    act(() => fill(documentStore, [{...file('a', 1), recentId: 'r1'}]));
    at('edit');
    expect(spy).toHaveBeenLastCalledWith(null, '', 'index.html?recent=r1&view=edit');
    spy.mockRestore();
  });
});

describe('titlebar', () => {
  it('a failing native window call shows an error toast', async () => {
    const saved = platform.window;
    Object.assign(platform, {
      window: {
        minimize: vi.fn(async () => {
          throw new Error('denied');
        }),
        toggleMaximize: vi.fn(),
        close: vi.fn(),
      },
    });
    render(<AppShell />);
    await userEvent.click(screen.getByRole('button', {name: 'Minimize window'}));
    Object.assign(platform, {window: saved});
    await vi.waitFor(() =>
      expect(useApp.getState().toast).toMatchObject({
        text: 'Could not change the window. Try again.',
        tone: 'error',
      }),
    );
  });

  it('calls the native window in Tauri', async () => {
    const win = {
      minimize: vi.fn(async () => {}),
      toggleMaximize: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    };
    const saved = platform.window;
    Object.assign(platform, {window: win});
    render(<AppShell />);
    await userEvent.click(screen.getByRole('button', {name: 'Minimize window'}));
    await userEvent.click(screen.getByRole('button', {name: 'Maximize window'}));
    await userEvent.click(screen.getByRole('button', {name: 'Close window'}));
    Object.assign(platform, {window: saved});
    expect([win.minimize, win.toggleMaximize, win.close].map((f) => f.mock.calls.length)).toEqual([
      1, 1, 1,
    ]);
    expect(useApp.getState().toast).toBeNull();
  });

  it('is a drag region whose window buttons explain themselves in the browser', async () => {
    render(<AppShell />);
    expect(document.querySelector('.titlebar')).toHaveAttribute('data-tauri-drag-region');
    for (const name of ['Minimize window', 'Maximize window', 'Close window']) {
      act(() => useApp.setState({toast: null}));
      await userEvent.click(screen.getByRole('button', {name}));
      expect(useApp.getState().toast).toMatchObject({
        text: 'Window controls are available in the Tauri desktop build.',
      });
    }
  });
});

describe('dialogs', () => {
  it('Edit: Split PDF opens the split dialog for the current pages', async () => {
    fill(documentStore, [file('a', 3)]);
    putBytes('a', await makePdf(3));
    useApp.setState({view: 'edit'});
    render(<AppShell />);
    await userEvent.click(screen.getByRole('tab', {name: 'Pages'}));
    await userEvent.click(screen.getByRole('button', {name: 'Split PDF'}));
    expect(screen.getByRole('dialog', {name: 'Split PDF'})).toBeVisible();
    expect(screen.getByLabelText(/^Ranges/)).toHaveValue('1-1, 2-3');
  });

  it('does not open Add password for a recent that is no longer a valid unlocked PDF', async () => {
    const {recents} = await import('../storage/app-recents');
    await recents.record({name: 'Stale.pdf', bytes: await makePdf(1), pages: 1});
    const opening = vi.spyOn(recents, 'open');
    vi.mocked(loadPdf).mockRejectedValueOnce(new InvalidPdfError('Stale.pdf'));
    render(<AppShell />);
    await userEvent.click(await screen.findByRole('button', {name: 'More actions for Stale.pdf'}));
    await userEvent.click(screen.getByRole('menuitem', {name: 'Add password…'}));
    await vi.waitFor(() => expect(useApp.getState().toast?.tone).toBe('error'));
    expect(screen.queryByRole('dialog', {name: 'Add password'})).toBeNull();
    opening.mockRestore();
  });

  it('Home: Add password opens the password dialog for the recent PDF', async () => {
    const {recents} = await import('../storage/app-recents');
    await recents.record({name: 'Recent.pdf', bytes: await makePdf(1), pages: 1});
    const opening = vi.spyOn(recents, 'open');
    vi.mocked(loadPdf).mockResolvedValueOnce({pages: 1});
    render(<AppShell />);
    await userEvent.click(await screen.findByRole('button', {name: 'More actions for Recent.pdf'}));
    await userEvent.click(screen.getByRole('menuitem', {name: 'Add password…'}));
    expect(opening).toHaveBeenCalledTimes(1);
    await opening.mock.results[0]?.value; // the IndexedDB read, which is slow under load, finishes before findBy's clock matters
    expect(await screen.findByRole('dialog', {name: 'Add password'})).toBeVisible();
    opening.mockRestore();
  });
});
