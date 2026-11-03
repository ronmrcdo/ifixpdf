import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {ToolStrip} from './ToolStrip';
import {useTool} from './tool';

vi.mock('../../../storage/signatures', () => ({
  listSignatures: vi.fn(async () => []),
  saveSignature: vi.fn(),
  deleteSignature: vi.fn(),
}));

afterEach(() => useTool.setState({tool: null, signature: null, selected: null}));

describe('ToolStrip', () => {
  it('toggles a tool on and off', async () => {
    render(<ToolStrip />);
    const check = screen.getByRole('button', {name: 'Add check'});
    expect(check).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(check);
    expect(useTool.getState().tool).toBe('check');
    expect(check).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(check);
    expect(useTool.getState().tool).toBeNull();
    expect(check).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches tools and exposes all six', async () => {
    render(<ToolStrip />);
    expect(screen.getByRole('toolbar', {name: 'Fill and sign tools'})).toBeInTheDocument();
    for (const n of ['Add text', 'Add cross', 'Add dot', 'Sign', 'Redact'])
      expect(screen.getByRole('button', {name: n})).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Add dot'}));
    await userEvent.click(screen.getByRole('button', {name: 'Redact'}));
    expect(useTool.getState().tool).toBe('redact');
  });

  it('moves focus with arrow keys, wrapping, and Home/End', async () => {
    render(<ToolStrip />);
    screen.getByRole('button', {name: 'Add text'}).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', {name: 'Add cross'})).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('button', {name: 'Redact'})).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('button', {name: 'Add text'})).toHaveFocus();
    await userEvent.keyboard('{End}');
    expect(screen.getByRole('button', {name: 'Redact'})).toHaveFocus();
  });

  it('keeps one tab stop that follows the arrow keys', async () => {
    render(<ToolStrip />);
    const stops = () =>
      screen
        .getAllByRole('button')
        .filter((b) => b.tabIndex === 0)
        .map((b) => b.ariaLabel);
    expect(stops()).toEqual(['Add text']);
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(stops()).toEqual(['Add check']);
    await userEvent.tab({shift: true});
    await userEvent.tab();
    expect(screen.getByRole('button', {name: 'Add check'})).toHaveFocus();
  });

  it('Sign opens the Sign menu; Escape closes it and returns focus to Sign', async () => {
    render(<ToolStrip />);
    const sign = screen.getByRole('button', {name: 'Sign'});
    expect(sign).toHaveAttribute('aria-haspopup', 'menu');
    expect(sign).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(sign);
    expect(sign).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', {name: 'Add signature'})).toHaveFocus();
    expect(useTool.getState().tool).toBeNull();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('menuitem', {name: 'Add signature'})).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(sign).toHaveFocus();
    await userEvent.click(sign);
    await userEvent.click(sign);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
