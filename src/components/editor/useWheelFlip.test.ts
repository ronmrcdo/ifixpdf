import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createWheelFlip} from './useWheelFlip';

function setup(scrollable = false) {
  const onFlip = vi.fn();
  const onZoom = vi.fn();
  const canScroll = vi.fn(() => scrollable);
  const wheel = createWheelFlip({gap: 250, onFlip, onZoom, canScroll});
  const fire = (deltaY: number, ctrlKey = false) => {
    const e = new WheelEvent('wheel', {deltaY, ctrlKey, cancelable: true});
    wheel(e);
    return e;
  };
  return {onFlip, onZoom, canScroll, fire};
}

beforeEach(() => { vi.useFakeTimers() });
afterEach(() => { vi.useRealTimers() });

describe('createWheelFlip: flipping', () => {
  it('10 events 20 ms apart are one gesture and flip once', () => {
    const w = setup();
    for (let i = 0; i < 10; i++) { w.fire(40); vi.advanceTimersByTime(20) }
    expect(w.onFlip).toHaveBeenCalledTimes(1);
    expect(w.onFlip).toHaveBeenCalledWith(1, false);
  });
  it('a gesture that keeps going past 250 ms in total is still one flip', () => {
    const w = setup();
    for (let i = 0; i < 20; i++) { w.fire(30); vi.advanceTimersByTime(40) }
    expect(w.onFlip).toHaveBeenCalledTimes(1);
  });
  it('events separated by 300 ms of silence are two gestures and flip twice', () => {
    const w = setup();
    w.fire(40); vi.advanceTimersByTime(20); w.fire(40);
    vi.advanceTimersByTime(300);
    w.fire(40);
    expect(w.onFlip).toHaveBeenCalledTimes(2);
  });
  it('a backward flip lands on the bottom', () => {
    const w = setup();
    const e = w.fire(-100);
    expect(w.onFlip).toHaveBeenCalledWith(-1, true);
    expect(e.defaultPrevented).toBe(true);
  });
  it('ignores events with no vertical delta', () => {
    const w = setup();
    const e = w.fire(0);
    expect(w.onFlip).not.toHaveBeenCalled();
    expect(w.canScroll).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });
});

describe('createWheelFlip: scrolling', () => {
  it('when the page can scroll it scrolls natively and never flips', () => {
    const w = setup(true);
    const e = w.fire(100);
    for (let i = 0; i < 5; i++) { vi.advanceTimersByTime(20); w.fire(100) }
    expect(w.onFlip).not.toHaveBeenCalled();
    expect(w.canScroll).toHaveBeenCalledWith(1);
    expect(e.defaultPrevented).toBe(false);
  });
  it('a gesture that reaches the edge while scrolling does not also flip', () => {
    let scrollable = true;
    const onFlip = vi.fn();
    const wheel = createWheelFlip({gap: 250, onFlip, onZoom: vi.fn(), canScroll: () => scrollable});
    const fire = () => wheel(new WheelEvent('wheel', {deltaY: 50, cancelable: true}));
    fire(); vi.advanceTimersByTime(20);
    scrollable = false;
    for (let i = 0; i < 5; i++) { fire(); vi.advanceTimersByTime(20) }
    expect(onFlip).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    fire();
    expect(onFlip).toHaveBeenCalledTimes(1);
  });
});

describe('createWheelFlip: Ctrl+wheel zoom', () => {
  it('deltas of 20, 20, 20 add up to one zoom step, and never flip', () => {
    const w = setup();
    const events = [w.fire(-20, true), w.fire(-20, true), w.fire(-20, true)];
    expect(w.onZoom).toHaveBeenCalledTimes(1);
    expect(w.onZoom).toHaveBeenCalledWith(1);
    expect(w.onFlip).not.toHaveBeenCalled();
    expect(events.every((e) => e.defaultPrevented)).toBe(true);
  });
  it('wheel down zooms out', () => {
    const w = setup();
    w.fire(100, true);
    expect(w.onZoom).toHaveBeenCalledWith(-1);
  });
  it('a direction change resets the accumulator', () => {
    const w = setup();
    w.fire(-40, true);
    w.fire(20, true);
    w.fire(20, true);
    expect(w.onZoom).not.toHaveBeenCalled();
    w.fire(20, true);
    expect(w.onZoom).toHaveBeenCalledWith(-1);
  });
  it('250 ms idle resets the accumulator', () => {
    const w = setup();
    w.fire(-40, true);
    vi.advanceTimersByTime(260);
    w.fire(-40, true);
    expect(w.onZoom).not.toHaveBeenCalled();
  });
  it('the accumulator restarts after a step', () => {
    const w = setup();
    w.fire(-60, true);
    w.fire(-40, true);
    expect(w.onZoom).toHaveBeenCalledTimes(1);
    w.fire(-10, true);
    expect(w.onZoom).toHaveBeenCalledTimes(2);
  });
  it('prevents browser zoom even while the page could scroll', () => {
    const w = setup(true);
    expect(w.fire(-10, true).defaultPrevented).toBe(true);
    expect(w.canScroll).not.toHaveBeenCalled();
  });
});
