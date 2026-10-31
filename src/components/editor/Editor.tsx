import {createContext, use, type ReactNode} from 'react';
import {useStore} from 'zustand';
import type {WorkspaceKind, WorkspaceStore} from '../../state/workspace';
import {PageGrid} from '../pages/PageGrid';
import {ReadOnlyPages as ReadOnlyGrid} from '../pages/ReadOnlyPages';
import {OutputInspector} from './OutputInspector';
import {Stage as PageStage} from './Stage';
import {Toolbar as TabsToolbar} from './Toolbar';

const StoreContext = createContext<WorkspaceStore | null>(null);

/** The workspace store of the enclosing Editor.Root; for slot contents such as Merge's sources list. */
export function useEditorStore(): WorkspaceStore {
  const store = use(StoreContext);
  if (!store) throw new Error('Editor parts must be inside Editor.Root');
  return store;
}

/** Provides the workspace to every part; renders no DOM, so the Toolbar can sit above the Row. */
function Root({store, children}: {store: WorkspaceStore; children: ReactNode}) {
  return <StoreContext value={store}>{children}</StoreContext>;
}

/** The editor row of Edit and Merge (sources, stage, output); Preview has none. */
function Row({children}: {children: ReactNode}) {
  const showOutput = useStore(useEditorStore(), (s) => s.showOutput);
  return <div className={showOutput ? 'editor show-output' : 'editor'}>{children}</div>;
}

function Toolbar({readOnly}: {readOnly?: boolean}) {
  return <TabsToolbar store={useEditorStore()} readOnly={readOnly} />;
}

function Sources({children}: {children: ReactNode}) {
  return <section className="sources" aria-label="Source PDFs">{children}</section>;
}

function Stage({caption, readOnly, children}: {caption: string; readOnly?: boolean; children?: ReactNode}) {
  return <PageStage store={useEditorStore()} caption={caption} readOnly={readOnly}>{children}</PageStage>;
}

function Pages({onSplit}: {onSplit?: () => void}) {
  return <PageGrid store={useEditorStore()} onSplit={onSplit} />;
}

function ReadOnlyPages() {
  return <ReadOnlyGrid store={useEditorStore()} />;
}

function Output({kind}: {kind: WorkspaceKind}) {
  return <OutputInspector store={useEditorStore()} kind={kind} />;
}

/** Views compose these slots inside Editor.Root; the prop-taking components stay the implementations. */
export const Editor = {Root, Row, Toolbar, Sources, Stage, Pages, ReadOnlyPages, Output};
