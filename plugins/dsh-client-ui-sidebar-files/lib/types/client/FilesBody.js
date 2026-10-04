import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * The file tree's body: the directory it is rooted at, listed one level at a
 * time, and every gesture a row offers.
 *
 * Everything the tree keeps lives in its store, keyed by tab; everything it
 * asks for goes through its injected face. The component itself only decides
 * what to draw for each absolute path and what a gesture means: a plain click
 * selects a row and activates it — a directory toggles, a file opens through the
 * owner's `tabActions` for a `file:` viewer to claim — while a Ctrl/Cmd click
 * adds or removes one row and a Shift click extends the selection from its
 * anchor. Anything that is neither a file nor a directory is shown but refuses
 * both. A right-click opens the row menu on the selection, whose rows copy,
 * download, move, rename, remove, compare, or open a file's timeline. The header
 * row is the address bar (`PathHeader`), the upload control, and the reload
 * control, which drops every listed level and asks again for the expanded ones.
 *
 * Files from the reader's own machine arrive two ways: the header's control
 * picks them, and a drop on the tree carries them. Both name a directory — the
 * tab's root for the header and the body's own background, the row's own
 * directory for a drop on a directory row — and both run through the same
 * gesture below, which keeps one row per file until the Host answers.
 *
 * A drop on a directory can also carry the tree's own rows: dragging a selected
 * row onto a directory row moves the dragged entries there, which is the same
 * `move` the dialog performs. The two gestures are told apart by the drag's own
 * private type, so an OS file drop and a tree drag share every target.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { FileTypeIcon, IconFolderClose16, IconFolderOpen16, classifyFileType, writeClipboard, } from '@deepseek-ai/dsh-client-ui-primitives';
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path';
import { childPath } from "./face.js";
import { actionFailureLine, failureLine, uploadFailureLine } from "./failures.js";
import { downloadFiles, httpDownloadsAvailable, saveBase64File } from "./download.js";
import { decodeDragPaths, encodeDragPaths, FILES_DRAG_MIME, movablePaths } from "./drag.js";
import { filesOf } from "./upload.js";
import { parentPath, relativeToRoot } from "./paths.js";
import { menuTargets, orderEntries, rangeBetween, selectionGesture, visiblePaths } from "./selection.js";
import { CompareDialog } from "./CompareDialog.js";
import { DeleteDialog } from "./DeleteDialog.js";
import { EntryMenu } from "./EntryMenu.js";
import { MoveDialog } from "./MoveDialog.js";
import { PathHeader } from "./PathHeader.js";
import { RenameDialog } from "./RenameDialog.js";
import { TimelineDialog } from "./TimelineDialog.js";
import css from './FilesBody.module.css';
/**
 * Closed-union backstop for the row menu's action ids.
 * @param value - the action the menu reported.
 * @returns never; the call is unreachable.
 */
/* v8 ignore next 3 -- closed-union backstop; only reached if an action id is forged */
function assertNever(value) {
    throw new Error(`ui-sidebar-files: unknown row action ${String(value)}`);
}
/**
 * The drag-and-drop handlers that make one element the drop target for one
 * directory. A directory's row carries them, so its whole subtree — the row and
 * every level under it — lands files in that directory, and the innermost
 * directory under the pointer is the one that wins. The drop carries either the
 * reader's own files or this tree's dragged rows, which the payload tells apart.
 * @param dir - absolute path of the directory a drop here lands in.
 * @param tree - the level's shared context.
 * @returns the three handlers to spread onto the element.
 */
