import {useLayoutEffect, useRef} from 'react';
import {version as appVersion} from '../../package.json';
import {checkForUpdate} from '../platform/updater';
import {saveDraftNow} from '../state/draft-sync';
import {useApp} from '../state/app';
import {busy} from '../state/work';
import {
  dispatchUpdate,
  runCheck,
  runDownload,
  runInstall,
  useUpdates,
  type UpdateDeps,
  type UpdateHandle,
  type UpdateState,
  type UpdateStatus,
} from './machine';

type Action = 'check' | 'download' | 'install';
const CHECK = {action: 'check', label: 'Check for updates'} as const;
const RETRY = {action: 'check', label: 'Retry'} as const;
const INSTALL = {action: 'install', label: 'Restart and install', primary: true} as const;
const RETRY_INSTALL = {action: 'install', label: 'Retry'} as const;
type Button = {action: Action; label: string; primary?: boolean};

const view: Record<UpdateStatus, (s: UpdateState) => [string, Button?]> = {
  browser: () => [
    'Updates are available in the installed desktop app. This browser preview cannot update itself.',
  ],
  idle: () => ['Check whether a newer version is available.', CHECK],
  checking: () => ['Checking for updates…'],
  current: () => ['iFixPDF is up to date.', CHECK],
  unconfigured: () => [
    'The update service is not configured in this development build. Install new versions manually.',
    CHECK,
  ],
  offline: () => ["You're offline. Connect to the internet and try again.", RETRY],
  error: () => ["Couldn't check for updates. Try again later.", RETRY],
  available: (s) => [
    `iFixPDF ${s.version} is available.`,
    {action: 'download', label: 'Download update', primary: true},
  ],
  downloading: (s) => [`Downloading iFixPDF ${s.version}…`],
  'download-error': () => [
    'Download failed. Check your connection and try again.',
    {action: 'download', label: 'Retry'},
  ],
  ready: (s) => [
    `iFixPDF ${s.version} is ready. Your Preview and Edit draft is saved before restarting; Merge PDFs starts empty.`,
    INSTALL,
  ],
  'save-error': () => [
    "iFixPDF couldn't save your Preview and Edit draft, so the update was not installed. Save your PDF, then try again.",
    INSTALL,
  ],
  installing: () => ['Installing update…'],
  'install-error': () => [
    "The update couldn't be installed. Try again, or install the new version manually.",
    RETRY_INSTALL,
  ],
  restart: () => ['Update installed. Restart iFixPDF to finish.'],
};
const SHOW_NOTES: UpdateStatus[] = ['available', 'download-error', 'ready', 'save-error'];

const defaultDeps: UpdateDeps = {
  check: checkForUpdate,
  online: () => navigator.onLine,
  busy,
  saveDraft: saveDraftNow,
  notify: (text) => useApp.getState().notify(text),
};
// Held here, not in the store: the plugin's Update is a native resource, and it must outlive the row.
let update: UpdateHandle | null = null;

function Progress({done, total}: {done: number; total?: number}) {
  if (total)
    return (
      <div className="progress-wrap">
        <progress max={total} value={done} />
        <span>{Math.round((done / total) * 100)}%</span>
      </div>
    );
  return (
    <div className="progress-wrap">
      <progress />
      <span>{(done / 1048576).toFixed(1)} MB</span>
    </div>
  );
}

export function UpdatesRow({deps = defaultDeps}: {deps?: UpdateDeps}) {
  const s = useUpdates();
  const [text, button] = view[s.status](s);
  const ref = useRef<HTMLDivElement>(null);
  const hadFocus = useRef(false);

  // A focused button disappears when the state changes; put focus on the new action (or the row) instead of dropping it to <body>.
  useLayoutEffect(() => {
    if (hadFocus.current)
      (ref.current?.querySelector<HTMLElement>('.update-action button') ?? ref.current)?.focus();
  }, [s.status]);

  const act = async (action: Action) => {
    if (action === 'check') update = await runCheck(deps, dispatchUpdate);
    else if (update && action === 'download') await runDownload(update, dispatchUpdate);
    else if (update) await runInstall(update, deps, dispatchUpdate);
  };

  return (
    <div
      className="settings-row"
      id="updates"
      ref={ref}
      tabIndex={-1}
      onFocus={() => {
        hadFocus.current = true;
      }}
      // A blur from a removed button keeps the flag; a blur to anywhere else clears it.
      onBlur={(e) => {
        if ((e.target as Node).isConnected) hadFocus.current = false;
      }}
    >
      <div>
        Updates
        <p>Installed version {appVersion}</p>
        <p className="update-status" aria-live="polite">
          {text}
        </p>
        <div className="update-detail">
          {s.notes && SHOW_NOTES.includes(s.status) && <p className="update-notes">{s.notes}</p>}
          {s.status === 'downloading' && s.progress && <Progress {...s.progress} />}
        </div>
      </div>
      <div className="update-action">
        {button && (
          <button
            type="button"
            className={button.primary ? 'primary' : 'secondary'}
            data-update={button.action}
            onClick={() => void act(button.action)}
          >
            {button.label}
          </button>
        )}
      </div>
    </div>
  );
}
