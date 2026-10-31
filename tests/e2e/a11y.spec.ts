// WCAG 2.2 AA gate: axe on every view, stage and dialog, plus real-key dialog Esc and the toast live regions.
import AxeBuilder from '@axe-core/playwright';
import type {Page} from '@playwright/test';
import {test, expect, pdfFile, type App} from './fixtures';

/** Zero serious or critical axe violations; the message lists rule ids and targets. */
async function audit(page: Page, label: string) {
  await page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))),
  ); // mid-fade colours read as low contrast
  const {violations} = await new AxeBuilder({page})
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const bad = violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    bad.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    label,
  ).toEqual([]);
}

const openEdit = async (app: App) => {
  await app.goto('view=home');
  await app.openPdf(await pdfFile('Report.pdf', 3));
  await app.view('Edit PDF');
};

test.describe('accessibility', () => {
  test('Home empty and populated, Preview and Settings', async ({app, page}) => {
    await app.goto('view=home');
    await audit(page, 'Home empty');
    await app.openPdf(await pdfFile('Report.pdf', 3));
    await audit(page, 'Preview');
    await app.view('Home');
    await expect(page.locator('.recent-file')).toHaveCount(1);
    await audit(page, 'Home populated');
    await app.view('Settings');
    await audit(page, 'Settings');
  });

  test('Edit Document and Pages', async ({app, page}) => {
    await openEdit(app);
    await audit(page, 'Edit Document');
    await app.tab('Pages').click();
    await expect(page.locator('.page-card img').first()).toHaveAttribute('src', /.+/);
    await audit(page, 'Edit Pages');
  });

  test('the enlarged page checkbox keeps its clear hit border on hover, check and focus', async ({
    app,
    page,
  }) => {
    await openEdit(app);
    const box = page.getByRole('checkbox', {name: 'Select page 1'});
    const border = () => box.evaluate((el) => getComputedStyle(el).borderTopColor);
    await box.hover();
    await expect.poll(border, {message: 'hover'}).toBe('rgba(0, 0, 0, 0)');
    await box.check();
    await expect.poll(border, {message: 'checked + hover'}).toBe('rgba(0, 0, 0, 0)');
    await page.mouse.move(0, 0);
    await expect.poll(border, {message: 'checked'}).toBe('rgba(0, 0, 0, 0)');
  });

  test('every Merge stage', async ({app, page}) => {
    await page.addInitScript(() => {
      window.showSaveFilePicker = async (o: {suggestedName: string}) => ({
        name: o.suggestedName,
        createWritable: async () => ({write: async () => {}, close: async () => {}}),
      });
    });
    await app.goto('combine=new');
    await expect(app.title).toHaveText('Merge PDFs');
    await audit(page, 'Merge Add');
    await app.addFiles([await pdfFile('A.pdf', 1), await pdfFile('B.pdf', 2)]);
    await expect(app.status).toContainText('2 files · 3 pages');
    await audit(page, 'Merge Arrange & review');
    await page.getByRole('checkbox', {name: 'Open PDF after saving'}).uncheck();
    await page.getByRole('button', {name: 'Continue to save'}).first().click();
    await expect(page.getByRole('textbox', {name: 'Output file name'})).toBeFocused();
    await audit(page, 'Merge Save');
    await page.getByRole('button', {name: 'Save PDF', exact: true}).click();
    await expect(page.locator('.combine-done')).toContainText('Saved as');
    await audit(page, 'Merge Done');
  });

  test('Add password: axe while open, real Esc closes it and focus returns to the opener', async ({
    app,
    page,
  }) => {
    await app.goto('view=home');
    await app.seedRecent('Report.pdf', 2);
    await app.goto('view=home');
    const opener = page.getByRole('button', {name: 'More actions for Report.pdf'});
    await opener.click();
    await page.getByRole('menuitem', {name: 'Add password…'}).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await audit(page, 'Add password dialog');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('Split: axe while open, real Esc closes it and focus returns to the opener', async ({
    app,
    page,
  }) => {
    await openEdit(app);
    const opener = page.getByRole('button', {name: 'Split PDF'});
    await opener.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await audit(page, 'Split dialog');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
  });

  test('info toasts announce in role=status, errors in role=alert', async ({app, page}) => {
    await app.goto('view=home');
    await app.addFiles({
      name: 'bad.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('not a pdf'),
    });
    await expect(page.getByRole('alert').locator('.toast')).toContainText('Could not open bad.pdf');
    await expect(page.getByRole('status').locator('.toast')).toHaveCount(0);
    await app.dismissToast();
    await app.openPdf(await pdfFile('Report.pdf', 1));
    await app.view('Settings');
    await page.getByRole('button', {name: 'Clear workspace'}).click();
    await expect(page.getByRole('status').locator('.toast')).toHaveText('Workspace cleared.');
    await expect(page.getByRole('alert').locator('.toast')).toHaveCount(0);
  });
});
