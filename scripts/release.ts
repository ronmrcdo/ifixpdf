import {execFileSync} from 'node:child_process';
import {confirm, intro, isCancel, note, outro, select} from '@clack/prompts';
import {readFileSync, writeFileSync} from 'node:fs';
import {
  type Bump,
  blockingChanges,
  bumpVersion,
  cargoPackageVersion,
  changelogSection,
  featFixSubjects,
  isNewer,
  parseVersion,
  setCargoPackageVersion,
  stampUnreleased,
  unreleasedSection,
} from './release-lib.ts';

const git = (...args: string[]) =>
  execFileSync('git', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
const fail = (msg: string): void => {
  console.error(msg);
  process.exitCode = 1;
};

function lastTag(): string | null {
  try {
    return git('describe', '--tags', '--abbrev=0').trim();
  } catch {
    return null; // no tag yet: whole history
  }
}

const commitsSince = (tag: string | null) =>
  featFixSubjects(git('log', tag ? `${tag}..HEAD` : 'HEAD', '--format=%s'));

/** Shows the last and next release, then asks for the bump. Null when stopped or cancelled. */
async function pickVersion(current: string, md: string): Promise<string | null> {
  const tag = lastTag();
  const commits = commitsSince(tag);
  intro('iFixPDF release');
  note(`Current version: ${current}\nLast tag: ${tag ?? 'none'}`, 'Now');
  note(changelogSection(md, current) ?? 'No entry in CHANGELOG.md.', `Last release (v${current})`);
  note(commits.join('\n') || 'None.', `feat/fix commits since ${tag ?? 'the start'}`);
  const next = unreleasedSection(md);
  if (!next) {
    outro(
      'Add a "## Unreleased" section to CHANGELOG.md (see README "How to release"), then rerun.',
    );
    return null;
  }
  note(next, 'Next release (## Unreleased)');
  const bumps: Bump[] = ['patch', 'minor', 'major'];
  const version = await select({
    message: 'Which version?',
    options: bumps.map((b) => ({
      value: bumpVersion(current, b),
      label: b,
      hint: bumpVersion(current, b),
    })),
  });
  if (isCancel(version)) return null;
  const ok = await confirm({
    message: `Release v${version}? This renames "## Unreleased", bumps the versions, commits and tags.`,
    initialValue: false,
  });
  return ok === true ? version : null;
}

async function run(): Promise<void> {
  if (git('rev-parse', '--abbrev-ref', 'HEAD').trim() !== 'main') return fail('Run from main.');
  const dirty = blockingChanges(git('status', '--porcelain'));
  if (dirty.length) return fail(`Commit or stash first:\n${dirty.join('\n')}`);

  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {version: string};
  const md = readFileSync('CHANGELOG.md', 'utf8');
  let version = process.argv[2];
  if (!version) {
    if (!process.stdin.isTTY)
      return fail('Run in a terminal, or pass the version: pnpm release X.Y.Z');
    const picked = await pickVersion(pkg.version, md);
    if (!picked) return fail('Release stopped.');
    version = picked;
  }
  if (!parseVersion(version)) return fail('Usage: pnpm release [X.Y.Z]');
  if (!isNewer(version, pkg.version)) return fail(`${version} is not newer than ${pkg.version}`);
  try {
    git('rev-parse', '-q', '--verify', `refs/tags/v${version}`);
    return fail(`Tag v${version} already exists`);
  } catch {
    // tag is absent, as required
  }

  let changelog = md;
  if (!changelogSection(md, version)) {
    if (unreleasedSection(md)) {
      const date = new Date().toLocaleString('en-US', {month: 'long', year: 'numeric'});
      changelog = stampUnreleased(md, version, date);
    } else {
      console.log(
        `Add a "## Unreleased" or "## v${version} — Month YYYY" section to CHANGELOG.md. Changes since the last release:`,
      );
      for (const s of commitsSince(lastTag())) console.log(`  ${s}`);
      return fail('CHANGELOG.md has no entry for this version.');
    }
  }

  const cargo = 'src-tauri/Cargo.toml';
  const toml = readFileSync(cargo, 'utf8');
  if (!cargoPackageVersion(toml)) return fail(`No [package] version found in ${cargo}`);

  const bumped = ['package.json', cargo, 'src-tauri/Cargo.lock'];
  let committed = false;
  try {
    writeFileSync('CHANGELOG.md', changelog);
    writeFileSync('package.json', `${JSON.stringify({...pkg, version}, null, 2)}\n`);
    writeFileSync(cargo, setCargoPackageVersion(toml, version));
    if (cargoPackageVersion(readFileSync(cargo, 'utf8')) !== version)
      throw new Error(`${cargo} version was not set to ${version}`);
    execFileSync('cargo', ['update', '--workspace', '--offline'], {cwd: 'src-tauri'});

    git('add', ...bumped, 'CHANGELOG.md');
    git('commit', '-m', `chore(release): v${version}`);
    committed = true;
    git('tag', `v${version}`);
  } catch (e) {
    // Undo a partial release so the tree is as it was, including the user's CHANGELOG.md draft.
    // The tag is the last step, so a failure here means it was never created.
    if (committed) git('reset', '-q', 'HEAD~1');
    git('reset', '-q', '--', ...bumped, 'CHANGELOG.md');
    git('checkout', 'HEAD', '--', ...bumped);
    writeFileSync('CHANGELOG.md', md);
    return fail(
      `Release failed, version bump undone: ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`,
    );
  }
  console.log(`Ready. Push with: git push --atomic origin main v${version}`);
}

await run();
