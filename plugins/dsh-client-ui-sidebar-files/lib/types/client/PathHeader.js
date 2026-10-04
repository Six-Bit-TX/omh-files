import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * The tree's header row: where this tab is rooted, and the places it can jump
 * to.
 *
 * The path is the address, so it is editable in place: clicking it swaps in a
 * text field seeded with the tab's own root, Enter lists the typed address,
 * Escape and blur put the display back. The folder button at the row's start
 * opens the location menu — every Workspace the Client knows, the session's
 * working directory, the Host account's home, and whatever this tab has visited
 * — the upload button beside it puts files from the reader's machine into the
 * directory the tab is rooted at, and the reload button at its end lists the
 * expanded levels again.
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { IconFolderOpenOutline16, IconRefreshOutline16, Menu, } from '@deepseek-ai/dsh-client-ui-primitives';
import { pathPartsOf } from '@deepseek-ai/dsh-util-workspace-path';
import { IconUploadOutline16 } from "./icons.js";
import css from './FilesBody.module.css';
/**
 * Resolve a typed address to the path the tree should list.
 *
 * A `~` (alone, or followed by a separator) stands for the Host account's home;
 * every other address is taken as written, with surrounding whitespace
 * dropped. An unknown home leaves the address untouched, so the listing reports
 * it as a path that cannot be read rather than guessing one.
 * @param address - what the reader typed.
 * @param home - the Host account's home directory, when known.
 * @returns the absolute (or workspace-relative) path to list.
 */
export function expandAddress(address, home) {
    const trimmed = address.trim();
    if (!/^~([/\\]|$)/.test(trimmed))
        return trimmed;
    if (home === undefined)
        return trimmed;
    const rest = trimmed.slice(1).replace(/^[/\\]+/, '');
    return rest === '' ? home : `${home.replace(/[/\\]+$/, '')}/${rest}`;
}
/* jscpd:ignore-start -- the header row is the document preview's (ui-sidebar-documentpreview
   TextPreview `usePathClipped`), copied because a plugin bundle shares runtime code
   only through the platform modules. TODO: once the artifact and slot surfaces
   settle, one copy in ui-primitives could serve every pane header. */
/**
 * Keep the path row's `data-files-path-clipped` current: set while the path's
 * text is wider than its box, so the stylesheet fades the clipped start. Read
 * after each commit that can change the path or mount the header, and whenever
 * either box resizes; written to the DOM directly because it changes only how
 * the stylesheet fades what is already rendered.
 */
function usePathClipped(box, text, path, editing) {
    useLayoutEffect(() => {
        const outer = box.current;
        const inner = text.current;
        if (outer === null || inner === null)
            return undefined;
        const apply = () => {
            if (inner.offsetWidth > outer.clientWidth)
                outer.dataset.filesPathClipped = '';
            else
                delete outer.dataset.filesPathClipped;
        };
        apply();
        const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(apply);
        observer?.observe(outer);
        observer?.observe(inner);
        return () => { observer?.disconnect(); };
        // `editing` is a dependency so leaving the field re-reads the new box: the
        // refs are null while the text field stands in for the path.
    }, [box, text, path, editing]);
}
/* jscpd:ignore-end */
/**
 * Render the header row.
 * @param props - see {@link PathHeaderProps}.
 * @returns the row's path, its location button, and its reload button.
 */
