// Browser check: every export goes through one "Save as" (native dialog + fs in Tauri, picker or download in the browser).
// Run: PLAYWRIGHT=<path to playwright> CHROME=<chrome binary> pnpm check:save
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {start, pdf} from './harness.js';

const app = await start(4182);
const file = async (name, pages) => ({name, mimeType: 'application/pdf', buffer: await pdf(pages)});
const report = await file('Report.pdf', 3), a = await file('A.pdf', 1), b = await file('B.pdf', 2);

// Native: shapes match @tauri-apps/plugin-dialog save() -> invoke('plugin:dialog|save', {options})
// and @tauri-apps/plugin-fs writeFile() -> invoke('plugin:fs|write_file', bytes, {headers: {path: encodeURIComponent(path)}}).
const {context, page, errors} = await app.page({tauri: true});
await page.addInitScript(() => {
  window.__tauri = {
    'plugin:dialog|save': ({options}) => window.__savePath === undefined ? '/home/ron/Docs/' + options.defaultPath : window.__savePath,
    'plugin:fs|write_file': (bytes, options) => { if (window.__failWrite) throw Error('disk full'); window.__written = {bytes: [...bytes], path: decodeURIComponent(options.headers.path)} }
  };
});
const calls = cmd => page.evaluate(cmd => window.__calls.filter(c => c.cmd === cmd).map(c => c.cmd === 'plugin:dialog|save' ? c.args.options : null), cmd);
const lastDialog = async () => (await calls('plugin:dialog|save')).at(-1);
const waitCalls = (cmd, n) => page.waitForFunction(({cmd, n}) => window.__calls.filter(c => c.cmd === cmd).length === n, {cmd, n}, {timeout: 5000});
const toastHas = s => page.locator('.toast', {hasText: s}).waitFor({timeout: 5000});
const clearToast = () => page.evaluate(() => document.querySelector('.toast')?.remove());
const recents = () => page.evaluate(() => new Promise(resolve => { const r = indexedDB.open('ifixpdf-local-documents', 1); r.onsuccess = () => { const g = r.result.transaction('recent').objectStore('recent').count(); g.onsuccess = () => { r.result.close(); resolve(g.result) } } }));
const written = () => page.evaluate(() => window.__written);
const pagesOf = async w => (await PDFDocument.load(new Uint8Array(w.bytes))).getPageCount();
const set = (k, v) => page.evaluate(([k, v]) => { window[k] = v }, [k, v]);

await page.goto(app.url('view=home'));
await page.setInputFiles('#file-input', report);
await page.waitForFunction(() => document.querySelector('#view-title').textContent === 'Preview PDF' && document.querySelector('#page-jump'));

// Preview Ctrl+S.
await page.locator('#view-title').click();
await page.keyboard.press('Control+s');
await page.waitForFunction(() => window.__calls.some(c => c.cmd === 'plugin:fs|write_file'), null, {timeout: 15000}); // first run may wait for Vite to optimise the plugins
assert.equal((await lastDialog()).defaultPath, 'Report.pdf');
assert.equal(await pagesOf(await written()), 3);

// Extract.
await page.click('.sidebar [data-view=edit]');
const check = n => page.locator('.page-card .page-check input').nth(n);
await check(2).waitFor();
await check(0).check();
await check(2).check();
await page.click('[data-pages=extract]');
await toastHas('extracted');
let dialog = await lastDialog(), out = await written();
assert.equal(dialog.defaultPath, 'Report – pages 1, 3.pdf');
assert.deepEqual(dialog.filters.map(f => f.extensions), [['pdf']]);
assert.equal(out.path, '/home/ron/Docs/Report – pages 1, 3.pdf');
assert.equal(await pagesOf(out), 2);
await check(2).uncheck();
await check(1).check();
await page.click('[data-pages=extract]');
await waitCalls('plugin:fs|write_file', 3);
assert.equal((await lastDialog()).defaultPath, 'Report – pages 1–2.pdf');

// Split: cancel keeps the form open.
await page.click('[data-action=split]');
await page.selectOption('dialog select[name=mode]', 'every');
await set('__savePath', null);
await page.click('dialog [type=submit]');
await waitCalls('plugin:dialog|save', 4);
dialog = await lastDialog();
assert.equal(dialog.defaultPath, 'Report — split.zip');
assert.deepEqual(dialog.filters.map(f => f.extensions), [['zip']]);
await page.waitForFunction(() => !document.querySelector('dialog [type=submit]').disabled, null, {timeout: 5000});
assert.equal(await page.locator('.action-success').count(), 0, 'cancelled split shows no success');
await page.click('dialog [data-close]');
await set('__savePath', undefined);

// Add password.
await page.click('.sidebar [data-view=home]');
await page.locator('[data-recent-menu]').first().click();
await page.click('[data-command=password]');
await page.fill('dialog [name=password]', 'secret-pass');
await page.fill('dialog [name=confirm]', 'secret-pass');
await page.click('dialog [type=submit]');
await page.locator('.action-success').waitFor({timeout: 5000});
assert.equal((await lastDialog()).defaultPath, 'Report — protected.pdf');
await page.click('.action-success button');

