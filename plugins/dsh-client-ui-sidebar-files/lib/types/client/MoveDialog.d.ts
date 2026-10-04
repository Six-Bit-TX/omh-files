import type { ReactNode } from 'react';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
/** Everything the move dialog draws and the move it performs. */
export interface MoveDialogProps {
    /** The names of the entries being moved, as the dialog describes them. */
    readonly names: readonly string[];
    /** The destination directory the field starts on. */
    readonly destination: string;
    /** Namespace-bound translate. */
    readonly t: TranslateNS<'sidebarFiles'>;
    /**
     * Move the entries into the typed directory.
     * @param destination - the destination the reader confirmed.
     * @returns a localized failure line, or null when the Host accepted it.
     */
    readonly onConfirm: (destination: string) => Promise<string | null>;
    /** Dismiss the dialog. */
    readonly onClose: () => void;
}
/**
 * Render the move dialog.
 * @param props - see {@link MoveDialogProps}.
 * @returns the dialog element.
 */
export declare function MoveDialog({ names, destination, t, onConfirm, onClose }: MoveDialogProps): ReactNode;
//# sourceMappingURL=MoveDialog.d.ts.map