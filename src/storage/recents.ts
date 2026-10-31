import type {Platform} from '../platform/types';
import {FileMissingError} from '../platform/types';
import {ensureStores, openDb, req, withDb} from './idb';

export interface RecentEntry { id: string; name: string; pages: number; size: number; modified: number; thumbnail?: Blob; path?: string; missing?: boolean }
export interface RecentsRepository {
  list(): Promise<RecentEntry[]>;
  record(input: { name: string; bytes: Uint8Array; pages: number; path?: string; thumbnail?: Blob }): Promise<RecentEntry>;
  /** Sets the thumbnail of a row that still exists; no-op once it is gone. Never changes modified. */
  updateThumbnail(id: string, thumbnail: Blob): Promise<void>;
  open(id: string): Promise<{ entry: RecentEntry; bytes: Uint8Array }>;
  relocate(id: string, picked: { path: string; bytes: Uint8Array; name: string }): Promise<RecentEntry>;
  remove(id: string): Promise<void>;
}

type Row = RecentEntry & { key: string };
const STORES = ['recent-meta', 'recent-bytes'];
// v2: a legacy-app profile has this name at v1 with a different layout.
const open = () => openDb('ifixpdf-local-documents', 2, (db, t) => {
  ensureStores(db, {'recent-meta': {keyPath: 'id'}, 'recent-bytes': {}});
  const meta = t.objectStore('recent-meta');
  if (!meta.indexNames.contains('key')) meta.createIndex('key', 'key', {unique: true});
});

// shortcut: collapsing repeats also flattens a UNC `\\server` prefix; fine since both spellings map the same way.
const normalise = (p: string) => p.toLowerCase().replace(/\//g, '\\').replace(/\\+/g, '\\');
async function sha256(b: Uint8Array) {
  const d = await crypto.subtle.digest('SHA-256', new Uint8Array(b));
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, '0')).join('');
}
const publicEntry = (row: Row): RecentEntry => {
  const {key, ...entry} = row;
  void key;
  return entry;
};
const unknown = () => new Error('Unknown recent entry');

export function createRecents(platform: Platform): RecentsRepository {
  const native = platform.native;
  const keyOf = (bytes: Uint8Array, path?: string) => {
    if (!native) return sha256(bytes);
    if (!path) throw new Error('Native recents need a file path');
    return normalise(path);
  };
  const get = (t: IDBTransaction, id: string) => req<Row | undefined>(t.objectStore('recent-meta').get(id));
  // Writes row (and, in browser mode, bytes); drops any other row holding the same key.
  async function save(t: IDBTransaction, row: Row, bytes: Uint8Array) {
    const meta = t.objectStore('recent-meta');
    const other = await req<Row | undefined>(meta.index('key').get(row.key));
    if (other && other.id !== row.id) {
      meta.delete(other.id);
      t.objectStore('recent-bytes').delete(other.id);
    }
    meta.put(row);
    if (!native) t.objectStore('recent-bytes').put(bytes, row.id);
    return publicEntry(row);
  }

  return {
    async list() {
      const rows = await withDb(open, 'recent-meta', 'readonly', (t) => req<Row[]>(t.objectStore('recent-meta').getAll()));
      return rows.sort((a, b) => b.modified - a.modified).map(publicEntry);
    },
    async record({name, bytes, pages, path, thumbnail}) {
      const key = await keyOf(bytes, path);
      return withDb(open, STORES, 'readwrite', async (t) => {
        const old = await req<Row | undefined>(t.objectStore('recent-meta').index('key').get(key));
        const row: Row = {
          id: old?.id ?? crypto.randomUUID(), key, name, pages, size: bytes.byteLength, modified: Date.now(), path, thumbnail
        };
        return save(t, row, bytes);
      });
    },
    async open(id) {
      const row = await withDb(open, 'recent-meta', 'readonly', (t) => get(t, id));
      if (!row) throw unknown();
      const setMissing = (missing: boolean) => withDb(open, 'recent-meta', 'readwrite', async (t) => {
        const cur = await get(t, id);
        if (!cur) return;
        if (missing) cur.missing = true; else delete cur.missing;
        t.objectStore('recent-meta').put(cur);
      });
      if (!native) {
        const bytes = await withDb(open, 'recent-bytes', 'readonly', (t) => req<Uint8Array | undefined>(t.objectStore('recent-bytes').get(id)));
        if (!bytes) throw unknown();
        return {entry: publicEntry(row), bytes};
      }
      let bytes: Uint8Array;
      try {
        bytes = await platform.readPath(row.path ?? '');
      } catch (e) {
        if (e instanceof FileMissingError) await setMissing(true);
        throw e;
      }
      if (row.missing) await setMissing(false);
      return {entry: publicEntry({...row, missing: undefined}), bytes};
    },
    async relocate(id, picked) {
      const key = await keyOf(picked.bytes, picked.path);
      return withDb(open, STORES, 'readwrite', async (t) => {
        const cur = await get(t, id);
        if (!cur) throw unknown();
        const row: Row = {...cur, key, path: picked.path, name: picked.name, size: picked.bytes.byteLength, modified: Date.now()};
        delete row.missing;
        return save(t, row, picked.bytes);
      });
    },
    async updateThumbnail(id, thumbnail) {
      await withDb(open, 'recent-meta', 'readwrite', async (t) => {
        const cur = await get(t, id);
        if (cur) t.objectStore('recent-meta').put({...cur, thumbnail});
      });
    },
    async remove(id) {
      await withDb(open, STORES, 'readwrite', (t) => {
        STORES.forEach((s) => t.objectStore(s).delete(id));
      });
    }
  };
}
