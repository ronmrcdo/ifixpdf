import {browserPlatform} from './browser';
import {tauriPlatform} from './tauri';

export * from './types';
// The one place that tells Tauri from the browser.
export const platform = '__TAURI_INTERNALS__' in window ? tauriPlatform : browserPlatform;
