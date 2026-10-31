import {CircleCheck, FileText, FolderOpen} from 'lucide-react';
import {formatSize} from '../../domain/format';
import {platform} from '../../platform';
import {navigate} from '../../shell/route';
import {useApp} from '../../state/app';
import type {SavedResult} from '../../state/workspace';
import {mergeStore} from '../../state/workspaces';

const failed = (text: string) => () => useApp.getState().notify(text, 'error');

/** Merge's completion: where the PDF was saved, its file card, and what to do next. */
export function DoneScreen({result}: {result: SavedResult}) {
  const {name, folder, path, pages, size, bytes} = result;
  return (
    <section className="combine-done">
      <span className="done-icon"><CircleCheck aria-hidden="true" /></span>
      <h2>Your merged PDF is saved</h2>
      <p>{folder ? `Saved to ${folder}.` : `Saved as ${name}.`} Your source files are unchanged.</p>
      <div className="completed-file"><FileText aria-hidden="true" /><div><strong>{name}</strong><span>{pages} pages · {formatSize(size)} · PDF document</span></div></div>
      <div className="done-actions">
        <button type="button" className="primary" onClick={() => void platform.openPath(path ?? '', bytes).catch(failed('Could not open the PDF.'))}><FileText aria-hidden="true" /> Open PDF</button>
        {path && <button type="button" className="secondary" onClick={() => void platform.reveal(path).catch(failed('Could not open the folder.'))}><FolderOpen aria-hidden="true" /> Show in folder</button>}
      </div>
      <div className="done-next">
        <button type="button" className="secondary" onClick={() => void mergeStore.getState().reset().catch(failed('Could not start a new merge. Try again.'))}>Merge more PDFs</button>
        <button type="button" onClick={() => mergeStore.getState().setWorkflow('review')}>Back to document</button>
        <button type="button" onClick={() => navigate('home')}>View recent PDFs</button>
      </div>
    </section>
  );
}
