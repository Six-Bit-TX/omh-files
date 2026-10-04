/**
 * The file tree's view state: which directories are expanded, what each
 * loaded level contains, which rows are selected, and where the body is
 * scrolled to.
 *
 * The tree is not one resource. A directory listing per level, expanded lazily,
 * is state the type owns — so it lives in a Slot-standard exclusive store
 * (one instance per session), bucketed by tab id because two tabs of this kind
 * in one session expand independently.
 *
 * Writers run between `start` and `forget`: the owner's `signal` is what ends a
 * bucket's life, and the face stops dispatching once it aborts.
 */
import { defineStore } from '@deepseek-ai/dsh-client-store';
/** How many visited directories one tab remembers. */
export const RECENT_LIMIT = 8;
/**
 * Put `root` at the head of a tab's visited list, dropping any earlier visit to
 * it and the oldest entries past {@link RECENT_LIMIT}.
 * @param recent - the tab's visited directories, most recent first.
 * @param root - the directory now being rooted at.
 * @returns the new list.
 */
function visit(recent, root) {
    return [root, ...recent.filter(path => path !== root)].slice(0, RECENT_LIMIT);
}
/**
 * One tab's bucket, which every writer after `start` relies on: the face only
 * dispatches while the record's signal is live, and `forget` runs on its abort.
 * @param state - the draft.
 * @param tabId - the tab being written.
 * @returns the tab's tree.
 */
function bucket(state, tabId) {
    const tree = state.byTab[tabId];
    if (tree === undefined)
        throw new Error(`ui-sidebar-files: no tree for tab "${tabId}"`);
    return tree;
}
/**
 * Declare the file tree's store.
 *
 * A factory rather than a shared handle: the registration declares it as an
 * exclusive store, so the framework mints one instance per session.
 * @returns the store handle to declare on the registration.
 */
