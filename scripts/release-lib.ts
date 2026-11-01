export function parseVersion(v: string): [number, number, number] | null {
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function isNewer(next: string, current: string): boolean {
  const a = parseVersion(next);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i]! > b[i]!;
  }
  return false;
}

export type Bump = 'patch' | 'minor' | 'major';

export function bumpVersion(version: string, bump: Bump): string {
  const v = parseVersion(version);
  if (!v) throw new Error(`Not a version: ${version}`);
  const [major, minor, patch] = v;
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function section(md: string, isHeading: (line: string) => boolean): string | null {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const start = lines.findIndex(isHeading);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  const body = (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
  return body || null;
}

export function changelogSection(md: string, version: string): string | null {
  const head = `## v${version}`;
  return section(
    md,
    (l) => l.startsWith(head) && (l.length === head.length || /^[ —]/.test(l.slice(head.length))),
  );
}

const UNRELEASED = /^## Unreleased[ \t]*$/m;

export function unreleasedSection(md: string): string | null {
  return section(md, (l) => UNRELEASED.test(l));
}

export function stampUnreleased(md: string, version: string, date: string): string {
  return md.replace(UNRELEASED, `## v${version} — ${date}`);
}

const SUBJECT = /^(feat|fix)(\(.+\))?!?:\s*(.+)$/;

/** Release notes from feat/fix commit subjects, New before Fixed. */
export function autoNotes(subjects: string[]): string {
  const items = (kind: string, label: string) =>
    subjects.flatMap((s) => {
      const m = SUBJECT.exec(s);
      const text = m?.[1] === kind ? m[3] : undefined;
      return text ? [`- **${label}** — ${text.charAt(0).toUpperCase()}${text.slice(1)}`] : [];
    });
  const lines = [...items('feat', 'New'), ...items('fix', 'Fixed')];
  return lines.join('\n') || 'Small improvements and fixes.';
}

/** Adds a version section above the newest one, or at the end when there is none. */
export function addSection(md: string, version: string, date: string, notes: string): string {
  const section = `## v${version} — ${date}\n\n${notes}\n`;
  const at = md.search(/^## /m);
  if (at < 0) return `${md.trimEnd()}\n\n${section}`;
  return `${md.slice(0, at)}${section}\n${md.slice(at)}`;
}

export function blockingChanges(porcelain: string): string[] {
  return porcelain
    .split('\n')
    .filter(Boolean)
    .map((l) => l.slice(3))
    .filter((p) => p !== 'CHANGELOG.md');
}

export function featFixSubjects(log: string): string[] {
  return log.split('\n').filter((l) => /^(feat|fix)(\(.+\))?!?:/.test(l));
}

// Matches the first `version = "..."` after `[package]` and before the next table header (a line starting with `[`).
const PACKAGE_VERSION = /(\[package\](?:\n(?!\[)[^\n]*)*?\nversion\s*=\s*")([^"]*)(")/;

export function cargoPackageVersion(toml: string): string | null {
  return PACKAGE_VERSION.exec(toml)?.[2] ?? null;
}

export function setCargoPackageVersion(toml: string, version: string): string {
  return toml.replace(PACKAGE_VERSION, `$1${version}$3`);
}

export function checkVersions(tag: string, pkg: string, cargo: string): string | null {
  const version = tag.startsWith('v') ? tag.slice(1) : '';
  if (!parseVersion(version)) return `Tag "${tag}" is not in the form vX.Y.Z`;
  if (pkg !== version) return `Tag ${tag} does not match package.json version ${pkg}`;
  if (cargo !== version) return `Tag ${tag} does not match src-tauri/Cargo.toml version ${cargo}`;
  return null;
}

/** Supported OSes: the GitHub runner and tauri build args, and the update-feed entries each must add. */
export const PLATFORMS = {
  windows: {
    label: 'Windows',
    runner: 'windows-latest',
    args: '--bundles nsis',
    updaterKeys: ['windows-x86_64'],
  },
  macos: {
    label: 'macOS',
    runner: 'macos-latest',
    args: '--target universal-apple-darwin --bundles app,dmg',
    rustTargets: 'aarch64-apple-darwin,x86_64-apple-darwin',
    updaterKeys: ['darwin-aarch64', 'darwin-x86_64'],
  },
  linux: {
    label: 'Linux',
    runner: 'ubuntu-22.04',
    args: '--bundles appimage,deb',
    updaterKeys: ['linux-x86_64', 'linux-x86_64-deb'],
  },
} as const;
export type Platform = keyof typeof PLATFORMS;
export const ALL_PLATFORMS = Object.keys(PLATFORMS) as Platform[];
const isPlatform = (p: unknown): p is Platform => ALL_PLATFORMS.includes(p as Platform);

/** The OSes to release, from package.json `releasePlatforms`; every OS when unset. */
export function releasePlatforms(pkg: {releasePlatforms?: unknown}): Platform[] {
  const list = pkg.releasePlatforms;
  if (list === undefined) return ALL_PLATFORMS;
  if (!Array.isArray(list) || list.length === 0)
    throw new Error('package.json releasePlatforms must be a non-empty list');
  const unknown = list.filter((p) => !isPlatform(p));
  if (unknown.length) throw new Error(`Unknown releasePlatforms: ${unknown.join(', ')}`);
  return ALL_PLATFORMS.filter((p) => list.includes(p));
}

export function buildMatrix(platforms: Platform[]) {
  return {
    include: platforms.map((p) => {
      const c: {runner: string; args: string; rustTargets?: string} = PLATFORMS[p];
      return {
        platform: c.runner,
        args: c.args,
        ...(c.rustTargets ? {'rust-targets': c.rustTargets} : {}),
      };
    }),
  };
}

export function missingUpdaterKeys(platforms: Platform[], keys: string[]): string[] {
  return platforms.flatMap((p) => PLATFORMS[p].updaterKeys).filter((k) => !keys.includes(k));
}

export function releaseBody(version: string, notes: string, platforms: Platform[]): string {
  const f = (suffix: string) => `iFixPDF_${version}_${suffix}`;
  const has = (p: Platform) => platforms.includes(p);
  const rows = [
    has('windows') && `| Windows 10 or 11 (64-bit) | ${f('x64-setup.exe')} |`,
    has('macos') && `| Mac | ${f('universal.dmg')} |`,
    has('linux') && `| Linux | ${f('amd64.AppImage')} or ${f('amd64.deb')} |`,
  ].filter(Boolean);
  const warnings = [
    has('windows') &&
      '**Windows:** if you see "Windows protected your PC", click **More info**, then **Run anyway**.',
    has('macos') &&
      `**Mac:** if macOS blocks the app, right-click it and choose **Open**. You can also go to **System Settings > Privacy & Security** and click **Open Anyway**. If macOS says the app "is damaged", open Terminal and run:

\`\`\`
xattr -cr /Applications/iFixPDF.app
\`\`\``,
  ].filter(Boolean);
  const sections = [
    `## What's new\n\n${notes}`,
    `## Downloads\n\n| Your computer | Download |\n| --- | --- |\n${rows.join('\n')}`,
    warnings.length &&
      `## If your computer warns you\n\niFixPDF is not signed with a paid certificate yet, so your computer may not recognize it and may warn you the first time you open it.\n\n${warnings.join('\n\n')}`,
    has('linux') &&
      '## Updating on Linux\n\nWhether you use the AppImage or the `.deb`, press **Check for updates** in Settings. If you installed the `.deb`, your computer asks for your password to install the update.',
    '## Privacy\n\nRead our [privacy statement](https://github.com/ronmrcdo/ifixpdf/blob/main/EULA.txt).',
  ];
  return `${sections.filter(Boolean).join('\n\n')}\n`;
}
