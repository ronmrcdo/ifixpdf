// Merge: the workflow strip, the sources pane (reorder by pointer drag and buttons, select to jump) and Back to document.
import type {Locator, Page} from '@playwright/test';
import {test, expect, pdfFile, type App} from './fixtures';

const rows = (page: Page) => page.locator('.sources .file');
const names = (page: Page) => rows(page).locator('.filename').allTextContents();
const meta = (page: Page) => rows(page).locator('.filemeta').allTextContents();
const steps = (page: Page) => page.getByRole('navigation', {name: 'Merge PDF workflow'});

/** dnd-kit swallows clicks for 50 ms after a drop; waits until a click reaches the window again. */
const clicksReach = (page: Page) =>
  expect
    .poll(() =>
      page.evaluate(() => {
        let reached = false;
        const seen = () => {
          reached = true;
        };
        window.addEventListener('click', seen);
        document.body.click();
        window.removeEventListener('click', seen);
        return reached;
      }),
    )
    .toBe(true);

async function center(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error('not visible');
  return {x: b.x + b.width / 2, y: b.y + b.height / 2};
}

async function addThree(app: App) {
  await app.goto('combine=new');
  await expect(app.title).toHaveText('Merge PDFs');
  await app.addFiles([
    await pdfFile('A.pdf', 1),
    await pdfFile('B.pdf', 2),
    await pdfFile('C.pdf', 1),
  ]);
  await expect(app.status).toContainText('3 files · 4 pages');
  await expect(rows(app.page)).toHaveCount(3);
}

test('the Add stage: Arrange, Save and Done disabled until a PDF is added', async ({app, page}) => {
  await app.goto('combine=new');
  await expect(page.getByRole('heading', {name: 'Choose PDFs to merge'})).toBeVisible();
  await expect(steps(page).locator('[aria-current=step]')).toHaveText(/Add PDFs/);
  for (const name of ['Arrange & review', 'Save PDF', 'Done'])
    await expect(steps(page).getByRole('button', {name})).toBeDisabled();
  await app.addFiles(await pdfFile('A.pdf', 2));
  await expect(steps(page).locator('[aria-current=step]')).toHaveText(/Arrange & review/);
  await expect(page.getByText('1 files · 2 pages').first()).toBeVisible();
  await expect(steps(page).getByRole('button', {name: 'Done'})).toBeDisabled();
});

test('a pointer drag of a source row moves the file and its pages', async ({app, page}) => {
  await addThree(app);
  const from = await center(rows(page).nth(2).locator('.file-select'));
  const to = await center(rows(page).nth(0).locator('.file-select'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y - 10, {steps: 15});
  await page.mouse.up();
  await expect.poll(() => names(page)).toEqual(['C.pdf', 'A.pdf', 'B.pdf']);
  expect((await meta(page)).map((m) => m.split(' · ')[0])).toEqual([
    'Pages 1',
    'Pages 2',
    'Pages 3–4',
  ]);
  await clicksReach(page);
  await page.getByRole('button', {name: 'Undo'}).click();
  await expect.poll(() => names(page), 'one undo step').toEqual(['A.pdf', 'B.pdf', 'C.pdf']);
});

test('up/down buttons move a file group; selecting a source jumps to its first page', async ({
  app,
  page,
}) => {
  await addThree(app);
  await page.getByRole('button', {name: 'Move A.pdf down'}).click();
  await expect.poll(() => names(page)).toEqual(['B.pdf', 'A.pdf', 'C.pdf']);
  expect((await meta(page)).map((m) => m.split(' · ')[0])).toEqual([
    'Pages 1–2',
    'Pages 3',
    'Pages 4',
  ]);
  await page.getByRole('button', {name: 'Preview C.pdf'}).click();
  await expect(page.getByRole('spinbutton', {name: 'Go to page'})).toHaveValue('4');
  await expect(rows(page).nth(2)).toHaveClass(/selected/);
  await expect(page.locator('.current-source')).toContainText('C.pdf');
});

test('Back to document from Done returns to the editor', async ({app, page}) => {
  await page.addInitScript(() => {
    window.showSaveFilePicker = async (o: {suggestedName: string}) => ({
      name: o.suggestedName,
      createWritable: async () => ({write: async () => {}, close: async () => {}}),
    });
  });
  await addThree(app);
  await page.getByRole('checkbox', {name: 'Open PDF after saving'}).uncheck();
  await page.getByRole('button', {name: 'Continue to save'}).first().click();
  await expect(page.getByRole('textbox', {name: 'Output file name'})).toBeFocused();
  await page.getByRole('button', {name: 'Save PDF', exact: true}).click();
  await expect(page.locator('.combine-done')).toContainText('Saved as Merged document.pdf.');
  await expect(page.getByRole('button', {name: 'New merge'}), 'no New merge on Done').toBeHidden();
  await page.getByRole('button', {name: 'Back to document'}).click();
  await expect(steps(page).locator('[aria-current=step]')).toHaveText(/Arrange & review/);
  await expect(rows(page)).toHaveCount(3);
});
