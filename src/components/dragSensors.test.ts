import {TouchSensor} from '@dnd-kit/core';
import {describe, expect, it, vi} from 'vitest';
import {DRAG_SENSORS, NonTouchPointerSensor} from './dragSensors';

const activate = (init: Partial<PointerEvent>) => {
  const onActivation = vi.fn();
  const handled = NonTouchPointerSensor.activators[0]!.handler(
    {nativeEvent: {isPrimary: true, button: 0, ...init}} as never,
    {onActivation} as never,
  );
  return {handled, onActivation};
};

describe('NonTouchPointerSensor', () => {
  it('starts a drag from a mouse or pen press', () => {
    for (const pointerType of ['mouse', 'pen']) {
      const {handled, onActivation} = activate({pointerType});
      expect(handled).toBe(true);
      expect(onActivation).toHaveBeenCalledOnce();
    }
  });

  it('leaves touch to the TouchSensor, so a swipe still scrolls', () => {
    const {handled, onActivation} = activate({pointerType: 'touch'});
    expect(handled).toBe(false);
    expect(onActivation).not.toHaveBeenCalled();
  });

  it('ignores secondary buttons and non-primary pointers', () => {
    expect(activate({pointerType: 'mouse', button: 2}).handled).toBe(false);
    expect(activate({pointerType: 'pen', isPrimary: false}).handled).toBe(false);
  });
});

describe('DRAG_SENSORS', () => {
  it('drags a pointer after 4px and a touch after a 250ms press-and-hold', () => {
    const [pointer, touch] = DRAG_SENSORS;
    expect(pointer).toEqual({
      sensor: NonTouchPointerSensor,
      options: {activationConstraint: {distance: 4}},
    });
    expect(touch).toEqual({
      sensor: TouchSensor,
      options: {activationConstraint: {delay: 250, tolerance: 5}},
    });
  });
});
