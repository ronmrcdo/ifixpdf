import {type KeyboardEvent, type PointerEvent, useRef, useState} from 'react';
import {useStore} from 'zustand';
import {
  cleanText,
  displaySize,
  MARK_PATHS,
  type Markup,
  markStroke,
  pngSize,
  type Rect,
  rectAt,
  TEXT_FONTS,
  type TextFont,
  topLeft,
  unsupportedChars,
  unsupportedMessage,
  viewportBox,
} from '../../../domain/markup';
import type {Rotation} from '../../../domain/types';
import type {WorkspaceStore} from '../../../state/workspace';
import type {PageView} from '../Stage';
import '../../../styles/editor-markup.css';
import {TextPopup} from './TextPopup';
import {useTool} from './tool';

interface Props {
  store: WorkspaceStore;
  view: PageView;
  readOnly?: boolean;
}
type Point = [number, number];
type TextItem = Extract<Markup, {kind: 'text'}>;
// A text input open at a PDF point (so it follows zoom): a new item, or `id` being retyped.
type Editing = {at: Point; text: string; size: number; font: TextFont; bold: boolean; id?: string};

const NONE: readonly Markup[] = [];
const MARK = 14;
const MIN_REDACT = 4;
const LINE = 1.2; // line height per point of size, as markup-draw
const SIGN_WIDTH = 150;
const MIN_SIGN = 24;
const MIN_MARK = 6;
const MIN_TYPE = 6;
// Corner name and its position in the box (0 = left/top, 1 = right/bottom).
const CORNERS = [
  ['top-left', 0, 0],
  ['top-right', 1, 0],
  ['bottom-left', 0, 1],
  ['bottom-right', 1, 1],
] as const;
// A corner drag: scale about `fixed` (PDF), the corner opposite the handle (`opposite` on screen).
type Resize = {id: string; opposite: Point; size: Point; fixed: Point; min: number};
const scaled = (r: Rect, [fx, fy]: Point, k: number): Rect => ({
  x: fx + (r.x - fx) * k,
  y: fy + (r.y - fy) * k,
  w: r.w * k,
  h: r.h * k,
});

const LABELS: Record<Markup['kind'], string> = {
  text: 'Text',
  cross: 'Cross mark',
  check: 'Check mark',
  dot: 'Dot',
  signature: 'Signature',
  redact: 'Redaction',
};
const label = (m: Markup) => (m.kind === 'text' ? `Text: ${m.text}` : LABELS[m.kind]);
const isBoldKey = (e: KeyboardEvent) => (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b';
const fontCss = (m: {font?: TextFont}) => TEXT_FONTS[m.font ?? 'helvetica'].css;
const fontStyle = (m: {font?: TextFont; bold?: boolean}) => ({
  fontFamily: fontCss(m),
  fontWeight: m.bold ? 'bold' : undefined,
});

/** Smallest corner-drag scale: text to 6 pt type, a signature to 24 pt wide, a mark to 6 pt. */
function minScale(m: Markup): number {
  if (m.kind === 'text') return MIN_TYPE / m.size;
  return (m.kind === 'signature' ? MIN_SIGN : MIN_MARK) / displaySize(m.rect, m.angle)[0];
}

let measurer: CanvasRenderingContext2D | null | undefined;
/** Text rect from its display top-left (PDF point), measured in its font like the export. */
function textRect(
  at: Point,
  angle: Rotation,
  {text, size, font, bold}: {text: string; size: number; font?: TextFont; bold?: boolean},
): Rect {
  measurer ??= document.createElement('canvas').getContext('2d');
  if (measurer) measurer.font = `${bold ? 'bold ' : ''}${size}px ${fontCss({font})}`;
  const lines = text.split('\n');
  const w = Math.max(...lines.map((l) => measurer?.measureText(l).width ?? 0));
  return rectAt(at, angle, w, lines.length * size * LINE);
}

/** Item drawing in its own display frame (w × h, y down), like markup-draw. */
function Shape({m}: {m: Markup}) {
  const [w, h] = displaySize(m.rect, m.angle);
  if (m.kind === 'redact') return null; // a box style
  if (m.kind === 'signature') return <img src={m.image} alt="" draggable={false} />;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={m.kind === 'text' ? fontStyle(m) : undefined}
    >
      {m.kind === 'text' &&
        m.text.split('\n').map((line, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: lines have no identity
          <text key={i} x={0} y={m.size + i * m.size * LINE} fontSize={m.size}>
            {line}
          </text>
        ))}
      {m.kind === 'dot' && <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} />}
      {(m.kind === 'cross' || m.kind === 'check') && (
        <path d={MARK_PATHS[m.kind](w, h)} strokeWidth={markStroke(w, h)} />
      )}
    </svg>
  );
}

