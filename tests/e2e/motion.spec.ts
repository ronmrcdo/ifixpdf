// Motion and polish: values from the plan, all off under prefers-reduced-motion, without changing layout.
import type {Page} from '@playwright/test';
import {test, expect, pdfFile} from './fixtures';

const durations = (page: Page, selector: string) =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const s = getComputedStyle(el);
      return {transition: s.transitionDuration, animation: s.animationDuration};
    });

/** Opens the recent menu, then the password dialog, and raises an error toast, so every moving part is on screen. */
async function showEverything(page: Page, app: Parameters<Parameters<typeof test>[2]>[0]['app']) {
  await app.goto('view=home');
  await app.seedRecent('Report.pdf', 2);
  await app.goto('view=home');
  await page.locator('.recent-file').first().click({button: 'right'});
  await expect(page.getByRole('menu')).toBeVisible();
}

test.describe('motion', () => {
  test('menu, dialog and toast use the planned values', async ({app, page}) => {
    await showEverything(page, app);
    expect((await durations(page, '.recent-context-menu')).transition).toContain('0.15s');
    await page.getByRole('menuitem', {name: 'Add password…'}).click();
    await expect(page.locator('dialog[open]')).toBeVisible();
    expect((await durations(page, '.document-dialog')).transition).toContain('0.15s');
    await page.keyboard.press('Escape');
    await expect(page.locator('dialog[open]')).toHaveCount(0);
    await app.addFiles({
      name: 'bad.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('not a pdf'),
    });
    await expect(app.toast()).toBeVisible();
    expect((await durations(page, '.toast')).animation).toBe('0.16s');
  });

  test('the menu fades out for 100ms without holding back focus, then its ghost is removed', async ({
    app,
    page,
  }) => {
    await showEverything(page, app);
    // The ghost lives 100ms, so record its facts the moment it is inserted rather than racing it.
    await page.evaluate(() => {
      new MutationObserver((records) => {
        for (const node of records.flatMap((r) => [...r.addedNodes])) {
          if (!(node instanceof HTMLElement) || !node.classList.contains('leaving')) continue;
          const s = getComputedStyle(node);
          window.__ghost = {
            animation: s.animationDuration,
            transition: s.transitionDuration,
            transform: s.transform,
            hidden: node.getAttribute('aria-hidden'),
            focusBack:
              document.activeElement !== document.body &&
              !document.activeElement?.closest('.recent-context-menu'),
          };
        }
      }).observe(document.body, {childList: true});
    });
    await page.keyboard.press('Escape');
    await expect
      .poll(() => page.evaluate(() => window.__ghost))
      .toEqual({
        animation: '0.1s',
        transition: '0s',
        transform: 'none',
        hidden: 'true',
        focusBack: true,
      });
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.locator('.recent-context-menu.leaving')).toHaveCount(0);
  });

  test('every control shows a 2px accent focus ring offset by 2px', async ({app, page}) => {
    await app.goto('view=home');
    await page.keyboard.press('Tab');
    const viaKeyboard = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement as Element);
      return {width: s.outlineWidth, offset: s.outlineOffset, color: s.outlineColor};
    });
    expect(viaKeyboard).toEqual({width: '2px', offset: '2px', color: 'rgb(52, 101, 167)'});
  });

  test('view changes cross-fade through startViewTransition', async ({app, page}) => {
    await page.addInitScript(() => {
      window.__vt = 0;
      document.startViewTransition = ((cb: () => void) => {
        window.__vt++;
        cb();
        return {ready: Promise.resolve(), finished: Promise.resolve()};
      }) as unknown as typeof document.startViewTransition;
    });
    await app.goto('view=home');
    await app.view('Merge PDFs');
    await expect(app.title).toHaveText('Merge PDFs');
    expect(await page.evaluate(() => window.__vt)).toBeGreaterThan(0);
  });

  test('a click right after a view change lands on the new view while it fades in', async ({
    app,
    page,
  }) => {
    await app.goto('view=home');
    await page
      .getByRole('navigation', {name: 'Main'})
      .getByRole('button', {name: 'Settings', exact: true})
      .click();
    await expect(app.title).toHaveText('Settings');
    const box = await page.getByLabel('Open after saving').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {x: r.x + r.width / 2, y: r.y + r.height / 2};
    });
    await page.mouse.click(box.x, box.y); // raw mouse: no actionability wait for the fade to end
    await expect(page.getByLabel('Open after saving')).not.toBeChecked();
  });

  test('a disabled button does not react to hover or press', async ({app, page}) => {
    await page.emulateMedia({reducedMotion: 'reduce'}); // so a style change shows at once, not after its transition
    await app.goto('view=preview');
    const edit = page.locator('[data-action=edit-current]');
    await expect(edit).toBeDisabled();
    const look = () =>
      edit.evaluate((el) => {
        const s = getComputedStyle(el);
        return [s.backgroundColor, s.transform];
      });
    const before = await look();
    const b = await edit.boundingBox();
    if (!b) throw new Error('not visible');
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    expect(await look()).toEqual(before);
    await page.mouse.down();
    expect(await look()).toEqual(before);
    await page.mouse.up();
  });

  const openPages = async (app: Parameters<Parameters<typeof test>[2]>[0]['app'], page: Page) => {
    await app.goto('view=home');
    await app.openPdf(await pdfFile('Report.pdf', 3));
    await app.view('Edit PDF');
    await app.tab('Pages').click();
    await expect(page.locator('.page-card')).toHaveCount(3);
    for (let i = 0; i < 3; i++)
      await expect(page.locator('.page-card').nth(i).locator('img')).toHaveAttribute('src', /.+/);
  };
  const reorderAnimations = (page: Page) =>
    page.evaluate(() =>
      [...document.querySelectorAll('.page-card')].map((c) =>
        c.getAnimations().map((a) => {
          const t = a.effect?.getComputedTiming();
          return {duration: t?.duration, easing: t?.easing};
        }),
      ),
    );

  test('cards that change slot glide there for 200ms, on the same nodes', async ({app, page}) => {
    await openPages(app, page);
    const nodes = await page.evaluate(() => {
      const cs = [...document.querySelectorAll('.page-card')];
      (window as Window).__cards = cs;
      return cs.length;
    });
    await page.getByRole('button', {name: 'Move page 1 later'}).click();
    const moved = await reorderAnimations(page);
    expect(moved[0]).toEqual([{duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)'}]);
    expect(moved[1]).toEqual([{duration: 200, easing: 'cubic-bezier(0.2, 0, 0, 1)'}]);
    expect(moved[2]).toEqual([]); // did not change slot
    expect(
      await page.evaluate(
        (n) =>
          [...document.querySelectorAll('.page-card')].every((c) =>
            (window as Window).__cards?.includes(c),
          ) && n === 3,
        nodes,
      ),
    ).toBe(true);
  });

  test.describe('prefers-reduced-motion: reduce', () => {
    test('cards jump to their new slot without animating', async ({app, page}) => {
      await openPages(app, page);
      await page.getByRole('button', {name: 'Move page 1 later'}).click();
      expect((await reorderAnimations(page)).flat()).toEqual([]);
    });

    test.beforeEach(async ({page}) => {
      await page.emulateMedia({reducedMotion: 'reduce'});
    });

    test('no element, pseudo-element or backdrop has a transition or animation duration', async ({
      app,
      page,
    }) => {
      await showEverything(page, app);
      await page.getByRole('menuitem', {name: 'Add password…'}).click();
      await expect(page.locator('dialog[open]')).toBeVisible();
      await page.keyboard.press('Escape');
      await app.addFiles({
        name: 'bad.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('not a pdf'),
      });
      await expect(app.toast()).toBeVisible();
      const moving = await page.evaluate(() => {
        const bad: string[] = [];
        for (const el of document.querySelectorAll('*')) {
          for (const pseudo of [null, '::before', '::after', '::backdrop']) {
            const s = getComputedStyle(el, pseudo);
            if (
              s.transitionDuration.split(',').some((d) => d.trim() !== '0s') ||
              s.animationDuration.split(',').some((d) => d.trim() !== '0s')
            )
              bad.push(`${el.tagName}.${el.className}${pseudo ?? ''}`);
          }
        }
        return bad;
      });
      expect(moving).toEqual([]);
    });

    test('view changes never start a view transition', async ({app, page}) => {
      await page.addInitScript(() => {
        window.__vt = 0;
        document.startViewTransition = ((cb: () => void) => {
          window.__vt++;
          cb();
          return {ready: Promise.resolve(), finished: Promise.resolve()};
        }) as unknown as typeof document.startViewTransition;
      });
      await app.goto('view=home');
      await app.view('Merge PDFs');
      await expect(app.title).toHaveText('Merge PDFs');
      expect(await page.evaluate(() => window.__vt)).toBe(0);
    });
  });
});
