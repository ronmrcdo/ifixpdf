import {Download, Files, ShieldCheck} from 'lucide-react';
import {useStore} from 'zustand';
import {outputIndices, saveOrContinue} from '../../actions/save';
import {type Fills, filledCount, type Markup} from '../../domain/markup';
import type {ExportSettings, PageInstance} from '../../domain/types';
import {useApp} from '../../state/app';
import type {WorkspaceKind, WorkspaceStore} from '../../state/workspace';

/** Summary line and inline range error, as legacy updateOutputSummary. */
function summarize(state: Parameters<typeof outputIndices>[0]): {text: string; error: string} {
  try {
    const n = outputIndices(state).length;
    return {
      text: `${n} ${n === 1 ? 'page' : 'pages'} · ${state.exportSettings.rangeMode === 'all' ? 'Complete document' : 'Selected pages'}`,
      error: '',
    };
  } catch (e) {
    return {
      text: 'Check page range',
      error: state.exportSettings.customRange && e instanceof RangeError ? e.message : '',
    };
  }
}

const KINDS: Record<Markup['kind'], 0 | 1 | 2 | 3> = {
  text: 0,
  cross: 1,
  check: 1,
  dot: 1,
  signature: 2,
  redact: 3,
};
const NOUNS = ['text item', 'mark', 'signature', 'redaction', 'filled field'];

/** What the copy includes besides pages, e.g. "2 marks, 1 redaction. Redacted pages are saved as images." */
function markupSummary(pages: readonly PageInstance[], fills: Fills): string {
  const counts = [0, 0, 0, 0, 0];
  for (const m of pages.flatMap((p) => p.markup ?? [])) counts[KINDS[m.kind]]! += 1;
  counts[4] = filledCount(pages, fills);
  const parts = counts.flatMap((n, i) => (n ? [`${n} ${NOUNS[i]}${n === 1 ? '' : 's'}`] : []));
  if (!parts.length) return '';
  return `${parts.join(', ')}.${counts[3] ? ' Redacted pages are saved as images.' : ''}`;
}

/** The output pane of Edit and Merge: name, pages, options, summary and Save. */
export function OutputInspector({store, kind}: {store: WorkspaceStore; kind: WorkspaceKind}) {
  const pages = useStore(store, (s) => s.pages);
  const currentPage = useStore(store, (s) => s.currentPage);
  const settings = useStore(store, (s) => s.exportSettings);
  const exporting = useStore(store, (s) => s.exporting);
  const fills = useStore(store, (s) => s.fills);
  const workflow = useStore(store, (s) => s.workflow);
  const openAfter = useApp((s) => s.openAfter);
  const set = (partial: Partial<ExportSettings>) => store.getState().setExportSettings(partial);

  const merge = kind === 'merge';
  const saveStep = merge && workflow === 'save';
  let heading = 'Save edited PDF';
  if (merge) heading = saveStep ? 'Save merged PDF' : 'Output settings';
  let action = 'Save edited PDF';
  if (merge) action = workflow === 'review' ? 'Continue to save' : 'Save merged PDF';
  const {text, error} = summarize({pages, currentPage, exportSettings: settings});
  const includes = markupSummary(pages, fills);

  const chooseRange = (rangeMode: ExportSettings['rangeMode']) => {
    set({rangeMode});
    if (rangeMode === 'custom')
      requestAnimationFrame(() => document.getElementById('custom-range')?.focus());
  };

  return (
    <aside className="output" aria-label="Output settings">
      <h2>{heading}</h2>
      {saveStep && (
        <p className="save-instruction">Check the name and pages, then save your document.</p>
      )}
      <label className="field">
        <span>File name</span>
        <input
          id="output-name"
          value={settings.name}
          aria-label="Output file name"
          onChange={(e) => set({name: e.target.value})}
        />
      </label>
      <div className="quality-note">
        <ShieldCheck aria-hidden="true" />
        <div>
          <strong>Original quality</strong>
          <span>Source page content is preserved.</span>
        </div>
      </div>
      <label className="field">
        <span>Pages</span>
        <select
          id="page-range"
          value={settings.rangeMode}
          onChange={(e) => chooseRange(e.target.value as ExportSettings['rangeMode'])}
        >
          <option value="all">All pages ({pages.length})</option>
          <option value="current">Current page ({currentPage + 1})</option>
          <option value="custom">Custom range…</option>
        </select>
      </label>
      {settings.rangeMode === 'custom' && (
        <label className="field range-field">
          <span>Page range</span>
          <input
            id="custom-range"
            value={settings.customRange}
            placeholder="e.g. 1-3, 5"
            aria-describedby="range-help range-error"
            aria-invalid={Boolean(error)}
            onChange={(e) => set({customRange: e.target.value})}
          />
          <small id="range-help">Use commas and ranges, such as 1-3, 5.</small>
          <small id="range-error" className="danger" role="alert">
            {error}
          </small>
        </label>
      )}
      <label className="check">
        <input
          id="bookmarks"
          type="checkbox"
          checked={settings.useFileNamesAsTitle}
          onChange={(e) => set({useFileNamesAsTitle: e.target.checked})}
        />
        <span>Use file names as PDF title</span>
      </label>
      <label className="check">
        <input
          id="open-after"
          type="checkbox"
          checked={openAfter}
          onChange={(e) => useApp.setState({openAfter: e.target.checked})}
        />
        <span>Open PDF after saving</span>
      </label>
      <div className="output-foot">
        <div className="export-summary">
          <span>
            <Files aria-hidden="true" /> {merge ? 'Merged document' : 'Edited document'}
          </span>
          <strong id="export-summary">{text}</strong>
          {includes && <small id="markup-summary">{includes}</small>}
        </div>
        <button
          type="button"
          className="primary wide"
          data-action="export"
          disabled={!pages.length || exporting}
          onClick={() => void saveOrContinue(store)}
        >
          <Download aria-hidden="true" />
          {action}
        </button>
        <p>Ready when you are. Originals stay untouched.</p>
      </div>
    </aside>
  );
}
