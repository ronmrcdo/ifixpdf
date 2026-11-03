import {PDFDocument, PDFName, PDFRawStream} from 'pdf-lib';
import {unzlibSync, strFromU8} from 'fflate';

export async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return doc.save();
}

export async function makeFormPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 300]);
  const form = doc.getForm();
  form.createTextField('name').addToPage(page, {x: 20, y: 250, width: 150, height: 20});
  form.createCheckBox('agree').addToPage(page, {x: 20, y: 220, width: 15, height: 15});
  const pay = form.createRadioGroup('pay');
  pay.addOptionToPage('net30', page, {x: 20, y: 190, width: 15, height: 15});
  pay.addOptionToPage('net60', page, {x: 60, y: 190, width: 15, height: 15});
  const city = form.createDropdown('city');
  city.addOptions(['Paris', 'Rome']);
  city.addToPage(page, {x: 20, y: 150, width: 100, height: 20});
  return doc.save();
}

// 2x2 black JPEG (Pillow, quality 50).
export const TINY_JPEG = Uint8Array.from(
  atob(
    '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDz+iiigD//2Q==',
  ),
  (c) => c.charCodeAt(0),
);

/**
 * Refs of every indirect object holding `secret` as Latin-1 text, hex (Helvetica `Tj`), or
 * UTF-16BE (hex or literal bytes, as pdf-lib writes some /V values), inflating Flate streams.
 */
export async function findSecret(bytes: Uint8Array, secret: string): Promise<string[]> {
  const doc = await PDFDocument.load(bytes);
  const hex = Array.from(secret, (c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  const hex16 = hex.replace(/../g, '00$&');
  const utf16 = secret.replace(/./g, '\0$&');
  const hit = (s: string) =>
    s.includes(secret) ||
    s.includes(utf16) ||
    [hex, hex16].some((h) => s.toLowerCase().includes(h));
  return doc.context.enumerateIndirectObjects().flatMap(([ref, obj]) => {
    let text = obj.toString();
    if (obj instanceof PDFRawStream) {
      const filter = obj.dict.lookup(PDFName.of('Filter'));
      const flate = filter?.toString().includes('/FlateDecode');
      text += strFromU8(flate ? unzlibSync(obj.contents) : obj.contents, true);
    }
    return hit(text) ? [ref.toString()] : [];
  });
}
