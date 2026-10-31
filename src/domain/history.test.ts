import {describe, expect, it} from 'vitest';
import {createHistory} from './history';

describe('createHistory', () => {
  it('starts empty', () => {
    const h = createHistory<number>();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
    expect(h.undo(1)).toBeNull();
    expect(h.redo(1)).toBeNull();
  });
  it('undoes and redoes', () => {
    const h = createHistory<number>();
    h.push(1);
    h.push(2);
    expect(h.canUndo()).toBe(true);
    expect(h.undo(3)).toBe(2);
    expect(h.canRedo()).toBe(true);
    expect(h.undo(2)).toBe(1);
    expect(h.canUndo()).toBe(false);
    expect(h.redo(1)).toBe(2);
    expect(h.redo(2)).toBe(3);
    expect(h.redo(3)).toBeNull();
    expect(h.canRedo()).toBe(false);
  });
  it('clears redo on push', () => {
    const h = createHistory<number>();
    h.push(1);
    h.undo(2);
    expect(h.canRedo()).toBe(true);
    h.push(5);
    expect(h.canRedo()).toBe(false);
    expect(h.redo(6)).toBeNull();
  });
  it('caps at 40 snapshots, dropping the oldest', () => {
    const h = createHistory<number>();
    for (let i = 0; i < 41; i++) h.push(i);
    let last: number | null = -1;
    for (let i = 0; i < 40; i++) last = h.undo(100);
    expect(last).toBe(1);
    expect(h.undo(100)).toBeNull();
  });
  it('honours a custom limit', () => {
    const h = createHistory<number>(2);
    h.push(1);
    h.push(2);
    h.push(3);
    expect(h.undo(4)).toBe(3);
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBeNull();
  });
  it('clear empties both stacks', () => {
    const h = createHistory<number>();
    h.push(1);
    h.undo(2);
    h.clear();
    expect(h.canUndo()).toBe(false);
    expect(h.canRedo()).toBe(false);
  });
});
