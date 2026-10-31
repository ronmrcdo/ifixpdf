import {act, render, screen, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {useUpdates, type UpdateState} from './machine';
import {UpdatesRow} from './UpdatesRow';

const set = (s: UpdateState) => act(() => useUpdates.setState(s, true));
const info = {version: '0.2.0', notes: 'Faster merge.'};
const row = () => document.querySelector('#updates') as HTMLElement;

beforeEach(() => set({status: 'idle'}));

describe('UpdatesRow copy and controls', () => {
  it.each<[UpdateState, string, string | null]>([
    [
      {status: 'browser'},
      'Updates are available in the installed desktop app. This browser preview cannot update itself.',
      null,
    ],
    [{status: 'idle'}, 'Check whether a newer version is available.', 'Check for updates'],
    [{status: 'checking'}, 'Checking for updates…', null],
    [{status: 'current'}, 'iFixPDF is up to date.', 'Check for updates'],
    [
      {status: 'unconfigured'},
      'The update service is not configured in this development build. Install new versions manually.',
      'Check for updates',
    ],
    [{status: 'offline'}, "You're offline. Connect to the internet and try again.", 'Retry'],
    [{status: 'error'}, "Couldn't check for updates. Try again later.", 'Retry'],
    [{status: 'available', ...info}, 'iFixPDF 0.2.0 is available.', 'Download update'],
    [{status: 'downloading', ...info, progress: {done: 0}}, 'Downloading iFixPDF 0.2.0…', null],
    [
      {status: 'download-error', ...info},
      'Download failed. Check your connection and try again.',
      'Retry',
    ],
    [
      {status: 'ready', ...info},
      'iFixPDF 0.2.0 is ready. Your Preview and Edit draft is saved before restarting; Merge PDFs starts empty.',
      'Restart and install',
    ],
    [
      {status: 'save-error', ...info},
      "iFixPDF couldn't save your Preview and Edit draft, so the update was not installed. Save your PDF, then try again.",
      'Restart and install',
    ],
    [{status: 'installing', ...info}, 'Installing update…', null],
    [
      {status: 'install-error', ...info},
      "The update couldn't be installed. Try again, or install the new version manually.",
      'Retry',
    ],
    [{status: 'restart', ...info}, 'Update installed. Restart iFixPDF to finish.', null],
  ])('%j', (state, text, button) => {
    set(state);
    render(<UpdatesRow />);
    expect(within(row()).getByText(text)).toBeInTheDocument();
    expect(within(row()).getByText(/^Installed version \d/)).toBeInTheDocument();
    const buttons = within(row()).queryAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(button ? [button] : []);
  });

  it('the status is a polite live region', () => {
    render(<UpdatesRow />);
    expect(row().querySelector('.update-status')).toHaveAttribute('aria-live', 'polite');
  });

  it.each(['available', 'download-error', 'ready', 'save-error'] as const)(
    'shows release notes as text in %s',
    (status) => {
      const notes = '<img src=x onerror="window.__xss=1">';
      set({status, version: '0.2.0', notes});
      render(<UpdatesRow />);
      expect(within(row()).getByText(notes)).toBeInTheDocument();
      expect(row().querySelector('img')).toBeNull();
    },
  );

  it.each(['idle', 'downloading', 'installing', 'restart'] as const)('no notes in %s', (status) => {
    set({status, version: '0.2.0', notes: 'hidden notes', progress: {done: 0}});
    render(<UpdatesRow />);
    expect(screen.queryByText('hidden notes')).toBeNull();
  });

  it('shows percent when the total is known and megabytes when not', () => {
    set({status: 'downloading', ...info, progress: {done: 400, total: 1000}});
    const {unmount} = render(<UpdatesRow />);
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(row().querySelector('progress')).toHaveAttribute('max', '1000');
    unmount();
    set({status: 'downloading', ...info, progress: {done: 2 * 1048576}});
    render(<UpdatesRow />);
    expect(screen.getByText('2.0 MB')).toBeInTheDocument();
    expect(row().querySelector('progress')).not.toHaveAttribute('value');
  });
});

describe('UpdatesRow focus', () => {
  it('keeps focus in the row: onto the next primary action, or the row while no button exists', async () => {
    set({status: 'available', ...info});
    render(<UpdatesRow />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', {name: 'Download update'}));
    set({status: 'downloading', ...info, progress: {done: 0}});
    expect(row().contains(document.activeElement)).toBe(true);
    set({status: 'ready', ...info});
    expect(document.activeElement).toBe(screen.getByRole('button', {name: 'Restart and install'}));
  });

  it('does not take focus when the user is elsewhere', () => {
    set({status: 'checking'});
    render(<UpdatesRow />);
    set({status: 'current'});
    expect(row().contains(document.activeElement)).toBe(false);
  });
});

describe('UpdatesRow actions', () => {
  it('Check for updates runs the check through the injected updater', async () => {
    const check = vi.fn(async () => null);
    set({status: 'idle'});
    render(
      <UpdatesRow
        deps={{
          check,
          online: () => true,
          busy: () => false,
          saveDraft: async () => {},
          notify: vi.fn(),
        }}
      />,
    );
    await userEvent.setup().click(screen.getByRole('button', {name: 'Check for updates'}));
    expect(check).toHaveBeenCalledOnce();
    expect(await screen.findByText('iFixPDF is up to date.')).toBeInTheDocument();
  });
});
