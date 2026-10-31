import {describe, expect, it} from 'vitest';
import {exportTitle, extractName, outputName, protectedName, splitPartName, splitPath, splitZipName} from './naming';

describe('outputName', () => {
  it('trims and appends .pdf', () => {
    expect(outputName('  Report ')).toBe('Report.pdf');
  });
  it('strips .pdf case-insensitively, once', () => {
    expect(outputName('a.PDF')).toBe('a.pdf');
    expect(outputName('a.pdf.pdf')).toBe('a.pdf.pdf');
  });
  it('falls back when empty', () => {
    expect(outputName('')).toBe('Merged document.pdf');
    expect(outputName('  .PDF ')).toBe('Merged document.pdf');
  });
});

describe('derived names', () => {
  it('protectedName', () => expect(protectedName('A.pdf')).toBe('A — protected.pdf'));
  it('splitZipName', () => expect(splitZipName('A.PDF')).toBe('A — split.zip'));
  it('splitPartName', () => expect(splitPartName('A.pdf', 2)).toBe('A — part 2.pdf'));
  it('extractName', () => expect(extractName('A.pdf', [0, 1, 2, 4])).toBe('A – pages 1–3, 5.pdf'));
  it('falls back to the merged-document base', () => {
    expect(protectedName('')).toBe('Merged document — protected.pdf');
  });
});

describe('splitPath', () => {
  it.each([
    ['C:\\a\\b.pdf', 'C:\\a', 'b.pdf'],
    ['C:\\b.pdf', 'C:\\', 'b.pdf'],
    ['\\\\server\\share\\x.pdf', '\\\\server\\share', 'x.pdf'],
    ['\\\\server\\share\\d\\x.pdf', '\\\\server\\share\\d', 'x.pdf'],
    ['/a.pdf', '/', 'a.pdf'],
    ['/home/u/a.pdf', '/home/u', 'a.pdf'],
    ['a.pdf', '', 'a.pdf'],
    ['', '', ''],
  ])('%j', (path, folder, name) => {
    expect(splitPath(path)).toEqual({folder, name});
  });
});

describe('exportTitle', () => {
  const files = [
    {id: 'a', name: 'One.pdf', pages: 1, size: 1},
    {id: 'b', name: 'Two.PDF', pages: 1, size: 1}
  ];
  const settings = {name: 'Out.pdf', rangeMode: 'all' as const, customRange: '', useFileNamesAsTitle: false};
  it('uses the output name without .pdf', () => expect(exportTitle(files, settings)).toBe('Out'));
  it('joins source names when enabled', () =>
    expect(exportTitle(files, {...settings, useFileNamesAsTitle: true})).toBe('One · Two'));
});
