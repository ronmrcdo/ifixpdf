import {
  Eye,
  FileText,
  LayoutGrid,
  LockKeyhole,
  Redo2,
  SlidersHorizontal,
  Undo2,
} from 'lucide-react';
import type {KeyboardEvent} from 'react';
import {useStore} from 'zustand';
import type {WorkspaceStore} from '../../state/workspace';

const TABS = [
  ['document', 'Document', FileText],
  ['pages', 'Pages', LayoutGrid],
] as const;
export const tabId = (tab: 'document' | 'pages') => `tab-${tab}`;
export const TAB_PANEL_ID = 'workspace-tabpanel';

/** Document/Pages tabs plus the read-only note (Preview) or Undo/Redo (Edit, Merge). */
export function Toolbar({store, readOnly = false}: {store: WorkspaceStore; readOnly?: boolean}) {
  const tab = useStore(store, (s) => s.tab);
  const canUndo = useStore(store, (s) => s.canUndo());
  const canRedo = useStore(store, (s) => s.canRedo());
  const showOutput = useStore(store, (s) => s.showOutput);

  // Two tabs, so Left and Right both move to the other one.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const other = tab === 'document' ? 'pages' : 'document';
    store.getState().setTab(other);
    document.getElementById(tabId(other))?.focus();
  };

  return (
    <div className="toolbar">
      <div className="tabs" role="tablist" aria-label="Workspace view" onKeyDown={onKeyDown}>
        {TABS.map(([key, label, Icon]) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={tabId(key)}
            aria-controls={TAB_PANEL_ID}
            aria-selected={tab === key}
            tabIndex={tab === key ? 0 : -1}
            className={tab === key ? 'tab active' : 'tab'}
            onClick={() => store.getState().setTab(key)}
          >
            <Icon aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      {readOnly ? (
        <span className="toolbar-info">
          <Eye aria-hidden="true" /> Read-only preview
        </span>
      ) : (
        <>
          <div className="history-controls">
            <button
              type="button"
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
              disabled={!canUndo}
              onClick={() => store.getState().undo()}
            >
              <Undo2 aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Redo"
              title="Redo (Ctrl+Shift+Z)"
              disabled={!canRedo}
              onClick={() => store.getState().redo()}
            >
              <Redo2 aria-hidden="true" />
            </button>
          </div>
          <span className="toolbar-info">
            <LockKeyhole aria-hidden="true" /> Files stay on this device
          </span>
          <button
            type="button"
            className="mobile-panel-switch"
            aria-pressed={showOutput}
            onClick={() => store.getState().setShowOutput(!showOutput)}
          >
            <SlidersHorizontal aria-hidden="true" /> Output
          </button>
        </>
      )}
    </div>
  );
}
