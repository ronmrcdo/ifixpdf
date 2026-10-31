import {describe, expect, it, vi} from 'vitest';
import {reduce, runCheck, runDownload, runInstall, type UpdateEvent, type UpdateHandle, type UpdateState} from './machine';

const at = (status: UpdateState['status'], rest: Partial<UpdateState> = {}): UpdateState => ({status, ...rest});
const info = {version: '0.2.0', notes: 'Faster merge.'};

describe('reduce', () => {
  it.each<[string, UpdateState, UpdateEvent, UpdateState]>([
    ['check from idle', at('idle'), {type: 'check'}, at('checking')],
    ['check clears a previous update', at('available', info), {type: 'check'}, at('checking')],
    ['no update', at('checking'), {type: 'none'}, at('current')],
    ['update found', at('checking'), {type: 'found', ...info}, at('available', info)],
    ['unconfigured', at('checking'), {type: 'check-failed', reason: 'unconfigured'}, at('unconfigured')],
    ['offline', at('checking'), {type: 'check-failed', reason: 'offline'}, at('offline')],
    ['check error', at('checking'), {type: 'check-failed', reason: 'error'}, at('error')],
    ['download keeps version and notes, resets progress', at('available', info), {type: 'download'}, at('downloading', {...info, progress: {done: 0}})],
    ['retry download', at('download-error', info), {type: 'download'}, at('downloading', {...info, progress: {done: 0}})],
    ['started with a length', at('downloading', {...info, progress: {done: 0}}), {type: 'download-event', event: {event: 'Started', data: {contentLength: 1000}}}, at('downloading', {...info, progress: {done: 0, total: 1000}})],
    ['started without a length', at('downloading', {...info, progress: {done: 0}}), {type: 'download-event', event: {event: 'Started', data: {}}}, at('downloading', {...info, progress: {done: 0}})],
    ['chunks add up', at('downloading', {...info, progress: {done: 400, total: 1000}}), {type: 'download-event', event: {event: 'Progress', data: {chunkLength: 600}}}, at('downloading', {...info, progress: {done: 1000, total: 1000}})],
    ['finished event changes nothing', at('downloading', {...info, progress: {done: 5}}), {type: 'download-event', event: {event: 'Finished'}}, at('downloading', {...info, progress: {done: 5}})],
    ['late chunk outside downloading is ignored', at('ready', info), {type: 'download-event', event: {event: 'Progress', data: {chunkLength: 9}}}, at('ready', info)],
    ['downloaded drops progress', at('downloading', {...info, progress: {done: 1, total: 1}}), {type: 'downloaded'}, at('ready', info)],
    ['download failed', at('downloading', {...info, progress: {done: 1}}), {type: 'download-failed'}, at('download-error', info)],
    ['install', at('ready', info), {type: 'install'}, at('installing', info)],
    ['save failed', at('ready', info), {type: 'save-failed'}, at('save-error', info)],
    ['retry install after save error', at('save-error', info), {type: 'install'}, at('installing', info)],
    ['installed', at('installing', info), {type: 'installed'}, at('restart', info)],
    ['install failed', at('installing', info), {type: 'install-failed'}, at('install-error', info)],
    ['retry install', at('install-error', info), {type: 'install'}, at('installing', info)]
  ])('%s', (_name, state, event, expected) => {
    expect(reduce(state, event)).toEqual(expected);
  });
});

// Runs an effect against the real reducer so the assertions are on resulting states.
function harness(initial: UpdateState) {
  let state = initial;
  const seen: UpdateState['status'][] = [];
  const dispatch = (e: UpdateEvent) => { state = reduce(state, e); seen.push(state.status) };
  return {dispatch, seen, get state() { return state }};
}
const handle = (over: Partial<UpdateHandle> = {}): UpdateHandle => ({
  version: '0.2.0', body: 'Faster merge.', download: vi.fn(async () => {}), install: vi.fn(async () => {}), ...over
});

describe('runCheck', () => {
  it('finds an update and returns the handle', async () => {
    const h = harness(at('idle')), u = handle();
    expect(await runCheck({check: async () => u, online: () => true}, h.dispatch)).toBe(u);
    expect(h.seen).toEqual(['checking', 'available']);
    expect(h.state).toEqual(at('available', info));
  });
  it('up to date', async () => {
    const h = harness(at('idle'));
    expect(await runCheck({check: async () => null, online: () => true}, h.dispatch)).toBeNull();
    expect(h.state.status).toBe('current');
  });
  it.each([
    ['the plugin string means unconfigured, even offline', 'Updater does not have any endpoints set.', false, 'unconfigured'],
    ['a failure while offline is offline', 'Could not fetch a valid release JSON from the remote', false, 'offline'],
    ['a failure while online is an error', 'Could not fetch a valid release JSON from the remote', true, 'error']
  ] as const)('%s', async (_n, error, online, status) => {
    const h = harness(at('idle'));
    expect(await runCheck({check: async () => { throw error }, online: () => online}, h.dispatch)).toBeNull();
    expect(h.state.status).toBe(status);
  });
});

describe('runDownload', () => {
  it('reports progress then ready', async () => {
    const h = harness(at('available', info));
    const u = handle({download: vi.fn(async (cb) => {
      cb?.({event: 'Started', data: {contentLength: 1000}});
      cb?.({event: 'Progress', data: {chunkLength: 400}});
      expect(h.state.progress).toEqual({done: 400, total: 1000});
      cb?.({event: 'Finished'});
    })});
    await runDownload(u, h.dispatch);
    expect(h.seen.at(-1)).toBe('ready');
    expect(h.state).toEqual(at('ready', info));
  });
  it('a failure is download-error and keeps the notes', async () => {
    const h = harness(at('available', info));
    await runDownload(handle({download: async () => { throw 'error decoding response body' }}), h.dispatch);
    expect(h.state).toEqual(at('download-error', info));
  });
});

describe('runInstall', () => {
  const deps = (over: Partial<Parameters<typeof runInstall>[1]> = {}) => ({busy: () => false, saveDraft: vi.fn(async () => {}), notify: vi.fn(), ...over});

  it('saves the draft before install, then restart', async () => {
    const order: string[] = [];
    const d = deps({saveDraft: vi.fn(async () => { order.push('save') })});
    const u = handle({install: vi.fn(async () => { order.push('install') })});
    const h = harness(at('ready', info));
    await runInstall(u, d, h.dispatch);
    expect(order).toEqual(['save', 'install']);
    expect(h.seen).toEqual(['installing', 'restart']);
  });
  it('refuses with a toast while an export is tracked, touching nothing', async () => {
    const d = deps({busy: () => true}), u = handle(), h = harness(at('ready', info));
    await runInstall(u, d, h.dispatch);
    expect(d.notify).toHaveBeenCalledWith('Install the update after your export finishes.');
    expect(d.saveDraft).not.toHaveBeenCalled();
    expect(u.install).not.toHaveBeenCalled();
    expect(h.state).toEqual(at('ready', info));
  });
  it('a failed draft save is save-error and install never runs', async () => {
    const d = deps({saveDraft: async () => { throw new Error('quota') }}), u = handle(), h = harness(at('ready', info));
    await runInstall(u, d, h.dispatch);
    expect(h.state).toEqual(at('save-error', info));
    expect(u.install).not.toHaveBeenCalled();
  });
  it('a failed install is install-error', async () => {
    const h = harness(at('ready', info));
    await runInstall(handle({install: async () => { throw new Error('nsis') }}), deps(), h.dispatch);
    expect(h.state).toEqual(at('install-error', info));
  });
});
