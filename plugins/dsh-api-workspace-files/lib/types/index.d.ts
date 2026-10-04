/**
 * Workspace file service: file previews, directory listings, workspace-confined
 * rename, move, and removal, version-guarded text replacement, browser
 * downloads, file history, and the filesystem-observation change feed, exposed
 * as `workspaceFiles`.
 *
 * File reads follow the composed filesystem's read access, including paths
 * outside the workspace, and so do directory listings. The selected Session
 * header supplies the base for relative paths, with the sandbox policy root as
 * its no-cwd fallback, not a read-containment restriction. `rename`, `move`,
 * and `delete` are deliberately workspace-confined, and they call `node:fs`
 * directly because the `ctx.fs` seam exposes no rename, move, or remove
 * operation. `write` is the fourth mutation and takes the opposite route: it
 * replaces a file's complete text through `ctx.fs`, so the composed backend's
 * own write policy fences it and the caller must present the version it read.
 * `history` reads a file's `git log` through the subprocess seam. Change
 * observations remain workspace-scoped. File-kind checks and configured read
 * caps apply to every preview.
 *
 * One read travels outside the Remote face: the browser download route streams a
 * whole file through the `/api` carrier, one configured window at a time, so a
 * file above `maxFileBytes` — the cap on a single Remote answer — is still
 * downloadable. See `download.ts`.
 *
 * A page is cut from `streamText`, which decodes and rejects non-UTF-8 as it
 * goes, so the file is read only up to the first character past the page and
 * never held whole in memory; the NUL scan runs on the page itself.
 *
 * This is NOT modelled on `session.openWorkspacePath`. That endpoint hands a
 * path to the local opener and leaves the effect on the machine; this one sends
 * file content across the wire, which is a different level of exposure.
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { TypertRemoteService, type TypertLookup } from '@deepseek-ai/dsh-typert-protocol';
import type { WorkspaceByteRange, WorkspaceDirectoryListing, WorkspaceFileBytes, WorkspaceFileHistory, WorkspaceFileHistoryEntry, WorkspaceFileMoves, WorkspaceFileMutation, WorkspaceFileRange, WorkspaceFileStat, WorkspaceFileText, WorkspaceFileWatchFrame } from './types.ts';
export type * from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Host owner of the `workspaceFiles` Remote namespace. */
        workspaceFiles: WorkspaceFiles;
    }
}
/** Header-derived file resolution context for one Session identity. */
export interface WorkspaceFileScope {
    /** Session identity received on the wire. */
    readonly sessionId: SessionId;
    /** Session workspace root, or the deployment fallback when its header has no cwd. */
    readonly workspaceRoot: string;
}
declare module '@deepseek-ai/dsh-typert-protocol' {
    interface TypertLookupMap {
        /** Resolve a Session id to its workspace root without loading its event body or activating an Agent. */
        workspaceFileScope: TypertLookup<WorkspaceFileScope, SessionId>;
    }
}
/** Deployment caps on one page or one listing. */
export interface Config {
    /**
     * Inclusive byte cap on one page's text and on one byte window.
     *
     * A page above this fails; it is not shortened, because a silently cut page
     * reads as the whole page. A byte window asking for more is refused the same
     * way. The file itself has no size cap: a caller pages through it, and the
     * browser download route reads it one window of this size at a time.
     */
    readonly maxBytes: number;
    /** Inclusive byte cap on a complete-file read; larger files are refused, never truncated. */
    readonly maxFileBytes: number;
    /** Default and largest page size in lines; a request asking for more is refused. */
    readonly maxLines: number;
    /** Cap on returned directory entries; the rest is dropped and reported cut. */
    readonly maxEntries: number;
}
/**
 * Parse the stdout of the `git log` invocation `history` runs: one entry per
 * commit, in git's output order. A record line carries five unit-separated
 * fields, and the tab-separated numstat lines that follow it — one per changed
 * path, or none — supply the line counts. Blank lines separate records and are
 * ignored.
 * @param stdout - complete raw stdout of `git log --format=… --numstat`.
 * @returns one entry per record, in the order git printed them.
 */
