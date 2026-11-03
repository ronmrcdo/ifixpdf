import {type PDFDocument, type PDFFont, type PDFPage, StandardFonts, degrees, rgb} from 'pdf-lib';
import type {Markup, Rect} from '../domain/markup';
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

// Unrotated-space corner that shows top-left when the page is displayed at `angle`.
const TOP_LEFT: Record<Rotation, (r: Rect) => [number, number]> = {
  0: (r) => [r.x, r.y + r.h],
  90: (r) => [r.x, r.y],
  180: (r) => [r.x + r.w, r.y],
  270: (r) => [r.x + r.w, r.y + r.h],
};

// Display-space frame of the rect: top-left origin, "down" unit vector, display size.
function frame(rect: Rect, angle: Rotation) {
  const rad = (angle * Math.PI) / 180;
  const down: [number, number] = [Math.round(Math.sin(rad)), -Math.round(Math.cos(rad))];
  const [w, h] = angle % 180 ? [rect.h, rect.w] : [rect.w, rect.h];
  return {origin: TOP_LEFT[angle](rect), down, w, h};
}

const MARK_PATHS = {
  cross: (w: number, h: number) => `M0 0 L${w} ${h} M${w} 0 L0 ${h}`,
  check: (w: number, h: number) => `M0 ${h * 0.55} L${w * 0.4} ${h} L${w} 0`,
};

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
          borderWidth: Math.max(1, Math.min(w, h) / 8),
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
