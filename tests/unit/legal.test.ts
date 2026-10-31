// LICENSE, EULA, third-party notice and installer license wiring.
import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8'); // vitest runs from the repo root
const PRIVACY =
  'Your PDFs are opened, edited and saved only on this computer. iFixPDF has no account, no analytics and no tracking. iFixPDF only connects to the internet when you press Check for updates.';

describe('legal files', () => {
  const license = read('LICENSE');

  test('LICENSE is MIT with the copyright line', () => {
    expect(license.startsWith('MIT License')).toBe(true);
    expect(license).toContain('Copyright (c) 2026 Ron Mercado');
    expect(license).toContain('WITHOUT WARRANTY OF ANY KIND');
  });

  test('EULA opens with the privacy text and carries the license and notices', () => {
    const eula = read('EULA.txt');
    expect(eula.replace(/\r\n/g, '\n').split('\n\n')[0]?.trim()).toBe(PRIVACY);
    expect(eula).toContain(license.trim());
    for (const w of ['WebView2', 'Microsoft', 'backup', 'no warranty'])
      expect(eula.toLowerCase(), w).toContain(w.toLowerCase());
  });

  test('package and crate are MIT; plugin versions are pinned', () => {
    const pkg = JSON.parse(read('package.json')) as {
      license: string;
      dependencies: Record<string, string>;
    };
    expect(pkg.license).toBe('MIT');
    expect(
      ['dialog', 'fs', 'opener'].map((n) => pkg.dependencies[`@tauri-apps/plugin-${n}`]),
    ).toEqual(['2.8.4', '2.7.1', '2.7.2']);
    expect(read('src-tauri/Cargo.toml')).toMatch(/^license = "MIT"$/m);
    expect(read('src-tauri/Cargo.toml')).toMatch(/^tauri-plugin-persisted-scope = "=2\.4\.2"$/m);
  });

  test('persisted scope is registered after fs, so it can restore the fs scope', () => {
    const main = read('src-tauri/src/main.rs');
    expect(main.indexOf('tauri_plugin_persisted_scope::init()')).toBeGreaterThan(
      main.indexOf('tauri_plugin_fs::init()'),
    );
    expect(main.indexOf('tauri_plugin_fs::init()')).toBeGreaterThan(-1);
  });

  test('capabilities grant only the permissions in use', () => {
    const cap = JSON.parse(read('src-tauri/capabilities/default.json')) as {
      permissions: (string | {identifier: string; allow: unknown})[];
    };
    const ids = cap.permissions.map((p) => (typeof p === 'string' ? p : p.identifier));
    expect(ids).toEqual([
      'core:window:allow-minimize',
      'core:window:allow-toggle-maximize',
      'core:window:allow-close',
      'core:window:allow-destroy',
      'core:window:allow-start-dragging',
      'core:window:allow-internal-toggle-maximize',
      'core:event:allow-listen',
      'core:event:allow-unlisten',
      'core:resources:allow-close',
      'updater:allow-check',
      'updater:allow-download',
      'updater:allow-install',
      'dialog:allow-open',
      'fs:allow-read-file',
      'allow-save-as',
      'opener:allow-reveal-item-in-dir',
      'opener:allow-open-path',
      'opener:allow-open-url',
    ]);
    expect(ids).not.toContain('core:default');
    expect(cap.permissions.filter((p) => typeof p !== 'string')).toEqual([
      {identifier: 'opener:allow-open-path', allow: [{path: '**/*.pdf'}]},
      {identifier: 'opener:allow-open-url', allow: [{url: 'https://github.com/ronmrcdo/ifixpdf'}]},
    ]);
  });

  test('the installer shows the EULA and does not change WebView2 install mode', () => {
    const bundle = (
      JSON.parse(read('src-tauri/tauri.conf.json')) as {bundle: {licenseFile: string}}
    ).bundle;
    expect(bundle.licenseFile).toBe('../EULA.txt');
    expect(JSON.stringify(bundle).includes('webviewInstallMode')).toBe(false);
  });

  test('the Tauri notice names every Tauri package and both licenses', () => {
    const tauri = read('licenses/tauri-LICENSE.txt');
    for (const n of [
      'tauri',
      '@tauri-apps/api',
      '@tauri-apps/plugin-updater',
      '@tauri-apps/plugin-dialog',
      '@tauri-apps/plugin-fs',
      '@tauri-apps/plugin-opener',
      'MIT',
      'Apache',
    ])
      expect(tauri, n).toContain(n);
  });
});
