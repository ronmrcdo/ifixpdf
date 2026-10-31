// Import-free on purpose: registry calls releaseFile directly, so URL revocation
// never depends on who imported thumbnails.ts (and there is no import cycle).
const MAX_ENTRIES = 300;
const urls = new Map<string, string>(); // insertion order = LRU order
const inflight = new Map<string, Promise<string>>();
const epochs = new Map<string, number>(); // bumped on release; invalidates builds started earlier

const epochOf = (fileId: string): number => epochs.get(fileId) ?? 0;

/** Cached URL for key, else share/start build(). A build that outlives its file's release is revoked, not stored. */
export function cached(fileId: string, key: string, build: () => Promise<string>): Promise<string> {
  const hit = urls.get(key);
  if (hit) {
    urls.delete(key);
    urls.set(key, hit);
    return Promise.resolve(hit);
  }
  let pending = inflight.get(key);
  if (!pending) {
    const started = epochOf(fileId);
    const mine: Promise<string> = build()
      .then((url) => {
        if (epochOf(fileId) !== started) {
          URL.revokeObjectURL(url);
          throw new Error('File released');
        }
        urls.set(key, url);
        if (urls.size > MAX_ENTRIES) {
          const [oldKey, oldUrl] = urls.entries().next().value as [string, string];
          urls.delete(oldKey);
          URL.revokeObjectURL(oldUrl);
        }
        return url;
      })
      .finally(() => {
        if (inflight.get(key) === mine) inflight.delete(key);
      });
    pending = mine;
    inflight.set(key, pending);
  }
  return pending;
}

export function releaseFile(fileId: string): void {
  epochs.set(fileId, epochOf(fileId) + 1);
  const prefix = `${fileId}:`;
  for (const key of inflight.keys()) if (key.startsWith(prefix)) inflight.delete(key);
  for (const [key, url] of urls) {
    if (!key.startsWith(prefix)) continue;
    urls.delete(key);
    URL.revokeObjectURL(url);
  }
}
