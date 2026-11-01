import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {confirm, isCancel} from '@clack/prompts';
import {missingUpdaterKeys, PLATFORMS, releasePlatforms} from './release-lib.ts';

const FEED = 'https://github.com/ronmrcdo/ifixpdf/releases/latest/download/latest.json';
const run = (cmd: string, ...args: string[]) =>
  execFileSync(cmd, args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
const fail = (msg: string): void => {
  console.error(msg);
  process.exitCode = 1;
};

async function main(): Promise<void> {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {version: string};
  const tag = process.argv[2] ?? `v${pkg.version}`;
  if (!process.stdin.isTTY) return fail('Run in a terminal: it asks you to confirm.');

  let isDraft: boolean;
  try {
    ({isDraft} = JSON.parse(run('gh', 'release', 'view', tag, '--json', 'isDraft')) as {
      isDraft: boolean;
    });
  } catch {
    return fail(`No GitHub release for ${tag} yet. Wait for the release workflow to finish.`);
  }
  if (!isDraft) return fail(`${tag} is already published.`);

  // The OSes chosen for this release, as recorded in its tagged commit.
  run('git', 'fetch', '-q', 'origin', 'tag', tag);
  const platforms = releasePlatforms(JSON.parse(run('git', 'show', `${tag}:package.json`)));
  const feed = JSON.parse(
    run('gh', 'release', 'download', tag, '-p', 'latest.json', '-O', '-'),
  ) as {
    platforms?: Record<string, unknown>;
  };
  const missing = missingUpdaterKeys(platforms, Object.keys(feed.platforms ?? {}));
  if (missing.length)
    return fail(`Not ready: latest.json is missing ${missing.join(', ')}. Re-run that build job.`);

  const names = platforms.map((p) => PLATFORMS[p].label).join(', ');
  const ok = await confirm({
    message: `Publish iFixPDF ${tag} for ${names}? Anyone can then download it, and Check for updates offers it.`,
    initialValue: false,
  });
  if (isCancel(ok) || !ok) return fail('Not published.');

  run('gh', 'release', 'edit', tag, '--draft=false', '--latest');
  console.log(`Published ${tag}.`);
  const res = await fetch(FEED);
  const live = res.ok ? ((await res.json()) as {version?: string}).version : undefined;
  console.log(
    live === tag.slice(1)
      ? `Update feed now offers ${live}.`
      : `Update feed shows ${live ?? `HTTP ${res.status}`}; it can lag a minute. Check later: curl -sL ${FEED}`,
  );
}

await main();
