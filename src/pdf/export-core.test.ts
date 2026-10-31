import {describe, expect, it, vi} from 'vitest';
import {PDFDocument, degrees} from 'pdf-lib';
import {unzipSync, strFromU8} from 'fflate';
import {buildPdf, protectPdf, splitZip, type ExportSpec} from './export-core';

async function source(widths: number[], rotate0 = 0): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  widths.forEach((w, i) => {
    const p = doc.addPage([w, 100]);
    if (i === 0 && rotate0) p.setRotation(degrees(rotate0));
  });
  return doc.save();
}

async function spec(): Promise<ExportSpec> {
  return {
    title: 'My title',
    sources: {A: await source([101, 102]), B: await source([201])},
    pages: [
      {fileId: 'B', local: 0, rotation: 0},
      {fileId: 'A', local: 1, rotation: 90},
      {fileId: 'A', local: 0, rotation: 270}
    ]
  };
}

describe('export-core', () => {
  it('builds pages in order with summed rotation, metadata and progress', async () => {
    const s = await spec();
    // A page 2 (index 1) gets intrinsic /Rotate 90
    s.sources.A = await (async () => {
      const doc = await PDFDocument.load(s.sources.A!);
      doc.getPage(1).setRotation(degrees(90));
      return doc.save();
    })();
    const onProgress = vi.fn();
    const out = await PDFDocument.load(await buildPdf(s, onProgress));
    expect(out.getPages().map((p) => p.getWidth())).toEqual([201, 102, 101]);
    expect(out.getPages().map((p) => p.getRotation().angle)).toEqual([0, 180, 270]);
    expect(out.getTitle()).toBe('My title');
    expect(out.getCreator()).toBe('iFixPDF PDF workspace');
    expect(onProgress).toHaveBeenLastCalledWith(3, 3);
  });

  it('wraps rotation past 360', async () => {
    const src = await source([100], 90);
    const out = await PDFDocument.load(await buildPdf({title: 't', sources: {a: src}, pages: [{fileId: 'a', local: 0, rotation: 270}]}));
    expect(out.getPage(0).getRotation().angle).toBe(0);
  });

  it('protects with AES-256: the right password opens it in pdf.js, a wrong or missing one is refused', async () => {
    const out = await protectPdf(await source([100, 200]), 'password1');
    const text = strFromU8(out, true);
    expect(text).toContain('/Encrypt');
    expect(text).toContain('/AESV3');
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const open = (password?: string) => pdfjs.getDocument({data: out.slice(), password, isEvalSupported: false}).promise;
    const doc = await open('password1');
    expect(doc.numPages).toBe(2);
    await doc.destroy();
    await expect(open('wrong-pass')).rejects.toMatchObject({name: 'PasswordException'});
    await expect(open()).rejects.toMatchObject({name: 'PasswordException'});
  });

  it('splits into a zip of named parts', async () => {
    const files = unzipSync(await splitZip(await spec(), [[0, 1], [2]], 'Doc.pdf'));
    expect(Object.keys(files)).toEqual(['Doc — part 1.pdf', 'Doc — part 2.pdf']);
    const counts = await Promise.all(Object.values(files).map(async (b) => (await PDFDocument.load(b)).getPageCount()));
    expect(counts).toEqual([2, 1]);
  });

  it('rejects a page whose source is missing', async () => {
    await expect(buildPdf({title: 't', sources: {}, pages: [{fileId: 'X', local: 0, rotation: 0}]})).rejects.toThrow();
  });
});
