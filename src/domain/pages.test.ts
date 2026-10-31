import {describe, expect, it} from 'vitest';
import {deletePages, dropTarget, duplicatePages, moveFile, moveFileTo, movePages, pagesForFile, removeFile, rotatePages} from './pages';
import type {PageInstance, Rotation, SourceFile} from './types';

const pg = (uid: string, fileId = 'f', local = 0, rotation: Rotation = 0): PageInstance => ({uid, fileId, local, rotation});
const uids = (pages: PageInstance[]) => pages.map((p) => p.uid);
const abcd = () => ['a', 'b', 'c', 'd'].map((u) => pg(u));
const file = (id: string, pages = 1): SourceFile => ({id, name: `${id}.pdf`, pages, size: 1});

describe('pagesForFile', () => {
  it('creates one instance per page with unique uids', () => {
    let n = 0;
    const out = pagesForFile(file('f', 3), () => `u${n++}`);
    expect(out).toEqual([pg('u0', 'f', 0), pg('u1', 'f', 1), pg('u2', 'f', 2)]);
  });
  it('defaults to crypto.randomUUID', () => {
    const out = pagesForFile(file('f', 2));
    expect(new Set(uids(out)).size).toBe(2);
  });
  it('returns [] for a zero-page file', () => {
    expect(pagesForFile(file('f', 0))).toEqual([]);
  });
});

