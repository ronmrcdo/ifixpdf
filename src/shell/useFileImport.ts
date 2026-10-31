import {useEffect} from 'react';
import {platform, type PickedFile} from '../platform';
import {useApp, type View} from '../state/app';
import {documentStore, mergeStore} from '../state/workspaces';
import {navigate, OPEN_FAILED, recordOpen} from './route';

/** Home, Preview and Edit open the first PDF; every other view adds all of them to Merge. `view` is where the pick started. */
async function importFiles(
  picked: PickedFile[],
  view: View = useApp.getState().view,
): Promise<void> {
  const first = picked[0];
  if (!first) return;
  if (view === 'home' || view === 'preview' || view === 'edit') {
    const before = documentStore.getState().files;
    await documentStore.getState().replaceWith(first);
    const [file] = documentStore.getState().files;
    if (!file || documentStore.getState().files === before) return; // invalid, or an export is running
    if (view !== 'edit') navigate('preview');
    await recordOpen(documentStore, file, first);
    return;
  }
  const before = new Set(mergeStore.getState().files.map((f) => f.id));
  await mergeStore.getState().addFiles(picked);
  const added = mergeStore.getState().files.filter((f) => !before.has(f.id));
  if (!added.length) return;
  navigate('merge');
  // addFiles keeps picked order and skips invalid files, so match added files to picks by name and path in order.
  const queue = [...picked];
  await Promise.all(
    added.map((file) => {
      const i = queue.findIndex((p) => p.name === file.name && p.path === file.path);
      return recordOpen(mergeStore, file, queue.splice(i, 1)[0]!);
    }),
  );
}

/** Opens the native/browser picker (single file where one is opened, several for Merge) and imports the result. */
export async function pickAndImport(): Promise<void> {
  const {view, notify} = useApp.getState();
  try {
    await importFiles(
      await platform.pickPdfs({multiple: view === 'merge' || view === 'settings'}),
      view,
    );
  } catch {
    notify(OPEN_FAILED, 'error');
  }
}

/** Imports dropped files and shows the drop highlight on the workspace while a drag is over the window. */
export function useFileImport(): void {
  useEffect(() => {
    const highlight = (on: boolean) =>
      document.querySelector('.workspace')?.classList.toggle('drop-active', on);
    return platform.onFileDrop((e) => {
      highlight(e.type === 'over');
      if (e.type === 'drop') void importFiles(e.files);
      if (e.type === 'error') useApp.getState().notify(OPEN_FAILED, 'error');
    });
  }, []);
}
