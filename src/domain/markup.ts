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

export const hasRedaction = (p: {markup?: readonly Markup[]}): boolean =>
  !!p.markup?.some((m) => m.kind === 'redact');

export const hasMarkup = (
  pages: ReadonlyArray<{markup?: readonly Markup[]}>,
  fills?: Fills,
): boolean =>
  pages.some((p) => p.markup?.length) ||
  Object.values(fills ?? {}).some((f) => Object.keys(f).length > 0);
