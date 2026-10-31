export type FileId = string;
export type PageUid = string;
export type Rotation = 0 | 90 | 180 | 270;
export interface SourceFile { id: FileId; name: string; pages: number; size: number; path?: string; recentId?: string }
export interface PageInstance { uid: PageUid; fileId: FileId; local: number; rotation: Rotation }
export interface Selection { uids: ReadonlySet<PageUid>; anchor: PageUid | null }
export interface ExportSettings { name: string; rangeMode: 'all' | 'current' | 'custom'; customRange: string; useFileNamesAsTitle: boolean }
