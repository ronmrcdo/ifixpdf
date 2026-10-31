import {describe, expect, it, vi} from 'vitest';
import {useApp} from './app';
import {busy, track} from './work';

describe('useApp', () => {
  it('starts on home with no toast and openAfter on', () => {
    expect(useApp.getState()).toMatchObject({
      view: 'home',
      toast: null,
      openAfter: true,
      workspace: 'merge',
    });
  });

  it('setView changes the view and remembers the last document view', () => {
    expect(useApp.getState().documentView).toBe('preview');
    useApp.getState().setView('edit');
    expect(useApp.getState()).toMatchObject({view: 'edit', documentView: 'edit'});
    useApp.getState().setView('settings');
    expect(useApp.getState()).toMatchObject({view: 'settings', documentView: 'edit'});
    useApp.getState().setView('preview');
    useApp.getState().setView('merge');
    expect(useApp.getState().documentView).toBe('preview');
  });

  it('setView applies at once and never starts a view transition (navigate owns the fade)', () => {
    const start = vi.fn();
    Object.defineProperty(document, 'startViewTransition', {value: start, configurable: true});
    useApp.getState().setView('settings');
    expect(useApp.getState().view).toBe('settings');
    expect(start).not.toHaveBeenCalled();
    Reflect.deleteProperty(document, 'startViewTransition');
  });

  it('notify defaults to info and gives each toast a new id', () => {
    useApp.getState().notify('One');
    const first = useApp.getState().toast;
    useApp.getState().notify('One', 'error');
    const second = useApp.getState().toast;
    expect(first).toMatchObject({text: 'One', tone: 'info'});
    expect(second).toMatchObject({text: 'One', tone: 'error'});
    expect(second!.id).not.toBe(first!.id);
  });
});

describe('work', () => {
  it('busy() is true until a tracked promise resolves', async () => {
    let done!: (v: number) => void;
    const p = track(new Promise<number>((r) => (done = r)));
    expect(busy()).toBe(true);
    done(7);
    await expect(p).resolves.toBe(7);
    expect(busy()).toBe(false);
  });

  it('busy() clears on rejection and the rejection passes through', async () => {
    let fail!: (e: Error) => void;
    const p = track(new Promise((_, r) => (fail = r)));
    const q = track(Promise.resolve(1));
    expect(busy()).toBe(true);
    await q;
    expect(busy()).toBe(true);
    fail(new Error('x'));
    await expect(p).rejects.toThrow('x');
    expect(busy()).toBe(false);
  });
});

describe('active workspace', () => {
  it('starts on merge, follows Preview/Edit and Merge, and stays put on Home and Settings', () => {
    useApp.setState({view: 'home', workspace: 'merge'});
    expect(useApp.getState().workspace).toBe('merge');
    useApp.getState().setView('preview');
    expect(useApp.getState().workspace).toBe('document');
    useApp.getState().setView('home');
    useApp.getState().setView('settings');
    expect(useApp.getState().workspace).toBe('document');
    useApp.getState().setView('merge');
    expect(useApp.getState().workspace).toBe('merge');
    useApp.getState().setView('edit');
    expect(useApp.getState().workspace).toBe('document');
  });
});
