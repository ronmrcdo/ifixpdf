import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import {createRef} from 'react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {deleteSignature, listSignatures, saveSignature} from '../../../storage/signatures';
import {SignMenu} from './SignMenu';
import {useTool} from './tool';

const A = 'data:image/png;base64,QQ==';
const B = 'data:image/png;base64,Qg==';
vi.mock('../../../storage/signatures', () => ({
  listSignatures: vi.fn(),
  saveSignature: vi.fn(),
  deleteSignature: vi.fn(),
}));
const onClose = vi.fn();
// jsdom has no canvas: all-ink pixels, and `png` out.
const mockCanvas = (png: string) => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    drawImage() {},
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4).fill(255),
    }),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(png);
};
const trigger = createRef<HTMLButtonElement>();
const Host = ({open = true}: {open?: boolean}) => (
  <>
    <button type="button" ref={trigger}>
      Sign
    </button>
    <SignMenu open={open} trigger={trigger} onClose={onClose} />
    <button type="button">Elsewhere</button>
  </>
);
const setup = (open = true) => render(<Host open={open} />);

beforeEach(() => {
  vi.mocked(listSignatures).mockResolvedValue([
    {id: 'b', png: B, createdAt: 2},
    {id: 'a', png: A, createdAt: 1},
  ]);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(deleteSignature).mockReset();
  vi.mocked(saveSignature).mockReset();
  onClose.mockReset();
  useTool.setState({tool: null, signature: null, selected: null});
});

describe('SignMenu', () => {
  it('lists the saved signatures, newest first, then Add signature', async () => {
    setup();
    const menu = screen.getByRole('menu', {name: 'Sign'});
    await waitFor(() =>
      expect(screen.getAllByRole('menuitem', {name: /^Signature/})).toHaveLength(2),
    );
    expect(
      screen.getAllByRole('menuitem').map((i) => i.getAttribute('aria-label') ?? i.textContent),
    ).toEqual([
      'Signature 1',
      'Delete signature',
      'Signature 2',
      'Delete signature',
      'Add signature',
    ]);
    expect(menu.querySelector('img')).toHaveAttribute('src', B);
  });

  it('choosing one sets the signature and the sign tool, and closes', async () => {
    setup();
    await userEvent.click(await screen.findByRole('menuitem', {name: 'Signature 2'}));
    expect(useTool.getState()).toMatchObject({signature: A, tool: 'sign'});
    expect(onClose).toHaveBeenCalled();
  });

  it('Delete calls deleteSignature and removes the row', async () => {
    const del = vi.mocked(deleteSignature).mockResolvedValue();
    setup();
    await screen.findByRole('menuitem', {name: 'Signature 2'});
    await userEvent.click(screen.getAllByRole('menuitem', {name: 'Delete signature'})[0]!);
    expect(del).toHaveBeenCalledWith('b');
    await waitFor(() =>
      expect(screen.getAllByRole('menuitem', {name: /^Signature/})).toHaveLength(1),
    );
    expect(
      screen.getByRole('menuitem', {name: 'Signature 1'}).querySelector('img'),
    ).toHaveAttribute('src', A);
    expect(useTool.getState().tool).toBeNull();
  });

  it('a failed delete keeps the row', async () => {
    vi.mocked(deleteSignature).mockRejectedValue(new Error('blocked'));
    setup();
    await screen.findByRole('menuitem', {name: 'Signature 2'});
    await userEvent.click(screen.getAllByRole('menuitem', {name: 'Delete signature'})[0]!);
    expect(screen.getAllByRole('menuitem', {name: /^Signature/})).toHaveLength(2);
  });

  it('Escape closes and returns focus to the trigger; closed renders no menu', async () => {
    const {rerender} = setup();
    await screen.findByRole('menuitem', {name: 'Signature 1'});
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledWith(true);
    rerender(<Host open={false} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('a pointerdown outside closes without moving focus; on the menu or its trigger it does not', async () => {
    setup();
    await screen.findByRole('menuitem', {name: 'Signature 1'});
    fireEvent.pointerDown(screen.getByRole('menuitem', {name: 'Add signature'}));
    fireEvent.pointerDown(trigger.current!);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole('button', {name: 'Elsewhere'}));
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it('focus leaving the menu closes it without moving focus; focus inside it does not', async () => {
    setup();
    await screen.findByRole('menuitem', {name: 'Signature 1'});
    await userEvent.keyboard('{ArrowDown}');
    expect(onClose).not.toHaveBeenCalled();
    screen.getByRole('button', {name: 'Elsewhere'}).focus();
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it('Add signature opens the dialog; Use remembers it and picks it', async () => {
    const png = 'data:image/png;base64,Uw==';
    const save = vi.mocked(saveSignature).mockResolvedValue({id: 's', png, createdAt: 3});
    mockCanvas(png);
    const {rerender} = setup();
    await userEvent.click(screen.getByRole('menuitem', {name: 'Add signature'}));
    expect(onClose).toHaveBeenCalled();
    rerender(<Host open={false} />); // the strip closes the menu
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    const pad = screen.getByLabelText('Draw your signature');
    await userEvent.pointer({keys: '[MouseLeft]', target: pad});
    await userEvent.click(screen.getByRole('button', {name: 'Use signature'}));
    expect(save).toHaveBeenCalledWith(png);
    expect(useTool.getState()).toMatchObject({signature: png, tool: 'sign'});
    expect(screen.queryByRole('heading', {name: 'Create signature'})).not.toBeInTheDocument();
  });

  it('a failed save still picks the signature for this session', async () => {
    vi.mocked(saveSignature).mockRejectedValue(new Error('quota'));
    mockCanvas(A);
    setup();
    await userEvent.click(screen.getByRole('menuitem', {name: 'Add signature'}));
    await userEvent.pointer({
      keys: '[MouseLeft]',
      target: screen.getByLabelText('Draw your signature'),
    });
    await userEvent.click(screen.getByRole('button', {name: 'Use signature'}));
    expect(useTool.getState()).toMatchObject({signature: A, tool: 'sign'});
  });
});
