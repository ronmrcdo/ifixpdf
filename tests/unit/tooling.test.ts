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

  test('MSIX steps cannot fail the release', () => {
    const steps = wf().match(/- &msix[^\n]*\n(?: {8,}[^\n]*\n)+/g) ?? [];
    expect(steps).toHaveLength(3);
    for (const s of steps) expect(s).toContain('continue-on-error: true');
  });
});

describe('workflow hardening', () => {
  const files = ['.github/workflows/release.yml', '.github/workflows/ci.yml'];
  const all = [...files, '.github/workflows/store.yml'];

  test.each(files)('%s checks out without persisted credentials', (f) => {
    // Each chunk runs from one list item to the next, so a step's `with:` stays in its chunk.
    const checkouts = read(f)
      .split(/\n(?= *- )/)
      .filter((s) => s.includes('uses: actions/checkout@'));
    expect(checkouts.length).toBeGreaterThan(0);
    for (const c of checkouts) expect(c).toContain('persist-credentials: false');
  });

  test.each(all)('%s pins third-party actions to a commit', (f) => {
    const refs = [...read(f).matchAll(/uses: (\S+)/g)].map((m) => m[1] ?? '');
    const thirdParty = refs.filter((r) => !r.startsWith('actions/'));
    expect(thirdParty.length).toBeGreaterThan(0);
    for (const r of thirdParty) expect(r).toMatch(/@[0-9a-f]{40}$/);
  });

  test.each(all)('%s never interpolates secrets into a shell script', (f) => {
    const runs = read(f).match(/^( *)(?:- )?run: [|>]?[^\n]*\n(?:\1 {2,}[^\n]*\n|\n)*/gm) ?? [];
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) expect(run).not.toContain('${{ secrets.');
  });

  test('Store workflow must run from the tag before publishing', () => {
    const s = read('.github/workflows/store.yml');
    const check = s.indexOf('GITHUB_REF_NAME');
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(s.indexOf('msstore publish'));
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

  test('Windows builds package, check and upload the MSIX artifact, and only those steps name .msix', () => {
    const build = job('build');
    expect(build).toContain('node scripts/msix.ts src-tauri/target/release/ifixpdf.exe msix-out');
    expect(build).toContain("if: matrix.platform == 'windows-latest'");
    expect(build).toContain('makeappx.exe');
    expect(build).toContain('unpack');
    expect(build).toContain('Version=`"$v.0`"');
    expect(build).toMatch(/name: msix\n\s+path: msix-out\/\*\.msix\n[\s\S]*retention-days: 90/);
    // dry-run reuses the same steps through the YAML anchors defined in build.
    for (const a of ['msix', 'msix-check', 'msix-upload']) expect(build).toContain(`- &${a}\n`);
    expect(job('dry-run')).toMatch(/- \*msix\n\s+- \*msix-check\n\s+- \*msix-upload/);
    expect(job('draft')).not.toContain('msix');
    expect(job('verify')).not.toContain('msix');
    // The msix steps end each job, so everything before them must not name .msix at all.
    const beforeBuild = build.split('      # Store package')[0] ?? '';
    const beforeDry = job('dry-run').split('      - *msix\n')[0] ?? '';
    expect(beforeBuild).toContain('uploadUpdaterJson');
    expect(beforeDry).toContain('Upload installers');
    expect(beforeBuild).not.toContain('msix');
    expect(beforeDry).not.toContain('msix');
  });
});

describe('store workflow', () => {
  const wf = read('.github/workflows/store.yml');

  test('is a manual run with a required tag, read-only', () => {
    expect(wf).toMatch(
      /^on:\n {2}workflow_dispatch:\n {4}inputs:\n {6}tag:\n(?: {8}.*\n)*? {8}required: true/m,
    );
    expect(wf).toMatch(/^permissions:\n {2}contents: read\n {2}actions: read\n/m);
  });

  test('one Windows job in the release environment', () => {
    expect(wf).toContain('environment: release');
    expect(wf).toContain('runs-on: windows-latest');
  });

  test('submits the Store app and commits to certification', () => {
    expect(wf).toContain('--appId 9NC8SDLBTL8H');
    for (const bad of ['--noCommit', '--priceId', 'gh release upload'])
      expect(wf).not.toContain(bad);
  });

  test('checks secrets, downloads msix and matches the version before submitting', () => {
    const submit = wf.indexOf('msstore publish');
    expect(submit).toBeGreaterThan(0);
    for (const marker of ['MSSTORE_CLIENT_SECRET', 'gh run download', '_x64.msix']) {
      const at = wf.indexOf(marker);
      expect(at, marker).toBeGreaterThan(-1);
      expect(at, marker).toBeLessThan(submit);
    }
    expect(wf).toContain('-n msix');
    expect(wf.indexOf('Check Store secrets')).toBeLessThan(wf.indexOf('gh run download'));
    expect(wf.indexOf('gh run download')).toBeLessThan(wf.indexOf('Check package version'));
    expect(wf.indexOf('Check package version')).toBeLessThan(submit);
  });
});
