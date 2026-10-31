import {afterEach, describe, expect, it, vi} from 'vitest';
import {withViewTransition} from './viewTransition';

const reduced = (matches: boolean) => vi.stubGlobal('matchMedia', vi.fn(() => ({matches})));
const supported = () => {
  // A superseded transition rejects ready/finished with AbortError; real ones always carry both promises.
  const aborted = () => Promise.reject(new DOMException('skipped', 'AbortError'));
  const skipTransition = vi.fn();
  const start = vi.fn((cb: () => void) => { cb(); return {ready: aborted(), finished: aborted(), skipTransition} });
  Object.defineProperty(document, 'startViewTransition', {value: start, configurable: true});
  return Object.assign(start, {skipTransition});
};

afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition');
  vi.unstubAllGlobals();
});

describe('withViewTransition', () => {
  it('runs the update synchronously when startViewTransition is unsupported', () => {
    const update = vi.fn();
    withViewTransition(update);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('wraps the update in a view transition when supported', () => {
    reduced(false);
    const start = supported();
    const update = vi.fn();
    withViewTransition(update);
    expect(start).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('swallows the AbortError of a transition that a newer one superseded', async () => {
    reduced(false);
    supported();
    withViewTransition(vi.fn());
    await new Promise((r) => setTimeout(r, 0)); // vitest fails the run on an unhandled rejection
  });

  it.each(['pointermove', 'pointerdown'])('ends the transition on %s so the click lands on the live page', (type) => {
    reduced(false);
    const start = supported();
    withViewTransition(vi.fn());
    document.dispatchEvent(new Event(type));
    expect(start.skipTransition).toHaveBeenCalledTimes(1);
  });

  it('never starts a transition under reduced motion, and still runs the update', () => {
    reduced(true);
    const start = supported();
    const update = vi.fn();
    withViewTransition(update);
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('runs the update directly when matchMedia is missing', () => {
    const start = supported();
    const update = vi.fn();
    withViewTransition(update);
    expect(start).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledTimes(1);
  });
});
