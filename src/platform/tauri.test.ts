import {afterEach, beforeEach, describe, expect, test, vi} from 'vitest';
import {tauriPlatform as p} from './tauri';
import {FileMissingError} from './types';

type Call = {cmd: string; args: unknown; options: unknown};
type Handler = (args: unknown, options: unknown) => unknown;

// Same bridge shape as tests/e2e/fixtures.ts: answers commands from `handlers`, records every call.
let calls: Call[];
let callbacks: Map<number, (message: unknown) => void>;
function mockTauri(handlers: Record<string, Handler>) {
  calls = [];
  callbacks = new Map();
  let next = 1;
  Object.assign(window, {
    __TAURI_INTERNALS__: {
      metadata: {currentWindow: {label: 'main'}, currentWebview: {label: 'main'}},
      transformCallback(cb: (message: unknown) => void) {
        const id = next++;
        callbacks.set(id, cb);
        return id;
      },
      unregisterCallback(id: number) {
        callbacks.delete(id);
      },
      async invoke(cmd: string, args: unknown, options: unknown) {
        calls.push({cmd, args, options});
        return (await handlers[cmd]?.(args, options)) ?? null;
      },
    },
    __TAURI_EVENT_PLUGIN_INTERNALS__: {unregisterListener() {}},
  });
}
const cmds = () => calls.map((c) => c.cmd);
const readFails = (message: string) =>
  mockTauri({'plugin:fs|read_file': () => Promise.reject(message)});
const files = {'C:\\docs\\a.pdf': [1, 2], 'C:\\docs\\B.PDF': [3]} as Record<string, number[]>;
const readsFiles = {
  'plugin:fs|read_file': (args: unknown) =>
    files[(args as {path: string}).path] ?? Promise.reject('No such file (os error 2)'),
};

afterEach(() => {
  Reflect.deleteProperty(window, '__TAURI_INTERNALS__');
});