describe('movePages', () => {
  it('moves b to index 3', () => {
    expect(uids(movePages(abcd(), new Set(['b']), 3))).toEqual(['a', 'c', 'd', 'b']);
  });
  it('moves a group to 0 keeping relative order', () => {
    expect(uids(movePages(abcd(), new Set(['b', 'd']), 0))).toEqual(['b', 'd', 'a', 'c']);
  });
  it('moves to the end (length)', () => {
    expect(uids(movePages(abcd(), new Set(['a']), 4))).toEqual(['b', 'c', 'd', 'a']);
  });
  it('clamps out-of-range targets', () => {
    expect(uids(movePages(abcd(), new Set(['c']), 99))).toEqual(['a', 'b', 'd', 'c']);
    expect(uids(movePages(abcd(), new Set(['c']), -5))).toEqual(['c', 'a', 'b', 'd']);
  });
  it('is a no-op when the target is the current index', () => {
    expect(uids(movePages(abcd(), new Set(['b']), 1))).toEqual(['a', 'b', 'c', 'd']);
  });
  it('places a group so its first page lands at the target', () => {
    expect(uids(movePages(abcd(), new Set(['a', 'b']), 2))).toEqual(['c', 'd', 'a', 'b']);
  });
  it('ignores unknown uids and handles empty input', () => {
    expect(uids(movePages(abcd(), new Set(['zz']), 0))).toEqual(['a', 'b', 'c', 'd']);
    expect(movePages([], new Set(['a']), 0)).toEqual([]);
  });
  it('does not mutate the input', () => {
    const input = abcd();
    movePages(input, new Set(['a']), 4);
    expect(uids(input)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('deletePages', () => {
  it('removes the given uids', () => {
    expect(uids(deletePages(abcd(), new Set(['b', 'c'])))).toEqual(['a', 'd']);
  });
  it('deleting every page gives []', () => {
    expect(deletePages(abcd(), new Set(['a', 'b', 'c', 'd']))).toEqual([]);
  });
  it('ignores unknown uids and empty pages', () => {
    expect(uids(deletePages(abcd(), new Set(['zz'])))).toEqual(['a', 'b', 'c', 'd']);
    expect(deletePages([], new Set(['a']))).toEqual([]);
  });
});

describe('duplicatePages', () => {
  it('inserts a copy right after the original with a new uid and same rotation', () => {
    const pages = [pg('a'), pg('b', 'f', 1, 90), pg('c')];
    const out = duplicatePages(pages, new Set(['b']), () => "b'");
    expect(uids(out)).toEqual(['a', 'b', "b'", 'c']);
    const [orig, copy] = [out[1], out[2]];
    expect(copy?.uid).not.toBe(orig?.uid);
    expect(copy).toEqual({uid: "b'", fileId: 'f', local: 1, rotation: 90});
  });
  it('duplicates several, each after its original', () => {
    let n = 0;
    const out = duplicatePages(abcd(), new Set(['a', 'c']), () => `n${n++}`);
    expect(uids(out)).toEqual(['a', 'n0', 'b', 'c', 'n1', 'd']);
  });
  it('defaults to unique uids; unknown uid is a no-op', () => {
    const out = duplicatePages(abcd(), new Set(['a']));
    expect(out).toHaveLength(5);
    expect(new Set(uids(out)).size).toBe(5);
    expect(duplicatePages(abcd(), new Set(['zz']))).toHaveLength(4);
  });
});

describe('rotatePages', () => {
  it('270 + 90 wraps to 0', () => {
    expect(rotatePages([pg('a', 'f', 0, 270)], new Set(['a']), 90)[0]?.rotation).toBe(0);
  });
  it('0 - 90 wraps to 270', () => {
    expect(rotatePages([pg('a')], new Set(['a']), -90)[0]?.rotation).toBe(270);
  });
  it('only rotates selected pages and does not mutate', () => {
    const input = abcd();
    const out = rotatePages(input, new Set(['b']), 90);
    expect(out.map((p) => p.rotation)).toEqual([0, 90, 0, 0]);
    expect(input[1]?.rotation).toBe(0);
  });
  it('handles empty pages', () => {
    expect(rotatePages([], new Set(['a']), 90)).toEqual([]);
  });
});

describe('removeFile', () => {
  const pages = [pg('a', 'x'), pg('b', 'y'), pg('c', 'x')];
  it('drops that file’s pages', () => {
    expect(uids(removeFile(pages, 'x'))).toEqual(['b']);
  });
  it('absent id leaves pages unchanged', () => {
    expect(uids(removeFile(pages, 'nope'))).toEqual(['a', 'b', 'c']);
  });
});

describe('moveFile', () => {
  const files = [file('x'), file('y'), file('z')];
  const pages = [pg('x1', 'x'), pg('x2', 'x'), pg('y1', 'y'), pg('z1', 'z'), pg('z2', 'z')];
  const ids = (fs: SourceFile[]) => fs.map((f) => f.id);

  it('up when already first returns the same references', () => {
    const out = moveFile(files, pages, 'x', -1);
    expect(out.files).toBe(files);
    expect(out.pages).toBe(pages);
  });
  it('down when already last returns the same references', () => {
    const out = moveFile(files, pages, 'z', 1);
    expect(out.files).toBe(files);
    expect(out.pages).toBe(pages);
  });
  it('unknown file is unchanged', () => {
    expect(moveFile(files, pages, 'nope', 1).files).toBe(files);
  });
  it('moves a file up as a block', () => {
    const out = moveFile(files, pages, 'z', -1);
    expect(ids(out.files)).toEqual(['x', 'z', 'y']);
    expect(uids(out.pages)).toEqual(['x1', 'x2', 'z1', 'z2', 'y1']);
  });
  it('moves a file down as a block', () => {
    const out = moveFile(files, pages, 'x', 1);
    expect(ids(out.files)).toEqual(['y', 'x', 'z']);
    expect(uids(out.pages)).toEqual(['y1', 'x1', 'x2', 'z1', 'z2']);
  });
  it('swaps files even if the neighbour has no pages', () => {
    const out = moveFile(files, [pg('x1', 'x')], 'x', 1);
    expect(ids(out.files)).toEqual(['y', 'x', 'z']);
    expect(uids(out.pages)).toEqual(['x1']);
  });
});

describe('moveFileTo', () => {
  const files = [file('x'), file('y'), file('z')];
  const pages = [pg('x1', 'x'), pg('y1', 'y'), pg('y2', 'y'), pg('z1', 'z')];
  const ids = (fs: SourceFile[]) => fs.map((f) => f.id);

  it('drops the first file onto the last row: it goes last with its pages', () => {
    const out = moveFileTo(files, pages, 'x', 2);
    expect(ids(out.files)).toEqual(['y', 'z', 'x']);
    expect(uids(out.pages)).toEqual(['y1', 'y2', 'z1', 'x1']);
  });
  it('drops the last file onto the first row', () => {
    const out = moveFileTo(files, pages, 'z', 0);
    expect(ids(out.files)).toEqual(['z', 'x', 'y']);
    expect(uids(out.pages)).toEqual(['z1', 'x1', 'y1', 'y2']);
  });
  it('onto its own row returns the same references', () => {
    const out = moveFileTo(files, pages, 'y', 1);
    expect(out.files).toBe(files);
    expect(out.pages).toBe(pages);
  });
  it('clamps an index past either end', () => {
    expect(ids(moveFileTo(files, pages, 'x', 9).files)).toEqual(['y', 'z', 'x']);
    expect(ids(moveFileTo(files, pages, 'z', -3).files)).toEqual(['z', 'x', 'y']);
  });
  it('unknown file is unchanged', () => {
    expect(moveFileTo(files, pages, 'nope', 0).files).toBe(files);
  });
});

describe('dropTarget', () => {
  const at = (moving: string[], slot: number) => {
    const pages = ['a', 'b', 'c', 'd', 'e'].map((u) => pg(u));
    const set = new Set(moving);
    return uids(movePages(pages, set, dropTarget(pages, set, slot)));
  };
  it('moves one page forward (a after c)', () => {
    expect(at(['a'], 3)).toEqual(['b', 'c', 'a', 'd', 'e']);
  });
  it('moves one page backward (d before b)', () => {
    expect(at(['d'], 1)).toEqual(['a', 'd', 'b', 'c', 'e']);
  });
  it('moves a contiguous group forward and backward', () => {
    expect(at(['a', 'b'], 4)).toEqual(['c', 'd', 'a', 'b', 'e']);
    expect(at(['d', 'e'], 1)).toEqual(['a', 'd', 'e', 'b', 'c']);
  });
  it('moves a non-contiguous group to one place', () => {
    expect(at(['a', 'c'], 5)).toEqual(['b', 'd', 'e', 'a', 'c']);
    expect(at(['b', 'e'], 0)).toEqual(['b', 'e', 'a', 'c', 'd']);
  });
  it('handles the first and last slots', () => {
    expect(at(['c'], 0)).toEqual(['c', 'a', 'b', 'd', 'e']);
    expect(at(['c'], 5)).toEqual(['a', 'b', 'd', 'e', 'c']);
  });
  it('a slot next to or inside the moving group changes nothing for a contiguous group', () => {
    expect(at(['b', 'c'], 1)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(at(['b', 'c'], 2)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(at(['b', 'c'], 3)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
  it('counts only non-moving pages before the slot', () => {
    const pages = ['a', 'b', 'c', 'd'].map((u) => pg(u));
    expect(dropTarget(pages, new Set(['a', 'b']), 4)).toBe(2);
    expect(dropTarget(pages, new Set(), 2)).toBe(2);
    expect(dropTarget([], new Set(), 0)).toBe(0);
  });
});
