import {Pencil} from 'lucide-react';
import {Editor} from '../../components/editor/Editor';
import {documentStore, useDocument} from '../../state/workspaces';
import {EmptyState} from '../EmptyState';

export function EditView({onSplit}: {onSplit?: () => void}) {
  const hasPages = useDocument((s) => s.pages.length > 0);
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
      <Editor.Row>
        <Editor.Stage caption="Document preview">
          <Editor.Pages onSplit={onSplit} />
        </Editor.Stage>
        <Editor.Output kind="document" />
      </Editor.Row>
    </Editor.Root>
  );
}