function dropHandlers(dir, tree) {
    return {
        onDragOver: (event) => {
            // Claim the drop: without this the browser refuses it, and without
            // stopping here an enclosing directory would claim it instead.
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = event.dataTransfer.types.includes(FILES_DRAG_MIME) ? 'move' : 'copy';
            tree.onDropTarget(dir);
        },
        onDragLeave: () => { tree.onDropTarget(null); },
        onDrop: (event) => {
            event.preventDefault();
            event.stopPropagation();
            tree.onDropTarget(null);
            const dragged = decodeDragPaths(event.dataTransfer.getData(FILES_DRAG_MIME));
            if (dragged.length > 0) {
                tree.onDropPaths(dir, dragged);
                return;
            }
            tree.onDropFiles(dir, event.dataTransfer.files);
        },
    };
}
/** One entry's row, and its children when it is an expanded directory. */
function Entry({ parent, entry, tree }) {
    const path = childPath(parent, entry.name);
    const selected = tree.state.selected.includes(path);
    /**
     * Open this row's menu where the pointer was: the browser's own menu would
     * otherwise cover the tree.
     * @param event - the context-menu gesture on this row.
     */
    const openMenu = (event, kind) => {
        event.preventDefault();
        tree.onContextMenu({ path, name: entry.name, kind, x: event.clientX, y: event.clientY });
    };
    if (entry.type === 'directory') {
        const expanded = tree.state.expanded.includes(path);
        return (_jsxs("li", { className: clsx(css.item, tree.dropDir === path && css.dropTarget), "data-files-entry": "directory", "data-files-path": path, ...tree.dropDir === path ? { 'data-files-drop-target': '' } : {}, ...dropHandlers(path, tree), children: [_jsxs("button", { type: "button", className: clsx(css.row, selected && css.rowSelected), "aria-expanded": expanded, draggable: true, "data-files-selected": selected ? 'true' : 'false', onClick: (event) => { tree.onActivate(path, 'directory', event); }, onContextMenu: (event) => { openMenu(event, 'directory'); }, onDragStart: (event) => { tree.onDragStart(event, path); }, children: [expanded ? _jsx(IconFolderOpen16, { className: css.icon }) : _jsx(IconFolderClose16, { className: css.icon }), _jsx("span", { className: css.name, children: entry.name })] }), expanded && _jsx("ul", { className: css.level, children: _jsx(Level, { path: path, tree: tree }) })] }));
    }
    if (entry.type === 'file') {
        return (_jsx("li", { className: css.item, "data-files-entry": "file", "data-files-path": path, children: _jsxs("button", { type: "button", className: clsx(css.row, selected && css.rowSelected), draggable: true, "data-files-selected": selected ? 'true' : 'false', onClick: (event) => { tree.onActivate(path, 'file', event); }, onContextMenu: (event) => { openMenu(event, 'file'); }, onDragStart: (event) => { tree.onDragStart(event, path); }, children: [_jsx(FileTypeIcon, { kind: classifyFileType(entry.name), size: 16, className: css.fileIcon }), _jsx("span", { className: css.name, children: entry.name })] }) }));
    }
    return (_jsx("li", { className: css.item, "data-files-entry": "other", "data-files-path": path, children: _jsx("span", { className: clsx(css.row, css.other), "aria-disabled": "true", title: tree.t('entry.other'), children: _jsx("span", { className: css.name, children: entry.name }) }) }));
}
/** One directory's rows: its state while listing, its entries once listed. */
function Level({ path, tree }) {
    const { state, t } = tree;
    const level = state.levels[path];
    if (level === undefined || level.kind === 'loading') {
        return _jsx("li", { className: css.note, "data-files-row": "loading", children: t('loading') });
    }
    if (level.kind === 'failed') {
        return (_jsx("li", { className: css.note, "data-files-row": "failed", "data-files-code": level.failure.code, children: failureLine(t, level.failure) }));
    }
    const entries = orderEntries(level.level.entries);
    return (_jsxs(_Fragment, { children: [entries.length === 0 && _jsx("li", { className: css.note, "data-files-row": "empty", children: t('empty') }), entries.map(entry => _jsx(Entry, { parent: path, entry: entry, tree: tree }, entry.name)), level.level.truncated && _jsx("li", { className: css.note, "data-files-row": "truncated", children: t('truncated') })] }));
}
/** The file tree's body: the directory it is rooted at and whatever the reader has opened under it. */
export function FilesBody({ useTabInfo, sessionId, useSessions, useWorkspaces, useStore, actions, start, navigate, load, toggle, rename, remove, move, upload, download, readPage, history, homePath, t, }) {
    const { tab } = useTabInfo();
    const { signal, actions: tabActions } = tab;
    const cwd = useSessions(sessions => sessions.byId[sessionId]?.cwd);
    const workspaces = useWorkspaces(state => state.items);
    // The header's jump targets are the Workspace entity reduced to what the menu
    // shows and where it goes; the identity it carries is the Workspace id.
    const locations = useMemo(() => workspaces.map(workspace => ({
        id: workspace.workspaceId,
        title: workspace.title,
        path: workspace.path,
    })), [workspaces]);
    const state = useStore(store => store.byTab[tab.id]);
    // The rows currently drawn, in display order: what a Shift click takes a range
    // of. Recomputed whenever anything the tree draws from moves.
    const order = useMemo(() => state === undefined ? [] : visiblePaths(state), [state]);
    const bodyRef = useRef(null);
    const scrollTopRef = useRef(0);
    const rootSeen = useRef(state?.root);
    const [menuAt, setMenuAt] = useState(null);
    const [dialog, setDialog] = useState(null);
    const [notice, setNotice] = useState(null);
    const [dropDir, setDropDir] = useState(null);
    // Stable per tab: a dialog's read effect keys on these, and the store's own
    // face members survive every re-render.
    const readPageBound = useCallback((path) => readPage(path, signal), [readPage, signal]);
    const historyBound = useCallback((path) => history(path, signal), [history, signal]);
    // Come back where the reader was: loaded levels outlive the body in the
    // store, so a remounted tree lays out at its full height before this runs
    // and the stored offset re-lands exactly. A fresh tree stores 0.
    const seeded = state !== undefined;
    useLayoutEffect(() => {
        const body = bodyRef.current;
        if (seeded && body !== null) {
            body.scrollTop = state.scrollTop;
            scrollTopRef.current = body.scrollTop;
        }
    }, [seeded]);
    // Rooting the tab elsewhere starts the body at the top again; the store's own
    // offset is already 0, so this only moves the elements that stayed mounted.
    useLayoutEffect(() => {
        if (rootSeen.current === state?.root)
            return;
        rootSeen.current = state?.root;
        scrollTopRef.current = 0;
        /* v8 ignore next -- the body is mounted whenever the root under it changes */
        if (bodyRef.current !== null)
            bodyRef.current.scrollTop = 0;
    }, [state?.root]);
    // Scrolling only moves the ref; the store hears about it once, on unmount,
    // so a scroll neither re-renders the tree nor writes after the owner's
    // abort has forgotten the bucket.
    useEffect(() => () => {
        if (seeded && !signal.aborted)
            actions.scrolled(tab.id, scrollTopRef.current);
    }, [seeded, signal, tab.id, actions]);
    useEffect(() => {
        // A bucket gone because the record aborted must not be re-seeded by a
        // component that has not unmounted yet.
        if (state !== undefined || cwd === undefined || signal.aborted)
            return;
        start(tab.id, cwd, signal);
    }, [state, cwd, tab.id, signal, start]);
    if (cwd === undefined) {
        return (_jsx("div", { className: css.status, "data-files-state": "no-workspace", children: _jsx("p", { className: css.statusLine, children: t('noWorkspace') }) }));
    }
    if (state === undefined)
        return null;
    /**
     * Download the files of one selection, one request each, and report the ones
     * that could not start.
     *
     * A page served by the Host hands the browser the Host's streaming route, so
     * nothing here holds a file. A `file://` shell has no such route: it reads each
     * file through the Remote face, which is capped at the Host's complete-file
     * limit but is the only path it has.
     * @param targets - the entries the gesture acts on; directories are skipped.
     */
    const startDownload = (targets) => {
        const files = targets
            .filter(target => target.kind === 'file')
            .map(target => ({ path: target.path, name: target.name }));
        /* v8 ignore next -- the menu offers download only while the selection holds a file */
        if (files.length === 0)
            return;
        if (httpDownloadsAvailable()) {
            void downloadFiles(files, sessionId, signal).then((report) => { reportFailures(report.failures); });
            return;
        }
        void downloadThroughRemote(files).then(reportFailures);
    };
    /** One line naming the first files that could not start, when any did not. */
    const reportFailures = (failures) => {
        if (signal.aborted || failures.length === 0)
            return;
        setNotice(t('download.failed', { count: String(failures.length), message: failures[0] ?? '' }));
    };
    /**
     * Read one whole file per request through the Remote face and hand each to the
     * browser, reporting the files the Host refused.
     * @param files - the files the gesture selected, in the order to download them.
     * @returns one `name: reason` line per file that could not start.
     */
    const downloadThroughRemote = async (files) => {
        const failures = [];
        for (const file of files) {
            if (signal.aborted)
                break;
            const result = await download(file.path, signal);
            // oxlint-disable-next-line typescript/no-unnecessary-condition -- the record can abort while the file is awaited.
            if (signal.aborted)
                break;
            if (!result.ok) {
                failures.push(`${file.name}: ${actionFailureLine(t, result.error)}`);
                continue;
            }
            saveBase64File(result.value.name, result.value.base64);
        }
        return failures;
    };
    /**
     * Rename one entry, then list the directory that showed it again. An expanded
     * renamed directory has its own level listed under its new path.
     * @param target - the entry being renamed.
     * @param newName - the name the reader confirmed.
     * @returns a localized failure line, or null when the Host accepted it.
     */
    const confirmRename = (target, newName) => rename(target.path, newName, signal).then((result) => {
        if (!result.ok)
            return actionFailureLine(t, result.error);
        load(tab.id, parentPath(target.path), signal);
        if (state.expanded.includes(target.path))
            load(tab.id, result.value.absolutePath, signal);
        return null;
    });
    /**
     * Move entries into one directory, then list every directory that changed: the
     * ones they left, and the one they landed in — whose absolute path only the
     * Host knows, since the reader may have typed a relative destination.
     * @param paths - absolute paths of the entries to move.
     * @param destination - the destination the reader confirmed or dropped on.
     * @returns a localized failure line, or null when the Host accepted it.
     */
    const applyMove = (paths, destination) => move(paths, destination, signal).then((result) => {
        if (signal.aborted)
            return null;
        const directories = new Set(paths.map(parentPath));
        if (result.ok) {
            directories.add(result.value.destination);
            actions.clearSelection(tab.id);
        }
        for (const directory of directories)
            load(tab.id, directory, signal);
        return result.ok ? null : actionFailureLine(t, result.error);
    });
    /**
     * Move the rows one drop carried into the directory it landed on. Entries
     * already there, and ones inside another dragged directory, are dropped before
     * the Host is asked, so a gesture that could do nothing sends no request.
     * @param paths - absolute paths the drag carried.
     * @param dir - absolute path of the directory it was dropped on.
     */
    const dropMove = (paths, dir) => {
        const movable = movablePaths(paths, dir);
        if (movable.length === 0)
            return;
        void applyMove(movable, dir).then((line) => { if (line !== null)
            setNotice(line); });
    };
    /**
     * Remove the entries of one selection, one request each, then list every
     * directory that lost one. The dialog stays open on the first refusal so the
     * reader can read it; entries removed before it are already gone from the
     * listing behind it.
     * @param targets - the entries being removed.
     * @returns a localized failure line, or null when every removal was accepted.
     */
    const confirmDelete = async (targets) => {
        let failure = null;
        const directories = new Set();
        for (const target of targets) {
            const result = await remove(target.path, signal);
            if (signal.aborted)
                return failure;
            if (!result.ok) {
                failure ??= actionFailureLine(t, result.error);
                continue;
            }
            directories.add(parentPath(target.path));
        }
        for (const directory of directories)
            load(tab.id, directory, signal);
        if (directories.size > 0)
            actions.clearSelection(tab.id);
        return failure;
    };
    /**
     * Perform one row menu's action.
     * @param action - the row the reader chose.
     * @param target - the entry the menu was opened on.
     */
    const runMenuAction = (action, target) => {
        setMenuAt(null);
        setNotice(null);
        // The menu names a selection, and acts on exactly what it named.
        const targets = menuTargets(state, target);
        switch (action) {
            case 'open':
                tabActions.openResource(fileAddressFor(sessionId, state.root, target.path));
                return;
            case 'compareSelect':
                actions.compareSelected(tab.id, target.path);
                return;
            case 'compareWith':
                // The row is listed only while another file is the base, so the base is
                // a path here.
                setDialog({ action: 'compare', target, base: state.compareBase });
                return;
            case 'timeline':
                setDialog({ action: 'timeline', target });
                return;
            case 'copyPath':
                void writeClipboard(targets.map(entry => entry.path).join('\n'));
                return;
            case 'copyRelativePath':
                void writeClipboard(targets.map(entry => relativeToRoot(state.root, entry.path)).join('\n'));
                return;
            case 'download':
                startDownload(targets);
                return;
            case 'move':
                setDialog({ action: 'move', targets });
                return;
            case 'rename':
                setDialog({ action: 'rename', target });
                return;
            case 'delete':
                setDialog({ action: 'delete', targets });
                return;
            /* v8 ignore next -- closed-union backstop; only reached if an action id is forged */
            default: return assertNever(action);
        }
    };
    /**
     * Put the files the reader picked or dropped into one directory.
     *
     * Each file gets a row on the tab's upload list before it is read, keeps that
     * row carrying the reason if the Host refuses it, and leaves it on the way
     * into a directory that is listed again. The directory opens first when it
     * was closed, so a landed file is never hidden inside a collapsed level.
     * @param dir - absolute path of the directory the files land in.
     * @param files - what the gesture delivered.
     */
    const startUpload = (dir, files) => {
        for (const file of filesOf(files)) {
            const path = childPath(dir, file.name);
            actions.uploadQueued(tab.id, { path, dir, name: file.name, bytes: file.size });
            void upload(tab.id, dir, file, signal).then((result) => {
                // The record ended before this file was sent: its bucket is gone and
                // there is nothing left to report to.
                if (result === undefined)
                    return;
                actions.uploadFinished(tab.id, path, result.ok ? undefined : result.error);
                if (!result.ok)
                    return;
                actions.expand(tab.id, dir);
                load(tab.id, dir, signal);
            });
        }
    };
    /**
     * Apply one click to the selection, and activate the row when the click was a
     * plain one: a directory toggles, a file opens. The two modified gestures
     * select without activating, so a Ctrl/Cmd click can build a selection of
     * files without opening every one of them.
     * @param path - absolute path of the row clicked.
     * @param kind - whether that row is a file or a directory.
     * @param event - the click, read for its modifier keys.
     */
    const activate = (path, kind, event) => {
        const gesture = selectionGesture(event);
        if (gesture === 'toggle') {
            actions.toggleSelected(tab.id, path);
            return;
        }
        if (gesture === 'range') {
            actions.selectRange(tab.id, rangeBetween(order, state.anchor, path));
            return;
        }
        actions.selectOne(tab.id, path);
        if (kind === 'directory')
            toggle(tab.id, path, state.levels[path] !== undefined, signal);
        // Every row is under the tree's root, so its address is session-relative.
        else
            tabActions.openResource(fileAddressFor(sessionId, state.root, path));
    };
    /**
     * Start dragging one row, carrying the whole selection it belongs to.
     * @param event - the drag start on that row.
     * @param path - absolute path of the row under the pointer.
     */
    const startDrag = (event, path) => {
        const dragged = state.selected.includes(path) ? state.selected : [path];
        event.dataTransfer.setData(FILES_DRAG_MIME, encodeDragPaths(dragged));
        event.dataTransfer.effectAllowed = 'move';
    };
    const tree = {
        state,
        onActivate: activate,
        onContextMenu: (target) => {
            setNotice(null);
            // A right-click on a row outside the selection works on that row alone,
            // so the selection moves to it before the menu names it.
            if (!state.selected.includes(target.path))
                actions.selectOne(tab.id, target.path);
            setMenuAt(target);
        },
        onDragStart: startDrag,
        onDropFiles: startUpload,
        onDropPaths: (dir, paths) => { dropMove(paths, dir); },
        dropDir,
        onDropTarget: setDropDir,
        t,
    };
    // Reload drops every level and asks again for the expanded ones; a collapsed
    // level is fetched again the next time it opens.
    const reload = () => {
        actions.reset(tab.id);
        for (const path of state.expanded)
            load(tab.id, path, signal);
    };
    return (_jsxs(_Fragment, { children: [_jsxs("div", { className: css.root, "data-files-state": "tree", "data-files-root": state.root, children: [_jsx(PathHeader, { root: state.root, cwd: cwd, workspaces: locations, recent: state.recent, home: homePath(), t: t, onNavigate: (path) => { setNotice(null); navigate(tab.id, path, signal); }, onReload: reload, onUpload: (files) => { setNotice(null); startUpload(state.root, files); } }), notice !== null && _jsx("p", { className: css.notice, role: "status", "data-files-notice": true, children: notice }), state.uploads.length > 0 && (_jsx("ul", { className: css.uploads, "data-files-uploads": true, children: state.uploads.map(task => (_jsxs("li", { className: css.upload, "data-files-upload-row": task.failure === undefined ? 'sending' : 'failed', children: [_jsx("span", { className: css.uploadName, title: task.path, children: task.name }), _jsx("span", { className: css.uploadState, children: task.failure === undefined ? t('upload.sending') : uploadFailureLine(t, task.failure) }), task.failure !== undefined && (_jsx("button", { type: "button", className: css.tool, "aria-label": t('upload.dismiss'), "data-files-upload-dismiss": true, onClick: () => { actions.uploadFinished(tab.id, task.path, undefined); }, children: t('upload.dismiss') }))] }, task.path))) })), _jsx("div", { ref: bodyRef, className: clsx(css.body, dropDir === state.root && css.dropTarget), "data-files-body": true, ...dropDir === state.root ? { 'data-files-drop-target': '' } : {}, onScroll: (event) => { scrollTopRef.current = event.currentTarget.scrollTop; }, ...dropHandlers(state.root, tree), children: _jsx("ul", { className: css.level, children: _jsx(Level, { path: state.root, tree: tree }) }) })] }), menuAt !== null && (_jsx(EntryMenu, { target: menuAt, selection: menuTargets(state, menuAt), compareBase: state.compareBase, t: t, onSelect: (action) => { runMenuAction(action, menuAt); }, onClose: () => { setMenuAt(null); } })), dialog?.action === 'rename' && (_jsx(RenameDialog, { name: dialog.target.name, t: t, onConfirm: newName => confirmRename(dialog.target, newName), onClose: () => { setDialog(null); } })), dialog?.action === 'delete' && (_jsx(DeleteDialog, { names: dialog.targets.map(target => target.name), t: t, onConfirm: () => confirmDelete(dialog.targets), onClose: () => { setDialog(null); } })), dialog?.action === 'move' && (_jsx(MoveDialog, { names: dialog.targets.map(target => target.name), destination: state.root, t: t, onConfirm: destination => applyMove(dialog.targets.map(target => target.path), destination), onClose: () => { setDialog(null); } })), dialog?.action === 'compare' && (_jsx(CompareDialog, { base: dialog.base, target: dialog.target.path, t: t, readPage: readPageBound, onClose: () => { setDialog(null); } })), dialog?.action === 'timeline' && (_jsx(TimelineDialog, { path: dialog.target.path, t: t, loadHistory: historyBound, onClose: () => { setDialog(null); } }))] }));
}
//# sourceMappingURL=FilesBody.js.map