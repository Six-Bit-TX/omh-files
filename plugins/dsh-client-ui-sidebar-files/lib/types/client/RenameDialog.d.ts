import type { ReactNode } from 'react';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
/** Whether one typed name is a usable single path segment. */
export declare function validEntryName(name: string): boolean;
/** Everything the rename dialog draws and the rename it performs. */
export interface RenameDialogProps {
    /** The entry's current basename, pre-filled and selected. */
    readonly name: string;
    /** Namespace-bound translate. */
    readonly t: TranslateNS<'sidebarFiles'>;
    /**
     * Rename the entry.
     * @param newName - the name the reader confirmed.
     * @returns a localized failure line, or null when the Host accepted it.
     */
    readonly onConfirm: (newName: string) => Promise<string | null>;
    /** Dismiss the dialog. */
    readonly onClose: () => void;
}
/**
 * Render the rename dialog.
 * @param props - see {@link RenameDialogProps}.
 * @returns the dialog element.
 */
export declare function RenameDialog({ name, t, onConfirm, onClose }: RenameDialogProps): ReactNode;
//# sourceMappingURL=RenameDialog.d.ts.map