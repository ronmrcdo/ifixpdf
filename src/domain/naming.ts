import {formatRanges} from './ranges';
import type {ExportSettings, SourceFile} from './types';

const base = (name: string): string =>
  name
    .trim()
    .replace(/\.pdf$/i, '')
    .trim() || 'Merged document';

// Windows-reserved and control characters; names reach the save dialog and ZIP entries.
// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are the point
const fileBase = (name: string): string => base(name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');

export const outputName = (name: string): string => `${fileBase(name)}.pdf`;
export const editedName = (name: string): string => `${fileBase(name)} (edited).pdf`;
export const protectedName = (name: string): string => `${fileBase(name)} — protected.pdf`;
export const splitZipName = (name: string): string => `${fileBase(name)} — split.zip`;
export const splitPartName = (name: string, i: number): string =>
  `${fileBase(name)} — part ${i}.pdf`;
export const extractName = (name: string, indices: number[]): string =>
  `${fileBase(name)} – pages ${formatRanges(indices)}.pdf`;

// Folder keeps the root separator for `C:\` and `/`; a bare name has folder ''.
export function splitPath(path: string): {folder: string; name: string} {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (i < 0) return {name: path, folder: ''};
  const isRoot = i === 0 || path[i - 1] === ':';
  return {name: path.slice(i + 1), folder: isRoot ? path.slice(0, i + 1) : path.slice(0, i)};
}

export const exportTitle = (files: SourceFile[], settings: ExportSettings): string =>
  settings.useFileNamesAsTitle ? files.map((f) => base(f.name)).join(' · ') : base(settings.name);
