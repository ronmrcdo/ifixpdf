export function createHistory<T>(limit = 40) {
  let past: T[] = [];
  let future: T[] = [];
  return {
    push(s: T): void {
      past.push(s);
      if (past.length > limit) past.shift();
      future = [];
    },
    undo(current: T): T | null {
      const s = past.pop();
      if (s === undefined) return null;
      future.push(current);
      return s;
    },
    redo(current: T): T | null {
      const s = future.pop();
      if (s === undefined) return null;
      past.push(current);
      return s;
    },
    clear(): void {
      past = [];
      future = [];
    },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
  };
}
