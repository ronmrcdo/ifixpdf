// Opening files: native drag-drop and the picker, recorded in recents.
import {test, expect, makePdf, pdfFile, chooserFrom} from './fixtures';

test.describe('native drop', () => {
  test.use({tauri: true});

  test.beforeEach(async ({page, app}) => {
    // plugin-fs readFile() -> invoke('plugin:fs|read_file', {path, options}) resolving to the bytes.
    await page.addInitScript(
      (bytes) => {
        window.__tauri = {'plugin:fs|read_file': () => bytes};
      },
      [...(await makePdf(2))],
    );
    await app.goto('view=home');
    await expect(app.title).toHaveText('Home');
  });

  test('a drop opens the first PDF only and records a recent with its path', async ({app}) => {
    await expect
      .poll(() => app.calls('plugin:event|listen').then((c) => c.length))
      .toBeGreaterThan(0);
    await app.dropFiles(['C:\\a.pdf', 'C:\\b.txt']);
    await expect(app.title).toHaveText('Preview PDF');
    await expect(app.subtitle).toHaveText('a (edited).pdf');
    await expect(app.status).toContainText('1 files · 2 pages');
    await expect.poll(() => app.recentPaths()).toEqual(['C:\\a.pdf']);
    expect(
      (await app.calls('plugin:fs|read_file')).map((c) => (c.args as {path: string}).path),
      'the .txt is never read',
    ).toEqual(['C:\\a.pdf']);
  });

  test('opening the same path twice leaves one recent row', async ({app}) => {
    await expect
      .poll(() => app.calls('plugin:event|listen').then((c) => c.length))
      .toBeGreaterThan(0);
    await app.dropFiles(['C:\\a.pdf']);
    await expect(app.subtitle).toHaveText('a (edited).pdf');
    await app.dropFiles(['c:/A.pdf']);
    await expect.poll(() => app.calls('plugin:fs|read_file').then((c) => c.length)).toBe(2);
    await expect(app.status).toContainText('1 files · 2 pages');
    await expect.poll(() => app.recentCount()).toBe(1);
  });
});

test('Ctrl+O in Merge adds the picked files to Merge', async ({app}) => {
  await app.goto('combine=new');
  await expect(app.title).toHaveText('Merge PDFs');
  await app.addFiles([await pdfFile('A.pdf', 1), await pdfFile('B.pdf', 2)]);
  await expect(app.status).toContainText('2 files · 3 pages');
  await expect(app.toast('2 PDFs added')).toBeVisible();
});

test('Ctrl+O on Home opens one PDF in Preview and writes ?recent=', async ({app, page}) => {
  await app.goto('view=home');
  await expect(app.title).toHaveText('Home');
  await app.addFiles(await pdfFile('Report.pdf', 3));
  await expect(app.title).toHaveText('Preview PDF');
  await expect(app.status).toContainText('1 files · 3 pages');
  await expect(page).toHaveURL(/\?recent=[^&]+$/);
});

test('the header Open PDF button opens the picker', async ({app, page}) => {
  await app.goto('view=home');
  const chooser = await chooserFrom(page, () =>
    page.getByRole('button', {name: 'Open PDF'}).click(),
  );
  await chooser.setFiles(await pdfFile('Report.pdf', 1));
  await expect(app.title).toHaveText('Preview PDF');
});
