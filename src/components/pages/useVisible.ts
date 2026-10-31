import {useEffect, useState, type RefObject} from 'react';

/** True once the element comes within 200px of view, and stays true after (a seen thumbnail is kept). */
export function useVisible(ref: RefObject<Element | null>): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (visible || !el) return;
    // Cards scroll inside the stage; with the viewport as root the margin would stop at the stage's clip.
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      {root: el.closest('.paper-stage'), rootMargin: '200px'},
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, visible]);
  return visible;
}
