import {Pencil} from 'lucide-react';
import {lazy, Suspense, useEffect} from 'react';
import {useStore} from 'zustand';
import {Editor} from '../../components/editor/Editor';
import {useTool} from '../../components/editor/markup/tool';
import {documentStore, useDocument} from '../../state/workspaces';
import {EmptyState} from '../EmptyState';

// Loaded on first Document-tab visit so the tool UI stays out of startup.
const ToolStrip = lazy(() =>
  import('../../components/editor/markup/ToolStrip').then((m) => ({default: m.ToolStrip})),
);
const MarkupLayer = lazy(() =>
  import('../../components/editor/markup/MarkupLayer').then((m) => ({default: m.MarkupLayer})),
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
          overlay={(view) => (
            <Suspense fallback={null}>
              <MarkupLayer store={documentStore} view={view} />
            </Suspense>
          )}
        >
          <Editor.Pages onSplit={onSplit} />
        </Editor.Stage>
        <Editor.Output kind="document" />
      </Editor.Row>
    </Editor.Root>
  );
}
