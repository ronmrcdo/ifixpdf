import {describe, expect, it} from 'vitest';
import {
  blockingChanges,
  cargoPackageVersion,
  changelogSection,
  featFixSubjects,
  isNewer,
  parseVersion,
  setCargoPackageVersion,
} from '../../scripts/release-lib.ts';

const md = `What's new.

## v1.2.10 — Nov 2026

Ten.

## v1.2.0 — Oct 2026

Summary line.

### Featured: Merge
Drop PDFs in.

**New — Password.** Protect a PDF.

## v1.1.0

Old.
`;

describe('parseVersion', () => {
  it('parses strict X.Y.Z', () => expect(parseVersion('1.2.3')).toEqual([1, 2, 3]));
  it.each(['v1.2.3', '1.2', '1.2.3-beta', '', '01.2.3'])('rejects %j', (v) =>
    expect(parseVersion(v)).toBeNull(),
  );
});

describe('isNewer', () => {
  it('compares numerically', () => {
    expect(isNewer('0.10.0', '0.9.0')).toBe(true);
    expect(isNewer('0.1.0', '0.1.0')).toBe(false);
    expect(isNewer('0.0.9', '0.1.0')).toBe(false);
    expect(isNewer('x', '0.1.0')).toBe(false);
    expect(isNewer('0.2.0', 'x')).toBe(false);
  });
});

describe('changelogSection', () => {
  it('returns the body of one version', () => {
    const s = changelogSection(md, '1.2.0');
    expect(s).toContain('### Featured: Merge');
    expect(s).toContain('**New — Password.**');
    expect(s).not.toContain('v1.1.0');
    expect(s).not.toContain('## v1.2.0');
    expect(s).not.toContain('Ten.');
  });
  it('matches a heading with no date', () => expect(changelogSection(md, '1.1.0')).toBe('Old.'));
  it('returns null for missing or prefix-only versions', () => {
    expect(changelogSection(md, '1.2.1')).toBeNull();
    expect(changelogSection(md, '9.9.9')).toBeNull();
  });
  it('returns null for an empty section', () =>
    expect(changelogSection('## v1.0.0 — x\n\n  \n## v0.9.0\nA\n', '1.0.0')).toBeNull());
  it('normalizes CRLF', () => {
    const crlf = changelogSection(md.replace(/\n/g, '\r\n'), '1.2.0');
    expect(crlf).toBe(changelogSection(md, '1.2.0'));
    expect(crlf).not.toContain('\r');
  });
});

describe('blockingChanges', () => {
  it('ignores CHANGELOG.md only', () => {
    expect(blockingChanges(' M CHANGELOG.md\n M src/App.tsx\n?? notes.txt\n')).toEqual([
      'src/App.tsx',
      'notes.txt',
    ]);
    expect(blockingChanges(' M CHANGELOG.md\n')).toEqual([]);
  });
});

describe('featFixSubjects', () => {
  it('keeps feat and fix', () => {
    const log = 'feat(ui): x\nfix: y\nfeat!: z\nchore: a\nstyle: b\nMerge branch c\n';
    expect(featFixSubjects(log)).toEqual(['feat(ui): x', 'fix: y', 'feat!: z']);
  });
});

describe('cargo version', () => {
  const toml = `[package]\nname = "a"\nversion = "0.1.0"\n\n[dependencies]\nx = { version = "0.1.0" }\nversion = "0.1.0"\n`;
  it('changes only the package version', () => {
    const out = setCargoPackageVersion(toml, '0.2.0');
    expect(out).toBe(toml.replace('version = "0.1.0"', 'version = "0.2.0"'));
    expect(cargoPackageVersion(out)).toBe('0.2.0');
  });
  it('returns null without a package version', () =>
    expect(cargoPackageVersion('[dependencies]\nversion = "1.0.0"\n')).toBeNull());
});
