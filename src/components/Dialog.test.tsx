import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {useState} from 'react';
import {describe, expect, it} from 'vitest';
import {Dialog} from './Dialog';

function Host() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Opener</button>
      <Dialog title="Hello" open={open} onClose={() => setOpen(false)}><input aria-label="inside" /></Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('opens modally with its title, closes on Esc and returns focus to the opener', async () => {
    const user = userEvent.setup();
    const {container} = render(<Host />);
    expect(container.querySelector('dialog')).not.toHaveAttribute('open');
    await user.click(screen.getByRole('button', {name: 'Opener'}));
    expect(screen.getByRole('dialog', {name: 'Hello'})).toBeVisible();
    container.querySelector('dialog')!.dispatchEvent(new Event('cancel', {cancelable: true})); // what Esc fires
    await screen.findByRole('button', {name: 'Opener'});
    expect(container.querySelector('dialog')).not.toHaveAttribute('open');
    expect(screen.getByRole('button', {name: 'Opener'})).toHaveFocus();
  });

  it('the Close button closes it and returns focus', async () => {
    const user = userEvent.setup();
    render(<Host />);
    await user.click(screen.getByRole('button', {name: 'Opener'}));
    await user.click(screen.getByRole('button', {name: 'Close'}));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', {name: 'Opener'})).toHaveFocus();
  });
});
