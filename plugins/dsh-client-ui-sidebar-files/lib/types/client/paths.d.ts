/**
 * Path arithmetic the tree's rows and menus need: the last segment, the parent
 * directory, and a path relative to the tab's root.
 *
 * Every path here is one the tree keys a row by (`face.ts`'s `childPath`), so
 * `/` is the separator the tree mints itself; a Host-reported path may also
 * carry `\`, and both are read.
 */
/**
 * The last segment of a path: a row's display name, and the name a rename
 * dialog pre-fills.
 * @param path - absolute path.
 * @returns the last segment, or the path itself when it has none.
 */
export declare function entryName(path: string): string;
/**
 * The parent directory of a path.
 * @param path - absolute path.
 * @returns the parent's absolute path, or the path itself when it has no parent.
 */
export declare function parentPath(path: string): string;
/**
 * A path as the tree's root sees it.
 * @param root - absolute path the tab is rooted at.
 * @param path - absolute path of the entry.
 * @returns the path relative to the root; unchanged when it lies outside.
 */
export declare function relativeToRoot(root: string, path: string): string;
//# sourceMappingURL=paths.d.ts.map