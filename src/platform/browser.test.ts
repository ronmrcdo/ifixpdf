import {afterEach, beforeEach, describe, expect, test, vi, type MockInstance} from 'vitest';
import {browserPlatform as p, openPdfTab} from './browser';

const pdf = (name: string, bytes = [1, 2]) =>
  new File([new Uint8Array(bytes)], name, {type: 'application/pdf'});
type Picker = (o: unknown) => Promise<{
  name: string;
  createWritable(): Promise<{write(b: Uint8Array): Promise<void>; close(): Promise<void>}>;
}>;
const win = window as Window & {showSaveFilePicker?: Picker};

afterEach(() => {
  delete win.showSaveFilePicker;
  vi.restoreAllMocks();
});

describe('browser platform', () => {
  test('is not native and has no window controls', () => {
    expect(p.native).toBe(false);
    expect(p.window).toBeNull();
  });

  describe('pickPdfs', () => {
    let click: MockInstance<() => void>;
    beforeEach(() => {
      click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    });
    const input = () => click.mock.contexts.at(-1) as HTMLInputElement;
    const choose = (files: File[]) => {
      Object.defineProperty(input(), 'files', {value: files});
      input().dispatchEvent(new Event('change'));
    };

    test('uses a PDF file input and returns the chosen files without paths', async () => {
      const picked = p.pickPdfs({multiple: true});
      expect(input()).toMatchObject({type: 'file', accept: 'application/pdf', multiple: true});
      choose([pdf('a.pdf', [1, 2]), pdf('b.pdf', [3])]);
      expect(await picked).toEqual([
        {name: 'a.pdf', bytes: new Uint8Array([1, 2])},
        {name: 'b.pdf', bytes: new Uint8Array([3])},
      ]);
    });

    test('single pick is not multiple', async () => {
      const picked = p.pickPdfs({multiple: false});
      expect(input().multiple).toBe(false);
      choose([pdf('a.pdf')]);
      expect(await picked).toHaveLength(1);
    });

    test('cancel returns []', async () => {
      const picked = p.pickPdfs({multiple: true});
      input().dispatchEvent(new Event('cancel'));
      expect(await picked).toEqual([]);
    });
  });

  describe('saveAs', () => {
    test('with the save picker, writes and returns the chosen name', async () => {
      const writes: Uint8Array[] = [];
      const close = vi.fn(async () => {});
      const picker = vi.fn<Picker>(async () => ({
        name: 'chosen.pdf',
        createWritable: async () => ({
          write: async (b: Uint8Array) => {
            writes.push(b);
          },
          close,
        }),
      }));
      win.showSaveFilePicker = picker;
      const bytes = new Uint8Array([9]);
      expect(await p.saveAs(bytes, 'x.pdf', 'pdf')).toEqual({name: 'chosen.pdf', folder: ''});
      expect(picker).toHaveBeenCalledWith({
        suggestedName: 'x.pdf',
        types: [{description: 'PDF document', accept: {'application/pdf': ['.pdf']}}],
      });
      expect(writes).toEqual([bytes]);
      expect(close).toHaveBeenCalled();
    });

    test('a zip asks for a ZIP archive', async () => {
      const picker = vi.fn<Picker>(async () => ({
        name: 'x.zip',
        createWritable: async () => ({write: async () => {}, close: async () => {}}),
      }));
      win.showSaveFilePicker = picker;
      await p.saveAs(new Uint8Array(), 'x.zip', 'zip');
      expect(picker).toHaveBeenCalledWith({
        suggestedName: 'x.zip',
        types: [{description: 'ZIP archive', accept: {'application/zip': ['.zip']}}],
      });
    });

    test('AbortError (cancel) returns null', async () => {
      win.showSaveFilePicker = async () => {
        throw new DOMException('cancelled', 'AbortError');
      };
      expect(await p.saveAs(new Uint8Array(), 'x.pdf', 'pdf')).toBeNull();
    });

    test('any other picker error rejects', async () => {
      const err = new DOMException('nope', 'SecurityError');
      win.showSaveFilePicker = async () => {
        throw err;
      };
      await expect(p.saveAs(new Uint8Array(), 'x.pdf', 'pdf')).rejects.toBe(err);
    });

    test('without the picker, downloads through a blob link', async () => {
      URL.createObjectURL = vi.fn(() => 'blob:x');
      URL.revokeObjectURL = vi.fn();
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      expect(await p.saveAs(new Uint8Array([1]), 'x.pdf', 'pdf')).toEqual({
        name: 'x.pdf',
        folder: '',
      });
      expect(click.mock.contexts[0]).toMatchObject({download: 'x.pdf', href: 'blob:x'});
      expect(vi.mocked(URL.createObjectURL).mock.calls[0]?.[0]).toMatchObject({
        type: 'application/pdf',
      });
    });
  });

  test('openPath opens the fallback bytes in a new tab', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:y');
    URL.revokeObjectURL = vi.fn();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await p.openPath('ignored', new Uint8Array([1]));
    expect(open).toHaveBeenCalledWith('blob:y', '_blank', 'noopener');
  });

  test('openPdfTab opens the bytes as a PDF tab and revokes the URL after a minute', () => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => 'blob:z');
    URL.revokeObjectURL = vi.fn();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    openPdfTab(new Uint8Array([1]));
    expect(open).toHaveBeenCalledWith('blob:z', '_blank', 'noopener');
    expect(vi.mocked(URL.createObjectURL).mock.calls[0]?.[0]).toMatchObject({
      type: 'application/pdf',
    });
    vi.advanceTimersByTime(59999);
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:z');
    vi.useRealTimers();
  });

  test('openUrl opens a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    await p.openUrl('https://github.com/ronmrcdo/ifixpdf');
    expect(open).toHaveBeenCalledWith('https://github.com/ronmrcdo/ifixpdf', '_blank', 'noopener');
  });

  test('reveal does nothing', async () => {
    await expect(p.reveal('x')).resolves.toBeUndefined();
  });

  describe('onFileDrop', () => {
    let events: unknown[];
    let stop: () => void;
    beforeEach(() => {
      events = [];
      stop = p.onFileDrop((e) => events.push(e));
    });
    afterEach(() => stop());
    const fire = (
      type: string,
      init: {files?: File[]; relatedTarget?: EventTarget | null} = {},
    ) => {
      const e = new Event(type, {cancelable: true});
      Object.assign(e, {
        dataTransfer: {files: init.files ?? []},
        relatedTarget: init.relatedTarget ?? null,
      });
      document.dispatchEvent(e);
      return e;
    };

    test('dragover is "over" and allows the drop', () => {
      expect(fire('dragover').defaultPrevented).toBe(true);
      expect(events).toEqual([{type: 'over'}]);
    });

    test('dragleave out of the window is "leave"; between elements it is ignored', () => {
      fire('dragleave', {relatedTarget: document.body});
      fire('dragleave');
      expect(events).toEqual([{type: 'leave'}]);
    });

    test('drop keeps PDFs by type or name, ignores .txt, and reads them', async () => {
      const e = fire('drop', {
        files: [
          pdf('a.pdf', [1]),
          new File(['x'], 'B.PDF'),
          new File(['x'], 'notes.txt', {type: 'text/plain'}),
        ],
      });
      expect(e.defaultPrevented).toBe(true);
      await vi.waitFor(() => expect(events).toHaveLength(1));
      expect(events[0]).toEqual({
        type: 'drop',
        files: [
          {name: 'a.pdf', bytes: new Uint8Array([1])},
          {name: 'B.PDF', bytes: new Uint8Array([120])},
        ],
      });
    });

    test('stop removes the listeners', () => {
      stop();
      fire('dragover');
      expect(events).toEqual([]);
    });
  });
});