export function createFilesStore() {
    return defineStore({
        init: () => ({ byTab: {} }),
        actions: {
            /**
             * Seed one tab's tree at its workspace root, with the root expanded.
             *
             * A new tab always starts here, at the session's own working directory:
             * nothing another tab navigated to can seed it.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param root - absolute path of the workspace root.
             */
            start: (d, tabId, root) => {
                d.byTab[tabId] = {
                    root,
                    levels: {},
                    expanded: [root],
                    scrollTop: 0,
                    recent: [root],
                    compareBase: null,
                    selected: [],
                    anchor: null,
                    uploads: [],
                };
            },
            /**
             * Root one tab at another directory, as the address bar and the location
             * menu ask: the new root is the only expanded directory, nothing stays
             * loaded, the body starts at the top, and the visit joins the tab's own
             * recent list. A selection belongs to the directory it was made in, so it
             * ends here.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param root - absolute path of the directory to root at.
             */
            navigate: (d, tabId, root) => {
                const state = bucket(d, tabId);
                state.root = root;
                state.levels = {};
                state.expanded = [root];
                state.scrollTop = 0;
                state.recent = visit(state.recent, root);
                state.selected = [];
                state.anchor = null;
            },
            /**
             * Set or clear one tab's compare base.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param path - absolute path selected as the base, or null to clear it.
             */
            compareSelected: (d, tabId, path) => {
                bucket(d, tabId).compareBase = path;
            },
            /**
             * Select exactly one entry, as an unmodified click does, and anchor a
             * range there.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param path - absolute path of the entry clicked.
             */
            selectOne: (d, tabId, path) => {
                const state = bucket(d, tabId);
                state.selected = [path];
                state.anchor = path;
            },
            /**
             * Add one entry to the selection, or drop it when it is already there, as
             * a Ctrl/Cmd click does; either way the anchor moves to it.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param path - absolute path of the entry clicked.
             */
            toggleSelected: (d, tabId, path) => {
                const state = bucket(d, tabId);
                state.selected = state.selected.includes(path)
                    ? state.selected.filter(selected => selected !== path)
                    : [...state.selected, path];
                state.anchor = path;
            },
            /**
             * Replace the selection with one range, as a Shift click does. The anchor
             * stays where it is, so a second Shift click measures from the same entry.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param paths - the selected paths, in display order.
             */
            selectRange: (d, tabId, paths) => {
                bucket(d, tabId).selected = [...paths];
            },
            /**
             * Drop one tab's selection, after a gesture consumed it — a move, a
             * removal — or after a new root made it meaningless.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             */
            clearSelection: (d, tabId) => {
                const state = bucket(d, tabId);
                state.selected = [];
                state.anchor = null;
            },
            /**
             * Mark one directory as being listed.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param path - absolute directory path.
             */
            loading: (d, tabId, path) => {
                bucket(d, tabId).levels[path] = { kind: 'loading' };
            },
            /**
             * Record one directory's contents.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param path - absolute directory path.
             * @param level - the listing to show under it.
             */
            loaded: (d, tabId, path, level) => {
                bucket(d, tabId).levels[path] = { kind: 'ready', level };
            },
            /**
             * Record why one directory could not be listed.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param path - absolute directory path.
             * @param failure - the settled Remote failure.
             */
            failed: (d, tabId, path, failure) => {
                bucket(d, tabId).levels[path] = { kind: 'failed', failure };
            },
            /**
             * Open a collapsed directory, or collapse an open one.
             *
             * A collapsed level keeps what it loaded, so reopening it draws at once.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param path - absolute directory path.
             */
            toggled: (d, tabId, path) => {
                const state = bucket(d, tabId);
                const at = state.expanded.indexOf(path);
                if (at >= 0)
                    state.expanded.splice(at, 1);
                else
                    state.expanded.push(path);
            },
            /**
             * Record where one tab's body is scrolled to.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param scrollTop - the body's scroll offset, in px.
             */
            scrolled: (d, tabId, scrollTop) => {
                bucket(d, tabId).scrollTop = scrollTop;
            },
            /**
             * Drop every loaded level, keeping what is expanded.
             *
             * This is the reload gesture's first half: the expanded set says which
             * levels to fetch again.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             */
            reset: (d, tabId) => {
                bucket(d, tabId).levels = {};
            },
            /**
             * Open one directory if it is closed.
             *
             * A landed upload reveals what it wrote, and this runs after an await, so
             * it states the outcome it wants rather than toggling what a stale
             * snapshot showed.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param path - absolute directory path to open.
             */
            expand: (d, tabId, path) => {
                const state = bucket(d, tabId);
                if (!state.expanded.includes(path))
                    state.expanded.push(path);
            },
            /**
             * Put one file on this tab's upload list, or restart its row: uploading a
             * name again after a refusal replaces that row rather than stacking a
             * second one beside it.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param task - the upload this tab just started.
             */
            uploadQueued: (d, tabId, task) => {
                const state = bucket(d, tabId);
                state.uploads = [...state.uploads.filter(upload => upload.path !== task.path), task];
            },
            /**
             * End one upload: a landed file leaves the list, a refused one keeps its
             * row carrying the failure, and `undefined` dismisses a refused row.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param path - absolute path of the file the upload targets.
             * @param failure - why the Host refused it, or undefined when it landed or is being dismissed.
             */
            uploadFinished: (d, tabId, path, failure) => {
                const state = bucket(d, tabId);
                state.uploads = failure === undefined
                    ? state.uploads.filter(upload => upload.path !== path)
                    : state.uploads.map(upload => upload.path === path ? { ...upload, failure } : upload);
            },
            /**
             * Forget one tab's tree, for a tab record that is gone.
             * @param d - draft state.
             * @param tabId - the tab that went away.
             */
            forget: (d, tabId) => {
                d.byTab = Object.fromEntries(Object.entries(d.byTab).filter(([id]) => id !== tabId));
            },
        },
    });
}
//# sourceMappingURL=store.js.map