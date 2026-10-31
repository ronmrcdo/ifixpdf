import type {FileId, PageInstance, PageUid, SourceFile} from './types';

type NewUid = () => PageUid;
type Uids = ReadonlySet<PageUid>;

export function pagesForFile(
  file: SourceFile,
  newUid: NewUid = () => crypto.randomUUID(),
): PageInstance[] {
  return Array.from({length: file.pages}, (_, local) => ({
    uid: newUid(),
    fileId: file.id,
    local,
    rotation: 0,
  }));
}

/** targetIndex is the index the first moved page ends up at in the result, clamped to [0, remaining length]. */
export function movePages(pages: PageInstance[], uids: Uids, targetIndex: number): PageInstance[] {
  const moved = pages.filter((p) => uids.has(p.uid));
  const rest = pages.filter((p) => !uids.has(p.uid));
  const at = Math.min(Math.max(targetIndex, 0), rest.length);
  return [...rest.slice(0, at), ...moved, ...rest.slice(at)];
}

/** The `movePages` target for inserting the moved pages at `slot`, an insertion point (0..length) in the current order. */
export function dropTarget(pages: PageInstance[], uids: Uids, slot: number): number {
  return pages.slice(0, slot).filter((p) => !uids.has(p.uid)).length;
}

export function deletePages(pages: PageInstance[], uids: Uids): PageInstance[] {
  return pages.filter((p) => !uids.has(p.uid));
}

export function duplicatePages(
  pages: PageInstance[],
  uids: Uids,
  newUid: NewUid = () => crypto.randomUUID(),
): PageInstance[] {
  return pages.flatMap((p) => (uids.has(p.uid) ? [p, {...p, uid: newUid()}] : [p]));
}

export function rotatePages(pages: PageInstance[], uids: Uids, delta: 90 | -90): PageInstance[] {
  return pages.map((p) =>
    uids.has(p.uid)
      ? {...p, rotation: ((p.rotation + delta + 360) % 360) as PageInstance['rotation']}
      : p,
  );
}

export function removeFile(pages: PageInstance[], fileId: FileId): PageInstance[] {
  return pages.filter((p) => p.fileId !== fileId);
}

/** Swaps the file with its neighbour and moves its page group as a block next to the neighbour's pages. */
export function moveFile(
  files: SourceFile[],
  pages: PageInstance[],
  fileId: FileId,
  direction: -1 | 1,
): {files: SourceFile[]; pages: PageInstance[]} {
  const i = files.findIndex((f) => f.id === fileId);
  const neighbour = files[i + direction];
  const self = files[i];
  if (!self || !neighbour) return {files, pages};

  const nextFiles = [...files];
  nextFiles[i] = neighbour;
  nextFiles[i + direction] = self;

  const block = pages.filter((p) => p.fileId === fileId);
  const rest = pages.filter((p) => p.fileId !== fileId);
  const neighbourIdx = rest.flatMap((p, k) => (p.fileId === neighbour.id ? [k] : []));
  const first = neighbourIdx[0];
  const last = neighbourIdx[neighbourIdx.length - 1];
  if (first === undefined || last === undefined) return {files: nextFiles, pages};

  const at = direction === -1 ? first : last + 1;
  return {files: nextFiles, pages: [...rest.slice(0, at), ...block, ...rest.slice(at)]};
}

/** Moves the file to row `to` (clamped) one neighbour at a time, so a drag matches the same number of up/down moves. */
export function moveFileTo(
  files: SourceFile[],
  pages: PageInstance[],
  fileId: FileId,
  to: number,
): {files: SourceFile[]; pages: PageInstance[]} {
  let i = files.findIndex((f) => f.id === fileId);
  const target = Math.max(0, Math.min(to, files.length - 1));
  let out = {files, pages};
  if (i === -1) return out;
  const dir = target > i ? 1 : -1;
  for (; i !== target; i += dir) out = moveFile(out.files, out.pages, fileId, dir);
  return out;
}
