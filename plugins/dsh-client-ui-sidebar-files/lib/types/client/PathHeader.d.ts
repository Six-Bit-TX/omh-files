import type { ReactNode } from 'react';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
/** One Workspace as a jump target: what the menu shows and where it goes. */
export interface LocationWorkspace {
    /** Stable Workspace identity. */
    readonly id: string;
    /** User-visible Workspace title. */
    readonly title: string;
    /** Canonical absolute directory path. */
    readonly path: string;
}
/** Everything the header row draws and the two gestures it performs. */
export interface PathHeaderProps {
    /** Absolute path this tab is rooted at. */
    readonly root: string;
    /** The session's working directory, as its own jump target. */
    readonly cwd: string;
    /** Workspaces the Client knows, in the order the menu lists them. */
    readonly workspaces: readonly LocationWorkspace[];
    /** Directories this tab has visited, most recent first. */
    readonly recent: readonly string[];
    /** The Host account's home directory, or undefined before it is known. */
    readonly home: string | undefined;
    /** Namespace-bound translate. */
    readonly t: TranslateNS<'sidebarFiles'>;
    /** Root the tree at `path`. */
    readonly onNavigate: (path: string) => void;
    /** List the expanded levels again, dropping what they loaded. */
    readonly onReload: () => void;
    /** Put the files the reader picked into the directory this tab is rooted at. */
    readonly onUpload: (files: FileList | null) => void;
}
/**
 * Resolve a typed address to the path the tree should list.
 *
 * A `~` (alone, or followed by a separator) stands for the Host account's home;
 * every other address is taken as written, with surrounding whitespace
 * dropped. An unknown home leaves the address untouched, so the listing reports
 * it as a path that cannot be read rather than guessing one.
 * @param address - what the reader typed.
 * @param home - the Host account's home directory, when known.
 * @returns the absolute (or workspace-relative) path to list.
 */
export declare function expandAddress(address: string, home: string | undefined): string;
/**
 * Render the header row.
 * @param props - see {@link PathHeaderProps}.
 * @returns the row's path, its location button, and its reload button.
 */
export declare function PathHeader({ root, cwd, workspaces, recent, home, t, onNavigate, onReload, onUpload, }: PathHeaderProps): ReactNode;
//# sourceMappingURL=PathHeader.d.ts.map