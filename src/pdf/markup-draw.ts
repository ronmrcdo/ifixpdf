import {
  PDFCheckBox,
  PDFDropdown,
  PDFOptionList,
  type PDFDocument,
  type PDFFont,
  type PDFPage,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
  degrees,
  rgb,
} from 'pdf-lib';
import {
  axes,
  type FieldValue,
  MARK_PATHS,
  type Markup,
  markStroke,
  type Rect,
  topLeft,
} from '../domain/markup';
import type {Rotation} from '../domain/types';

const BLACK = rgb(0, 0, 0);
const fonts = new WeakMap<PDFDocument, Promise<PDFFont>>();

function helvetica(doc: PDFDocument): Promise<PDFFont> {
  let font = fonts.get(doc);
  if (!font) {
    font = doc.embedFont(StandardFonts.Helvetica);
    fonts.set(doc, font);
  }
  return font;
}

// Display-space frame of the rect: top-left origin, "down" unit vector, display size.
function frame(rect: Rect, angle: Rotation) {
  const [w, h] = angle % 180 ? [rect.h, rect.w] : [rect.w, rect.h];
  return {origin: topLeft(rect, angle), down: axes(angle).down, w, h};
}

export async function drawMarkup(
  page: PDFPage,
  items: readonly Markup[],
  doc: PDFDocument,
): Promise<void> {
  for (const m of items) {
    const {origin, down, w, h} = frame(m.rect, m.angle);
    const rotate = degrees(m.angle);
    const at = (dy: number) => ({x: origin[0] + down[0] * dy, y: origin[1] + down[1] * dy});
    switch (m.kind) {
      case 'text':
        page.drawText(m.text, {
          ...at(m.size),
          font: await helvetica(doc),
          size: m.size,
          lineHeight: m.size * 1.2,
          color: BLACK,
          rotate,
        });
        break;
      case 'cross':
      case 'check':
        page.drawSvgPath(MARK_PATHS[m.kind](w, h), {
          x: origin[0],
          y: origin[1],
          rotate,
          borderColor: BLACK,
          borderWidth: markStroke(w, h),
        });
        break;
      case 'dot':
        page.drawEllipse({
          x: m.rect.x + m.rect.w / 2,
          y: m.rect.y + m.rect.h / 2,
          xScale: m.rect.w / 2,
          yScale: m.rect.h / 2,
          color: BLACK,
        });
        break;
      case 'signature':
        page.drawImage(await doc.embedPng(m.image), {...at(h), width: w, height: h, rotate});
        break;
      case 'redact':
        page.drawRectangle({...m.rect, width: m.rect.w, height: m.rect.h, color: BLACK});
        break;
    }
  }
}

// Fills what it can, then flattens. A bad value (unknown field, wrong type, missing option,
// non-WinAnsi text) skips only that value.
export function applyFills(doc: PDFDocument, values: Readonly<Record<string, FieldValue>>): void {
  const form = doc.getForm();
  const font = form.getDefaultFont();
  for (const [name, value] of Object.entries(values)) {
    const field = form.getFieldMaybe(name);
    try {
      // flatten() redraws dirty fields in Helvetica and throws on anything it can't encode.
      if (typeof value === 'string') {
        const multiline = field instanceof PDFTextField && field.isMultiline();
        // multiline layout splits lines before encoding, so newlines are fine there
        for (const line of multiline ? value.split(/\r\n|\r|\n/) : [value]) font.encodeText(line);
      }
      if (field instanceof PDFTextField && typeof value === 'string') field.setText(value);
      else if (field instanceof PDFCheckBox && typeof value === 'boolean') {
        if (value) field.check();
        else field.uncheck();
      } else if (field instanceof PDFRadioGroup && typeof value === 'string') {
        // The value is a widget's appearance state (pdf.js buttonValue); with /Opt, the option
        // at that widget's position is what select() takes. Without /Opt the two lists match.
        const states = field.acroField.getOnValues().map((v) => v.decodeText());
        const option = field.getOptions()[states.indexOf(value)];
        if (option !== undefined) field.select(option);
      } else if (
        (field instanceof PDFDropdown || field instanceof PDFOptionList) &&
        typeof value === 'string'
      ) {
        // The value is an /Opt export value (pdf.js exportValue); select() takes the display text.
        const i = field.acroField.getOptions().findIndex((o) => o.value.decodeText() === value);
        const option = field.getOptions()[i];
        if (option !== undefined) field.select(option);
      }
    } catch {
      // skip this value
    }
  }
  form.flatten();
}
