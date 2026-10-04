import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/**
 * The text preview's body: a file's content, the editor over it, or the reason
 * it is not showing.
 *
 * Two sources meet here. The standard `useResource` hook gives the file's
 * metadata — its version — and this type's
 * own store holds the content it read through its face. A Host-reported change is
 * announced, not applied: reloading under a reader would lose their place, so
 * the bar waits for a click. A failed metadata frame — the file gone, its
 * workspace unknown — takes the same bar's place over the pages already loaded,
 * with the same reload. The type's controls, viewer choice, wrap and reload, sit at the end of
 * the path row; the Sidebar's strip carries none of them.
 *
 * Editing is the same body with a text field in place of the renderer, so it
 * belongs to the owner that holds the whole file rather than to any one
 * renderer: the field replaces whichever of them is selected. It opens only on
 * a file this tab has read to its last line, because a draft is written back
 * whole. The save carries the version the pages were read at, so a file that
 * moved on underneath the reader is refused instead of overwritten, and the
 * draft is kept for the reader to recover from.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import { FileTypeIcon, IconEditOutline16, IconRefreshOutline16, Menu, Tooltip, classifyFileType, } from '@deepseek-ai/dsh-client-ui-primitives';
import { pathPartsOf } from '@deepseek-ai/dsh-util-workspace-path';
import { failureLine, saveFailureLine } from "./failure-line.js";
import { IconNowrapFill16, IconWrapFill16 } from "./icons.js";
import { LoadingIndicator } from "./LoadingIndicator.js";
import { hostFileOf } from "./rpc.js";
import { binaryDocumentPath, matchingDocumentPreviews } from "./document/registry.js";
import { unviewableBinaryPath } from "./document/unviewable.js";
import { PLAIN_BODY_ID } from "./text/index.js";
import { draftOf, restoreLineEndings } from "./text/draft.js";
import { loadedPages, lastLineLoaded, scrollToLine, textOf } from "./text/lines.js";
import css from './TextPreview.module.css';
export { linesOf, loadedPages, lastLineLoaded, scrollToLine, textOf } from "./text/lines.js";
/** Keep the path fade in sync with whether its full text fits the header row. */
function usePathClipped(box, text, path, shown) {
    useLayoutEffect(() => {
        const outer = box.current;
        const inner = text.current;
        if (outer === null || inner === null)
            return undefined;
        const apply = () => {
            if (inner.offsetWidth > outer.clientWidth)
                outer.dataset.textpreviewPathClipped = '';
            else
                delete outer.dataset.textpreviewPathClipped;
        };
        apply();
        const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(apply);
        observer?.observe(outer);
        observer?.observe(inner);
        return () => { observer?.disconnect(); };
    }, [box, text, path, shown]);
}
/** The header's path: directories greyed, the final segment in full ink, faded when clipped. */
function HeaderPath({ pathRef, pathTextRef, path }) {
    const { directory, name } = pathPartsOf(path);
    return (_jsx("div", { ref: pathRef, className: css.path, title: path, "data-textpreview-path": true, children: _jsxs("span", { ref: pathTextRef, className: css.pathText, children: [directory !== '' && _jsx("span", { className: css.pathDirectory, children: directory }), _jsx("span", { className: css.pathName, children: name })] }) }));
}
/**
 * The text type's body, registered under `sidebar.right.pane.tab` as `text`.
 * @param props - composed slot props.
 * @returns the content read so far with its controls, or a progress line.
 */
