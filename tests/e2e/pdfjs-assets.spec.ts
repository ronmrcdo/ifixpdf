// PDF.js reads CMaps and standard fonts from the app's own bundle, never the network.
import type {Page} from '@playwright/test';
import {PDFDocument, PDFHexString, PDFName, PDFString, StandardFonts} from 'pdf-lib';
import {expect, test} from './fixtures';

const asFile = async (name: string, doc: PDFDocument) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.from(await doc.save()),
});

/** A non-embedded symbol font: pdf.js must load FoxitDingbats.pfb to draw it. */
async function dingbatsPdf() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.ZapfDingbats);
  doc.addPage([300, 200]).drawText('✓', {x: 40, y: 100, size: 40, font});
  return asFile('Dingbats.pdf', doc);
}

/** A non-embedded Japanese font with a predefined CMap: pdf.js must load UniJIS-UCS2-H.bcmap. */
async function cmapPdf() {
  const doc = await PDFDocument.create();
  const ctx = doc.context;
  const descriptor = ctx.register(
    ctx.obj({
      Type: 'FontDescriptor',
      FontName: 'KozMinPr6N-Regular',
      Flags: 4,
      FontBBox: [0, -120, 1000, 880],
      ItalicAngle: 0,
      Ascent: 880,
      Descent: -120,
      CapHeight: 700,
      StemV: 80,
    }),
  );
  const cidFont = ctx.register(
    ctx.obj({
      Type: 'Font',
      Subtype: 'CIDFontType0',
      BaseFont: 'KozMinPr6N-Regular',
      CIDSystemInfo: {
        Registry: PDFString.of('Adobe'),
        Ordering: PDFString.of('Japan1'),
        Supplement: 6,
      },
      FontDescriptor: descriptor,
    }),
  );
  const font = ctx.register(
    ctx.obj({
      Type: 'Font',
      Subtype: 'Type0',
      BaseFont: 'KozMinPr6N-Regular',
      Encoding: 'UniJIS-UCS2-H',
      DescendantFonts: [cidFont],
    }),
  );
  const page = doc.addPage([300, 200]);
  page.node.setFontDictionary(PDFName.of('F1'), font);
  const {beginText, endText, setFontAndSize, moveText, showText} = await import('pdf-lib');
  page.pushOperators(
    beginText(),
    setFontAndSize('F1', 32),
    moveText(40, 100),
    showText(PDFHexString.of('3042')),
    endText(),
  );
  return asFile('Japanese.pdf', doc);
}

/** Collects every request for a pdf.js asset, from the page or its workers. */
function assetRequests(page: Page) {
  const seen: {url: string; status: number}[] = [];
  page.context().on('requestfinished', async (r) => {
    if (r.url().includes('/pdfjs/'))
      seen.push({url: r.url(), status: (await r.response())?.status() ?? 0});
  });
  page.context().on('requestfailed', (r) => {
    if (r.url().includes('/pdfjs/')) seen.push({url: r.url(), status: 0});
  });
  return seen;
}

test('a non-embedded symbol font loads its standard font file from the bundle', async ({
  app,
  page,
}) => {
  const seen = assetRequests(page);
  await app.goto('view=home');
  await app.openPdf(await dingbatsPdf());
  await expect(page.locator('canvas.paper')).toBeVisible();
  await expect
    .poll(() => seen)
    .toContainEqual({
      url: expect.stringMatching(/\/pdfjs\/standard_fonts\/FoxitDingbats\.pfb$/),
      status: 200,
    });
});

test('a predefined CJK encoding loads its CMap from the bundle', async ({app, page}) => {
  const seen = assetRequests(page);
  await app.goto('view=home');
  await app.openPdf(await cmapPdf());
  await expect(page.locator('canvas.paper')).toBeVisible();
  await expect
    .poll(() => seen)
    .toContainEqual({
      url: expect.stringMatching(/\/pdfjs\/cmaps\/UniJIS-UCS2-H\.bcmap$/),
      status: 200,
    });
});
