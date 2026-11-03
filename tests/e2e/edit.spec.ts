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

test('text, check and redaction: placed, rotated, duplicated, undone, restored, and read-only in Preview', async ({
  app,
  page,
}) => {
  await app.goto('view=home');
  await app.openPdf(await pdfFile('Report.pdf', 2));
  await app.view('Edit PDF');
  await app.tab('Document').click();
  const layer = page.locator('.markup-layer');
  await expect(layer).toBeVisible();
  const tool = (name: string) =>
    page.getByRole('toolbar', {name: 'Fill and sign tools'}).getByRole('button', {name});

  await tool('Add text').click();
  await layer.click({position: {x: 60, y: 60}});
  await page.getByRole('textbox', {name: 'Text'}).fill('Hello');
  await page.keyboard.press('Enter');
  await tool('Add check').click();
  await layer.click({position: {x: 200, y: 200}});
  await tool('Redact').click();
  const at = (await layer.boundingBox())!;
  await page.mouse.move(at.x + 60, at.y + 300);
  await page.mouse.down();
  await page.mouse.move(at.x + 160, at.y + 330);
  await page.mouse.move(at.x + 260, at.y + 350);
  await page.mouse.up();
  const items = ['Text: Hello', 'Check mark', 'Redaction'];
  for (const name of items) await expect(page.getByRole('button', {name})).toBeVisible();
  const redaction = page.getByRole('button', {name: 'Redaction'});
  const before = (await redaction.boundingBox())!;
  expect(before.width).toBeGreaterThan(before.height);

  // The items turn with the page.
  await page.getByRole('button', {name: 'Rotate current page clockwise'}).click();
  await expect
    .poll(async () => {
      const b = (await redaction.boundingBox())!;
      return b.height > b.width;
    })
    .toBe(true);

  // A duplicate carries the items.
  await app.tab('Pages').click();
  await page.getByRole('checkbox', {name: 'Select page 1'}).check();
  await page.getByRole('button', {name: 'Duplicate selected pages'}).click();
  await expect(page.locator('.page-card')).toHaveCount(3);
  await page.getByRole('button', {name: 'Preview page 2'}).dblclick();
  for (const name of items) await expect(page.getByRole('button', {name})).toBeVisible();

  // Undo and redo the duplicate; undo the rotation.
  await page.getByRole('button', {name: 'Undo'}).click();
  await expect(page.getByRole('spinbutton', {name: 'Go to page'})).toHaveValue('1');
  await page.getByRole('button', {name: 'Redo'}).click();
  await page.getByRole('button', {name: 'Undo'}).click();
  await page.getByRole('button', {name: 'Undo'}).click();
  await expect
    .poll(async () => {
      const b = (await redaction.boundingBox())!;
      return b.width > b.height;
    })
    .toBe(true);
  for (const name of items) await expect(page.getByRole('button', {name})).toBeVisible();

  // The draft keeps them across a restart.
  await expect
    .poll(async () => {
      const draft = (await app.readDraft()) as {pages?: {markup?: unknown[]}[]} | undefined;
      return draft?.pages?.[0]?.markup?.length;
    })
    .toBe(3);
  await app.goto();
  await expect(app.title).toHaveText('Edit PDF');
  await app.tab('Document').click();
  for (const name of items) await expect(page.getByRole('button', {name})).toBeVisible();

  // Preview draws them read-only, with no tool strip.
  await app.view('Preview PDF');
  for (const name of items) await expect(page.getByRole('img', {name})).toBeVisible();
  await expect(page.getByRole('toolbar', {name: 'Fill and sign tools'})).toHaveCount(0);
  await expect(page.getByRole('button', {name: 'Redaction'})).toHaveCount(0);
});

test('a PDF without form fields gets no field controls', async ({app, page}) => {
  await app.goto('view=home');
  await app.openPdf(await pdfFile('Report.pdf', 1));
  await app.view('Edit PDF');
  await app.tab('Document').click();
  await expect(page.locator('.markup-layer')).toBeVisible();
  await expect(page.locator('.field-layer')).toBeAttached();
  await expect(page.locator('.field-layer .field')).toHaveCount(0);
});
