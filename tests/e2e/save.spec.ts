// Every export goes through one "Save as" (native dialog + fs in Tauri, picker or download in the browser).
import type {Download, Page} from '@playwright/test';
import {PDFDocument} from 'pdf-lib';
import {test, expect, pdfFile, type App} from './fixtures';

type Written = {bytes: number[]; path: string};
type DialogOptions = {defaultPath: string; filters: {extensions: string[]}[]};

const pagesOf = async (w: Written) =>
  (await PDFDocument.load(new Uint8Array(w.bytes))).getPageCount();

// The header Save PDF button in Edit and on Merge's Save step.
const saveButton = (page: Page) => page.getByRole('button', {name: 'Save PDF', exact: true});

// Merge workflow handles; the step marker and Done panel have no accessible name in the old DOM.
function merge(page: Page) {
  return {
    currentStep: page
      .getByRole('navigation', {name: 'Merge PDF workflow'})
      .locator('[aria-current=step]'),
    done: page.locator('.combine-done'),
    continue: page.getByRole('button', {name: 'Continue to save'}).first(),
    save: saveButton(page),
  };
}

async function mergeToSave(app: App, files: Awaited<ReturnType<typeof pdfFile>>[], status: string) {
  const m = merge(app.page);
  await expect(app.title).toHaveText('Merge PDFs'); // the picker is single-file until the Merge view is active
  await app.addFiles(files);
  await expect(app.status).toContainText(status, {timeout: 10000});
  await m.continue.click();
  await expect(m.currentStep).toHaveText(/Save PDF/);
  return m;
}

