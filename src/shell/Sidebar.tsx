import {Files, House, Pencil, Scan, Settings2, type LucideIcon} from 'lucide-react';
import {useApp, type View} from '../state/app';
import {navigate} from './route';

const MAIN: Array<[View, string, LucideIcon]> = [
  ['home', 'Home', House],
  ['merge', 'Merge PDFs', Files],
  ['preview', 'Preview PDF', Scan],
  ['edit', 'Edit PDF', Pencil],
];

function Item({view, label, Icon}: {view: View; label: string; Icon: LucideIcon}) {
  const active = useApp((s) => s.view === view);
  return (
    <button
      type="button"
      className={active ? 'nav-item active' : 'nav-item'}
      title={label}
      aria-current={active ? 'page' : undefined}
      onClick={() => navigate(view)}
    >
      <Icon aria-hidden="true" />
      <span className="nav-text">{label}</span>
    </button>
  );
}

export function Sidebar() {
  return (
    <nav className="sidebar" aria-label="Main">
      {MAIN.map(([view, label, Icon]) => (
        <Item key={view} view={view} label={label} Icon={Icon} />
      ))}
      <div className="side-bottom">
        <Item view="settings" label="Settings" Icon={Settings2} />
      </div>
    </nav>
  );
}
