import type {Update} from '@tauri-apps/plugin-updater';

// Rust `Error::EmptyEndpoints` in tauri-apps/plugins-workspace plugins/updater/src/error.rs: "Updater does not have any endpoints set."; guest-js check() (node_modules/@tauri-apps/plugin-updater/dist-js/index.js) rejects with that text.
export const isUnconfiguredError = (e: unknown): boolean => String(e).includes('does not have any endpoints set');

/** Loaded on demand so the updater plugin never runs before the user presses Check for updates. */
export const checkForUpdate = async (): Promise<Update | null> => (await import('@tauri-apps/plugin-updater')).check();
