import {PDFDocument} from 'pdf-lib';
import * as pdfLib from 'pdf-lib';
import {configure, lock} from 'pdf-lib-encrypt';
import {protectPdf} from './export-core';
import {makePdf} from './fixtures';
import {InvalidPdfError, loadPdf} from './load';

const counted = vi.hoisted(() => vi.fn());
vi.mock('./export', async (orig) => {
  const mod = await orig<typeof import('./export')>();
  return {
    ...mod,
    countPages: (bytes: Uint8Array) => {
      counted(bytes);
      return mod.countPages(bytes);
    },
  };
});

describe('loadPdf', () => {
  it('returns the page count', async () => {
    expect(await loadPdf('a.pdf', await makePdf(3))).toEqual({pages: 3});
  });
  it('rejects empty bytes', async () => {
    await expect(loadPdf('a.pdf', new Uint8Array())).rejects.toBeInstanceOf(InvalidPdfError);
  });
  it('rejects garbage', async () => {
    await expect(loadPdf('a.pdf', new TextEncoder().encode('not a pdf'))).rejects.toBeInstanceOf(
      InvalidPdfError,
    );
  });
  it('rejects an encrypted pdf', async () => {
    configure(pdfLib);
    const locked = await lock(await makePdf(1), 'password1', {algo: 'aes256'});
    await expect(loadPdf('a.pdf', locked)).rejects.toBeInstanceOf(InvalidPdfError);
  });
  it('rejects an encrypted PDF through the count path', async () => {
    counted.mockClear();
    const locked = await protectPdf(await makePdf(1), 'password1');
    await expect(loadPdf('a.pdf', locked)).rejects.toBeInstanceOf(InvalidPdfError);
    expect(counted).toHaveBeenCalledOnce();
  });
  it('rejects a pdf with 0 pages', async () => {
    const doc = await PDFDocument.create();
    await expect(loadPdf('a.pdf', await doc.save({addDefaultPage: false}))).rejects.toBeInstanceOf(
      InvalidPdfError,
    );
  });
});
