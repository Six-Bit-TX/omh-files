/**
 * The tree's asynchronous half: listing directories into the store, and the
 * Remote gestures one row's menu performs.
 *
 * The component never awaits anything on the tree's behalf. It calls `start` /
 * `load` / `toggle` / `navigate`, and this face performs the listing and writes
 * the outcome through the store's own actions — the Slot-standard `inject`
 * shape, so the session id is resolved by the framework and the write set stays
 * the store's. The gestures that do not write the store (rename, remove,
 * download, a compare page, a history) are handed back to the component as
 * their settled Remote result, because only it knows what to reload or show.
 *
 * The listing itself is bound here to the Client Remote face: the tree keys
 * every level by absolute path and hands the endpoint that same absolute path;
 * the endpoint answers with the directory's workspace-relative path as well,
 * which the tree has no use for and drops.
 *
 * One level has one listing in force: asking for a level again — the reload
 * gesture, a directory reopened after a reset, the root after a navigation —
 * retires the listing still in flight for it, whose settlement then writes
 * nothing. Cleanup rides the owner's `signal`: a request is not made for a
 * record that already ended, and when the record goes away the bucket and the
 * tab's listing bookkeeping are forgotten, so no later settlement writes to it.
 */
import type { ClientRemote, RemoteResult } from '@deepseek-ai/dsh-api-remotes/client';
import type { BoundActions } from '@deepseek-ai/dsh-client-store';
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { WorkspaceFileHistory, WorkspaceFileMoves } from '@deepseek-ai/dsh-api-workspace-files/types';
import type { DirLevel, createFilesStore } from './store.ts';
/** How many lines of each file a comparison reads; the rest is reported as cut. */
export declare const COMPARE_PAGE_LINES = 2000;
/** One page of a text file, as a comparison needs it. */
export interface FilePage {
    /** The page's lines joined by `\n`. */
    readonly text: string;
    /** Whether the page reaches the file's last line. */
    readonly eof: boolean;
}
/** One file's complete content, base64-encoded, with the name a download offers. */
export interface FileDownload {
    /** The file's basename. */
    readonly name: string;
    /** The file's bytes, base64-encoded. */
    readonly base64: string;
}
/** One entry as the Host reports it after a mutation. */
export interface EntryMutation {
    /** Absolute path of the entry the Host changed. */
    readonly absolutePath: string;
}
/**
 * One directory listing, bound to a Remote face.
 *
 * The session travels with the call because a workspace-relative path is
 * resolved against it: the same relative path means different directories in
 * different sessions. A Remote call does not reject — the result carries the
 * failure.
 */
