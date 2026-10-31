export function openDb(name: string, version: number, upgrade: (db: IDBDatabase, t: IDBTransaction) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, version);
    r.onupgradeneeded = () => { if (r.transaction) upgrade(r.result, r.transaction); };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

// Resolves with fn's value once the transaction commits; rejects on error, abort, or if fn throws (which aborts).
export function tx<T>(
  db: IDBDatabase, stores: string | string[], mode: IDBTransactionMode, fn: (t: IDBTransaction) => T | Promise<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, mode);
    let value: T;
    t.oncomplete = () => resolve(value);
    t.onabort = () => reject(t.error ?? new Error('transaction aborted')); // a failed request aborts the tx, so t.error is set by now
    Promise.resolve(fn(t)).then((v) => { value = v; }, (e: unknown) => {
      reject(e);
      try { t.abort(); } catch { /* already finished */ }
    });
  });
}

// Opens, runs one transaction, closes.
export async function withDb<T>(
  open: () => Promise<IDBDatabase>, stores: string | string[], mode: IDBTransactionMode,
  fn: (t: IDBTransaction) => T | Promise<T>
): Promise<T> {
  const db = await open();
  try { return await tx(db, stores, mode, fn); } finally { db.close(); }
}

// Idempotent upgrade: creates missing stores, drops any store not listed (legacy layouts). Data is not migrated.
export function ensureStores(db: IDBDatabase, stores: Record<string, IDBObjectStoreParameters>): void {
  for (const name of [...db.objectStoreNames]) if (!(name in stores)) db.deleteObjectStore(name);
  for (const [name, params] of Object.entries(stores)) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, params);
}
