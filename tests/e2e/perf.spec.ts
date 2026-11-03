// Performance gates: lazy thumbnails on a 300-page PDF, the startup JS budget, and long tasks while saving redactions.
import {existsSync, readFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import type {Page} from '@playwright/test';
import {test, expect, pdfFile} from './fixtures';

// A string, so tsc does not resolve the dev server's module path; Vite serves the app's own registry instance.
const liveDocuments = (page: Page): Promise<number> =>
  page.evaluate("import('/src/pdf/registry.ts').then(m => m.liveDocuments())");

test('300 pages: at most 40 thumbnail renders before scrolling, no long task over 200 ms, 0 live documents after close', async ({
  app,
  page,
}) => {
  test.setTimeout(60000);
  await page.addInitScript(() => {
    window.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__longTasks.push(e.duration);
    }).observe({type: 'longtask'});
  });
  await app.goto('view=home');
  const file = await pdfFile('Big.pdf', 300);
  await page.evaluate(() => {
    window.__longTasks = [];
    window.__thumbRenders = 0;
  }); // measure the open only, not the dev-server boot
  await app.openPdf(file);
  await app.view('Edit PDF');
  await app.tab('Pages').click();
  await expect(page.locator('.page-card')).toHaveCount(300);
  await expect(page.locator('.page-card img').first()).toHaveAttribute('src', /.+/);
  // Settle: the count stops moving once every near-view card has rendered.
  let last = -1;
  await expect
    .poll(
      async () => {
        const n: number = await page.evaluate(() => window.__thumbRenders);
        const done = n === last;
        last = n;
        return done;
      },
      {intervals: [500]},
    )
    .toBe(true);
  const renders: number = await page.evaluate(() => window.__thumbRenders);
  const long: number[] = await page.evaluate(() =>
    window.__longTasks.filter((d: number) => d > 200),
  );
  console.log(
    `thumbnail renders before scroll: ${renders}; long tasks: ${JSON.stringify(await page.evaluate(() => window.__longTasks.map(Math.round)))}`,
  );
  expect(renders).toBeGreaterThan(0);
  expect(renders).toBeLessThanOrEqual(40);
  expect(long).toEqual([]);

  expect(await liveDocuments(page)).toBe(1);
  await app.view('Settings');
  await page.getByRole('button', {name: 'Clear workspace'}).click();
  await expect(app.toast('Workspace cleared.')).toBeVisible();
  expect(await liveDocuments(page)).toBe(0);
});

// Gzipped entry + modulepreload JS of `pnpm build` on main at da60726, before the fill/sign/redact tools.
const STARTUP_BASELINE = 120511;

test('startup JS grows by at most 5 KB gzipped (needs a fresh pnpm build)', () => {
  expect(existsSync('dist/index.html'), 'run pnpm build first').toBe(true);
  const html = readFileSync('dist/index.html', 'utf8');
  const initial = [
    ...html.matchAll(
      /<(?:script type="module"[^>]*src|link rel="modulepreload"[^>]*href)="\/([^"]+)"/g,
    ),
  ].map((m) => m[1]!);
  const total = initial.reduce((n, f) => n + gzipSync(readFileSync(`dist/${f}`)).length, 0);
  console.log(
    `initial JS: ${initial.join(', ')} = ${total} B gzipped (baseline ${STARTUP_BASELINE})`,
  );
  expect(initial.length).toBeGreaterThan(0);
  expect(total).toBeLessThanOrEqual(STARTUP_BASELINE + 5 * 1024);
});

test('saving 20 pages with 5 redacted pages has no long task over 100 ms', async ({app, page}) => {
  test.setTimeout(90000);
  await page.addInitScript(() => {
    window.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__longTasks.push(e.duration);
    }).observe({type: 'longtask'});
    window.showSaveFilePicker = async (o: {suggestedName: string}) => ({
      name: o.suggestedName,
      createWritable: async () => ({write: async () => {}, close: async () => {}}),
    });
  });
  await app.goto('view=home');
  await app.openPdf(await pdfFile('Twenty.pdf', 20));
  await app.view('Edit PDF');
  await app.tab('Document').click();
  await page.getByRole('button', {name: 'Redact'}).click();
  const jump = page.getByRole('spinbutton', {name: 'Go to page'});
  for (let n = 1; n <= 5; n++) {
    await expect(jump).toHaveValue(String(n));
    const box = (await page.locator('.markup-layer').boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + 120, box.y + 80);
    await page.mouse.up();
    await expect(page.getByRole('button', {name: 'Redaction'})).toBeVisible();
    if (n < 5) await page.getByRole('button', {name: 'Next page'}).click();
  }
  await expect(page.locator('#markup-summary')).toHaveText(
    '5 redactions. Redacted pages are saved as images.',
  );
  await page.evaluate(() => {
    window.__longTasks = [];
  });
  await page.getByRole('button', {name: 'Save PDF', exact: true}).click();
  await expect(app.toast('Saved Twenty (edited).pdf.')).toBeVisible({timeout: 60000});
  const tasks: number[] = await page.evaluate(() => window.__longTasks.map(Math.round));
  console.log(`long tasks while saving: ${JSON.stringify(tasks)}`);
  expect(tasks.filter((d) => d > 100)).toEqual([]);
});
