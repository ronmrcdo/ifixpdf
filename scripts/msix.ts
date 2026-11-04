// Packages a built iFixPDF.exe as an MSIX for the Microsoft Store. Windows only (needs makeappx).
import {execFileSync} from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {appxManifest, msixFileName} from './msix-lib.ts';

const [exe, outDir] = process.argv.slice(2);
if (!exe || !outDir) {
  console.error('Usage: node scripts/msix.ts <path to iFixPDF.exe> <outDir>');
  process.exit(1);
}
if (!existsSync(exe)) {
  console.error(`Executable not found: ${exe}`);
  process.exit(1);
}

const kits = 'C:\\Program Files (x86)\\Windows Kits\\10\\bin';
const makeappx = existsSync(kits)
  ? readdirSync(kits)
      .filter((d) => /^\d+\.\d+\.\d+\.\d+$/.test(d))
      .sort((a, b) => a.localeCompare(b, undefined, {numeric: true}))
      .reverse()
      .map((d) => join(kits, d, 'x64', 'makeappx.exe'))
      .find(existsSync)
  : undefined;
if (!makeappx) {
  console.error(`makeappx.exe not found under ${kits}\\*\\x64 (install the Windows SDK)`);
  process.exit(1);
}

const version = (JSON.parse(readFileSync('package.json', 'utf8')) as {version: string}).version;
const stage = mkdtempSync(join(tmpdir(), 'ifixpdf-msix-'));
const icons = mkdtempSync(join(tmpdir(), 'ifixpdf-icons-')); // outside stage: makeappx packs all of stage
const assets = join(stage, 'Assets');
mkdirSync(assets);

// Deliberate rename: cargo builds `ifixpdf.exe`; the manifest's Executable is `iFixPDF.exe`.
cpSync(exe, join(stage, 'iFixPDF.exe'));
writeFileSync(join(stage, 'AppxManifest.xml'), appxManifest(version));
// `tauri icon` writes StoreLogo.png and Square<N>x<N>Logo.png flat into --output.
execFileSync('pnpm', ['tauri', 'icon', 'src-tauri/icons/icon.png', '--output', icons], {
  stdio: 'inherit',
  shell: true,
});
for (const f of ['StoreLogo.png', 'Square44x44Logo.png', 'Square150x150Logo.png']) {
  cpSync(join(icons, f), join(assets, f));
}

mkdirSync(outDir, {recursive: true});
const out = resolve(outDir, msixFileName(version));
execFileSync(makeappx, ['pack', '/d', stage, '/p', out, '/o'], {stdio: 'inherit'});
console.log(out);
