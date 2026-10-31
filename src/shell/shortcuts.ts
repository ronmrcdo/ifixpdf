import {useEffect} from 'react';
import {useApp, type View} from '../state/app';
import {documentStore, mergeStore} from '../state/workspaces';
import {printDocument, saveCopy, saveOrContinue} from '../actions/save';
import {runOnSelection} from '../components/pages/SelectionBar';
import {pickAndImport} from './useFileImport';

export type Action =
  | 'open'
  | 'save'
  | 'print'
  | 'undo'
  | 'redo'
  | 'delete'
  | 'selectAll'
  | 'prev'
  | 'next';
interface Ctx {
  view: View;
  tab: 'document' | 'pages';
  inGrid: boolean;
  inStage: boolean;
  editable: boolean;
  dialogOpen: boolean;
}

const WORKSPACE_VIEWS: readonly View[] = ['merge', 'edit'];
const SAVE_VIEWS: readonly View[] = ['preview', 'merge', 'edit'];

/** Pure: maps a key event to an action, or null when it is not ours to handle. */
export function handleShortcut(e: KeyboardEvent, ctx: Ctx): Action | null {
  if (ctx.dialogOpen) return null;
  const key = e.key.toLowerCase();
  const mod = e.ctrlKey || e.metaKey;
  if (mod && key === 'o') return 'open';
  if (mod && (key === 's' || key === 'p'))
    return SAVE_VIEWS.includes(ctx.view) ? (key === 's' ? 'save' : 'print') : null;
  if (ctx.editable) return null;
  if (mod && WORKSPACE_VIEWS.includes(ctx.view)) {
    if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
    if (key === 'y') return 'redo';
  }
  if (ctx.inGrid && (key === 'delete' || key === 'backspace')) return 'delete';
  if (ctx.inGrid && mod && key === 'a') return 'selectAll';
  if (ctx.inStage && ctx.tab === 'document' && !mod && !e.altKey) {
    if (key === 'arrowleft') return 'prev';
    if (key === 'arrowright') return 'next';
  }
  return null;
}

const inScope = (scope: 'grid' | 'stage') =>
  document.activeElement?.closest(`[data-shortcut-scope="${scope}"]`) != null;
const isEditable = () =>
  document.activeElement?.closest(
    'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
  ) != null;

function run(action: Action) {
  const app = useApp.getState();
  const store = app.workspace === 'document' ? documentStore : mergeStore;
  const ws = store.getState();
  if (action === 'open') return void pickAndImport();
  if (action === 'save' || action === 'print') {
    if (ws.exporting) return; // Ctrl+S / Ctrl+P do nothing during an export
    if (action === 'print') return void printDocument(store);
    return void (app.view === 'preview' ? saveCopy(store) : saveOrContinue(store));
  }
  if (action === 'undo') return ws.undo();
  if (action === 'redo') return ws.redo();
  if (action === 'delete') return runOnSelection(store, 'delete');
  if (action === 'selectAll') return ws.selectAll();
  ws.goTo(ws.currentPage + (action === 'next' ? 1 : -1));
}

/** Installs the global shortcut listener once, from the shell. */
export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const {view} = useApp.getState();
      const {tab} = (
        useApp.getState().workspace === 'document' ? documentStore : mergeStore
      ).getState();
      const action = handleShortcut(e, {
        view,
        tab,
        inGrid: inScope('grid'),
        inStage: inScope('stage'),
        editable: isEditable(),
        dialogOpen: document.querySelector('dialog[open]') !== null,
      });
      if (!action) return;
      e.preventDefault();
      run(action);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
