import {IDBFactory} from 'fake-indexeddb';
import {beforeEach, describe, expect, it} from 'vitest';
import {openDb, req, tx} from './idb';
import {readPrefs, writePrefs} from './prefs';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('prefs', () => {
  it('reads null when nothing is stored', async () => {
    expect(await readPrefs()).toBeNull();
  });

  it('round-trips a write', async () => {
    await writePrefs({openAfter: false});
    expect(await readPrefs()).toEqual({openAfter: false});
  });

  it('reads a malformed record as null', async () => {
    await writePrefs({openAfter: true});
    const db = await openDb('ifixpdf-prefs', 1, () => {});
    await tx(db, 'prefs', 'readwrite', (t) =>
      req(t.objectStore('prefs').put({openAfter: 'no'}, 'app')),
    );
    db.close();
    expect(await readPrefs()).toBeNull();
  });
});
