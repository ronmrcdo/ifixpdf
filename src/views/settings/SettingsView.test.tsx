import {render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {makePdf} from '../../pdf/fixtures';
import {platform} from '../../platform';
import {useApp} from '../../state/app';
import {documentStore, mergeStore} from '../../state/workspaces';
import * as draft from '../../storage/draft';
import {recents} from '../../storage/app-recents';
import {LicenseItem} from './About';
import {SettingsView} from './SettingsView';

vi.mock('../../pdf/registry', () => ({retain: vi.fn(), release: vi.fn(async () => {})}));
vi.mock('../../pdf/thumbnails', () => ({renderBlob: vi.fn(async () => new Blob(['png']))}));
vi.mock('../../pdf/bytes', () => ({putBytes: vi.fn()}));

const user = () => userEvent.setup();
const row = (title: string) =>
  screen
    .getByText(title, {selector: '.settings-row > div'})
    .closest('.settings-row') as HTMLElement;

describe('SettingsView', () => {
  beforeEach(() => {
    useApp.setState({view: 'settings', toast: null, openAfter: true});
    vi.restoreAllMocks();
  });

  it('shows the local-processing note and the Light interface row', async () => {
    render(<SettingsView />);
    expect(screen.getByRole('heading', {name: 'Workspace preferences'})).toBeInTheDocument();
    expect(screen.getByText('PDF files are processed locally on this device.')).toBeInTheDocument();
    expect(within(row('Interface')).getByText('Light')).toBeInTheDocument();
  });

  it('toggles Open PDF after saving in the app store', async () => {
    render(<SettingsView />);
    const box = screen.getByRole('checkbox', {name: 'Open after saving'});
    expect(box).toBeChecked();
    await user().click(box);
    expect(useApp.getState().openAfter).toBe(false);
    await user().click(box);
    expect(useApp.getState().openAfter).toBe(true);
  });

  it('Clear workspace resets both workspaces and the draft, leaves recents alone, and toasts', async () => {
    const seeded = await recents.record({name: 'Keep.pdf', bytes: await makePdf(1), pages: 1});
    const spies = (
      ['list', 'record', 'open', 'relocate', 'remove', 'updateThumbnail'] as const
    ).map((m) => vi.spyOn(recents, m));
    const clear = vi.spyOn(draft, 'clearDraft').mockResolvedValue();
    const doc = vi.spyOn(documentStore.getState(), 'reset');
    const merge = vi.spyOn(mergeStore.getState(), 'reset');
    render(<SettingsView />);
    await user().click(
      within(row('Clear workspace')).getByRole('button', {name: 'Clear workspace'}),
    );
    await waitFor(() => expect(useApp.getState().toast?.text).toBe('Workspace cleared.'));
    expect(doc).toHaveBeenCalled();
    expect(merge).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    spies.forEach((spy) => spy.mockRestore());
    expect((await recents.list()).map((r) => r.id)).toEqual([seeded.id]);
  });

  it('Clear workspace empties a loaded document', async () => {
    vi.spyOn(draft, 'clearDraft').mockResolvedValue();
    await documentStore.getState().addFiles([{name: 'A.pdf', bytes: await makePdf(2)}]);
    expect(documentStore.getState().pages).toHaveLength(2);
    render(<SettingsView />);
    await user().click(screen.getByRole('button', {name: 'Clear workspace'}));
    await waitFor(() => expect(documentStore.getState().pages).toHaveLength(0));
  });

  it.each([
    ['document', documentStore],
    ['merge', mergeStore],
  ] as const)(
    'while the %s workspace is exporting, Clear workspace changes nothing and asks to wait',
    async (_n, store) => {
      const clear = vi.spyOn(draft, 'clearDraft').mockResolvedValue();
      const doc = vi.spyOn(documentStore.getState(), 'reset');
      const merge = vi.spyOn(mergeStore.getState(), 'reset');
      store.setState({exporting: true});
      render(<SettingsView />);
      await user().click(screen.getByRole('button', {name: 'Clear workspace'}));
      await waitFor(() =>
        expect(useApp.getState().toast).toMatchObject({
          text: 'Wait for the save to finish.',
          tone: 'info',
        }),
      );
      expect(clear).not.toHaveBeenCalled();
      expect(doc).not.toHaveBeenCalled();
      expect(merge).not.toHaveBeenCalled();
      store.setState({exporting: false});
    },
  );

  it('shows an error toast when clearing fails', async () => {
    vi.spyOn(draft, 'clearDraft').mockRejectedValue(new Error('idb'));
    render(<SettingsView />);
    await user().click(screen.getByRole('button', {name: 'Clear workspace'}));
    await waitFor(() =>
      expect(useApp.getState().toast).toMatchObject({
        text: 'Could not clear the workspace. Try again.',
        tone: 'error',
      }),
    );
  });

  it('GitHub opens through the platform opener', async () => {
    const open = vi.spyOn(platform, 'openUrl').mockResolvedValue();
    render(<SettingsView />);
    await user().click(await screen.findByRole('button', {name: 'GitHub'}));
    expect(open).toHaveBeenCalledWith('https://github.com/ronmrcdo/ifixpdf');
  });

  it('GitHub shows an error toast when the link cannot be opened', async () => {
    vi.spyOn(platform, 'openUrl').mockRejectedValue(new Error('denied'));
    render(<SettingsView />);
    await user().click(await screen.findByRole('button', {name: 'GitHub'}));
    await waitFor(() =>
      expect(useApp.getState().toast).toMatchObject({
        text: 'Could not open the link.',
        tone: 'error',
      }),
    );
  });

  it('About lists version, developer, an updates slot, and every license file', async () => {
    const {container} = render(<SettingsView />);
    expect(await screen.findByText('Developer: Ron Mercado')).toBeInTheDocument();
    expect(screen.getByText(/^Version \d+\.\d+\.\d+/)).toBeInTheDocument();
    expect(container.querySelector('.about #updates')).not.toBeNull();
    expect(container.querySelectorAll('.about-licenses details')).toHaveLength(7);
    expect(container.querySelector('.about-privacy')?.textContent).toMatch(/^Your PDFs are opened/);
  });
});

describe('LicenseItem', () => {
  it('loads the body only after the details opens', async () => {
    const load = vi.fn(async () => 'Permission is hereby granted');
    const {container} = render(<LicenseItem name="Demo" load={load} />);
    expect(load).not.toHaveBeenCalled();
    expect(container.querySelector('pre')).toBeNull();
    container.querySelector('details')!.open = true;
    container.querySelector('details')!.dispatchEvent(new Event('toggle'));
    expect(await screen.findByText('Permission is hereby granted')).toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('renders a license containing <script> as literal text', async () => {
    const body = '<script>alert(1)</script> text';
    const {container} = render(<LicenseItem name="Evil" load={async () => body} />);
    const d = container.querySelector('details')!;
    d.open = true;
    d.dispatchEvent(new Event('toggle'));
    await screen.findByText(/alert\(1\)/);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('pre')?.textContent).toBe(body);
  });
});
