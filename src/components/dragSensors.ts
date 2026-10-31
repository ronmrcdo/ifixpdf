import {PointerSensor, TouchSensor, type SensorDescriptor, type SensorOptions} from '@dnd-kit/core';
import type {PointerEvent as ReactPointerEvent} from 'react';

/** PointerSensor for mouse and pen only: a touch press must stay free to scroll the page. */
export class NonTouchPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: (
        {nativeEvent: event}: ReactPointerEvent,
        {onActivation}: {onActivation?({event}: {event: Event}): void},
      ) => {
        if (!event.isPrimary || event.button !== 0 || event.pointerType === 'touch') return false;
        onActivation?.({event});
        return true;
      },
    },
  ];
}

/** Mouse and pen drag after 4px; touch drags after a press-and-hold, so a swipe scrolls instead. Pass to useSensors. */
export const DRAG_SENSORS: SensorDescriptor<SensorOptions>[] = [
  {sensor: NonTouchPointerSensor, options: {activationConstraint: {distance: 4}}},
  {sensor: TouchSensor, options: {activationConstraint: {delay: 250, tolerance: 5}}},
];
