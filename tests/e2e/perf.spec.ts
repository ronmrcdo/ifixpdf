// Performance gate: a 300-page PDF in Edit → Pages renders lazily, never blocks the main thread for 200 ms, and frees its document on close.
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
