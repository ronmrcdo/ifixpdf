import {test as base, expect, type Page} from '@playwright/test';
import {PDFDocument, degrees} from 'pdf-lib';

declare global {
  interface Window {
    // Bridge and per-scenario test state the specs set and read inside page.evaluate.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ad hoc in-page test globals of many shapes
    [key: `__${string}`]: any;
    showSaveFilePicker?: (options: {suggestedName: string}) => Promise<unknown>;
  }
}

const ENTRY = '/index.html';

// Installed as an init script: a fake Tauri bridge. Tests answer commands through window.__tauri[cmd].
function mockTauri() {
  const callbacks = new Map<number, (message: unknown) => void>();
  let next = 1;
  window.__calls = [];
  window.__callbacks = callbacks;
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = {unregisterListener() {}}; // event.js _unlisten() calls this
  window.__TAURI_INTERNALS__ = {
    // getCurrentWebview() / getCurrentWindow() read these labels (@tauri-apps/api webview.js, window.js).
    metadata: {currentWindow: {label: 'main'}, currentWebview: {windowLabel: 'main', label: 'main'}},
    transformCallback(cb: (message: unknown) => void) { const id = next++; callbacks.set(id, cb); return id },
    unregisterCallback(id: number) { callbacks.delete(id) },
    async invoke(cmd: string, args: unknown, options: unknown) { window.__calls.push({cmd, args, options}); return await window.__tauri?.[cmd]?.(args, options) ?? null }
  };
}

export async function makePdf(pages: number, {rotate = 0, size}: {rotate?: number; size?: [number, number]} = {}) {
  const doc = await PDFDocument.create();
  for (let n = 0; n < pages; n++) doc.addPage(size).setRotation(degrees(rotate));
  return Buffer.from(await doc.save());
}

export const pdfFile = async (name: string, pages: number) => ({name, mimeType: 'application/pdf', buffer: await makePdf(pages)});
type PdfFile = Awaited<ReturnType<typeof pdfFile>>;
/** Runs `trigger` and returns the file chooser it opens. */
export async function chooserFrom(page: Page, trigger: () => Promise<unknown>) {
  const chooser = page.waitForEvent('filechooser');
  // playwright-core sends updateSubscription fire-and-forget; a round trip orders the interception before the trigger, else the picker opens natively and is lost.
  await page.evaluate(() => 0);
  await trigger();
  return chooser;
}

export type TauriCall = {cmd: string; args: unknown; options: unknown};

const openDb = (name: string) => `new Promise(r => { const q = indexedDB.open('${name}', 2); q.onsuccess = () => r(q.result) })`;

// In-page reader of the document draft, so page code (e.g. a mocked install) can read it at the moment it runs.
const draftReader = `window.__readDraft = () => ${openDb('ifixpdf-workspace-draft')}.then(db => new Promise(r => { const g = db.transaction('draft').objectStore('draft').get('document'); g.onsuccess = () => { db.close(); r(g.result) } }))`;

// Seeds a one-file document draft. Needs a prior goto (origin); goto again to load it.
export async function seedDraft(page: Page, view: 'preview' | 'edit', name: string, pages: number) {
  const bytes = [...await makePdf(pages)];
  await page.evaluate(async ({bytes, view, name, pages}) => {
    const db = await new Promise<IDBDatabase>(r => {
      const q = indexedDB.open('ifixpdf-workspace-draft', 2);
      q.onupgradeneeded = () => { q.result.createObjectStore('draft'); q.result.createObjectStore('draft-files') };
      q.onsuccess = () => r(q.result);
    });
    const data = new Uint8Array(bytes), savedAt = Date.now();
    const order = Array.from({length: pages}, (_, i) => ({uid: `u${i}`, fileId: 'f1', local: i}));
    await new Promise<void>(r => {
      const tx = db.transaction(['draft', 'draft-files'], 'readwrite');
      tx.objectStore('draft-files').put(data, 'f1');
      tx.objectStore('draft').put({files: [{id: 'f1', name, pages, size: data.byteLength}], pages: order.map(p => ({...p, rotation: 0})), currentPage: 0, view, selection: [], anchor: null, exportSettings: {name, rangeMode: 'all', customRange: '', useFileNamesAsTitle: true}, savedAt}, 'document');
      tx.oncomplete = () => { db.close(); r() };
    });
  }, {bytes, view, name, pages});
}

