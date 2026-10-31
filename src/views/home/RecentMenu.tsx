import {Eye, Files, LockKeyhole, Pencil, Trash2, type LucideIcon} from 'lucide-react';
import {useEffect, useLayoutEffect, useRef} from 'react';
import {createPortal} from 'react-dom';
import {prefersReducedMotion} from '../../shell/viewTransition';

export type Command = 'view' | 'edit' | 'merge' | 'password' | 'remove';
const ITEMS: Array<[Command, LucideIcon, string]> = [
  ['view', Eye, 'View PDF'],
  ['edit', Pencil, 'Edit PDF'],
  ['merge', Files, 'Merge PDFs'],
  ['password', LockKeyhole, 'Add password…'],
  ['remove', Trash2, 'Remove from recents'],
];
const MARGIN = 8;
const FADE_OUT_MS = 100;

interface Props {
  name: string;
  x: number;
  y: number;
  /** Closing with restore returns focus to the trigger. */
  onClose(restoreFocus: boolean): void;
  onCommand(command: Command): void;
}

export function RecentMenu({name, x, y, onClose, onCommand}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    menu.style.left = `${Math.max(MARGIN, Math.min(x, window.innerWidth - menu.offsetWidth - MARGIN))}px`;
    menu.style.top = `${Math.max(MARGIN, Math.min(y, window.innerHeight - menu.offsetHeight - MARGIN))}px`;
    menu.querySelector('button')?.focus();
  }, [x, y]);

  // The menu unmounts at once (focus returns without waiting); an inert copy fades out in its place.
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    document.querySelectorAll('.recent-context-menu.leaving').forEach((g) => g.remove()); // a reopened menu, or StrictMode's remount
    return () => {
      if (prefersReducedMotion()) return;
      const ghost = menu.cloneNode(true) as HTMLElement;
      ghost.classList.add('leaving');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.inert = true;
      document.body.append(ghost);
      setTimeout(() => ghost.remove(), FADE_OUT_MS);
    };
  }, []);

  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose(false);
    };
    const keys = (e: KeyboardEvent) => {
      const items = [...(ref.current?.querySelectorAll('button') ?? [])];
      const at = items.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault(); // Tab must not move focus on after it is returned to the trigger
        return onClose(true);
      }
      const next: Record<string, number> = {
        Home: 0,
        End: items.length - 1,
        ArrowDown: (at + 1) % items.length,
        ArrowUp: (at - 1 + items.length) % items.length,
      };
      const target = next[e.key];
      if (target === undefined) return;
      e.preventDefault();
      items[target]?.focus();
    };
    const resize = () => onClose(false);
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', keys);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', keys);
      window.removeEventListener('resize', resize);
    };
  }, [onClose]);

  return createPortal(
    <div className="recent-context-menu" role="menu" aria-label={`Actions for ${name}`} ref={ref}>
      {ITEMS.map(([command, Icon, label]) => (
        <div key={command} style={{display: 'contents'}}>
          {command === 'password' && <div className="menu-divider" />}
          <button type="button" role="menuitem" onClick={() => onCommand(command)}>
            <Icon aria-hidden="true" /> {label}
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
