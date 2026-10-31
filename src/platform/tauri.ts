import {invoke} from '@tauri-apps/api/core';
import {getCurrentWebview} from '@tauri-apps/api/webview';
import {getCurrentWindow} from '@tauri-apps/api/window';
import {open} from '@tauri-apps/plugin-dialog';
import {readFile} from '@tauri-apps/plugin-fs';
import {openPath, openUrl, revealItemInDir} from '@tauri-apps/plugin-opener';
import {splitPath} from '../domain/naming';
import {FileMissingError, type PickedFile, type Platform} from './types';

// plugin-fs rejects with a string: "forbidden path: …" when outside the scope, "… (os error 2|3)" when the file or folder is gone.
const MISSING = /^forbidden path: |\(os error [23]\)$/;

async function readPath(path: string): Promise<Uint8Array> {
  try {
    return await readFile(path);
  } catch (e) {
    if (typeof e === 'string' && MISSING.test(e)) throw new FileMissingError(e);
    throw e;
  }
}

const readPdfs = (paths: string[]): Promise<PickedFile[]> =>
  Promise.all(
    paths
      .filter((p) => /\.pdf$/i.test(p))
      .map(async (path) => ({name: splitPath(path).name, path, bytes: await readPath(path)})),
  );

export const tauriPlatform: Platform = {
  native: true,
  async pickPdfs({multiple}) {
    const picked = await open({multiple, filters: [{name: 'PDF', extensions: ['pdf']}]});
    if (!picked) return [];
    return readPdfs(typeof picked === 'string' ? [picked] : picked);
  },
  readPath,
  onFileDrop(cb) {
    const unlisten = getCurrentWebview().onDragDropEvent(({payload}) => {
      if (payload.type === 'drop')
        void readPdfs(payload.paths).then(
          (files) => cb({type: 'drop', files}),
          () => cb({type: 'error'}),
        );
      else cb({type: payload.type === 'leave' ? 'leave' : 'over'});
    });
    return () => void unlisten.then((stop) => stop());
  },
  async saveAs(bytes, name, kind) {
    // Rust shows the dialog and writes atomically (src-tauri/src/main.rs); null on cancel.
    const path = await invoke<string | null>('save_as', bytes, {
      headers: {name: encodeURIComponent(name), kind},
    });
    if (!path) return null;
    return {...splitPath(path), path};
  },
  openPath: (path) => openPath(path),
  reveal: (path) => revealItemInDir(path),
  openUrl: (url) => openUrl(url),
  window: {
    minimize: () => getCurrentWindow().minimize(),
    toggleMaximize: () => getCurrentWindow().toggleMaximize(),
    close: () => getCurrentWindow().close(),
    onCloseRequested(handler) {
      // A throwing handler would leave the window open for good (the API skips destroy()), so it closes.
      const unlisten = getCurrentWindow().onCloseRequested(async (e) => {
        if (!(await handler().catch(() => true))) e.preventDefault();
      });
      return () => void unlisten.then((stop) => stop());
    },
  },
};
