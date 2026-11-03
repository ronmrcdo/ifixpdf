import {Pencil} from 'lucide-react';
import {lazy, Suspense} from 'react';
import {useStore} from 'zustand';
import {Editor} from '../../components/editor/Editor';
import {documentStore, useDocument} from '../../state/workspaces';
import {EmptyState} from '../EmptyState';

// Loaded on first Document-tab visit so the tool UI stays out of startup.
const ToolStrip = lazy(() =>
  import('../../components/editor/markup/ToolStrip').then((m) => ({default: m.ToolStrip})),
);

export function EditView({onSplit}: {onSplit?: () => void}) {
  const hasPages = useDocument((s) => s.pages.length > 0);
  const tab = useStore(documentStore, (s) => s.tab);
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
        <Suspense fallback={null}>
          <ToolStrip />
        </Suspense>
      )}
      <Editor.Row>
        <Editor.Stage caption="Document preview">
          <Editor.Pages onSplit={onSplit} />
        </Editor.Stage>
        <Editor.Output kind="document" />
      </Editor.Row>
    </Editor.Root>
  );
}
