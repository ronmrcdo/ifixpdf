// Local git hooks: lint on commit, typecheck and tests on push.
import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';

const read = (p: string) => readFileSync(p, 'utf8'); // vitest runs from the repo root

describe('git hooks', () => {
  test('husky is pinned and installed by prepare', () => {
    const pkg = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.scripts.prepare).toBe('husky');
    expect(pkg.devDependencies.husky).toBe('9.1.7');
  });

  test('pre-commit runs lint', () => {
    expect(read('.husky/pre-commit').trim()).toBe('pnpm lint');
  });

  test('pre-push runs typecheck and tests', () => {
    expect(read('.husky/pre-push').trim()).toBe('pnpm typecheck && pnpm test');
  });
});

describe('bundle config', () => {
  const conf = JSON.parse(read('src-tauri/tauri.conf.json')) as {
    identifier: string;
    bundle: {targets: string[]; windows?: {nsis?: {installMode?: string}}};
    plugins: {updater: {pubkey: string; endpoints: string[]; windows?: {installMode?: string}}};
  };

  test('targets all three OSes, NSIS only on Windows', () => {
    expect(conf.bundle.targets).toEqual(['nsis', 'app', 'dmg', 'appimage', 'deb']);
  });

  test('installs per-user and updates passively', () => {
    expect(conf.bundle.windows?.nsis?.installMode).toBe('currentUser');
    expect(conf.plugins.updater.windows?.installMode).toBe('passive');
  });

  test('committed config carries no updater secrets and keeps the identifier', () => {
    expect(conf.plugins.updater.pubkey).toBe('');
    expect(conf.plugins.updater.endpoints).toEqual([]);
    expect(conf.identifier).toBe('com.ifixpdf.desktop');
  });
});

describe('release workflow', () => {
  const wf = () => read('.github/workflows/release.yml');

  test('creates the release only as a draft', () => {
    expect(wf()).toMatch(/gh release create "\$TAG" --draft /);
    expect(wf()).not.toMatch(/releaseDraft|gh release edit [^\n]*--draft=false/);
  });

  test('defaults to read-only permissions', () => {
    expect(wf()).toMatch(/^permissions:\n {2}contents: read\n/m);
  });

  test('never interpolates secrets into a shell script', () => {
    // Each `run:` block runs until the next step or key at the same or lower indent.
    const runs = wf().match(/^( *)(?:- )?run: [|>]?[^\n]*\n(?:\1 {2,}[^\n]*\n|\n)*/gm) ?? [];
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) expect(run).not.toContain('${{ secrets.');
  });
});
