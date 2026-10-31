// Mouse wheel flips pages in Preview/Edit, one page per gesture; Ctrl+wheel zooms.
import type {Page} from '@playwright/test';
import {PDFDocument} from 'pdf-lib';
import {test, expect, pdfFile} from './fixtures';

function preview(page: Page) {
  const stage = page.locator('#paper-stage');
  const jump = page.getByRole('spinbutton', {name: 'Go to page'});
  const over = async () => {
    const b = await stage.boundingBox();
    if (!b) throw new Error('page stage not visible');
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  };
  const gesture = async (deltaY: number, n = 1, gap = 0) => {
    await over();
    for (let i = 0; i < n; i++) {
      await page.mouse.wheel(0, deltaY);
      if (gap) await page.waitForTimeout(gap);
    }
    await page.waitForTimeout(400);
  };
  return {
    over,
    gesture,
    current: () => jump.inputValue(),
    goto: async (n: number) => {
      await jump.fill(String(n));
      await jump.dispatchEvent('change');
      await page.waitForTimeout(300);
    },
    stage: () =>
      stage.evaluate((s) => ({
        top: s.scrollTop,
        bottom: s.scrollTop + s.clientHeight >= s.scrollHeight - 2,
        tall: s.scrollHeight > s.clientHeight + 50,
      })),
    scrollToBottom: () =>
      stage.evaluate((s) => {
        s.scrollTop = s.scrollHeight;
      }),
    zoomValue: page.locator('.zoom-value'),
    thumbnails: page.locator('.read-page-thumbnail'),
    ctrl: async (deltaY: number, n = 1) => {
      await page.keyboard.down('Control');
      await gesture(deltaY, n, 15);
      await page.keyboard.up('Control');
    },
  };
}

test.beforeEach(async ({app, page}) => {
  await app.goto('view=home');
  await app.openPdf(await pdfFile('Report.pdf', 3));
  await page.waitForTimeout(500);
  // At Fit the page fits the stage once rendered; before that the wheel would scroll instead of flip.
  await expect.poll(async () => (await preview(page).stage()).bottom).toBe(true);
});

test('wheel flips one page per gesture at Fit', async ({page}) => {
  const p = preview(page);
  await p.gesture(100);
  expect(await p.current(), 'wheel down flips forward').toBe('2');
  await p.gesture(-100);
  expect(await p.current(), 'wheel up flips back').toBe('1');
});

