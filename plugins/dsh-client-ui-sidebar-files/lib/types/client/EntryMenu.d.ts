import type { ReactNode } from 'react';
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';
/** What kind of entry a row menu was opened on. */
export type EntryKind = 'file' | 'directory';
/** The row menu's item ids, in the order the menu shows them. */
export type EntryMenuAction = 'open' | 'compareSelect' | 'compareWith' | 'timeline' | 'copyPath' | 'copyRelativePath' | 'download' | 'move' | 'rename' | 'delete';
/** One entry a menu can act on. */
export interface EntrySelection {
    /** Absolute path of the entry. */
    readonly path: string;
    /** The entry's basename. */
    readonly name: string;
    /** Whether the entry is a file or a directory. */
    readonly kind: EntryKind;
}
/** One entry a menu was opened on, and where the pointer was. */
export interface EntryTarget extends EntrySelection {
    /** Viewport x of the pointer that opened the menu. */
    readonly x: number;
    /** Viewport y of the pointer that opened the menu. */
    readonly y: number;
}
/** Everything the row menu draws and the gestures it reports. */
export interface EntryMenuProps {
    /** The entry the menu was opened on. */
    readonly target: EntryTarget;
    /** The entries its rows act on, the target included. */
    readonly selection: readonly EntrySelection[];
    /** The file selected as this tab's compare base, or null. */
    readonly compareBase: string | null;
    /** Namespace-bound translate. */
    readonly t: TranslateNS<'sidebarFiles'>;
    /** Perform one row's action. */
    readonly onSelect: (action: EntryMenuAction) => void;
    /** Dismiss the menu. */
    readonly onClose: () => void;
}
/**
 * Render one entry's context menu, placed at the pointer that opened it.
 * @param props - see {@link EntryMenuProps}.
 * @returns the portaled menu list.
 */
export declare function EntryMenu({ target, selection, compareBase, t, onSelect, onClose }: EntryMenuProps): ReactNode;
//# sourceMappingURL=EntryMenu.d.ts.map