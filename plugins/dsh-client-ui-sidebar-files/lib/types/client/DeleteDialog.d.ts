import type { ReactNode } from 'react';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
/** Everything the delete dialog draws and the removal it performs. */
export interface DeleteDialogProps {
    /** The basenames of the entries being removed, named in the confirmation. */
    readonly names: readonly string[];
    /** Namespace-bound translate. */
    readonly t: TranslateNS<'sidebarFiles'>;
    /**
     * Remove the entries.
     * @returns a localized failure line, or null when the Host accepted it.
     */
    readonly onConfirm: () => Promise<string | null>;
    /** Dismiss the dialog. */
    readonly onClose: () => void;
}
/**
 * Render the delete confirmation.
 * @param props - see {@link DeleteDialogProps}.
 * @returns the dialog element.
 */
export declare function DeleteDialog({ names, t, onConfirm, onClose }: DeleteDialogProps): ReactNode;
//# sourceMappingURL=DeleteDialog.d.ts.map