test('a wheel burst flips exactly one page, even across the re-render', async ({page}) => {
  const p = preview(page);
  await p.gesture(40, 12, 15);
  expect(await p.current(), 'a burst flips exactly one page').toBe('2');
  await p.goto(1);
  await p.over();
  for (let i = 0; i < 20; i++) {
    await page.mouse.wheel(0, 30);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(400);
  expect(await p.current(), 'a long burst across the re-render adds no second flip').toBe('2');
});

test('wheel stays put at the ends of the document', async ({page}) => {
  const p = preview(page);
  await p.goto(3);
  await p.gesture(100);
  expect(await p.current(), 'last page stays').toBe('3');
  await p.goto(1);
  await p.gesture(-100);
  expect(await p.current(), 'first page stays').toBe('1');
});

test('Ctrl+wheel zooms one step per notch instead of flipping or zooming the window', async ({
  page,
}) => {
  const p = preview(page);
  const zoom = async () => Number((await p.zoomValue.textContent())?.replace('%', '')) || 0;
  await page.evaluate(() =>
    window.addEventListener('wheel', (e) => {
      window.__prevented = e.defaultPrevented;
    }),
  );
  await expect(p.zoomValue).toHaveText('Fit');
  await p.ctrl(-100);
  const zoomedIn = await zoom();
  expect(zoomedIn, 'ctrl+wheel up leaves Fit for a zoom level').toBeGreaterThan(0);
  expect(await page.evaluate(() => window.__prevented), 'browser zoom is suppressed').toBe(true);
  await p.ctrl(-100);
  expect(await zoom(), 'ctrl+wheel up zooms in one step').toBe(zoomedIn + 10);
  await p.ctrl(100);
  expect(await zoom(), 'ctrl+wheel down zooms out one step').toBe(zoomedIn);
  await p.ctrl(-10, 5);
  expect(await zoom(), 'pinch deltas add up to one step').toBe(zoomedIn + 10);
  for (let i = 0; i < 10; i++) await p.ctrl(100);
  expect(await zoom(), 'zoom out stops at 25%').toBe(25);
  expect(await p.current(), 'ctrl+wheel does not flip').toBe('1');
});

test('zoomed in, the wheel scrolls the page first, then flips to the matching edge', async ({
  page,
}) => {
  const p = preview(page);
  const zoomIn = page.getByRole('button', {name: 'Zoom in'});
  for (let i = 0; i < 12 && !(await p.stage()).tall; i++) {
    await zoomIn.click();
    await page.waitForTimeout(300);
  }
  expect((await p.stage()).tall, 'page taller than the stage').toBe(true);
  await p.gesture(100);
  expect(await p.current(), 'zoomed wheel scrolls the page first').toBe('1');
  expect((await p.stage()).top, 'stage scrolled').toBeGreaterThan(0);
  await p.scrollToBottom();
  await p.gesture(100);
  expect(await p.current(), 'next gesture at the bottom flips').toBe('2');
  expect((await p.stage()).top, 'forward flip lands at the top').toBe(0);
  await p.gesture(-100);
  expect(await p.current(), 'wheel up at the top flips back').toBe('1');
  expect((await p.stage()).bottom, 'backward flip lands at the bottom').toBe(true);
});

test('the Pages tab scrolls its thumbnails and the Document tab keeps its page', async ({
  app,
  page,
}) => {
  const p = preview(page);
  await p.goto(2);
  await app.tab('Pages').click();
  await page.waitForTimeout(300);
  await p.gesture(100);
  await expect(p.thumbnails, 'thumbnails still shown').toHaveCount(3);
  await app.tab('Document').click();
  await page.waitForTimeout(300);
  expect(await p.current(), 'Document tab keeps its page').toBe('2');
});

test('Edit flips one page per wheel gesture', async ({app, page}) => {
  const p = preview(page);
  await app.view('Edit PDF');
  await expect(app.title).toHaveText('Edit PDF');
  await app.tab('Document').click();
  await page.waitForTimeout(500);
  const fit = page.getByRole('button', {name: 'Fit page'});
  await fit.click();
  await expect(fit, 'Fit applied').toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(300);
  const before = Number(await p.current());
  await p.gesture(100);
  expect(Number(await p.current()), 'Edit flips one page').toBe(Math.min(before + 1, 3));
});

test('Next page and Zoom in keep focus across re-renders', async ({app, page}) => {
  await app.openPdf(await pdfFile('Long.pdf', 5));
  const next = page.getByRole('button', {name: 'Next page'});
  await next.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Enter');
  await expect(page.getByRole('spinbutton', {name: 'Go to page'})).toHaveValue('4');
  await expect(next).toBeFocused();
  const zoomIn = page.getByRole('button', {name: 'Zoom in'});
  await zoomIn.focus();
  for (let i = 0; i < 3; i++) await page.keyboard.press('Enter');
  await expect(zoomIn).toBeFocused();
  await expect(page.getByRole('img', {name: 'Page 4 of 5, Long.pdf'})).toBeVisible();
});

test('the page jump rejects a page outside the document', async ({app, page}) => {
  const jump = page.getByRole('spinbutton', {name: 'Go to page'});
  await jump.fill('9');
  await jump.press('Enter');
  await expect(app.toast('Choose a page from 1 to 3.')).toBeVisible();
  await expect(jump).toHaveValue('1');
  await expect(page.getByRole('button', {name: 'Previous page'})).toBeDisabled();
});

test('a wheel-up at the first page does not make the next page land at its bottom', async ({
  page,
}) => {
  const p = preview(page);
  const zoomIn = page.getByRole('button', {name: 'Zoom in'});
  for (let i = 0; i < 12 && !(await p.stage()).tall; i++) {
    await zoomIn.click();
    await page.waitForTimeout(300);
  }
  expect((await p.stage()).top, 'page 1 at its top').toBe(0);
  await p.gesture(-100);
  expect(await p.current(), 'first page stays').toBe('1');
  await page.getByRole('button', {name: 'Next page'}).click();
  await expect.poll(() => p.current()).toBe('2');
  await page.waitForTimeout(300);
  expect((await p.stage()).top, 'Next lands at the top').toBe(0);
});

test('a backward flip onto a taller page lands at its bottom', async ({app, page}) => {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  doc.addPage([792, 612]);
  await app.openPdf({
    name: 'Mixed.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from(await doc.save()),
  });
  const p = preview(page);
  await expect(page.locator('.page-jump > span')).toHaveText('of 2');
  await expect.poll(async () => (await p.stage()).bottom).toBe(true);
  const zoomIn = page.getByRole('button', {name: 'Zoom in'});
  for (let i = 0; i < 12 && !(await p.stage()).tall; i++) {
    await zoomIn.click();
    await page.waitForTimeout(300);
  }
  await p.goto(2);
  expect(await p.current()).toBe('2');
  expect((await p.stage()).top, 'page 2 at its top').toBe(0);
  await p.gesture(-100);
  expect(await p.current(), 'flipped back').toBe('1');
  expect((await p.stage()).tall, 'portrait page 1 is taller than the stage').toBe(true);
  expect((await p.stage()).bottom, 'lands at the bottom of the taller page').toBe(true);
});
