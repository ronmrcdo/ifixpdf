import {busyExporting} from '../actions/save';
import type {SourceFile} from '../domain/types';
import {FileMissingError, type PickedFile} from '../platform';
import {useApp, type View} from '../state/app';
import {flushDraft, startDraftSync} from '../state/draft-sync';
import {documentStore} from '../state/workspaces';
import {clearDraft, readDraft} from '../storage/draft';
import {recents} from '../storage/app-recents';
import {isTransitioning, withViewTransition} from './viewTransition';

type RouteView = 'home' | 'preview' | 'edit';
export interface Route {
  view?: RouteView;
  combineNew: boolean;
  recent?: string;
}

const ROUTE_VIEWS: readonly string[] = ['home', 'preview', 'edit'];
const isRouteView = (v: string | null): v is RouteView => v !== null && ROUTE_VIEWS.includes(v);

export function parseRoute(search: string): Route {
  const q = new URLSearchParams(search);
  const view = q.get('view');
  const recent = q.get('recent');
  const route: Route = {combineNew: q.get('combine') === 'new'};
  if (isRouteView(view)) route.view = view;
  if (recent) route.recent = recent;
  return route;
}

const replace = (query: string) => window.history.replaceState(null, '', `index.html?${query}`);

/** Home writes ?view=home; Preview/Edit with exactly one recent file write ?recent=; nothing else writes. */
export function writeRoute(view: View, doc: {files: SourceFile[]; recentId?: string}): void {
  if (view === 'home') return replace('view=home');
  if (view !== 'preview' && view !== 'edit') return;
  if (doc.files.length !== 1 || !doc.recentId) return;
  const q = new URLSearchParams({recent: doc.recentId});
  if (view === 'edit') q.set('view', 'edit');
  replace(q.toString());
}

/** Switches view; Preview opens on the Document tab and Edit on Pages, as today. */
export function navigate(view: View): void {
  if (view === 'merge') void flushDraft(); // leaving the document workspace writes its pending draft now, as legacy did
  const change = () => {
    useApp.getState().setView(view);
    if (view === 'preview') documentStore.getState().setTab('document');
    if (view === 'edit') documentStore.getState().setTab('pages');
  };
  // Cross-fade only a real change; while an earlier fade may still be waiting to apply, the shown view is not the latest one.
  if (useApp.getState().view === view && !isTransitioning()) return change();
  withViewTransition(change);
}

export const OPEN_FAILED = 'Could not open that PDF. Choose a valid, unlocked PDF.';
export const openErrorText = (e: unknown): string =>
  e instanceof FileMissingError
    ? 'That PDF was not found. Locate it or remove it from recents.'
    : OPEN_FAILED;

/** Records a file the store just opened (page count read from it, so nothing is parsed twice) and links the recent id to it.
 *  A recording failure never blocks opening. */
export async function recordOpen(
  store: typeof documentStore,
  file: SourceFile,
  picked: Pick<PickedFile, 'bytes' | 'path'>,
): Promise<void> {
  try {
    const {id} = await recents.record({
      name: file.name,
      bytes: picked.bytes,
      pages: file.pages,
      path: picked.path,
    });
    store.getState().setRecentId(file.id, id);
  } catch {
    // opening already succeeded
  }
}

/** True when the recent is now the document; failures have already shown their toast. */
export async function openRecent(id: string): Promise<boolean> {
  if (busyExporting(documentStore)) return false;
  let picked: PickedFile;
  try {
    const {entry, bytes} = await recents.open(id);
    picked = {name: entry.name, bytes, path: entry.path};
    await documentStore.getState().replaceWith(picked, id);
  } catch (e) {
    useApp.getState().notify(openErrorText(e), 'error');
    return false;
  }
  const [file] = documentStore.getState().files;
  if (file?.recentId !== id) return false;
  await recordOpen(documentStore, file, picked); // re-opening refreshes modified, pages and size
  return true;
}

export async function startup(): Promise<void> {
  const route = parseRoute(window.location.search); // before the first render rewrites the URL
  let shown = useApp.getState().view;
  const moved = () => useApp.getState().view !== shown; // the user navigated while startup was waiting; theirs wins
  let draft = await readDraft().catch(() => null);
  if (draft) {
    try {
      await documentStore.getState().restore(draft.record, draft.bytes);
    } catch {
      draft = null; // an unrestorable draft must not block startup or leave sync stuck
      await clearDraft().catch(() => {});
    }
  }
  if (draft) {
    if (!moved()) {
      useApp.getState().setView(draft.record.view); // Home and Settings now act on the document, as today
      shown = draft.record.view;
    }
  }
  startDraftSync(documentStore);
  if (moved()) return;
  if (route.combineNew) return navigate('merge');
  if (route.recent) {
    const opened = await openRecent(route.recent);
    if (moved()) return;
    if (opened) return navigate(route.view === 'edit' ? 'edit' : 'preview');
    return navigate(route.view ?? 'home'); // keep the error toast rather than the restored-draft one
  }
  if (!route.view && draft?.record.files.length) {
    navigate(draft.record.view);
    useApp.getState().notify('Your saved draft has been restored.');
    return;
  }
  navigate(route.view ?? 'home');
}
