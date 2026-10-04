/**
 * One tree row dragged onto a directory: which entries the gesture carries, and
 * which of them a move to that directory could actually do.
 *
 * The dragged paths travel on the drag's own data transfer under a private type,
 * so a drop can tell this tree's own gesture from files arriving from the
 * reader's machine — the two share every drop target. Nothing here touches the
 * DOM: a drag start encodes, a drop decodes, and the destination filter is a
 * pure decision the body acts on.
 */
import { parentPath } from "./paths.js";
/** The private drag type one tree row's own gesture carries. */
export const FILES_DRAG_MIME = 'application/x-dsh-workspace-files+json';
/**
 * Encode the paths one drag carries.
 * @param paths - absolute paths of the entries being dragged.
 * @returns the data transfer payload for {@link FILES_DRAG_MIME}.
 */
export function encodeDragPaths(paths) {
    return JSON.stringify({ paths });
}
/**
 * Read the paths one drop carries, tolerating a payload this module did not
 * write: a drag from another origin, or one whose data the browser withheld.
 * @param payload - the data transfer value, or an empty string when absent.
 * @returns the paths, or an empty list when the payload is not this module's.
 */
export function decodeDragPaths(payload) {
    if (payload.length === 0)
        return [];
    try {
        const parsed = JSON.parse(payload);
        const paths = parsed.paths;
        if (!Array.isArray(paths))
            return [];
        return paths.filter((path) => typeof path === 'string' && path.length > 0);
    }
    catch (error) {
        // Malformed payload: not this tree's drag, so it carries nothing to move.
        if (error instanceof SyntaxError)
            return [];
        throw error;
    }
}
/**
 * Whether `path` lies below the directory `directory`.
 * @param directory - absolute path of the directory.
 * @param path - absolute path to test.
 * @returns true when the path is inside the directory rather than equal to it.
 */
function isBelow(directory, path) {
    const base = directory.replace(/[/\\]+$/, '');
    return path.startsWith(`${base}/`) || path.startsWith(`${base}\\`);
}
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
export function movablePaths(paths, destination) {
    const unique = [...new Set(paths)];
    return unique.filter(path => path !== destination
        && parentPath(path) !== destination
        && !unique.some(other => other !== path && isBelow(other, path)));
}
//# sourceMappingURL=drag.js.map