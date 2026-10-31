import {FileText} from 'lucide-react';
import {Editor} from '../../components/editor/Editor';
import {documentStore, useDocument} from '../../state/workspaces';
import {EmptyState} from '../EmptyState';

export function PreviewView() {
  const name = useDocument((s) => s.exportSettings.name);
  const hasPages = useDocument((s) => s.pages.length > 0);
  if (!hasPages) return <EmptyState icon={FileText} title="Open a PDF to preview" text="Read your document here. Use Edit PDF when you want to change its pages." />;
  // Read-only and no Editor.Row: legacy Preview has no .editor, sources or output.
  return (
    <Editor.Root store={documentStore}>
      <Editor.Toolbar readOnly />
      <Editor.Stage readOnly caption={name}><Editor.ReadOnlyPages /></Editor.Stage>
    </Editor.Root>
  );
}
