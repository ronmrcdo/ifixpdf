import {type KeyboardEvent, type PointerEvent, useRef, useState} from 'react';
import {useStore} from 'zustand';
import {
  MARK_PATHS,
  type Markup,
  markStroke,
  type Rect,
  rectAt,
  shift,
  topLeft,
  unsupportedChars,
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
// A text input open at a viewport point: a new item, or `id` being retyped.
type Editing = {at: Point; text: string; size: number; id?: string};

const NONE: readonly Markup[] = [];
const MARK = 14;
const MIN_REDACT = 4;
const LINE = 1.2; // line height per point of size, as markup-draw

const LABELS: Record<Markup['kind'], string> = {
  text: 'Text',
  cross: 'Cross mark',
  check: 'Check mark',
  dot: 'Dot',
  signature: 'Signature',
  redact: 'Redaction',
};
const label = (m: Markup) => (m.kind === 'text' ? `Text: ${m.text}` : LABELS[m.kind]);

const clean = (s: string) => s.replace(/\r\n?/g, '\n').replace(/\t/g, ' ');

let measurer: CanvasRenderingContext2D | null | undefined;
/** Text rect from its display top-left (PDF point), measured at Helvetica metrics like the export. */
function textRect(at: Point, angle: Rotation, text: string, size: number): Rect {
  measurer ??= document.createElement('canvas').getContext('2d');
  if (measurer) measurer.font = `${size}px Helvetica, Arial, sans-serif`;
  const lines = text.split('\n');
  const w = Math.max(...lines.map((l) => measurer?.measureText(l).width ?? 0));
  return rectAt(at, angle, w, lines.length * size * LINE);
}

/** Item drawing in its own display frame (w × h, y down), like markup-draw. */
function Shape({m}: {m: Markup}) {
  const [w, h] = m.angle % 180 ? [m.rect.h, m.rect.w] : [m.rect.w, m.rect.h];
  if (m.kind === 'redact' || m.kind === 'signature') return null; // a box style, and Task 5.2
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
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
export function MarkupLayer({store, view, readOnly = false}: Props) {
  const {page, viewport, pdfPage} = view;
  const uid = page.uid;
  const items = useStore(store, (s) => s.pages.find((p) => p.uid === uid)?.markup) ?? NONE;
  const tool = useTool((s) => s.tool);
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
  const rootRef = useRef<HTMLDivElement>(null);

  const angle = ((pdfPage.rotate + page.rotation) % 360) as Rotation;
  const display = viewport.rotation as Rotation;
  const s = () => store.getState();
  const toPdf = ([x, y]: Point): Point => {
    const [px, py] = viewport.convertToPdfPoint(x, y);
    return [px, py];
  };
  const box = (r: Rect) => {
    const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([r.x, r.y, r.x + r.w, r.y + r.h]);
    return {
      left: Math.min(x1, x2),
      top: Math.min(y1, y2),
      width: Math.abs(x2 - x1),
      height: Math.abs(y2 - y1),
    };
  };
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
    if (tool === 'text') return setEditing({at: from, text: '', size: 12});
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
    const {text, size, id, at} = current;
    const old = items.find((m): m is TextItem => m.id === id && m.kind === 'text');
    if (!text.trim()) return old && remove(old.id);
    if (old)
      return s().updateMarkup(uid, old.id, {
        text,
        rect: textRect(topLeft(old.rect, old.angle), old.angle, text, size),
      });
    add({
      id: crypto.randomUUID(),
      kind: 'text',
      angle,
      text,
      size,
      rect: textRect(toPdf(at), angle, text, size),
    });
  };

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
  const retype = (m: Markup) => {
    if (m.kind !== 'text') return;
    const b = box(m.rect);
    setEditing({at: [b.left, b.top], text: m.text, size: m.size, id: m.id});
  };
  const onItemKey = (e: KeyboardEvent, m: Markup) => {
    if (e.key === 'Delete' || e.key === 'Backspace') remove(m.id);
    else if (e.key === 'Escape') select(null);
    else if (e.key === 'Enter') retype(m);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const placed = (m: Markup) => {
    const b = box(m.rect);
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
  const popup = chosen?.kind === 'text' && !moving ? chosen : undefined;
  const scale = viewport.scale;

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
        setBand(null);
        setMoving(null);
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
          style={popupAt(box(popup.rect))}
          onSize={(size) =>
            s().updateMarkup(uid, popup.id, {
              size,
              rect: textRect(topLeft(popup.rect, popup.angle), popup.angle, popup.text, size),
            })
          }
          onDuplicate={() =>
            add({...popup, id: crypto.randomUUID(), rect: shift(popup.rect, popup.angle, 12)})
          }
          onDelete={() => remove(popup.id)}
        />
      )}
      {editing && (
        <div className="markup-editor" style={{left: editing.at[0], top: editing.at[1]}}>
          <textarea
            aria-label="Text"
            rows={editing.text.split('\n').length}
            value={editing.text}
            aria-invalid={error.length > 0}
            aria-describedby="markup-text-error"
            style={{fontSize: editing.size * scale, lineHeight: LINE}}
            ref={(el) => el?.focus()}
            onChange={(e) => setEditing({...editing, text: clean(e.target.value)})}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setEditing(null);
              else if (e.key === 'Enter' && !e.shiftKey) commit();
              else return;
              e.preventDefault();
              e.stopPropagation();
            }}
          />
          <small id="markup-text-error" role="alert">
            {error.length ? `This character isn't supported: ${error.join(', ')}` : ''}
          </small>
        </div>
      )}
    </div>
  );
}
