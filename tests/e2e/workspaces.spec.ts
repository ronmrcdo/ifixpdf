// Preview/Edit (document) and Merge keep separate files and undo history; only the document draft survives a restart.
import {test, expect, pdfFile, type App} from './fixtures';

// Workflow step classes have no accessible equivalent in the old DOM.
const workflow = (app: App) => app.page.locator('.combine-workflow li');

async function openReport(app: App, page?: number) {
  await app.goto('view=home');
  await app.openPdf(await pdfFile('Report.pdf', 3));
  if (!page) return;
  const jump = app.page.getByRole('spinbutton', {name: 'Go to page'});
  await jump.fill(String(page));
  await jump.dispatchEvent('change');
}

async function addToMerge(app: App, names: string[], status: string) {
  await app.view('Merge PDFs');
  await app.addFiles(await Promise.all(names.map((n, i) => pdfFile(n, i === 1 ? 2 : 1))));
  await expect(app.status).toContainText(status);
}

async function previewIsReport(app: App, page?: number) {
  await app.view('Preview PDF');
  await expect(app.subtitle, 'Preview still shows the document').toHaveText('Report.pdf');
  if (page) await expect(app.page.getByRole('spinbutton', {name: 'Go to page'}), 'Preview keeps its page').toHaveValue(String(page));
}

async function mergeIsEmpty(app: App) {
  await expect(app.page.getByText('Choose PDFs to merge'), 'Merge starts empty').toBeVisible();
  await expect(workflow(app).first()).toHaveClass(/current/);
  await expect(workflow(app).and(app.page.locator('.complete')), 'no workflow step complete').toHaveCount(0);
}

test('Preview and Merge do not share files', async ({app}) => {
  await openReport(app, 2);
  await app.view('Merge PDFs');
  await mergeIsEmpty(app);
  await expect(app.page.getByRole('button', {name: 'Return to previous document'}), 'no Return to previous document').toHaveCount(0);
  await previewIsReport(app, 2);
});

test('Merge files are kept across views', async ({app}) => {
  await openReport(app, 2);
  await addToMerge(app, ['A.pdf', 'B.pdf'], '2 files · 3 pages');
  await app.view('Settings');
  await previewIsReport(app, 2);
  await app.view('Merge PDFs');
  await expect(app.status).toContainText('2 files · 3 pages');
});

test('files added from Settings go to Merge, not the document', async ({app}) => {
  await openReport(app, 2);
  await addToMerge(app, ['A.pdf', 'B.pdf'], '2 files · 3 pages');
  await app.view('Settings');
  await app.addFiles(await pdfFile('C.pdf', 1));
  await expect(app.status).toContainText('3 files');
  await expect(app.title).toHaveText('Merge PDFs');
  await previewIsReport(app, 2);
});

test('switching to Preview mid-import still lands every file in Merge', async ({app, page}) => {
  await openReport(app, 2);
  await addToMerge(app, ['A.pdf', 'B.pdf', 'C.pdf'], '3 files');
  await page.evaluate(() => {
    window.__realArrayBuffer = File.prototype.arrayBuffer;
    window.__gate = new Promise(r => { window.__release = r });
    let calls = 0;
    File.prototype.arrayBuffer = async function () { window.__reads = ++calls; if (calls === 2) await window.__gate; return window.__realArrayBuffer.call(this) };
  });
  await app.addFiles([await pdfFile('A.pdf', 1), await pdfFile('B.pdf', 2)]);
  await page.waitForFunction(() => window.__reads === 2);
  await app.view('Preview PDF');
  await page.evaluate(() => { window.__release(); File.prototype.arrayBuffer = window.__realArrayBuffer });
  await expect(app.status).toContainText('5 files');
  await expect(app.title, 'import finishes in Merge').toHaveText('Merge PDFs');
  await previewIsReport(app, 2);
});

test('Merge and Edit keep separate undo histories', async ({app, page}) => {
  await openReport(app);
  await addToMerge(app, ['A.pdf', 'B.pdf'], '2 files · 3 pages');
  const undo = page.getByRole('button', {name: 'Undo'});
  await page.getByRole('button', {name: 'Rotate current page clockwise'}).click();
  await expect(undo).toBeEnabled();
  await app.view('Edit PDF');
  await expect(undo, 'Edit has its own undo history').toBeDisabled();
  await app.view('Merge PDFs');
  await expect(undo, 'Merge undo kept').toBeEnabled();
});

test('New merge clears only Merge', async ({app, page}) => {
  await openReport(app, 2);
  await addToMerge(app, ['A.pdf', 'B.pdf'], '2 files · 3 pages');
  await page.getByRole('button', {name: 'New merge'}).click();
  await mergeIsEmpty(app);
  await previewIsReport(app, 2);
  await app.goto();
  await expect(app.title).toHaveText('Preview PDF');
  await expect(app.subtitle, 'document draft restored after New merge').toHaveText('Report.pdf');
  expect(await app.draftKeys(), 'New merge deleted only the merge draft').toEqual(['document']);
  await app.view('Merge PDFs');
  await mergeIsEmpty(app);
});

test('merging recents leaves the document alone', async ({app, page}) => {
  await openReport(app);
  await addToMerge(app, ['A.pdf', 'B.pdf'], '2 files · 3 pages');
  await app.view('Home');
  const recent = page.getByRole('checkbox', {name: /^Select /});
  await recent.nth(1).waitFor();
  await recent.nth(0).check();
  await recent.nth(1).check();
  await page.getByRole('button', {name: 'Merge selected'}).click();
  await expect(app.status).toContainText('2 files');
  await expect(app.title).toHaveText('Merge PDFs');
  await previewIsReport(app);
});

test('only the document draft survives a restart; Merge starts empty', async ({app, page}) => {
  await openReport(app);
  await addToMerge(app, ['A.pdf', 'B.pdf'], '2 files · 3 pages');
  await page.waitForTimeout(600);
  expect(await app.draftKeys(), 'Merge is never saved as a draft').toEqual(['document']);
  await app.goto();
  await expect(app.title).toHaveText('Preview PDF');
  await expect(app.toast('Your saved draft has been restored.')).toBeVisible();
  await previewIsReport(app);
  await app.view('Merge PDFs');
  await mergeIsEmpty(app);
});

test('moving a page keeps its card node', async ({app, page}) => {
  await app.goto('view=home');
  await addToMerge(app, ['A.pdf', 'B.pdf'], '2 files · 3 pages');
  await app.tab('Pages').click();
  const cards = page.locator('.page-card');
  await cards.nth(2).waitFor();
  await cards.nth(1).evaluate(el => { (el as HTMLElement & {__keep?: number}).__keep = 1 });
  await page.getByRole('button', {name: 'Move page 2 earlier'}).click();
  await expect.poll(() => cards.first().evaluate(el => (el as HTMLElement & {__keep?: number}).__keep), {timeout: 3000}).toBe(1);
});

test('Clear workspace removes the document draft', async ({app, page}) => {
  await openReport(app);
  await app.view('Settings');
  await page.getByRole('button', {name: 'Clear workspace'}).click();
  await expect.poll(() => app.draftKeys(), {timeout: 3000}).toEqual([]);
  await app.goto();
  await expect(app.title).toHaveText('Home');
  await expect(app.status, 'nothing restored after Clear').toContainText(/Ready to add PDFs/);
});
