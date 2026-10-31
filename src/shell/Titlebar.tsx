import {Minus, Square, X} from 'lucide-react';
import {platform} from '../platform';
import {useApp} from '../state/app';
import {flushDraft} from '../state/draft-sync';

type WindowAction = 'minimize' | 'toggleMaximize' | 'close';
const ACTIONS = [
  ['minimize', 'Minimize window', Minus],
  ['toggleMaximize', 'Maximize window', Square],
  ['close', 'Close window', X],
] as const;

async function run(action: WindowAction) {
  const win = platform.window;
  if (!win)
    return useApp.getState().notify('Window controls are available in the Tauri desktop build.');
  if (action === 'close') await flushDraft(); // never rejects: a failed write has already toasted
  win[action]().catch(() =>
    useApp.getState().notify('Could not change the window. Try again.', 'error'),
  );
}

export function Titlebar() {
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="brand" aria-label="iFixPDF">
        <img
          className="brand-mark"
          src="/brand/ifixpdf-mark.svg"
          width={24}
          height={24}
          alt=""
          draggable={false}
        />
        <span>iFixPDF</span>
      </div>
      <span>PDF workspace</span>
      <div className="window-actions">
        {ACTIONS.map(([action, label, Icon]) => (
          <button key={action} type="button" aria-label={label} onClick={() => void run(action)}>
            <Icon aria-hidden="true" />
          </button>
        ))}
      </div>
    </header>
  );
}
