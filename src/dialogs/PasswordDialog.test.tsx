import {act, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {PDFDocument} from 'pdf-lib';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {makePdf} from '../pdf/fixtures';
import {platform} from '../platform';
import {useApp} from '../state/app';
import {documentStore, mergeStore} from '../state/workspaces';
import {busy} from '../state/work';
import {DialogHost, showPasswordDialog, useDialogs} from './host';

const SECRET = 'correct-horse-9';
let saved: Uint8Array[];
const opener = () => screen.getByRole('button', {name: 'Opener'});
const pw = () => screen.getByLabelText('Password', {selector: 'input'});
const confirm = () => screen.getByLabelText('Confirm password');
const submit = () => screen.getByRole('button', {name: /Save protected copy|Protecting PDF…/});

async function open(user = userEvent.setup()) {
  render(
    <>
      <button type="button">Opener</button>
      <DialogHost />
    </>,
  );
  opener().focus();
  act(() => showPasswordDialog({name: 'Report.pdf', bytes: await_bytes}));
  return user;
}
let await_bytes: Uint8Array;

beforeEach(async () => {
  useDialogs.setState({active: null});
  await_bytes = await makePdf(2);
  saved = [];
  vi.spyOn(platform, 'saveAs').mockImplementation(async (bytes, name) => {
    saved.push(bytes);
    return {name, folder: '/d'};
  });
});
afterEach(() => vi.restoreAllMocks());

describe('PasswordDialog', () => {
  it('shows the mismatch message and blocks submit', async () => {
    const user = await open();
    await user.type(pw(), SECRET);
    await user.type(confirm(), 'different-pass');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Passwords do not match. Enter the same password in both fields.',
    );
    expect(submit()).toBeDisabled();
  });

  it('blocks a 7-character password', async () => {
    const user = await open();
    await user.type(pw(), '1234567');
    await user.type(confirm(), '1234567');
    expect(submit()).toBeDisabled();
    await user.type(pw(), '8');
    await user.type(confirm(), '8');
    expect(submit()).toBeEnabled();
  });

  it('Show passwords switches both fields to text', async () => {
    const user = await open();
    await user.click(screen.getByLabelText('Show passwords'));
    expect(pw()).toHaveAttribute('type', 'text');
    expect(confirm()).toHaveAttribute('type', 'text');
  });

  it('saves an encrypted copy, then shows Done focused; the password is in no store and gone after close', async () => {
    const user = await open();
    await user.type(pw(), SECRET);
    await user.type(confirm(), SECRET);
    await user.click(submit());
    expect(await screen.findByRole('heading', {name: 'Protected copy is ready'})).toBeVisible();
    expect(platform.saveAs).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      'Report — protected.pdf',
      'pdf',
    );
    await waitFor(() => expect(screen.getByRole('button', {name: 'Done'})).toHaveFocus()); // focus moves in an effect after the heading renders
    // real engine output: encrypted, unreadable without the password
    expect(new TextDecoder('latin1').decode(saved[0])).toContain('/Encrypt');
    await expect(PDFDocument.load(saved[0]!)).rejects.toThrow();
    const everything = JSON.stringify([
      useApp.getState(),
      documentStore.getState(),
      mergeStore.getState(),
      useDialogs.getState(),
    ]);
    expect(everything).not.toContain(SECRET);
    await user.click(screen.getByRole('button', {name: 'Done'}));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener()).toHaveFocus();
    act(() => showPasswordDialog({name: 'Report.pdf', bytes: await_bytes}));
    expect(pw()).toHaveValue('');
    expect(busy()).toBe(false);
  });

  it('a cancelled Save as keeps the form open with the password', async () => {
    vi.mocked(platform.saveAs).mockResolvedValue(null);
    const user = await open();
    await user.type(pw(), SECRET);
    await user.type(confirm(), SECRET);
    await user.click(submit());
    await waitFor(() => expect(submit()).toBeEnabled());
    expect(screen.queryByRole('heading', {name: /ready$/})).toBeNull();
    expect(pw()).toHaveValue(SECRET);
  });

  it('a protect failure shows the error and re-enables submit', async () => {
    await_bytes = new Uint8Array([1, 2, 3]); // not a PDF
    const user = await open();
    await user.type(pw(), SECRET);
    await user.type(confirm(), SECRET);
    await user.click(submit());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not protect this PDF. Try a different unlocked PDF.',
    );
    expect(submit()).toBeEnabled();
  });

  it('Esc closes and returns focus to the opener', async () => {
    await open();
    document.querySelector('dialog')!.dispatchEvent(new Event('cancel', {cancelable: true}));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(opener()).toHaveFocus();
  });
});
