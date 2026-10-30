// Browser check for Settings → Updates against a mocked Tauri bridge (updates are manual only).
// Proves the UI states and install safeguards only; it is not evidence of a real Windows upgrade.
// Run: PLAYWRIGHT=<path to playwright> CHROME=<chrome binary> pnpm check:updates
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {start} from './harness.js';

const app = await start(4180);

// Installed after the harness bridge: answers the updater commands.
function mockUpdater() {
  window.__mock = {check: 'none', failDownloadOnce: false};
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const send = (channel, index, message) => window.__callbacks.get(channel.id)?.({index, message});
  const readDraft = () => new Promise(resolve => {
    const r = indexedDB.open('ifixpdf-workspace-draft', 1);
    r.onsuccess = () => { const g = r.result.transaction('draft').objectStore('draft').get('document'); g.onsuccess = () => resolve(g.result) };
  });
  window.__tauri = {
    'plugin:updater|check'() {
      const m = window.__mock;
      if (m.check === 'unconfigured') throw 'Updater does not have any endpoints set.';
      if (m.check === 'error') throw 'Could not fetch a valid release JSON from the remote';
      if (m.check === 'none') return null;
      return {rid: 7, currentVersion: '0.1.0', version: '0.2.0', body: 'Faster merge.\n<img src=x onerror="window.__xss=1">', rawJson: {}};
    },
    async 'plugin:updater|download'(args) {
      if (window.__mock.failDownloadOnce) { window.__mock.failDownloadOnce = false; throw 'error decoding response body' }
      send(args.onEvent, 0, {event: 'Started', data: {contentLength: 1000}});
      await wait(150);
      send(args.onEvent, 1, {event: 'Progress', data: {chunkLength: 400}});
      await wait(400);
      send(args.onEvent, 2, {event: 'Progress', data: {chunkLength: 600}});
      send(args.onEvent, 3, {event: 'Finished'});
      return 8;
    },
    async 'plugin:updater|install'() { window.__draftAtInstall = await readDraft(); return null }
  };
}
const called = (page, cmd) => page.evaluate(cmd => window.__calls.some(c => c.cmd === cmd), cmd);

async function open(native) {
  const {context, page, errors} = await app.page({tauri: native});
  if (native) await page.addInitScript(mockUpdater);
  await page.goto(app.url('view=home'));
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

// Native: unconfigured, up to date, offline, error + retry.
{
  const {context, page, errors} = await open(true);
  await page.waitForTimeout(4000);
  assert.ok(!(await called(page, 'plugin:updater|check')), 'no update check until the user presses Check for updates');

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
  const {context, page, errors} = await app.page({tauri: true});
  await page.addInitScript(mockUpdater);
  await page.addInitScript(() => { window.__mock.check = 'available' });
  await page.goto(app.url('view=home'));
  await page.click('[data-view=settings]');
  await updates(page).getByRole('button', {name: 'Check for updates'}).click();
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
  await page.click('[data-view=preview]');
  await page.setInputFiles('#file-input', {name: 'Report.pdf', mimeType: 'application/pdf', buffer: Buffer.from(await pdf.save())});
  await page.waitForFunction(() => document.querySelector('#view-subtitle')?.textContent === 'Report.pdf');
  await page.click('[data-view=settings]');
  const install = updates(page).getByRole('button', {name: 'Restart and install'});

  await page.evaluate(() => { document.querySelector('.header-actions [data-action=export]').click(); document.querySelector('#updates [data-update=install]').click() });
  await page.locator('.toast', {hasText: 'export finishes'}).waitFor();
  assert.ok(!(await called(page, 'plugin:updater|install')), 'install deferred while exporting');

  await page.click('[data-view=settings]');
  await page.evaluate(() => { window.__realOpen = indexedDB.open; indexedDB.open = () => { throw new Error('quota') } });
  await install.click();
  await updates(page).getByText("couldn't save your workspace", {exact: false}).waitFor();
  assert.ok(!(await called(page, 'plugin:updater|install')), 'install blocked when draft save fails');

  await page.evaluate(() => { indexedDB.open = window.__realOpen });
  await install.click();
  await page.waitForFunction(() => window.__calls.some(c => c.cmd === 'plugin:updater|install'));
  const draft = await page.evaluate(() => window.__draftAtInstall);
  assert.equal(draft?.files?.length, 1, 'workspace draft saved before install');
  assert.deepEqual(errors, []);
  await context.close();
}

await app.close();
console.log('updates check passed');
