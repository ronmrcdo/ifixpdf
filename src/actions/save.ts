import {extractName, outputName} from '../domain/naming';
import {parsePageList} from '../domain/ranges';
import {buildPdf, type ExportSpec} from '../pdf/export';
import {platform} from '../platform';
import {openPdfTab} from '../platform/browser';
import {recents} from '../storage/app-recents';
import {useApp} from '../state/app';
import {track} from '../state/work';
import type {SavedResult, WorkspaceState, WorkspaceStore} from '../state/workspace';
import {mergeStore} from '../state/workspaces';

type Progress = (done: number, total: number) => void;
const notify = (text: string, tone?: 'info' | 'error') => useApp.getState().notify(text, tone);

/** Indices of the pages the output range picks. Throws a RangeError with the inline message for a bad custom range. */
export function outputIndices({
  pages,
  currentPage,
  exportSettings,
}: Pick<WorkspaceState, 'pages' | 'currentPage' | 'exportSettings'>): number[] {
  if (exportSettings.rangeMode === 'current') return [currentPage];
  if (exportSettings.rangeMode === 'custom')
    return parsePageList(exportSettings.customRange, pages.length);
  return pages.map((_, i) => i);
}

const pick = (spec: ExportSpec, indices: number[]): ExportSpec => {
  const pages = indices.map((i) => spec.pages[i]!);
  const used = new Set(pages.map((p) => p.fileId));
  return {
    ...spec,
    pages,
    sources: Object.fromEntries(Object.entries(spec.sources).filter(([id]) => used.has(id))),
  };
};

/** True, after one "wait" toast, when an export holds `store`'s lock: the action that asked must not run. */
export function busyExporting(store: WorkspaceStore): boolean {
  if (!store.getState().exporting) return false;
  notify('Wait for the save to finish.');
  return true;
}

/** Runs one export of `store` under its lock: a second call while one runs only toasts. The job reads the state it is
 *  given and snapshots before its first await, so later edits or view switches never reach it; its result lands in
 *  `store`. Tracked for the update install; every failure becomes a toast, never a rejection. */
export async function exclusive(
  store: WorkspaceStore,
  failure: string,
  job: (s: WorkspaceState, progress: Progress) => Promise<SavedResult | undefined>,
): Promise<void> {
  if (busyExporting(store) || !store.getState().beginExport()) return;
  let result: SavedResult | undefined;
  try {
    result = await track(
      job(store.getState(), (done, total) => store.setState({progress: [done, total]})),
    );
  } catch (e) {
    notify(e instanceof RangeError ? e.message : failure, 'error');
  } finally {
    store.getState().endExport(result);
  }
}

/** Saves the output (range applied), records it in recents and opens it when asked. Merge then shows Done; Edit toasts. */
export const saveOutput = (store: WorkspaceStore): Promise<void> =>
  exclusive(store, 'Could not save the PDF. Try a different file.', async (s, progress) => {
    if (!s.pages.length) {
      notify('Add a PDF before saving.');
      return;
    }
    const spec = pick(s.snapshotForExport(), outputIndices(s));
    const bytes = await buildPdf(spec, progress);
    const saved = await platform.saveAs(bytes, outputName(s.exportSettings.name), 'pdf');
    if (!saved) return;
    const pages = spec.pages.length;
    await recents.record({name: saved.name, bytes, pages, path: saved.path}).catch(() => {}); // saving already succeeded
    const opened =
      !useApp.getState().openAfter ||
      (await platform.openPath(saved.path ?? '', bytes).then(
        () => true,
        () => false,
      ));
    if (!opened) notify('Saved, but could not open the PDF.');
    else if (store !== mergeStore) notify(`Saved ${saved.name}.`);
    return {...saved, pages, size: bytes.byteLength, bytes};
  });

/** Merge's Save step: needs pages, shows the document tab and, on narrow windows, the output panel. */
export function continueToSave(store: WorkspaceStore): void {
  const s = store.getState();
  if (!s.pages.length) return notify('Add at least one PDF to continue.');
  s.setWorkflow('save');
  s.setTab('document');
  s.setShowOutput(matchMedia('(max-width: 760px)').matches);
  requestAnimationFrame(() => document.getElementById('output-name')?.focus());
}

/** The Save button and Ctrl+S in Edit and Merge: Merge in review moves on to the Save step first. */
export function saveOrContinue(store: WorkspaceStore): Promise<void> {
  if (store === mergeStore && store.getState().workflow === 'review')
    return Promise.resolve(continueToSave(store));
  return saveOutput(store);
}

/** Preview's Ctrl+S: the whole document under its name. */
export const saveCopy = (store: WorkspaceStore): Promise<void> =>
  exclusive(store, 'Could not save a copy of this PDF.', async (s, progress) => {
    if (!s.pages.length) return;
    const saved = await platform.saveAs(
      await buildPdf(s.snapshotForExport(), progress),
      outputName(s.exportSettings.name),
      'pdf',
    );
    if (saved) notify(`Saved ${saved.name}.`);
  });

/** Saves the selected pages, in displayed order, as a new PDF; the document is unchanged. */
export const extractSelection = (store: WorkspaceStore): Promise<void> =>
  exclusive(store, 'Could not save the extracted pages.', async (s, progress) => {
    const indices = s.pages.flatMap((p, i) => (s.selection.uids.has(p.uid) ? [i] : []));
    if (!indices.length) return;
    const bytes = await buildPdf(pick(s.snapshotForExport(), indices), progress);
    const saved = await platform.saveAs(bytes, extractName(s.exportSettings.name, indices), 'pdf');
    if (saved)
      notify(`${indices.length} pages extracted to ${saved.name}. Your document is unchanged.`);
  });

/** Opens the whole document in a PDF tab, where the viewer's Print picks the printer. */
export const printDocument = (store: WorkspaceStore): Promise<void> =>
  exclusive(store, 'Could not open the PDF for printing.', async (s, progress) => {
    if (!s.pages.length) return;
    openPdfTab(await buildPdf(s.snapshotForExport(), progress));
    notify('Use Print in the PDF viewer to choose your printer.');
  });
