import {describe, expect, it} from 'vitest';
import {handleShortcut, type Action} from './shortcuts';
import type {View} from '../state/app';

type Ctx = Parameters<typeof handleShortcut>[1];
const ctx = (over: Partial<Ctx> = {}): Ctx => ({
  view: 'edit',
  tab: 'pages',
  inGrid: false,
  inStage: false,
  editable: false,
  dialogOpen: false,
  ...over,
});
const key = (
  k: string,
  mods: {ctrl?: boolean; meta?: boolean; shift?: boolean; alt?: boolean} = {},
) =>
  new KeyboardEvent('keydown', {
    key: k,
    ctrlKey: !!mods.ctrl,
    metaKey: !!mods.meta,
    shiftKey: !!mods.shift,
    altKey: !!mods.alt,
  });
const ctrl = {ctrl: true};

const rows: Array<[string, KeyboardEvent, Partial<Ctx>, Action | null]> = [
  ['Ctrl+O', key('o', ctrl), {view: 'home'}, 'open'],
  ['Ctrl+O uppercase (Shift/CapsLock)', key('O', ctrl), {view: 'home'}, 'open'],
  ['Cmd+O', key('o', {meta: true}), {view: 'settings'}, 'open'],
  ['O without a modifier', key('o'), {}, null],
  ['Ctrl+O inside an input', key('o', ctrl), {editable: true}, 'open'],
  ['Ctrl+O with a dialog open', key('o', ctrl), {dialogOpen: true}, null],
  ['Ctrl+S in preview', key('s', ctrl), {view: 'preview'}, 'save'],
  ['Ctrl+S in merge', key('s', ctrl), {view: 'merge'}, 'save'],
  ['Ctrl+S in edit inside an input', key('s', ctrl), {editable: true}, 'save'],
  ['Ctrl+S on home', key('s', ctrl), {view: 'home'}, null],
  ['Ctrl+S on settings', key('s', ctrl), {view: 'settings'}, null],
  ['Ctrl+P in edit', key('p', ctrl), {}, 'print'],
  ['Ctrl+P in preview inside an input', key('p', ctrl), {view: 'preview', editable: true}, 'print'],
  ['Ctrl+P on home', key('p', ctrl), {view: 'home'}, null],
  ['Ctrl+Z in edit', key('z', ctrl), {}, 'undo'],
  ['Ctrl+Z in merge', key('z', ctrl), {view: 'merge'}, 'undo'],
  ['Ctrl+Shift+Z', key('Z', {ctrl: true, shift: true}), {}, 'redo'],
  ['Ctrl+Y', key('y', ctrl), {}, 'redo'],
  ['Ctrl+Z in preview', key('z', ctrl), {view: 'preview'}, null],
  ['Ctrl+Z on home', key('z', ctrl), {view: 'home'}, null],
  ['Ctrl+Z inside an input', key('z', ctrl), {editable: true}, null],
  ['Ctrl+Y inside an input', key('y', ctrl), {editable: true}, null],
  ['Delete in the grid', key('Delete'), {inGrid: true}, 'delete'],
  ['Backspace in the grid', key('Backspace'), {inGrid: true}, 'delete'],
  ['Delete outside the grid', key('Delete'), {inGrid: false}, null],
  ['Delete in the grid but editable', key('Delete'), {inGrid: true, editable: true}, null],
  ['Ctrl+A in the grid', key('a', ctrl), {inGrid: true}, 'selectAll'],
  ['Ctrl+A outside the grid', key('a', ctrl), {}, null],
  ['Ctrl+A in the grid but editable', key('a', ctrl), {inGrid: true, editable: true}, null],
  ['ArrowLeft in the stage', key('ArrowLeft'), {inStage: true, tab: 'document'}, 'prev'],
  ['ArrowRight in the stage', key('ArrowRight'), {inStage: true, tab: 'document'}, 'next'],
  [
    'ArrowRight in the stage on the Pages tab',
    key('ArrowRight'),
    {inStage: true, tab: 'pages'},
    null,
  ],
  ['ArrowRight outside the stage', key('ArrowRight'), {}, null],
  [
    'ArrowRight in the stage but editable',
    key('ArrowRight'),
    {inStage: true, editable: true},
    null,
  ],
  [
    'Alt+ArrowRight (move a page) in the stage',
    key('ArrowRight', {alt: true}),
    {inStage: true},
    null,
  ],
  ['Delete with a dialog open', key('Delete'), {inGrid: true, dialogOpen: true}, null],
  ['Ctrl+S with a dialog open', key('s', ctrl), {dialogOpen: true}, null],
  ['an unrelated key', key('q'), {inGrid: true, inStage: true}, null],
];

describe('handleShortcut', () => {
  it.each(rows)('%s', (_label, event, over, expected) => {
    expect(handleShortcut(event, ctx(over))).toBe(expected);
  });

  it('Ctrl+O opens in every view', () => {
    for (const view of ['home', 'merge', 'preview', 'edit', 'settings'] as View[])
      expect(handleShortcut(key('o', ctrl), ctx({view}))).toBe('open');
  });
});
