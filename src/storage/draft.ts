import type {Fills} from '../domain/markup';
import type {ExportSettings, FileId, PageInstance, PageUid, SourceFile} from '../domain/types';
import {ensureStores, openDb, req, withDb} from './idb';
import {PNG_PREFIX} from './signatures';

export interface DraftRecord {
  files: SourceFile[];
  pages: PageInstance[];
  currentPage: number;
  view: 'preview' | 'edit';
  selection: PageUid[];
  anchor: PageUid | null;
  exportSettings: ExportSettings;
  /** Absent in drafts saved before form fill. */
  fills?: Fills;
  savedAt: number;
}

const STORES = ['draft', 'draft-files'];
// v2: a legacy-app profile has this name at v1 with only `draft`, holding legacy-shaped records; drop them (no migration).
const open = () =>
  openDb('ifixpdf-workspace-draft', 2, (db, t) => {
    ensureStores(db, {draft: {}, 'draft-files': {}});
    t.objectStore('draft').clear();
  });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const MARKS = new Set(['cross', 'check', 'dot', 'redact']);
const isRect = (r: unknown) =>
  isObj(r) && [r.x, r.y, r.w, r.h].every((n) => typeof n === 'number' && Number.isFinite(n));
// Enough to draw and export it; a bad item would crash the overlay or fail every save.
const isMarkup = (m: unknown) => {
  if (!isObj(m) || typeof m.id !== 'string' || !isRect(m.rect) || typeof m.angle !== 'number')
    return false;
  if (m.kind === 'text') return typeof m.text === 'string' && typeof m.size === 'number';
  if (m.kind === 'signature') return typeof m.image === 'string' && m.image.startsWith(PNG_PREFIX);
  return typeof m.kind === 'string' && MARKS.has(m.kind);
};
const isFills = (f: unknown) =>
  isObj(f) &&
  Object.values(f).every(
    (vals) =>
      isObj(vals) &&
      Object.values(vals).every((x) => typeof x === 'string' || typeof x === 'boolean'),
  );

// Shape check for a record from storage; page.local must exist in its file, markup and fills must draw.
export function isDraftRecord(v: unknown): v is DraftRecord {
  if (!isObj(v) || !Array.isArray(v.files) || !Array.isArray(v.pages)) return false;
  if (v.fills !== undefined && !isFills(v.fills)) return false;
  if (!Array.isArray(v.selection) || !isObj(v.exportSettings)) return false;
  if (v.view !== 'preview' && v.view !== 'edit') return false;
  if (typeof v.currentPage !== 'number') return false;
  const pagesOf = new Map<unknown, unknown>();
  for (const f of v.files) {
    if (!isObj(f)) return false;
    pagesOf.set(f.id, f.pages);
  }
  return v.pages.every((p) => {
    const n = isObj(p) ? pagesOf.get(p.fileId) : undefined;
    return (
      isObj(p) &&
      typeof n === 'number' &&
      typeof p.local === 'number' &&
      p.local >= 0 &&
      p.local < n &&
      (p.markup === undefined || (Array.isArray(p.markup) && p.markup.every(isMarkup)))
    );
  });
}

export function readDraft(): Promise<{record: DraftRecord; bytes: Map<FileId, Uint8Array>} | null> {
  return withDb(open, STORES, 'readwrite', async (t) => {
    const record = await req<unknown>(t.objectStore('draft').get('document'));
    if (!record) return null;
    if (!isDraftRecord(record)) {
      t.objectStore('draft').clear(); // damaged or from an older build
      t.objectStore('draft-files').clear();
      return null;
    }
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
