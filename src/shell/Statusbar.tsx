import {useStore} from 'zustand';
import {version} from '../../package.json';
import {useApp} from '../state/app';
import {documentStore, mergeStore} from '../state/workspaces';

export function Statusbar() {
  const workspace = useApp((s) => s.workspace);
  const draft = useApp((s) => s.draft);
  const store = useApp((s) => (s.workspace === 'merge' ? mergeStore : documentStore));
  const files = useStore(store, (s) => s.files.length);
  const pages = useStore(store, (s) => s.pages.length);
  const busy = useStore(store, (s) => s.exporting);
  const progress = useStore(store, (s) => s.progress);
  let text = 'Ready to add PDFs';
  if (files) text = `${files} files · ${pages} pages · Ready`;
  if (busy)
    text = progress
      ? `Processing PDF… ${Math.round((progress[0] / progress[1]) * 100)}%`
      : 'Processing PDF…';
  return (
    <footer className="statusbar">
      <span className="dot" />
      <span id="status" role="status">
        {text}
      </span>
      {workspace === 'document' && files > 0 && (
        <span className="right" id="draft-status">
          {draft === 'failed' ? 'Draft not saved' : 'Draft saved on this device'}
        </span>
      )}
      <span className="app-version">iFixPDF v{version}</span>
    </footer>
  );
}
