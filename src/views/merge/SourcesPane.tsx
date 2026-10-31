import {closestCenter, DndContext, useSensors, type DragEndEvent} from '@dnd-kit/core';
import {SortableContext, useSortable, verticalListSortingStrategy} from '@dnd-kit/sortable';
import {ArrowDown, ArrowUp, FilePlus2, Files, GripVertical, X} from 'lucide-react';
import {useMemo} from 'react';
import {Thumbnail} from '../../components/pages/Thumbnail';
import {formatSize} from '../../domain/format';
import {formatRanges} from '../../domain/ranges';
import type {SourceFile} from '../../domain/types';
import {pickAndImport} from '../../shell/useFileImport';
import {useApp} from '../../state/app';
import {useStore} from 'zustand';
import {useEditorStore} from '../../components/editor/Editor';
import type {WorkspaceStore} from '../../state/workspace';
import {DRAG_SENSORS} from '../../components/dragSensors';

/** Jumps to the file's first included page on the Document tab. */
function select(store: WorkspaceStore, fileId: string) {
  const s = store.getState();
  const index = s.pages.findIndex((p) => p.fileId === fileId);
  if (index === -1)
    return useApp
      .getState()
      .notify('No pages from this source are currently included. Use Undo to restore them.');
  s.goTo(index);
  s.setTab('document');
}

function onDragEnd(store: WorkspaceStore, {active, over}: DragEndEvent) {
  if (!over || over.id === active.id) return;
  const s = store.getState();
  s.moveFileTo(
    String(active.id),
    s.files.findIndex((f) => f.id === over.id),
  );
}

function SourceRow({
  store,
  file,
  positions,
  first,
  last,
  selected,
}: {
  store: WorkspaceStore;
  file: SourceFile;
  positions: number[];
  first: boolean;
  last: boolean;
  selected: boolean;
}) {
  const {setNodeRef, listeners, isDragging, transform} = useSortable({id: file.id});
  const {name} = file;
  // Only the dragged row follows the pointer, as in the page grid.
  const style =
    isDragging && transform
      ? {transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 5}
      : undefined;
  const s = store.getState();
  return (
    <div
      ref={setNodeRef}
      className={selected ? 'file selected' : 'file'}
      style={style}
      data-file={file.id}
      {...listeners}
    >
      <button
        type="button"
        className="file-select"
        aria-label={`Preview ${name}`}
        aria-pressed={selected}
        onClick={() => select(store, file.id)}
      >
        <span className="grip">
          <GripVertical aria-hidden="true" />
        </span>
        <span className="source-thumb">
          <Thumbnail fileId={file.id} local={0} rotation={0} scale={0.18} />
        </span>
        <span className="file-info">
          <span className="filename" title={name}>
            {name}
          </span>
          <span className="filemeta">
            {positions.length ? `Pages ${formatRanges(positions)}` : 'No pages included'}{' '}
            <span>·</span> {formatSize(file.size)}
          </span>
        </span>
      </button>
      <div className="file-tools">
        <span>{positions.length} included</span>
        <button
          type="button"
          title="Move up"
          aria-label={`Move ${name} up`}
          disabled={first}
          onClick={() => s.moveFile(file.id, -1)}
        >
          <ArrowUp aria-hidden="true" />
        </button>
        <button
          type="button"
          title="Move down"
          aria-label={`Move ${name} down`}
          disabled={last}
          onClick={() => s.moveFile(file.id, 1)}
        >
          <ArrowDown aria-hidden="true" />
        </button>
        <button
          type="button"
          title="Remove file"
          aria-label={`Remove ${name}`}
          onClick={() => s.removeFile(file.id)}
        >
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** Merge's source files, inside Editor.Sources: reorder by drag or buttons, remove, select to jump; then the add zone and page total. */
export function SourcesPane() {
  const store = useEditorStore();
  const files = useStore(store, (s) => s.files);
  const pages = useStore(store, (s) => s.pages);
  const currentFile = useStore(store, (s) => s.pages[s.currentPage]?.fileId);
  const sensors = useSensors(...DRAG_SENSORS);
  const ids = useMemo(() => files.map((f) => f.id), [files]);
  const positions = useMemo(() => {
    const byFile = new Map<string, number[]>();
    pages.forEach((p, i) => {
      const list = byFile.get(p.fileId);
      if (list) list.push(i);
      else byFile.set(p.fileId, [i]);
    });
    return byFile;
  }, [pages]);

  return (
    <>
      <div className="panel-title">
        Source files <span className="count-badge">{files.length}</span>
      </div>
      <p className="hint">Drag files to arrange groups of pages.</p>
      <div className="files">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => onDragEnd(store, e)}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {files.map((f, i) => (
              <SourceRow
                key={f.id}
                store={store}
                file={f}
                positions={positions.get(f.id) ?? []}
                first={i === 0}
                last={i === files.length - 1}
                selected={f.id === currentFile}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
      <button
        type="button"
        className="add-zone"
        data-action="add"
        onClick={() => void pickAndImport()}
      >
        <FilePlus2 aria-hidden="true" />
        <span>Add PDFs or drop them here</span>
      </button>
      <div className="source-summary">
        <Files aria-hidden="true" />
        <span>{pages.length} pages in your merged PDF</span>
      </div>
    </>
  );
}
