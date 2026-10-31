import type {StoreApi} from 'zustand/vanilla';
import {getBytes} from '../pdf/bytes';
import {clearDraft, writeDraft, type DraftRecord} from '../storage/draft';
import {useApp} from './app';
import type {WorkspaceState} from './workspace';

const DELAY = 300;
let timer: ReturnType<typeof setTimeout> | undefined;
let chain: Promise<void> = Promise.resolve();
let store: StoreApi<WorkspaceState> | null = null;

const toRecord = (s: WorkspaceState): DraftRecord => ({
  files: s.files,
  pages: s.pages,
  currentPage: s.currentPage,
  view: useApp.getState().documentView,
  selection: [...s.selection.uids],
  anchor: s.selection.anchor,
  exportSettings: s.exportSettings,
  savedAt: Date.now(),
});

/** Queues one write of the current workspace; the returned promise rejects if that write fails. */
function enqueue(): Promise<void> {
  const s = store?.getState();
  if (!s) return chain;
  // Captured now: by the time a queued write runs, these files may have been released.
  const record = toRecord(s);
  // writeDraft only stores bytes it doesn't already have, so a name edit never rewrites them.
  const bytes = new Map(s.files.map((f) => [f.id, getBytes(f.id)]));
  const write = chain
    .then(() => (record.files.length ? writeDraft(record, bytes) : clearDraft()))
    .then(
      () => useApp.setState({draft: 'saved'}),
      (e: unknown) => {
        useApp.setState({draft: 'failed'});
        throw e;
      },
    );
  chain = write.catch(() => {});
  return write;
}

function save(): Promise<void> {
  timer = undefined;
  chain = enqueue().catch(() =>
    useApp
      .getState()
      .notify('Draft could not be saved. Export your PDF to keep your work.', 'error'),
  );
  return chain;
}

/** Persists the document workspace 300 ms after its draft fields or the document view change; writes never overlap. */
export function startDraftSync(target: StoreApi<WorkspaceState>): () => void {
  store = target;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(save, DELAY);
  };
  const stop = target.subscribe((s, p) => {
    const same =
      s.files === p.files &&
      s.pages === p.pages &&
      s.currentPage === p.currentPage &&
      s.selection === p.selection &&
      s.exportSettings === p.exportSettings;
    if (!same) schedule();
  });
  // The draft records the Preview/Edit view, so switching alone must write it too.
  const stopView = useApp.subscribe((s, p) => {
    if (s.documentView !== p.documentView && target.getState().files.length) schedule();
  });
  return () => {
    stop();
    stopView();
    clearTimeout(timer);
    timer = undefined;
  };
}

/** Writes a pending draft now and waits for every queued write. */
export function flushDraft(): Promise<void> {
  if (timer === undefined) return chain;
  clearTimeout(timer);
  return save();
}

/** Writes the draft now even if nothing is pending, and rejects if the write fails (no toast: the caller reports it). */
export function saveDraftNow(): Promise<void> {
  clearTimeout(timer);
  timer = undefined;
  return enqueue();
}
