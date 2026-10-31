import {useLayoutEffect, useRef, type RefObject} from 'react';
import {prefersReducedMotion} from '../../shell/viewTransition';

const REORDER = {duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)'} as const;

/** FLIP: when `index` changes, the same node glides from its old slot to the new one. The card that was just dragged is skipped (it was already under the pointer). */
export function useFlip(
  node: RefObject<HTMLElement | null>,
  index: number,
  dragging: boolean,
): void {
  const last = useRef<{index: number; x: number; y: number; dragged: boolean} | null>(null);
  useLayoutEffect(() => {
    const el = node.current;
    if (!el) return;
    const before = last.current;
    last.current = {index, x: el.offsetLeft, y: el.offsetTop, dragged: dragging};
    if (!before || before.index === index || before.dragged || dragging || prefersReducedMotion())
      return;
    const dx = before.x - el.offsetLeft;
    const dy = before.y - el.offsetTop;
    if (dx || dy)
      el.animate([{transform: `translate(${dx}px, ${dy}px)`}, {transform: 'none'}], REORDER);
  });
}
