import {create} from 'zustand';
import type {DownloadEvent} from '@tauri-apps/plugin-updater';
import {platform} from '../platform';
import {isUnconfiguredError} from '../platform/updater';

export type UpdateStatus = 'browser' | 'idle' | 'checking' | 'current' | 'unconfigured' | 'offline' | 'error' | 'available'
  | 'downloading' | 'ready' | 'download-error' | 'installing' | 'save-error' | 'install-error' | 'restart';

export interface UpdateState {
  status: UpdateStatus;
  notes?: string;
  version?: string;
  progress?: {done: number; total?: number};
}

export type UpdateEvent =
  | {type: 'check' | 'none' | 'download' | 'downloaded' | 'download-failed' | 'install' | 'save-failed' | 'installed' | 'install-failed'}
  | {type: 'found'; version: string; notes?: string}
  | {type: 'check-failed'; reason: 'unconfigured' | 'offline' | 'error'}
  | {type: 'download-event'; event: DownloadEvent};

const keep = (s: UpdateState, status: UpdateStatus): UpdateState => ({status, version: s.version, notes: s.notes});

function progressed(s: UpdateState, event: DownloadEvent): UpdateState {
  if (s.status !== 'downloading') return s; // a late event after the download settled
  if (event.event === 'Started') return {...s, progress: {done: 0, total: event.data.contentLength || undefined}};
  if (event.event === 'Progress') return {...s, progress: {...s.progress, done: (s.progress?.done ?? 0) + event.data.chunkLength}};
  return s;
}

export function reduce(s: UpdateState, e: UpdateEvent): UpdateState {
  switch (e.type) {
    case 'check': return {status: 'checking'};
    case 'none': return {status: 'current'};
    case 'found': return {status: 'available', version: e.version, notes: e.notes};
    case 'check-failed': return {status: e.reason};
    case 'download': return {...keep(s, 'downloading'), progress: {done: 0}};
    case 'download-event': return progressed(s, e.event);
    case 'downloaded': return keep(s, 'ready');
    case 'download-failed': return keep(s, 'download-error');
    case 'install': return keep(s, 'installing');
    case 'save-failed': return keep(s, 'save-error');
    case 'installed': return keep(s, 'restart');
    case 'install-failed': return keep(s, 'install-error');
  }
}

/** The part of the plugin's Update that the effects use. */
export interface UpdateHandle {
  version: string;
  body?: string;
  download(onEvent: (e: DownloadEvent) => void): Promise<void>;
  install(): Promise<void>;
}

export interface UpdateDeps {
  check(): Promise<UpdateHandle | null>;
  online(): boolean;
  busy(): boolean;
  saveDraft(): Promise<void>;
  notify(text: string): void;
}
type Dispatch = (e: UpdateEvent) => void;

export async function runCheck(deps: Pick<UpdateDeps, 'check' | 'online'>, dispatch: Dispatch): Promise<UpdateHandle | null> {
  dispatch({type: 'check'});
  try {
    const update = await deps.check();
    dispatch(update ? {type: 'found', version: update.version, notes: update.body} : {type: 'none'});
    return update;
  } catch (e) {
    if (isUnconfiguredError(e)) dispatch({type: 'check-failed', reason: 'unconfigured'});
    else dispatch({type: 'check-failed', reason: deps.online() ? 'error' : 'offline'});
    return null;
  }
}

export async function runDownload(update: UpdateHandle, dispatch: Dispatch): Promise<void> {
  dispatch({type: 'download'});
  try {
    await update.download((event) => dispatch({type: 'download-event', event}));
    dispatch({type: 'downloaded'});
  } catch {
    dispatch({type: 'download-failed'});
  }
}

// On Windows, install() hands off to the NSIS installer and exits the app, which then restarts.
export async function runInstall(update: UpdateHandle, deps: Pick<UpdateDeps, 'busy' | 'saveDraft' | 'notify'>, dispatch: Dispatch): Promise<void> {
  if (deps.busy()) return deps.notify('Install the update after your export finishes.');
  try {
    await deps.saveDraft();
  } catch {
    return dispatch({type: 'save-failed'});
  }
  dispatch({type: 'install'});
  try {
    await update.install();
    dispatch({type: 'installed'});
  } catch {
    dispatch({type: 'install-failed'});
  }
}

/** Lives outside React so Settings keeps the state while the user is in another view. */
export const useUpdates = create<UpdateState>()(() => ({status: platform.native ? 'idle' : 'browser'}));
export const dispatchUpdate: Dispatch = (e) => useUpdates.setState((s) => reduce(s, e), true);
