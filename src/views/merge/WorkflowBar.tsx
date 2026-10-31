import {CircleCheck} from 'lucide-react';
import {continueToSave} from '../../actions/save';
import {pickAndImport} from '../../shell/useFileImport';
import type {WorkspaceState} from '../../state/workspace';
import {mergeStore, useMerge} from '../../state/workspaces';

type Step = WorkspaceState['workflow'];
const STEPS: Array<[Step, string]> = [
  ['add', 'Add PDFs'],
  ['review', 'Arrange & review'],
  ['save', 'Save PDF'],
  ['done', 'Done'],
];

const ACTIONS: Record<Step, () => void> = {
  add: () => void pickAndImport(),
  review: () => {
    const s = mergeStore.getState();
    s.setWorkflow('review');
    s.setShowOutput(false);
  },
  save: () => continueToSave(mergeStore),
  done: () => {},
};

/** The Merge task strip: Add PDFs → Arrange & review → Save PDF → Done. Done is never clickable; Add is always. */
export function WorkflowBar() {
  const workflow = useMerge((s) => s.workflow);
  const files = useMerge((s) => s.files.length);
  const total = useMerge((s) => s.pages.length);
  const current = STEPS.findIndex(([id]) => id === workflow);
  return (
    <nav className="combine-workflow" aria-label="Merge PDF workflow">
      <ol>
        {STEPS.map(([id, label], n) => {
          let state: string | undefined;
          if (n === current) state = 'current';
          else if (n < current) state = 'complete';
          return (
            <li key={id} className={state}>
              <button
                type="button"
                aria-current={n === current ? 'step' : undefined}
                disabled={id === 'done' || (!total && id !== 'add')}
                onClick={ACTIONS[id]}
              >
                <span className="step-marker">
                  {n < current ? <CircleCheck aria-hidden="true" /> : n + 1}
                </span>
                <span>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <span className="workflow-summary">
        {total ? `${files} files · ${total} pages` : 'Start a new document'}
      </span>
    </nav>
  );
}
