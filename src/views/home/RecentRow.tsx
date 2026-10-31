import {ChevronRight, Ellipsis} from 'lucide-react';
import {useEffect, useRef, type MouseEvent} from 'react';
import {formatSize} from '../../domain/format';
import type {RecentEntry} from '../../storage/recents';

interface Props {
  entry: RecentEntry;
  selected: boolean;
  onCheck(checked: boolean): void;
  onOpen(): void;
  onMenu(x: number, y: number, trigger: HTMLElement): void;
  onLocate(): void;
  onRemove(): void;
  /** Called once the thumbnail scrolls into view with none stored. */
  onNeedThumb(): void;
}

/** Shows the stored thumbnail Blob; asks for one when it first scrolls into view without one. */
function Thumb({entry, onNeedThumb}: Pick<Props, 'entry' | 'onNeedThumb'>) {
  const box = useRef<HTMLSpanElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const {thumbnail, missing} = entry;
  useEffect(() => {
    if (!thumbnail || !img.current) return; // a row only ever gains a thumbnail
    const made = URL.createObjectURL(thumbnail);
    img.current.src = made;
    return () => URL.revokeObjectURL(made);
  }, [thumbnail]);
  useEffect(() => {
    // shortcut: without IntersectionObserver rows keep the placeholder; every supported webview has it.
    if (thumbnail || missing || !box.current || typeof IntersectionObserver === 'undefined') return;
    const seen = new IntersectionObserver(([hit]) => {
      if (!hit?.isIntersecting) return;
      seen.disconnect();
      onNeedThumb();
    });
    seen.observe(box.current);
    return () => seen.disconnect();
  }, [thumbnail, missing, onNeedThumb]);
  return <span className="source-thumb" ref={box}><img alt="" ref={img} /></span>;
}

export function RecentRow({entry, selected, onCheck, onOpen, onMenu, onLocate, onRemove, onNeedThumb}: Props) {
  const moreRef = useRef<HTMLButtonElement>(null);
  const {name, missing} = entry;
  const context = (e: MouseEvent) => {
    e.preventDefault();
    if (moreRef.current) onMenu(e.clientX, e.clientY, moreRef.current);
  };
  const date = new Date(entry.modified).toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
  return (
    <div className={selected ? 'recent-file recent-selected' : 'recent-file'} data-recent-row={entry.id} onContextMenu={context}>
      <input className="recent-check" type="checkbox" aria-label={`Select ${name}`} checked={selected} disabled={missing} onChange={(e) => onCheck(e.target.checked)} />
      <Thumb entry={entry} onNeedThumb={onNeedThumb} />
      <button type="button" className="recent-name" onClick={onOpen}>
        <strong>{name}</strong>
        <span>{missing ? 'File not found' : `${entry.pages} pages · ${formatSize(entry.size)}`}</span>
      </button>
      <time>{date}</time>
      {missing ? (
        <>
          <button type="button" className="secondary recent-fix" onClick={onLocate}>Locate…</button>
          <button type="button" className="secondary recent-fix" onClick={onRemove}>Remove</button>
        </>
      ) : (
        <button type="button" className="secondary" aria-label={`Open ${name}`} onClick={onOpen}>Open <ChevronRight aria-hidden="true" /></button>
      )}
      <button
        type="button" className="recent-more" ref={moreRef} aria-label={`More actions for ${name}`} aria-haspopup="menu"
        onClick={() => { const r = moreRef.current!.getBoundingClientRect(); onMenu(r.right, r.bottom, moreRef.current!) }}
      ><Ellipsis aria-hidden="true" /></button>
    </div>
  );
}
