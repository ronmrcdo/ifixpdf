import {describe, expect, it} from 'vitest';
import {fitScale, stepZoom} from './zoom';

describe('stepZoom', () => {
  it('from Fit starts at the actual zoom rounded to 10', () => {
    expect(stepZoom('fit', 87, 1)).toBe(100);
    expect(stepZoom('fit', 87, -1)).toBe(80);
    expect(stepZoom('fit', 84, 1)).toBe(90);
  });
  it('steps by 10 from a set zoom', () => {
    expect(stepZoom(100, 100, 1)).toBe(110);
    expect(stepZoom(100, 100, -1)).toBe(90);
  });
  it('ignores the actual zoom when not at Fit', () => {
    expect(stepZoom(120, 55, 1)).toBe(130);
  });
  it('stops at the 25 floor', () => {
    expect(stepZoom(30, 30, -1)).toBe(25);
    expect(stepZoom(25, 25, -1)).toBe(25);
    expect(stepZoom('fit', 12, -1)).toBe(25);
  });
  it('stops at the 200 ceiling', () => {
    expect(stepZoom(200, 200, 1)).toBe(200);
    expect(stepZoom(190, 190, 1)).toBe(200);
    expect(stepZoom('fit', 260, 1)).toBe(200);
  });
  it('snaps an off-grid zoom back to the 10s, as the legacy app did', () => {
    expect(stepZoom(25, 25, 1)).toBe(40);
  });
});

describe('fitScale', () => {
  it('fits the limiting side inside the padded stage', () => {
    expect(fitScale({w: 660, h: 830}, {w: 612, h: 792}, {x: 60, y: 38})).toBeCloseTo(600 / 612);
    expect(fitScale({w: 1060, h: 430}, {w: 612, h: 792}, {x: 60, y: 30})).toBeCloseTo(400 / 792);
  });
  it('uses the page as given, so a rotated page passes swapped sides', () => {
    expect(fitScale({w: 900, h: 600}, {w: 792, h: 612}, {x: 0, y: 0})).toBeCloseTo(600 / 612);
  });
  it('never returns a non-positive scale for a stage smaller than its padding', () => {
    expect(fitScale({w: 10, h: 10}, {w: 612, h: 792}, {x: 60, y: 38})).toBeGreaterThan(0);
  });
});
