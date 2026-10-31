import {useSortable} from '@dnd-kit/sortable';
import {ChevronLeft, ChevronRight} from 'lucide-react';
import {memo, type KeyboardEvent} from 'react';
import {flushSync} from 'react-dom';
import {dropTarget} from '../../domain/pages';
import type {PageUid, Rotation} from '../../domain/types';
import type {WorkspaceStore} from '../../state/workspace';
import {ThumbnailButton} from './ThumbnailButton';
import {useFlip} from './useFlip';

export interface PageCardProps {
  store: WorkspaceStore;
  uid: PageUid;
  fileId: string;
  local: number;
  rotation: Rotation;
  fileName: string;
  index: number;
  last: boolean;
  selected: boolean;
  drop: 'before' | 'after' | null;
}

const indexOf = (store: WorkspaceStore, uid: PageUid) =>
  store.getState().pages.findIndex((p) => p.uid === uid);

function open(store: WorkspaceStore, uid: PageUid) {
  const s = store.getState();
  s.goTo(indexOf(store, uid));
  s.setTab('document');
}

/** Moves the page one place (with the selection, if it is selected) and puts focus back after React re-orders the nodes. */
function moveBy(store: WorkspaceStore, uid: PageUid, dir: -1 | 1, focus: HTMLElement) {
  const s = store.getState();
  const i = indexOf(store, uid);
  if (i + dir < 0 || i + dir >= s.pages.length) return;
  const uids = s.selection.uids.has(uid) ? s.selection.uids : new Set([uid]);
  // Slot i-1 is before the previous page; slot i+2 is after the next one.
  flushSync(() => s.move(dropTarget(s.pages, uids, dir === -1 ? i - 1 : i + 2), uids));
  focus.focus({preventScroll: true});
}

function Card({
  store,
  uid,
  fileId,
  local,
  rotation,
  fileName,
  index,
  last,
  selected,
  drop,
}: PageCardProps) {
  const {setNodeRef, node, listeners, isDragging, transform} = useSortable({id: uid});
  useFlip(node, index, isDragging);
  const n = index + 1;

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      moveBy(store, uid, e.key === 'ArrowLeft' ? -1 : 1, e.currentTarget);
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      open(store, uid);
    }
  };
  const select = (mods: {ctrl: boolean; shift: boolean}) => {
    const s = store.getState();
    s.select(uid, mods);
    s.goTo(indexOf(store, uid));
  };

  const className = [
    'page-card',
    selected && 'is-selected',
    isDragging && 'dragging',
    drop && `drop-${drop}`,
  ]
    .filter(Boolean)
    .join(' ');
  // Only the dragged card follows the pointer; the others stay put and show insertion marks instead of shuffling.
  const style =
    isDragging && transform
      ? {transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 5}
      : undefined;
  return (
    <div
      ref={setNodeRef}
      className={className}
      style={style}
      data-uid={uid}
      role="group"
      aria-label={`Page ${n}, ${fileName}`}
      {...listeners}
    >
      <label className="page-check">
        <input
          type="checkbox"
          aria-label={`Select page ${n}`}
          checked={selected}
          onChange={(e) =>
            select({
              ctrl: true,
              shift: e.nativeEvent instanceof MouseEvent && e.nativeEvent.shiftKey,
            })
          }
        />
      </label>
      <ThumbnailButton
        fileId={fileId}
        local={local}
        rotation={rotation}
        className="page-thumbnail"
        aria-label={`Preview page ${n}`}
        aria-pressed={selected}
        onClick={(e) => select({ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey})}
        onDoubleClick={() => open(store, uid)}
        onKeyDown={onKeyDown}
      >
        <span className="thumbnail-label">
          <strong>{n}</strong>
          <span title={fileName}>{fileName}</span>
        </span>
      </ThumbnailButton>
      <div className="page-move-controls">
        <button
          type="button"
          aria-label={`Move page ${n} earlier`}
          disabled={index === 0}
          onClick={(e) => moveBy(store, uid, -1, e.currentTarget)}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <span>Page {n}</span>
        <button
          type="button"
          aria-label={`Move page ${n} later`}
          disabled={last}
          onClick={(e) => moveBy(store, uid, 1, e.currentTarget)}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// fileId, local, fileName and store never change for a uid, so they are left out.
const same = (a: PageCardProps, b: PageCardProps) =>
  a.uid === b.uid &&
  a.rotation === b.rotation &&
  a.selected === b.selected &&
  a.index === b.index &&
  a.last === b.last &&
  a.drop === b.drop;

/** One editable page card, keyed by uid; re-renders only when its own state changes, so moves don't remount or reload it. */
export const PageCard = memo(Card, same);