test.describe('native', () => {
  test.use({tauri: true});

  // Shapes match @tauri-apps/plugin-dialog save() -> invoke('plugin:dialog|save', {options})
  // and @tauri-apps/plugin-fs writeFile() -> invoke('plugin:fs|write_file', bytes, {headers: {path: encodeURIComponent(path)}}).
  test.beforeEach(async ({page, app}) => {
    await page.addInitScript(() => {
      window.__tauri = {
        'plugin:dialog|save': ({options}: {options: {defaultPath: string}}) =>
          window.__savePath === undefined
            ? `/home/ron/Docs/${options.defaultPath}`
            : window.__savePath,
        'plugin:opener|open_path': () => null,
        'plugin:opener|reveal_item_in_dir': () => null,
        'plugin:fs|write_file': (bytes: Uint8Array, options: {headers: {path: string}}) => {
          if (window.__failWrite) throw Error('disk full');
          window.__written = {bytes: [...bytes], path: decodeURIComponent(options.headers.path)};
        },
      };
    });
    await app.goto('view=home');
  });

  const dialogs = async (app: App) =>
    (await app.calls('plugin:dialog|save')).map(
      (c) => (c.args as {options: DialogOptions}).options,
    );
  const lastDialog = async (app: App) => (await dialogs(app)).at(-1);
  const count = async (app: App, cmd: string) => (await app.calls(cmd)).length;
  const waitCalls = (app: App, cmd: string, n: number) =>
    expect.poll(() => count(app, cmd)).toBe(n);
  const written = (page: Page): Promise<Written> => page.evaluate(() => window.__written);
  const report = () => pdfFile('Report.pdf', 3);

  test('Ctrl+S in Preview suggests the document name with (edited)', async ({app, page}) => {
    await app.openPdf(await report());
    await app.title.click();
    await page.keyboard.press('Control+s');
    await expect.poll(() => count(app, 'plugin:fs|write_file'), {timeout: 15000}).toBe(1); // first run may wait for Vite to optimise the plugins
    expect((await lastDialog(app))?.defaultPath).toBe('Report (edited).pdf');
    expect(await pagesOf(await written(page))).toBe(3);
  });

  test('Extract saves the selected pages with an en-dash range name', async ({app, page}) => {
    await app.openPdf(await report());
    await app.view('Edit PDF');
    const check = (n: number) => page.getByRole('checkbox', {name: `Select page ${n}`});
    const extract = page.getByRole('button', {name: 'Extract selected pages'});
    await check(1).check();
    await check(3).check();
    await extract.click();
    await expect(app.toast('extracted')).toBeVisible();
    const dialog = await lastDialog(app),
      out = await written(page);
    expect(dialog?.defaultPath).toBe('Report – pages 1, 3.pdf');
    expect(dialog?.filters.map((f) => f.extensions)).toEqual([['pdf']]);
    expect(out.path).toBe('/home/ron/Docs/Report – pages 1, 3.pdf');
    expect(await pagesOf(out)).toBe(2);
    await check(3).uncheck();
    await check(2).check();
    await extract.click();
    await waitCalls(app, 'plugin:fs|write_file', 2);
    expect((await lastDialog(app))?.defaultPath).toBe('Report – pages 1–2.pdf');
  });

  test('Split: cancelling the save keeps the form open', async ({app, page}) => {
    await app.openPdf(await report());
    await app.view('Edit PDF');
    await page.getByRole('button', {name: 'Split PDF'}).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', {name: 'Split by'}).selectOption('every');
    await app.setGlobal('__savePath', null);
    const submit = dialog.getByRole('button', {name: 'Split & save ZIP'});
    await submit.click();
    await waitCalls(app, 'plugin:dialog|save', 1);
    const options = await lastDialog(app);
    expect(options?.defaultPath).toBe('Report — split.zip');
    expect(options?.filters.map((f) => f.extensions)).toEqual([['zip']]);
    await expect(submit).toBeEnabled();
    await expect(
      dialog.getByRole('heading', {name: /ready$/}),
      'cancelled split shows no success',
    ).toHaveCount(0);
    await dialog.getByRole('button', {name: 'Close'}).click();
  });

  test('Add password from a recent PDF saves a protected copy', async ({app, page}) => {
    await app.openPdf(await report());
    await app.view('Home');
    await page.getByRole('button', {name: 'More actions for Report.pdf'}).click();
    await page.getByRole('menuitem', {name: 'Add password…'}).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', {name: 'Password', exact: true}).fill('secret-pass');
    await dialog.getByRole('textbox', {name: 'Confirm password'}).fill('secret-pass');
    await dialog.getByRole('button', {name: 'Save protected copy'}).click();
    await expect(dialog.getByRole('heading', {name: 'Protected copy is ready'})).toBeVisible();
    expect((await lastDialog(app))?.defaultPath).toBe('Report — protected.pdf');
    await dialog.getByRole('button', {name: 'Done'}).click();
  });

  test('Add password leaves the password in no IndexedDB store', async ({app, page}) => {
    const password = 'Zq7-unique-pass';
    await app.openPdf(await report());
    await app.view('Edit PDF'); // a document draft and a recent row both exist now
    await app.view('Home');
    await page.getByRole('button', {name: 'More actions for Report.pdf'}).click();
    await page.getByRole('menuitem', {name: 'Add password…'}).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', {name: 'Password', exact: true}).fill(password);
    await dialog.getByRole('textbox', {name: 'Confirm password'}).fill(password);
    await dialog.getByRole('button', {name: 'Save protected copy'}).click();
    await expect(dialog.getByRole('heading', {name: 'Protected copy is ready'})).toBeVisible();
    await dialog.getByRole('button', {name: 'Done'}).click();
    // Every record of every store, with byte arrays and blobs read as text, so a stored password shows up wherever it is.
    const dump: string = await page.evaluate(async () => {
      const text = async (v: unknown): Promise<string> => {
        if (v instanceof Blob) return new TextDecoder('latin1').decode(await v.arrayBuffer());
        if (v instanceof ArrayBuffer || ArrayBuffer.isView(v))
          return new TextDecoder('latin1').decode(v as ArrayBuffer);
        if (v && typeof v === 'object')
          return (
            await Promise.all(Object.entries(v).map(async ([k, x]) => `${k}=${await text(x)}`))
          ).join(';');
        return String(v);
      };
      const out: string[] = [];
      for (const {name} of await indexedDB.databases()) {
        const db = await new Promise<IDBDatabase>((r) => {
          const q = indexedDB.open(name!);
          q.onsuccess = () => r(q.result);
        });
        for (const store of db.objectStoreNames) {
          const rows = await new Promise<unknown[]>((r) => {
            const g = db.transaction(store).objectStore(store).getAll();
            g.onsuccess = () => r(g.result);
          });
          out.push(`${name}/${store}: ${(await Promise.all(rows.map(text))).join('|')}`);
        }
        db.close();
      }
      return out.join('\n');
    });
    expect(dump).toContain('ifixpdf-local-documents/recent-meta: '); // the dump really read the stores
    expect(dump).toContain('Report.pdf');
    expect(dump).not.toContain(password);
  });

  test('Edit save uses the name the dialog returned', async ({app, page}) => {
    await app.openPdf(await report());
    await app.view('Edit PDF');
    const name = page.getByRole('textbox', {name: 'Output file name'});
    await name.fill('Final.pdf');
    await name.dispatchEvent('change');
    await app.dismissToast();
    await saveButton(page).click();
    await expect(app.toast('Saved Final.pdf.')).toBeVisible();
    expect((await lastDialog(app))?.defaultPath).toBe('Final.pdf');
    expect((await written(page)).path).toBe('/home/ron/Docs/Final.pdf');
  });

  test('Merge: cancel writes nothing, a failed write stays on Save, a save during a view switch lands in Merge', async ({
    app,
    page,
  }) => {
    await app.view('Merge PDFs');
    const m = await mergeToSave(
      app,
      [await pdfFile('A.pdf', 1), await pdfFile('B.pdf', 2)],
      '2 files',
    );
    const before = await app.recentCount(),
      writes = await count(app, 'plugin:fs|write_file');
    await app.dismissToast();
    await app.setGlobal('__savePath', null);
    const opened = (await dialogs(app)).length;
    await m.save.click();
    await waitCalls(app, 'plugin:dialog|save', opened + 1);
    await page.waitForTimeout(300);
    expect(await count(app, 'plugin:fs|write_file'), 'cancel writes nothing').toBe(writes);
    await expect(app.toast(), 'cancel shows no toast').toHaveCount(0);
    await expect(m.currentStep).toHaveText(/Save PDF/);
    expect(await app.recentCount()).toBe(before);

    await app.setGlobal('__savePath', undefined);
    await app.setGlobal('__failWrite', true);
    await m.save.click();
    await expect(app.toast('Could not save')).toBeVisible();
    await expect(m.currentStep).toHaveText(/Save PDF/);
    expect(await app.recentCount(), 'failed write adds no recent').toBe(before);
    await app.setGlobal('__failWrite', false);

    // Switch to Preview while the dialog is open: the result still lands in Merge.
    await page.evaluate(() => {
      const real = window.__tauri['plugin:dialog|save'];
      window.__tauri['plugin:dialog|save'] = async (args: unknown) => {
        window.__tauri['plugin:dialog|save'] = real;
        await new Promise((r) => {
          window.__release = r;
        });
        return real(args);
      };
    });
    await m.save.click();
    await page.waitForFunction(() => window.__release);
    await app.view('Preview PDF');
    await page.evaluate(() => window.__release());
    await waitCalls(app, 'plugin:fs|write_file', writes + 2);
    await page.waitForTimeout(300);
    await expect(app.title, 'save does not move the user').toHaveText('Preview PDF');
    await expect(app.toast('Saved'), 'no document save toast').toHaveCount(0);
    await app.view('Merge PDFs');
    await expect(m.currentStep).toHaveText(/Done/);
    expect(await app.recentCount()).toBe(before + 1);
    expect(await pagesOf(await written(page))).toBe(3);
  });

  test('switching to Preview while the merge is being built still writes the merge', async ({
    app,
    page,
  }) => {
    // The build runs in the export worker, so hold the message to the worker to pause it mid-build.
    await app.view('Merge PDFs');
    const m = await mergeToSave(
      app,
      [await pdfFile('Big.pdf', 150), await pdfFile('A.pdf', 1)],
      '2 files · 151 pages',
    );
    const built = await count(app, 'plugin:fs|write_file');
    await page.evaluate(() => {
      const real = window.setTimeout;
      window.__held = [];
      (window as {setTimeout: unknown}).setTimeout = (
        fn: (...a: unknown[]) => void,
        ms?: number,
        ...rest: unknown[]
      ) => {
        if (window.__hold && !ms) {
          window.__held.push(() => fn(...rest));
          return 0;
        }
        return real(fn, ms, ...rest);
      };
      const post = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function (
        this: Worker,
        ...args: Parameters<Worker['postMessage']>
      ) {
        if (window.__hold) {
          window.__held.push(() => post.apply(this, args));
          return;
        }
        post.apply(this, args);
      } as Worker['postMessage'];
      window.__hold = true;
    });
    await m.save.click();
    await page.waitForFunction(() => window.__held.length > 0);
    await app.view('Preview PDF');
    await page.evaluate(() => {
      window.__hold = false;
      window.__held.splice(0).forEach((f: () => void) => f());
    });
    await expect.poll(() => count(app, 'plugin:fs|write_file'), {timeout: 10000}).toBe(built + 1);
    expect(await pagesOf(await written(page)), 'merge pages written, not the document').toBe(151);
  });

  test('splitPath splits Windows and POSIX roots', async ({app}) => {
    expect(await app.splitPath('C:\\x.pdf')).toEqual({name: 'x.pdf', folder: 'C:\\'});
    expect(await app.splitPath('/x.pdf')).toEqual({name: 'x.pdf', folder: '/'});
  });

  test('Done shows name and folder; Open PDF and Show in folder go through the opener', async ({
    app,
  }) => {
    const winPath = 'C:\\Users\\Ron\\Docs\\Merged.pdf';
    const opens = () => count(app, 'plugin:opener|open_path');
    await app.view('Merge PDFs');
    const m = await mergeToSave(
      app,
      [await pdfFile('A.pdf', 1), await pdfFile('B.pdf', 2)],
      '2 files',
    );
    await app.setGlobal('__savePath', null);
    const openBefore = await opens();
    const dialogsBefore = await count(app, 'plugin:dialog|save');
    await m.save.click();
    await waitCalls(app, 'plugin:dialog|save', dialogsBefore + 1); // the mock has read __savePath (null) once the dialog is called
    expect(await opens(), 'cancelled save opens nothing').toBe(openBefore);
    await app.setGlobal('__savePath', winPath);
    await m.save.click();
    await expect(m.done).toBeVisible();
    const done = (await m.done.textContent()) ?? '';
    expect(done).toMatch(/Merged\.pdf/);
    expect(done).toContain('C:\\Users\\Ron\\Docs');
    expect(done, 'folder, not the whole path').not.toContain('C:\\Users\\Ron\\Docs\\Merged.pdf');
    expect(done).toMatch(/saved/i);
    expect(done).not.toMatch(/download/i);
    await expect(m.done.getByRole('button', {name: /download/i})).toHaveCount(0);
    expect(await opens(), 'open after saving opens the saved file once').toBe(openBefore + 1);
    await m.done.getByRole('button', {name: 'Open PDF'}).click();
    await waitCalls(app, 'plugin:opener|open_path', openBefore + 2);
    expect(((await app.calls('plugin:opener|open_path')).at(-1)?.args as {path: string}).path).toBe(
      winPath,
    );
    await m.done.getByRole('button', {name: 'Show in folder'}).click();
    await waitCalls(app, 'plugin:opener|reveal_item_in_dir', 1);
    expect(
      ((await app.calls('plugin:opener|reveal_item_in_dir'))[0]?.args as {paths: string[]}).paths,
    ).toEqual([winPath]);
  });

  test('with Open after saving off, saving opens nothing', async ({app, page}) => {
    await app.view('Settings');
    await page.getByRole('checkbox', {name: 'Open after saving', exact: true}).uncheck();
    await app.view('Merge PDFs');
    const m = await mergeToSave(
      app,
      [await pdfFile('A.pdf', 1), await pdfFile('B.pdf', 2)],
      '2 files',
    );
    const openOff = await count(app, 'plugin:opener|open_path');
    await m.save.click();
    await expect(m.done).toBeVisible();
    expect(await count(app, 'plugin:opener|open_path'), 'preference off opens nothing').toBe(
      openOff,
    );
    await expect(m.done.getByRole('button', {name: 'Show in folder'})).toHaveCount(1);
  });

  test('Ctrl+S on Home with the document workspace active saves nothing', async ({app, page}) => {
    await app.openPdf(await report());
    await app.view('Home');
    const saves = await count(app, 'plugin:dialog|save');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(300);
    expect(await count(app, 'plugin:dialog|save'), 'Ctrl+S on Home opens no dialog').toBe(saves);
    await expect(app.title).toHaveText('Home');
  });

  test('Edit save runs in the export worker; Ctrl+S twice, Rotate and Delete during the save change nothing', async ({
    app,
    page,
  }) => {
    const doc = await PDFDocument.create();
    for (const w of [100, 200, 300]) doc.addPage([w, 100]);
    await app.openPdf({
      name: 'Sized.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(await doc.save()),
    });
    await app.view('Edit PDF');
    // Displayed order 3, 1, 2 with the (new) second page rotated.
    await page.getByRole('button', {name: 'Preview page 3'}).focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await page.keyboard.press('Alt+ArrowLeft');
    await page.getByRole('checkbox', {name: 'Select page 2'}).check();
    await page.getByRole('button', {name: 'Rotate selected pages'}).click();
    await page.getByRole('checkbox', {name: 'Select page 2'}).uncheck();
    await page.evaluate(() => {
      const Real = window.Worker;
      window.__workers = [];
      window.__posted = [];
      window.Worker = class extends Real {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          window.__workers.push(String(url));
        }
        postMessage(message: {op?: string}, transfer?: unknown) {
          window.__posted.push(message.op);
          super.postMessage(message, transfer as Transferable[]);
        }
      };
      const real = window.__tauri['plugin:dialog|save'];
      window.__tauri['plugin:dialog|save'] = async (args: unknown) => {
        await new Promise((r) => {
          window.__release = r;
        });
        return real(args);
      };
    });
    await app.title.click();
    await page.keyboard.press('Control+s');
    await page.waitForFunction(() => window.__release);
    await expect(app.status).toContainText('Processing PDF…');
    await page.keyboard.press('Control+s');
    await page.getByRole('checkbox', {name: 'Select page 1'}).check();
    await page.getByRole('button', {name: 'Rotate selected pages'}).click();
    await page.getByRole('button', {name: 'Delete selected pages'}).click();
    await page.getByRole('button', {name: 'Save PDF', exact: true}).click({force: true}); // disabled: must not start a second save
    await page.waitForTimeout(300);
    await expect(page.locator('.page-card')).toHaveCount(3);
    await page.evaluate(() => window.__release());
    await expect(app.toast('Saved Sized.pdf.')).toBeVisible();
    expect(await count(app, 'plugin:dialog|save'), 'one dialog').toBe(1);
    const out = await PDFDocument.load(new Uint8Array((await written(page)).bytes));
    expect(out.getPages().map((p) => [p.getWidth(), p.getRotation().angle])).toEqual([
      [300, 0],
      [100, 90],
      [200, 0],
    ]);
    expect(
      (await page.evaluate(() => window.__workers as string[])).filter((u) =>
        u.includes('export.worker'),
      ),
      'built in the export worker',
    ).toHaveLength(1);
    expect(
      await page.evaluate(() => window.__posted.filter(Boolean)),
      'the build was posted to the worker, not run in-thread',
    ).toEqual(['build']);
    await expect(app.status).toContainText('1 files · 3 pages · Ready');
  });
});

