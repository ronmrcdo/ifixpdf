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

export function changelogSection(md: string, version: string): string | null {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const head = `## v${version}`;
  const start = lines.findIndex(
    (l) => l.startsWith(head) && (l.length === head.length || /^[ —]/.test(l.slice(head.length))),
  );
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith('## '));
  const body = (end < 0 ? rest : rest.slice(0, end)).join('\n').trim();
  return body || null;
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

// Matches the first `version = "..."` after `[package]` and before the next table header.
const PACKAGE_VERSION = /(\[package\][^[]*?\nversion\s*=\s*")([^"]*)(")/;

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

export function releaseBody(version: string, notes: string): string {
  const f = (suffix: string) => `iFixPDF_${version}_${suffix}`;
  return `## What's new

${notes}

## Downloads

| Your computer | Download |
| --- | --- |
| Windows 10 or 11 | ${f('x64-setup.exe')} |
| Mac | ${f('universal.dmg')} |
| Linux | ${f('amd64.AppImage')} or ${f('amd64.deb')} |

## If your computer warns you

iFixPDF is not signed with a paid certificate yet, so Windows and macOS may warn you the first time. The app is safe to open.

**Windows:** if you see "Windows protected your PC", click **More info**, then **Run anyway**.

**Mac:** if macOS blocks the app, right-click it and choose **Open**. You can also go to **System Settings > Privacy & Security** and click **Open Anyway**. If macOS says the app "is damaged", open Terminal and run:

\`\`\`
xattr -cr /Applications/iFixPDF.app
\`\`\`

## Updating on Linux

The AppImage updates itself from Settings. If you installed the \`.deb\`, update by downloading the new \`.deb\` from this page.

## Privacy

Read our [privacy statement](https://github.com/ronmrcdo/ifixpdf/blob/main/EULA.txt).
`;
}
