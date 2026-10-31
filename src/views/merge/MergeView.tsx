import {Editor} from '../../components/editor/Editor';
import {mergeStore, useMerge} from '../../state/workspaces';
import {AddStage} from './AddStage';
import {DoneScreen} from './DoneScreen';
import {SourcesPane} from './SourcesPane';
import {WorkflowBar} from './WorkflowBar';

/** Merge: the workflow strip over the Add stage, the editor (sources, stage, output) or the Done screen. */
export function MergeView() {
  const workflow = useMerge((s) => s.workflow);
  const completed = useMerge((s) => s.completed);
  const hasPages = useMerge((s) => s.pages.length > 0);

  let body = <AddStage />;
  if (workflow === 'done' && completed) body = <DoneScreen result={completed} />;
  else if (hasPages) body = (
    <Editor.Root store={mergeStore}>
      <Editor.Toolbar />
      <Editor.Row>
        <Editor.Sources><SourcesPane /></Editor.Sources>
        <Editor.Stage caption="Merged preview"><Editor.Pages /></Editor.Stage>
        <Editor.Output kind="merge" />
      </Editor.Row>
    </Editor.Root>
  );
  return <><WorkflowBar />{body}</>;
}
