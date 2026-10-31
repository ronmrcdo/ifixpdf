const store = new Map<string, Uint8Array>();

export const putBytes = (id: string, bytes: Uint8Array): void => void store.set(id, bytes);
export const dropBytes = (id: string): void => void store.delete(id);
export function getBytes(id: string): Uint8Array {
  const bytes = store.get(id);
  if (!bytes) throw new Error(`No bytes for file ${id}`);
  return bytes;
}