export function PathHeader({ root, cwd, workspaces, recent, home, t, onNavigate, onReload, onUpload, }) {
    const pathRef = useRef(null);
    const pathTextRef = useRef(null);
    const inputRef = useRef(null);
    const locationRef = useRef(null);
    const uploadRef = useRef(null);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [locationsOpen, setLocationsOpen] = useState(false);
    usePathClipped(pathRef, pathTextRef, root, editing);
    // The field opens with the whole address selected, so typing replaces it and
    // Enter accepts it unchanged.
    useLayoutEffect(() => {
        if (editing)
            inputRef.current?.select();
    }, [editing]);
    const cancel = () => { setEditing(false); };
    const commit = () => {
        setEditing(false);
        const next = expandAddress(draft, home);
        // A blank address is a cancel, and the root already in force needs no
        // second listing.
        if (next === '' || next === root)
            return;
        onNavigate(next);
    };
    // One table for the menu and for what its rows do: a row's id is minted here
    // and resolved here, so nothing else has to know the scheme.
    const targets = new Map();
    const items = [];
    const add = (id, path, label, disabled = false) => {
        targets.set(id, path);
        items.push({ id, label, disabled });
    };
    if (workspaces.length > 0) {
        items.push({ type: 'label', id: 'locations.workspaces', text: t('locations.workspaces') });
        for (const workspace of workspaces) {
            add(`workspace:${workspace.id}`, workspace.path, workspace.title);
        }
        items.push({ type: 'separator', id: 'locations.separator' });
    }
    items.push({ type: 'label', id: 'locations.other', text: t('locations.other') });
    add('cwd', cwd, locationLabel(t('locations.cwd'), cwd));
    add('home', home ?? '', locationLabel(t('locations.home'), home ?? ''), home === undefined);
    if (recent.length > 0) {
        items.push({ type: 'label', id: 'locations.recent', text: t('locations.recent') });
        for (const path of recent)
            add(`recent:${path}`, path, path);
    }
    const select = (id) => {
        setLocationsOpen(false);
        const target = targets.get(id);
        /* v8 ignore next -- the menu emits only the ids minted above; an unknown id has no target. */
        if (target !== undefined)
            onNavigate(target);
    };
    const getAnchorRect = useCallback(() => locationRef.current?.getBoundingClientRect() ?? null, []);
    const { directory, name } = pathPartsOf(root);
    return (_jsxs("div", { className: css.header, children: [_jsx(Menu, { open: locationsOpen, autoFocus: true, anchor: (_jsx("button", { ref: locationRef, type: "button", className: css.tool, "aria-label": t('locations'), title: t('locations'), "aria-haspopup": "menu", "aria-expanded": locationsOpen, "data-files-locations": true, onClick: () => { setLocationsOpen(open => !open); }, children: _jsx(IconFolderOpenOutline16, {}) })), items: items, onSelect: select, onClose: () => { setLocationsOpen(false); }, portal: true, getAnchorRect: getAnchorRect }), editing
                ? (_jsx("input", { ref: inputRef, className: css.pathInput, "data-files-path-edit": true, "aria-label": t('path.input'), value: draft, onChange: (event) => { setDraft(event.target.value); }, onKeyDown: (event) => {
                        if (event.key === 'Enter')
                            commit();
                        else if (event.key === 'Escape')
                            cancel();
                    }, onBlur: cancel }))
                : (_jsx("button", { ref: pathRef, type: "button", className: css.path, title: root, "data-files-path": true, onClick: () => { setDraft(root); setEditing(true); }, children: _jsxs("span", { ref: pathTextRef, className: css.pathText, children: [directory !== '' && _jsx("span", { className: css.pathDirectory, children: directory }), _jsx("span", { className: css.pathName, children: name })] }) })), _jsx("input", { ref: uploadRef, type: "file", multiple: true, hidden: true, "data-files-upload-input": true, onChange: (event) => {
                    onUpload(event.target.files);
                    // Clearing the field makes picking the same file again a change, so a
                    // refused upload can be retried without reopening the tree.
                    event.target.value = '';
                } }), _jsx("button", { type: "button", className: css.tool, "aria-label": t('upload'), title: t('upload'), "data-files-upload": true, onClick: () => { uploadRef.current?.click(); }, children: _jsx(IconUploadOutline16, {}) }), _jsx("button", { type: "button", className: css.tool, "aria-label": t('reload'), title: t('reload'), "data-files-reload": true, onClick: onReload, children: _jsx(IconRefreshOutline16, {}) })] }));
}
/** One location row: what the place is, then the directory it names. */
function locationLabel(name, path) {
    return (_jsxs("span", { className: css.locationLabel, children: [_jsx("span", { className: css.locationName, children: name }), _jsx("span", { className: css.locationPath, children: path })] }));
}
//# sourceMappingURL=PathHeader.js.map