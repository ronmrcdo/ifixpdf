export function acceptedLicenses(aboutToml: string): string[] {
  const body = /^accepted\s*=\s*\[([^\]]*)\]/m.exec(aboutToml)?.[1];
  if (body === undefined) throw new Error('about.toml has no accepted array');
  return [...body.replace(/#.*$/gm, '').matchAll(/"([^"]+)"/g)].map((m) => m[1] as string);
}

// SPDX: AND binds tighter than OR; "X WITH Y" is one allowlist entry.
export function licenseAllowed(expr: string, allow: ReadonlySet<string>): boolean {
  const tokens = expr.match(/\(|\)|[^\s()]+(?: WITH [^\s()]+)?/g) ?? [];
  let i = 0;
  const atom = (): boolean => {
    const t = tokens[i++];
    if (t === undefined || t === ')' || t === 'AND' || t === 'OR') throw new Error('bad');
    if (t !== '(') return allow.has(t);
    const v = or();
    if (tokens[i++] !== ')') throw new Error('bad');
    return v;
  };
  const and = (): boolean => {
    let v = atom();
    while (tokens[i] === 'AND') {
      i++;
      v = atom() && v;
    }
    return v;
  };
  const or = (): boolean => {
    let v = and();
    while (tokens[i] === 'OR') {
      i++;
      v = and() || v;
    }
    return v;
  };
  try {
    const v = or();
    return i === tokens.length && v;
  } catch {
    return false;
  }
}

export type NpmPackage = {name: string; version: string; license: string; path: string};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// Narrows `pnpm licenses list --prod --json`: {license: [{name, versions[], paths[]}]}.
export function npmPackages(json: unknown): NpmPackage[] {
  if (!isRecord(json)) throw new Error('unexpected pnpm licenses output');
  const out: NpmPackage[] = [];
  for (const [license, list] of Object.entries(json)) {
    if (!Array.isArray(list)) throw new Error('unexpected pnpm licenses output');
    for (const p of list as unknown[]) {
      if (!isRecord(p) || typeof p.name !== 'string') throw new Error('unexpected package entry');
      const {versions, paths} = p;
      if (!Array.isArray(versions) || !Array.isArray(paths) || versions.length !== paths.length) {
        throw new Error(`unexpected versions/paths for ${p.name}`);
      }
      versions.forEach((version: unknown, k) => {
        const path = paths[k] as unknown;
        if (typeof version !== 'string' || typeof path !== 'string') {
          throw new Error(`unexpected versions/paths for ${p.name}`);
        }
        out.push({name: p.name as string, version, license, path});
      });
    }
  }
  return out;
}
