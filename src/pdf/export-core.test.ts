import {describe, expect, it, vi} from 'vitest';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFOperator,
  PDFOperatorNames,
  type PDFPage,
  PDFRef,
  PDFString,
  StandardFonts,
  degrees,
  drawObject,
  setGraphicsState,
} from 'pdf-lib';
import {unzipSync, strFromU8} from 'fflate';
import {buildPdf, protectPdf, replaceWithImages, splitZip, type ExportSpec} from './export-core';
import {applyFills, drawMarkup} from './markup-draw';
import {TINY_JPEG, findSecret, makeFormPdf, makePdf} from './fixtures';
import type {Markup} from '../domain/markup';

vi.mock('./markup-draw', async (actual) => {
  const mod = await actual<typeof import('./markup-draw')>();
  return {...mod, drawMarkup: vi.fn(mod.drawMarkup), applyFills: vi.fn(mod.applyFills)};
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

  describe('fills', () => {
    const fills = {name: 'Ann', agree: true, pay: 'net60', city: 'Rome'};
    const formSpec = async (f: ExportSpec['fills'], pages = 1): Promise<ExportSpec> => ({
      title: 't',
      sources: {F: await makeFormPdf(), G: await makeFormPdf()},
      pages: Array.from({length: pages}, () => ({fileId: 'F', local: 0, rotation: 0 as const})),
      fills: f,
    });

    it('flattens a filled form and draws the values', async () => {
      const out = await buildPdf(await formSpec({F: fills}));
      const strs = (await textItems(out))[0]!.map((i) => i.str);
      expect(strs).toContain('Ann');
      expect(strs).toContain('Rome');
    });

    const strsOf = async (b: Uint8Array) => (await textItems(b))[0]!.map((i) => i.str);

    it('leaves other files, empty fills and stale ids alone', async () => {
      const s = await formSpec({F: {}, Z: fills});
      s.pages.push({fileId: 'G', local: 0, rotation: 0});
      vi.mocked(applyFills).mockClear();
      const out = await buildPdf(s);
      expect(applyFills).not.toHaveBeenCalled();
      expect((await textItems(out)).flat()).toEqual([]);
      s.fills = {G: fills};
      const filled = await textItems(await buildPdf(s));
      expect(filled[0]).toEqual([]);
      expect(filled[1]!.map((i) => i.str)).toContain('Ann');
      expect(applyFills).toHaveBeenCalledTimes(1);
    });

    it('skips unknown fields, wrong types and missing options but still flattens', async () => {
      const out = await buildPdf(
        await formSpec({
          F: {missing: 'x', agree: 'yes', pay: 'net90', city: 'Oslo', name: true},
        }),
      );
      expect(await strsOf(out)).toEqual([]);
      const ok = await buildPdf(await formSpec({F: {missing: 'x', agree: 'yes', name: 'Ann'}}));
      expect(await strsOf(ok)).toContain('Ann');
    });

    it('skips text Helvetica cannot encode and flattens the rest', async () => {
      const out = await buildPdf(await formSpec({F: {name: '漢字', city: 'Rome', agree: true}}));
      const strs = await strsOf(out);
      expect(strs).toContain('Rome');
      expect(strs.join('')).not.toContain('漢');
    });

    it('keeps newlines in multiline fields and still skips unencodable text', async () => {
      const doc = await PDFDocument.load(await makeFormPdf());
      const notes = doc.getForm().createTextField('notes');
      notes.enableMultiline();
      notes.addToPage(doc.getPage(0), {x: 20, y: 100, width: 150, height: 40});
      const sources = {F: await doc.save()};
      const run = async (v: Record<string, string>) =>
        strsOf(await buildPdf({...(await formSpec({F: v})), sources}));
      expect(await run({notes: 'line one\nline two'})).toEqual(
        expect.arrayContaining(['line one', 'line two']),
      );
      expect((await run({notes: '漢字\nx', name: 'Ann'})).join('')).not.toContain('x');
    });

    it('flattens a source page used twice once', async () => {
      const out = await buildPdf(await formSpec({F: fills}, 2));
      const pages = await textItems(out);
      expect(pages.map((p) => p.some((i) => i.str === 'Ann'))).toEqual([true, true]);
    });

    it('flattens in Split too', async () => {
      const zip = unzipSync(await splitZip(await formSpec({F: fills}, 2), [[0], [1]], 'x'));
      const parts = Object.values(zip);
      expect(parts).toHaveLength(2);
      for (const part of parts) expect(await strsOf(part)).toContain('Ann');
    });

    it('takes the old path with no fills', async () => {
      vi.mocked(applyFills).mockClear();
      const out = await buildPdf(await formSpec({}));
      expect(applyFills).not.toHaveBeenCalled();
      expect(await strsOf(out)).toEqual([]);
    });

    it('does not throw on an untouched field already holding non-WinAnsi text', async () => {
      const doc = await PDFDocument.load(await makeFormPdf());
      doc.getForm().getTextField('name').acroField.setValue(PDFHexString.fromText('漢字'));
      const out = await buildPdf({
        ...(await formSpec({F: {city: 'Rome'}})),
        sources: {F: await doc.save()},
      });
      expect(await strsOf(out)).toContain('Rome');
    });
  });

  describe('replaceWithImages', () => {
    const SECRET = 'SECRET-4411';
    const redact: Markup = {id: 'r', kind: 'redact', rect: {x: 10, y: 10, w: 150, h: 40}, angle: 0};
    const jpeg = [{index: 0, jpeg: TINY_JPEG}];

    async function secretSource(rotate0 = 0): Promise<Uint8Array> {
      const doc = await PDFDocument.create();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const p0 = doc.addPage([300, 200]);
      p0.drawText(SECRET, {x: 20, y: 20, size: 12, font});
      if (rotate0) p0.setRotation(degrees(rotate0));
      doc.addPage([200, 100]).drawText('KEEP-1', {x: 20, y: 20, size: 12, font});
      return doc.save();
    }
    const pass1 = (src: Uint8Array) =>
      buildPdf({
        title: 'Kept title',
        sources: {a: src},
        pages: [
          {fileId: 'a', local: 0, rotation: 0, markup: [redact]},
          {fileId: 'a', local: 1, rotation: 0},
        ],
      });

    it('replaces the page with an image and leaves no trace of the secret', async () => {
      const first = await pass1(await secretSource());
      expect(await findSecret(first, SECRET)).not.toEqual([]); // positive control
      const out = await replaceWithImages(first, jpeg);
      const doc = await PDFDocument.load(out);
      expect(doc.getPageCount()).toBe(2);
      expect(doc.getPage(0).getSize()).toEqual({width: 300, height: 200});
      expect(doc.getPage(0).getRotation().angle).toBe(0);
      expect(doc.getTitle()).toBe('Kept title');
      expect(doc.getCreator()).toBe('iFixPDF PDF workspace');
      expect((await textItems(out)).map((p) => p.map((i) => i.str))).toEqual([[], ['KEEP-1']]);
      expect(await findSecret(out, SECRET)).toEqual([]);
    });

    it('swaps width and height for an intrinsic /Rotate 90 page', async () => {
      const first = await pass1(await secretSource(90));
      expect(await findSecret(first, SECRET)).not.toEqual([]);
      const out = await replaceWithImages(first, jpeg);
      const doc = await PDFDocument.load(out);
      expect(doc.getPage(0).getSize()).toEqual({width: 200, height: 300});
      expect(doc.getPage(0).getRotation().angle).toBe(0);
      expect(await findSecret(out, SECRET)).toEqual([]);
    });

    it('drops a shared resource only the redacted page draws', async () => {
      const helper = await PDFDocument.load(await secretSource());
      const doc = await PDFDocument.create();
      const [f0, f1] = await doc.embedPdf(helper, [0, 1]);
      const p0 = doc.addPage([300, 200]);
      const p1 = doc.addPage([300, 200]);
      const shared = doc.context.register(doc.context.obj({XObject: {X0: f0!.ref, X1: f1!.ref}}));
      p0.node.set(PDFName.of('Resources'), shared);
      p1.node.set(PDFName.of('Resources'), shared);
      p0.pushOperators(drawObject('X0'));
      p1.pushOperators(drawObject('X1'));
      const first = await pass1(await doc.save());
      expect(await findSecret(first, SECRET)).not.toEqual([]);
      const out = await replaceWithImages(first, jpeg);
      expect((await textItems(out))[1]!.map((i) => i.str)).toEqual(['KEEP-1']);
      expect(await findSecret(out, SECRET)).toEqual([]);
    });

    it('does not follow a link on a kept page back to the redacted page', async () => {
      const doc = await PDFDocument.load(await secretSource());
      const [p0, p1] = doc.getPages();
      const link = doc.context.obj({
        Type: 'Annot',
        Subtype: 'Link',
        Rect: [0, 0, 10, 10],
        Dest: [p0!.ref, PDFName.of('Fit')],
      });
      p1!.node.set(PDFName.of('Annots'), doc.context.obj([doc.context.register(link)]));
      const first = await pass1(await doc.save());
      expect(await findSecret(first, SECRET)).not.toEqual([]);
      const out = await replaceWithImages(first, jpeg);
      expect(await findSecret(out, SECRET)).toEqual([]);
      expect((await textItems(out))[1]!.map((i) => i.str)).toEqual(['KEEP-1']);
    });

    // Pass 1 then pass 2 on page 0, asserting the positive control on pass 1.
    async function leakCheck(src: Uint8Array) {
      const first = await pass1(src);
      expect(await findSecret(first, SECRET)).not.toEqual([]);
      const out = await replaceWithImages(first, jpeg);
      expect((await textItems(out))[1]!.map((i) => i.str)).toContain('KEEP-1');
      return findSecret(out, SECRET);
    }
    const comment = (doc: PDFDocument, extra: Record<string, unknown> = {}) =>
      doc.context.register(
        doc.context.obj({Type: 'Annot', Subtype: 'Text', Rect: [0, 0, 10, 10], ...extra}),
      );
    const annotate = (page: PDFPage, ...refs: PDFRef[]) =>
      page.node.set(PDFName.of('Annots'), page.doc.context.obj(refs));

    it('does not carry a sibling field of a hierarchical form from the redacted page', async () => {
      const doc = await PDFDocument.load(await secretSource());
      const [p0, p1] = doc.getPages();
      const form = doc.getForm();
      const ssn = form.createTextField('form1.ssn');
      ssn.setText(SECRET);
      ssn.addToPage(p0!, {x: 20, y: 100, width: 150, height: 20});
      form.createTextField('form1.name').addToPage(p1!, {x: 20, y: 50, width: 150, height: 20});
      expect(await leakCheck(await doc.save())).toEqual([]);
    });

    it('does not carry a comment from the redacted page through an /IRT reply', async () => {
      const doc = await PDFDocument.load(await secretSource());
      const [p0, p1] = doc.getPages();
      const note = comment(doc, {Contents: PDFString.of(SECRET)});
      annotate(p0!, note);
      annotate(p1!, comment(doc, {IRT: note, Contents: PDFString.of('reply')}));
      expect(await leakCheck(await doc.save())).toEqual([]);
    });

    it('does not carry a popup listed on the redacted page', async () => {
      const doc = await PDFDocument.load(await secretSource());
      const [p0, p1] = doc.getPages();
      const note = comment(doc, {Contents: PDFString.of(SECRET)});
      const popup = doc.context.register(
        doc.context.obj({Type: 'Annot', Subtype: 'Popup', Rect: [0, 0, 10, 10], Parent: note}),
      );
      annotate(p0!, note, popup);
      annotate(p1!, comment(doc, {Popup: popup}));
      expect(await leakCheck(await doc.save())).toEqual([]);
    });

    it('empties redacted-page objects reached through an unknown key', async () => {
      const doc = await PDFDocument.load(await secretSource());
      const [p0, p1] = doc.getPages();
      const note = comment(doc, {Contents: PDFString.of(SECRET)});
      annotate(p0!, note);
      annotate(p1!, comment(doc, {XVendorData: note}));
      expect(await leakCheck(await doc.save())).toEqual([]);
    });

    it('prunes the resources of a soft-mask group shared with the redacted page', async () => {
      const helper = await PDFDocument.load(await secretSource());
      const doc = await PDFDocument.create();
      const [f0] = await doc.embedPdf(helper, [0]);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const p0 = doc.addPage([300, 200]);
      const p1 = doc.addPage([300, 200]);
      const shared = doc.context.register(doc.context.obj({XObject: {X0: f0!.ref}}));
      p0.node.set(PDFName.of('Resources'), shared);
      p0.pushOperators(drawObject('X0'));
      const group = doc.context.register(
        doc.context.stream('', {
          Type: 'XObject',
          Subtype: 'Form',
          BBox: [0, 0, 300, 200],
          Resources: shared,
        }),
      );
      const gs = doc.context.obj({Type: 'ExtGState', SMask: {S: 'Luminosity', G: group}});
      p1.drawText('KEEP-1', {x: 20, y: 20, size: 12, font});
      p1.node.Resources()!.set(PDFName.of('ExtGState'), doc.context.obj({GS0: gs}));
      p1.pushOperators(setGraphicsState('GS0'));
      expect(await leakCheck(await doc.save())).toEqual([]);
    });

    // Page 0 draws the secret form X0 from `res0`; page 1 draws KEEP-1 and then `extra`.
    async function sharedSource(
      build: (doc: PDFDocument, x0: PDFRef, res0: PDFRef, p1: PDFPage) => void,
    ) {
      const helper = await PDFDocument.load(await secretSource());
      const doc = await PDFDocument.create();
      const [f0] = await doc.embedPdf(helper, [0]);
      const font = await doc.embedFont(StandardFonts.Helvetica);
      const p0 = doc.addPage([300, 200]);
      const p1 = doc.addPage([300, 200]);
      const res0 = doc.context.register(doc.context.obj({XObject: {X0: f0!.ref}}));
      p0.node.set(PDFName.of('Resources'), res0);
      p0.pushOperators(drawObject('X0'));
      p1.drawText('KEEP-1', {x: 20, y: 20, size: 12, font});
      build(doc, f0!.ref, res0, p1);
      return doc.save();
    }

    it('does not follow an unknown key on a kept ExtGState', async () => {
      const src = await sharedSource((doc, x0, _res0, p1) => {
        const gs = doc.context.obj({Type: 'ExtGState', CA: 1, XVendor: x0});
        p1.node.Resources()!.set(PDFName.of('ExtGState'), doc.context.obj({GS0: gs}));
        p1.pushOperators(setGraphicsState('GS0'));
      });
      expect(await leakCheck(src)).toEqual([]);
    });

    it('prunes the soft-mask group of a shading pattern shared with the redacted page', async () => {
      const src = await sharedSource((doc, _x0, res0, p1) => {
        const group = doc.context.register(
          doc.context.stream('', {
            Type: 'XObject',
            Subtype: 'Form',
            BBox: [0, 0, 300, 200],
            Resources: res0,
          }),
        );
        const pattern = doc.context.obj({
          PatternType: 2,
          Shading: {
            ShadingType: 2,
            ColorSpace: 'DeviceGray',
            Coords: [0, 0, 1, 0],
            Function: {FunctionType: 2, Domain: [0, 1], C0: [0], C1: [1], N: 1},
          },
          ExtGState: {SMask: {S: 'Luminosity', G: group}},
        });
        p1.node.Resources()!.set(PDFName.of('Pattern'), doc.context.obj({P0: pattern}));
        p1.pushOperators(
          PDFOperator.of(PDFOperatorNames.NonStrokingColorspace, [PDFName.of('Pattern')]),
          PDFOperator.of(PDFOperatorNames.NonStrokingColorN, [PDFName.of('P0')]),
        );
      });
      expect(await leakCheck(src)).toEqual([]);
    });

    // Page 1 adopts page 0's resource dict (with page 1's fonts added) and appends `raw` content.
    const sharing = (raw: string | string[], fontKey?: string) =>
      sharedSource((doc, _x0, res0, p1) => {
        const fonts = doc.context.lookup(p1.node.Resources()!.get(PDFName.of('Font')), PDFDict);
        const font = fontKey ? doc.context.obj({[fontKey]: fonts.values()[0]!}) : fonts;
        doc.context.lookup(res0, PDFDict).set(PDFName.of('Font'), font);
        p1.node.set(PDFName.of('Resources'), res0);
        const extra = [raw].flat().map((r) => doc.context.register(doc.context.stream(r)));
        const own = fontKey ? [] : p1.node.lookup(PDFName.of('Contents'), PDFArray).asArray();
        p1.node.set(PDFName.of('Contents'), doc.context.obj([...own, ...extra]));
      });

    it('ignores a marked-content tag named like a resource', async () => {
      expect(await leakCheck(await sharing('/X0 BMC EMC'))).toEqual([]);
    });

    it('ignores a resource name inside a string', async () => {
      const src = await sharing('/Span <</ActualText (see \\) /X0 Do)>> BDC EMC');
      expect(await leakCheck(src)).toEqual([]);
    });

    it('survives a stray closing paren in the content', async () => {
      expect(await leakCheck(await sharing(') /X0 BMC EMC'))).toEqual([]);
    });

    it('keeps a font named like a redacted-only XObject apart from it', async () => {
      const src = await sharing('BT /X0 12 Tf 20 20 Td <4B4545502D31> Tj ET', 'X0');
      expect(await leakCheck(src)).toEqual([]);
    });

    it('skips inline image data that looks like operators', async () => {
      const src = await sharing('q BI /W 8 /H 1 /BPC 8 /CS /G ID x /X0 Do\nEI Q');
      expect(await leakCheck(src)).toEqual([]);
    });

    it('ignores an operator inside an array operand', async () => {
      expect(await leakCheck(await sharing('[/X0 Do] TJ'))).toEqual([]);
    });

    it('ignores an operator inside a dict operand', async () => {
      expect(await leakCheck(await sharing('/Span <</A /X0 Do>> BDC EMC'))).toEqual([]);
    });

    it('does not let a stray > swallow the opening paren of a string', async () => {
      expect(await leakCheck(await sharing('>(/X0 Do) Tj'))).toEqual([]);
    });

    it('tokenizes the content streams joined, as renderers do', async () => {
      expect(await leakCheck(await sharing(['(open', '/X0 Do']))).toEqual([]);
    });

    it('skips inline image data that opens inside an array operand', async () => {
      const src = await sharing('[ BI /W 1 /H 1 /BPC 8 /CS /G ID ] /X0 Do\nEI ]');
      expect(await leakCheck(src)).toEqual([]);
    });

    it('ignores a font name inside an array or dict operand of Tf', async () => {
      const src = await sharing('[/X0] Tf <</A /X0>> Tf', 'X0');
      const out = await replaceWithImages(await pass1(src), jpeg);
      const doc = await PDFDocument.load(out);
      const fonts = doc.getPage(1).node.Resources()!.lookup(PDFName.of('Font'), PDFDict);
      expect(fonts.keys()).toEqual([]);
    });

    it('stays nested after a closer that does not match its opener', async () => {
      expect(await leakCheck(await sharing('[ <</A ]>> /X0 Do ]'))).toEqual([]);
    });

    it.each([
      '(abc',
      '<abc',
      '<<',
      'BI /W 1 ID xxxx',
      '(abc\\',
      '',
      '%x',
      '/',
      ')))>>>]]}',
      '<</A',
      'BI ID',
      ']]>>>>',
    ])('terminates on truncated or unbalanced content %j', async (raw) => {
      expect(await leakCheck(await sharing(raw))).toEqual([]);
    });

    it('treats a broken /Resources on a kept page as none', async () => {
      const doc = await PDFDocument.load(await secretSource());
      doc.getPage(1).node.set(PDFName.of('Resources'), PDFRef.of(9999));
      const out = await replaceWithImages(await pass1(await doc.save()), jpeg);
      expect(await findSecret(out, SECRET)).toEqual([]);
    });

    it('keeps the secret on an unredacted duplicate of the page', async () => {
      const src = await secretSource();
      const first = await buildPdf({
        title: 't',
        sources: {a: src},
        pages: [
          {fileId: 'a', local: 0, rotation: 0, markup: [redact]},
          {fileId: 'a', local: 0, rotation: 0},
        ],
      });
      const out = await replaceWithImages(first, jpeg);
      expect((await textItems(out)).map((p) => p.map((i) => i.str))).toEqual([[], [SECRET]]);
    });
  });
});
