// Settings → About (developer, privacy, licenses, GitHub link), updates inside it, and the sidebar Settings item.
import fs from 'node:fs';
import type {Page} from '@playwright/test';
import {test, expect, type App} from './fixtures';

const repo = 'https://github.com/ronmrcdo/ifixpdf';
const eula = fs.readFileSync('EULA.txt', 'utf8').replace(/\r\n/g, '\n');
const license = fs.readFileSync('LICENSE', 'utf8').replace(/\r\n/g, '\n');
const licenses = fs
  .readdirSync('licenses', {recursive: true, withFileTypes: true})
  .filter((e) => e.isFile());
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();

// The About block, privacy text, brand mark and third-party list have no accessible handle in the old DOM.
function about(page: Page) {
  const root = page.locator('.about');
  return {
    root,
    brandMark: root.locator('.brand-mark'),
    privacy: root.locator('.about-privacy'),
    updates: root.locator('#updates'),
    thirdParty: root.locator('.about-licenses details'),
    github: root.getByRole('button', {name: 'GitHub'}),
  };
}

async function openSettings(app: App) {
  await app.goto('view=home');
  await app.view('Settings');
}

test('About shows version, developer, privacy and licenses; GitHub opens in the browser', async ({
  app,
  page,
}) => {
  await openSettings(app);
  await page.evaluate(() => {
    window.__opened = [];
    window.open = (...a: unknown[]) => {
      window.__opened.push(a[0]);
      return null;
    };
  });
  const a = about(page);
  await expect(a.root.getByRole('heading', {name: 'About', exact: true})).toBeVisible();
  await expect(a.brandMark, 'brand mark').not.toHaveCount(0);
  await expect(a.root.getByText('0.1.0').first()).toBeVisible();
  await expect(a.root.getByText('Ron Mercado').first()).toBeVisible();
  expect(norm(await a.privacy.innerText())).toBe(norm(eula.split('\n\n')[0] ?? ''));
  await expect(a.updates, '#updates inside About').toHaveCount(1);

  const mit = a.root.getByRole('group').filter({hasText: 'MIT License'}).first();
  await mit.locator('summary').click();
  expect(norm(await mit.locator('pre').innerText())).toBe(norm(license));

  await expect(a.thirdParty).toHaveCount(licenses.length);
  for (let i = 0; i < licenses.length; i++) {
    await a.thirdParty.nth(i).locator('summary').click();
    expect(
      (await a.thirdParty.nth(i).locator('pre').innerText()).trim().length,
      `license ${i} has text`,
    ).toBeGreaterThan(20);
  }

  await a.github.click();
  expect(await page.evaluate(() => window.__opened)).toEqual([repo]);
});

test.describe('native', () => {
  test.use({tauri: true});

  test('the GitHub link goes through the opener plugin and does not navigate', async ({
    app,
    page,
  }) => {
    await openSettings(app);
    await about(page).github.click();
    await expect
      .poll(async () => (await app.calls('plugin:opener|open_url')).length)
      .toBeGreaterThan(0);
    expect(((await app.calls('plugin:opener|open_url'))[0]?.args as {url: string}).url).toBe(repo);
    expect(page.url(), 'no navigation').toContain('index.html');
  });
});

for (const width of [1440, 1100, 900, 500]) {
  test.describe(`sidebar at ${width}px`, () => {
    test.use({viewport: {width, height: 900}});

    test('the Settings item matches Home, including hover', async ({app, page}) => {
      await openSettings(app);
      const probe = async (name: string) => {
        const b = app.nav(name);
        await b.hover();
        await page.waitForTimeout(300); // background transition
        const box = await b.boundingBox();
        if (!box) throw new Error(`${name} not visible`);
        const css = await b.evaluate((el) => {
          const c = getComputedStyle(el);
          return [c.backgroundColor, c.borderRadius];
        });
        return {box, css};
      };
      await app.view('Preview PDF'); // neither probed item is active
      const home = await probe('Home'),
        settings = await probe('Settings');
      expect(
        Math.abs(home.box.width - settings.box.width),
        `width @${width}: ${home.box.width} vs ${settings.box.width}`,
      ).toBeLessThanOrEqual(1);
      expect(
        Math.abs(home.box.height - settings.box.height),
        `height @${width}`,
      ).toBeLessThanOrEqual(1);
      expect(settings.css, `hover @${width}`).toEqual(home.css);
    });
  });
}
