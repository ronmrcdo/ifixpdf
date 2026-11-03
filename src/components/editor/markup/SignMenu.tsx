import {Plus, Trash2} from 'lucide-react';
import {type KeyboardEvent, useEffect, useRef, useState} from 'react';
import {
  deleteSignature,
  listSignatures,
  type SavedSignature,
  saveSignature,
} from '../../../storage/signatures';
import {SignatureDialog} from './SignatureDialog';
import {useTool} from './tool';

const MOVES: Record<string, (i: number, n: number) => number> = {
  ArrowDown: (i, n) => (i + 1) % n,
  ArrowUp: (i, n) => (i + n - 1) % n,
  Home: () => 0,
  End: (_, n) => n - 1,
};

/** The Sign menu: remembered signatures (pick or delete) and Add signature, which opens the dialog. */
export function SignMenu({open, onClose}: {open: boolean; onClose(): void}) {
  const [saved, setSaved] = useState<SavedSignature[]>([]);
  const [adding, setAdding] = useState(false);
  const add = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) listSignatures().then(setSaved);
  }, [open]);
  useEffect(() => {
    if (open) add.current?.focus();
  }, [open]);

  const pick = (png: string) => {
    useTool.getState().setSignature(png);
    useTool.getState().setTool('sign');
  };
  const remove = (id: string) =>
    deleteSignature(id).then(
      () => {
        setSaved((list) => list.filter((s) => s.id !== id));
        add.current?.focus();
      },
      () => {}, // the row stays
    );
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const move = MOVES[e.key];
    if (e.key === 'Escape') onClose();
    else if (move) {
      const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role=menuitem]')];
      items[move(items.indexOf(document.activeElement as HTMLElement), items.length)]?.focus();
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <>
      {open && (
        <div className="markup-menu sign-menu" role="menu" aria-label="Sign" onKeyDown={onKeyDown}>
          {saved.map((s, i) => (
            <div key={s.id} className="sign-row">
              <button
                type="button"
                role="menuitem"
                className="sign-pick"
                aria-label={`Signature ${i + 1}`}
                onClick={() => {
                  onClose();
                  pick(s.png);
                }}
              >
                <img src={s.png} alt="" />
              </button>
              <button
                type="button"
                role="menuitem"
                aria-label="Delete signature"
                title="Delete signature"
                onClick={() => remove(s.id)}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </div>
          ))}
          <button
            ref={add}
            type="button"
            role="menuitem"
            onClick={() => {
              onClose(); // returns focus to Sign first, so the dialog gives it back there
              setAdding(true);
            }}
          >
            <Plus aria-hidden="true" />
            Add signature
          </button>
        </div>
      )}
      <SignatureDialog
        open={adding}
        onClose={() => setAdding(false)}
        onUse={(png, remember) => {
          setAdding(false);
          if (remember) saveSignature(png).catch(() => {}); // like prefs: still usable this session
          pick(png);
        }}
      />
    </>
  );
}
