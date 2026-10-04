import type { ReactNode } from 'react';
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { WorkspaceFileHistory } from '@deepseek-ai/dsh-api-workspace-files/types';
/** Everything the timeline dialog draws and the read it performs. */
export interface TimelineDialogProps {
    /** Absolute path of the file whose history is shown. */
    readonly path: string;
    /** Namespace-bound translate. */
    readonly t: TranslateNS<'sidebarFiles'>;
    /**
     * Read one file's git history.
     * @param path - absolute path of the file.
     */
    readonly loadHistory: (path: string) => Promise<RemoteResult<WorkspaceFileHistory>>;
    /** Dismiss the dialog. */
    readonly onClose: () => void;
}
/**
 * Render one file's commit history.
 * @param props - see {@link TimelineDialogProps}.
 * @returns the dialog element.
 */
export declare function TimelineDialog({ path, t, loadHistory, onClose }: TimelineDialogProps): ReactNode;
//# sourceMappingURL=TimelineDialog.d.ts.map