describe('tauri platform', () => {
  test('is native', () => expect(p.native).toBe(true));

  describe('pickPdfs', () => {
    test('opens the dialog with the PDF filter, then reads each picked path', async () => {
      mockTauri({
        'plugin:dialog|open': () => ['C:\\docs\\a.pdf', 'C:\\docs\\B.PDF'],
        ...readsFiles,
      });
      const picked = await p.pickPdfs({multiple: true});
      expect(calls[0]).toMatchObject({
        cmd: 'plugin:dialog|open',
        args: {options: {multiple: true, filters: [{name: 'PDF', extensions: ['pdf']}]}},
      });
      expect(calls.slice(1).map((c) => c.args)).toEqual(
        [{path: 'C:\\docs\\a.pdf'}, {path: 'C:\\docs\\B.PDF'}].map((a) =>
          expect.objectContaining(a),
        ),
      );
      expect(picked).toEqual([
        {name: 'a.pdf', path: 'C:\\docs\\a.pdf', bytes: new Uint8Array([1, 2])},
        {name: 'B.PDF', path: 'C:\\docs\\B.PDF', bytes: new Uint8Array([3])},
      ]);
    });

    test('a single pick (string result) is one file', async () => {
      mockTauri({'plugin:dialog|open': () => 'C:\\docs\\a.pdf', ...readsFiles});
      expect((await p.pickPdfs({multiple: false})).map((f) => f.name)).toEqual(['a.pdf']);
      expect(calls[0]).toMatchObject({args: {options: {multiple: false}}});
    });

    test('cancel (null) returns [] and reads nothing', async () => {
      mockTauri({'plugin:dialog|open': () => null});
      expect(await p.pickPdfs({multiple: true})).toEqual([]);
      expect(cmds()).toEqual(['plugin:dialog|open']);
    });
  });

  describe('readPath', () => {
    test('returns the bytes', async () => {
      mockTauri(readsFiles);
      expect(await p.readPath('C:\\docs\\a.pdf')).toEqual(new Uint8Array([1, 2]));
    });

    test.each([
      [
        'not found (Windows)',
        'failed to open file at path: C:\\docs\\a.pdf with error: The system cannot find the file specified. (os error 2)',
      ],
      [
        'path not found (Windows)',
        'failed to open file at path: C:\\gone\\a.pdf with error: The system cannot find the path specified. (os error 3)',
      ],
      [
        'not found (unix)',
        'failed to open file at path: /docs/a.pdf with error: No such file or directory (os error 2)',
      ],
      ['forbidden (release)', 'forbidden path: C:\\docs\\a.pdf'],
      [
        'forbidden (debug)',
        'forbidden path: C:\\docs\\a.pdf, maybe it is not allowed on the scope for `allow-read-file` permission in your capability file',
      ],
    ])('maps %s to FileMissingError', async (_, message) => {
      readFails(message);
      await expect(p.readPath('C:\\docs\\a.pdf')).rejects.toBeInstanceOf(FileMissingError);
    });

    test('rethrows any other error unchanged', async () => {
      readFails(
        'failed to read file as text at path: C:\\docs\\a.pdf with error: Access is denied. (os error 5)',
      );
      await expect(p.readPath('C:\\docs\\a.pdf')).rejects.toBe(
        'failed to read file as text at path: C:\\docs\\a.pdf with error: Access is denied. (os error 5)',
      );
    });
  });

  describe('saveAs', () => {
    test('asks for a path, writes the bytes there and returns its parts', async () => {
      mockTauri({'plugin:dialog|save': () => 'C:\\out\\x.pdf'});
      const bytes = new Uint8Array([7]);
      expect(await p.saveAs(bytes, 'x.pdf', 'pdf')).toEqual({
        name: 'x.pdf',
        folder: 'C:\\out',
        path: 'C:\\out\\x.pdf',
      });
      expect(calls[0]).toMatchObject({
        cmd: 'plugin:dialog|save',
        args: {
          options: {defaultPath: 'x.pdf', filters: [{name: 'PDF document', extensions: ['pdf']}]},
        },
      });
      expect(calls[1]).toMatchObject({
        cmd: 'plugin:fs|write_file',
        args: bytes,
        options: {headers: {path: encodeURIComponent('C:\\out\\x.pdf')}},
      });
    });

    test('a zip uses the ZIP filter', async () => {
      mockTauri({'plugin:dialog|save': () => 'C:\\out\\x — split.zip'});
      await p.saveAs(new Uint8Array(), 'x — split.zip', 'zip');
      expect(calls[0]).toMatchObject({
        args: {options: {filters: [{name: 'ZIP archive', extensions: ['zip']}]}},
      });
    });

    test('cancel returns null and writes nothing', async () => {
      mockTauri({});
      expect(await p.saveAs(new Uint8Array(), 'x.pdf', 'pdf')).toBeNull();
      expect(cmds()).toEqual(['plugin:dialog|save']);
    });

    test('a failed write rejects', async () => {
      mockTauri({
        'plugin:dialog|save': () => 'C:\\out\\x.pdf',
        'plugin:fs|write_file': () => Promise.reject('denied'),
      });
      await expect(p.saveAs(new Uint8Array(), 'x.pdf', 'pdf')).rejects.toBe('denied');
    });
  });

  describe('window.onCloseRequested', () => {
    const closeRequested = async (handler: () => Promise<boolean>) => {
      mockTauri({'plugin:event|listen': () => 1});
      p.window!.onCloseRequested(handler);
      await vi.waitFor(() => expect(cmds()).toContain('plugin:event|listen'));
      const l = calls.find((c) => c.cmd === 'plugin:event|listen')!.args as {handler: number};
      callbacks.get(l.handler)!({event: 'tauri://close-requested', id: 1, payload: null});
      await new Promise((r) => setTimeout(r, 0));
    };

    test('resolving false keeps the window open', async () => {
      await closeRequested(async () => false);
      expect(cmds()).not.toContain('plugin:window|destroy');
    });

    test('resolving true lets the window be destroyed', async () => {
      await closeRequested(async () => true);
      expect(cmds()).toContain('plugin:window|destroy');
    });

    test('a throwing handler still closes, so the window is never stuck open', async () => {
      await closeRequested(() => Promise.reject(new Error('boom')));
      expect(cmds()).toContain('plugin:window|destroy');
    });
  });

  describe('onFileDrop', () => {
    let events: unknown[];
    let stop: () => void;
    const listeners = () =>
      calls
        .filter((c) => c.cmd === 'plugin:event|listen')
        .map((c) => c.args as {event: string; handler: number});
    const emit = (event: string, payload: unknown) => {
      const l = listeners().find((a) => a.event === event);
      callbacks.get(l!.handler)!({event, id: 1, payload});
    };
    beforeEach(async () => {
      mockTauri({...readsFiles, 'plugin:event|listen': () => 1});
      events = [];
      stop = p.onFileDrop((e) => events.push(e));
      await vi.waitFor(() => expect(listeners()).toHaveLength(4));
    });

    test('listens on the current webview', () => {
      expect(listeners()[0]).toMatchObject({target: {kind: 'Webview', label: 'main'}});
    });

    test('enter and over are "over"; leave is "leave"', () => {
      emit('tauri://drag-enter', {paths: ['C:\\docs\\a.pdf'], position: {x: 1, y: 2}});
      emit('tauri://drag-over', {position: {x: 1, y: 2}});
      emit('tauri://drag-leave', null);
      expect(events).toEqual([{type: 'over'}, {type: 'over'}, {type: 'leave'}]);
    });

    test('drop keeps .pdf paths (any case), ignores .txt, and reads them', async () => {
      emit('tauri://drag-drop', {
        paths: ['C:\\docs\\a.pdf', 'C:\\docs\\notes.txt', 'C:\\docs\\B.PDF'],
        position: {x: 0, y: 0},
      });
      await vi.waitFor(() => expect(events).toHaveLength(1));
      expect(events[0]).toEqual({
        type: 'drop',
        files: [
          {name: 'a.pdf', path: 'C:\\docs\\a.pdf', bytes: new Uint8Array([1, 2])},
          {name: 'B.PDF', path: 'C:\\docs\\B.PDF', bytes: new Uint8Array([3])},
        ],
      });
      expect(calls.filter((c) => c.cmd === 'plugin:fs|read_file')).toHaveLength(2);
    });

    test('a drop with no PDFs emits an empty drop', async () => {
      emit('tauri://drag-drop', {paths: ['C:\\docs\\notes.txt'], position: {x: 0, y: 0}});
      await vi.waitFor(() => expect(events).toEqual([{type: 'drop', files: []}]));
    });

    test('a drop whose read fails emits error (no unhandled rejection)', async () => {
      emit('tauri://drag-drop', {
        paths: ['C:\\docs\\a.pdf', 'C:\\docs\\gone.pdf'],
        position: {x: 0, y: 0},
      });
      await vi.waitFor(() => expect(events).toEqual([{type: 'error'}]));
    });

    test('stop unlistens all four events', async () => {
      stop();
      await vi.waitFor(() =>
        expect(cmds().filter((c) => c === 'plugin:event|unlisten')).toHaveLength(4),
      );
    });
  });

  test('openPath, reveal and openUrl use the opener plugin', async () => {
    mockTauri({});
    await p.openPath('C:\\out\\x.pdf', new Uint8Array([1]));
    await p.reveal('C:\\out\\x.pdf');
    await p.openUrl('https://github.com/ronmrcdo/ifixpdf');
    expect(calls.map((c) => [c.cmd, c.args])).toEqual([
      ['plugin:opener|open_path', {path: 'C:\\out\\x.pdf'}],
      ['plugin:opener|reveal_item_in_dir', {paths: ['C:\\out\\x.pdf']}],
      ['plugin:opener|open_url', {url: 'https://github.com/ronmrcdo/ifixpdf'}],
    ]);
  });

  test('window controls act on the current window', async () => {
    mockTauri({});
    await p.window!.minimize();
    await p.window!.toggleMaximize();
    await p.window!.close();
    expect(calls.map((c) => [c.cmd, c.args])).toEqual([
      ['plugin:window|minimize', {label: 'main'}],
      ['plugin:window|toggle_maximize', {label: 'main'}],
      ['plugin:window|close', {label: 'main'}],
    ]);
  });
});
