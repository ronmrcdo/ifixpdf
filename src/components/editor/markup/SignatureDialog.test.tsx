import {fireEvent, render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {SignatureDialog} from './SignatureDialog';

const PNG = 'data:image/png;base64,AAAA';
// jsdom has no canvas: a 2D context whose pixels are all ink, and a fixed PNG out.
const ctx = {
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  putImageData: vi.fn(),
  getImageData: (_x: number, _y: number, w: number, h: number) => ({
    width: w,
    height: h,
    data: new Uint8ClampedArray(w * h * 4).fill(255),
  }),
};

const onUse = vi.fn();
const onClose = vi.fn();
const setup = () => render(<SignatureDialog open onClose={onClose} onUse={onUse} />);
const use = () => screen.getByRole('button', {name: 'Use signature'});
const stroke = () => {
  const pad = screen.getByLabelText('Draw your signature');
  fireEvent.pointerDown(pad, {clientX: 10, clientY: 10, pointerId: 1});
  fireEvent.pointerMove(pad, {clientX: 60, clientY: 40, pointerId: 1});
  fireEvent.pointerUp(pad, {clientX: 60, clientY: 40, pointerId: 1});
};

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(PNG);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  onUse.mockReset();
});

describe('SignatureDialog draw', () => {
  it('Use is disabled until a stroke; Clear disables it again', async () => {
    setup();
    expect(screen.getByRole('heading', {name: 'Create signature'})).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'Draw'})).toHaveAttribute('aria-pressed', 'true');
    expect(use()).toBeDisabled();
    stroke();
    expect(use()).toBeEnabled();
    await userEvent.click(screen.getByRole('button', {name: 'Clear'}));
    expect(use()).toBeDisabled();
  });

  it('Use passes a PNG data URL and remember false: unchecked by default', async () => {
    setup();
    stroke();
    expect(
      screen.getByRole('checkbox', {name: 'Remember this signature on this device'}),
    ).not.toBeChecked();
    await userEvent.click(use());
    expect(onUse).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png/), false);
  });

  it('checking Remember passes true', async () => {
    setup();
    stroke();
    await userEvent.click(
      screen.getByRole('checkbox', {name: 'Remember this signature on this device'}),
    );
    await userEvent.click(use());
    expect(onUse).toHaveBeenCalledWith(PNG, true);
  });

  it('crops to the ink plus 4 px', async () => {
    setup();
    // ink only at (10, 20) on the 480 × 160 pad
    vi.spyOn(ctx, 'getImageData').mockImplementation((_x, _y, w, h) => {
      const data = new Uint8ClampedArray(w * h * 4);
      data[(20 * w + 10) * 4 + 3] = 255;
      return {width: w, height: h, data};
    });
    stroke();
    await userEvent.click(use());
    const out = vi
      .mocked(HTMLCanvasElement.prototype.toDataURL)
      .mock.contexts.at(-1) as HTMLCanvasElement;
    expect([out.width, out.height]).toEqual([9, 9]);
    expect(ctx.drawImage).toHaveBeenLastCalledWith(expect.anything(), -6, -16);
  });

  it('Cancel closes without using', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', {name: 'Cancel'}));
    expect(onClose).toHaveBeenCalled();
    expect(onUse).not.toHaveBeenCalled();
  });
});

describe('SignatureDialog import', () => {
  const ERROR = 'Choose a PNG or JPEG image under 5 MB.';
  const pick = async (file: File) => {
    await userEvent.click(screen.getByRole('button', {name: 'Import image'}));
    const input = screen.getByLabelText('Signature image');
    expect(input).toHaveAttribute('accept', 'image/png,image/jpeg');
    await userEvent.upload(input, file);
  };

  it('a file over 5 MB shows the error and Use stays disabled, without decoding', async () => {
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    setup();
    await pick(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', {type: 'image/png'}));
    expect(screen.getByRole('alert')).toHaveTextContent(ERROR);
    expect(use()).toBeDisabled();
    expect(decode).not.toHaveBeenCalled();
  });

  it('a file that fails to decode shows the error', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad')));
    setup();
    await pick(new File(['x'], 'a.png', {type: 'image/png'}));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(ERROR));
    expect(use()).toBeDisabled();
  });

  it('decodes, scales to 1200 px wide, re-encodes, and Use passes the PNG', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({width: 2400, height: 600, close}),
    );
    setup();
    await pick(new File(['x'], 'a.jpg', {type: 'image/jpeg'}));
    await waitFor(() => expect(use()).toBeEnabled());
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1200, 300);
    expect(close).toHaveBeenCalled();
    expect(screen.getByRole('img', {name: 'Imported signature'})).toHaveAttribute('src', PNG);
    await userEvent.click(use());
    expect(onUse).toHaveBeenCalledWith(PNG, false);
  });
});