// Seeds a browser-mode recent and returns its id. Needs a prior goto (origin).
export async function seedRecent(page: Page, name: string, pages: number): Promise<string> {
  const bytes = [...await makePdf(pages)];
  return page.evaluate(async ({bytes, name, pages}) => {
    const db = await new Promise<IDBDatabase>(r => {
      const q = indexedDB.open('ifixpdf-local-documents', 2);
      q.onupgradeneeded = () => {
        q.result.createObjectStore('recent-meta', {keyPath: 'id'}).createIndex('key', 'key', {unique: true});
        q.result.createObjectStore('recent-bytes');
      };
      q.onsuccess = () => r(q.result);
    });
    const id = crypto.randomUUID(), data = new Uint8Array(bytes), modified = Date.now();
    // the content hash is the real browser-mode key, so saving a thumbnail updates this row instead of adding another
    const key = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(x => x.toString(16).padStart(2, '0')).join('');
    await new Promise<void>(r => {
      const tx = db.transaction(['recent-meta', 'recent-bytes'], 'readwrite');
      tx.objectStore('recent-meta').put({id, key, name, pages, size: data.byteLength, modified});
      tx.objectStore('recent-bytes').put(data, id);
      tx.oncomplete = () => { db.close(); r() };
    });
    return id;
  }, {bytes, name, pages});
}

