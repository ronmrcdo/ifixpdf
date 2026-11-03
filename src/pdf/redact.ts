import {
  PDFArray,
  type PDFContext,
  PDFDict,
  PDFDocument,
  PDFName,
  type PDFObject,
  type PDFPage,
  PDFPageLeaf,
  PDFRawStream,
  PDFRef,
  PDFStream,
  decodePDFRawStream,
} from 'pdf-lib';
import {strFromU8} from 'fflate';
import {displaySize} from '../domain/markup';

const RESOURCES = PDFName.of('Resources');
const PARENT = PDFName.of('Parent');
const decodeName = (n: string): string =>
  n.replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(Number.parseInt(h, 16)));

// Resource category each name-taking content operator draws from; Tf's name is second to last.
const OPERAND_CATEGORY: Record<string, string> = {
  Do: 'XObject',
  Tf: 'Font',
  gs: 'ExtGState',
  cs: 'ColorSpace',
  CS: 'ColorSpace',
  scn: 'Pattern',
  SCN: 'Pattern',
  sh: 'Shading',
  BDC: 'Properties',
  DP: 'Properties',
};
const WHITESPACE = ' \t\r\n\f\0';
const isDelimiter = (c: string): boolean => WHITESPACE.includes(c) || '()<>[]{}/%'.includes(c);
const isOperand = (t: string): boolean =>
  /^[+-.\d]/.test(t) || ['true', 'false', 'null'].includes(t);

// Resource names per category, taken only from the operators that use them (PDF 32000 §7.8.2).
// Skips strings, comments and inline image data, which may hold anything.
function usedNames(streams: PDFStream[]): Map<string, Set<string>> {
  const used = new Map<string, Set<string>>();
  const use = (category: string, name: string | null | undefined): void => {
    if (name) used.set(category, (used.get(category) ?? new Set()).add(name));
  };
  // Streams are tokenized joined, as renderers concatenate them (PDF 32000 §7.7.3.3).
  const text = streams
    .map((stream) => {
      if (!(stream instanceof PDFRawStream)) throw new Error('Unreadable page content.');
      return strFromU8(decodePDFRawStream(stream).decode(), true);
    })
    .join('\n');
  let stack: Array<string | null> = []; // names, or null for any other operand
  const nest: string[] = []; // open '[' / '<<' operands, where every bare token is only data
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (WHITESPACE.includes(c)) {
      i++;
    } else if (c === '%') {
      while (i < text.length && text[i] !== '\n' && text[i] !== '\r') i++;
    } else if (c === '(') {
      for (let nest = 0; i < text.length; i++) {
        if (text[i] === '\\') i++;
        else if (text[i] === '(') nest++;
        else if (text[i] === ')' && --nest === 0) break;
      }
      i++;
      stack.push(null);
    } else if (c === '<' && text[i + 1] !== '<') {
      const end = text.indexOf('>', i);
      i = end < 0 ? text.length : end + 1;
      stack.push(null);
    } else if ('<>[]{})'.includes(c)) {
      // A stray ')' lands here too, so every branch moves `i` forward.
      const double = (c === '<' || c === '>') && text[i + 1] === c;
      i += double ? 2 : 1;
      if (c === '[' || (c === '<' && double)) nest.push(c);
      else if (c === ']' && nest.at(-1) === '[') nest.pop();
      else if (c === '>' && double && nest.at(-1) === '<') nest.pop();
      stack.push(null);
    } else {
      const start = c === '/' ? i + 1 : i;
      let end = start;
      while (end < text.length && !isDelimiter(text[end]!)) end++;
      const token = text.slice(start, end);
      i = end;
      if (c === '/') stack.push(nest.length ? null : decodeName(token));
      else if (token === 'ID') {
        // Inline image: its dict may name a colour space; its data runs to whitespace + EI.
        stack.forEach((k, n) => {
          if (k === 'CS' || k === 'ColorSpace') use('ColorSpace', stack[n + 1]);
        });
        const ei = /\sEI(?=\s|$)/g;
        ei.lastIndex = i + 1;
        i = ei.exec(text) ? ei.lastIndex : text.length;
        stack = [];
      } else if (isOperand(token) || nest.length) stack.push(null);
      else {
        const category = OPERAND_CATEGORY[token];
        if (category) use(category, token === 'Tf' ? stack.at(-2) : stack.at(-1));
        stack = [];
      }
    }
  }
  return used;
}

