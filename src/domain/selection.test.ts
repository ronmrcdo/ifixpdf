import {describe, expect, it} from 'vitest';
import {clearSelection, clickSelect, pruneSelection, selectAll} from './selection';
import type {PageInstance, Selection} from './types';

const pages: PageInstance[] = ['a', 'b', 'c', 'd'].map((uid, local) => ({uid, fileId: 'f', local, rotation: 0}));
const sel = (anchor: string | null, ...u: string[]): Selection => ({uids: new Set(u), anchor});
const plain = {ctrl: false, shift: false};

describe('clickSelect', () => {
  it('plain click selects only x and anchors', () => {
    const out = clickSelect(sel('a', 'a', 'b'), pages, 'c', plain);
    expect([...out.uids]).toEqual(['c']);
    expect(out.anchor).toBe('c');
  });
  it('ctrl toggles on and off', () => {
    const on = clickSelect(sel('a', 'a'), pages, 'c', {ctrl: true, shift: false});
    expect([...on.uids].sort()).toEqual(['a', 'c']);
    expect(on.anchor).toBe('c');
    const off = clickSelect(on, pages, 'c', {ctrl: true, shift: false});
    expect([...off.uids]).toEqual(['a']);
  });
  it('shift selects anchor..target inclusive, forwards', () => {
    const out = clickSelect(sel('a', 'a'), pages, 'c', {ctrl: false, shift: true});
    expect([...out.uids]).toEqual(['a', 'b', 'c']);
    expect(out.anchor).toBe('a');
  });
  it('shift selects backwards', () => {
    const out = clickSelect(sel('d', 'd'), pages, 'b', {ctrl: false, shift: true});
    expect([...out.uids].sort()).toEqual(['b', 'c', 'd']);
  });
  it('shift with null anchor acts like a plain click', () => {
    const out = clickSelect(sel(null), pages, 'c', {ctrl: false, shift: true});
    expect([...out.uids]).toEqual(['c']);
    expect(out.anchor).toBe('c');
  });
  it('shift with an anchor that no longer exists acts like a plain click', () => {
    const out = clickSelect(sel('gone', 'gone'), pages, 'c', {ctrl: false, shift: true});
    expect([...out.uids]).toEqual(['c']);
  });
  it('does not mutate the previous selection', () => {
    const prev = sel('a', 'a');
    clickSelect(prev, pages, 'b', {ctrl: true, shift: false});
    expect([...prev.uids]).toEqual(['a']);
  });
});

describe('selectAll / clearSelection', () => {
  it('selects every page', () => {
    expect([...selectAll(pages).uids]).toEqual(['a', 'b', 'c', 'd']);
  });
  it('selectAll of nothing is empty with null anchor', () => {
    expect(selectAll([])).toEqual({uids: new Set(), anchor: null});
  });
  it('clear gives empty selection', () => {
    expect(clearSelection()).toEqual({uids: new Set(), anchor: null});
  });
});

describe('pruneSelection', () => {
  it('drops uids that no longer exist', () => {
    const out = pruneSelection(sel('a', 'a', 'x', 'c'), pages);
    expect([...out.uids]).toEqual(['a', 'c']);
    expect(out.anchor).toBe('a');
  });
  it('nulls a vanished anchor', () => {
    expect(pruneSelection(sel('x', 'x', 'b'), pages).anchor).toBeNull();
  });
  it('empties when there are no pages', () => {
    expect(pruneSelection(sel('a', 'a'), []).uids.size).toBe(0);
  });
});
