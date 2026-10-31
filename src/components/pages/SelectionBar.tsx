import {Copy, RotateCw, Scissors, Trash2} from 'lucide-react';
import {useEffect, useRef} from 'react';
import {useStore} from 'zustand';
import {extractSelection} from '../../actions/save';
import {useApp} from '../../state/app';
import type {WorkspaceStore} from '../../state/workspace';

export type SelectionAction = 'rotate' | 'duplicate' | 'extract' | 'delete';
const ACTIONS: Record<SelectionAction, (store: WorkspaceStore) => void> = {
  rotate: (store) => store.getState().rotate(90),
  duplicate: (store) => store.getState().duplicate(),
  extract: (store) => void extractSelection(store),
  delete: (store) => store.getState().remove()
};

/** Runs a page action on the selection, or asks for one. Shared by the bar and the Delete shortcut. */
export function runOnSelection(store: WorkspaceStore, action: SelectionAction) {
  if (!store.getState().selection.uids.size) return useApp.getState().notify('Select one or more pages first.');
  ACTIONS[action](store);
}

const BUTTONS = [['rotate', 'Rotate', RotateCw], ['duplicate', 'Duplicate', Copy], ['extract', 'Extract', Scissors], ['delete', 'Delete', Trash2]] as const;

export function SelectionBar({store}: {store: WorkspaceStore}) {
  const count = useStore(store, (s) => s.selection.uids.size);
  const total = useStore(store, (s) => s.pages.length);
  const all = useRef<HTMLInputElement>(null);
  // indeterminate has no HTML attribute; it is only a DOM property.
  useEffect(() => { if (all.current) all.current.indeterminate = count > 0 && count < total }, [count, total]);

  const toggleAll = (checked: boolean) => (checked ? store.getState().selectAll() : store.getState().clearSelection());
  return (
    <div className="page-selection-bar">
      <label>
        <input ref={all} id="select-all-pages" type="checkbox" aria-label="Select all pages" checked={total > 0 && count === total} onChange={(e) => toggleAll(e.target.checked)} />
        {' '}<span id="selection-count">{count} selected</span>
      </label>
      {BUTTONS.map(([action, label, Icon]) => (
        <button key={action} type="button" data-pages={action} aria-label={`${label} selected pages`} onClick={() => runOnSelection(store, action)}>
          <Icon aria-hidden="true" /> {label}
        </button>
      ))}
    </div>
  );
}
