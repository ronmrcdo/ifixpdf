// Shared Vite + Playwright harness for the browser checks.
// Run checks with: PLAYWRIGHT=<path to playwright> CHROME=<chrome binary> pnpm check:<name>
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import {PDFDocument} from 'pdf-lib';

const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');

// Installed as an init script: a fake Tauri bridge. Tests answer commands through window.__tauri[cmd].
function mockTauri() {
  const callbacks = new Map();
  let next = 1;
  window.__calls = [];
  window.__callbacks = callbacks;
  window.__TAURI_INTERNALS__ = {
    transformCallback(cb) { const id = next++; callbacks.set(id, cb); return id },
    unregisterCallback(id) { callbacks.delete(id) },
    async invoke(cmd, args, options) { window.__calls.push({cmd, args, options}); return await window.__tauri?.[cmd]?.(args, options) ?? null }
  };
}

export async function start(port) {
  const server = await createServer({logLevel: 'error', server: {port, strictPort: true}});
  await server.listen();
  const browser = await chromium.launch({executablePath: process.env.CHROME, args: ['--no-sandbox']});
  return {
    browser,
    url: query => `http://localhost:${port}/index.html?${query}`,
    async page({tauri = false, viewport = {width: 1440, height: 900}} = {}) {
      const context = await browser.newContext({viewport});
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      if (tauri) await page.addInitScript(mockTauri);
      return {context, page, errors};
    },
    async close() { await browser.close(); await server.close() }
  };
}

export async function pdf(pages) {
  const doc = await PDFDocument.create();
  for (let n = 0; n < pages; n++) doc.addPage();
  return Buffer.from(await doc.save());
}
