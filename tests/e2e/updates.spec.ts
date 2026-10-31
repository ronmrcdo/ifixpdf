// Settings → Updates against a mocked Tauri bridge (updates are manual only).
// Proves the UI states and install safeguards only; it is not evidence of a real Windows upgrade.
import type {Page} from '@playwright/test';
import {test, expect, pdfFile, type App} from './fixtures';

// Installed after the bridge: answers the updater commands.
function mockUpdater() {
  window.__mock = {check: 'none', failDownloadOnce: false};
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const send = (channel: {id: number}, index: number, message: unknown) =>
    window.__callbacks.get(channel.id)?.({index, message});
  window.__tauri = {
    'plugin:updater|check'() {
      const m = window.__mock;
      if (m.check === 'unconfigured') throw 'Updater does not have any endpoints set.';
      if (m.check === 'error') throw 'Could not fetch a valid release JSON from the remote';
      if (m.check === 'none') return null;
      return {
        rid: 7,
        currentVersion: '0.1.0',
        version: '0.2.0',
        body: 'Faster merge.\n<img src=x onerror="window.__xss=1">',
        rawJson: {},
      };
    },
    async 'plugin:updater|download'(args: {onEvent: {id: number}}) {
      if (window.__mock.failDownloadOnce) {
        window.__mock.failDownloadOnce = false;
        throw 'error decoding response body';
      }
      send(args.onEvent, 0, {event: 'Started', data: {contentLength: 1000}});
      await wait(150);
      send(args.onEvent, 1, {event: 'Progress', data: {chunkLength: 400}});
      await wait(400);
      send(args.onEvent, 2, {event: 'Progress', data: {chunkLength: 600}});
      send(args.onEvent, 3, {event: 'Finished'});
      return 8;
    },
    // Reads the draft while install runs: proves it was saved before install, not after.
    async 'plugin:updater|install'() {
      window.__draftAtInstall = await window.__readDraft();
      return null;
    },
  };
}

// The Updates row has no accessible name in the old DOM.
const updates = (page: Page) => page.locator('#updates');
const setMock = (page: Page, value: object) =>
  page.evaluate((v) => Object.assign(window.__mock, v), value);
const called = async (app: App, cmd: string) => (await app.calls(cmd)).length > 0;
// Holds the export's Save as dialog open, so the export stays in flight until released.
const holdSaveDialog = (page: Page) =>
  page.evaluate(() => {
    window.__tauri.save_as = () =>
      new Promise((resolve) => {
        window.__releaseSave = () => resolve(null);
      });
  });

test('the browser build shows the version and no update controls', async ({app, page}) => {
  await app.goto('view=home');
  await app.view('Settings');
  await expect(updates(page).getByText('0.1.0')).toBeVisible();
  await expect(updates(page).getByText('installed desktop app')).toBeVisible();
  await expect(updates(page).getByRole('button')).toHaveCount(0);
});

test.describe('native', () => {
  test.use({tauri: true});
  test.beforeEach(async ({page}) => {
    await page.addInitScript(mockUpdater);
  });

  test('checks only on demand: unconfigured, up to date, offline, error and retry', async ({
    app,
    page,
    context,
  }) => {
    await app.goto('view=home');
    await app.view('Settings');
    await page.waitForTimeout(4000);
    expect(
      await called(app, 'plugin:updater|check'),
      'no update check until the user presses Check for updates',
    ).toBe(false);
    const check = updates(page).getByRole('button', {name: 'Check for updates'});
    const retry = updates(page).getByRole('button', {name: 'Retry'});

    await setMock(page, {check: 'unconfigured'});
    await check.click();
    await expect(updates(page).getByText('not configured')).toBeVisible();

    await setMock(page, {check: 'none'});
    await check.click();
    await expect(updates(page).getByText('up to date')).toBeVisible();

    await setMock(page, {check: 'error'});
    await context.setOffline(true);
    await check.click();
    await expect(updates(page).getByText('offline')).toBeVisible();
    await context.setOffline(false);
    await retry.click();
    await expect(updates(page).getByText("Couldn't check for updates")).toBeVisible();

    await setMock(page, {check: 'none'});
    await retry.click();
    await expect(updates(page).getByText('up to date')).toBeVisible();
  });

  test('available update: download fails and retries, install waits for export and a saved draft', async ({
    app,
    page,
  }) => {
    await page.addInitScript(() => {
      window.__mock.check = 'available';
    });
    await app.goto('view=home');
    await app.view('Settings');
    await updates(page).getByRole('button', {name: 'Check for updates'}).click();
    await expect(updates(page).getByText('0.2.0').first()).toBeVisible();
    await expect(updates(page).getByText('<img src=x', {exact: false})).toBeVisible();
    expect(await page.evaluate(() => window.__xss), 'release notes render as text').toBeUndefined();

    await setMock(page, {failDownloadOnce: true});
    await updates(page).getByRole('button', {name: 'Download update'}).click();
    await expect(updates(page).getByText('Download failed')).toBeVisible();
    await updates(page).getByRole('button', {name: 'Retry'}).click();
    await expect(updates(page).getByText('40%')).toBeVisible();
    const install = updates(page).getByRole('button', {name: 'Restart and install'});
    await expect(install).toBeVisible();

    // Put a document in the workspace and stay in Edit: Settings keeps the ready state.
    await app.view('Edit PDF');
    await app.addFiles(await pdfFile('Report.pdf', 1));
    await expect(app.subtitle).toHaveText('Report (edited).pdf');

    await holdSaveDialog(page);
    await page.locator('.header-actions [data-action=export]').click();
    await expect.poll(() => called(app, 'save_as')).toBe(true);
    await app.view('Settings');
    await install.click();
    await expect(app.toast('export finishes')).toBeVisible();
    expect(await called(app, 'plugin:updater|install'), 'install deferred while exporting').toBe(
      false,
    );
    await page.evaluate(() => window.__releaseSave()); // the export ends when its Save as dialog is cancelled

    await app.view('Settings');
    await page.evaluate(() => {
      window.__realOpen = indexedDB.open;
      indexedDB.open = () => {
        throw new Error('quota');
      };
    });
    await install.click();
    await expect(
      updates(page).getByText("couldn't save your Preview and Edit draft", {exact: false}),
    ).toBeVisible();
    expect(
      await called(app, 'plugin:updater|install'),
      'install blocked when draft save fails',
    ).toBe(false);

    await page.evaluate(() => {
      indexedDB.open = window.__realOpen;
      window.__draftAtInstall = undefined;
    });
    // Drop the autosaved draft so only the pre-install flush can put it back.
    await app.dropSavedDraft();
    await install.click();
    await expect.poll(() => called(app, 'plugin:updater|install')).toBe(true);
    // The mocked install reads the draft as it runs; poll because that read resolves after the call is logged.
    await expect
      .poll(
        () => page.evaluate(() => window.__draftAtInstall?.files?.length),
        'workspace draft saved before install',
      )
      .toBe(1);
  });
});
