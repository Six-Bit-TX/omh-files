/**
 * What the tree has selected, and which gesture changed it.
 *
 * Selection is this tab's list of absolute paths, in the order they were added,
 * plus the entry a range measures from. Three gestures produce it: a plain click
 * selects exactly the row it landed on, a Ctrl/Cmd click adds or removes that
 * row, and a Shift click takes everything between the anchor and the row clicked
 * — in the tree's own display order, which is the order {@link visiblePaths}
 * walks. A plain click still opens or toggles its row; the two modified gestures
 * only select.
 *
 * Nothing here writes: the store owns the list, and this module is what the body
 * reads it with.
 */
import type { WorkspaceDirectoryEntry } from '@deepseek-ai/dsh-api-workspace-files/types';
import type { FilesTabState } from './store.ts';
import type { EntrySelection, EntryTarget } from './EntryMenu.tsx';
/** Which of the three selection gestures one click carries. */
export type SelectionGesture = 'plain' | 'toggle' | 'range';
/**
 * Order one level's entries for display: directories first, then everything
 * else, each group by name. The endpoint's order is a listing fact; this is the
 * reader's.
 * @param entries - the listing as the endpoint returned it.
 * @returns a new array, directories first, then by name within each group.
 */
export declare function orderEntries(entries: readonly WorkspaceDirectoryEntry[]): WorkspaceDirectoryEntry[];
/**
 * Every selectable row the tree is showing right now, in display order: each
 * loaded level's entries, depth-first through the directories that are open.
 * An entry the endpoint calls neither a file nor a directory is not one of them,
 * because it cannot be opened, moved, or downloaded either.
 * @param state - this tab's tree.
 * @returns the absolute paths of the visible rows, in the order they are drawn.
 */
export declare function visiblePaths(state: FilesTabState): string[];
/**
 * The rows a Shift click selects: everything between the anchor and the clicked
 * row inclusive, in display order either way round. Without an anchor, or with
 * one that is no longer on screen, the click selects its own row alone.
 * @param order - the visible paths, in display order.
 * @param anchor - the path the range measures from, or null.
 * @param path - the row that was clicked.
 * @returns the paths to select, in display order.
 */
export declare function rangeBetween(order: readonly string[], anchor: string | null, path: string): string[];
/**
 * Which selection gesture one click carries: a Ctrl/Cmd click toggles, a Shift
 * click extends, and anything else selects just the row it landed on. Ctrl/Cmd
 * wins when both are held, which is what every file manager does with them.
 * @param event - the click, read for its modifier keys.
 * @returns the gesture to apply.
 */
export declare function selectionGesture(event: Pick<MouseEvent, 'metaKey' | 'ctrlKey' | 'shiftKey'>): SelectionGesture;
/**
 * One entry as the listing that showed it reported it.
 *
 * The selection holds paths, so this is how a path becomes a name and a kind
 * again: the parent level is the only thing that knows them. A path no loaded
 * level holds — its directory was reloaded, or the entry is gone — resolves to
 * undefined, and a caller acting on a selection treats that as a reason not to.
 * @param state - this tab's tree.
 * @param path - absolute path of the entry.
 * @returns the entry, or undefined when no loaded level holds it.
 */
export declare function entryAt(state: FilesTabState, path: string): EntrySelection | undefined;
/**
 * The entries one row menu acts on: the tab's whole selection while the row the
 * menu opened on is part of it, and that row alone otherwise.
 *
 * A selection this tree can no longer resolve in full is never acted on in part:
 * the menu falls back to its own row rather than moving, deleting, or
 * downloading fewer entries than it names.
 * @param state - this tab's tree.
 * @param target - the row the menu was opened on.
 * @returns the entries the menu's rows apply to, never empty.
 */
export declare function menuTargets(state: FilesTabState, target: EntryTarget): EntrySelection[];
//# sourceMappingURL=selection.d.ts.map