export type Zoom = number | 'fit';
type Size = {w: number; h: number};

/** Zoom in percent after one step. From Fit it starts at the actual zoom; like the legacy app, every step snaps to the 10s. */
export function stepZoom(current: Zoom, actual: number, dir: 1 | -1): number {
  const from = current === 'fit' ? actual : current;
  return Math.min(200, Math.max(25, Math.round(from / 10) * 10 + 10 * dir));
}

/** Scale that fits `page` (CSS px at scale 1) inside `stage` less its total horizontal/vertical padding. */
export function fitScale(stage: Size, page: Size, padding: {x: number; y: number}): number {
  // a stage squeezed below its padding would give a negative scale
  return Math.max(0.01, Math.min((stage.w - padding.x) / page.w, (stage.h - padding.y) / page.h));
}
