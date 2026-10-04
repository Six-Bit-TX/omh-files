import type { ReactNode } from 'react';
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import type { FilesInjected } from './face.ts';
import type { createFilesStore } from './store.ts';
/** The body's composed props: the tab it draws, its store, its face, and its copy. */
export type FilesBodyProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsStore<ReturnType<typeof createFilesStore>> & FilesInjected & PropsLocale<'sidebarFiles'>;
/** The file tree's body: the directory it is rooted at and whatever the reader has opened under it. */
export declare function FilesBody({ useTabInfo, sessionId, useSessions, useWorkspaces, useStore, actions, start, navigate, load, toggle, rename, remove, move, upload, download, readPage, history, homePath, t, }: FilesBodyProps): ReactNode;
//# sourceMappingURL=FilesBody.d.ts.map