import {putBytes} from './bytes';
import type {Progress} from './export-core';
import {acquire, release, retain} from './registry';
import {fitShrink} from './render';

export type RasterImage = {index: number; jpeg: Uint8Array};

const SCALE = 200 / 72;
let seq = 0;

/** Renders pages (0-based) of `bytes` to JPEG, one awaited page at a time so no task runs long. */
export async function rasterizePages(
  bytes: Uint8Array,
  indices: number[],
  onProgress?: Progress,
): Promise<RasterImage[]> {
  const id = `export-raster-${seq++}`;
  putBytes(id, bytes);
  retain(id, 'export');
  try {
    const {AnnotationMode} = await import('pdfjs-dist');
    const doc = await acquire(id);
    const images: RasterImage[] = [];
    for (const [n, index] of indices.entries()) {
      const page = await doc.getPage(index + 1);
      const base = page.getViewport({scale: SCALE, rotation: page.rotate});
      const scale = SCALE * fitShrink(base.width, base.height);
      const viewport = page.getViewport({scale, rotation: page.rotate});
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const canvasContext = canvas.getContext('2d');
      if (!canvasContext) throw new Error('Canvas 2D context unavailable');
      // Annotations paint over the page content, so they could cover the black boxes.
      await page.render({canvasContext, viewport, annotationMode: AnnotationMode.DISABLE}).promise;
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
      if (!blob) throw new Error('Could not encode a redacted page.');
      images.push({index, jpeg: new Uint8Array(await blob.arrayBuffer())});
      canvas.width = 0; // free the backing store now, not at GC
      page.cleanup();
      onProgress?.(n + 1, indices.length);
    }
    return images;
  } finally {
    await release(id, 'export');
  }
}
