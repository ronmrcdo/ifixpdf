import {flushSync} from 'react-dom';

let running: ViewTransition | undefined;
// While a transition runs the browser hit-tests the snapshot, not the page, so any click would be lost.
// Ending it on the first pointer input makes the live page clickable again before the click lands.
// shortcut: a touch/pen tap, or a mouse that does not move, during the 180 ms fade can still be lost.
const endOnInput = () => running?.skipTransition();
for (const type of ['pointermove', 'pointerdown'])
  document.addEventListener(type, endOnInput, {capture: true, passive: true});

/** True from when a view transition starts until it finishes (its update may not have run yet). */
export const isTransitioning = () => running !== undefined;

/** True when the user asked for no motion (also when matchMedia is missing). */
export const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;

/** Cross-fades a view change where the browser supports it; reduced motion (or no support) updates at once. */
export function withViewTransition(update: () => void): void {
  if (!document.startViewTransition || prefersReducedMotion()) return update();
  const t = document.startViewTransition(() => flushSync(update));
  running = t;
  // A newer transition skips this one and rejects both promises; nobody awaits them.
  t.ready.catch(() => {});
  t.finished
    .catch(() => {})
    .finally(() => {
      if (running === t) running = undefined;
    });
}
