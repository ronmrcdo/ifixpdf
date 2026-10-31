import {IDBFactory} from 'fake-indexeddb';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {FileMissingError, type Platform} from '../platform/types';
import {createRecents} from './recents';
import {openDb, req, tx} from './idb';

const bytes = (...n: number[]) => new Uint8Array(n);
function fake(native: boolean, readPath: Platform['readPath'] = async () => bytes(1)): Platform {
  return {native, readPath} as Platform; // only the members recents uses
}
function count(store: string) {
  return new Promise<number>((resolve, reject) => {
    const r = indexedDB.open('ifixpdf-local-documents', 2);
    r.onsuccess = () => {
      const q = r.result.transaction(store).objectStore(store).count();
      q.onsuccess = () => {
        r.result.close();
        resolve(q.result);
      };
      q.onerror = () => reject(q.error);
    };
  });
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('native recents', () => {
  it('dedupes by normalised path, updates modified and lists first', async () => {
    const now = vi.spyOn(Date, 'now'); // fake timers would stall fake-indexeddb
    const repo = createRecents(fake(true));
    now.mockReturnValue(1000);
    const a = await repo.record({
      name: 'A.pdf',
      bytes: bytes(1),
      pages: 1,
      path: 'C:\\Docs\\A.pdf',
    });
    await repo.record({name: 'B.pdf', bytes: bytes(2), pages: 1, path: 'C:\\Docs\\B.pdf'});
    now.mockReturnValue(2000);
    const again = await repo.record({
      name: 'a.pdf',
      bytes: bytes(1),
      pages: 3,
      path: 'c:/docs//a.pdf',
    });
    now.mockRestore();
    expect(again.id).toBe(a.id);
    const list = await repo.list();
    expect(list.map((e) => e.name)).toEqual(['a.pdf', 'B.pdf']);
    expect(list[0]).toMatchObject({pages: 3, modified: 2000, path: 'c:/docs//a.pdf'});
  });
  it('updateThumbnail sets the thumbnail without touching modified or order, and is a no-op for a gone id', async () => {
    const repo = createRecents(fake(true));
    const a = await repo.record({name: 'A', bytes: bytes(1), pages: 1, path: 'C:\\A.pdf'});
    await repo.record({name: 'B', bytes: bytes(2), pages: 1, path: 'C:\\B.pdf'});
    const before = await repo.list();
    const t = new Blob(['t']);
    await repo.updateThumbnail(a.id, t);
    const after = await repo.list();
    expect(after.map((e) => [e.name, e.modified])).toEqual(before.map((e) => [e.name, e.modified]));
    expect(after.find((e) => e.id === a.id)?.thumbnail).toBeDefined();
    await repo.remove(a.id);
    await repo.updateThumbnail(a.id, t);
    expect((await repo.list()).map((e) => e.name)).toEqual(['B']);
    expect(await count('recent-bytes')).toBe(0);
  });
  it('never writes recent-bytes and requires a path', async () => {
    const repo = createRecents(fake(true));
    await repo.record({name: 'A.pdf', bytes: bytes(1), pages: 1, path: 'C:\\A.pdf'});
    expect(await count('recent-bytes')).toBe(0);
    await expect(repo.record({name: 'x', bytes: bytes(1), pages: 1})).rejects.toThrow(/path/);
  });
  it('drops the stale thumbnail when the new record has none (Home re-renders it)', async () => {
    const repo = createRecents(fake(true));
    const thumbnail = new Blob(['t']);
    await repo.record({name: 'A', bytes: bytes(1), pages: 1, path: 'C:\\A.pdf', thumbnail});
    await repo.record({name: 'A', bytes: bytes(1), pages: 1, path: 'C:\\A.pdf'});
    expect((await repo.list())[0]?.thumbnail).toBeUndefined();
  });
  it('open reads the path; a missing file marks the entry and rejects; success clears it', async () => {
    let missing = true;
    const repo = createRecents(
      fake(true, async () => {
        if (missing) throw new FileMissingError('gone');
        return bytes(9);
      }),
    );
    const e = await repo.record({name: 'A', bytes: bytes(1), pages: 1, path: 'C:\\A.pdf'});
    await expect(repo.open(e.id)).rejects.toBeInstanceOf(FileMissingError);
    expect((await repo.list())[0]?.missing).toBe(true);
    missing = false;
    const opened = await repo.open(e.id);
    expect([...opened.bytes]).toEqual([9]);
    expect((await repo.list())[0]?.missing).toBeUndefined();
  });
  it('open rethrows non-missing errors without marking and rejects unknown ids', async () => {
    const repo = createRecents(
      fake(true, async () => {
        throw new Error('boom');
      }),
    );
    const e = await repo.record({name: 'A', bytes: bytes(1), pages: 1, path: 'C:\\A.pdf'});
    await expect(repo.open(e.id)).rejects.toThrow('boom');
    expect((await repo.list())[0]?.missing).toBeUndefined();
    await expect(repo.open('nope')).rejects.toThrow(/unknown/i);
  });
  it('relocate clears missing, updates path, and drops a duplicate of the new path', async () => {
    const repo = createRecents(
      fake(true, async () => {
        throw new FileMissingError('gone');
      }),
    );
    const e = await repo.record({name: 'A', bytes: bytes(1), pages: 1, path: 'C:\\A.pdf'});
    await repo.record({name: 'Z', bytes: bytes(1), pages: 1, path: 'D:\\Z.pdf'});
    await expect(repo.open(e.id)).rejects.toThrow();
    const r = await repo.relocate(e.id, {path: 'D:/z.pdf', bytes: bytes(1, 2), name: 'z.pdf'});
    expect(r).toMatchObject({id: e.id, path: 'D:/z.pdf', name: 'z.pdf', size: 2});
    expect(r.missing).toBeUndefined();
    const list = await repo.list();
    expect(list).toHaveLength(1);
    await expect(repo.relocate('nope', {path: 'x', bytes: bytes(1), name: 'x'})).rejects.toThrow(
      /unknown/i,
    );
  });
  it('remove deletes the meta', async () => {
    const repo = createRecents(fake(true));
    const e = await repo.record({name: 'A', bytes: bytes(1), pages: 1, path: 'C:\\A.pdf'});
    await repo.remove(e.id);
    expect(await repo.list()).toEqual([]);
  });
});

describe('browser recents', () => {
  it('dedupes identical bytes under different names, keeping the latest name', async () => {
    const repo = createRecents(fake(false));
    const a = await repo.record({name: 'one.pdf', bytes: bytes(1, 2), pages: 2});
    const b = await repo.record({name: 'two.pdf', bytes: bytes(1, 2), pages: 2});
    expect(b.id).toBe(a.id);
    expect((await repo.list()).map((e) => e.name)).toEqual(['two.pdf']);
    expect(await count('recent-bytes')).toBe(1);
  });
  it('open returns stored bytes; remove deletes meta and bytes', async () => {
    const repo = createRecents(fake(false));
    const e = await repo.record({name: 'a', bytes: bytes(7, 8), pages: 1});
    expect([...(await repo.open(e.id)).bytes]).toEqual([7, 8]);
    await repo.remove(e.id);
    expect(await repo.list()).toEqual([]);
    expect(await count('recent-bytes')).toBe(0);
  });
  it('different bytes make different entries', async () => {
    const repo = createRecents(fake(false));
    await repo.record({name: 'a', bytes: bytes(1), pages: 1});
    await repo.record({name: 'b', bytes: bytes(2), pages: 1});
    expect(await repo.list()).toHaveLength(2);
  });
});

describe('legacy profile', () => {
  it('upgrades a legacy v1 database (store `recent`): list and record work, legacy store is dropped', async () => {
    const legacy = await openDb('ifixpdf-local-documents', 1, (d) => {
      d.createObjectStore('recent', {keyPath: 'id'});
    });
    legacy.close();
    const repo = createRecents(fake(true));
    expect(await repo.list()).toEqual([]);
    await repo.record({name: 'A.pdf', bytes: bytes(1), pages: 1, path: 'C:\\A.pdf'});
    expect((await repo.list()).map((e) => e.name)).toEqual(['A.pdf']);
    const db = await openDb('ifixpdf-local-documents', 2, () => {});
    expect([...db.objectStoreNames].sort()).toEqual(['recent-bytes', 'recent-meta']);
    db.close();
  });
  it('keeps existing v1 stores and rows that already use the new layout', async () => {
    const v1 = await openDb('ifixpdf-local-documents', 1, (d) => {
      d.createObjectStore('recent-meta', {keyPath: 'id'}).createIndex('key', 'key', {unique: true});
      d.createObjectStore('recent-bytes');
    });
    await tx(v1, 'recent-meta', 'readwrite', (t) => {
      t.objectStore('recent-meta').put({
        id: 'x',
        key: 'c:\\x.pdf',
        name: 'X.pdf',
        pages: 1,
        size: 1,
        modified: 1,
      });
    });
    v1.close();
    expect((await createRecents(fake(true)).list()).map((e) => e.id)).toEqual(['x']);
  });
});

describe('idb tx', () => {
  it('rejects when a request violates a unique index', async () => {
    const db = await openDb('t', 1, (d) =>
      d.createObjectStore('s', {keyPath: 'id'}).createIndex('k', 'k', {unique: true}),
    );
    await expect(
      tx(db, 's', 'readwrite', (t) => {
        t.objectStore('s').put({id: 1, k: 'x'});
        t.objectStore('s').put({id: 2, k: 'x'});
      }),
    ).rejects.toMatchObject({name: 'ConstraintError'});
    db.close();
  });
  it('rejects with a real error on an explicit abort', async () => {
    const db = await openDb('t3', 1, (d) => {
      d.createObjectStore('s');
    });
    await expect(
      tx(db, 's', 'readwrite', (t) => {
        t.abort();
      }),
    ).rejects.toBeInstanceOf(Error);
    db.close();
  });
  it('aborts and rejects when fn throws', async () => {
    const db = await openDb('t2', 1, (d) => {
      d.createObjectStore('s');
    });
    await expect(
      tx(db, 's', 'readwrite', async (t) => {
        t.objectStore('s').put(1, 'a');
        throw new Error('bad');
      }),
    ).rejects.toThrow('bad');
    expect(await tx(db, 's', 'readonly', (t) => req(t.objectStore('s').count()))).toBe(0);
    db.close();
  });
});
