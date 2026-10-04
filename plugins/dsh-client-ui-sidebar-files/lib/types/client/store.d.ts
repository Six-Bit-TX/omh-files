/**
 * The file tree's view state: which directories are expanded, what each
 * loaded level contains, which rows are selected, and where the body is
 * scrolled to.
 *
 * The tree is not one resource. A directory listing per level, expanded lazily,
 * is state the type owns — so it lives in a Slot-standard exclusive store
 * (one instance per session), bucketed by tab id because two tabs of this kind
 * in one session expand independently.
 *
 * Writers run between `start` and `forget`: the owner's `signal` is what ends a
 * bucket's life, and the face stops dispatching once it aborts.
 */
import { type EngineStoreHandle } from '@deepseek-ai/dsh-client-store';
import type { RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client';
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit';
import type { WorkspaceDirectoryEntry } from '@deepseek-ai/dsh-api-workspace-files/types';
/**
 * One directory's contents, as one expanded level of the tree.
 *
 * The endpoint's listing also names the directory as a workspace-relative path;
 * the tree keys every level by absolute path instead, so the adapter drops it.
 */
export interface DirLevel {
    /** The directory's entries, in the endpoint's order. */
    readonly entries: readonly WorkspaceDirectoryEntry[];
    /** The listing hit the endpoint's entry cap, so entries are missing. */
    readonly truncated: boolean;
}
/** What one directory level is doing right now. */
export type LevelState = {
    readonly kind: 'loading';
} | {
    readonly kind: 'ready';
    readonly level: DirLevel;
} | {
    readonly kind: 'failed';
    readonly failure: RemoteFailure;
};
/**
 * One file this tab is putting into the tree.
 *
 * An upload is not a level: it is a gesture with a beginning and an end, so it
 * gets its own row until it lands. A landed upload leaves no row — the level
 * it landed in is listed again instead — while a refused one keeps its row
 * carrying the reason, so the reader can read it and dismiss it.
 */
export interface UploadTask {
    /** Stable identity of one upload: the absolute path it is being written to. */
    readonly path: string;
    /** Absolute path of the directory it is landing in. */
    readonly dir: string;
    /** The file's basename, as the reader's own filesystem named it. */
    readonly name: string;
    /** The file's size in bytes, as the browser reported it. */
    readonly bytes: number;
    /** Why the Host refused it; absent while the upload is still in flight. */
    readonly failure?: RemoteFailure;
}
/**
 * One tab's tree: its root, the levels it has asked for, what is open, and the
 * uploads in flight.
 *
 * Every path here is absolute: the root is the session's working directory as
 * the Host reports it, and a child is the parent joined with the entry name.
 */
export interface FilesTabState {
    /** Absolute path of the directory this tree is rooted at. */
    root: string;
    /** Level state by absolute directory path; a path absent here was never asked for. */
    levels: Record<string, LevelState>;
    /** Expanded absolute directory paths, root included. */
    expanded: string[];
    /** The body's scroll offset in px, so a remounted tree comes back where the reader was. */
    scrollTop: number;
    /**
     * Directories this tab has been rooted at, most recent first and the current
     * root leading. The location menu offers them; another tab never sees them.
     */
    recent: string[];
    /** Absolute path selected as this tab's compare base, or null. */
    compareBase: string | null;
    /**
     * Absolute paths this tab has selected, in the order they were selected. A
     * path here can outlive its row — a level listed again no longer shows it —
     * so a gesture on a selection resolves every path against the levels it has
     * and refuses to act on a selection it cannot resolve in full.
     */
    selected: readonly string[];
    /** The entry a Shift click extends a range from, or null when nothing anchors one. */
    anchor: string | null;
    /** Uploads this tab has started, oldest first; a landed one leaves the list. */
    uploads: readonly UploadTask[];
}
/** How many visited directories one tab remembers. */
export declare const RECENT_LIMIT = 8;
/** Every tab's tree, keyed by tab id. */
export interface FilesState {
    byTab: Record<TabId, FilesTabState>;
}
/** The tree store's write set; every action names the tab it writes. */
type FilesActions = {
    start: (draft: FilesState, tabId: TabId, root: string) => void;
    navigate: (draft: FilesState, tabId: TabId, root: string) => void;
    compareSelected: (draft: FilesState, tabId: TabId, path: string | null) => void;
    selectOne: (draft: FilesState, tabId: TabId, path: string) => void;
    toggleSelected: (draft: FilesState, tabId: TabId, path: string) => void;
    selectRange: (draft: FilesState, tabId: TabId, paths: readonly string[]) => void;
    clearSelection: (draft: FilesState, tabId: TabId) => void;
    loading: (draft: FilesState, tabId: TabId, path: string) => void;
    loaded: (draft: FilesState, tabId: TabId, path: string, level: DirLevel) => void;
    failed: (draft: FilesState, tabId: TabId, path: string, failure: RemoteFailure) => void;
    toggled: (draft: FilesState, tabId: TabId, path: string) => void;
    scrolled: (draft: FilesState, tabId: TabId, scrollTop: number) => void;
    reset: (draft: FilesState, tabId: TabId) => void;
    expand: (draft: FilesState, tabId: TabId, path: string) => void;
    uploadQueued: (draft: FilesState, tabId: TabId, task: UploadTask) => void;
    uploadFinished: (draft: FilesState, tabId: TabId, path: string, failure: RemoteFailure | undefined) => void;
    forget: (draft: FilesState, tabId: TabId) => void;
};
/**
 * Declare the file tree's store.
 *
 * A factory rather than a shared handle: the registration declares it as an
 * exclusive store, so the framework mints one instance per session.
 * @returns the store handle to declare on the registration.
 */
export declare function createFilesStore(): EngineStoreHandle<FilesState, FilesActions>;
export {};
//# sourceMappingURL=store.d.ts.map