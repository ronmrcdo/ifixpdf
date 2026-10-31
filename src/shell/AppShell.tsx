import {useEffect} from 'react';
import {useApp, type View} from '../state/app';
import {documentStore, useDocument} from '../state/workspaces';
import {HeaderActions} from './HeaderActions';
import {openErrorText, writeRoute} from './route';
import {useShortcuts} from './shortcuts';
import {Sidebar} from './Sidebar';
import {Statusbar} from './Statusbar';
import {Titlebar} from './Titlebar';
import {Toast} from './Toast';
import {EditView} from '../views/edit/EditView';
import {HomeView} from '../views/home/HomeView';
import {MergeView} from '../views/merge/MergeView';
import {SettingsView} from '../views/settings/SettingsView';
import {PreviewView} from '../views/preview/PreviewView';
import {useFileImport} from './useFileImport';
import {recents} from '../storage/app-recents';
import {DialogHost, showPasswordDialog, showSplitDialog} from '../dialogs/host';
import type {RecentEntry} from '../storage/recents';

const TITLES: Record<View, [string, string]> = {
  home: ['Home', 'Recent PDFs and your current workspace.'],
  merge: ['Merge PDFs', 'A few files. One well-ordered document.'],
  preview: ['Preview PDF', 'Read and inspect your document.'],
  edit: ['Edit PDF', 'Organize pages and save an edited copy.'],
  settings: ['Settings', 'A workspace that works your way.']
};
const PANE: Partial<Record<View, string>> = {preview: 'workspace preview-only', edit: 'workspace edit-only'};

async function addPassword(entry: RecentEntry) {
  try {
    const {entry: opened, bytes} = await recents.open(entry.id);
    showPasswordDialog({name: opened.name, bytes});
  } catch (e) {
    useApp.getState().notify(openErrorText(e), 'error');
  }
}

function split() {
  const s = documentStore.getState();
  if (s.pages.length) showSplitDialog({count: s.pages.length, name: s.exportSettings.name, spec: s.snapshotForExport()});
}

function Body({view}: {view: View}) {
  if (view === 'home') return <HomeView onAddPassword={addPassword} />;
  if (view === 'preview') return <PreviewView />;
  if (view === 'edit') return <EditView onSplit={split} />;
  if (view === 'merge') return <MergeView />;
  return <SettingsView />;
}

export function AppShell() {
  const view = useApp((s) => s.view);
  const files = useDocument((s) => s.files);
  const name = useDocument((s) => s.exportSettings.name);
  useShortcuts();
  useFileImport();
  useEffect(() => writeRoute(view, {files, recentId: files[0]?.recentId}), [view, files]);

  const [title, subtitle] = TITLES[view];
  const named = (view === 'preview' || view === 'edit') && files.length === 1;
  return (
    <>
      <div className="app">
        <Titlebar />
        <Sidebar />
        <main className={PANE[view] ?? 'workspace'}>
          <header className="workspace-header">
            <div>
              <h1 id="view-title">{title}</h1>
              <div className="subtitle" id="view-subtitle">{named ? name : subtitle}</div>
            </div>
            <HeaderActions />
          </header>
          <Body view={view} />
        </main>
        <Statusbar />
      </div>
      <DialogHost />
      <Toast />
    </>
  );
}
