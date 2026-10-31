import {SAVE_KINDS, type PickedFile, type Platform} from './types';

// Browser preview (dev and tests): no paths, only bytes.
const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const toPicked = (files: File[]): Promise<PickedFile[]> =>
  Promise.all(files.filter(isPdf).map(async f => ({name: f.name, bytes: new Uint8Array(await f.arrayBuffer())})));

// Hands the bytes to the browser for a minute, long enough to start a download or open a tab.
function withBlobUrl(bytes: Uint8Array, type: string, act: (url: string) => void) {
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], {type}));
  act(url);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Opens PDF bytes in a new tab: the browser's open-after-save, and Print everywhere. */
export const openPdfTab = (bytes: Uint8Array): void => withBlobUrl(bytes, 'application/pdf', url => window.open(url, '_blank', 'noopener'));

type SavePicker = (o: {suggestedName: string; types: {description: string; accept: Record<string, string[]>}[]}) =>
  Promise<{name: string; createWritable(): Promise<{write(b: Uint8Array): Promise<void>; close(): Promise<void>}>}>;

export const browserPlatform: Platform = {
  native: false,
  pickPdfs({multiple}) {
    return new Promise((resolve, reject) => {
      const input = Object.assign(document.createElement('input'), {type: 'file', accept: 'application/pdf', multiple});
      input.addEventListener('change', () => toPicked([...input.files ?? []]).then(resolve, reject));
      input.addEventListener('cancel', () => resolve([]));
      input.click();
    });
  },
  readPath: () => Promise.reject(new Error('The browser preview has no file paths')),
  onFileDrop(cb) {
    const over = (e: DragEvent) => { e.preventDefault(); cb({type: 'over'}) };
    // dragleave also fires between child elements; only leaving the window (no related target) counts.
    const leave = (e: DragEvent) => { if (!e.relatedTarget) cb({type: 'leave'}) };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      void toPicked([...e.dataTransfer?.files ?? []]).then(files => cb({type: 'drop', files}));
    };
    document.addEventListener('dragover', over);
    document.addEventListener('dragleave', leave);
    document.addEventListener('drop', drop);
    return () => {
      document.removeEventListener('dragover', over);
      document.removeEventListener('dragleave', leave);
      document.removeEventListener('drop', drop);
    };
  },
  async saveAs(bytes, name, kind) {
    const {label, ext, type} = SAVE_KINDS[kind];
    const picker = (window as Window & {showSaveFilePicker?: SavePicker}).showSaveFilePicker;
    if (!picker) {
      withBlobUrl(bytes, type, url => Object.assign(document.createElement('a'), {href: url, download: name}).click());
      return {name, folder: ''};
    }
    let handle: Awaited<ReturnType<SavePicker>>;
    try {
      handle = await picker({suggestedName: name, types: [{description: label, accept: {[type]: ['.' + ext]}}]});
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return null;
      throw e;
    }
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
    return {name: handle.name, folder: ''};
  },
  async openPath(_path, fallbackBytes) {
    if (fallbackBytes) openPdfTab(fallbackBytes);
  },
  async reveal() {}, // native only, as today
  async openUrl(url) {
    window.open(url, '_blank', 'noopener');
  },
  window: null
};
