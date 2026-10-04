/** The private drag type one tree row's own gesture carries. */
export declare const FILES_DRAG_MIME = "application/x-dsh-workspace-files+json";
/**
 * Encode the paths one drag carries.
 * @param paths - absolute paths of the entries being dragged.
 * @returns the data transfer payload for {@link FILES_DRAG_MIME}.
 */
export declare function encodeDragPaths(paths: readonly string[]): string;
/**
 * Read the paths one drop carries, tolerating a payload this module did not
 * write: a drag from another origin, or one whose data the browser withheld.
 * @param payload - the data transfer value, or an empty string when absent.
 * @returns the paths, or an empty list when the payload is not this module's.
 */
export declare function decodeDragPaths(payload: string): string[];
/**
 * Which dragged entries a drop on `destination` would actually move.
 *
 * Three kinds drop out, because moving them is either unnecessary or
 * impossible: an entry already in that directory, the directory itself, and an
 * entry inside another dragged directory — which the folder being moved already
 * carries. What remains is what the Host is asked to move, so a gesture that
 * could do nothing sends no request at all.
 * @param paths - absolute paths the drag carried.
 * @param destination - absolute path of the directory it was dropped on.
 * @returns the paths to move, in the order they were dragged.
 */
export declare function movablePaths(paths: readonly string[], destination: string): string[];
//# sourceMappingURL=drag.d.ts.map