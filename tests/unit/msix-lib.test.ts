import {describe, expect, it} from 'vitest';
import {appxManifest, msixFileName, msixVersion} from '../../scripts/msix-lib.ts';

describe('msixVersion', () => {
  it('appends the fourth part', () => expect(msixVersion('0.1.3')).toBe('0.1.3.0'));
  it('rejects non-semver', () => expect(() => msixVersion('1.2')).toThrow('Not a version: 1.2'));
  it('rejects parts over 65535', () =>
    expect(() => msixVersion('65536.0.0')).toThrow(
      'MSIX version parts must be at most 65535: 65536.0.0',
    ));
  it('accepts 65535', () => expect(msixVersion('65535.0.0')).toBe('65535.0.0.0'));
});

describe('msixFileName', () => {
  it('names the package', () => expect(msixFileName('0.1.3')).toBe('iFixPDF_0.1.3.0_x64.msix'));
});

describe('appxManifest', () => {
  const xml = appxManifest('0.1.3');
  it.each([
    'Name="SibulLabs.iFixPDF"',
    'Publisher="CN=983C81E5-0CD0-40BF-8C1A-370E3750AC12"',
    'Version="0.1.3.0"',
    'ProcessorArchitecture="x64"',
    '<PublisherDisplayName>Sibul Labs</PublisherDisplayName>',
    'EntryPoint="Windows.FullTrustApplication"',
    'Executable="iFixPDF.exe"',
    '<rescap:Capability Name="runFullTrust"/>',
  ])('contains %s', (s) => expect(xml).toContain(s));

  it('is well-formed XML', () => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  });

  it('propagates invalid versions', () => expect(() => appxManifest('x')).toThrow('Not a version'));
});
