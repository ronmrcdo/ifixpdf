import {formatRanges} from './ranges';
import type {ExportSettings, SourceFile} from './types';

const base = (name: string): string => name.trim().replace(/\.pdf$/i, '').trim() || 'Merged document';

export const outputName = (name: string): string => `${base(name)}.pdf`;
export const protectedName = (name: string): string => `${base(name)} — protected.pdf`;
export const splitZipName = (name: string): string => `${base(name)} — split.zip`;
export const splitPartName = (name: string, i: number): string => `${base(name)} — part ${i}.pdf`;
export const extractName = (name: string, indices: number[]): string =>
  `${base(name)} – pages ${formatRanges(indices)}.pdf`;

// Folder keeps the root separator for `C:\` and `/`; a bare name has folder ''.
export function splitPath(path: string): {folder: string; name: string} {
  const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  if (i < 0) return {name: path, folder: ''};
  const isRoot = i === 0 || path[i - 1] === ':';
  return {name: path.slice(i + 1), folder: isRoot ? path.slice(0, i + 1) : path.slice(0, i)};
}

export const exportTitle = (files: SourceFile[], settings: ExportSettings): string =>
  settings.useFileNamesAsTitle ? files.map((f) => base(f.name)).join(' · ') : base(settings.name);
