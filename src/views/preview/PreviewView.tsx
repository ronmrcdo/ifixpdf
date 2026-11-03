import {FileText} from 'lucide-react';
import {lazy, Suspense} from 'react';
import {Editor} from '../../components/editor/Editor';
import {documentStore, useDocument} from '../../state/workspaces';
import {EmptyState} from '../EmptyState';
// Loaded only when the current page has something to draw, so plain previews stay as fast as before.
const MarkupLayer = lazy(() =>
  import('../../components/editor/markup/MarkupLayer').then((m) => ({default: m.MarkupLayer})),
);

export function PreviewView() {
  const drawn = useDocument((s) => {
    const p = s.pages[s.currentPage];
    return !!p && (!!p.markup?.length || Object.keys(s.fills[p.fileId] ?? {}).length > 0);
  });
  const name = useDocument((s) => s.exportSettings.name);
  const hasPages = useDocument((s) => s.pages.length > 0);
  if (!hasPages)
    return (
      <EmptyState
        icon={FileText}
        title="Open a PDF to preview"
        text="Read your document here. Use Edit PDF when you want to change its pages."
      />
    );
  // Read-only and no Editor.Row: legacy Preview has no .editor, sources or output.
  return (
    <Editor.Root store={documentStore}>
      <Editor.Toolbar readOnly />
      <Editor.Stage
        readOnly
        caption={name}
        overlay={
          drawn
            ? (view) => (
                <Suspense fallback={null}>
                  <MarkupLayer store={documentStore} view={view} readOnly />
                </Suspense>
              )
            : undefined
        }
      >
        <Editor.ReadOnlyPages />
      </Editor.Stage>
    </Editor.Root>
  );
}
