import {parseVersion} from './release-lib.ts';

export function msixVersion(version: string): string {
  const v = parseVersion(version);
  if (!v) throw new Error(`Not a version: ${version}`);
  if (v.some((n) => n > 65535)) {
    throw new Error(`MSIX version parts must be at most 65535: ${version}`);
  }
  return `${version}.0`;
}

export function msixFileName(version: string): string {
  return `iFixPDF_${msixVersion(version)}_x64.msix`;
}

export function appxManifest(version: string): string {
  const v = msixVersion(version);
  return `<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
  xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
  xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
  IgnorableNamespaces="uap rescap">
  <Identity Name="SibulLabs.iFixPDF" Publisher="CN=983C81E5-0CD0-40BF-8C1A-370E3750AC12" Version="${v}" ProcessorArchitecture="x64"/>
  <Properties>
    <DisplayName>iFixPDF</DisplayName>
    <PublisherDisplayName>Sibul Labs</PublisherDisplayName>
    <Logo>Assets\\StoreLogo.png</Logo>
  </Properties>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.22621.0"/>
  </Dependencies>
  <Resources><Resource Language="en-us"/></Resources>
  <Applications>
    <Application Id="iFixPDF" Executable="iFixPDF.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="iFixPDF" Description="PDF workspace" BackgroundColor="transparent"
        Square150x150Logo="Assets\\Square150x150Logo.png" Square44x44Logo="Assets\\Square44x44Logo.png"/>
    </Application>
  </Applications>
  <Capabilities><rescap:Capability Name="runFullTrust"/></Capabilities>
</Package>
`;
}
