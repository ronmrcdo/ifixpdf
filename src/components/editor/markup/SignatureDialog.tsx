import {type PointerEvent, useRef, useState} from 'react';
import {Dialog} from '../../Dialog';
import '../../../styles/editor-markup.css';

interface Props {
  open: boolean;
  onClose(): void;
  onUse(png: string, remember: boolean): void;
}
type Mode = 'draw' | 'import';

const MODES: [Mode, string][] = [
  ['draw', 'Draw'],
  ['import', 'Import image'],
];
const ERROR = 'Choose a PNG or JPEG image under 5 MB.';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_WIDTH = 1200;
const PAD = 4;
const WHITE = 240; // imported pixels lighter than this on every channel are paper, not ink

/** The canvas cropped to its non-transparent pixels plus 4 px, as a PNG data URL. */
function cropToInk(src: HTMLCanvasElement): string {
  const {width, height} = src;
  const data = src.getContext('2d')?.getImageData(0, 0, width, height).data;
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (!data?.[(y * width + x) * 4 + 3]) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  if (x1 < 0) return src.toDataURL('image/png'); // no ink: keep it whole
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1 + 2 * PAD;
  out.height = y1 - y0 + 1 + 2 * PAD;
  out.getContext('2d')?.drawImage(src, PAD - x0, PAD - y0);
  return out.toDataURL('image/png');
}

/** Decodes an image file into a canvas (max 1200 px wide), whites made transparent, cropped. */
async function importPng(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_WIDTH / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4)
    if (Math.min(d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0) > WHITE) d[i + 3] = 0;
  ctx.putImageData(image, 0, 0);
  return cropToInk(canvas);
}

/** Create signature: draw on a pad or import an image; both come out as a cropped PNG. */
export function SignatureDialog({open, onClose, onUse}: Props) {
  return (
    <Dialog title="Create signature" open={open} onClose={onClose}>
      <SignatureForm onClose={onClose} onUse={onUse} />
    </Dialog>
  );
}

// Mounted only while the dialog is open, so each opening starts blank.
function SignatureForm({onClose, onUse}: Omit<Props, 'open'>) {
  const [mode, setMode] = useState<Mode>('draw');
  const [drawn, setDrawn] = useState(false);
  const [imported, setImported] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(true);
  const pad = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const point = (e: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * c.width) / (r.width || c.width),
      ((e.clientY - r.top) * c.height) / (r.height || c.height),
    ];
  };
  const onDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    ctx.strokeStyle =
      getComputedStyle(e.currentTarget).getPropertyValue('--brand').trim() || '#111827';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(...point(e));
    ctx.lineTo(...point(e)); // a click leaves a dot
    ctx.stroke();
    setDrawn(true);
  };
  const onMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext('2d');
    if (!drawing.current || !ctx) return;
    ctx.lineTo(...point(e));
    ctx.stroke();
  };
  const clear = () => {
    const c = pad.current;
    c?.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    setDrawn(false);
  };
  const onFile = async (file: File | undefined) => {
    setImported(null);
    setError('');
    if (!file) return;
    if (file.size > MAX_BYTES || !/^image\/(png|jpeg)$/.test(file.type)) return setError(ERROR);
    try {
      setImported(await importPng(file));
    } catch {
      setError(ERROR);
    }
  };
  const use = () => {
    const png = mode === 'draw' && pad.current ? cropToInk(pad.current) : imported;
    if (png) onUse(png, remember);
  };
  const ready = mode === 'draw' ? drawn : imported !== null;

  return (
    <div className="signature-form">
      <div className="segmented" role="group" aria-label="Signature source">
        {MODES.map(([m, label]) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
            {label}
          </button>
        ))}
      </div>
      {/* both stay mounted, so switching keeps the drawing */}
      <div className="signature-pad" hidden={mode !== 'draw'}>
        <canvas
          ref={pad}
          width={480}
          height={160}
          aria-label="Draw your signature"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={() => {
            drawing.current = false;
          }}
          onPointerCancel={() => {
            drawing.current = false;
          }}
        />
        <button type="button" className="secondary" onClick={clear}>
          Clear
        </button>
      </div>
      <div className="signature-import" hidden={mode !== 'import'}>
        <input
          type="file"
          accept="image/png,image/jpeg"
          aria-label="Signature image"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        {imported && <img src={imported} alt="Imported signature" />}
      </div>
      <p className="action-error" role="alert">
        {error}
      </p>
      <label className="check">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>Remember this signature on this device</span>
      </label>
      <footer>
        <button type="button" className="secondary" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={!ready} onClick={use}>
          Use signature
        </button>
      </footer>
    </div>
  );
}
