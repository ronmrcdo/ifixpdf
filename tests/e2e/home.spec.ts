// Home: recents list, selection, merge from Home, the row menu and missing files.
import {test, expect, makePdf, pdfFile, chooserFrom} from './fixtures';

// Seeds two recents (different page counts, so different content hashes) and shows Home. Needs a prior goto for the origin.
async function seeded(app: Parameters<Parameters<typeof test>[2]>[0]['app']) {
  await app.goto('view=home');
  await app.seedRecent('Alpha.pdf', 1);
  await app.seedRecent('Beta.pdf', 2);
  await app.goto('view=home');
  await expect(app.page.getByRole('checkbox', {name: /^Select /})).toHaveCount(2);
}

test('lists recents newest first', async ({app, page}) => {
  await seeded(app);
  await expect(page.locator('.recent-name strong')).toHaveText(['Beta.pdf', 'Alpha.pdf']);
  await expect(page.getByText(/^2 pages · \d+ KB$/)).toBeVisible();
});

test('Merge selected counts the checked files and opens them in Merge', async ({app, page}) => {
  await seeded(app);
  const merge = page.getByRole('button', {name: /^Merge selected/});
  await expect(merge).toBeDisabled();
  await page.getByRole('checkbox', {name: 'Select Alpha.pdf'}).check();
  await page.getByRole('checkbox', {name: 'Select Beta.pdf'}).check();
  await expect(merge).toContainText('(2)');
  await merge.click();
  await expect(app.title).toHaveText('Merge PDFs');
  await expect(app.status).toContainText('2 files · 3 pages');
  await expect(app.toast('2 PDFs ready to merge.')).toBeVisible();
});

test('the row menu merges the clicked file alone with a hint', async ({app, page}) => {
  await seeded(app);
  await page.getByRole('button', {name: 'More actions for Alpha.pdf'}).click();
  await page.getByRole('menuitem', {name: 'Merge PDFs'}).click();
  await expect(app.title).toHaveText('Merge PDFs');
  await expect(app.toast('Add another PDF to merge with this document.')).toBeVisible();
});

test('merging from Home leaves the open document alone', async ({app, page}) => {
  await seeded(app);
  await page.getByRole('button', {name: /^Alpha\.pdf/}).click();
  await expect(app.subtitle).toHaveText('Alpha (edited).pdf');
  await app.view('Home');
  await page.getByRole('checkbox', {name: 'Select Beta.pdf'}).check();
  await page.getByRole('button', {name: /^Merge selected/}).click();
  await expect(app.status).toContainText('1 files · 2 pages');
  await app.view('Preview PDF');
  await expect(app.subtitle).toHaveText('Alpha (edited).pdf');
});

test('the name opens Preview', async ({app, page}) => {
  await seeded(app);
  await page.getByRole('button', {name: /^Alpha\.pdf/}).click();
  await expect(app.title).toHaveText('Preview PDF');
  await expect(app.subtitle).toHaveText('Alpha (edited).pdf');
});

test('opening an older recent moves it to the top of Home', async ({app, page}) => {
  await seeded(app);
  await page.getByRole('button', {name: /^Alpha\.pdf/}).click();
  await expect(app.subtitle).toHaveText('Alpha (edited).pdf');
  await app.view('Home');
  await expect(page.locator('.recent-name strong')).toHaveText(['Alpha.pdf', 'Beta.pdf']);
});

test('the context menu opens on right-click and takes arrow, Home, End and Escape', async ({
  app,
  page,
}) => {
  await seeded(app);
  await page.locator('.recent-file').first().click({button: 'right'});
  const items = page.getByRole('menuitem');
  await expect(page.getByRole('menu')).toBeVisible();
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Home');
  await expect(items.first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(items.last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.getByRole('button', {name: /^More actions for Beta/})).toBeFocused();
});

test('Tab closes the menu and returns focus to More', async ({app, page}) => {
  await seeded(app);
  const more = page.getByRole('button', {name: 'More actions for Alpha.pdf'});
  await more.click();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(more).toBeFocused();
});

test('Remove from recents deletes only the row', async ({app, page}) => {
  await seeded(app);
  await page.getByRole('button', {name: 'More actions for Alpha.pdf'}).click();
  await page.getByRole('menuitem', {name: 'Remove from recents'}).click();
  await expect(page.getByRole('checkbox', {name: /^Select /})).toHaveCount(1);
  expect(await app.recentCount()).toBe(1);
});

test('the first view saves a thumbnail for a row', async ({app, page}) => {
  await seeded(app);
  await expect(page.locator('.source-thumb img[src^="blob:"]')).toHaveCount(2);
  expect(await app.recentCount(), 'saving a thumbnail adds no row').toBe(2);
});

test('an empty Home offers Add PDFs', async ({app, page}) => {
  await app.goto('view=home');
  await expect(page.getByText('No recent PDFs yet')).toBeVisible();
  const chooser = await chooserFrom(page, () =>
    page.getByRole('button', {name: 'Add PDFs'}).click(),
  );
  await chooser.setFiles(await pdfFile('One.pdf', 1));
  await expect(app.title).toHaveText('Preview PDF');
});

test.describe('native missing file', () => {
  test.use({tauri: true});

  test('Locate picks a file through the dialog and the row stops showing File not found', async ({
    app,
    page,
  }) => {
    await page.addInitScript(
      (bytes) => {
        window.__gone = true;
        window.__tauri = {
          'plugin:fs|read_file': () => {
            if (window.__gone) throw 'No such file (os error 2)';
            return bytes;
          }, // plugin-fs rejects with a string
          'plugin:dialog|open': () => {
            window.__gone = false;
            return 'C:\\Docs\\Found.pdf';
          },
        };
      },
      [...(await makePdf(2))],
    );
    await app.goto('view=home');
    await page.evaluate(
      () =>
        new Promise<void>((done) => {
          const q = indexedDB.open('ifixpdf-local-documents', 2);
          q.onupgradeneeded = () => {
            q.result
              .createObjectStore('recent-meta', {keyPath: 'id'})
              .createIndex('key', 'key', {unique: true});
            q.result.createObjectStore('recent-bytes');
          };
          q.onsuccess = () => {
            const tx = q.result.transaction('recent-meta', 'readwrite');
            tx.objectStore('recent-meta').put({
              id: 'gone',
              key: 'c:\\docs\\gone.pdf',
              name: 'Gone.pdf',
              pages: 2,
              size: 900,
              modified: Date.now(),
              path: 'C:\\Docs\\Gone.pdf',
            });
            tx.oncomplete = () => {
              q.result.close();
              done();
            };
          };
        }),
    );
    await app.goto('view=home');
    await page.getByRole('button', {name: /^Gone\.pdf/}).click();
    await expect(page.getByText('File not found')).toBeVisible();
    await expect(app.toast('not found')).toBeVisible();
    await page.getByRole('button', {name: 'Locate…'}).click();
    expect((await app.calls('plugin:dialog|open')).length).toBe(1);
    await expect(page.getByText('File not found')).toHaveCount(0);
    await expect(page.locator('.recent-name strong')).toHaveText('Found.pdf');
    expect(await app.recentPaths()).toEqual(['C:\\Docs\\Found.pdf']);
  });
});
