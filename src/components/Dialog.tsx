import {X} from 'lucide-react';
import {useLayoutEffect, useId, useRef, type ReactNode} from 'react';

interface Props {
  title: string;
  open: boolean;
  onClose(): void;
  children: ReactNode;
}

/** Native modal <dialog>: Esc and the Close button go through onClose; focus returns to whatever had it before opening. */
export function Dialog({title, open, onClose, children}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const opener = useRef<Element | null>(null);
  // Read during render: a child's autoFocus would otherwise already have moved focus by the time effects run.
  if (open) opener.current ??= document.activeElement;
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    dialog.showModal();
    return () => {
      dialog.close();
      if (opener.current instanceof HTMLElement) opener.current.focus();
      opener.current = null;
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="document-dialog"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button type="button" aria-label="Close" onClick={onClose}>
          <X aria-hidden="true" />
        </button>
      </header>
      {open && children}
    </dialog>
  );
}
