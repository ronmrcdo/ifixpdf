import {describe, expect, it} from 'vitest';
import {
  addSection,
  autoNotes,
  blockingChanges,
  buildMatrix,
  bumpVersion,
  cargoPackageVersion,
  changelogSection,
  checkVersions,
  featFixSubjects,
  isNewer,
  missingUpdaterKeys,
  parseVersion,
  releaseBody,
  releasePlatforms,
  setCargoPackageVersion,
  stampUnreleased,
  unreleasedSection,
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

describe('bumpVersion', () => {
  it('bumps patch, minor and major', () => {
    expect(bumpVersion('1.2.3', 'patch')).toBe('1.2.4');
    expect(bumpVersion('1.2.3', 'minor')).toBe('1.3.0');
    expect(bumpVersion('1.2.3', 'major')).toBe('2.0.0');
  });
  it('rejects a bad version', () => expect(() => bumpVersion('1.2', 'patch')).toThrow());
});

describe('unreleased changelog section', () => {
  const draft = `What's new.\n\n## Unreleased\n\nNext.\n\n## v1.2.0 — Oct 2026\n\nOld.\n`;
  it('returns the Unreleased body only', () => expect(unreleasedSection(draft)).toBe('Next.'));
  it('returns null when missing or empty', () => {
    expect(unreleasedSection(md)).toBeNull();
    expect(unreleasedSection('## Unreleased\n\n## v1.0.0\nA\n')).toBeNull();
  });
  it('ignores a heading that only starts with Unreleased', () =>
    expect(unreleasedSection('## Unreleased stuff\n\nX\n')).toBeNull());
  it('stamps the heading with the version and date', () => {
    const out = stampUnreleased(draft, '1.3.0', 'November 2026');
    expect(out).toContain('## v1.3.0 — November 2026\n\nNext.');
    expect(out).not.toContain('Unreleased');
    expect(changelogSection(out, '1.3.0')).toBe('Next.');
    expect(changelogSection(out, '1.2.0')).toBe('Old.');
  });
  it('stamps a CRLF file', () =>
    expect(stampUnreleased(draft.replace(/\n/g, '\r\n'), '1.3.0', 'Nov')).toContain(
      '## v1.3.0 — Nov\r\n',
    ));
});

describe('autoNotes', () => {
  it('turns feat and fix subjects into New and Fixed items, New first', () =>
    expect(
      autoNotes([
        'fix(save): keep rotation on export',
        'feat: add page numbers',
        'feat(merge)!: drop old list',
      ]),
    ).toBe(
      '- **New** — Add page numbers\n- **New** — Drop old list\n- **Fixed** — Keep rotation on export',
    ));
  it('falls back to a fixed line when there are no feat or fix commits', () =>
    expect(autoNotes([])).toBe('Small improvements and fixes.'));
});

describe('addSection', () => {
  it('adds the newest section above the previous one', () => {
    const out = addSection(
      "What's new.\n\n## v1.0.0 — Oct 2026\n\nOld.\n",
      '1.1.0',
      'Nov 2026',
      'New.',
    );
    expect(out).toBe(
      "What's new.\n\n## v1.1.0 — Nov 2026\n\nNew.\n\n## v1.0.0 — Oct 2026\n\nOld.\n",
    );
    expect(changelogSection(out, '1.1.0')).toBe('New.');
    expect(changelogSection(out, '1.0.0')).toBe('Old.');
  });
  it('appends when there is no section yet', () =>
    expect(addSection("What's new.\n", '0.1.1', 'Nov 2026', 'New.')).toBe(
      "What's new.\n\n## v0.1.1 — Nov 2026\n\nNew.\n",
    ));
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
  it('finds the version after a key holding brackets', () => {
    const t =
      '[package]\nname = "a"\nauthors = ["x"]\nversion = "1.0.0"\n\n[dependencies]\nx = { version = "0.1.0" }\n';
    expect(cargoPackageVersion(t)).toBe('1.0.0');
    expect(setCargoPackageVersion(t, '1.1.0')).toBe(t.replace('"1.0.0"', '"1.1.0"'));
  });
  it('returns null without a package version', () =>
    expect(cargoPackageVersion('[dependencies]\nversion = "1.0.0"\n')).toBeNull());
});

describe('checkVersions', () => {
  it('accepts matching versions', () =>
    expect(checkVersions('v1.2.0', '1.2.0', '1.2.0')).toBeNull());
  it('names the mismatched file', () => {
    expect(checkVersions('v1.2.0', '1.1.0', '1.2.0')).toContain('package.json');
    expect(checkVersions('v1.2.0', '1.2.0', '1.1.0')).toContain('Cargo.toml');
  });
  it('rejects a bad tag', () => {
    expect(checkVersions('1.2.0', '1.2.0', '1.2.0')).toContain('1.2.0');
    expect(checkVersions('v1.2', '1.2.0', '1.2.0')).toContain('v1.2');
  });
});

describe('release platforms', () => {
  it('defaults to every OS', () =>
    expect(releasePlatforms({})).toEqual(['windows', 'macos', 'linux']));
  it('keeps the chosen OSes in a fixed order', () =>
    expect(releasePlatforms({releasePlatforms: ['linux', 'windows']})).toEqual([
      'windows',
      'linux',
    ]));
  it('rejects an unknown, empty or malformed list', () => {
    expect(() => releasePlatforms({releasePlatforms: ['android']})).toThrow('android');
    expect(() => releasePlatforms({releasePlatforms: []})).toThrow();
    expect(() => releasePlatforms({releasePlatforms: 'windows'})).toThrow();
  });
  it('builds a matrix for the chosen OSes only', () => {
    expect(buildMatrix(['windows'])).toEqual({
      include: [{platform: 'windows-latest', args: '--bundles nsis'}],
    });
    expect(buildMatrix(['macos']).include[0]).toMatchObject({
      platform: 'macos-latest',
      'rust-targets': 'aarch64-apple-darwin,x86_64-apple-darwin',
    });
  });
  it('lists the update-feed entries a release is missing', () => {
    expect(missingUpdaterKeys(['windows', 'linux'], ['windows-x86_64', 'linux-x86_64'])).toEqual([
      'linux-x86_64-deb',
    ]);
    expect(missingUpdaterKeys(['windows'], ['windows-x86_64', 'windows-x86_64-nsis'])).toEqual([]);
  });
});

describe('releaseBody for some OSes', () => {
  const body = releaseBody('1.2.0', 'NOTES', ['windows']);
  it('lists and explains only the chosen OSes', () => {
    expect(body).toContain('iFixPDF_1.2.0_x64-setup.exe');
    expect(body).toContain('Run anyway');
    for (const t of ['universal.dmg', 'AppImage', 'xattr', 'Updating on Linux'])
      expect(body).not.toContain(t);
    expect(body).toContain('EULA.txt');
  });
  it('drops the warning section when no chosen OS warns', () =>
    expect(releaseBody('1.2.0', 'NOTES', ['linux'])).not.toContain('If your computer warns you'));
});

describe('releaseBody', () => {
  const body = releaseBody('1.2.0', 'NOTES', ['windows', 'macos', 'linux']);
  it('opens with the notes', () => expect(body.startsWith("## What's new\n\nNOTES")).toBe(true));
  it('lists every download', () => {
    for (const f of ['x64-setup.exe', 'universal.dmg', 'amd64.AppImage', 'amd64.deb'])
      expect(body).toContain(`iFixPDF_1.2.0_${f}`);
  });
  it('makes no safety or auto-update claims', () => {
    expect(body).not.toContain('safe to open');
    expect(body).not.toContain('updates itself');
  });
  it('explains the unsigned warnings, .deb updates and privacy', () => {
    for (const t of [
      'More info',
      'Run anyway',
      'Open Anyway',
      'xattr -cr /Applications/iFixPDF.app',
    ])
      expect(body).toContain(t);
    expect(body).toContain('AppImage or the `.deb`, press **Check for updates**');
    expect(body).toContain('asks for your password');
    expect(body).not.toContain('downloading the new');
    expect(body).toContain('https://github.com/ronmrcdo/ifixpdf/blob/main/EULA.txt');
  });
});
