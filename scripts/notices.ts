import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {acceptedLicenses, licenseAllowed, npmPackages} from './licenses-lib.ts';

const OUT = 'licenses/generated/npm-THIRD-PARTY.txt';

function run(): void {
  const allow = new Set(acceptedLicenses(readFileSync('src-tauri/about.toml', 'utf8')));
  const json: unknown = JSON.parse(
    execFileSync('pnpm', ['licenses', 'list', '--prod', '--json'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === 'win32', // pnpm is a .cmd shim on Windows
    }),
  );
  const pkgs = npmPackages(json).sort((a, b) => a.name.localeCompare(b.name));

  const bad = pkgs.filter((p) => !licenseAllowed(p.license, allow));
  if (bad.length) {
    console.error(
      `License not allowed:\n${bad.map((p) => `${p.name}@${p.version}: ${p.license}`).join('\n')}`,
    );
    process.exitCode = 1;
    return;
  }

  const blocks = pkgs.map((p) => {
    const file = existsSync(p.path)
      ? readdirSync(p.path).find((f) => /^(licen[sc]e|copying)/i.test(f))
      : undefined;
    const text = file
      ? readFileSync(join(p.path, file), 'utf8').trim()
      : `No license file is shipped with this package. Declared license: ${p.license}`;
    return `${'-'.repeat(80)}\n${p.name} ${p.version} (${p.license})\n\n${text}\n`;
  });
  mkdirSync('licenses/generated', {recursive: true});
  writeFileSync(OUT, `npm packages bundled in iFixPDF\n${'='.repeat(32)}\n\n${blocks.join('\n')}`);
  console.log(`Wrote ${OUT} (${pkgs.length} packages)`);
}

run();
