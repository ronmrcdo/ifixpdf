// Preview and Edit views: empty states, the read-only grid, Preview -> Edit, and the Output panel on narrow windows.
import {test, expect, pdfFile, chooserFrom} from './fixtures';

test('Preview and Edit start empty with an Open PDF button that opens the picker', async ({
  app,
  page,
}) => {
  for (const [view, heading] of [
    ['Preview PDF', 'Open a PDF to preview'],
    ['Edit PDF', 'Open a PDF to edit'],
  ] as const) {
    await app.goto('view=home');
    await app.view(view);
    await expect(page.getByRole('heading', {name: heading})).toBeVisible();
  }
  const chooser = await chooserFrom(page, () =>
    page.locator('.preview-empty').getByRole('button', {name: 'Open PDF'}).click(),
  );
  await chooser.setFiles(await pdfFile('Report.pdf', 2));
  await expect(app.title).toHaveText('Edit PDF');
  await app.tab('Pages').click();
  await expect(page.locator('.page-card')).toHaveCount(2);
});

test('Preview shows the read-only footer; a thumbnail jumps to its page on the Document tab', async ({
  app,
  page,
}) => {
  await app.goto('view=home');
  await app.openPdf(await pdfFile('Report.pdf', 3));
  await expect(page.locator('.reader-note')).toHaveText('3 pages · Read-only');
  await expect(page.getByRole('button', {name: 'Undo'})).toHaveCount(0);
  await app.tab('Pages').click();
  await expect(page.locator('.read-page-thumbnail')).toHaveCount(3);
  await expect(page.locator('.page-check')).toHaveCount(0);
  await page.getByRole('button', {name: 'Preview page 2'}).click();
  await expect(page.locator('canvas.paper')).toBeVisible();
  await expect(page.locator('.read-page-thumbnail')).toHaveCount(0);
  await expect(page.getByRole('spinbutton', {name: 'Go to page'})).toHaveValue('2');
});

test('Edit PDF from Preview keeps the pages and history; Edit has no sources pane', async ({
  app,
  page,
}) => {
  await app.goto('view=home');
  await app.openPdf(await pdfFile('Report.pdf', 3));
  await page.locator('.header-actions').getByRole('button', {name: 'Edit PDF'}).click();
  await expect(app.title).toHaveText('Edit PDF');
  await app.tab('Pages').click();
  await expect(page.locator('.page-card')).toHaveCount(3);
  await expect(page.locator('.sources')).toBeHidden();
  await expect(page.getByRole('complementary', {name: 'Output settings'})).toBeVisible();
  await page.getByRole('button', {name: 'Preview page 1'}).click();
  await page.getByRole('button', {name: 'Delete'}).click();
  await expect(page.locator('.page-card')).toHaveCount(2);
  await app.view('Preview PDF');
  await page.locator('.header-actions').getByRole('button', {name: 'Edit PDF'}).click();
  await expect(page.getByRole('button', {name: 'Undo'})).toBeEnabled();
  await expect(page.locator('.page-card')).toHaveCount(2);
});

test('below 760px the Output panel is behind an Output button', async ({app, page}) => {
  await page.setViewportSize({width: 700, height: 900});
  await app.goto('view=home');
  await app.openPdf(await pdfFile('Report.pdf', 2));
  await page.locator('.header-actions').getByRole('button', {name: 'Edit PDF'}).click();
  const output = page.getByRole('complementary', {name: 'Output settings'});
  await expect(output).toBeHidden();
  await page.getByRole('button', {name: 'Output'}).click();
  await expect(output).toBeVisible();
  await page.getByRole('button', {name: 'Output'}).click();
  await expect(output).toBeHidden();
});