/** Text, marks and redactions over the displayed page: place, select, move, retype, delete. */
export function MarkupLayer({store, view, readOnly: preview = false}: Props) {
  const {page, viewport, pdfPage} = view;
  const uid = page.uid;
  const items = useStore(store, (s) => s.pages.find((p) => p.uid === uid)?.markup) ?? NONE;
  // An export ignores edits, so the layer takes no input until it ends.
  const readOnly = useStore(store, (s) => preview || s.exporting);
  const tool = useTool((s) => s.tool);
  const signature = useTool((s) => s.signature);
  const selected = useTool((s) => s.selected);
  const select = useTool((s) => s.select);
  const [editing, setEditingState] = useState<Editing | null>(null);
  // Enter or Escape unmounts the input, which can still blur it: read the live value, not a closure.
  const editRef = useRef<Editing | null>(null);
  const setEditing = (e: Editing | null) => {
    editRef.current = e;
    setEditingState(e);
  };
  const [band, setBand] = useState<[Point, Point] | null>(null);
  const [moving, setMoving] = useState<{id: string; d: Point} | null>(null);
  const start = useRef<Point | null>(null);
  const grab = useRef<{id: string; from: Point} | null>(null);
  const resize = useRef<Resize | null>(null);
  const [sizing, setSizing] = useState<{id: string; rect: Rect} | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const angle = ((pdfPage.rotate + page.rotation) % 360) as Rotation;
  const display = viewport.rotation as Rotation;
  const s = () => store.getState();
  const toPdf = ([x, y]: Point): Point => {
    const [px, py] = viewport.convertToPdfPoint(x, y);
    return [px, py];
  };
  const box = (r: Rect) => viewportBox(viewport, [r.x, r.y, r.x + r.w, r.y + r.h]);
  const local = (e: PointerEvent): Point => {
    const r = rootRef.current?.getBoundingClientRect();
    return [e.clientX - (r?.left ?? 0), e.clientY - (r?.top ?? 0)];
  };
  const add = (item: Markup) => {
    s().addMarkup(uid, item);
    select(item.id);
  };
  const remove = (id: string) => {
    s().removeMarkup(uid, id);
    select(null);
  };

  const place = (from: Point, to: Point) => {
    if (tool === 'text')
      return setEditing({at: toPdf(from), text: '', size: 12, font: 'helvetica', bold: false});
    const id = crypto.randomUUID();
    if (tool === 'redact') {
      setBand(null);
      if (from[0] === to[0] && from[1] === to[1]) return;
      const [ax, ay] = toPdf(from);
      const [bx, by] = toPdf(to);
      const rect = {
        x: Math.min(ax, bx),
        y: Math.min(ay, by),
        w: Math.max(MIN_REDACT, Math.abs(bx - ax)),
        h: Math.max(MIN_REDACT, Math.abs(by - ay)),
      };
      return add({id, kind: 'redact', angle, rect});
    }
    if (tool === 'sign') {
      if (!signature) return;
      const [iw, ih] = pngSize(signature);
      const [w, h] = [SIGN_WIDTH, (SIGN_WIDTH * ih) / iw];
      const [rw, rh] = displaySize({w, h}, angle); // display width runs along y at 90/270
      const [x, y] = toPdf(from);
      add({
        id,
        kind: 'signature',
        image: signature,
        angle,
        rect: {x: x - rw / 2, y: y - rh / 2, w: rw, h: rh},
      });
      return useTool.getState().setTool(null);
    }
    if (tool === 'check' || tool === 'cross' || tool === 'dot') {
      const [x, y] = toPdf(from);
      add({id, kind: tool, angle, rect: {x: x - MARK / 2, y: y - MARK / 2, w: MARK, h: MARK}});
    }
  };

  const error = editing ? unsupportedChars(editing.text) : [];
  const commit = () => {
    const current = editRef.current;
    if (!current || unsupportedChars(current.text).length) return;
    setEditing(null);
    const {text, size, font, bold, id, at} = current;
    const old = items.find((m): m is TextItem => m.id === id && m.kind === 'text');
    if (!text.trim()) return old && remove(old.id);
    if (old) return restyle(old, {text, size, font, bold});
    add({
      id: crypto.randomUUID(),
      kind: 'text',
      angle,
      text,
      size,
      font,
      bold,
      rect: textRect(at, angle, current),
    });
  };
  // Re-measures a text item from its display top-left for new text, size or font.
  const restyle = (
    m: TextItem,
    change: Partial<Pick<TextItem, 'text' | 'size' | 'font' | 'bold'>>,
  ) =>
    s().updateMarkup(uid, m.id, {
      ...change,
      rect: textRect(topLeft(m.rect, m.angle), m.angle, {...m, ...change}),
    });

  const onRootDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || editing) return; // an open input commits on its blur
    if (!tool) return select(null);
    start.current = local(e);
    if (tool === 'redact') {
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setBand([start.current, start.current]);
    }
  };
  const onRootMove = (e: PointerEvent) => {
    if (band && start.current) setBand([start.current, local(e)]);
  };
  const onRootUp = (e: PointerEvent) => {
    const from = start.current;
    start.current = null;
    if (from) place(from, local(e));
  };

  const onItemDown = (e: PointerEvent<HTMLElement>, m: Markup) => {
    e.stopPropagation();
    select(m.id);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    grab.current = {id: m.id, from: [e.clientX, e.clientY]};
  };
  const onItemMove = (e: PointerEvent) => {
    const g = grab.current;
    if (g) setMoving({id: g.id, d: [e.clientX - g.from[0], e.clientY - g.from[1]]});
  };
  const onItemUp = (e: PointerEvent, m: Markup) => {
    const g = grab.current;
    grab.current = null;
    setMoving(null);
    if (!g) return;
    const d: Point = [e.clientX - g.from[0], e.clientY - g.from[1]];
    if (!d[0] && !d[1]) return;
    const [ax, ay] = toPdf([0, 0]);
    const [bx, by] = toPdf(d);
    s().updateMarkup(uid, m.id, {rect: {...m.rect, x: m.rect.x + bx - ax, y: m.rect.y + by - ay}});
  };
  const onHandleDown = (e: PointerEvent<HTMLElement>, m: Markup, cx: number, cy: number) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const b = box(m.rect);
    const opposite: Point = [b.left + (1 - cx) * b.width, b.top + (1 - cy) * b.height];
    resize.current = {
      id: m.id,
      opposite,
      size: [b.width, b.height],
      fixed: toPdf(opposite),
      min: minScale(m),
    };
  };
  // The scale for the pointer: the larger of the two axis scales keeps the aspect.
  const scaleAt = (e: PointerEvent, r: Resize): number => {
    const [x, y] = local(e);
    return Math.max(
      r.min,
      Math.abs(x - r.opposite[0]) / r.size[0],
      Math.abs(y - r.opposite[1]) / r.size[1],
    );
  };
  const onHandleMove = (e: PointerEvent, m: Markup) => {
    const r = resize.current;
    if (r) setSizing({id: r.id, rect: scaled(m.rect, r.fixed, scaleAt(e, r))});
  };
  const onHandleUp = (e: PointerEvent, m: Markup) => {
    const r = resize.current;
    resize.current = null;
    setSizing(null);
    if (!r || !sizing) return; // a click without a drag changes nothing
    const k = scaleAt(e, r);
    const rect = scaled(m.rect, r.fixed, k);
    if (m.kind === 'text') s().updateMarkup(uid, m.id, {rect, size: m.size * k});
    else s().updateMarkup(uid, m.id, {rect});
  };
  const retype = (m: Markup) => {
    if (m.kind !== 'text') return;
    const b = box(m.rect);
    setEditing({
      at: toPdf([b.left, b.top]),
      text: m.text,
      size: m.size,
      font: m.font ?? 'helvetica',
      bold: !!m.bold,
      id: m.id,
    });
  };
  const onItemKey = (e: KeyboardEvent, m: Markup) => {
    if (e.key === 'Delete' || e.key === 'Backspace') remove(m.id);
    else if (e.key === 'Escape') select(null);
    else if (e.key === 'Enter') retype(m);
    else if (isBoldKey(e) && m.kind === 'text') restyle(m, {bold: !m.bold});
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const placed = (m: Markup) => {
    const b = box(sizing?.id === m.id ? sizing.rect : m.rect);
    const d: Point = moving?.id === m.id ? moving.d : [0, 0];
    // Turn the drawing from the item's own display frame to how the page shows now.
    const turn = (display - m.angle + 360) % 360;
    return {
      box: {...b, left: b.left + d[0], top: b.top + d[1]},
      inner: {
        width: turn % 180 ? b.height : b.width,
        height: turn % 180 ? b.width : b.height,
        transform: `translate(-50%, -50%) rotate(${turn}deg)`,
      },
    };
  };

  const popupAt = (b: ReturnType<typeof box>) => ({left: b.left + b.width / 2, top: b.top});
  const chosen = readOnly
    ? undefined
    : items.find((m) => m.id === selected && m.id !== editing?.id);
  const popup = chosen?.kind === 'text' && !moving && !editing ? chosen : undefined;
  const scale = viewport.scale;
  const editAt = editing && viewport.convertToViewportPoint(...editing.at);

  return (
    <div
      ref={rootRef}
      className={readOnly ? 'markup-layer read-only' : 'markup-layer'}
      data-tool={readOnly ? undefined : (tool ?? undefined)}
      onPointerDown={readOnly ? undefined : onRootDown}
      onPointerMove={readOnly ? undefined : onRootMove}
      onPointerUp={readOnly ? undefined : onRootUp}
      onPointerCancel={() => {
        start.current = null;
        grab.current = null;
        resize.current = null;
        setBand(null);
        setMoving(null);
        setSizing(null);
      }}
    >
      {items.map((m) => {
        if (m.id === editing?.id) return null;
        const {box: b, inner} = placed(m);
        const kind = `markup-item markup-${m.kind}`;
        const shape = (
          <span className="markup-shape" style={inner}>
            <Shape m={m} />
          </span>
        );
        if (readOnly)
          return (
            <div
              key={m.id}
              className={kind}
              role="img"
              aria-label={label(m)}
              style={m.kind === 'redact' ? {...b, backgroundColor: '#000'} : b}
            >
              {shape}
            </div>
          );
        return (
          <button
            key={m.id}
            type="button"
            className={m.kind === 'redact' ? `${kind} hatched` : kind}
            aria-label={label(m)}
            aria-pressed={m.id === selected}
            style={b}
            onFocus={() => select(m.id)}
            onPointerDown={(e) => onItemDown(e, m)}
            onPointerMove={onItemMove}
            onPointerUp={(e) => onItemUp(e, m)}
            onDoubleClick={() => retype(m)}
            onKeyDown={(e) => onItemKey(e, m)}
          >
            {shape}
          </button>
        );
      })}
      {chosen &&
        chosen.kind !== 'redact' &&
        !moving &&
        CORNERS.map(([corner, cx, cy]) => {
          const b = placed(chosen).box;
          return (
            <button
              key={corner}
              type="button"
              tabIndex={-1}
              className="markup-handle"
              data-corner={corner}
              aria-label={`Resize ${LABELS[chosen.kind].toLowerCase()}, ${corner}`}
              style={{left: b.left + cx * b.width, top: b.top + cy * b.height}}
              onPointerDown={(e) => onHandleDown(e, chosen, cx, cy)}
              onPointerMove={(e) => onHandleMove(e, chosen)}
              onPointerUp={(e) => onHandleUp(e, chosen)}
            />
          );
        })}
      {band && (
        <div
          className="markup-band"
          style={{
            left: Math.min(band[0][0], band[1][0]),
            top: Math.min(band[0][1], band[1][1]),
            width: Math.abs(band[1][0] - band[0][0]),
            height: Math.abs(band[1][1] - band[0][1]),
          }}
        />
      )}
      {popup && (
        <TextPopup
          key={popup.id}
          size={popup.size}
          font={popup.font ?? 'helvetica'}
          style={popupAt(box(popup.rect))}
          onSize={(size) => restyle(popup, {size})}
          bold={!!popup.bold}
          onFont={(font) => restyle(popup, {font})}
          onBold={(bold) => restyle(popup, {bold})}
          onDelete={() => remove(popup.id)}
        />
      )}
      {editing && (
        <div
          className="markup-editor"
          style={{left: editAt?.[0], top: editAt?.[1]}}
          // Focus moving to the popup keeps the input open; anywhere else commits it.
          onBlur={(e) => {
            if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)))
              commit();
          }}
        >
          <TextPopup
            size={editing.size}
            font={editing.font}
            onSize={(size) => setEditing({...editing, size})}
            bold={editing.bold}
            onFont={(font) => setEditing({...editing, font})}
            onBold={(bold) => setEditing({...editing, bold})}
            onDelete={() => {
              setEditing(null);
              if (editing.id) remove(editing.id);
            }}
          />
          <textarea
            aria-label="Text"
            rows={editing.text.split('\n').length}
            value={editing.text}
            aria-invalid={error.length > 0}
            aria-describedby={error.length ? 'markup-text-error' : undefined}
            style={{fontSize: editing.size * scale, lineHeight: LINE, ...fontStyle(editing)}}
            ref={(el) => el?.focus()} // also after each popup change, so typing continues
            onChange={(e) => setEditing({...editing, text: cleanText(e.target.value)})}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(null);
              else if (e.key === 'Enter' && !e.shiftKey) commit();
              else if (isBoldKey(e)) setEditing({...editing, bold: !editing.bold});
              else return;
              e.preventDefault();
              e.stopPropagation();
            }}
          />
          <small id="markup-text-error" role="alert">
            {unsupportedMessage(error)}
          </small>
        </div>
      )}
    </div>
  );
}
