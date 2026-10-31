import {closestCenter, DndContext, PointerSensor, useSensor, useSensors, type Announcements, type DragEndEvent, type DragMoveEvent, type DragStartEvent, type UniqueIdentifier} from '@dnd-kit/core';
import {rectSortingStrategy, SortableContext} from '@dnd-kit/sortable';
import {Scissors} from 'lucide-react';
import {startTransition, useEffect, useMemo, useRef, useState} from 'react';
import {useStore} from 'zustand';
import {dropTarget} from '../../domain/pages';
import type {WorkspaceStore} from '../../state/workspace';
import {PageCard} from './PageCard';
import {SelectionBar} from './SelectionBar';

type Drop = {uid: string; side: 'before' | 'after'};

/** The page under the dragged card's centre (closestCenter) and which half it is on, or null over the card itself. */
function dropOf({active, over}: DragMoveEvent | DragEndEvent): Drop | null {
  const rect = active.rect.current.translated;
  if (!over || over.id === active.id || !rect) return null;
  return {uid: String(over.id), side: rect.left + rect.width / 2 > over.rect.left + over.rect.width / 2 ? 'after' : 'before'};
}

// Cards mounted in the first commit; the rest follow in a time-sliced transition, so a long document never blocks the main thread.
const FIRST_CARDS = 48;

const SR_INSTRUCTIONS = {draggable: 'Drag to reorder pages, or press Alt+Left or Alt+Right to move the focused page.'};

/** The editable Pages-tab grid: split (Edit), selection bar, hint and sortable page cards. Render inside the Stage. */
export function PageGrid({store, onSplit}: {store: WorkspaceStore; onSplit?: () => void}) {
  const all = useStore(store, (s) => s.pages);
  const [mounted, setMounted] = useState(false);
  useEffect(() => startTransition(() => setMounted(true)), []);
  const pages = mounted ? all : all.slice(0, FIRST_CARDS);
  const files = useStore(store, (s) => s.files);
  const selected = useStore(store, (s) => s.selection.uids);
  const [drop, setDrop] = useState<Drop | null>(null);
  const moved = useRef<{from: number; to: number} | null>(null); // read by the drag-end announcement, which runs after onDragEnd
  const sensors = useSensors(useSensor(PointerSensor, {activationConstraint: {distance: 4}}));
  const uids = useMemo(() => all.map((p) => p.uid), [all]);
  const names = useMemo(() => new Map(files.map((f) => [f.id, f.name])), [files]);

  const announcements = useMemo((): Announcements => {
    const n = (id: UniqueIdentifier) => store.getState().pages.findIndex((p) => p.uid === id) + 1;
    return {
      onDragStart: ({active}) => `Picked up page ${n(active.id)}.`,
      onDragOver: ({active, over}) => (over ? `Page ${n(active.id)} is over page ${n(over.id)}.` : `Page ${n(active.id)} is not over a page.`),
      onDragEnd: ({active}) => (moved.current ? `Moved page ${moved.current.from} to position ${moved.current.to}` : `Page ${n(active.id)} was dropped in place.`),
      onDragCancel: ({active}) => `Moving was cancelled. Page ${n(active.id)} stays in place.`
    };
  }, [store]);

  const onDragStart = ({active}: DragStartEvent) => {
    const s = store.getState();
    if (!s.selection.uids.has(String(active.id))) s.select(String(active.id), {ctrl: false, shift: false});
  };
  const onDragMove = (e: DragMoveEvent) => {
    const next = dropOf(e);
    setDrop((d) => (d?.uid === next?.uid && d?.side === next?.side ? d : next));
  };
  const onDragEnd = (e: DragEndEvent) => {
    setDrop(null);
    moved.current = null;
    const d = dropOf(e);
    if (!d) return;
    const s = store.getState();
    const from = s.pages.findIndex((p) => p.uid === e.active.id);
    const target = dropTarget(s.pages, s.selection.uids, s.pages.findIndex((p) => p.uid === d.uid) + (d.side === 'after' ? 1 : 0));
    s.move(target);
    const to = store.getState().pages.findIndex((p) => p.uid === e.active.id);
    if (to !== from) moved.current = {from: from + 1, to: to + 1};
  };

  return (
    // display: contents, so the bar, hint and cards stay items of the stage's grid.
    <div className="page-grid" data-shortcut-scope="grid">
      {onSplit && <button type="button" className="secondary split-command" onClick={onSplit}><Scissors aria-hidden="true" /> Split PDF</button>}
      <SelectionBar store={store} />
      <p className="page-drag-hint">Drag to reorder · Ctrl-click to select · Shift-click for a range · Double-click to preview</p>
      <DndContext
        sensors={sensors} collisionDetection={closestCenter} accessibility={{announcements, screenReaderInstructions: SR_INSTRUCTIONS}}
        onDragStart={onDragStart} onDragMove={onDragMove} onDragEnd={onDragEnd} onDragCancel={() => setDrop(null)}
      >
        <SortableContext items={uids} strategy={rectSortingStrategy}>
          {pages.map((p, i) => (
            <PageCard
              key={p.uid} store={store} uid={p.uid} fileId={p.fileId} local={p.local} rotation={p.rotation}
              fileName={names.get(p.fileId) ?? ''} index={i} last={i === all.length - 1} selected={selected.has(p.uid)}
              drop={drop?.uid === p.uid ? drop.side : null}
            />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
