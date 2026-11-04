import {act, fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {TextPopup} from './TextPopup';

const setup = () =>
  render(
    <>
      <TextPopup
        size={12}
        font="helvetica"
        style={{}}
        onSize={vi.fn()}
        bold={false}
        onFont={vi.fn()}
        onBold={vi.fn()}
        onDelete={vi.fn()}
      />
      <button type="button">Elsewhere</button>
    </>,
  );
const more = () => screen.getByRole('button', {name: 'Font'});
const open = async () => {
  await userEvent.click(more());
  expect(screen.getByRole('menuitemradio', {name: 'Arial (Helvetica)'})).toHaveFocus();
};

describe('TextPopup Font menu', () => {
  it('Escape closes it and returns focus to Font', async () => {
    setup();
    await open();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(more()).toHaveFocus();
  });

  it('a pointerdown outside closes it without moving focus; on Font or the menu it does not', async () => {
    setup();
    await open();
    fireEvent.pointerDown(screen.getByRole('menuitemradio', {name: 'Times'}));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.click(more()); // the toggle closes it, not the dismiss then a reopen
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await open();
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Elsewhere'}));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('focus leaving the menu closes it', async () => {
    setup();
    await open();
    act(() => screen.getByRole('button', {name: 'Elsewhere'}).focus());
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Elsewhere'})).toHaveFocus();
  });
});