// Edit save uses the name the dialog returned.
await page.click('.sidebar [data-view=edit]');
await page.fill('#output-name', 'Final.pdf');
await page.dispatchEvent('#output-name', 'change');
await clearToast();
await page.click('[data-action=export]');
await toastHas('Saved Final.pdf.');
assert.equal((await lastDialog()).defaultPath, 'Final.pdf');
assert.equal((await written()).path, '/home/ron/Docs/Final.pdf');

// Merge: cancel, then a failed write, then success.
await page.click('.sidebar [data-view=combine]');
await page.setInputFiles('#file-input', [a, b]);
await page.waitForFunction(() => document.querySelector('#status')?.textContent.includes('2 files'), null, {timeout: 5000});
await page.click('[data-action=export]');
await page.locator('.combine-workflow li.current', {hasText: 'Save PDF'}).waitFor();
const before = await recents(), writes = (await page.evaluate(() => window.__calls.filter(c => c.cmd === 'plugin:fs|write_file').length));
const current = () => page.locator('.combine-workflow li.current').textContent();
await clearToast();
await set('__savePath', null);
const dialogs = (await calls('plugin:dialog|save')).length;
await page.click('[data-action=export]');
await waitCalls('plugin:dialog|save', dialogs + 1);
await page.waitForTimeout(300);
assert.equal((await page.evaluate(() => window.__calls.filter(c => c.cmd === 'plugin:fs|write_file').length)), writes, 'cancel writes nothing');
assert.equal(await page.locator('.toast').count(), 0, 'cancel shows no toast');
assert.match(await current(), /Save PDF/);
assert.equal(await recents(), before);
await set('__savePath', undefined);
await set('__failWrite', true);
await page.click('[data-action=export]');
await toastHas('Could not save');
assert.match(await current(), /Save PDF/);
assert.equal(await recents(), before, 'failed write adds no recent');
await set('__failWrite', false);
// Switch to Preview while the dialog is open: the result still lands in Merge.
await page.evaluate(() => { const real = window.__tauri['plugin:dialog|save']; window.__tauri['plugin:dialog|save'] = async args => { await new Promise(r => { window.__release = r }); return real(args) } });
await page.click('[data-action=export]');
await page.waitForFunction(() => window.__release, null, {timeout: 5000});
await page.click('.sidebar [data-view=preview]');
await page.evaluate(() => window.__release());
await page.waitForFunction(n => window.__calls.filter(c => c.cmd === 'plugin:fs|write_file').length === n, writes + 2, {timeout: 5000});
await page.waitForTimeout(300);
assert.equal(await page.locator('#view-title').textContent(), 'Preview PDF', 'save does not move the user');
assert.equal(await page.locator('.toast', {hasText: 'Saved'}).count(), 0, 'no document save toast');
await page.click('.sidebar [data-view=combine]');
await page.locator('.combine-workflow li.current', {hasText: 'Done'}).waitFor({timeout: 5000});
assert.equal(await recents(), before + 1);
assert.equal(await pagesOf(await written()), 3);

// Ctrl+S on Home with the document workspace active saves nothing.
await page.click('.sidebar [data-view=preview]');
await page.click('.sidebar [data-view=home]');
const saves = (await calls('plugin:dialog|save')).length;
await page.keyboard.press('Control+s');
await page.waitForTimeout(300);
assert.equal((await calls('plugin:dialog|save')).length, saves, 'Ctrl+S on Home opens no dialog');
assert.equal(await page.locator('#view-title').textContent(), 'Home');
assert.deepEqual(errors, []);
await context.close();

// Browser: File System Access picker, AbortError, and plain download fallback.
const browser = await app.page();
const p = browser.page;
await p.addInitScript(() => {
  window.showSaveFilePicker = async o => { if (window.__abort) throw new DOMException('', 'AbortError'); return {name: o.suggestedName, createWritable: async () => ({write: async bytes => { window.__pickedBytes = bytes.length }, close: async () => {}})} };
});
let downloads = [];
p.on('download', d => downloads.push(d));
await p.goto(app.url('view=home'));
await p.setInputFiles('#file-input', report);
await p.waitForFunction(() => document.querySelector('#page-jump'));
await p.click('.sidebar [data-view=edit]');
await p.fill('#output-name', 'Final.pdf');
await p.dispatchEvent('#output-name', 'change');
await p.click('[data-action=export]');
await p.locator('.toast', {hasText: 'Saved Final.pdf.'}).waitFor({timeout: 5000});
assert.ok(await p.evaluate(() => window.__pickedBytes) > 0, 'picker received the bytes');
assert.equal(downloads.length, 0);
await p.evaluate(() => { window.__abort = true; document.querySelector('.toast')?.remove() });
await p.click('[data-action=export]');
await p.waitForTimeout(500);
assert.equal(downloads.length, 0, 'abort downloads nothing');
assert.equal(await p.locator('.toast').count(), 0, 'abort shows no toast');
await p.evaluate(() => { delete window.showSaveFilePicker });
const [download] = await Promise.all([p.waitForEvent('download', {timeout: 5000}), p.click('[data-action=export]')]);
assert.equal(download.suggestedFilename(), 'Final.pdf');
assert.deepEqual(browser.errors, []);
await browser.context.close();

await app.close();
console.log('save check passed');
