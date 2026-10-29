// Browser check: mouse wheel flips pages in Preview/Edit, one page per gesture.
// Run: PLAYWRIGHT=<path to playwright> CHROME=<chrome binary> pnpm check:preview
import assert from 'node:assert/strict';
import {start, pdf} from './harness.js';

const app = await start(4183);
const {context, page, errors} = await app.page();
await page.goto(app.url('view=home'));
await page.setInputFiles('#file-input', {name: 'Report.pdf', mimeType: 'application/pdf', buffer: await pdf(3)});
await page.waitForFunction(() => document.querySelector('#view-title').textContent === 'Preview PDF' && document.querySelector('#page-jump'));
await page.waitForTimeout(500);

const current = () => page.inputValue('#page-jump');
const stage = () => page.evaluate(() => { const s = document.querySelector('#paper-stage'); return {top: s.scrollTop, bottom: s.scrollTop + s.clientHeight >= s.scrollHeight - 2, tall: s.scrollHeight > s.clientHeight + 50} });
const over = async () => { const b = await page.locator('#paper-stage').boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2) };
const gesture = async (deltaY, n = 1, gap = 0) => { await over(); for (let i = 0; i < n; i++) { await page.mouse.wheel(0, deltaY); if (gap) await page.waitForTimeout(gap) } await page.waitForTimeout(400) };
const goto = async n => { await page.fill('#page-jump', String(n)); await page.dispatchEvent('#page-jump', 'change'); await page.waitForTimeout(300) };

// Fit: one gesture, one page.
await gesture(100);
assert.equal(await current(), '2', 'wheel down flips forward');
await gesture(-100);
assert.equal(await current(), '1', 'wheel up flips back');

// Burst (trackpad inertia): one flip, even when the burst spans the re-render.
await gesture(40, 12, 15);
assert.equal(await current(), '2', 'a burst flips exactly one page');
await goto(1);
await over();
for (let i = 0; i < 20; i++) { await page.mouse.wheel(0, 30); await page.waitForTimeout(40) }
await page.waitForTimeout(400);
assert.equal(await current(), '2', 'a long burst across the re-render adds no second flip');

// Ends of the document.
await goto(3);
await gesture(100);
assert.equal(await current(), '3', 'last page stays');
await goto(1);
await gesture(-100);
assert.equal(await current(), '1', 'first page stays');

// Ctrl+wheel is left alone.
await page.keyboard.down('Control');
await gesture(100);
await page.keyboard.up('Control');
assert.equal(await current(), '1', 'ctrl+wheel does not flip');

// Zoomed: scroll inside the page first, then flip, landing at the matching edge.
for (let i = 0; i < 12 && !(await stage()).tall; i++) { await page.click('[data-action=zoom-in]'); await page.waitForTimeout(300) }
assert.ok((await stage()).tall, 'page taller than the stage');
await gesture(100);
assert.equal(await current(), '1', 'zoomed wheel scrolls the page first');
assert.ok((await stage()).top > 0, 'stage scrolled');
await page.evaluate(() => { const s = document.querySelector('#paper-stage'); s.scrollTop = s.scrollHeight });
await gesture(100);
assert.equal(await current(), '2', 'next gesture at the bottom flips');
assert.equal((await stage()).top, 0, 'forward flip lands at the top');
await gesture(-100);
assert.equal(await current(), '1', 'wheel up at the top flips back');
assert.ok((await stage()).bottom, 'backward flip lands at the bottom');

// Pages tab scrolls its thumbnails and the page survives the round trip.
await goto(2);
await page.click('[data-tab=pages]');
await page.waitForTimeout(300);
await gesture(100);
assert.equal(await page.locator('.read-page-thumbnail').count(), 3, 'thumbnails still shown');
await page.click('[data-tab=document]');
await page.waitForTimeout(300);
assert.equal(await current(), '2', 'Document tab keeps its page');

// Edit: same gesture.
await page.click('.sidebar [data-view=edit]');
await page.waitForFunction(() => document.querySelector('#view-title').textContent === 'Edit PDF');
await page.click('[data-tab=document]');
await page.waitForTimeout(500);
await page.click('[data-action=fit][aria-pressed=false]').catch(() => {});
await page.waitForTimeout(300);
const before = Number(await current());
await gesture(100);
assert.equal(Number(await current()), before + 1 > 3 ? 3 : before + 1, 'Edit flips one page');

assert.deepEqual(errors, []);
await context.close();
await app.close();
console.log('preview check passed');