export type ListWorkspaceDirectory = (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<RemoteResult<DirLevel>>;
/** One text page read, bound to a Remote face. */
export type ReadWorkspacePage = (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<RemoteResult<FilePage>>;
/** One complete-file read, bound to a Remote face. */
export type ReadWorkspaceDownload = (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<RemoteResult<FileDownload>>;
/** One rename, bound to a Remote face. */
export type RenameWorkspaceEntry = (sessionId: SessionId, path: string, newName: string, signal: AbortSignal) => Promise<RemoteResult<EntryMutation>>;
/** One removal, bound to a Remote face. */
export type RemoveWorkspaceEntry = (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<RemoteResult<EntryMutation>>;
/** One move of several entries into one directory, bound to a Remote face. */
export type MoveWorkspaceEntries = (sessionId: SessionId, paths: readonly string[], destination: string, signal: AbortSignal) => Promise<RemoteResult<WorkspaceFileMoves>>;
/** One upload, bound to a Remote face. */
export type UploadWorkspaceFile = (sessionId: SessionId, path: string, base64: string, signal: AbortSignal) => Promise<RemoteResult<EntryMutation>>;
/** One file's git history, bound to a Remote face. */
export type ReadWorkspaceHistory = (sessionId: SessionId, path: string, signal: AbortSignal) => Promise<RemoteResult<WorkspaceFileHistory>>;
/**
 * The slice of the Client Remote face this package calls: the `workspaceFiles`
 * namespace's methods, exactly as the Host's generated client declares them.
 */
export type WorkspaceFilesRemote = {
    readonly workspaceFiles: Pick<ClientRemote['workspaceFiles'], 'list' | 'read' | 'readAll' | 'rename' | 'move' | 'delete' | 'upload' | 'history'>;
};
/** Every Remote call the tree's face performs, before it is bound to a session. */
export interface FilesRemoteOps {
    readonly list: ListWorkspaceDirectory;
    readonly readPage: ReadWorkspacePage;
    readonly download: ReadWorkspaceDownload;
    readonly rename: RenameWorkspaceEntry;
    readonly remove: RemoveWorkspaceEntry;
    readonly move: MoveWorkspaceEntries;
    readonly upload: UploadWorkspaceFile;
    readonly history: ReadWorkspaceHistory;
}
/**
 * Bind the tree's Remote calls to one Client Remote face, keeping only what the
 * tree and its dialogs use: an entry never reaches a tree or a dialog, a page
 * drops the stat it travels with, and a move keeps the destination and the
 * entries it produced.
 * @param remote - the Client Remote face carrying the `workspaceFiles` namespace.
 * @returns the Remote calls the tree's face performs.
 */
export declare function createFilesRemote(remote: WorkspaceFilesRemote): FilesRemoteOps;
/**
 * The absolute path of one child entry.
 *
 * Joined with `/` whatever the parent's separators: the Host resolves mixed
 * separators, and the tree only needs a stable key.
 * @param parent - absolute path of the listed directory.
 * @param name - the entry's basename.
 * @returns the child's absolute path.
 */
export declare function childPath(parent: string, name: string): string;
/** The tree's injected business face, as the body receives it. */
export interface FilesInjected {
    /**
     * Seed this tab's tree and list its root.
     * @param tabId - the tab being drawn.
     * @param root - absolute path of the workspace root.
     * @param signal - the tab record's lifetime.
     */
    readonly start: (tabId: TabId, root: string, signal: AbortSignal) => void;
    /**
     * Root this tab at another directory and list it.
     * @param tabId - the tab being drawn.
     * @param root - absolute path of the directory to root at.
     * @param signal - the tab record's lifetime.
     */
    readonly navigate: (tabId: TabId, root: string, signal: AbortSignal) => void;
    /**
     * List one directory into the store.
     * @param tabId - the tab being drawn.
     * @param path - absolute directory path.
     * @param signal - the tab record's lifetime.
     */
    readonly load: (tabId: TabId, path: string, signal: AbortSignal) => void;
    /**
     * Open or collapse one directory, listing it the first time it opens.
     * @param tabId - the tab being drawn.
     * @param path - absolute directory path.
     * @param loaded - whether this level already has state.
     * @param signal - the tab record's lifetime.
     */
    readonly toggle: (tabId: TabId, path: string, loaded: boolean, signal: AbortSignal) => void;
    /**
     * Rename one entry inside its directory.
     * @param path - absolute path of the entry.
     * @param newName - the entry's new basename, one path segment.
     * @param signal - the tab record's lifetime.
     */
    readonly rename: (path: string, newName: string, signal: AbortSignal) => Promise<RemoteResult<EntryMutation>>;
    /**
     * Remove one entry.
     * @param path - absolute path of the entry.
     * @param signal - the tab record's lifetime.
     */
    readonly remove: (path: string, signal: AbortSignal) => Promise<RemoteResult<EntryMutation>>;
    /**
     * Move several entries into one directory, keeping each entry's own name.
     * @param paths - absolute paths of the entries to move.
     * @param destination - absolute path, or a path relative to the workspace root, of the directory they land in.
     * @param signal - the tab record's lifetime.
     */
    readonly move: (paths: readonly string[], destination: string, signal: AbortSignal) => Promise<RemoteResult<WorkspaceFileMoves>>;
    /**
     * Put one file the reader chose into `dir`, under its own name.
     *
     * Uploads for one tab run one at a time, in the order they were asked for:
     * each reads and encodes a whole file, and running a whole selection at once
     * would hold every one of them in memory together. The returned promise still
     * settles per file, so the caller reports each one as it lands.
     * @param tabId - the tab being drawn, which is also the queue this file joins.
     * @param dir - absolute path of the directory the file lands in.
     * @param file - the file the reader picked or dropped.
     * @param signal - the tab record's lifetime.
     * @returns the created entry's absolute path, the Host's refusal, or
     *   `undefined` when the record ended before this file could be sent.
     */
    readonly upload: (tabId: TabId, dir: string, file: File, signal: AbortSignal) => Promise<RemoteResult<EntryMutation> | undefined>;
    /**
     * Read one complete file for download.
     * @param path - absolute path of the file.
     * @param signal - the tab record's lifetime.
     */
    readonly download: (path: string, signal: AbortSignal) => Promise<RemoteResult<FileDownload>>;
    /**
     * Read the compared page of one file.
     * @param path - absolute path of the file.
     * @param signal - the tab record's lifetime.
     */
    readonly readPage: (path: string, signal: AbortSignal) => Promise<RemoteResult<FilePage>>;
    /**
     * Read one file's git history.
     * @param path - absolute path of the file.
     * @param signal - the tab record's lifetime.
     */
    readonly history: (path: string, signal: AbortSignal) => Promise<RemoteResult<WorkspaceFileHistory>>;
    /**
     * The Host account's home directory, for `~`-prefixed addresses.
     * @returns the home directory, or undefined before the Host reports one.
     */
    readonly homePath: () => string | undefined;
}
/**
 * Bind the tree's face to one Remote face and one home resolver.
 * @param ops - the Remote calls, already adapted to what the tree stores.
 * @param home - reads the Host account's home directory; undefined until it is known.
 * @returns the Slot `inject` factory: session and bound actions in, face out.
 */
export declare function filesFace(ops: FilesRemoteOps, home: () => string | undefined): (sessionId: SessionId, actions: BoundActions<ReturnType<typeof createFilesStore>>) => FilesInjected;
//# sourceMappingURL=face.d.ts.map