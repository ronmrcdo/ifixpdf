import {type FocusEvent, type RefObject, useEffect} from 'react';

/**
 * Dismisses an open menu on a pointerdown, or a focus move, outside both the menu and its trigger
 * (the trigger toggles the menu itself). Returns the menu's onBlur handler.
 */
export function useDismiss(
  open: boolean,
  menu: RefObject<HTMLElement | null>,
  trigger: RefObject<HTMLElement | null>,
  onDismiss: () => void,
): (e: FocusEvent) => void {
  const outside = (t: EventTarget | null): boolean =>
    t instanceof Node && !menu.current?.contains(t) && !trigger.current?.contains(t);
  // Re-subscribes each render while open (the callbacks are inline); cheap for one listener.
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (outside(e.target)) onDismiss();
    };
    // Capture: item handlers stop pointerdown propagation.
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  });
  // A null relatedTarget (focus to nowhere, a click on the page) is left to the pointerdown.
  return (e) => {
    if (outside(e.relatedTarget)) onDismiss();
  };
}