export function TextPreview({ useTabInfo, useResource, useStore, actions, loadPage, reloadPages, loadAll, reloadAll, save: saveFile, useDocumentPreviews, renderSlot, t, }) {
    const { tab } = useTabInfo();
    const { navigation, signal } = tab;
    const meta = useResource(tab.contentId);
    const canRead = meta.status !== 'none';
    const file = useMemo(() => hostFileOf(tab.contentId), [tab.contentId]);
    const state = useStore((s) => {
        const held = s.byTab[tab.id];
        return held?.file !== undefined && (held.file.sessionId !== file.sessionId || held.file.path !== file.path) ? undefined : held;
    });
    const definitions = useDocumentPreviews(value => value);
    const unviewable = useMemo(() => unviewableBinaryPath(file.path), [file.path]);
    const candidates = useMemo(() => {
        const matched = matchingDocumentPreviews(definitions, file.path);
        if (matched.length > 0 && binaryDocumentPath(definitions, file.path))
            return matched;
        if (matched.length === 0 && unviewable)
            return matched;
        const fallback = definitions.find(definition => definition.id === PLAIN_BODY_ID);
        return fallback === undefined ? matched : [...matched, fallback];
    }, [definitions, file.path, unviewable]);
    const selected = candidates.find(candidate => candidate.id === state?.rendererId) ?? candidates[0];
    const mode = selected?.loading;
    const current = (state?.mode ?? 'text-pages') === mode ? state : undefined;
    const bodyRef = useRef(null);
    const scrollportRef = useRef(null);
    const storedScrollTopRef = useRef(0);
    const pathRef = useRef(null);
    const pathTextRef = useRef(null);
    const [menuOpen, setMenuOpen] = useState(false);
    const displayPath = meta.value?.absolutePath ?? current?.complete?.absolutePath ?? file.path;
    usePathClipped(pathRef, pathTextRef, displayPath, state !== undefined);
    // Every tab of this type is a `file` resource address, so its params are the
    // `file` type's; the union is narrowed on the one field read, not validated.
    const line = navigation.params !== undefined && 'line' in navigation.params ? navigation.params.line : undefined;
    const pages = current?.pages;
    const loaded = useMemo(() => loadedPages(pages ?? {}), [pages]);
    const loadedThrough = lastLineLoaded(loaded);
    const hasContent = loaded.length > 0 || current?.complete !== undefined;
    storedScrollTopRef.current = state?.scrollTop ?? 0;
    const bindBody = useCallback((body) => {
        const previous = bodyRef.current;
        bodyRef.current = body;
        if (scrollportRef.current === null || scrollportRef.current === previous)
            scrollportRef.current = body;
    }, []);
    const bindScrollport = useCallback((scrollport) => {
        const next = scrollport ?? bodyRef.current;
        scrollportRef.current = next;
        if (next !== null)
            next.scrollTop = storedScrollTopRef.current;
    }, []);
    // First mount reads the first page; a body coming back to a tab with content
    // reads nothing, because the store outlives the body.
    const started = current !== undefined && (current.loading || current.version !== undefined || current.failure !== undefined);
    useEffect(() => {
        if (started || !canRead || mode === undefined)
            return;
        if (mode === 'text-pages')
            loadPage(tab.id, file, 1, signal, meta.value?.version);
        else
            loadAll(tab.id, file, signal, meta.value?.version);
    }, [started, tab.id, file, signal, loadPage, loadAll, canRead, mode, meta.value?.version]);
    // Come back where the reader was once there is content to scroll: on a remount,
    // after a reload rebuilt the content, or after the selected renderer changed.
    // Scroll writes preserve both identities, so they never re-land.
    useEffect(() => {
        const body = scrollportRef.current;
        if (hasContent && body !== null && state !== undefined)
            body.scrollTop = state.scrollTop;
    }, [hasContent, selected?.id]);
    // Answer a navigation once: a line the pages do not reach yet loads the next
    // page (again, until the pages cover it or the file ends); a line they hold
    // is scrolled to and marked. The store remembers the answer, so a remount
    // restores the reader's place instead.
    useEffect(() => {
        const body = scrollportRef.current;
        if (current === undefined || body === null || current.revision === navigation.revision)
            return;
        if (line === undefined || mode !== 'text-pages') {
            actions.navigated(tab.id, navigation.revision);
            return;
        }
        if (line > loadedThrough && !current.eof) {
            if (!current.loading && current.failure === undefined && canRead) {
                loadPage(tab.id, file, loadedThrough + 1, signal, meta.value?.version);
            }
            return;
        }
        const landed = scrollToLine(body, line);
        if (!landed && line <= loadedThrough)
            return;
        actions.navigated(tab.id, navigation.revision);
        // Recorded here as well as by the scroll event, so the store holds the
        // landing before any later navigation reads it.
        actions.scrolled(tab.id, body.scrollTop);
    }, [
        navigation.revision, line, loadedThrough, current?.eof, current?.loading, current?.failure, started,
        selected?.id, mode, file, canRead, meta.value?.version,
    ]);
    const content = useMemo(() => {
        if (mode === 'bytes-complete') {
            return current?.complete === undefined ? undefined : { kind: 'bytes', data: current.complete.data };
        }
        if (current === undefined || loaded.length === 0)
            return undefined;
        return { kind: 'text', pages: loaded, text: textOf(loaded), eof: current.eof };
    }, [mode, loaded, current?.complete, current?.eof]);
    // A known binary suffix with no matching renderer never reads: no plain-text
    // fallback, no viewer control, only the path and the unsupported line.
    if (selected === undefined && unviewable) {
        const { name: unsupportedName } = pathPartsOf(displayPath);
        return (_jsxs("div", { className: css.preview, "data-textpreview-state": "unsupported", "data-textpreview-url": tab.contentId, children: [_jsx("div", { className: css.header, children: _jsx(HeaderPath, { pathRef: pathRef, pathTextRef: pathTextRef, path: displayPath }) }), _jsx("div", { className: css.body, "data-textpreview-body": true, children: _jsxs("div", { className: css.empty, "data-textpreview-unsupported": true, children: [_jsx(FileTypeIcon, { kind: classifyFileType(unsupportedName), size: 36, className: css.emptyIcon }), _jsx("p", { className: css.emptyLine, children: t('unsupportedFile') })] }) })] }));
    }
    if (state === undefined || selected === undefined) {
        return (_jsx("div", { className: css.status, "data-textpreview-state": "loading", children: meta.status === 'none'
                ? _jsx("p", { className: css.statusLine, children: t('resourceUnavailable') })
                : _jsx(LoadingIndicator, { className: css.statusLine, label: t('loading') }) }));
    }
    const next = loadedThrough + 1;
    const { name } = pathPartsOf(displayPath);
    const observedVersion = meta.value?.version;
    const changed = current?.version !== undefined && observedVersion !== undefined
        && observedVersion !== current.version && observedVersion !== current.observedVersion;
    const loadNext = () => {
        if (!canRead || current?.loading || current?.eof)
            return;
        loadPage(tab.id, file, next, signal, meta.value?.version);
    };
    const reload = () => {
        if (!canRead)
            return;
        if (mode === 'text-pages')
            reloadPages(tab.id, file, signal, meta.value?.version);
        else
            reloadAll(tab.id, file, signal, meta.value?.version);
    };
    // A draft is written back whole, so the editor opens only over a file this
    // tab has read to its last line; a paging request would otherwise save a
    // prefix over the file it came from. `current` is undefined until the
    // selected renderer has read under its own mode — the first read, and every
    // renderer switch — so there is nothing to edit before then.
    const draft = state.draft;
    const dirty = draft !== undefined && draft.text !== draft.base;
    const conflict = draft !== undefined && state.draftVersion !== undefined && current?.version !== undefined
        && state.draftVersion !== current.version;
    const canEdit = current !== undefined && mode === 'text-pages' && current.eof
        && current.failure === undefined && !current.loading && canRead;
    const beginEdit = () => {
        const opened = draftOf(loaded);
        actions.beginEdit(tab.id, opened.text, opened.endings);
    };
    const saveDraft = () => {
        if (draft === undefined || state.version === undefined || !canRead || !dirty || state.saving || conflict)
            return;
        saveFile(tab.id, file, restoreLineEndings(draft.text, draft.endings), state.draftVersion ?? state.version, signal);
    };
    const cancelEdit = () => {
        if (dirty && !window.confirm(t('edit.confirmDiscard')))
            return;
        actions.cancelEdit(tab.id);
    };
    const discardAndReload = () => {
        if (dirty && !window.confirm(t('edit.confirmDiscard')))
            return;
        actions.cancelEdit(tab.id);
        reload();
    };
    const reloadLabel = draft === undefined ? t('reloadNow') : t('edit.compare');
    return (_jsxs("div", { className: css.preview, "data-textpreview-state": "text", "data-textpreview-url": tab.contentId, "data-document-preview": selected.id, children: [state.recovered === true && _jsx("p", { className: css.changed, "data-textpreview-recovered": true, children: t('edit.recovered') }), conflict && (_jsxs("details", { className: clsx(css.changed, css.conflict), open: true, "data-textpreview-conflict": true, children: [_jsx("summary", { children: t('edit.disk') }), _jsx("pre", { children: textOf(loaded) }), _jsx("button", { type: "button", className: css.action, disabled: !current.eof || current.loading, onClick: () => {
                            const baseline = draftOf(loaded);
                            actions.resolveConflict(tab.id, baseline.text, baseline.endings);
                        }, children: t('edit.resolved') })] })), meta.failure !== undefined && hasContent
                ? (_jsxs("p", { className: css.changed, "data-textpreview-meta-failed": meta.failure.code, children: [_jsx("span", { children: failureLine(t, meta.failure) }), _jsx("button", { type: "button", className: css.action, "data-textpreview-reload-now": true, onClick: reload, children: reloadLabel })] }))
                : changed && (_jsxs("p", { className: css.changed, "data-textpreview-changed": true, children: [_jsx("span", { children: t('changed') }), _jsx("button", { type: "button", className: css.action, "data-textpreview-reload-now": true, onClick: reload, children: reloadLabel })] })), _jsxs("div", { className: css.header, children: [_jsx(HeaderPath, { pathRef: pathRef, pathTextRef: pathTextRef, path: displayPath }), draft !== undefined
                        ? (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: css.action, "data-textpreview-tool": "cancel", onClick: cancelEdit, children: t('edit.cancel') }), _jsx("button", { type: "button", className: clsx(css.action, css.save), "data-textpreview-tool": "save", disabled: !dirty || state.saving || conflict || state.version === undefined, onClick: saveDraft, children: state.saving ? t('edit.saving') : t('edit.save') })] }))
                        : (_jsxs(_Fragment, { children: [candidates.length > 1
                                    && (_jsx(Menu, { open: menuOpen, anchor: (_jsx("button", { type: "button", className: clsx(css.tool, css.viewerTool), "aria-label": t('openWith'), title: selected.title(), "data-document-viewer-menu": true, onClick: () => { setMenuOpen(value => !value); }, children: selected.title() })), items: candidates.map(candidate => ({ id: candidate.id, label: candidate.title() })), selectedId: selected.id, onSelect: (id) => { actions.selected(tab.id, id); setMenuOpen(false); }, onClose: () => { setMenuOpen(false); }, align: "end", portal: true, dense: true })), selected.wrap === true && (_jsx(Tooltip, { label: t(state.wrap ? 'wrap.disable' : 'wrap.enable'), side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.tool, "aria-pressed": state.wrap, "aria-label": t('wrap.aria'), "data-textpreview-tool": "wrap", onClick: () => { actions.toggledWrap(tab.id); }, children: state.wrap ? _jsx(IconNowrapFill16, {}) : _jsx(IconWrapFill16, {}) }) })), canEdit && (_jsx(Tooltip, { label: t('edit'), side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.tool, "aria-label": t('edit'), "data-textpreview-tool": "edit", onClick: beginEdit, children: _jsx(IconEditOutline16, {}) }) })), _jsx(Tooltip, { label: t('reload'), side: "bottom", delayMs: 500, children: _jsx("button", { type: "button", className: css.tool, "aria-label": t('reload'), "data-textpreview-tool": "reload", onClick: reload, children: _jsx(IconRefreshOutline16, {}) }) })] }))] }), state.saveFailure !== undefined && (_jsxs("p", { className: css.changed, "data-textpreview-save-failed": state.saveFailure.code, children: [_jsx("span", { children: saveFailureLine(t, state.saveFailure) }), state.saveFailure.code === 'workspace-file/stale' && (_jsx("button", { type: "button", className: css.action, onClick: reload, "data-textpreview-compare": true, children: t('edit.compare') })), state.saveFailure.code === 'workspace-file/stale' && (_jsx("button", { type: "button", className: css.action, "data-textpreview-discard-draft": true, onClick: discardAndReload, children: t('edit.discard') }))] })), _jsxs("div", { ref: bindBody, className: clsx(css.body, state.wrap && css.wrap), "data-textpreview-body": true, "data-textpreview-wrap": state.wrap ? '' : undefined, onScrollCapture: (event) => {
                    const body = scrollportRef.current;
                    /* v8 ignore next -- callback refs bind the scrollport during commit, before user input. */
                    if (body === null)
                        return;
                    if (event.target !== body)
                        return;
                    actions.scrolled(tab.id, body.scrollTop);
                    if (mode === 'text-pages' && current?.failure === undefined && body.clientHeight > 0
                        && body.scrollTop + body.clientHeight >= body.scrollHeight - 1)
                        loadNext();
                }, children: [!hasContent && current?.failure === undefined && (_jsx(LoadingIndicator, { className: clsx(css.statusLine, css.bodyLoading), label: t('loading') })), draft !== undefined
                        ? (_jsx("textarea", { className: css.editor, "data-textpreview-editor": true, "aria-label": t('edit.aria'), spellCheck: false, value: draft.text, onChange: (event) => { actions.drafted(tab.id, event.target.value); }, onKeyDown: (event) => {
                                if (event.key !== 's' || !(event.metaKey || event.ctrlKey))
                                    return;
                                event.preventDefault();
                                saveDraft();
                            } }))
                        : content !== undefined && renderSlot('sidebar.right.tab.document', {
                            resourceAddress: tab.contentId, content, wrap: state.wrap, scrollportRef: bindScrollport,
                        }, {
                            entryKey: selected.id, hookContext: useTabInfo,
                            fallback: _jsx("p", { className: css.statusLine, children: t('rendererUnavailable', { name: selected.title() }) }),
                        }), current?.failure !== undefined && (hasContent
                        ? (_jsxs("p", { className: css.statusLine, "data-textpreview-failed": current.failure.code, children: [_jsx("span", { children: failureLine(t, current.failure) }), _jsx("button", { type: "button", className: css.action, "data-textpreview-retry": true, onClick: loadNext, children: t('retry') })] }))
                        : (_jsxs("div", { className: css.empty, "data-textpreview-failed": current.failure.code, children: [_jsx(FileTypeIcon, { kind: classifyFileType(name), size: 36, className: css.emptyIcon }), _jsx("p", { className: css.emptyLine, children: failureLine(t, current.failure) }), _jsxs("button", { type: "button", className: css.retry, "data-textpreview-retry": true, onClick: reload, children: [_jsx(IconRefreshOutline16, { size: 14 }), t('retry')] })] }))), mode === 'text-pages' && current !== undefined && loaded.length > 0 && !current.eof && current.failure === undefined && (_jsx("button", { type: "button", className: css.more, disabled: current.loading, "data-textpreview-more": true, onClick: loadNext, children: current.loading ? _jsx(LoadingIndicator, { label: t('loading') }) : t('loadMore') }))] })] }));
}
//# sourceMappingURL=TextPreview.js.map