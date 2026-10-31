import {create} from 'zustand';

export type View = 'home' | 'merge' | 'preview' | 'edit' | 'settings';
type Tone = 'info' | 'error';

export interface AppState {
  view: View;
  toast: {text: string; tone: Tone; id: number} | null;
  openAfter: boolean;
  /** Whether the last document-draft write succeeded. */
  draft: 'saved' | 'failed';
  /** The last of Preview/Edit the user was in; the document draft reopens there. */
  documentView: 'preview' | 'edit';
  /** The workspace Home and Settings act on: the last of Merge or Preview/Edit visited. */
  workspace: 'document' | 'merge';
  setView(v: View): void;
  notify(text: string, tone?: Tone): void;
}

let toastId = 0;

export const useApp = create<AppState>()((set) => ({
  view: 'home',
  toast: null,
  openAfter: true,
  draft: 'saved',
  documentView: 'preview',
  workspace: 'merge',
  setView: (view) => {
    if (view === 'preview' || view === 'edit')
      return set({view, documentView: view, workspace: 'document'});
    if (view === 'merge') return set({view, workspace: 'merge'});
    set({view});
  },
  notify: (text, tone = 'info') => set({toast: {text, tone, id: ++toastId}}),
}));
