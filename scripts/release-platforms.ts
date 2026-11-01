// Release workflow helper, reading package.json `releasePlatforms`.
//   matrix              prints the build matrix for the chosen OSes
//   check <latest.json> prints the job summary; fails when the update feed misses a chosen OS
import {readFileSync} from 'node:fs';
import {buildMatrix, missingUpdaterKeys, PLATFORMS, releasePlatforms} from './release-lib.ts';

const platforms = releasePlatforms(JSON.parse(readFileSync('package.json', 'utf8')));
const names = platforms.map((p) => PLATFORMS[p].label).join(', ');
const [cmd, file] = process.argv.slice(2);

if (cmd === 'matrix') {
  console.log(JSON.stringify(buildMatrix(platforms)));
} else if (cmd === 'check' && file) {
  const feed = JSON.parse(readFileSync(file, 'utf8')) as {platforms?: Record<string, unknown>};
  const missing = missingUpdaterKeys(platforms, Object.keys(feed.platforms ?? {}));
  if (missing.length) {
    console.log(
      `### Not ready to publish\n\n\`latest.json\` is missing ${missing.join(', ')}. Re-run the failed build job, then this one.`,
    );
    process.exitCode = 1;
  } else {
    console.log(`### Ready to publish (${names})

1. Optional: download the installer from the draft release, install it and open it.
2. On \`main\`, run \`pnpm release:publish\`. It checks the draft again, asks you to confirm, publishes it and checks the update feed.

See RELEASE.md for the full steps.`);
  }
} else {
  console.error('Usage: node scripts/release-platforms.ts matrix | check <latest.json>');
  process.exitCode = 1;
}
