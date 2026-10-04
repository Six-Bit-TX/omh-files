/**
 * Browser half: register `files` as a right-Sidebar tab type.
 *
 * The public two-stage path, unmodified: the type into `ctx.sidebarRightTabs`,
 * the body into the keyed `sidebar.right.pane.tab` seat and the chip title into
 * the keyed `sidebar.right.pane.tab.title` seat, both under the type's `id`.
 *
 * The file split is this package's layering: what the type IS
 * (`definition.tsx`), what it keeps (`store.ts`), how it talks to the Host
 * (`face.ts`, `paths.ts`, `failures.ts`, `download.ts`, `upload.ts`), what it draws
 * (`FilesBody.tsx`, `PathHeader.tsx`, `EntryMenu.tsx`, the dialogs,
 * `FilesTitle.tsx`), what it says (`locales.ts`), and this module, which only
 * wires them together.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
export type { SidebarFilesKey } from './locales.ts';
export type { DirLevel, FilesState, FilesTabState, LevelState, UploadTask } from './store.ts';
export type { EntryMutation, FileDownload, FilePage, FilesInjected, FilesRemoteOps, ListWorkspaceDirectory, MoveWorkspaceEntries, ReadWorkspaceDownload, ReadWorkspaceHistory, ReadWorkspacePage, RemoveWorkspaceEntry, RenameWorkspaceEntry, UploadWorkspaceFile, WorkspaceFilesRemote, } from './face.ts';
export type { FilesBodyProps } from './FilesBody.tsx';
export type { PathHeaderProps } from './PathHeader.tsx';
export type { EntryKind, EntryMenuAction, EntryMenuProps, EntrySelection, EntryTarget } from './EntryMenu.tsx';
export type { MoveDialogProps } from './MoveDialog.tsx';
/**
 * Required browser services: the tab registry, the keyed seat, the Remote
 * carrier and its namespace, and copy.
 */
export declare const inject: string[];
/**
 * Client plugin body: register the type, its dictionaries, its body, and its chip title.
 * @param ctx - client root context carrying the registry, the slots, and the Remote face.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map