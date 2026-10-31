import {Download, Files, FolderOpen, Pencil, Plus, Printer} from 'lucide-react';
import {useApp} from '../state/app';
import {printDocument, saveOrContinue} from '../actions/save';
import {documentStore, mergeStore, useDocument, useMerge} from '../state/workspaces';
import {navigate} from './route';
import {pickAndImport} from './useFileImport';

export function HeaderActions() {
  const view = useApp((s) => s.view);
  const docPages = useDocument((s) => s.pages.length);
  const docBusy = useDocument((s) => s.exporting);
  const mergePages = useMerge((s) => s.pages.length);
  const mergeBusy = useMerge((s) => s.exporting);
  const workflow = useMerge((s) => s.workflow);
  const single = view === 'home' || view === 'preview' || view === 'edit';
  const mergeOpen = view === 'merge' && mergePages > 0 && workflow !== 'done';

  let save: {label: string; disabled: boolean} | null = null;
  if (view === 'edit') save = {label: 'Save PDF', disabled: !docPages || docBusy};
  if (mergeOpen) save = {label: workflow === 'review' ? 'Continue to save' : 'Save PDF', disabled: mergeBusy};

  return (
    <div className="header-actions">
      {mergeOpen && <button type="button" className="secondary new-combine" data-action="new-combine" onClick={() => void mergeStore.getState().reset()}><Files aria-hidden="true" /> New merge</button>}
      {view !== 'settings' && <button type="button" className="secondary" data-action="add" onClick={() => void pickAndImport()}>{single ? <><FolderOpen aria-hidden="true" /> Open PDF</> : <><Plus aria-hidden="true" /> Add files</>}</button>}
      {view === 'preview' && docPages > 0 && <button type="button" className="secondary" data-action="preview-print" onClick={() => void printDocument(documentStore)}><Printer aria-hidden="true" /> Print PDF</button>}
      {view === 'preview' && <button type="button" className="primary" data-action="edit-current" disabled={!docPages} onClick={() => navigate('edit')}><Pencil aria-hidden="true" /> Edit PDF</button>}
      {save && <button type="button" className="primary" data-action="export" disabled={save.disabled} aria-label={save.label} onClick={() => void saveOrContinue(view === 'edit' ? documentStore : mergeStore)}><Download aria-hidden="true" /> <span className="save-label">{save.label}</span></button>}
    </div>
  );
}
