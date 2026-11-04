import {Ellipsis, Trash2} from 'lucide-react';
import {type CSSProperties, useEffect, useRef, useState} from 'react';
import {stepSize, TEXT_FONTS, type TextFont} from '../../../domain/markup';
import {useDismiss} from './useDismiss';

interface Props {
  size: number;
  font: TextFont;
  bold: boolean;
  style?: CSSProperties;
  onSize(size: number): void;
  onFont(font: TextFont): void;
  onBold(bold: boolean): void;
  onDelete(): void;
}

/** The dark popup above a text item: A−, A+, Font (typeface and Bold) and Delete. */
export function TextPopup({size, font, bold, style, onSize, onFont, onBold, onDelete}: Props) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const onBlur = useDismiss(menu, menuRef, moreRef, () => setMenu(false));
  const pick = (run: () => void) => () => {
    setMenu(false);
    run();
  };
  useEffect(() => {
    if (menu) menuRef.current?.querySelector('button')?.focus();
  }, [menu]);
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
        ref={moreRef}
        type="button"
        aria-label="Font"
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
          ref={menuRef}
          className="markup-menu"
          role="menu"
          onBlur={onBlur}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            setMenu(false);
            moreRef.current?.focus();
          }}
        >
          {Object.entries(TEXT_FONTS).map(([key, f]) => (
            <button
              key={key}
              type="button"
              role="menuitemradio"
              aria-checked={key === font}
              style={{fontFamily: f.css}}
              onClick={pick(() => onFont(key as TextFont))}
            >
              {f.label}
            </button>
          ))}
          <hr />
          <button
            type="button"
            role="menuitemcheckbox"
            aria-checked={bold}
            aria-keyshortcuts="Control+B"
            title="Bold (Ctrl+B)"
            style={{fontWeight: 'bold'}}
            onClick={pick(() => onBold(!bold))}
          >
            Bold
          </button>
        </div>
      )}
    </div>
  );
}
