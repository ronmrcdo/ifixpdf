import {readFileSync} from 'node:fs';
import {
  cargoPackageVersion,
  changelogSection,
  checkVersions,
  releaseBody,
  releasePlatforms,
} from './release-lib.ts';

const fail = (msg: string): void => {
  console.error(msg);
  process.exitCode = 1;
};

function run(): void {
  const tag = process.argv[2] ?? '';
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
    version: string;
    releasePlatforms?: unknown;
  };
  const cargo = cargoPackageVersion(readFileSync('src-tauri/Cargo.toml', 'utf8')) ?? '(missing)';
  const error = checkVersions(tag, pkg.version, cargo);
  if (error) return fail(error);
  const notes = changelogSection(readFileSync('CHANGELOG.md', 'utf8'), tag.slice(1));
  if (!notes) return fail(`CHANGELOG.md has no entry for ${tag}`);
  console.log(releaseBody(tag.slice(1), notes, releasePlatforms(pkg)));
}

run();
