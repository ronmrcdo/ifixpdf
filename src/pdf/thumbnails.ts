import type {Rotation} from '../domain/types';
import {renderPage} from './render';
import {cached} from './thumbnail-cache';

export {releaseFile} from './thumbnail-cache';

/** Renders one page to a PNG Blob (no object URL, so callers can store it). */
export async function renderBlob(
  fileId: string,
  local: number,
  rotation: Rotation,
  scale: number,
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  await renderPage(canvas, fileId, local, rotation, scale);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Thumbnail encoding failed');
  return blob;
}

declare global {
  interface Window {
    __thumbRenders?: number;
  } // dev-only perf hook (tests/e2e/perf.spec.ts)
}

const build = async (
  fileId: string,
  local: number,
  rotation: Rotation,
  scale: number,
): Promise<string> => {
  if (import.meta.env.DEV) window.__thumbRenders = (window.__thumbRenders ?? 0) + 1;
  return URL.createObjectURL(await renderBlob(fileId, local, rotation, scale));
};

export function thumbnail(
  fileId: string,
  local: number,
  rotation: Rotation,
  scale: 0.18 | 0.42,
): Promise<string> {
  return cached(fileId, `${fileId}:${local}:${rotation}:${scale}`, () =>
    build(fileId, local, rotation, scale),
  );
}
