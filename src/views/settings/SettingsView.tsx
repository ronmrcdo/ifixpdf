import {lazy, Suspense} from 'react';
import {ShieldCheck} from 'lucide-react';
import {busyExporting} from '../../actions/save';
import {useApp} from '../../state/app';
import {clearDraft} from '../../storage/draft';
import {documentStore, mergeStore} from '../../state/workspaces';

const About = lazy(() => import('./About').then((m) => ({default: m.About})));

// Recents are deliberately untouched (owner decision 7).
async function clearWorkspace() {
  const {notify} = useApp.getState();
  if (busyExporting(documentStore) || busyExporting(mergeStore)) return;
  try {
    await Promise.all([
      documentStore.getState().reset(),
      mergeStore.getState().reset(),
      clearDraft(),
    ]);
    notify('Workspace cleared.');
  } catch {
    notify('Could not clear the workspace. Try again.', 'error');
  }
}

export function SettingsView() {
  const openAfter = useApp((s) => s.openAfter);
  return (
    <section className="view">
      <h2>Workspace preferences</h2>
      <div className="settings-form">
        <div className="settings-row">
          <div>
            Document processing<p>PDF files are processed locally on this device.</p>
          </div>
          <ShieldCheck aria-hidden="true" />
        </div>
        <div className="settings-row">
          <div>
            Open PDF after saving<p>Open the saved PDF in your default PDF app.</p>
          </div>
          <input
            id="pref-open"
            aria-label="Open after saving"
            type="checkbox"
            checked={openAfter}
            onChange={(e) => useApp.setState({openAfter: e.target.checked})}
          />
        </div>
        <div className="settings-row">
          <div>
            Interface<p>Light surfaces, compact controls, Windows typography.</p>
          </div>
          <span className="subtitle">Light</span>
        </div>
        <div className="settings-row">
          <div>
            Clear workspace<p>Remove documents from Preview, Edit and Merge.</p>
          </div>
          <button type="button" className="secondary danger" onClick={clearWorkspace}>
            Clear workspace
          </button>
        </div>
        <Suspense fallback={null}>
          <About />
        </Suspense>
      </div>
    </section>
  );
}
