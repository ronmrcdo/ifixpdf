import {ensureStores, openDb, req, withDb} from './idb';

export interface Prefs {
  openAfter: boolean;
}

const open = () => openDb('ifixpdf-prefs', 1, (db) => ensureStores(db, {prefs: {}}));

export async function readPrefs(): Promise<Prefs | null> {
  const v = await withDb(open, 'prefs', 'readonly', (t) =>
    req<unknown>(t.objectStore('prefs').get('app')),
  );
  if (typeof v !== 'object' || v === null || !('openAfter' in v)) return null;
  return typeof v.openAfter === 'boolean' ? {openAfter: v.openAfter} : null;
}

export function writePrefs(p: Prefs): Promise<void> {
  return withDb(open, 'prefs', 'readwrite', (t) => {
    t.objectStore('prefs').put({openAfter: p.openAfter}, 'app');
  });
}
