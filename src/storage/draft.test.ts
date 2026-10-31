import {IDBFactory} from 'fake-indexeddb';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {PageInstance, SourceFile} from '../domain/types';
import {clearDraft, readDraft, writeDraft, type DraftRecord} from './draft';
import {openDb, req, tx} from './idb';

const file = (id: string): SourceFile => ({id, name: `${id}.pdf`, pages: 1, size: 1});
const page = (fileId: string): PageInstance => ({
  uid: `u-${fileId}`,
  fileId,
  local: 0,
  rotation: 0,
});
const record = (...ids: string[]): DraftRecord => ({
  files: ids.map(file),
  pages: ids.map(page),
  currentPage: 0,
  view: 'edit',
  selection: [],
  anchor: null,
  exportSettings: {name: 'x', rangeMode: 'all', customRange: '', useFileNamesAsTitle: false},
  savedAt: 1,
});
const bytesOf = (...ids: string[]) => new Map(ids.map((id, i) => [id, new Uint8Array([i + 1])]));

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
afterEach(() => vi.restoreAllMocks());

describe('draft', () => {
  it('round-trips the record and bytes', async () => {
    await writeDraft(record('a', 'b'), bytesOf('a', 'b'));
    const d = await readDraft();
    expect(d?.record).toEqual(record('a', 'b'));
    expect([...(d?.bytes.get('b') ?? [])]).toEqual([2]);
  });
  it('is null when nothing is stored', async () => {
    expect(await readDraft()).toBeNull();
  });
  it('writes draft-files once for an unchanged FileId', async () => {
    const put = vi.spyOn(IDBObjectStore.prototype, 'put');
    await writeDraft(record('a'), bytesOf('a'));
    await writeDraft(record('a'), bytesOf('a'));
    const filePuts = put.mock.calls.length - 2; // two 'document' record puts
    expect(filePuts).toBe(1);
  });
  it('deletes bytes of files no longer referenced', async () => {
    await writeDraft(record('a', 'b'), bytesOf('a', 'b'));
    await writeDraft(record('a'), bytesOf('a'));
    const d = await readDraft();
    expect([...(d?.bytes.keys() ?? [])]).toEqual(['a']);
    await writeDraft(record('c'), bytesOf('c'));
    expect([...((await readDraft())?.bytes.keys() ?? [])]).toEqual(['c']);
  });
  it('rejects, leaving the old draft, when bytes for a new file are missing', async () => {
    await writeDraft(record('a'), bytesOf('a'));
    await expect(writeDraft(record('a', 'b'), bytesOf('a'))).rejects.toThrow(/bytes/);
    expect((await readDraft())?.record.files).toHaveLength(1);
  });
  it('returns null and clears when referenced bytes are missing', async () => {
    await writeDraft(record('a'), bytesOf('a'));
    const r = indexedDB.open('ifixpdf-workspace-draft', 2);
    await new Promise<void>((resolve) => {
      r.onsuccess = () => {
        const t = r.result.transaction('draft-files', 'readwrite');
        t.objectStore('draft-files').clear();
        t.oncomplete = () => {
          r.result.close();
          resolve();
        };
      };
    });
    expect(await readDraft()).toBeNull();
    const db = await new Promise<IDBDatabase>((resolve) => {
      const o = indexedDB.open('ifixpdf-workspace-draft', 2);
      o.onsuccess = () => resolve(o.result);
    });
    const left = await new Promise((resolve) => {
      const c = db.transaction('draft').objectStore('draft').count();
      c.onsuccess = () => resolve(c.result);
    });
    db.close();
    expect(left).toBe(0);
    await writeDraft(record('z'), bytesOf('z'));
    expect((await readDraft())?.record.files[0]?.id).toBe('z');
  });
  it('upgrades a legacy v1 database (only store `draft`): read and write work', async () => {
    const legacy = await openDb('ifixpdf-workspace-draft', 1, (d) => {
      d.createObjectStore('draft');
    });
    // a legacy-shaped draft (no `pages`, no draft-files) must not be restored
    await tx(legacy, 'draft', 'readwrite', (t) => {
      t.objectStore('draft').put(
        {files: [], pageOrder: null, view: 'preview', savedAt: 1},
        'document',
      );
    });
    legacy.close();
    expect(await readDraft()).toBeNull();
    await writeDraft(record('a'), bytesOf('a'));
    expect((await readDraft())?.record.files[0]?.id).toBe('a');
  });
  it.each([
    ['no pages', () => ({...record('a'), pages: undefined})],
    ['an unknown view', () => ({...record('a'), view: 'settings'})],
    ['a page past its file', () => ({...record('a'), pages: [{...page('a'), local: 5}]})],
  ])('drops a damaged draft (%s) and clears both stores', async (_n, bad) => {
    await writeDraft(record('a'), bytesOf('a'));
    const db = await openDb('ifixpdf-workspace-draft', 2, () => {});
    await tx(db, 'draft', 'readwrite', (t) => {
      t.objectStore('draft').put(bad(), 'document');
    });
    expect(await readDraft()).toBeNull();
    const counts = await tx(db, ['draft', 'draft-files'], 'readonly', async (t) => [
      await req(t.objectStore('draft').count()),
      await req(t.objectStore('draft-files').count()),
    ]);
    db.close();
    expect(counts).toEqual([0, 0]);
  });
  it('clearDraft empties everything', async () => {
    await writeDraft(record('a'), bytesOf('a'));
    await clearDraft();
    expect(await readDraft()).toBeNull();
  });
});
