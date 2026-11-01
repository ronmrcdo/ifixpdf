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

describe('workflow hardening', () => {
  const files = ['.github/workflows/release.yml', '.github/workflows/ci.yml'];

  test.each(files)('%s checks out without persisted credentials', (f) => {
    // Each chunk runs from one list item to the next, so a step's `with:` stays in its chunk.
    const checkouts = read(f)
      .split(/\n(?= *- )/)
      .filter((s) => s.includes('uses: actions/checkout@'));
    expect(checkouts.length).toBeGreaterThan(0);
    for (const c of checkouts) expect(c).toContain('persist-credentials: false');
  });

  test.each(files)('%s pins third-party actions to a commit', (f) => {
    const refs = [...read(f).matchAll(/uses: (\S+)/g)].map((m) => m[1] ?? '');
    const thirdParty = refs.filter((r) => !r.startsWith('actions/'));
    expect(thirdParty.length).toBeGreaterThan(0);
    for (const r of thirdParty) expect(r).toMatch(/@[0-9a-f]{40}$/);
  });

  test('CI runs the npm license gate', () => {
    expect(read('.github/workflows/ci.yml')).toMatch(/^ +- run: pnpm notices$/m);
  });
});

describe('release environment', () => {
  const job = (name: string) => {
    const m = new RegExp(`^ {2}${name}:\n((?: {4}.*\n|\n)*)`, 'm').exec(
      read('.github/workflows/release.yml'),
    );
    if (!m?.[1]) throw new Error(`no job ${name}`);
    return m[1];
  };

  test('only the tag-run jobs that read signing secrets use the release environment', () => {
    for (const name of ['secrets', 'build']) expect(job(name)).toContain('environment: release');
    for (const name of ['preflight', 'draft', 'verify', 'dry-run'])
      expect(job(name)).not.toContain('environment:');
  });

  test('dry runs build without a write token', () => {
    expect(job('dry-run')).toContain("if: github.event_name != 'push'");
    expect(job('dry-run')).not.toContain('contents: write');
  });

  test('builds only the OSes preflight reads from package.json', () => {
    expect(job('preflight')).toContain('node scripts/release-platforms.ts matrix');
    expect(job('build')).toContain('fromJSON(needs.preflight.outputs.matrix)');
    expect(job('dry-run')).toContain('strategy: *platforms');
  });

  test('verify checks the update feed after the builds', () => {
    expect(job('verify')).toContain('needs: build');
    expect(job('verify')).toContain('node scripts/release-platforms.ts check latest.json');
  });

  test('preflight rejects a tag that is not on main', () => {
    expect(job('preflight')).toContain('git merge-base --is-ancestor "$GITHUB_SHA"');
    expect(job('preflight')).toContain('::error::Tag $TAG is not on main');
  });
});
