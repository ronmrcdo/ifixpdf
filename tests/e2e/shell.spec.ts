// The app shell: routing and startup.
import {test, expect} from './fixtures';

test.describe('routing', () => {
  for (const [query, title] of [['view=home', 'Home'], ['view=preview', 'Preview PDF'], ['view=edit', 'Edit PDF'], ['combine=new', 'Merge PDFs']] as const) {
    test(`?${query} opens ${title}`, async ({app}) => {
      await app.goto(query);
      await expect(app.title).toHaveText(title);
    });
  }

  test('with nothing saved, startup goes Home and writes ?view=home', async ({app, page}) => {
    await app.goto();
    await expect(app.title).toHaveText('Home');
    await expect(app.status).toContainText('Ready to add PDFs');
    expect(page.url()).toMatch(/index\.html\?view=home$/);
  });

  test('sidebar navigation switches views without reloading; Settings keeps the URL', async ({app, page}) => {
    await app.goto('view=home');
    await page.evaluate(() => { window.__marker = 1 });
    await app.view('Settings');
    await expect(app.title).toHaveText('Settings');
    await app.view('Merge PDFs');
    await expect(app.title).toHaveText('Merge PDFs');
    expect(page.url()).toMatch(/\?view=home$/);
    expect(await page.evaluate(() => window.__marker), 'no reload').toBe(1);
  });

  test('a saved draft reopens in its view with the restored toast', async ({app}) => {
    await app.goto('view=home');
    await app.seedDraft('edit', 'Report.pdf', 3);
    await app.goto();
    await expect(app.title).toHaveText('Edit PDF');
    await expect(app.subtitle).toHaveText('Report.pdf');
    await expect(app.toast('Your saved draft has been restored.')).toBeVisible();
    await expect(app.status).toContainText('1 files · 3 pages · Ready');
  });

  test('?view= wins over a saved draft and shows no toast', async ({app, page}) => {
    await app.goto('view=home');
    await app.seedDraft('edit', 'Report.pdf', 3);
    await app.goto('view=home');
    await expect(app.title).toHaveText('Home');
    await page.waitForTimeout(300);
    await expect(app.toast()).toHaveCount(0);
  });

  test('?recent=<id>&view=edit opens that recent in Edit', async ({app}) => {
    await app.goto('view=home');
    const id = await app.seedRecent('Recent.pdf', 2);
    await app.goto(`recent=${id}&view=edit`);
    await expect(app.title).toHaveText('Edit PDF');
    await expect(app.subtitle).toHaveText('Recent.pdf');
    await expect(app.status).toContainText('1 files · 2 pages · Ready');
  });

  test('an unknown ?recent= shows an error toast, not an unhandled rejection', async ({app, page}) => {
    await app.goto('recent=missing');
    await expect(page.getByRole('alert')).toHaveText('Could not open that PDF. Choose a valid, unlocked PDF.');
    await expect(app.title).toHaveText('Home');
  });
});
