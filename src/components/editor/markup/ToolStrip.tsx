import {
  Check,
  ChevronDown,
  Circle,
  PenLine,
  SquareDashed,
  Type,
  X,
  type LucideIcon,
} from 'lucide-react';
import {type KeyboardEvent, useRef, useState} from 'react';
import '../../../styles/editor-markup.css';
import {SignMenu} from './SignMenu';
import {type Tool, useTool} from './tool';

const TOOLS: {tool: Tool; label: string; Icon: LucideIcon; text?: string; chevron?: boolean}[] = [
  {tool: 'text', label: 'Add text', Icon: Type},
  {tool: 'cross', label: 'Add cross', Icon: X},
  {tool: 'check', label: 'Add check', Icon: Check},
  {tool: 'dot', label: 'Add dot', Icon: Circle},
  {tool: 'sign', label: 'Sign', Icon: PenLine, text: 'Sign', chevron: true},
  {tool: 'redact', label: 'Redact', Icon: SquareDashed, text: 'Redact'},
];
const DIVIDE_BEFORE: Tool[] = ['sign', 'redact'];

const MOVES: Record<string, (i: number, n: number) => number> = {
  ArrowRight: (i, n) => (i + 1) % n,
  ArrowLeft: (i, n) => (i + n - 1) % n,
  Home: () => 0,
  End: (_, n) => n - 1,
};

export function ToolStrip() {
  const active = useTool((s) => s.tool);
  const setTool = useTool((s) => s.setTool);
  const [stop, setStop] = useState(0); // roving tabindex: the one strip button in the Tab order
  const [menu, setMenu] = useState(false);
  const sign = useRef<HTMLButtonElement>(null);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const move = MOVES[e.key];
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('.tool-btn')];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (!move || i < 0) return; // keys inside the Sign menu are its own
    e.preventDefault();
    buttons[move(i, buttons.length)]?.focus(); // its onFocus moves the tab stop
  };

  return (
    <div
      className="tool-strip"
      role="toolbar"
      aria-label="Fill and sign tools"
      onKeyDown={onKeyDown}
    >
      {TOOLS.map(({tool, label, Icon, text, chevron}, i) => (
        <span key={tool} className={tool === 'sign' ? 'tool-slot sign-anchor' : 'tool-slot'}>
          {DIVIDE_BEFORE.includes(tool) && <span className="tool-divider" aria-hidden="true" />}
          <button
            ref={tool === 'sign' ? sign : undefined}
            type="button"
            className="tool-btn"
            aria-label={label}
            title={label}
            aria-pressed={active === tool}
            aria-haspopup={chevron ? 'menu' : undefined}
            aria-expanded={chevron ? menu : undefined}
            tabIndex={i === stop ? 0 : -1}
            onFocus={() => setStop(i)}
            onClick={() => (chevron ? setMenu(!menu) : setTool(active === tool ? null : tool))}
          >
            <Icon aria-hidden="true" fill={tool === 'dot' ? 'currentColor' : 'none'} />
            {text}
            {chevron && <ChevronDown aria-hidden="true" />}
          </button>
          {chevron && (
            <SignMenu
              open={menu}
              onClose={() => {
                setMenu(false);
                sign.current?.focus();
              }}
            />
          )}
        </span>
      ))}
    </div>
  );
}
