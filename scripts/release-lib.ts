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
