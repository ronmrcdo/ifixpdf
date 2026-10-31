import {Files, FolderOpen, ShieldCheck} from 'lucide-react';
import {useCallback, useEffect, useRef, useState} from 'react';
import {busyExporting} from '../../actions/save';
import {putBytes} from '../../pdf/bytes';
import {release, retain} from '../../pdf/registry';
import {renderBlob} from '../../pdf/thumbnails';
import {FileMissingError, platform, type PickedFile} from '../../platform';
import {navigate, openErrorText, openRecent} from '../../shell/route';
import {pickAndImport} from '../../shell/useFileImport';
import {useApp} from '../../state/app';
import {mergeStore} from '../../state/workspaces';
import {recents} from '../../storage/app-recents';
import type {RecentEntry} from '../../storage/recents';
import {RecentMenu, type Command} from './RecentMenu';
import {RecentRow} from './RecentRow';

interface MenuState {
  entry: RecentEntry;
  x: number;
  y: number;
  trigger: HTMLElement;
}
const notify = (text: string) => useApp.getState().notify(text, 'error');

export function HomeView({onAddPassword}: {onAddPassword(entry: RecentEntry): void}) {
  const [entries, setEntries] = useState<RecentEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [menu, setMenu] = useState<MenuState | null>(null);
  const tried = useRef(new Set<string>()); // a thumbnail that failed is not retried

  const reload = useCallback(async () => {
    try {
      setEntries(await recents.list());
    } catch {
      setFailed(true);
    }
  }, []);
  useEffect(() => {
    recents.list().then(setEntries, () => setFailed(true));
  }, []);

  const selected = (entries ?? []).filter((e) => checked.has(e.id) && !e.missing).map((e) => e.id);

  async function open(id: string, view: 'preview' | 'edit') {
    if (await openRecent(id)) navigate(view);
    else void reload();
  }

  async function locate(id: string) {
    try {
      const [picked] = await platform.pickPdfs({multiple: false});
      if (!picked) return;
      await recents.relocate(id, {name: picked.name, bytes: picked.bytes, path: picked.path ?? ''});
      await reload();
    } catch {
      notify('Could not locate that PDF.');
    }
  }

  async function remove(id: string) {
    try {
      await recents.remove(id);
    } catch {
      notify('Could not remove that PDF from recents.');
    }
    setChecked((c) => new Set([...c].filter((x) => x !== id)));
    await reload();
  }

  async function merge(ids: string[]) {
    if (busyExporting(mergeStore)) return;
    const picked: PickedFile[] = [];
    try {
      for (const id of ids) {
        const {entry, bytes} = await recents.open(id);
        picked.push({name: entry.name, bytes, path: entry.path});
      }
    } catch (e) {
      notify(openErrorText(e));
      void reload();
      return;
    }
    const store = mergeStore.getState();
    try {
      await store.reset();
      await store.addFiles(picked);
    } catch {
      notify('Could not prepare those PDFs for merging.');
      return;
    }
    const added = mergeStore.getState().files.length;
    if (!added) return; // addFiles already toasted why each file was rejected
    store.setWorkflow('review');
    store.setTab('pages');
    useApp
      .getState()
      .notify(
        added === 1
          ? 'Add another PDF to merge with this document.'
          : `${added} PDFs ready to merge.`,
      );
    navigate('merge');
  }

  async function needThumb(entry: RecentEntry) {
    if (tried.current.has(entry.id)) return;
    tried.current.add(entry.id);
    const fileId = crypto.randomUUID(); // a throwaway registry id, so the render never collides with an open document
    try {
      const {bytes} = await recents.open(entry.id);
      putBytes(fileId, bytes);
      retain(fileId, 'home-thumb');
      let thumbnail: Blob;
      try {
        thumbnail = await renderBlob(fileId, 0, 0, 0.18);
      } finally {
        await release(fileId, 'home-thumb');
      }
      await recents.updateThumbnail(entry.id, thumbnail); // no-op if the row was removed meanwhile
      setEntries((list) => list?.map((e) => (e.id === entry.id ? {...e, thumbnail} : e)) ?? null);
    } catch (e) {
      if (e instanceof FileMissingError) void reload();
    }
  }

  const closeMenu = useCallback((restore: boolean) => {
    setMenu((m) => {
      if (restore) m?.trigger.focus();
      return null;
    });
  }, []);

  function command(c: Command, entry: RecentEntry) {
    closeMenu(true);
    if (c === 'view') void open(entry.id, 'preview');
    if (c === 'edit') void open(entry.id, 'edit');
    if (c === 'password') onAddPassword(entry);
    if (c === 'remove') void remove(entry.id);
    if (c === 'merge') void merge([...new Set([entry.id, ...selected])]);
  }

  const toggle = (id: string, on: boolean) =>
    setChecked((c) => {
      const next = new Set(c);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <section className="view editor-home">
      <div className="home-command-row">
        <button
          type="button"
          className="secondary"
          data-action="new-combine"
          onClick={() => navigate('merge')}
        >
          <Files aria-hidden="true" /> Merge PDFs
        </button>
        <button
          type="button"
          className="secondary"
          data-action="merge-selected"
          disabled={!selected.length}
          onClick={() => void merge(selected)}
        >
          <Files aria-hidden="true" /> Merge selected{' '}
          <span id="recent-selection-count">{selected.length ? `(${selected.length})` : ''}</span>
        </button>
        <span>
          <ShieldCheck aria-hidden="true" /> Stored on this device
        </span>
      </div>
      <div className="recent-heading">
        <h2>Recent PDFs</h2>
        <span>Last opened</span>
      </div>
      <div className="recent-files">
        {failed && (
          <p className="hint">Recent documents could not be loaded. Add a PDF to continue.</p>
        )}
        {!failed && !entries && <p className="hint">Loading recent documents…</p>}
        {entries && !entries.length && (
          <div className="empty">
            <FolderOpen aria-hidden="true" />
            <h2>No recent PDFs yet</h2>
            <p>Add a PDF to start your workspace.</p>
            <button
              type="button"
              className="secondary"
              data-action="add"
              onClick={() => void pickAndImport()}
            >
              Add PDFs
            </button>
          </div>
        )}
        {entries?.map((entry) => (
          <RecentRow
            key={entry.id}
            entry={entry}
            selected={selected.includes(entry.id)}
            onCheck={(on) => toggle(entry.id, on)}
            onOpen={() => void open(entry.id, 'preview')}
            onMenu={(x, y, trigger) => setMenu({entry, x, y, trigger})}
            onLocate={() => void locate(entry.id)}
            onRemove={() => void remove(entry.id)}
            onNeedThumb={() => void needThumb(entry)}
          />
        ))}
      </div>
      {menu && (
        <RecentMenu
          name={menu.entry.name}
          x={menu.x}
          y={menu.y}
          onClose={closeMenu}
          onCommand={(c) => command(c, menu.entry)}
        />
      )}
    </section>
  );
}
