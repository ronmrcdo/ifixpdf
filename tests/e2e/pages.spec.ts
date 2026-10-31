// Edit's Pages tab: selection, page actions, and reorder by real pointer drags without remounting cards.
import type {Locator, Page} from '@playwright/test';
import {test, expect, pdfFile} from './fixtures';

const cards = (page: Page) => page.locator('.page-card');
const order = (page: Page) => cards(page).evaluateAll(cs => cs.map(c => (c as HTMLElement).dataset.uid));
const thumb = (card: Locator) => card.locator('.page-thumbnail');

async function center(l: Locator) {
  const b = await l.boundingBox();
  if (!b) throw new Error('not visible');
  return {x: b.x + b.width / 2, y: b.y + b.height / 2, b};
}

/** Presses on `from`'s thumbnail and moves in steps to the left or right quarter of `to`; returns before releasing. */
async function dragTo(page: Page, from: Locator, to: Locator, side: 'before' | 'after') {
  await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished))); // boxes are read mid-glide otherwise
  const a = await center(thumb(from));
  const {b} = await center(to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * (side === 'after' ? 0.75 : 0.25), b.y + b.height / 2, {steps: 15});
}

test.beforeEach(async ({app, page}) => {
  // Counts object URLs, so a drag that reloads a thumbnail shows up.
  await page.addInitScript(() => {
    const make = URL.createObjectURL.bind(URL);
    window.__objectUrls = 0;
    URL.createObjectURL = (b: Blob | MediaSource) => { window.__objectUrls++; return make(b) };
  });
  await app.goto('view=home');
  await app.openPdf(await pdfFile('Report.pdf', 3));
  await app.view('Edit PDF');
  await expect(app.title).toHaveText('Edit PDF');
  await app.tab('Pages').click();
  await expect(cards(page)).toHaveCount(3);
  for (let i = 0; i < 3; i++) await expect(cards(page).nth(i).locator('img')).toHaveAttribute('src', /.+/);
});

test('a pointer drag of page 1 after page 3 reorders without remounting cards or reloading thumbnails', async ({page}) => {
  const [u0, u1, u2] = await order(page);
  const first = await cards(page).nth(0).elementHandle();
  const firstImg = await cards(page).nth(0).locator('img').elementHandle();
  await cards(page).nth(0).evaluate(n => { (n as HTMLElement & {__keep?: number}).__keep = 1 });
  const src = await cards(page).nth(0).locator('img').getAttribute('src');
  const urls = await page.evaluate(() => window.__objectUrls);

  await dragTo(page, cards(page).nth(0), cards(page).nth(2), 'after');
  await expect(cards(page).nth(2), 'insertion mark after the target').toHaveClass(/drop-after/);
  await page.mouse.up();

  await expect.poll(() => order(page)).toEqual([u1, u2, u0]);
  expect(await first!.evaluate(n => (n as HTMLElement).dataset.uid), 'same element handle').toBe(u0);
  expect(await cards(page).nth(2).evaluate((n, h) => n === h, first), 'moved card is the same node').toBe(true);
  expect(await cards(page).nth(2).evaluate(n => (n as HTMLElement & {__keep?: number}).__keep), 'marker survives').toBe(1);
  expect(await cards(page).nth(2).locator('img').evaluate((n, h) => n === h, firstImg), 'same img node').toBe(true);
  expect(await cards(page).nth(2).locator('img').getAttribute('src'), 'thumbnail src unchanged').toBe(src);
  expect(await page.evaluate(() => window.__objectUrls), 'no new thumbnail rendered').toBe(urls);
  await expect(page.locator('.drop-before, .drop-after, .dragging'), 'marks cleared').toHaveCount(0);
});

test('dragging a selected page moves the selection; dragging an unselected one selects only it', async ({page}) => {
  const [u0, u1, u2] = await order(page);
  await thumb(cards(page).nth(0)).click();
  await thumb(cards(page).nth(1)).click({modifiers: ['Control']});
  await dragTo(page, cards(page).nth(1), cards(page).nth(2), 'after');
  await page.mouse.up();
  await expect.poll(() => order(page), 'the group moved').toEqual([u2, u0, u1]);

  await dragTo(page, cards(page).nth(0), cards(page).nth(2), 'after');
  await page.mouse.up();
  await expect.poll(() => order(page), 'only the unselected page moved').toEqual([u0, u1, u2]);
  await expect(page.locator('.page-card.is-selected')).toHaveCount(1);
  await expect(page.locator('.page-card.is-selected')).toHaveAttribute('data-uid', u2!);
});

test('a drag of under 4 px is a click', async ({page}) => {
  const before = await order(page);
  // A click on a selected page narrows the selection to it; a drag would keep the group.
  await thumb(cards(page).nth(0)).click();
  await thumb(cards(page).nth(1)).click({modifiers: ['Control']});
  const a = await center(thumb(cards(page).nth(1)));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 3, a.y, {steps: 3});
  await page.mouse.up();
  await expect(page.locator('.page-card.is-selected')).toHaveCount(1);
  await expect(cards(page).nth(1)).toHaveClass(/is-selected/);
  expect(await order(page)).toEqual(before);
});

test('Duplicate, Rotate and Delete act on the selection', async ({page}) => {
  await thumb(cards(page).nth(0)).click();
  await page.getByRole('button', {name: 'Duplicate selected pages'}).click();
  await expect(cards(page)).toHaveCount(4);
  const uids = await order(page);
  expect(new Set(uids).size, 'the copy has its own uid').toBe(4);

  await thumb(cards(page).nth(2)).click();
  await page.getByRole('button', {name: 'Rotate selected pages'}).click();
  const img = cards(page).nth(2).locator('img');
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.naturalWidth > i.naturalHeight), 'rotated thumbnail is landscape').toBe(true);
  expect(await cards(page).nth(1).locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth < i.naturalHeight), 'others stay portrait').toBe(true);

  await thumb(cards(page).nth(0)).click();
  await thumb(cards(page).nth(3)).click({modifiers: ['Control']});
  await page.getByRole('button', {name: 'Delete selected pages'}).click();
  await expect(cards(page)).toHaveCount(2);
  expect(await order(page)).toEqual([uids[1], uids[2]]);
});

test('Delete with nothing selected asks for a selection', async ({app, page}) => {
  await thumb(cards(page).nth(0)).focus();
  await page.keyboard.press('Delete');
  await expect(app.toast('Select one or more pages first.')).toBeVisible();
  await expect(cards(page)).toHaveCount(3);
});

test('Alt+Right moves the focused page and keeps focus on it', async ({page}) => {
  const [u0, u1, u2] = await order(page);
  await thumb(cards(page).nth(0)).focus();
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(() => order(page)).toEqual([u1, u0, u2]);
  expect(await page.evaluate(() => (document.activeElement?.closest('.page-card') as HTMLElement | null)?.dataset.uid)).toBe(u0);
  await page.keyboard.press('Alt+ArrowRight');
  await expect.poll(() => order(page)).toEqual([u1, u2, u0]);
  expect(await page.evaluate(() => (document.activeElement?.closest('.page-card') as HTMLElement | null)?.dataset.uid)).toBe(u0);
});

test('double-click opens the page on the Document tab', async ({page}) => {
  await thumb(cards(page).nth(2)).dblclick();
  await expect(page.getByRole('spinbutton', {name: 'Go to page'})).toHaveValue('3');
  await expect(cards(page)).toHaveCount(0);
});
