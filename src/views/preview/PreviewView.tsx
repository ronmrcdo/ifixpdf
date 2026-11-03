import {FileText} from 'lucide-react';
import {Editor} from '../../components/editor/Editor';
import {Overlay} from '../../components/editor/markup/Overlay';
import {documentStore, useDocument} from '../../state/workspaces';
import {EmptyState} from '../EmptyState';

export function PreviewView() {
  // The overlay loads only when the page has markup or its file has fills, so plain previews stay
  // as fast as before. Unfilled forms need no overlay: pdf.js draws their own values.
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
          drawn ? (view) => <Overlay store={documentStore} view={view} readOnly /> : undefined
        }
      >
        <Editor.ReadOnlyPages />
      </Editor.Stage>
    </Editor.Root>
  );
}
