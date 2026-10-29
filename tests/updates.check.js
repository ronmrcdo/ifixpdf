// Browser check for Settings → Updates against a mocked Tauri bridge.
// Proves the UI states and install safeguards only; it is not evidence of a real Windows upgrade.
// Run: PLAYWRIGHT=<path to playwright> CHROME=<chrome binary> pnpm check:updates
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'vite';
import {PDFDocument} from 'pdf-lib';

const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT || 'playwright');
const server = await createServer({logLevel: 'error', server: {port: 4180, strictPort: true}});
await server.listen();
const browser = await chromium.launch({executablePath: process.env.CHROME, args: ['--no-sandbox']});
const url = 'http://localhost:4180/index.html?view=home';

function mockTauri() {
  const callbacks = new Map();
  let next = 1;
  window.__calls = [];
  window.__mock = {check: 'none', failDownloadOnce: false};
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const send = (channel, index, message) => callbacks.get(channel.id)?.({index, message});
  const readDraft = () => new Promise(resolve => {
    const r = indexedDB.open('ifixpdf-workspace-draft', 1);
    r.onsuccess = () => { const g = r.result.transaction('draft').objectStore('draft').get('merge'); g.onsuccess = () => resolve(g.result) };
  });
  window.__TAURI_INTERNALS__ = {
    transformCallback(cb) { const id = next++; callbacks.set(id, cb); return id },
    unregisterCallback(id) { callbacks.delete(id) },
    async invoke(cmd, args) {
      window.__calls.push(cmd);
      const m = window.__mock;
      if (cmd === 'plugin:updater|check') {
        if (m.check === 'unconfigured') throw 'Updater does not have any endpoints set.';
        if (m.check === 'error') throw 'Could not fetch a valid release JSON from the remote';
        if (m.check === 'none') return null;
        return {rid: 7, currentVersion: '0.1.0', version: '0.2.0', body: 'Faster merge.\n<img src=x onerror="window.__xss=1">', rawJson: {}};
      }
      if (cmd === 'plugin:updater|download') {
        if (m.failDownloadOnce) { m.failDownloadOnce = false; throw 'error decoding response body' }
        send(args.onEvent, 0, {event: 'Started', data: {contentLength: 1000}});
        await wait(150);
        send(args.onEvent, 1, {event: 'Progress', data: {chunkLength: 400}});
        await wait(400);
        send(args.onEvent, 2, {event: 'Progress', data: {chunkLength: 600}});
        send(args.onEvent, 3, {event: 'Finished'});
        return 8;
      }
      if (cmd === 'plugin:updater|install') { window.__draftAtInstall = await readDraft(); return null }
      return null;
    }
  };
}

async function open(native) {
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (native) await page.addInitScript(mockTauri);
  await page.goto(url);
  await page.click('[data-view=settings]');
  return {context, page, errors};
}
const updates = page => page.locator('#updates');
const setMock = (page, value) => page.evaluate(v => Object.assign(window.__mock, v), value);

// Browser build: version shown, no native update controls.
{
  const {context, page, errors} = await open(false);
  await updates(page).getByText('0.1.0').waitFor();
  await updates(page).getByText('installed desktop app').waitFor();
  assert.equal(await updates(page).locator('button').count(), 0);
  assert.deepEqual(errors, []);
  await context.close();
}

// Native: unconfigured, up to date, offline, error + retry, and a quiet background check.
{
  const {context, page, errors} = await open(true);
  await page.waitForFunction(() => window.__calls.includes('plugin:updater|check'), null, {timeout: 10000});
  assert.equal(await page.locator('.toast').count(), 0, 'background check with no update stays quiet');

  await setMock(page, {check: 'unconfigured'});
  await updates(page).getByRole('button', {name: 'Check for updates'}).click();
  await updates(page).getByText('not configured').waitFor();

  await setMock(page, {check: 'none'});
  await updates(page).getByRole('button', {name: 'Check for updates'}).click();
  await updates(page).getByText('up to date').waitFor();

  await setMock(page, {check: 'error'});
  await context.setOffline(true);
  await updates(page).getByRole('button', {name: 'Check for updates'}).click();
  await updates(page).getByText('offline').waitFor();
  await context.setOffline(false);
  await updates(page).getByRole('button', {name: 'Retry'}).click();
  await updates(page).getByText("Couldn't check for updates").waitFor();

  await setMock(page, {check: 'none'});
  await updates(page).getByRole('button', {name: 'Retry'}).click();
  await updates(page).getByText('up to date').waitFor();
  assert.deepEqual(errors, []);
  await context.close();
}

// Native: update available → download (fail, retry) → deferred during export → draft failure → install.
{
  const context = await browser.newContext({viewport: {width: 1440, height: 900}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(mockTauri);
  await page.addInitScript(() => { window.__mock.check = 'available' });
  await page.goto(url);
  await page.locator('.toast', {hasText: 'iFixPDF 0.2.0 is available'}).waitFor({timeout: 10000});

  await page.click('[data-view=settings]');
  await updates(page).getByText('0.2.0').first().waitFor();
  await updates(page).getByText('<img src=x', {exact: false}).waitFor();
  assert.equal(await page.evaluate(() => window.__xss), undefined, 'release notes render as text');

  await setMock(page, {failDownloadOnce: true});
  await updates(page).getByRole('button', {name: 'Download update'}).click();
  await updates(page).getByText('Download failed').waitFor();
  await updates(page).getByRole('button', {name: 'Retry'}).click();
  await updates(page).getByText('40%').waitFor();
  await updates(page).getByRole('button', {name: 'Restart and install'}).waitFor();

  // Put documents in the workspace, then come back: Settings keeps the ready state.
  const pdf = await PDFDocument.create();
  pdf.addPage();
  await page.setInputFiles('#file-input', {name: 'Report.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save())});
  await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('1 files'));
  await page.click('[data-view=settings]');
  const install = updates(page).getByRole('button', {name: 'Restart and install'});

  await page.evaluate(() => { document.querySelector('.header-actions [data-action=export]').click(); document.querySelector('#updates [data-update=install]').click() });
  await page.locator('.toast', {hasText: 'export finishes'}).waitFor();
  assert.ok(!(await page.evaluate(() => window.__calls)).includes('plugin:updater|install'), 'install deferred while exporting');

  await page.click('[data-view=settings]');
  await page.evaluate(() => { window.__realOpen = indexedDB.open; indexedDB.open = () => { throw new Error('quota') } });
  await install.click();
  await updates(page).getByText("couldn't save your workspace", {exact: false}).waitFor();
  assert.ok(!(await page.evaluate(() => window.__calls)).includes('plugin:updater|install'), 'install blocked when draft save fails');

  await page.evaluate(() => { indexedDB.open = window.__realOpen });
  await install.click();
  await page.waitForFunction(() => window.__calls.includes('plugin:updater|install'));
  const draft = await page.evaluate(() => window.__draftAtInstall);
  assert.equal(draft?.files?.length, 1, 'workspace draft saved before install');
  assert.deepEqual(errors, []);
  await context.close();
}

await browser.close();
await server.close();
console.log('updates check passed');