function appFor(page: Page) {
  const app = {
    page,
    goto: async (query = '') => { await page.goto(query ? `${ENTRY}?${query}` : ENTRY) },
    nav: (name: string) => page.getByRole('navigation', {name: 'Main'}).getByRole('button', {name, exact: true}),
    // Navigation applies a frame later (inside a view transition), so wait for the nav item to turn current before keys are pressed.
    view: async (name: string) => { await app.nav(name).click(); await expect(app.nav(name)).toHaveAttribute('aria-current', 'page') },
    tab: (name: 'Document' | 'Pages') => page.getByRole('tab', {name, exact: true}),
    title: page.getByRole('heading', {level: 1}),
    subtitle: page.locator('#view-subtitle'),
    status: page.getByRole('contentinfo'),
    toast: (text?: string) => text ? page.locator('.toast', {hasText: text}) : page.locator('.toast'),
    // Toasts are React-managed, so wait for them to clear (4.5 s) instead of removing them.
    dismissToast: async () => { await page.locator('.toast').waitFor({state: 'detached', timeout: 10000}) },
    // Opens the picker with Ctrl+O from any view.
    async addFiles(files: PdfFile | PdfFile[]) {
      const list = Array.isArray(files) ? files : [files];
      // With the mocked bridge, Ctrl+O opens the native dialog: answer it with paths and serve their bytes through plugin-fs.
      const native = await page.evaluate((list) => {
        if (!('__TAURI_INTERNALS__' in window)) return false;
        const byPath = Object.fromEntries(list.map(([name, bytes]) => [`/home/ron/In/${name}`, bytes]));
        window.__tauri = {...window.__tauri, 'plugin:dialog|open': () => Object.keys(byPath), 'plugin:fs|read_file': ({path}: {path: string}) => byPath[path]};
        return true;
      }, list.map(f => [f.name, [...f.buffer]] as const));
      if (native) return void await page.keyboard.press('Control+o');
      await (await chooserFrom(page, () => page.keyboard.press('Control+o'))).setFiles(files);
    },
    // Fires the registered tauri://drag-drop listener the way the webview does:
    // @tauri-apps/api/webview.js onDragDropEvent listens to TauriEvent.DRAG_DROP and reads event.payload.paths and .position.
    dropFiles: (paths: string[]) => page.evaluate((paths) => {
      // the last registration is the live one (React StrictMode mounts the effect twice and the mock never unlistens)
      const listen = window.__calls.filter((c: TauriCall) => c.cmd === 'plugin:event|listen' && (c.args as {event: string}).event === 'tauri://drag-drop').at(-1);
      if (!listen) throw new Error('no tauri://drag-drop listener registered');
      window.__callbacks.get((listen.args as {handler: number}).handler)!({event: 'tauri://drag-drop', id: 1, payload: {paths, position: {x: 10, y: 10}}});
    }, paths),
    async openPdf(file: PdfFile) {
      await app.addFiles(file);
      await expect(app.title).toHaveText('Preview PDF');
      await expect(page.getByRole('spinbutton', {name: 'Go to page'})).toBeVisible();
    },
    calls: (cmd: string): Promise<TauriCall[]> => page.evaluate(cmd => window.__calls.filter((c: TauriCall) => c.cmd === cmd), cmd),
    setGlobal: (key: `__${string}`, value: unknown) => page.evaluate(([k, v]) => { window[k as `__${string}`] = v }, [key, value] as const),
    recentCount: (): Promise<number> => page.evaluate(`${openDb('ifixpdf-local-documents')}.then(db => new Promise(r => { const g = db.transaction('recent-meta').objectStore('recent-meta').count(); g.onsuccess = () => { db.close(); r(g.result) } }))`),
    // Paths of the recents rows.
    recentPaths: (): Promise<(string | undefined)[]> => page.evaluate(`${openDb('ifixpdf-local-documents')}.then(db => new Promise(r => { const g = db.transaction('recent-meta').objectStore('recent-meta').getAll(); g.onsuccess = () => { db.close(); r(g.result.map(x => x.path)) } }))`),
    draftKeys: (): Promise<string[]> => page.evaluate(`${openDb('ifixpdf-workspace-draft')}.then(db => new Promise(r => { const g = db.transaction('draft').objectStore('draft').getAllKeys(); g.onsuccess = () => { db.close(); r(g.result.sort()) } }))`),
    readDraft: (): Promise<{files?: unknown[]} | undefined> => page.evaluate(() => window.__readDraft()),
    dropSavedDraft: (): Promise<void> => page.evaluate(`${openDb('ifixpdf-workspace-draft')}.then(db => new Promise(r => { const tx = db.transaction('draft', 'readwrite'); tx.objectStore('draft').delete('document'); tx.oncomplete = () => { db.close(); r() } }))`),
    // Seeds a one-file document draft. Needs a prior goto (origin); goto again to load it.
    seedDraft: (view: 'preview' | 'edit', name: string, pages: number) => seedDraft(page, view, name, pages),
    // Seeds a browser-mode recent and returns its id. Needs a prior goto.
    seedRecent: (name: string, pages: number) => seedRecent(page, name, pages),
    splitPath: (path: string): Promise<{name: string; folder: string}> => page.evaluate(`import('/src/domain/naming.ts').then(m => m.splitPath(${JSON.stringify(path)}))`)
  };
  return app;
}
export type App = ReturnType<typeof appFor>;

export const test = base.extend<{tauri: boolean; pageErrors: string[]; app: App}>({
  tauri: [false, {option: true}],
  // Every scenario asserts no uncaught page errors, as the old checks did.
  pageErrors: async ({page}, use) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await use(errors);
    expect(errors).toEqual([]);
  },
  app: async ({page, tauri, pageErrors}, use) => {
    void pageErrors;
    await page.addInitScript({content: draftReader});
    if (tauri) await page.addInitScript(mockTauri);
    await use(appFor(page));
  }
});

export {expect};
