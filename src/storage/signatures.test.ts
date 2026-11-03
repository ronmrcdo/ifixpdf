import {IDBFactory} from 'fake-indexeddb';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import {openDb, req, tx} from './idb';
import {deleteSignature, listSignatures, saveSignature} from './signatures';

const PNG = 'data:image/png;base64,AAAA';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

async function putRaw(record: unknown) {
  const db = await openDb('ifixpdf-signatures', 1, () => {});
  await tx(db, 'signatures', 'readwrite', (t) => req(t.objectStore('signatures').put(record)));
  db.close();
}

describe('signatures', () => {
  it('lists nothing when empty', async () => {
    expect(await listSignatures()).toEqual([]);
  });

  it('lists saved signatures newest first', async () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1).mockReturnValueOnce(2);
    const a = await saveSignature(PNG);
    const b = await saveSignature(`${PNG}B`);
    vi.restoreAllMocks();
    expect(a).toMatchObject({png: PNG, createdAt: 1});
    expect((await listSignatures()).map((s) => s.id)).toEqual([b.id, a.id]);
  });

  it('deletes one', async () => {
    const a = await saveSignature(PNG);
    const b = await saveSignature(PNG);
    await deleteSignature(a.id);
    expect((await listSignatures()).map((s) => s.id)).toEqual([b.id]);
  });

  it('skips malformed records', async () => {
    await saveSignature(PNG);
    await putRaw({id: 1});
    await putRaw({id: 'x', png: 'https://evil/x.png', createdAt: 1});
    await putRaw({id: 'y', png: PNG, createdAt: 'now'});
    expect(await listSignatures()).toHaveLength(1);
  });

  it('resolves [] when the database cannot open', async () => {
    globalThis.indexedDB = {
      open: () => {
        throw new Error('blocked');
      },
    } as unknown as IDBFactory;
    expect(await listSignatures()).toEqual([]);
  });
});
