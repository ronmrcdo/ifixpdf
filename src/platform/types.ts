export interface PickedFile { name: string; bytes: Uint8Array; path?: string }
export interface SavedFile { name: string; folder: string; path?: string }
/** `error`: the dropped files could not be read; it also ends the drag. */
export type DropEvent = { type: 'over' | 'leave' | 'error' } | { type: 'drop'; files: PickedFile[] };
export type SaveKind = 'pdf' | 'zip';

export interface Platform {
  native: boolean;
  pickPdfs(opts: { multiple: boolean }): Promise<PickedFile[]>; // [] on cancel
  readPath(path: string): Promise<Uint8Array>; // throws FileMissingError
  onFileDrop(cb: (e: DropEvent) => void): () => void;
  saveAs(bytes: Uint8Array, name: string, kind: SaveKind): Promise<SavedFile | null>; // null on cancel
  openPath(path: string, fallbackBytes?: Uint8Array): Promise<void>;
  reveal(path: string): Promise<void>;
  openUrl(url: string): Promise<void>;
  window: { minimize(): Promise<void>; toggleMaximize(): Promise<void>; close(): Promise<void> } | null;
}

export class FileMissingError extends Error {
  name = 'FileMissingError';
}

// Save dialog filter per export kind; labels as today's save.js.
export const SAVE_KINDS: Record<SaveKind, { label: string; ext: string; type: string }> = {
  pdf: { label: 'PDF document', ext: 'pdf', type: 'application/pdf' },
  zip: { label: 'ZIP archive', ext: 'zip', type: 'application/zip' }
};
