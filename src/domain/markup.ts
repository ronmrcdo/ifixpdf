import type {FileId, Rotation} from './types';

// PDF user space of the source page, unrotated, origin bottom-left, points.
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
// angle = page.rotate + rotation when placed
interface Base {
  id: string;
  rect: Rect;
  angle: Rotation;
}
export type MarkKind = 'cross' | 'check' | 'dot';
export type TextFont = 'helvetica' | 'times' | 'courier';
export type Markup =
  | (Base & {kind: 'text'; text: string; size: number; font?: TextFont; bold?: boolean}) // no font: Helvetica
  | (Base & {kind: MarkKind})
  | (Base & {kind: 'signature'; image: string}) // PNG data URL
  | (Base & {kind: 'redact'});
export type FieldValue = string | boolean;
export type Fills = Readonly<Record<FileId, Readonly<Record<string, FieldValue>>>>;

// The PDF standard fonts text can use, with the CSS that shows them on screen.
// Arial can't be embedded (license); Helvetica has its metrics and viewers show it as Arial.
export const TEXT_FONTS: Readonly<Record<TextFont, {label: string; css: string}>> = {
  helvetica: {label: 'Arial (Helvetica)', css: 'Helvetica, Arial, sans-serif'},
  times: {label: 'Times', css: '"Times New Roman", Times, serif'},
  courier: {label: 'Courier', css: '"Courier New", Courier, monospace'},
};

export const TEXT_SIZES: readonly number[] = [8, 10, 12, 14, 18, 24, 32];

export function stepSize(size: number, dir: 1 | -1): number {
  const next = dir === 1 ? TEXT_SIZES.find((s) => s > size) : TEXT_SIZES.findLast((s) => s < size);
  return next ?? Math.min(Math.max(size, TEXT_SIZES[0] ?? size), TEXT_SIZES.at(-1) ?? size);
}

// WinAnsi: ASCII printable, Latin-1 upper half, and the CP1252 extras.
const WIN_ANSI = /^[ -~ -ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]$/;

export function unsupportedChars(text: string): string[] {
  const bad = [...text].filter((c) => c !== '\n' && !WIN_ANSI.test(c));
  return [...new Set(bad)];
}

/** Typed text before the WinAnsi check: CRLF/CR to LF, tabs to spaces. */
export const cleanText = (s: string): string => s.replace(/\r\n?/g, '\n').replace(/\t/g, ' ');

export const unsupportedMessage = (bad: readonly string[]): string =>
  bad.length ? `This character isn't supported: ${bad.join(', ')}` : '';

/** CSS box of a PDF rect [x1, y1, x2, y2]; the converted corners can come back flipped under rotation. */
export function viewportBox(
  viewport: {convertToViewportRectangle(rect: number[]): number[]},
  rect: readonly number[],
): {left: number; top: number; width: number; height: number} {
  const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = viewport.convertToViewportRectangle([...rect]);
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

/** Width and height of `r` as shown at `angle`: swapped at 90 and 270. */
export const displaySize = (r: {w: number; h: number}, angle: number): [number, number] =>
  angle % 180 ? [r.h, r.w] : [r.w, r.h];

// Display "right" and "down" unit vectors in unrotated PDF space, for a page shown at `angle`.
export function axes(angle: Rotation): {right: [number, number]; down: [number, number]} {
  const rad = (angle * Math.PI) / 180;
  const c = Math.round(Math.cos(rad));
  const s = Math.round(Math.sin(rad));
  return {right: [c, s], down: [s, -c]};
}

// Unrotated-space corner that shows top-left when the page is displayed at `angle`.
const TOP_LEFT: Record<Rotation, (r: Rect) => [number, number]> = {
  0: (r) => [r.x, r.y + r.h],
  90: (r) => [r.x, r.y],
  180: (r) => [r.x + r.w, r.y],
  270: (r) => [r.x + r.w, r.y + r.h],
};
export const topLeft = (r: Rect, angle: Rotation): [number, number] => TOP_LEFT[angle](r);

/** The rect shown at `angle` with its top-left at `at` and a display size of w × h. */
export function rectAt(
  [x, y]: readonly [number, number],
  angle: Rotation,
  w: number,
  h: number,
): Rect {
  const {right, down} = axes(angle);
  const x1 = x + right[0] * w + down[0] * h;
  const y1 = y + right[1] * w + down[1] * h;
  return {x: Math.min(x, x1), y: Math.min(y, y1), w: Math.abs(x1 - x), h: Math.abs(y1 - y)};
}

// Mark paths in a w × h box, y down from the display top-left (SVG and pdf-lib drawSvgPath agree).
export const MARK_PATHS = {
  cross: (w: number, h: number) => `M0 0 L${w} ${h} M${w} 0 L0 ${h}`,
  check: (w: number, h: number) => `M0 ${h * 0.55} L${w * 0.4} ${h} L${w} 0`,
};
export const markStroke = (w: number, h: number): number => Math.max(1, Math.min(w, h) / 8);

export const hasRedaction = (p: {markup?: readonly Markup[]}): boolean =>
  !!p.markup?.some((m) => m.kind === 'redact');

/** Filled values of the files that still have pages; a removed file's fills don't count. */
export function filledCount(pages: ReadonlyArray<{fileId: FileId}>, fills: Fills = {}): number {
  const live = new Set(pages.map((p) => p.fileId));
  return Object.entries(fills).reduce(
    (n, [id, f]) => n + (live.has(id) ? Object.keys(f).length : 0),
    0,
  );
}

export const hasMarkup = (
  pages: ReadonlyArray<{fileId: FileId; markup?: readonly Markup[]}>,
  fills?: Fills,
): boolean => pages.some((p) => p.markup?.length) || filledCount(pages, fills) > 0;

/** Width and height from a PNG data URL's IHDR; 3:1 (the draw pad) if it can't be read. */
export function pngSize(dataUrl: string): [number, number] {
  try {
    // The first 32 base64 characters decode to the 8-byte signature and the IHDR up to its height.
    const at = dataUrl.indexOf(',') + 1;
    const head = atob(dataUrl.slice(at, at + 32));
    const u32 = (at: number) => [0, 1, 2, 3].reduce((n, i) => n * 256 + head.charCodeAt(at + i), 0);
    const [w, h] = [u32(16), u32(20)];
    if (head.length === 24 && w > 0 && h > 0) return [w, h];
  } catch {
    // not base64
  }
  return [3, 1];
}
