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
export type Markup =
  | (Base & {kind: 'text'; text: string; size: number})
  | (Base & {kind: MarkKind})
  | (Base & {kind: 'signature'; image: string}) // PNG data URL
  | (Base & {kind: 'redact'});
export type FieldValue = string | boolean;
export type Fills = Readonly<Record<FileId, Readonly<Record<string, FieldValue>>>>;

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

/** Moves a rect `by` points right and down on the display at `angle`. */
export function shift(r: Rect, angle: Rotation, by: number): Rect {
  const {right, down} = axes(angle);
  return {...r, x: r.x + (right[0] + down[0]) * by, y: r.y + (right[1] + down[1]) * by};
}

// Mark paths in a w × h box, y down from the display top-left (SVG and pdf-lib drawSvgPath agree).
export const MARK_PATHS = {
  cross: (w: number, h: number) => `M0 0 L${w} ${h} M${w} 0 L0 ${h}`,
  check: (w: number, h: number) => `M0 ${h * 0.55} L${w * 0.4} ${h} L${w} 0`,
};
export const markStroke = (w: number, h: number): number => Math.max(1, Math.min(w, h) / 8);

export const hasRedaction = (p: {markup?: readonly Markup[]}): boolean =>
  !!p.markup?.some((m) => m.kind === 'redact');

export const hasMarkup = (
  pages: ReadonlyArray<{markup?: readonly Markup[]}>,
  fills?: Fills,
): boolean =>
  pages.some((p) => p.markup?.length) ||
  Object.values(fills ?? {}).some((f) => Object.keys(f).length > 0);
