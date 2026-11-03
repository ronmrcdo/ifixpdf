import {describe, expect, it, vi} from 'vitest';
import {PDFDict, PDFDocument, PDFName, degrees} from 'pdf-lib';
import {unzipSync, strFromU8} from 'fflate';
import {buildPdf, protectPdf, splitZip, type ExportSpec} from './export-core';
import {drawMarkup} from './markup-draw';
import {makePdf} from './fixtures';
import type {Markup} from '../domain/markup';

vi.mock('./markup-draw', async (actual) => {
  const mod = await actual<typeof import('./markup-draw')>();
  return {...mod, drawMarkup: vi.fn(mod.drawMarkup)};
});

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const hello = (angle: Markup['angle'] = 0): Markup => ({
  id: 't1',
  kind: 'text',
  text: 'Hello',
  size: 12,
  rect: {x: 50, y: 40, w: 100, h: 20}, // pdf.js drops text outside the page box
  angle,
});

async function textItems(bytes: Uint8Array) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/`,
  }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const {items} = await page.getTextContent();
    const vt = page.getViewport({scale: 1, rotation: page.rotate}).transform;
    pages.push(
      items.flatMap((it) =>
        'str' in it && it.str ? [{str: it.str, m: pdfjs.Util.transform(vt, it.transform)}] : [],
      ),
    );
  }
  await doc.destroy();
  return pages;
}

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
      {fileId: 'A', local: 0, rotation: 270},
    ],
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
    const out = await PDFDocument.load(
      await buildPdf({
        title: 't',
        sources: {a: src},
        pages: [{fileId: 'a', local: 0, rotation: 270}],
      }),
    );
    expect(out.getPage(0).getRotation().angle).toBe(0);
  });

  it('protects with AES-256: the right password opens it in pdf.js, a wrong or missing one is refused', async () => {
    const out = await protectPdf(await source([100, 200]), 'password1');
    const text = strFromU8(out, true);
    expect(text).toContain('/Encrypt');
    expect(text).toContain('/AESV3');
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const open = (password?: string) =>
      pdfjs.getDocument({data: out.slice(), password, isEvalSupported: false}).promise;
    const doc = await open('password1');
    expect(doc.numPages).toBe(2);
    await doc.destroy();
    await expect(open('wrong-pass')).rejects.toMatchObject({name: 'PasswordException'});
    await expect(open()).rejects.toMatchObject({name: 'PasswordException'});
  });

  it('splits into a zip of named parts', async () => {
    const files = unzipSync(await splitZip(await spec(), [[0, 1], [2]], 'Doc.pdf'));
    expect(Object.keys(files)).toEqual(['Doc — part 1.pdf', 'Doc — part 2.pdf']);
    const counts = await Promise.all(
      Object.values(files).map(async (b) => (await PDFDocument.load(b)).getPageCount()),
    );
    expect(counts).toEqual([2, 1]);
  });

  it('shares resources between pages instead of copying them per page', async () => {
    const doc = await PDFDocument.create();
    const big = Uint8Array.from({length: 200_000}, (_, i) => (i * 7919) % 251);
    const ref = doc.context.register(doc.context.stream(big));
    for (let i = 0; i < 20; i++) doc.addPage([100, 100]).node.setXObject(PDFName.of('X'), ref);
    const src = await doc.save();
    const pages = Array.from({length: 20}, (_, local) => ({
      fileId: 'a',
      local,
      rotation: 0 as const,
    }));
    const out = await buildPdf({title: 't', sources: {a: src}, pages});
    expect(out.byteLength).toBeLessThan(src.byteLength * 1.5);
  });

  it('gives a page used twice its own rotation', async () => {
    const out = await PDFDocument.load(
      await buildPdf({
        title: 't',
        sources: {a: await source([100])},
        pages: [
          {fileId: 'a', local: 0, rotation: 0},
          {fileId: 'a', local: 0, rotation: 90},
        ],
      }),
    );
    expect(out.getPageCount()).toBe(2);
    expect(out.getPages().map((p) => p.getRotation().angle)).toEqual([0, 90]);
  });

  it('split parses each source once', async () => {
    const src = await source([100, 101, 102, 103, 104]);
    const pages = [0, 1, 2, 3, 4].map((local) => ({fileId: 'a', local, rotation: 0 as const}));
    const load = vi.spyOn(PDFDocument, 'load');
    try {
      await splitZip({title: 't', sources: {a: src}, pages}, [[0], [1], [2], [3], [4]], 'D.pdf');
      expect(load).toHaveBeenCalledTimes(1);
    } finally {
      load.mockRestore();
    }
  });

  it('rejects a page whose source is missing', async () => {
    await expect(
      buildPdf({title: 't', sources: {}, pages: [{fileId: 'X', local: 0, rotation: 0}]}),
    ).rejects.toThrow();
  });

  it('draws a text item on its page only', async () => {
    const out = await buildPdf({
      title: 't',
      sources: {a: await makePdf(2)},
      pages: [
        {fileId: 'a', local: 0, rotation: 0, markup: [hello()]},
        {fileId: 'a', local: 1, rotation: 0},
      ],
    });
    const pages = await textItems(out);
    expect(pages.map((p) => p.map((i) => i.str))).toEqual([['Hello'], []]);
  });

  it('draws text upright at the final rotation (intrinsic 90 + user 90, placed at 180)', async () => {
    const out = await buildPdf({
      title: 't',
      sources: {a: await source([200], 90)},
      pages: [{fileId: 'a', local: 0, rotation: 90, markup: [hello(180)]}],
    });
    const [item] = (await textItems(out))[0]!;
    const [a, b] = item!.m;
    expect(Math.abs(b!)).toBeLessThan(1e-6);
    expect(a).toBeGreaterThan(0);
  });

  it('draws markup on each copy of a duplicated page', async () => {
    const out = await buildPdf({
      title: 't',
      sources: {a: await makePdf(1)},
      pages: [
        {fileId: 'a', local: 0, rotation: 0, markup: [hello()]},
        {fileId: 'a', local: 0, rotation: 0, markup: [hello()]},
      ],
    });
    const pages = await textItems(out);
    expect(pages.map((p) => p.map((i) => i.str))).toEqual([['Hello'], ['Hello']]);
  });

  it('draws marks, a signature and a redaction at every angle', async () => {
    const rect = {x: 20, y: 20, w: 60, h: 30};
    const kinds = ['cross', 'check', 'dot', 'redact'] as const;
    const markup = ([0, 90, 180, 270] as const).flatMap((angle): Markup[] => [
      ...kinds.map((kind) => ({id: kind, kind, rect, angle})),
      {id: 's', kind: 'signature', image: PNG, rect, angle},
    ]);
    const out = await PDFDocument.load(
      await buildPdf({
        title: 't',
        sources: {a: await makePdf(1)},
        pages: [{fileId: 'a', local: 0, rotation: 0, markup}],
      }),
    );
    const xobjects = out.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
    expect(xobjects?.keys()).toHaveLength(4);
  });

  it('takes the old path when there is no markup', async () => {
    vi.mocked(drawMarkup).mockClear();
    await buildPdf(await spec());
    expect(drawMarkup).not.toHaveBeenCalled();
  });
});
