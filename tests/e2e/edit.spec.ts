// Preview and Edit views: empty states, the read-only grid, Preview -> Edit, and the Output panel on narrow windows.
import {test, expect, pdfFile, chooserFrom} from './fixtures';
import {PDFDict, PDFDocument, PDFName, PDFRawStream} from 'pdf-lib';

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

test.describe('native', () => {
  test.use({tauri: true});

  test('draw a signature, remember it, place it and Save as: the page gets an image', async ({
    app,
    page,
  }) => {
    test.setTimeout(60000);
    await page.addInitScript(() => {
      window.__tauri = {
        save_as: (bytes: Uint8Array) => {
          window.__written = {bytes: [...bytes], path: '/home/ron/Docs/out.pdf'};
          return '/home/ron/Docs/out.pdf';
        },
        'plugin:opener|open_path': () => null,
      };
    });
    await app.goto('view=home');
    await app.openPdf(await pdfFile('Report.pdf', 1));
    await app.view('Edit PDF');
    await app.tab('Document').click();
    const sign = page.getByRole('button', {name: 'Sign', exact: true});
    await sign.click();
    await page.getByRole('menuitem', {name: 'Add signature'}).click();
    const use = page.getByRole('button', {name: 'Use signature'});
    await expect(use).toBeDisabled();
    const pad = (await page.getByLabel('Draw your signature').boundingBox())!;
    await page.mouse.move(pad.x + 40, pad.y + 80);
    await page.mouse.down();
    await page.mouse.move(pad.x + 120, pad.y + 40, {steps: 5});
    await page.mouse.move(pad.x + 220, pad.y + 110, {steps: 5});
    await page.mouse.up();
    await expect(
      page.getByRole('checkbox', {name: 'Remember this signature on this device'}),
    ).toBeChecked();
    await use.click();
    await expect(sign).toHaveAttribute('aria-pressed', 'true');

    const layer = page.locator('.markup-layer');
    await layer.click({position: {x: 200, y: 200}});
    const placed = page.getByRole('button', {name: 'Signature', exact: true});
    await expect(placed).toBeVisible();
    await expect(page.getByRole('button', {name: 'Resize signature, bottom-right'})).toBeVisible();
    await expect(sign).toHaveAttribute('aria-pressed', 'false');
    // a cropped drawing: wider than tall, about 150 pt wide at the stage's scale
    const b = (await placed.boundingBox())!;
    expect(b.width).toBeGreaterThan(b.height);

    await app.title.click();
    await page.keyboard.press('Control+s');
    await expect.poll(() => page.evaluate(() => !!window.__written), {timeout: 30000}).toBe(true);
    const bytes = await page.evaluate(() => (window.__written as {bytes: number[]}).bytes);
    const doc = await PDFDocument.load(new Uint8Array(bytes));
    const xobjects = doc.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
    const subtypes = (xobjects?.values() ?? []).map((ref) => {
      const o = doc.context.lookup(ref);
      return o instanceof PDFRawStream ? o.dict.get(PDFName.of('Subtype')) : undefined;
    });
    expect(subtypes).toContain(PDFName.of('Image'));

    // Remembered: the Sign menu lists it.
    await sign.click();
    await expect(page.getByRole('menuitem', {name: 'Signature 1'})).toBeVisible();
    await expect(page.getByRole('menuitem', {name: 'Delete signature'})).toHaveCount(1);
  });
});
