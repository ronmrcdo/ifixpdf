let inFlight = 0;

/** Marks an export as in flight until it settles, so an update install can wait for it. */
export function track<T>(p: Promise<T>): Promise<T> {
  inFlight++;
  return p.finally(() => inFlight--);
}

export const busy = (): boolean => inFlight > 0;
