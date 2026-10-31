import {execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {
  blockingChanges,
  changelogSection,
  featFixSubjects,
  isNewer,
  parseVersion,
  setCargoPackageVersion,
} from './release-lib.ts';

const git = (...args: string[]) =>
  execFileSync('git', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
const fail = (msg: string): void => {
  console.error(msg);
  process.exitCode = 1;
};

function run(): void {
  const version = process.argv[2] ?? '';
  if (!parseVersion(version)) return fail('Usage: pnpm release X.Y.Z');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {version: string};
  if (!isNewer(version, pkg.version)) return fail(`${version} is not newer than ${pkg.version}`);

  if (git('rev-parse', '--abbrev-ref', 'HEAD').trim() !== 'main') return fail('Run from main.');
  const dirty = blockingChanges(git('status', '--porcelain'));
  if (dirty.length) return fail(`Commit or stash first:\n${dirty.join('\n')}`);
  try {
    git('rev-parse', '-q', '--verify', `refs/tags/v${version}`);
    return fail(`Tag v${version} already exists`);
  } catch {
    // tag is absent, as required
  }

  if (!changelogSection(readFileSync('CHANGELOG.md', 'utf8'), version)) {
    let range = 'HEAD';
    try {
      range = `${git('describe', '--tags', '--abbrev=0').trim()}..HEAD`;
    } catch {
      // no tag yet: whole history
    }
    console.log(
      `Add a "## v${version} — Month YYYY" section to CHANGELOG.md. Changes since the last release:`,
    );
    for (const s of featFixSubjects(git('log', range, '--format=%s'))) console.log(`  ${s}`);
    return fail('CHANGELOG.md has no entry for this version.');
  }

  writeFileSync('package.json', `${JSON.stringify({...pkg, version}, null, 2)}\n`);
  const cargo = 'src-tauri/Cargo.toml';
  writeFileSync(cargo, setCargoPackageVersion(readFileSync(cargo, 'utf8'), version));
  execFileSync('cargo', ['update', '--workspace', '--offline'], {cwd: 'src-tauri'});

  git('add', 'package.json', cargo, 'src-tauri/Cargo.lock', 'CHANGELOG.md');
  git('commit', '-m', `chore(release): v${version}`);
  git('tag', `v${version}`);
  console.log(`Ready. Push with: git push --atomic origin main v${version}`);
}

run();
