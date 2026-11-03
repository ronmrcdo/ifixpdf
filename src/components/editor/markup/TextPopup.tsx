import {Ellipsis, Trash2} from 'lucide-react';
import {type CSSProperties, useState} from 'react';
import {stepSize} from '../../../domain/markup';

interface Props {
  size: number;
  style: CSSProperties;
  onSize(size: number): void;
  onDuplicate(): void;
  onDelete(): void;
}

/** The dark popup above a selected text item: A−, A+, More (Duplicate) and Delete. */
export function TextPopup({size, style, onSize, onDuplicate, onDelete}: Props) {
  const [menu, setMenu] = useState(false);
  const smaller = stepSize(size, -1);
  const larger = stepSize(size, 1);
  return (
    <div className="markup-popup" style={style} role="group" aria-label="Text options">
      <button
        type="button"
        aria-label="Smaller text"
        disabled={smaller === size}
        onClick={() => onSize(smaller)}
      >
        A−
      </button>
      <button
        type="button"
        aria-label="Larger text"
        disabled={larger === size}
        onClick={() => onSize(larger)}
      >
        A+
      </button>
      <button
        type="button"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={menu}
        onClick={() => setMenu(!menu)}
      >
        <Ellipsis aria-hidden="true" />
      </button>
      <button type="button" aria-label="Delete text" onClick={onDelete}>
        <Trash2 aria-hidden="true" />
      </button>
      {menu && (
        <div
          className="markup-menu"
          role="menu"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setMenu(false);
          }}
        >
          <button
            type="button"
            role="menuitem"
            ref={(el) => el?.focus()}
            onClick={() => {
              setMenu(false);
              onDuplicate();
            }}
          >
            Duplicate
          </button>
        </div>
      )}
    </div>
  );
}
