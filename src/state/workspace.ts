import {createStore} from 'zustand/vanilla';
import {createHistory} from '../domain/history';
import {exportTitle} from '../domain/naming';
import {deletePages, duplicatePages, movePages, moveFile as moveFileGroup, moveFileTo as moveFileGroupTo, pagesForFile, removeFile as removeFilePages, rotatePages} from '../domain/pages';
import {clearSelection, clickSelect, pruneSelection, selectAll} from '../domain/selection';
import type {ExportSettings, FileId, PageInstance, PageUid, Selection, SourceFile} from '../domain/types';
import {getBytes, putBytes} from '../pdf/bytes';
import type {ExportSpec} from '../pdf/export';
import {loadPdf} from '../pdf/load';
import {release, retain} from '../pdf/registry';
import type {PickedFile} from '../platform/types';
import type {DraftRecord} from '../storage/draft';
import {useApp} from './app';

export type WorkspaceKind = 'document' | 'merge';
export interface SavedResult { name: string; folder: string; path?: string; pages: number; size: number; bytes: Uint8Array }
type Uids = ReadonlySet<PageUid>;

interface Data {
  files: SourceFile[];
  pages: PageInstance[];
  /** 0-based index into `pages`. */
  currentPage: number;
  selection: Selection;
  tab: 'document' | 'pages';
  workflow: 'add' | 'review' | 'save' | 'done';
  exportSettings: ExportSettings;
  zoom: number | 'fit';
  showOutput: boolean;
  completed: SavedResult | null;
  exporting: boolean;
  /** [done, total] of the running export's build, for the statusbar. */
  progress: [number, number] | null;
}
type Snapshot = Pick<Data, 'files' | 'pages' | 'currentPage' | 'selection'>;

export interface WorkspaceState extends Data {
  addFiles(picked: PickedFile[]): Promise<void>;
  replaceWith(picked: PickedFile, recentId?: string): Promise<void>;
  /** Links a file to its recents row; not an edit, so no history entry. */
  setRecentId(fileId: FileId, recentId: string): void;
  /** Puts a saved draft back without loading or an undo step. */
  restore(record: DraftRecord, bytes: Map<FileId, Uint8Array>): Promise<void>;
  /** targetIndex is the final index of the first moved page, as in `movePages`. Page actions default to the selection. */
  move(targetIndex: number, uids?: Uids): void;
  remove(uids?: Uids): void;
  duplicate(uids?: Uids): void;
  rotate(delta: 90 | -90, uids?: Uids): void;
  moveFile(fileId: FileId, direction: -1 | 1): void;
  /** Moves the file to row `to` with its pages, as one undo step (the sources-pane drag). */
  moveFileTo(fileId: FileId, to: number): void;
  removeFile(fileId: FileId): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  select(uid: PageUid, mods: {ctrl: boolean; shift: boolean}): void;
  selectAll(): void;
  clearSelection(): void;
  goTo(index: number): void;
  setTab(tab: Data['tab']): void;
  setWorkflow(workflow: Data['workflow']): void;
  setZoom(zoom: Data['zoom']): void;
  setShowOutput(show: boolean): void;
  setExportSettings(partial: Partial<ExportSettings>): void;
  snapshotForExport(): ExportSpec;
  beginExport(): boolean;
  endExport(result?: SavedResult): void;
  reset(): Promise<void>;
}

const blank = (kind: WorkspaceKind): Data => ({
  files: [], pages: [], currentPage: 0, selection: clearSelection(), tab: 'document',
  workflow: kind === 'merge' ? 'add' : 'review',
  exportSettings: {name: 'Merged document.pdf', rangeMode: 'all', customRange: '', useFileNamesAsTitle: true},
  zoom: 'fit', showOutput: false, completed: null, exporting: false, progress: null
});

