import {act, fireEvent, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe, expect, it, vi} from 'vitest';
import {TextPopup} from './TextPopup';

const setup = () =>
  render(
    <>
      <TextPopup size={12} style={{}} onSize={vi.fn()} onDuplicate={vi.fn()} onDelete={vi.fn()} />
      <button type="button">Elsewhere</button>
    </>,
  );
const more = () => screen.getByRole('button', {name: 'More'});
const open = async () => {
  await userEvent.click(more());
  expect(screen.getByRole('menuitem', {name: 'Duplicate'})).toHaveFocus();
};

describe('TextPopup More menu', () => {
  it('Escape closes it and returns focus to More', async () => {
    setup();
    await open();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(more()).toHaveFocus();
  });

  it('a pointerdown outside closes it without moving focus; on More or the menu it does not', async () => {
    setup();
    await open();
    fireEvent.pointerDown(screen.getByRole('menuitem', {name: 'Duplicate'}));
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
