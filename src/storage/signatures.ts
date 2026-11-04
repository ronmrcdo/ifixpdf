import {ensureStores, openDb, req, withDb} from './idb';

export interface SavedSignature {
  id: string;
  png: string;
  createdAt: number;
}

export const PNG_PREFIX = 'data:image/png;base64,';
const open = () =>
  openDb('ifixpdf-signatures', 1, (db) => ensureStores(db, {signatures: {keyPath: 'id'}}));

function isSignature(v: unknown): v is SavedSignature {
  if (typeof v !== 'object' || v === null) return false;
  const {id, png, createdAt} = v as Partial<Record<keyof SavedSignature, unknown>>;
  return (
    typeof id === 'string' &&
    typeof png === 'string' &&
    png.startsWith(PNG_PREFIX) &&
    typeof createdAt === 'number'
  );
}

export async function listSignatures(): Promise<SavedSignature[]> {
  try {
    const all = await withDb(open, 'signatures', 'readonly', (t) =>
      req<unknown[]>(t.objectStore('signatures').getAll()),
    );
    return all.filter(isSignature).sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function saveSignature(png: string): Promise<SavedSignature> {
  const sig = {id: crypto.randomUUID(), png, createdAt: Date.now()};
  await withDb(open, 'signatures', 'readwrite', (t) => {
    t.objectStore('signatures').put(sig);
  });
  return sig;
}

export function deleteSignature(id: string): Promise<void> {
  return withDb(open, 'signatures', 'readwrite', (t) => {
    t.objectStore('signatures').delete(id);
  });
}
