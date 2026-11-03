import {PDFDocument} from 'pdf-lib';

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
