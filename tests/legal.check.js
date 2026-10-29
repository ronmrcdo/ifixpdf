// Plain Node check: LICENSE, EULA, third-party notice and installer license wiring.
// Run: pnpm check:legal
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const PRIVACY = 'Your PDFs are opened, edited and saved only on this computer. iFixPDF has no account, no analytics and no tracking. iFixPDF only connects to the internet when you press Check for updates.';

const license = read('LICENSE');
assert.ok(license.startsWith('MIT License'));
assert.ok(license.includes('Copyright (c) 2026 Ron Mercado'));
assert.ok(license.includes('WITHOUT WARRANTY OF ANY KIND'));

const eula = read('EULA.txt');
assert.equal(eula.replace(/\r\n/g, '\n').split('\n\n')[0].trim(), PRIVACY);
assert.ok(eula.includes(license.trim()));
for (const w of ['WebView2', 'Microsoft', 'backup', 'no warranty']) assert.ok(eula.toLowerCase().includes(w.toLowerCase()), w);

const pkg = JSON.parse(read('package.json'));
assert.equal(pkg.license, 'MIT');
assert.deepEqual(['dialog', 'fs', 'opener'].map((n) => pkg.dependencies[`@tauri-apps/plugin-${n}`]), ['2.8.4', '2.7.1', '2.7.2']);
assert.match(read('src-tauri/Cargo.toml'), /^license = "MIT"$/m);
const bundle = JSON.parse(read('src-tauri/tauri.conf.json')).bundle;
assert.equal(bundle.licenseFile, '../EULA.txt');
assert.equal(JSON.stringify(bundle).includes('webviewInstallMode'), false);

const tauri = read('licenses/tauri-LICENSE.txt');
for (const n of ['tauri', '@tauri-apps/api', '@tauri-apps/plugin-updater', '@tauri-apps/plugin-dialog', '@tauri-apps/plugin-fs', '@tauri-apps/plugin-opener', 'MIT', 'Apache']) assert.ok(tauri.includes(n), n);
console.log('legal check passed');
