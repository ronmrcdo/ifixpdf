import {describe, expect, it} from 'vitest';
import {hasMarkup, hasRedaction, type Markup, stepSize, unsupportedChars} from './markup';

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
