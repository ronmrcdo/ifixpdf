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
import type {KeyboardEvent} from 'react';
import '../../../styles/editor-markup.css';
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

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const move = MOVES[e.key];
    if (!move) return;
    e.preventDefault();
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button')];
    buttons[
      move(buttons.indexOf(document.activeElement as HTMLButtonElement), buttons.length)
    ]?.focus();
  };

  return (
    <div
      className="tool-strip"
      role="toolbar"
      aria-label="Fill and sign tools"
      onKeyDown={onKeyDown}
    >
      {TOOLS.map(({tool, label, Icon, text, chevron}) => (
        <span key={tool} className="tool-slot">
          {DIVIDE_BEFORE.includes(tool) && <span className="tool-divider" aria-hidden="true" />}
          <button
            type="button"
            className="tool-btn"
            aria-label={label}
            title={label}
            aria-pressed={active === tool}
            onClick={() => setTool(active === tool ? null : tool)}
          >
            <Icon aria-hidden="true" fill={tool === 'dot' ? 'currentColor' : 'none'} />
            {text}
            {chevron && <ChevronDown aria-hidden="true" />}
          </button>
        </span>
      ))}
    </div>
  );
}
