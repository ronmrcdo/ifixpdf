type Dir = 1 | -1;
export interface WheelFlipOptions {
  /** Events closer than this (ms) are one gesture. */
  gap: 250;
  onFlip(dir: Dir, landOnBottom: boolean): void;
  onZoom(dir: Dir): void;
  /** Whether the stage can still scroll in `dir`. */
  canScroll(dir: Dir): boolean;
}

const ZOOM_STEP = 50; // one mouse notch is one step; small pinch deltas add up

/**
 * One wheel gesture either scrolls the zoomed page or flips one page, never both; Ctrl+wheel zooms.
 * The state lives in this closure, so inertia that spans a re-render can't flip twice.
 */
export function createWheelFlip({
  gap,
  onFlip,
  onZoom,
  canScroll,
}: WheelFlipOptions): (e: WheelEvent) => void {
  let gestureAt = -Infinity;
  let gestureDone = false;
  let zoomAt = -Infinity;
  let zoomDelta = 0;
  return (e) => {
    if (!e.deltaY) return;
    const dir: Dir = e.deltaY > 0 ? 1 : -1;
    const now = performance.now();
    if (e.ctrlKey) {
      e.preventDefault();
      if (now - zoomAt > gap || Math.sign(zoomDelta) !== dir) zoomDelta = 0;
      zoomAt = now;
      zoomDelta += e.deltaY;
      if (Math.abs(zoomDelta) < ZOOM_STEP) return;
      zoomDelta = 0;
      return onZoom(dir === 1 ? -1 : 1);
    }
    if (now - gestureAt > gap) gestureDone = false;
    gestureAt = now;
    if (canScroll(dir)) {
      gestureDone = true;
      return;
    }
    e.preventDefault();
    if (gestureDone) return;
    gestureDone = true;
    onFlip(dir, dir === -1);
  };
}
