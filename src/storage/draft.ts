import type {ExportSettings, FileId, PageInstance, PageUid, SourceFile} from '../domain/types';
import {ensureStores, openDb, req, withDb} from './idb';

export interface DraftRecord {
  files: SourceFile[];
  pages: PageInstance[];
  currentPage: number;
  view: 'preview' | 'edit';
  selection: PageUid[];
  anchor: PageUid | null;
  exportSettings: ExportSettings;
  savedAt: number;
}

const STORES = ['draft', 'draft-files'];
// v2: a legacy-app profile has this name at v1 with only `draft`, holding legacy-shaped records; drop them (no migration).
const open = () =>
  openDb('ifixpdf-workspace-draft', 2, (db, t) => {
    ensureStores(db, {draft: {}, 'draft-files': {}});
    t.objectStore('draft').clear();
  });

export function readDraft(): Promise<{record: DraftRecord; bytes: Map<FileId, Uint8Array>} | null> {
  return withDb(open, STORES, 'readwrite', async (t) => {
    const record = await req<DraftRecord | undefined>(t.objectStore('draft').get('document'));
    if (!record) return null;
    const bytes = new Map<FileId, Uint8Array>();
    for (const f of record.files) {
      const b = await req<Uint8Array | undefined>(t.objectStore('draft-files').get(f.id));
      if (b) bytes.set(f.id, b);
    }
    if (bytes.size === record.files.length) return {record, bytes};
    t.objectStore('draft').clear(); // a draft with lost bytes can't be restored
    t.objectStore('draft-files').clear();
    return null;
  });
}

export function writeDraft(record: DraftRecord, bytes: Map<FileId, Uint8Array>): Promise<void> {
  return withDb(open, STORES, 'readwrite', async (t) => {
    const store = t.objectStore('draft-files');
    const stored = new Set(await req(store.getAllKeys()));
    const wanted = new Set(record.files.map((f) => f.id));
    for (const id of stored) if (!wanted.has(String(id))) store.delete(id);
    for (const id of wanted) {
      if (stored.has(id)) continue;
      const b = bytes.get(id);
      if (!b) throw new Error(`Missing bytes for draft file ${id}`);
      store.put(b, id);
    }
    t.objectStore('draft').put(record, 'document');
  });
}

export function clearDraft(): Promise<void> {
  return withDb(open, STORES, 'readwrite', (t) => {
    STORES.forEach((s) => t.objectStore(s).clear());
  });
}
