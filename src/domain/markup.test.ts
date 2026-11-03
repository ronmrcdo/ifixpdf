import {describe, expect, it} from 'vitest';
import {
  hasMarkup,
  hasRedaction,
  type Markup,
  pngSize,
  rectAt,
  shift,
  stepSize,
  topLeft,
  unsupportedChars,
} from './markup';
import {pngOf} from '../test/png';

const base = {id: 'a', rect: {x: 0, y: 0, w: 1, h: 1}, angle: 0 as const};
const textItem: Markup = {...base, kind: 'text', text: 'hi', size: 12};
const redact: Markup = {...base, kind: 'redact'};

describe('stepSize', () => {
  it('steps and clamps', () => {
    expect(stepSize(12, 1)).toBe(14);
    expect(stepSize(32, 1)).toBe(32);
    expect(stepSize(8, -1)).toBe(8);
    expect(stepSize(12, -1)).toBe(10);
  });
  it('snaps an off-list value to the next one', () => {
    expect(stepSize(13, 1)).toBe(14);
    expect(stepSize(13, -1)).toBe(12);
  });
});

describe('unsupportedChars', () => {
  it('accepts WinAnsi', () => {
    expect(unsupportedChars('Café – €5 “ok”')).toEqual([]);
    expect(unsupportedChars('')).toEqual([]);
    expect(unsupportedChars('\n')).toEqual([]);
  });
  it('returns unique unsupported chars', () => {
    expect(unsupportedChars('日本 a 日')).toEqual(['日', '本']);
  });
});

describe('hasRedaction', () => {
  it('is true only with a redact item', () => {
    expect(hasRedaction({})).toBe(false);
    expect(hasRedaction({markup: [textItem]})).toBe(false);
    expect(hasRedaction({markup: [textItem, redact]})).toBe(true);
  });
});

describe('hasMarkup', () => {
  it('checks pages and fills', () => {
    expect(hasMarkup([{}], {})).toBe(false);
    expect(hasMarkup([{}], {f: {}})).toBe(false);
    expect(hasMarkup([{}], {f: {a: ''}})).toBe(true);
    expect(hasMarkup([{markup: []}])).toBe(false);
    expect(hasMarkup([{markup: [textItem]}])).toBe(true);
  });
});

describe('rectAt and topLeft', () => {
  it('builds the rect whose display top-left is the point, at every angle', () => {
    expect(rectAt([10, 100], 0, 50, 20)).toEqual({x: 10, y: 80, w: 50, h: 20});
    expect(rectAt([10, 100], 90, 50, 20)).toEqual({x: 10, y: 100, w: 20, h: 50});
    expect(rectAt([10, 100], 180, 50, 20)).toEqual({x: -40, y: 100, w: 50, h: 20});
    expect(rectAt([10, 100], 270, 50, 20)).toEqual({x: -10, y: 50, w: 20, h: 50});
    for (const angle of [0, 90, 180, 270] as const)
      expect(topLeft(rectAt([10, 100], angle, 50, 20), angle)).toEqual([10, 100]);
  });

  it('shift moves along the display right and down of the angle', () => {
    const r = {x: 0, y: 0, w: 1, h: 1};
    expect(shift(r, 0, 12)).toEqual({x: 12, y: -12, w: 1, h: 1});
    expect(shift(r, 90, 12)).toEqual({x: 12, y: 12, w: 1, h: 1});
    expect(shift(r, 180, 12)).toEqual({x: -12, y: 12, w: 1, h: 1});
    expect(shift(r, 270, 12)).toEqual({x: -12, y: -12, w: 1, h: 1});
  });
});

describe('pngSize', () => {
  it('reads the IHDR width and height', () => {
    expect(pngSize(pngOf(480, 160))).toEqual([480, 160]);
    expect(pngSize(pngOf(70000, 3))).toEqual([70000, 3]);
  });

  it('falls back to 3:1 for a header it cannot read', () => {
    expect(pngSize('data:image/png;base64,')).toEqual([3, 1]);
    expect(pngSize(pngOf(0, 10))).toEqual([3, 1]);
  });
});
