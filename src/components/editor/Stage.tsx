import {ChevronLeft, ChevronRight, FileText, Minus, Plus, RotateCw, Scan} from 'lucide-react';
import {useEffect, useRef, useState, type ReactNode} from 'react';
import {useStore} from 'zustand';
import {acquire} from '../../pdf/registry';
import {renderPage} from '../../pdf/render';
import {useApp} from '../../state/app';
import type {WorkspaceStore} from '../../state/workspace';
import {TAB_PANEL_ID, tabId} from './Toolbar';
import {createWheelFlip} from './useWheelFlip';
import {fitScale, stepZoom} from './zoom';

interface Props {
  store: WorkspaceStore;
  /** Preview: the file name. Edit/Merge: 'Document preview' / 'Merged preview'. */
  caption: string;
  readOnly?: boolean;
  /** The Pages-tab content (a page grid), shown in the stage instead of the canvas. */
  children?: ReactNode;
}

const stepFrom = (store: WorkspaceStore, actual: number, dir: 1 | -1) => {
  const s = store.getState();
  s.setZoom(stepZoom(s.zoom, actual, dir));
};

/** The page view: zoom tools, the canvas stage with wheel flipping, and page navigation. */
export function Stage({store, caption, readOnly = false, children}: Props) {
  const pages = useStore(store, (s) => s.pages);
  const files = useStore(store, (s) => s.files);
  const current = useStore(store, (s) => s.currentPage);
  const zoom = useStore(store, (s) => s.zoom);
  const tab = useStore(store, (s) => s.tab);
  const stageRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const jumpRef = useRef<HTMLInputElement>(null);
  const actual = useRef(100); // the zoom Fit last rendered at, in percent
  const landOnBottom = useRef(false);
  const [resized, setResized] = useState(0);

  const page = pages[current];
  const file = files.find((f) => f.id === page?.fileId);
  const total = pages.length;
  const zoomBy = (dir: 1 | -1) => stepFrom(store, actual.current, dir);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    // Made once per store: the gesture state must outlive re-renders, or inertia after a flip flips again.
    const onWheel = createWheelFlip({
      gap: 250,
      onZoom: (dir) => stepFrom(store, actual.current, dir),
      canScroll: (dir) =>
        dir === 1
          ? stage.scrollTop + stage.clientHeight < stage.scrollHeight - 1
          : stage.scrollTop > 0,
      onFlip: (dir, bottom) => {
        const s = store.getState();
        const next = s.currentPage + dir;
        if (next < 0 || next >= s.pages.length) return;
        landOnBottom.current = bottom;
        s.goTo(next);
      },
    });
    // React's onWheel is passive, so preventDefault would be ignored.
    const listener = (e: WheelEvent) => {
      if (store.getState().tab === 'document' && store.getState().pages.length) onWheel(e);
    };
    stage.addEventListener('wheel', listener, {passive: false});
    return () => stage.removeEventListener('wheel', listener);
  }, [store]);

  // Re-fit on resize, debounced; only Fit depends on the stage size.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (store.getState().zoom === 'fit') setResized((n) => n + 1);
      }, 100);
    });
    observer.observe(stage);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [store]);

  useEffect(() => {
    const stage = stageRef.current,
      wrap = wrapRef.current,
      canvas = canvasRef.current;
    if (!page || !stage || !wrap || !canvas || tab !== 'document' || stage.clientHeight < 1) {
      landOnBottom.current = false; // a flip that didn't render must not move a later zoom or resize render
      return;
    }
    let stale = false;
    void (async () => {
      try {
        const pdfPage = await (await acquire(page.fileId)).getPage(page.local + 1);
        if (stale) return;
        const base = pdfPage.getViewport({
          scale: 1,
          rotation: (pdfPage.rotate + page.rotation) % 360,
        });
        const style = getComputedStyle(stage);
        const padding = {
          x: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
          y: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
        };
        const factor =
          zoom === 'fit'
            ? fitScale(
                {w: stage.clientWidth, h: stage.clientHeight},
                {w: base.width, h: base.height},
                padding,
              )
            : zoom / 100;
        actual.current = Math.round(factor * 100);
        wrap.style.width = `${Math.max(1, base.width * factor)}px`;
        // renderPage sizes the canvas only after its own await; give it the new page's shape now so scrollHeight is right.
        canvas.style.aspectRatio = `${base.width} / ${base.height}`;
        stage.scrollTop = landOnBottom.current ? stage.scrollHeight : 0;
        landOnBottom.current = false;
        // Backing store at up to 2x device pixels, oversampled 1.5x as before; renderPage caps oversized canvases.
        await renderPage(
          canvas,
          page.fileId,
          page.local,
          page.rotation,
          factor * Math.min(window.devicePixelRatio || 1, 2) * 1.5,
        );
      } catch {
        if (!stale)
          useApp.getState().notify('This page could not be previewed. Try another PDF.', 'error');
      }
    })();
    return () => {
      stale = true;
    };
  }, [page, zoom, tab, resized]);

  // The jump input commits on change (Enter/blur), like the legacy app, so typing "12" doesn't visit page 1.
  useEffect(() => {
    const input = jumpRef.current;
    if (input) input.value = String(current + 1);
  }, [current]);
  useEffect(() => {
    const input = jumpRef.current;
    if (!input) return;
    const onChange = () => {
      const {pages, currentPage, goTo} = store.getState();
      const n = Number(input.value);
      if (Number.isInteger(n) && n >= 1 && n <= pages.length) return goTo(n - 1);
      input.value = String(currentPage + 1);
      useApp.getState().notify(`Choose a page from 1 to ${pages.length}.`, 'error');
    };
    input.addEventListener('change', onChange);
    return () => input.removeEventListener('change', onChange);
  }, [store]);

  const go = (index: number) => store.getState().goTo(index);
  const grid = tab === 'pages' ? children : undefined;
  return (
    <section
      className={readOnly ? 'preview reader-preview' : 'preview'}
      data-shortcut-scope="stage"
      role="tabpanel"
      id={TAB_PANEL_ID}
      aria-labelledby={tabId(tab)}
    >
      <div className="preview-tools">
        <span id={readOnly ? undefined : 'preview-caption'}>{caption}</span>
        <span className="spacer"></span>
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(-1)}>
          <Minus aria-hidden="true" />
        </button>
        <span className="zoom-value">{zoom === 'fit' ? 'Fit' : `${zoom}%`}</span>
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1)}>
          <Plus aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Fit page"
          aria-pressed={zoom === 'fit'}
          title={readOnly ? undefined : 'Fit whole page'}
          onClick={() => store.getState().setZoom('fit')}
        >
          <Scan aria-hidden="true" />
        </button>
        {!readOnly && (
          <button
            type="button"
            aria-label="Rotate current page clockwise"
            onClick={() => page && store.getState().rotate(90, new Set([page.uid]))}
          >
            <RotateCw aria-hidden="true" />
          </button>
        )}
      </div>
      {grid ? (
        <div
          className={readOnly ? 'paper-stage read-only-pages' : 'paper-stage pages-stage'}
          id="paper-stage"
          ref={stageRef}
        >
          {grid}
        </div>
      ) : (
        <div className="paper-stage" id="paper-stage" ref={stageRef} tabIndex={0}>
          <div className="paper-wrap" ref={wrapRef}>
            <canvas
              className="paper"
              ref={canvasRef}
              role="img"
              aria-label={`Page ${current + 1} of ${total}, ${file?.name ?? ''}`}
            ></canvas>
          </div>
        </div>
      )}
      <div className="page-nav">
        {readOnly ? (
          <span className="reader-note">
            {total} {total === 1 ? 'page' : 'pages'} · Read-only
          </span>
        ) : (
          <span className="current-source" title={file?.name ?? ''}>
            <FileText aria-hidden="true" /> {file?.name ?? 'No document'}
          </span>
        )}
        <div className="page-controls">
          <button
            type="button"
            aria-label="Previous page"
            disabled={current <= 0}
            onClick={() => go(current - 1)}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <label className="page-jump">
            Page{' '}
            <input
              id="page-jump"
              ref={jumpRef}
              type="number"
              min="1"
              max={total}
              defaultValue={current + 1}
              aria-label="Go to page"
            />{' '}
            <span>of {total}</span>
          </label>
          <button
            type="button"
            aria-label="Next page"
            disabled={current >= total - 1}
            onClick={() => go(current + 1)}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}
