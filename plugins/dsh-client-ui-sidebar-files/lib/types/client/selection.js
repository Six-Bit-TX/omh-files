import { childPath } from "./face.js";
import { entryName, parentPath } from "./paths.js";
/** Natural, case-insensitive name order, so `file2` precedes `file10`. */
const byName = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
/**
 * Order one level's entries for display: directories first, then everything
 * else, each group by name. The endpoint's order is a listing fact; this is the
 * reader's.
 * @param entries - the listing as the endpoint returned it.
 * @returns a new array, directories first, then by name within each group.
 */
export function orderEntries(entries) {
    return [...entries].sort((left, right) => {
        const group = Number(right.type === 'directory') - Number(left.type === 'directory');
        return group !== 0 ? group : byName.compare(left.name, right.name);
    });
}
/**
 * Every selectable row the tree is showing right now, in display order: each
 * loaded level's entries, depth-first through the directories that are open.
 * An entry the endpoint calls neither a file nor a directory is not one of them,
 * because it cannot be opened, moved, or downloaded either.
 * @param state - this tab's tree.
 * @returns the absolute paths of the visible rows, in the order they are drawn.
 */
export function visiblePaths(state) {
    const paths = [];
    const walk = (directory) => {
        const level = state.levels[directory];
        if (level === undefined || level.kind !== 'ready')
            return;
        for (const entry of orderEntries(level.level.entries)) {
            if (entry.type === 'other')
                continue;
            const path = childPath(directory, entry.name);
            paths.push(path);
            if (entry.type === 'directory' && state.expanded.includes(path))
                walk(path);
        }
    };
    walk(state.root);
    return paths;
}
/**
 * The rows a Shift click selects: everything between the anchor and the clicked
 * row inclusive, in display order either way round. Without an anchor, or with
 * one that is no longer on screen, the click selects its own row alone.
 * @param order - the visible paths, in display order.
 * @param anchor - the path the range measures from, or null.
 * @param path - the row that was clicked.
 * @returns the paths to select, in display order.
 */
export function rangeBetween(order, anchor, path) {
    const to = order.indexOf(path);
    const from = anchor === null ? -1 : order.indexOf(anchor);
    if (from < 0 || to < 0)
        return [path];
    return order.slice(Math.min(from, to), Math.max(from, to) + 1);
}
/**
 * Which selection gesture one click carries: a Ctrl/Cmd click toggles, a Shift
 * click extends, and anything else selects just the row it landed on. Ctrl/Cmd
 * wins when both are held, which is what every file manager does with them.
 * @param event - the click, read for its modifier keys.
 * @returns the gesture to apply.
 */
export function selectionGesture(event) {
    if (event.metaKey || event.ctrlKey)
        return 'toggle';
    if (event.shiftKey)
        return 'range';
    return 'plain';
}
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
export function entryAt(state, path) {
    const level = state.levels[parentPath(path)];
    if (level === undefined || level.kind !== 'ready')
        return undefined;
    const name = entryName(path);
    const entry = level.level.entries.find(candidate => candidate.name === name);
    if (entry === undefined || entry.type === 'other')
        return undefined;
    return { path, name, kind: entry.type === 'directory' ? 'directory' : 'file' };
}
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
export function menuTargets(state, target) {
    if (state.selected.length > 1 && state.selected.includes(target.path)) {
        const entries = state.selected.map(path => entryAt(state, path));
        if (entries.every((entry) => entry !== undefined))
            return entries;
    }
    return [{ path: target.path, name: target.name, kind: target.kind }];
}
//# sourceMappingURL=selection.js.map