test.describe('browser', () => {
  test('Save uses the file picker, an abort is silent, and download is the fallback', async ({
    app,
    page,
  }) => {
    await page.addInitScript(() => {
      window.showSaveFilePicker = async (o: {suggestedName: string}) => {
        if (window.__abort) throw new DOMException('', 'AbortError');
        return {
          name: o.suggestedName,
          createWritable: async () => ({
            write: async (bytes: Uint8Array) => {
              window.__pickedBytes = bytes.length;
            },
            close: async () => {},
          }),
        };
      };
    });
    const downloads: Download[] = [];
    page.on('download', (d) => downloads.push(d));
    await app.goto('view=home');
    await app.openPdf(await pdfFile('Report.pdf', 3));
    await app.view('Edit PDF');
    const name = page.getByRole('textbox', {name: 'Output file name'});
    await name.fill('Final.pdf');
    await name.dispatchEvent('change');
    const save = saveButton(page);
    await save.click();
    await expect(app.toast('Saved Final.pdf.')).toBeVisible();
    expect(
      await page.evaluate(() => window.__pickedBytes),
      'picker received the bytes',
    ).toBeGreaterThan(0);
    expect(downloads).toHaveLength(0);
    await app.setGlobal('__abort', true);
    await app.dismissToast();
    await save.click();
    await page.waitForTimeout(500);
    expect(downloads, 'abort downloads nothing').toHaveLength(0);
    await expect(app.toast(), 'abort shows no toast').toHaveCount(0);
    await page.evaluate(() => {
      delete window.showSaveFilePicker;
    });
    const [download] = await Promise.all([page.waitForEvent('download'), save.click()]);
    expect(download.suggestedFilename()).toBe('Final.pdf');
  });

  test('picker Done shows the name only, no Show in folder, and Open PDF opens a tab', async ({
    app,
    page,
    context,
  }) => {
    await page.addInitScript(() => {
      window.showSaveFilePicker = async (o: {suggestedName: string}) => ({
        name: o.suggestedName,
        createWritable: async () => ({write: async () => {}, close: async () => {}}),
      });
    });
    await app.goto('combine=new');
    const m = await mergeToSave(
      app,
      [await pdfFile('A.pdf', 1), await pdfFile('B.pdf', 2)],
      '2 files',
    );
    await m.save.click();
    await expect(m.done).toBeVisible();
    await expect(m.done).toContainText(/Merged document\.pdf/);
    await expect(m.done.getByRole('button', {name: 'Show in folder'})).toHaveCount(0);
    const [tab] = await Promise.all([
      context.waitForEvent('page'),
      m.done.getByRole('button', {name: 'Open PDF'}).click(),
    ]);
    expect(tab).toBeTruthy();
  });

  test('Print and Ctrl+P open the whole document as a blob PDF tab and explain how to print', async ({
    app,
    page,
  }) => {
    await app.goto('view=home');
    await app.openPdf(await pdfFile('Report.pdf', 3));
    await page.evaluate(() => {
      window.__opened = [];
      window.open = ((url: string) => {
        window.__opened.push(url);
        return null;
      }) as typeof window.open;
    });
    await page.getByRole('button', {name: 'Print PDF'}).click();
    await expect(app.toast('Use Print in the PDF viewer to choose your printer.')).toBeVisible();
    const [url] = await page.evaluate(() => window.__opened as string[]);
    expect(url).toMatch(/^blob:/);
    const bytes = await page.evaluate(
      async (u) => [...new Uint8Array(await (await fetch(u)).arrayBuffer())],
      url!,
    );
    expect((await PDFDocument.load(new Uint8Array(bytes))).getPageCount()).toBe(3);
    await app.title.click();
    await page.keyboard.press('Control+p');
    await expect.poll(() => page.evaluate(() => window.__opened.length)).toBe(2);
  });
});