export declare function parseGitLog(stdout: string): WorkspaceFileHistoryEntry[];
/**
 * Host Remote file reads, directory listings, workspace-confined rename, move,
 * and removal, version-guarded text replacement, the browser download route,
 * per-file git history, and the instrumented filesystem change feed.
 *
 * `rename`, `move`, and `delete` are confined to the Session's workspace root
 * and call `node:fs` because the `ctx.fs` seam exposes none of those
 * operations; every other path-taking method uses `ctx.fs`, whose access rules
 * then apply — including `write`, whose fence is the backend's write policy.
 */
export declare class WorkspaceFiles extends TypertRemoteService {
    private readonly config;
    static inject: string[];
    static Config: z<Config>;
    private readonly feed;
    /**
     * @param ctx - Host context carrying the filesystem and the sandbox policy.
     * @param config - deployment caps on one page or one listing.
     */
    constructor(ctx: Context, config: Config);
    /**
     * Resolve one Session identity to the workspace root its files are read
     * against, from the live header or the stored one, without loading the
     * session's event body or activating an Agent.
     * @param sessionId - Session identity received on the wire.
     * @returns the scope, or undefined when no header knows that Session.
     */
    private resolveScope;
    /**
     * Read one page of lines from a UTF-8 file readable by the filesystem backend.
     * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
     * @param path - absolute path or path relative to the workspace root; files outside it are allowed.
     * @param range - the line window; omitted fields take the page defaults.
     * @param signal - caller cancellation.
     * @returns the page, the file's version at the stat before it, and whether it reaches the last line.
     */
    read(workspaceFileScope: WorkspaceFileScope, path: string, range: WorkspaceFileRange, signal: AbortSignal): Promise<WorkspaceFileText>;
    /**
     * Read one byte window of a regular file readable by the filesystem backend: raw
     * bytes, no text decoding and no binary rejection.
     * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
     * @param path - absolute path or path relative to the workspace root; files outside it are allowed.
     * @param range - the byte window; omitted fields take the window defaults.
     * @param signal - caller cancellation.
     * @returns the window in base64, the file's version and size at the stat before it, and whether it reaches the last byte.
     */
    readBytes(workspaceFileScope: WorkspaceFileScope, path: string, range: WorkspaceByteRange, signal: AbortSignal): Promise<WorkspaceFileBytes>;
    /**
     * Read a complete regular file as bytes, subject to the configured full-file cap.
     * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
     * @param path - absolute or workspace-relative file path.
     * @param signal - caller cancellation.
     * @returns one complete base64 window with offset zero and eof true; oversized files fail with too-large.
     */
    readAll(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<WorkspaceFileBytes>;
    /**
     * Read a complete file relative to another file's directory, including outside the workspace.
     * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
     * @param path - base file, absolute or workspace-relative.
     * @param relativePath - relative filesystem path, not a URL or absolute path.
     * @param signal - caller cancellation.
     * @returns the complete related file using the ordinary file-size and access checks.
     */
    readRelated(workspaceFileScope: WorkspaceFileScope, path: string, relativePath: string, signal: AbortSignal): Promise<WorkspaceFileBytes>;
    /**
     * Report one regular file's identity, version, and size without its content.
     * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
     * @param path - absolute path or path relative to the workspace root; files outside it are allowed.
     * @param signal - caller cancellation.
     * @returns the file's absolute path, current version, and byte size.
     */
    stat(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<WorkspaceFileStat>;
    /**
     * List the direct children of one existing directory readable by the
     * filesystem backend, anywhere that backend can reach.
     * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
     * @param path - absolute path or path relative to the workspace root; directories outside it are allowed.
     * @param signal - caller cancellation.
     * @returns the directory's children in the backend's stable name order, bounded by the entry
     *   cap, and the listed directory as a workspace path or, outside the root, as its absolute path.
     */
    list(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<WorkspaceDirectoryListing>;
    /**
     * Rename one entry inside the Session's workspace to a new name in the same
     * directory. The rename itself runs through `node:fs`, because the `ctx.fs`
     * seam exposes no rename operation; the destination directory is still
     * checked with `ctx.fs`. A final symlink is renamed without following it.
     * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
     * @param path - absolute path or path relative to the workspace root of the entry to rename.
     * @param newName - the entry's new name: one path segment, without separators, `.` or `..`.
     * @param signal - caller cancellation.
     * @returns the renamed entry's absolute path.
     */
    rename(workspaceFileScope: WorkspaceFileScope, path: string, newName: string, signal: AbortSignal): Promise<WorkspaceFileMutation>;
    /**
     * Move entries into another directory of the Session's workspace, keeping each
     * entry's own name. The move runs through `node:fs` like `rename`, because the
     * `ctx.fs` seam exposes no move operation, and both ends are checked with
     * `ctx.fs`: an entry whose directory leaves the workspace root, a destination
     * outside it, and an entry asked to move into itself or into its own subtree
     * are refused. Final symlinks move as entries without following their targets.
     *
     * The complete request is validated before the first entry moves, so a refusal
     * leaves every requested entry where it was. An entry already in the
     * destination directory is left alone and reported at that same path, which
     * makes a drop onto the directory entry it came from a no-op rather than an
     * error. A destination name already taken is refused rather than overwritten,
     * and so is a second requested entry that would land on the same name.
     * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
     * @param paths - absolute paths or paths relative to the workspace root of the entries to move.
     * @param destination - absolute path or path relative to the workspace root of the target directory.
     * @param signal - caller cancellation.
     * @returns the destination's absolute path and one entry per requested path, in request order.
     */
    move(workspaceFileScope: WorkspaceFileScope, paths: readonly string[], destination: string, signal: AbortSignal): Promise<WorkspaceFileMoves>;
    /**
     * Permanently delete one entry inside the Session's workspace: a regular
     * file, a symlink, or a directory with everything below it. The deletion runs
     * through `node:fs`, because the `ctx.fs` seam exposes no remove operation;
     * the workspace root check still uses `ctx.fs`. Final symlinks and Windows
     * junctions are unlinked without deleting their targets.
     *
     * The wire name is `delete`, not `remove`: the generated namespace service
     * reserves `remove` for its own member, and a Remote method that shadows it
     * is refused when the namespace installs on the Client.
     * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
     * @param path - absolute path or path relative to the workspace root of the entry to delete.
     * @param signal - caller cancellation.
     * @returns the deleted entry's absolute path.
     */
    delete(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<WorkspaceFileMutation>;
    /**
     * Replace one regular file's complete UTF-8 text, guarded by the version the
     * caller read. The write runs through the composed filesystem, so that
     * backend's write policy decides whether it happens: a session whose sandbox
     * mode is read-only refuses every write, and workspace-write accepts only a
     * target under that session's workspace root. A path outside those rules,
     * and a file that changed since it was read, are refusals rather than
     * overwrites — this endpoint never writes a file the caller has not read.
     * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
     * @param path - absolute path or path relative to the workspace root of the file to replace.
     * @param text - the file's complete new content.
     * @param version - the version the caller's text was read at, from `stat` or an earlier `read`.
     * @param signal - caller cancellation.
     * @returns the file's absolute path, its version after the write, and the written byte count.
     */
    write(workspaceFileScope: WorkspaceFileScope, path: string, text: string, version: string, signal: AbortSignal): Promise<WorkspaceFileStat>;
    /**
     * Create one new file from exact bytes. This is the FILE MANAGER's upload: a
     * reader drops a file from their machine into a workspace directory, and the
     * bytes arrive base64-encoded under the same complete-file cap `readAll`
     * answers with. It always guards with `createIfAbsent`, so an upload never
     * replaces a file the caller has not read — a name already taken is refused
     * with `workspace-file/exists`, and replacing it is the reader's separate
     * decision through `delete` or an edit.
     *
     * The write runs through the composed filesystem with the Session's resolved
     * policy, exactly as `write` does, so it is fenced by the sandbox rather than
     * by a containment check here.
     * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
     * @param path - absolute path or path relative to the workspace root of the file to create.
     * @param data - the complete file contents, base64-encoded.
     * @param signal - caller cancellation.
     * @returns the created file's absolute path, version, and byte size.
     */
    upload(workspaceFileScope: WorkspaceFileScope, path: string, data: string, signal: AbortSignal): Promise<WorkspaceFileStat>;
    /**
     * Report one file's git history, newest commit first, by running `git log`
     * through the subprocess seam. The file may be inside or outside the
     * workspace. A directory that is not a repository, a file git never
     * committed, and a missing git executable all report an empty history
     * instead of failing; caller cancellation still propagates.
     * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
     * @param path - absolute path or path relative to the workspace root of the file.
     * @param signal - caller cancellation.
     * @returns the file's absolute path and its commits, empty when git reports none.
     */
    history(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<WorkspaceFileHistory>;
    /**
     * Stream every `fs/observed` observation of a file inside the Session's
     * workspace. Only instrumented filesystem operations report here; the OS is
     * not watched.
     * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
     * @param signal - generation cancellation.
     * @returns `ready` once the Host observation queue is active and the workspace
     *   root is resolved, then queued and live observations in emission order.
     */
    changes(workspaceFileScope: WorkspaceFileScope, signal: AbortSignal): AsyncIterable<WorkspaceFileWatchFrame>;
    /**
     * The per-call sandbox policy one write runs under: the live Session's mode
     * when that Session is loaded, over the root this scope already resolved. A
     * cold Session has no log to read a mode from, so the deployment default
     * governs it while the header-derived root still bounds it.
     */
    private writePolicy;
    /** Apply the page defaults and caps here, so the request never carries them implicitly. */
    private resolvePage;
    /** Apply the byte-window defaults and cap; a window above the cap is refused, not shortened. */
    private resolveWindow;
    /**
     * Inspect the requested path itself before resolution follows its final
     * component. Containment is checked separately by the entry mutations.
     */
    private inspect;
    /** Resolve an inspected path and refuse it unless the workspace contains it. */
    private confine;
    /** Resolve and confine the parent while preserving the final entry, including a dangling symlink. */
    private entryPath;
    /**
     * The listed directory's workspace path when the workspace root contains it,
     * and its absolute path otherwise, so a listing outside the root stays
     * addressable.
     */
    private listingPathOf;
    /**
     * Run one bounded `git log` for a file and parse it. Every failure that is
     * not caller cancellation reports an empty history: a directory outside a
     * repository, a path git never committed, and a missing git executable are
     * ordinary answers for a timeline, not service failures.
     * @param directory - the file's directory, used as both the working directory and the `-C` argument.
     * @param name - the file's basename, the pathspec after `--`.
     * @param signal - caller cancellation; an abort propagates instead of reporting an empty history.
     * @returns the parsed commits, newest first.
     */
    private gitLog;
    /**
     * All gates for a regular file, ending in the one stat that names its version
     * and size. The stat re-checks what `lstat` saw: the file may have gone or
     * changed kind in between.
     */
    private locateFile;
    private statOf;
    /** Stream the file as text and cut the page, classifying the backend's non-text refusal. */
    private cutPage;
    /**
     * Answer one browser download request: `GET` streams the file, `HEAD` answers
     * the same headers for the client's preflight, and a refusal is a status
     * rather than a body. The file is located exactly as a Remote read locates it
     * — `ctx.fs` access rules included, so a file outside the workspace is
     * downloadable whenever it is readable — and carries no size cap of its own.
     * @param request - the `/api/workspace.download` request.
     * @returns the file's bytes, its preflight headers, or the refusal's status.
     */
    private download;
    /** Enumerate one regular file's bytes in windows no larger than one configured byte cap. */
    private streamFile;
}
export default WorkspaceFiles;
//# sourceMappingURL=index.d.ts.map