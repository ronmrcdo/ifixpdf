import {Pencil} from 'lucide-react';
import {lazy, Suspense, useEffect} from 'react';
import {useStore} from 'zustand';
import {Editor} from '../../components/editor/Editor';
import {Overlay} from '../../components/editor/markup/Overlay';
import {useTool} from '../../components/editor/markup/tool';
import {documentStore, useDocument} from '../../state/workspaces';
import {EmptyState} from '../EmptyState';

// Loaded on first Document-tab visit so the tool UI stays out of startup.
const ToolStrip = lazy(() =>
  import('../../components/editor/markup/ToolStrip').then((m) => ({default: m.ToolStrip})),
);

export function EditView({onSplit}: {onSplit?: () => void}) {
  const hasPages = useDocument((s) => s.pages.length > 0);
  const tab = useStore(documentStore, (s) => s.tab);
  const files = useStore(documentStore, (s) => s.files);
  // A tool left active on another tab or document must never place an item.
  useEffect(
    () => () => {
      useTool.getState().setTool(null);
      useTool.getState().select(null);
    },
    [tab, files],
  );
  // Selection is an item id, and a duplicated page's items keep theirs.
  useEffect(
    () =>
      documentStore.subscribe((s, prev) => {
        if (s.currentPage !== prev.currentPage) useTool.getState().select(null);
      }),
    [],
  );
  if (!hasPages)
    return (
      <EmptyState
        icon={Pencil}
        title="Open a PDF to edit"
        text="Select, rearrange, rotate, duplicate, extract, or delete pages, then save a copy."
      />
    );
  return (
    <Editor.Root store={documentStore}>
      <Editor.Toolbar />
      {tab === 'document' && (
        <Suspense fallback={<div style={{height: 48, flex: 'none'}} />}>
          <ToolStrip />
        </Suspense>
      )}
      <Editor.Row>
        <Editor.Stage
          caption="Document preview"
          overlay={(view) => <Overlay store={documentStore} view={view} />}
        >
          <Editor.Pages onSplit={onSplit} />
        </Editor.Stage>
        <Editor.Output kind="document" />
      </Editor.Row>
    </Editor.Root>
  );
}
