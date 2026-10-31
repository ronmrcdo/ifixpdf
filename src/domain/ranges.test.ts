import {describe, expect, it} from 'vitest';
import {defaultSplitText, formatRanges, parsePageList, parseSplitGroups} from './ranges';

const FORMAT_PAGES = 'Enter pages such as 1-3, 5.';
const FORMAT_SPLIT = 'Enter ranges such as 1-3, 4-6.';

describe('parsePageList', () => {
  it('parses singles and ranges to 0-based indices', () => {
    expect(parsePageList('1-3, 5', 5)).toEqual([0, 1, 2, 4]);
  });
  it('tolerates whitespace', () => {
    expect(parsePageList(' 1 - 3 ,5 ', 5)).toEqual([0, 1, 2, 4]);
  });
  it('dedupes in input order', () => {
    expect(parsePageList('2,1,2', 3)).toEqual([1, 0]);
    expect(parsePageList('1-3, 2-4', 4)).toEqual([0, 1, 2, 3]);
  });
  it('accepts the boundaries 1 and count', () => {
    expect(parsePageList('1', 3)).toEqual([0]);
    expect(parsePageList('3', 3)).toEqual([2]);
    expect(parsePageList('1-3', 3)).toEqual([0, 1, 2]);
  });
  it.each(['', '   ', 'a', '1,', '1-', '-3', '1-2-3', '1.5'])('rejects %j as malformed', (t) => {
    expect(() => parsePageList(t, 5)).toThrow(new RangeError(FORMAT_PAGES));
  });
  it.each(['0', '6', '3-6', '0-2', '3-1'])('rejects %j as out of bounds', (t) => {
    expect(() => parsePageList(t, 5)).toThrow(new RangeError('Choose page numbers from 1 to 5.'));
  });
  it('throws RangeError instances', () => {
    expect(() => parsePageList('a', 5)).toThrow(RangeError);
  });
});

describe('parseSplitGroups', () => {
  it('returns one group per token', () => {
    expect(parseSplitGroups('1-2, 3, 4-5', 5)).toEqual([[0, 1], [2], [3, 4]]);
  });
  it('tolerates whitespace', () => {
    expect(parseSplitGroups(' 1 - 3 ,5 ', 5)).toEqual([[0, 1, 2], [4]]);
  });
  it('accepts boundaries 1 and count', () => {
    expect(parseSplitGroups('1, 5', 5)).toEqual([[0], [4]]);
  });
  it.each(['', 'a', '1,,2', '1-'])('rejects %j as malformed', (t) => {
    expect(() => parseSplitGroups(t, 5)).toThrow(new RangeError(FORMAT_SPLIT));
  });
  it.each(['3-1', '0', '6', '4-6'])('rejects %j as out of bounds', (t) => {
    expect(() => parseSplitGroups(t, 5)).toThrow(new RangeError('Choose pages from 1 to 5.'));
  });
  it.each(['1-2, 2-3', '2, 2', '1-5, 3'])('rejects %j as overlapping', (t) => {
    expect(() => parseSplitGroups(t, 5)).toThrow(
      new RangeError('Ranges overlap. Include each page only once.'),
    );
  });
});

describe('defaultSplitText', () => {
  it('splits in half', () => {
    expect(defaultSplitText(5)).toBe('1-2, 3-5');
    expect(defaultSplitText(4)).toBe('1-2, 3-4');
    expect(defaultSplitText(2)).toBe('1-1, 2-2');
  });
  it('is 1 for count <= 1', () => {
    expect(defaultSplitText(1)).toBe('1');
    expect(defaultSplitText(0)).toBe('1');
  });
  it('round-trips through parseSplitGroups', () => {
    expect(parseSplitGroups(defaultSplitText(5), 5)).toEqual([
      [0, 1],
      [2, 3, 4],
    ]);
  });
});

describe('formatRanges', () => {
  it('collapses runs with an en dash', () => {
    expect(formatRanges([0, 1, 2, 4])).toBe('1–3, 5');
  });
  it('handles empty, single, and two-page runs', () => {
    expect(formatRanges([])).toBe('');
    expect(formatRanges([3])).toBe('4');
    expect(formatRanges([0, 1])).toBe('1–2');
  });
  it('keeps input order and breaks on non-consecutive', () => {
    expect(formatRanges([4, 0, 1])).toBe('5, 1–2');
  });
});
