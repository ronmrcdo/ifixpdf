import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, describe, expect, it} from 'vitest';
import {ToolStrip} from './ToolStrip';
import {useTool} from './tool';

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
    await userEvent.click(screen.getByRole('button', {name: 'Sign'}));
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
});
