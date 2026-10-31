import {readFileSync} from 'node:fs';
import {describe, expect, it} from 'vitest';
import {acceptedLicenses, licenseAllowed, npmPackages} from '../../scripts/licenses-lib.ts';

describe('acceptedLicenses', () => {
  it('reads a multi-line array with comments and a trailing comma', () => {
    const toml = `targets = ["x"]
accepted = [
  "MIT", # most crates
  "Apache-2.0 WITH LLVM-exception",
  # permissive
  "Zlib",
]
ignore = true`;
    expect(acceptedLicenses(toml)).toEqual(['MIT', 'Apache-2.0 WITH LLVM-exception', 'Zlib']);
  });

  it('throws when there is no accepted array', () => {
    expect(() => acceptedLicenses('targets = []')).toThrow();
  });
});

describe('licenseAllowed', () => {
  const allow = new Set(['MIT', 'Apache-2.0', 'Zlib', 'Apache-2.0 WITH LLVM-exception']);
  it.each([
    ['MIT', true],
    ['(MIT OR GPL-3.0)', true],
    ['MIT AND Zlib', true],
    ['(MIT AND Zlib)', true],
    ['Apache-2.0 WITH LLVM-exception', true],
    ['MIT AND GPL-3.0', false],
    ['GPL-3.0 OR (MIT AND GPL-2.0)', false],
    ['GPL-3.0', false],
    ['Apache-2.0 WITH Other-exception', false],
    ['Unknown', false],
    ['SEE LICENSE IN LICENSE.md', false],
    ['(MIT', false],
    ['', false],
  ])('%s -> %s', (expr, ok) => {
    expect(licenseAllowed(expr, allow)).toBe(ok);
  });
});

describe('npmPackages', () => {
  it('flattens the pnpm output grouped by license', () => {
    const fixture: unknown = JSON.parse(
      readFileSync('tests/unit/fixtures/pnpm-licenses.json', 'utf8'),
    );
    const pkgs = npmPackages(fixture);
    expect(pkgs).toContainEqual({
      name: '@dnd-kit/accessibility',
      version: '3.1.1',
      license: 'MIT',
      path: '/x/node_modules/@dnd-kit/accessibility',
    });
    expect(pkgs.every((p) => p.name && p.version && p.license && p.path)).toBe(true);
  });

  it('throws on an unexpected shape', () => {
    expect(() => npmPackages({x: 1})).toThrow();
    expect(() => npmPackages(null)).toThrow();
  });
});