// Keeps only the resources `owner`'s content uses, in a fresh dict so a resource dict shared
// with a redacted page is left alone. A broken /Resources counts as none.
function prune(owner: PDFDict, content: PDFStream[]): void {
  const res = owner.context.lookup(owner.get(RESOURCES));
  if (!(res instanceof PDFDict)) return void owner.delete(RESOURCES);
  const used = usedNames(content);
  const kept = owner.context.obj({});
  for (const [category, value] of res.entries()) {
    const sub = owner.context.lookup(value);
    if (!(sub instanceof PDFDict)) continue; // /ProcSet is obsolete
    const names = used.get(category.decodeText());
    const keptSub = owner.context.obj({});
    for (const [name, ref] of sub.entries())
      if (names?.has(name.decodeText())) keptSub.set(name, ref);
    kept.set(category, keptSub);
  }
  owner.set(RESOURCES, kept);
}

const streamsOf = (ctx: PDFContext, value: PDFObject | undefined): PDFStream[] => {
  const obj = ctx.lookup(value);
  if (obj instanceof PDFStream) return [obj];
  if (obj instanceof PDFArray) return obj.asArray().flatMap((v) => streamsOf(ctx, v));
  if (obj instanceof PDFDict) return obj.values().flatMap((v) => streamsOf(ctx, v)); // AP states
  return [];
};

// Refs reachable from `roots`. Page dicts are not entered: each is kept or emptied on its own.
function reach(ctx: PDFContext, roots: PDFObject[]): Set<PDFRef> {
  const refs = new Set<PDFRef>();
  const seen = new Set<PDFObject>();
  const stack = [...roots];
  for (let obj = stack.pop(); obj; obj = stack.pop()) {
    if (seen.has(obj)) continue;
    seen.add(obj);
    if (obj instanceof PDFRef) {
      const target = ctx.lookup(obj);
      if (target instanceof PDFPageLeaf) continue;
      refs.add(obj);
      if (target) stack.push(target);
    } else if (obj instanceof PDFStream) stack.push(...obj.dict.values());
    else if (obj instanceof PDFDict) stack.push(...obj.values());
    else if (obj instanceof PDFArray) stack.push(...obj.asArray());
  }
  return refs;
}

// Keys a renderer follows to draw a page (PDF 32000 §7.8-8.11, 9.6-9.10): content, resources,
// forms, images, fonts, graphics states, soft masks, patterns, shadings, functions, colour spaces.
const DRAW_KEYS = new Set(
  [
    'Contents',
    'Group',
    'Length',
    'DecodeParms',
    'JBIG2Globals',
    'SMask',
    'Mask',
    'ColorSpace',
    'Alternate',
    'Alternates',
    'OC',
    'OCGs',
    'Font',
    'FontDescriptor',
    'FontFile',
    'FontFile2',
    'FontFile3',
    'DescendantFonts',
    'ToUnicode',
    'Widths',
    'Encoding',
    'CIDSystemInfo',
    'CIDToGIDMap',
    'W',
    'G',
    'BC',
    'TR',
    'TR2',
    'BG',
    'BG2',
    'UCR',
    'UCR2',
    'HT',
    'Shading',
    'ExtGState',
    'Function',
    'Functions',
    'Background',
    'CS',
    'W2',
    'FD',
    'UseCMap',
  ].map((k) => PDFName.of(k)),
);
// Dicts whose entries are all names chosen by the file: resource categories and Type3 glyphs.
const NAME_MAPS = new Set(
  [
    'XObject',
    'Font',
    'ExtGState',
    'Pattern',
    'Shading',
    'ColorSpace',
    'Properties',
    'CharProcs',
  ].map((k) => PDFName.of(k)),
);
const CHARPROCS = PDFName.of('CharProcs');

// Refs the kept `roots` need to draw, following only DRAW_KEYS. Every dict that carries
// /Resources is pruned to the names its own content uses before it is followed.
function drawn(ctx: PDFContext, roots: PDFObject[]): Set<PDFRef> {
  const refs = new Set<PDFRef>();
  const seen = new Set<PDFObject>();
  const visit = (value: PDFObject | undefined): void => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    if (value instanceof PDFRef) {
      const target = ctx.lookup(value);
      if (target instanceof PDFPageLeaf) return;
      refs.add(value);
      return visit(target);
    }
    if (value instanceof PDFArray) return value.asArray().forEach(visit);
    const stream = value instanceof PDFStream ? value : undefined;
    const dict = stream?.dict ?? value;
    if (!(dict instanceof PDFDict)) return;
    const content = (): PDFStream[] => {
      if (stream) return [stream];
      if (dict instanceof PDFPageLeaf) return streamsOf(ctx, dict.get(CONTENTS));
      return streamsOf(ctx, dict.get(CHARPROCS));
    };
    if (dict.has(RESOURCES)) prune(dict, content());
    for (const [key, v] of dict.entries()) {
      if (DRAW_KEYS.has(key)) visit(v);
      else if (key === CHARPROCS) visitNames(v);
      else if (key === RESOURCES) {
        const res = ctx.lookup(v);
        if (!(res instanceof PDFDict)) continue;
        for (const [category, sub] of res.entries()) if (NAME_MAPS.has(category)) visitNames(sub);
      }
    }
  };
  const visitNames = (value: PDFObject): void => {
    if (value instanceof PDFRef) refs.add(value);
    const map = ctx.lookup(value);
    if (map instanceof PDFDict) map.values().forEach(visit);
  };
  roots.forEach(visit);
  return refs;
}

