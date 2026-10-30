// Browser check: Settings → About (developer, privacy, licenses, GitHub link), updates inside it, and the sidebar Settings item.
// Run: PLAYWRIGHT=<path to playwright> CHROME=<chrome binary> pnpm check:about
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {start} from './harness.js';

const app = await start(4184);
const repo = 'https://github.com/ronmrcdo/ifixpdf';
const eula = fs.readFileSync('EULA.txt', 'utf8').replace(/\r\n/g, '\n');
const license = fs.readFileSync('LICENSE', 'utf8').replace(/\r\n/g, '\n');
const licenses = fs.readdirSync('licenses');
const norm = s => s.replace(/\s+/g, ' ').trim();
const open = async opts => {
  const r = await app.page(opts);
  await r.page.goto(app.url('view=home'));
  await r.page.click('[data-view=settings]');
  return r;
};

// Browser: content, licenses, link via window.open.
{
  const {context, page, errors} = await open();
  await page.evaluate(() => { window.__opened = []; window.open = (...a) => { window.__opened.push(a[0]) } });
  const about = page.locator('.about');
  await about.getByRole('heading', {name: 'About', exact: true}).waitFor();
  assert.ok(await about.locator('.brand-mark').count(), 'brand mark');
  await about.getByText('0.1.0').first().waitFor();
  await about.getByText('Ron Mercado').first().waitFor();
  assert.equal(norm(await about.locator('.about-privacy').innerText()), norm(eula.split('\n\n')[0]));
  assert.ok(await about.locator('#updates').count(), '#updates inside About');

  const mit = about.locator('details', {hasText: 'MIT License'}).first();
  await mit.locator('summary').click();
  assert.equal(norm(await mit.locator('pre').innerText()), norm(license));

  const third = about.locator('.about-licenses details');
  assert.equal(await third.count(), licenses.length);
  for (let i = 0; i < licenses.length; i++) {
    await third.nth(i).locator('summary').click();
    assert.ok((await third.nth(i).locator('pre').innerText()).trim().length > 20, `license ${i} has text`);
  }

  await about.locator('[data-external]').click();
  assert.deepEqual(await page.evaluate(() => window.__opened), [repo]);
  assert.deepEqual(errors, []);
  await context.close();
}

// Native: the link goes through the opener plugin and does not navigate.
{
  const {context, page, errors} = await open({tauri: true});
  await page.locator('.about [data-external]').click();
  await page.waitForFunction(() => window.__calls.some(c => c.cmd === 'plugin:opener|open_url'));
  assert.equal(await page.evaluate(() => window.__calls.find(c => c.cmd === 'plugin:opener|open_url').args.url), repo);
  assert.ok(page.url().includes('index.html'), 'no navigation');
  assert.deepEqual(errors, []);
  await context.close();
}

// Sidebar: Settings item matches Home at every breakpoint, including hover.
for (const width of [1440, 1100, 900, 500]) {
  const {context, page} = await open({viewport: {width, height: 900}});
  const probe = async view => {
    const b = page.locator(`[data-view=${view}]`);
    await b.hover();
    await page.waitForTimeout(300); // background transition
    const box = await b.boundingBox();
    const css = await b.evaluate(el => { const c = getComputedStyle(el); return [c.backgroundColor, c.borderRadius] });
    return {box, css};
  };
  await page.click('[data-view=preview]'); // neither probed item is active
  const home = await probe('home'), settings = await probe('settings');
  assert.ok(Math.abs(home.box.width - settings.box.width) <= 1, `width @${width}: ${home.box.width} vs ${settings.box.width}`);
  assert.ok(Math.abs(home.box.height - settings.box.height) <= 1, `height @${width}`);
  assert.deepEqual(settings.css, home.css, `hover @${width}`);
  await context.close();
}

await app.close();
console.log('about check passed');
