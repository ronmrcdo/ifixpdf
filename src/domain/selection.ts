import type {PageInstance, PageUid, Selection} from './types';

export const clearSelection = (): Selection => ({uids: new Set(), anchor: null});

export const selectAll = (pages: PageInstance[]): Selection => ({
  uids: new Set(pages.map((p) => p.uid)),
  anchor: pages[0]?.uid ?? null
});

export function clickSelect(sel: Selection, pages: PageInstance[], uid: PageUid, mods: {ctrl: boolean; shift: boolean}): Selection {
  if (mods.shift && sel.anchor !== null) {
    const a = pages.findIndex((p) => p.uid === sel.anchor);
    const b = pages.findIndex((p) => p.uid === uid);
    if (a !== -1 && b !== -1) {
      const range = pages.slice(Math.min(a, b), Math.max(a, b) + 1).map((p) => p.uid);
      return {uids: new Set(range), anchor: sel.anchor};
    }
  }
  if (mods.ctrl) {
    const uids = new Set(sel.uids);
    if (!uids.delete(uid)) uids.add(uid);
    return {uids, anchor: uid};
  }
  return {uids: new Set([uid]), anchor: uid};
}

export function pruneSelection(sel: Selection, pages: PageInstance[]): Selection {
  const live = new Set(pages.map((p) => p.uid));
  return {
    uids: new Set([...sel.uids].filter((u) => live.has(u))),
    anchor: sel.anchor !== null && live.has(sel.anchor) ? sel.anchor : null
  };
}