// An /AP dict maps N/D/R to a form, or to a dict of appearance state -> form. Allows the
// dicts on the way and returns the forms (as refs where indirect) for `drawn` to walk.
function apForms(
  ctx: PDFContext,
  value: PDFObject | undefined,
  allowed: Set<PDFRef>,
  depth = 0,
): PDFObject[] {
  const obj = ctx.lookup(value);
  if (value && obj instanceof PDFStream) return [value];
  if (!(obj instanceof PDFDict) || depth > 1) return [];
  if (value instanceof PDFRef) allowed.add(value);
  return obj.values().flatMap((v) => apForms(ctx, v, allowed, depth + 1));
}

const CONTENTS = PDFName.of('Contents');
const ANNOTS = PDFName.of('Annots');
// Links from an annotation back into the form tree, a thread or another page.
const BACK_CHAIN = ['Parent', 'IRT', 'Popup', 'P'].map((n) => PDFName.of(n));

// Cuts every path from the kept pages to a dropped page (redacted, or an orphan copy reached
// through a link /Dest). `tainted` is everything a dropped page reaches through any key;
// `allowed` is what kept pages need to draw, found by following only DRAW_KEYS through resources
// pruned to the names their content uses, plus the kept annotation dicts and their /AP forms
// (annotations also lose their back-links). Every tainted object not allowed is emptied before
// copying, so a key missing from DRAW_KEYS can only blank a shared object on a kept page (a
// visual loss), never carry redacted content into the output.
function isolate(doc: PDFDocument, kept: PDFPage[]): void {
  const ctx = doc.context;
  const keep = new Set(kept.map((p) => p.ref));
  const dropped = ctx
    .enumerateIndirectObjects()
    .flatMap(([ref, obj]) => (obj instanceof PDFPageLeaf && !keep.has(ref) ? [{ref, obj}] : []));
  const tainted = reach(
    ctx,
    dropped.flatMap(({obj}) => obj.entries().flatMap(([k, v]) => (k === PARENT ? [] : [v]))),
  );
  const roots: PDFObject[] = [];
  const allowed = new Set<PDFRef>(); // copied as-is, not followed
  for (const page of kept) {
    roots.push(page.node);
    const list = page.node.get(ANNOTS);
    if (list instanceof PDFRef) allowed.add(list);
    for (const annot of page.node.lookupMaybe(ANNOTS, PDFArray)?.asArray() ?? []) {
      if (annot instanceof PDFRef) allowed.add(annot);
      const dict = ctx.lookup(annot);
      if (!(dict instanceof PDFDict)) continue;
      for (const key of BACK_CHAIN) dict.delete(key); // pdf-lib drops /AcroForm on copy anyway
      roots.push(...apForms(ctx, dict.get(PDFName.of('AP')), allowed));
    }
  }
  for (const ref of drawn(ctx, roots)) allowed.add(ref);
  for (const {ref} of dropped) ctx.assign(ref, ctx.obj({}));
  for (const ref of tainted) if (!allowed.has(ref)) ctx.assign(ref, ctx.obj({}));
}

/**
 * Swaps each listed page for a full-bleed JPEG and copies everything into a fresh document.
 * Expects pass-1 output (`buildFrom`), whose pages carry their own /Resources, not inherited ones.
 */
export async function replaceWithImages(
  bytes: Uint8Array,
  images: Array<{index: number; jpeg: Uint8Array}>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages();
  const jpegs = new Map(images.map((i) => [i.index, i.jpeg]));
  if (images.some((i) => !pages[i.index])) throw new Error('Redacted page is out of range.');
  const keptAt = pages.flatMap((_, i) => (jpegs.has(i) ? [] : [i]));
  isolate(
    doc,
    keptAt.map((i) => pages[i]!),
  );
  const out = await PDFDocument.create();
  const copied = await out.copyPages(doc, keptAt);
  let k = 0;
  for (const [i, page] of pages.entries()) {
    const jpeg = jpegs.get(i);
    if (!jpeg) {
      out.addPage(copied[k++]);
      continue;
    }
    const {width, height} = page.getCropBox();
    const [w, h] = displaySize({w: width, h: height}, page.getRotation().angle);
    const image = await out.embedJpg(jpeg);
    out.addPage([w, h]).drawImage(image, {x: 0, y: 0, width: w, height: h});
  }
  out.setTitle(doc.getTitle() ?? '');
  out.setCreator(doc.getCreator() ?? '');
  return out.save();
}
