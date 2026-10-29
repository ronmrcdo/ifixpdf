// Browser check: Preview/Edit (document) and Merge keep separate files, undo history and drafts.
// Run: PLAYWRIGHT=<path to playwright> CHROME=<chrome binary> pnpm check:workspaces
import assert from 'node:assert/strict';
import {start, pdf} from './harness.js';

const app = await start(4181);
const {context, page, errors} = await app.page();
const file = async (name, pages) => ({name, mimeType: 'application/pdf', buffer: await pdf(pages)});
const report = await file('Report.pdf', 3), a = await file('A.pdf', 1), b = await file('B.pdf', 2), c = await file('C.pdf', 1);
const view = v => page.click(`.sidebar [data-view=${v}]`);
const text = s => page.locator(s).textContent();
const waitStatus = s => page.waitForFunction(s => document.querySelector('#status')?.textContent.includes(s), s, {timeout: 5000});
const keys = () => page.evaluate(() => new Promise(resolve => {
  const r = indexedDB.open('ifixpdf-workspace-draft', 1);
  r.onsuccess = () => { const g = r.result.transaction('draft').objectStore('draft').getAllKeys(); g.onsuccess = () => { r.result.close(); resolve(g.result.sort()) } };
}));
const noParams = () => app.url('view=home').replace('?view=home', '');
async function previewIsReport(pageNumber) {
  await view('preview');
  assert.equal(await text('#view-subtitle'), 'Report.pdf', 'Preview still shows the document');
  if (pageNumber) assert.equal(await page.inputValue('#page-jump'), String(pageNumber), 'Preview keeps its page');
}
async function mergeIsEmpty() {
  assert.ok(await page.getByText('Choose PDFs to merge').isVisible(), 'Merge starts empty');
  assert.match(await page.locator('.combine-workflow li').first().getAttribute('class'), /current/);
  assert.equal(await page.locator('.combine-workflow li.complete').count(), 0, 'no workflow step complete');
}

// Views don't share files.
await page.goto(app.url('view=home'));
await page.setInputFiles('#file-input', report);
await page.waitForFunction(() => document.querySelector('#view-title').textContent === 'Preview PDF' && document.querySelector('#page-jump'));
await page.fill('#page-jump', '2');
await page.dispatchEvent('#page-jump', 'change');
await view('combine');
await mergeIsEmpty();
assert.equal(await page.locator('[data-action=restore-draft]').count(), 0, 'no Return to previous document');
await previewIsReport(2);

// Merge kept across views.
await view('combine');
await page.setInputFiles('#file-input', [a, b]);
await waitStatus('2 files · 3 pages');
await view('settings');
await previewIsReport(2);
await view('combine');
assert.match(await text('#status'), /2 files · 3 pages/);

// Add files from Settings goes to Merge, not the document.
await view('settings');
await page.setInputFiles('#file-input', c);
await waitStatus('3 files');
assert.equal(await text('#view-title'), 'Merge PDFs');
await previewIsReport(2);

// Separate undo.
await view('combine');
await page.click('[data-action=rotate]');
assert.equal(await page.isDisabled('[data-edit=undo]'), false);
await view('edit');
assert.equal(await page.isDisabled('[data-edit=undo]'), true, 'Edit has its own undo history');
await view('combine');
assert.equal(await page.isDisabled('[data-edit=undo]'), false, 'Merge undo kept');

// New merge clears only Merge.
await page.click('.header-actions [data-action=new-combine]');
await mergeIsEmpty();
await previewIsReport(2);
await page.goto(noParams());
await waitStatus('files');
await previewIsReport();

// Recents → Merge leaves the document alone.
await view('home');
await page.locator('[data-recent-check]').nth(1).waitFor();
await page.locator('[data-recent-check]').nth(0).check();
await page.locator('[data-recent-check]').nth(1).check();
await page.click('[data-action=merge-selected]');
await waitStatus('2 files');
assert.equal(await text('#view-title'), 'Merge PDFs');
await previewIsReport();

// Drafts per workspace.
await page.waitForFunction(() => document.querySelector('#draft-status').textContent === 'Draft saved on this device', null, {timeout: 5000});
assert.deepEqual(await keys(), ['document', 'merge']);
await page.goto(noParams());
await waitStatus('2 files');
assert.equal(await text('#view-title'), 'Merge PDFs', 'opens the newer draft');
await page.locator('.toast', {hasText: 'Your saved draft has been restored.'}).waitFor();
await previewIsReport();

// Migration of the legacy single draft.
async function legacy(view) {
  await page.evaluate(async ({bytes, view}) => {
    const db = await new Promise(r => { const q = indexedDB.open('ifixpdf-workspace-draft', 1); q.onsuccess = () => r(q.result) });
    await new Promise(r => {
      const tx = db.transaction('draft', 'readwrite'), store = tx.objectStore('draft');
      store.delete('document'); store.delete('merge');
      store.put({files: [{id: 'legacy', name: 'Legacy.pdf', bytes: new Uint8Array(bytes), pages: 2}], pageOrder: [{fileId: 'legacy', local: 0, uid: 'u1'}, {fileId: 'legacy', local: 1, uid: 'u2'}], rotation: {}, page: 1, name: 'Legacy.pdf', rangeMode: 'all', customRange: '', view, selectedPages: [], selectionAnchor: null, savedAt: Date.now()}, 'workspace');
      tx.oncomplete = () => { db.close(); r() };
    });
  }, {bytes: [...await pdf(2)], view});
  await page.goto(noParams());
}
await legacy('combine');
await waitStatus('1 files · 2 pages');
assert.equal(await text('#view-title'), 'Merge PDFs');
assert.deepEqual(await keys(), ['merge'], 'legacy combine draft moved to merge');
await legacy('edit');
await waitStatus('1 files · 2 pages');
assert.equal(await text('#view-title'), 'Edit PDF');
assert.equal(await text('#view-subtitle'), 'Legacy.pdf');
assert.deepEqual(await keys(), ['document'], 'legacy edit draft moved to document');

// Thumbnail reuse: moving a page keeps its card node.
await view('combine');
await page.setInputFiles('#file-input', [a, b]);
await waitStatus('2 files · 3 pages');
await page.click('[data-tab=pages]');
await page.locator('.page-card').nth(2).waitFor();
await page.locator('.page-card').nth(1).evaluate(el => { el.__keep = 1 });
await page.locator('.page-card').nth(1).locator('.page-move-controls button').first().click();
await page.waitForFunction(() => document.querySelector('.page-card').__keep === 1, null, {timeout: 3000});

// Clear workspace removes both drafts.
await view('settings');
await page.click('[data-action=clear]');
await page.waitForFunction(() => new Promise(resolve => { const r = indexedDB.open('ifixpdf-workspace-draft', 1); r.onsuccess = () => { const g = r.result.transaction('draft').objectStore('draft').count(); g.onsuccess = () => { r.result.close(); resolve(g.result === 0) } } }), null, {timeout: 3000});
await page.goto(noParams());
await page.waitForFunction(() => document.querySelector('#view-title').textContent === 'Home', null, {timeout: 3000});
assert.match(await text('#status'), /Ready to add PDFs/, 'nothing restored after Clear');

assert.deepEqual(errors, []);
await context.close();
await app.close();
console.log('workspaces check passed');