const sameItems = <T>(a: readonly T[], b: readonly T[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const clamp = (i: number, length: number): number => Math.max(0, Math.min(i, length - 1));
const couldNotOpen = (name: string) => useApp.getState().notify(`Could not open ${name}. Use a valid PDF without a password.`, 'error');

async function load(picked: PickedFile): Promise<SourceFile | null> {
  try {
    const {pages} = await loadPdf(picked.name, picked.bytes);
    const file: SourceFile = {id: crypto.randomUUID(), name: picked.name, pages, size: picked.bytes.byteLength};
    if (picked.path) file.path = picked.path;
    return file;
  } catch {
    couldNotOpen(picked.name);
    return null;
  }
}

export function createWorkspaceStore(kind: WorkspaceKind) {
  const history = createHistory<Snapshot>();
  let generation = 0; // bumped by every restart and replaceWith; a load that sees it change is stale
  const owned = new Set<FileId>(); // every file this workspace retained; removed files stay owned so undo can bring them back

  return createStore<WorkspaceState>()((set, get) => {
    const snapshot = ({files, pages, currentPage, selection}: Data): Snapshot => ({files, pages, currentPage, selection});

    const own = (loaded: Array<[SourceFile, Uint8Array]>) => {
      for (const [f, bytes] of loaded) {
        putBytes(f.id, bytes);
        retain(f.id, kind);
        owned.add(f.id);
      }
    };

    // Starts over with `next`, dropping history and every retained file except those in `next`.
    const restart = async (next: Data): Promise<void> => {
      const old = [...owned].filter((id) => !next.files.some((f) => f.id === id));
      old.forEach((id) => owned.delete(id));
      generation++;
      history.clear();
      set(next);
      await Promise.all(old.map((id) => release(id, kind)));
    };

    const edit = (change: (s: Data) => Partial<Snapshot>): void => {
      const s = get();
      if (s.exporting) return;
      const next = change(s);
      const pages = next.pages ?? s.pages;
      // Domain ops keep untouched page objects, so an edit with nothing to act on yields the same items.
      if (sameItems(pages, s.pages) && sameItems(next.files ?? s.files, s.files)) return;
      history.push(snapshot(s));
      const current = s.pages[s.currentPage]?.uid;
      const followed = pages.findIndex((p) => p.uid === current);
      set({
        ...next,
        selection: pruneSelection(next.selection ?? s.selection, pages),
        currentPage: followed === -1 ? clamp(s.currentPage, pages.length) : followed,
        workflow: 'review',
        completed: null
      });
    };

    const step = (take: (current: Snapshot) => Snapshot | null): void => {
      const s = get();
      if (s.exporting) return;
      const restored = take(snapshot(s));
      if (restored) set({...restored, workflow: 'review', completed: null});
    };

    return {
      ...blank(kind),

      async addFiles(picked) {
        if (get().exporting) return;
        const started = generation;
        const loaded: Array<[SourceFile, Uint8Array]> = [];
        for (const p of picked) {
          const file = await load(p);
          if (file) loaded.push([file, p.bytes]);
        }
        const files = loaded.map(([f]) => f);
        if (!files.length || get().exporting || generation !== started) return;
        own(loaded);
        edit((s) => ({files: [...s.files, ...files], pages: [...s.pages, ...files.flatMap((f) => pagesForFile(f))]}));
        useApp.getState().notify(`${files.length} PDF${files.length === 1 ? '' : 's'} added`);
      },

      async replaceWith(picked, recentId) {
        if (get().exporting) return;
        const started = ++generation;
        const file = await load(picked);
        if (!file || get().exporting || generation !== started) return;
        if (recentId) file.recentId = recentId;
        own([[file, picked.bytes]]);
        const fresh = blank(kind);
        await restart({...fresh, files: [file], pages: pagesForFile(file), workflow: 'review', exportSettings: {...fresh.exportSettings, name: picked.name}});
      },

      restore(record, bytes) {
        const loaded = record.files.flatMap((f): Array<[SourceFile, Uint8Array]> => {
          const b = bytes.get(f.id);
          return b ? [[f, b]] : [];
        });
        own(loaded);
        const {pages} = record;
        return restart({
          ...blank(kind), files: loaded.map(([f]) => f), pages, currentPage: clamp(record.currentPage, pages.length),
          selection: pruneSelection({uids: new Set(record.selection), anchor: record.anchor}, pages), exportSettings: record.exportSettings
        });
      },

      move: (targetIndex, uids = get().selection.uids) => edit((s) => ({pages: movePages(s.pages, uids, targetIndex)})),
      remove: (uids = get().selection.uids) => edit((s) => ({pages: deletePages(s.pages, uids)})),
      duplicate: (uids = get().selection.uids) => edit((s) => ({pages: duplicatePages(s.pages, uids)})),
      rotate: (delta, uids = get().selection.uids) => edit((s) => ({pages: rotatePages(s.pages, uids, delta)})),
      moveFile: (fileId, direction) => edit((s) => moveFileGroup(s.files, s.pages, fileId, direction)),
      moveFileTo: (fileId, to) => edit((s) => moveFileGroupTo(s.files, s.pages, fileId, to)),
      removeFile: (fileId) => edit((s) => ({files: s.files.filter((f) => f.id !== fileId), pages: removeFilePages(s.pages, fileId)})),

      undo: () => step(history.undo),
      redo: () => step(history.redo),
      canUndo: () => !get().exporting && history.canUndo(),
      canRedo: () => !get().exporting && history.canRedo(),

      select: (uid, mods) => set((s) => ({selection: clickSelect(s.selection, s.pages, uid, mods)})),
      selectAll: () => set((s) => ({selection: selectAll(s.pages)})),
      clearSelection: () => set({selection: clearSelection()}),
      goTo: (index) => set((s) => ({currentPage: clamp(index, s.pages.length)})),
      setRecentId: (fileId, recentId) => set((s) => (
        s.files.some((f) => f.id === fileId) ? {files: s.files.map((f) => (f.id === fileId ? {...f, recentId} : f))} : s
      )),
      setTab: (tab) => set({tab}),
      setWorkflow: (workflow) => set({workflow}),
      setZoom: (zoom) => set({zoom}),
      setShowOutput: (showOutput) => set({showOutput}),
      setExportSettings: (partial) => set((s) => ({exportSettings: {...s.exportSettings, ...partial}})),

      // Range modes (current/custom) are applied by the caller.
      snapshotForExport() {
        const s = get();
        const spec: ExportSpec = {
          pages: s.pages.map(({fileId, local, rotation}) => Object.freeze({fileId, local, rotation})),
          sources: Object.fromEntries(s.files.map((f) => [f.id, getBytes(f.id)])),
          title: exportTitle(s.files, s.exportSettings)
        };
        Object.freeze(spec.pages);
        Object.freeze(spec.sources); // the byte arrays themselves can't be frozen; export.ts copies them for the worker
        return Object.freeze(spec);
      },
      beginExport() {
        if (get().exporting) return false;
        set({exporting: true});
        return true;
      },
      endExport(result) {
        if (!result) return set({exporting: false, progress: null});
        set({exporting: false, progress: null, completed: result, workflow: kind === 'merge' ? 'done' : get().workflow});
      },
      reset: () => (get().exporting ? Promise.resolve() : restart(blank(kind)))
    };
  });
}
export type WorkspaceStore = ReturnType<typeof createWorkspaceStore>;
