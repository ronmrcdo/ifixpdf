import {type Rect, viewportBox} from '../domain/markup';
import {putBytes} from './bytes';
import type {Progress} from './export-core';
import {acquire, release, retain} from './registry';
import {fitShrink} from './render';

export type RasterImage = {index: number; jpeg: Uint8Array};

const SCALE = 200 / 72;
let seq = 0;

/** A page (0-based) to render and the redaction rects (its PDF user space) to paint black on it. */
export type RasterPage = {index: number; rects: readonly Rect[]};

/** Renders pages of `bytes` to JPEG, one awaited page at a time so no task runs long. */
export async function rasterizePages(
  bytes: Uint8Array,
  pages: readonly RasterPage[],
  onProgress?: Progress,
): Promise<RasterImage[]> {
  const id = `export-raster-${seq++}`;
  putBytes(id, bytes);
  retain(id, 'export');
  try {
    const {AnnotationMode} = await import('pdfjs-dist');
    const doc = await acquire(id);
    const images: RasterImage[] = [];
    for (const [n, {index, rects}] of pages.entries()) {
      const page = await doc.getPage(index + 1);
      const base = page.getViewport({scale: SCALE, rotation: page.rotate});
      const scale = SCALE * fitShrink(base.width, base.height);
      const viewport = page.getViewport({scale, rotation: page.rotate});
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const canvasContext = canvas.getContext('2d');
      if (!canvasContext) throw new Error('Canvas 2D context unavailable');
      // Annotations keep the page's form values and comments; they paint over the content's black
      // boxes, so the boxes are painted again on top of everything.
      await page.render({canvasContext, viewport, annotationMode: AnnotationMode.ENABLE}).promise;
      canvasContext.fillStyle = '#000';
      for (const r of rects) {
        const b = viewportBox(viewport, [r.x, r.y, r.x + r.w, r.y + r.h]);
        canvasContext.fillRect(b.left, b.top, b.width, b.height);
      }
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
      if (!blob) throw new Error('Could not encode a redacted page.');
      images.push({index, jpeg: new Uint8Array(await blob.arrayBuffer())});
      canvas.width = 0; // free the backing store now, not at GC
      page.cleanup();
      onProgress?.(n + 1, pages.length);
    }
    return images;
  } finally {
    await release(id, 'export');
  }
}
