import {lazy, Suspense} from 'react';
import type {WorkspaceStore} from '../../../state/workspace';
import type {PageView} from '../Stage';

interface Props {
  store: WorkspaceStore;
  view: PageView;
  readOnly?: boolean;
}

// One lazy chunk for both layers, so the fill/markup UI stays out of startup.
const Layers = lazy(() =>
  Promise.all([import('./MarkupLayer'), import('./FieldLayer')]).then(([m, f]) => ({
    // Fields above markup: their controls take clicks only while no tool is active.
    default: (p: Props) => (
      <>
        <m.MarkupLayer {...p} />
        <f.FieldLayer {...p} />
      </>
    ),
  })),
);

/** Markup and form fields over the displayed page. */
export function Overlay(props: Props) {
  return (
    <Suspense fallback={null}>
      <Layers {...props} />
    </Suspense>
  );
}
