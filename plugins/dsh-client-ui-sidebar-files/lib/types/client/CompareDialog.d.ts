import type { ReactNode } from 'react';
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
import type { FilePage } from './face.ts';
/** Everything the compare dialog draws and the two reads it performs. */
export interface CompareDialogProps {
    /** Absolute path selected as the compare base. */
    readonly base: string;
    /** Absolute path compared against it. */
    readonly target: string;
    /** Namespace-bound translate. */
    readonly t: TranslateNS<'sidebarFiles'>;
    /**
     * Read one file's compared page.
     * @param path - absolute path of the file.
     */
    readonly readPage: (path: string) => Promise<RemoteResult<FilePage>>;
    /** Dismiss the dialog. */
    readonly onClose: () => void;
}
/**
 * Render the comparison.
 * @param props - see {@link CompareDialogProps}.
 * @returns the dialog element.
 */
export declare function CompareDialog({ base, target, t, readPage, onClose }: CompareDialogProps): ReactNode;
//# sourceMappingURL=CompareDialog.d.ts.map