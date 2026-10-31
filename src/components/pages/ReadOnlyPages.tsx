import {useStore} from 'zustand';
import type {WorkspaceStore} from '../../state/workspace';
import {ThumbnailButton} from './ThumbnailButton';

/** Preview's Pages tab: thumbnails with no selection. Clicking one opens that page on the Document tab. Render inside the Stage. */
export function ReadOnlyPages({store}: {store: WorkspaceStore}) {
  const pages = useStore(store, (s) => s.pages);
  return pages.map((p, i) => (
    <ThumbnailButton
      key={p.uid} fileId={p.fileId} local={p.local} rotation={p.rotation} className="read-page-thumbnail" aria-label={`Preview page ${i + 1}`}
      onClick={() => { const s = store.getState(); s.goTo(i); s.setTab('document') }}
    ><span>Page {i + 1}</span></ThumbnailButton>
  ));
}
