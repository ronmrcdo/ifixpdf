import {useStore} from 'zustand';
import {createWorkspaceStore, type WorkspaceState} from './workspace';

export const documentStore = createWorkspaceStore('document');
export const mergeStore = createWorkspaceStore('merge');

export const useDocument = <T>(selector: (s: WorkspaceState) => T): T => useStore(documentStore, selector);
export const useMerge = <T>(selector: (s: WorkspaceState) => T): T => useStore(mergeStore, selector);
