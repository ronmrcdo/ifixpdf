import type {PDFPageProxy} from 'pdfjs-dist';
import {type CSSProperties, useEffect, useId, useState} from 'react';
import {useStore} from 'zustand';
import {
  cleanText,
  type FieldValue,
  unsupportedChars,
  unsupportedMessage,
  viewportBox,
} from '../../../domain/markup';
import type {WorkspaceStore} from '../../../state/workspace';
import type {PageView} from '../Stage';
import {useTool} from './tool';

// The fields of pdf.js widget annotation data this layer reads (pdf.worker WidgetAnnotation and subclasses).
interface Widget {
  subtype: string;
  fieldType?: string;
  fieldName: string;
  fieldValue?: string | string[] | null;
  alternativeText?: string;
  rect: number[];
  hidden?: boolean;
  readOnly?: boolean;
  multiLine?: boolean;
  checkBox?: boolean;
  radioButton?: boolean;
  exportValue?: string;
  buttonValue?: string | null;
  options?: {exportValue: string; displayValue: string}[];
}

const cache = new WeakMap<PDFPageProxy, Promise<Widget[]>>();
const widgetsOf = (pdfPage: PDFPageProxy): Promise<Widget[]> => {
  let hit = cache.get(pdfPage);
  if (!hit) {
    hit = pdfPage
      .getAnnotations({intent: 'display'})
      .then((all: Widget[]) => all.filter(fillable))
      .catch(() => []);
    cache.set(pdfPage, hit);
  }
  return hit;
};
const fillable = (a: Widget) =>
  a.subtype === 'Widget' &&
  !a.hidden &&
  (a.fieldType === 'Tx' ||
    a.fieldType === 'Ch' ||
    !!a.checkBox ||
    (!!a.radioButton && !!a.buttonValue));

const NONE: Readonly<Record<string, FieldValue>> = {};
const asText = (v: Widget['fieldValue']) => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''));

interface TextProps {
  w: Widget;
  shown: string;
  style: CSSProperties;
  disabled: boolean;
  onCommit: (value: string) => void;
}

/** Commits on blur or Enter (one undo step), refusing text Helvetica can't encode. */
function TextField({w, shown, style, disabled, onCommit}: TextProps) {
  const [draft, setDraft] = useState(shown);
  const errorId = useId();
  const error = unsupportedMessage(unsupportedChars(draft));
  const props = {
    className: 'form-field',
    'aria-label': w.alternativeText || w.fieldName,
    'aria-invalid': !!error,
    'aria-describedby': error ? errorId : undefined,
    value: draft,
    style,
    disabled,
    onChange: (e: {target: {value: string}}) => setDraft(cleanText(e.target.value)),
    onBlur: () => {
      if (!error && draft !== shown) onCommit(draft);
    },
  };
  return (
    <>
      {w.multiLine ? (
        <textarea {...props} />
      ) : (
        <input {...props} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
      )}
      {error && (
        <small
          id={errorId}
          role="alert"
          className="field-error"
          style={{left: style.left, top: Number(style.top) + Number(style.height)}}
        >
          {error}
        </small>
      )}
    </>
  );
}

/**
 * Native controls over the page's form widgets. Values go to `fills` on the file; Preview shows
 * them disabled. While a tool is active the controls let clicks through to the markup layer.
 */
export function FieldLayer({
  store,
  view,
  readOnly = false,
}: {
  store: WorkspaceStore;
  view: PageView;
  readOnly?: boolean;
}) {
  const {page, viewport, pdfPage} = view;
  const fileId = page.fileId;
  const fills = useStore(store, (s) => s.fills[fileId]) ?? NONE;
  const tool = useTool((s) => s.tool);
  const [widgets, setWidgets] = useState<Widget[]>([]);
  useEffect(() => {
    let live = true;
    widgetsOf(pdfPage).then((w) => live && setWidgets(w));
    return () => {
      live = false;
    };
  }, [pdfPage]);

  const set = (name: string, value: FieldValue) => store.getState().setField(fileId, name, value);

  return (
    <div className="field-layer" data-tool={tool && !readOnly ? '' : undefined}>
      {widgets.map((w, i) => {
        const box = viewportBox(viewport, w.rect);
        const style = {...box, fontSize: Math.min(box.height * 0.7, 12 * viewport.scale)};
        const disabled = readOnly || !!w.readOnly;
        const label = w.alternativeText || w.fieldName;
        const fill = fills[w.fieldName];
        const key = `${i}:${w.fieldName}`;
        if (w.checkBox)
          return (
            <input
              key={key}
              type="checkbox"
              className="form-field"
              aria-label={label}
              style={style}
              disabled={disabled}
              checked={typeof fill === 'boolean' ? fill : w.fieldValue === w.exportValue}
              onChange={(e) => set(w.fieldName, e.target.checked)}
            />
          );
        if (w.radioButton && w.buttonValue)
          return (
            <input
              key={key}
              type="radio"
              className="form-field"
              name={w.fieldName}
              value={w.buttonValue}
              aria-label={`${label}: ${w.buttonValue}`}
              style={style}
              disabled={disabled}
              checked={(fill ?? w.fieldValue) === w.buttonValue}
              onChange={(e) => set(w.fieldName, e.target.value)}
            />
          );
        const shown = typeof fill === 'string' ? fill : asText(w.fieldValue);
        if (w.fieldType === 'Ch')
          return (
            <select
              key={key}
              className="form-field"
              aria-label={label}
              style={style}
              disabled={disabled}
              value={shown}
              onChange={(e) => set(w.fieldName, e.target.value)}
            >
              {!shown && <option value="" />}
              {w.options?.map((o) => (
                <option key={o.exportValue} value={o.exportValue}>
                  {o.displayValue}
                </option>
              ))}
            </select>
          );
        return (
          <TextField
            // A new shown value (undo, another widget of the field) resets the draft.
            key={`${key}:${shown}`}
            w={w}
            shown={shown}
            style={style}
            disabled={disabled}
            onCommit={(v) => set(w.fieldName, v)}
          />
        );
      })}
    </div>
  );
}
