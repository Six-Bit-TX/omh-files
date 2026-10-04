import { defineStore } from '@deepseek-ai/dsh-client-store';
import { lineEndingsOf, linesIn } from "./text/draft.js";
/**
 * A tab's state before it reads, scrolls, toggles, or answers anything.
 * @returns the empty bucket.
 */
export function fresh() {
    return {
        version: undefined,
        observedVersion: undefined,
        pages: {},
        eof: false,
        loading: false,
        failure: undefined,
        scrollTop: 0,
        wrap: true,
        revision: undefined,
        saving: false,
        saveFailure: undefined,
    };
}
/** The bucket for one tab, created on first write. */
function bucket(state, tabId) {
    return state.byTab[tabId] ??= fresh();
}
/** Drop the open draft, so a tab is reading again rather than editing. */
function closeEditor(state) {
    delete state.draft;
    delete state.draftVersion;
    delete state.recovered;
    state.saving = false;
    delete state.savingDraftText;
    state.saveFailure = undefined;
}
/**
 * Declare the preview's store.
 *
 * Constructed once in apply and shared by the body and the tools registrations,
 * which the slot runtime allows because both are session-scoped.
 * @returns the store handle to declare on both registrations.
 */
export function createTextStore() {
    return defineStore({
        init: () => ({ byTab: {} }),
        actions: {
            /** @param d - state. @param state - validated browser recovery with no file-content cache. */
            restore: (d, state) => { d.byTab = state.byTab; },
            /** @param d - state. @param tabId - owner. @param file - address resolved by the tab. */
            attached: (d, tabId, file) => {
                const current = d.byTab[tabId];
                if (current?.file !== undefined && (current.file.sessionId !== file.sessionId || current.file.path !== file.path)) {
                    d.byTab[tabId] = fresh();
                }
                bucket(d, tabId).file = file;
            },
            /** @param d - draft. @param tabId - owning tab. @param rendererId - manual choice, or automatic selection. */
            selected: (d, tabId, rendererId) => {
                if (rendererId === undefined)
                    delete bucket(d, tabId).rendererId;
                else
                    bucket(d, tabId).rendererId = rendererId;
            },
            /**
             * Mark a page read as in flight.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param mode - selected renderer's loading mode.
             * @param observedVersion - metadata version at read start; later pages retain the initial observation.
             */
            loading: (d, tabId, mode, observedVersion) => {
                const state = bucket(d, tabId);
                if (state.version === undefined && !state.loading)
                    state.observedVersion = observedVersion;
                state.loading = true;
                state.failure = undefined;
                if (mode !== undefined)
                    state.mode = mode;
            },
            /** @param d - draft. @param tabId - owning tab. @param file - complete byte result for this view. */
            complete: (d, tabId, file) => {
                const state = bucket(d, tabId);
                state.complete = file;
                state.version = file.version;
                state.eof = true;
                state.loading = false;
                state.failure = undefined;
            },
            /**
             * Keep one page. A page from a newer file version invalidates the pages
             * of the older one, so the body never shows two versions at once.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param page - the page the Host returned.
             */
            page: (d, tabId, page) => {
                const state = bucket(d, tabId);
                if (state.version !== undefined && state.version !== page.version)
                    state.pages = {};
                state.version = page.version;
                state.pages[page.offset] = { text: page.text, lines: page.lines };
                state.eof = page.eof;
                state.loading = false;
                state.failure = undefined;
            },
            /**
             * Record why a page read failed; the pages already held stay.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param failure - the settled Remote failure.
             */
            failed: (d, tabId, failure) => {
                const state = bucket(d, tabId);
                state.loading = false;
                state.failure = failure;
            },
            /**
             * Drop every page, keeping the view, for a re-read from the first line.
             * Drafts retain their original version guard while current disk content reloads.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             */
            reset: (d, tabId) => {
                const state = bucket(d, tabId);
                state.pages = {};
                delete state.complete;
                state.eof = false;
                state.version = undefined;
                state.observedVersion = undefined;
                state.loading = false;
                state.failure = undefined;
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
             * Switch one tab between wrapped and unwrapped lines.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             */
            toggledWrap: (d, tabId) => {
                const state = bucket(d, tabId);
                state.wrap = !state.wrap;
            },
            /**
             * Record that the body answered one navigation, so a remount restores the
             * reader's position instead of jumping again.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param revision - the `navigation.revision` answered.
             */
            navigated: (d, tabId, revision) => {
                bucket(d, tabId).revision = revision;
            },
            /**
             * Open the editor over the text the reader holds.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param text - the loaded text with its CRLF pairs normalized.
             * @param endings - the style the file was read with, restored on save.
             */
            beginEdit: (d, tabId, text, endings) => {
                const state = bucket(d, tabId);
                state.draft = { text, base: text, endings };
                if (state.version !== undefined)
                    state.draftVersion = state.version;
                state.saving = false;
                state.saveFailure = undefined;
            },
            /**
             * Record what the reader has typed so far. Typing only ever arrives while
             * a draft is open, so a stray call for a tab that is merely reading
             * writes nothing rather than minting a draft with no baseline.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param text - the editor's current text.
             */
            drafted: (d, tabId, text) => {
                const state = bucket(d, tabId);
                const draft = state.draft;
                if (draft === undefined)
                    return;
                state.draft = { ...draft, text };
            },
            /**
             * Abandon the draft and go back to reading the pages already held.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             */
            cancelEdit: (d, tabId) => {
                closeEditor(bucket(d, tabId));
            },
            /** @param d - state. @param tabId - owner. @param base - reviewed current disk text. @param endings - current disk line endings. */
            resolveConflict: (d, tabId, base, endings) => {
                const state = bucket(d, tabId);
                if (state.draft === undefined || state.version === undefined || !state.eof)
                    return;
                state.draft = { ...state.draft, base, endings };
                state.draftVersion = state.version;
                state.saveFailure = undefined;
            },
            /**
             * Mark a save as in flight, clearing the previous save's failure.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             */
            saving: (d, tabId) => {
                const state = bucket(d, tabId);
                state.saving = true;
                if (state.draft !== undefined)
                    state.savingDraftText = state.draft.text;
                state.saveFailure = undefined;
            },
            /**
             * Close the editor on the text the Host stored: the tab holds exactly the
             * file the save produced, as one page over the whole of it, so a later
             * paging request continues from the written version rather than the read one.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param version - the file version the write returned.
             * @param text - the text the Host stored, terminators as written.
             */
            saved: (d, tabId, version, text) => {
                const state = bucket(d, tabId);
                const current = state.draft;
                if (current !== undefined && state.savingDraftText !== undefined && current.text !== state.savingDraftText) {
                    state.draft = { ...current, base: text.replaceAll('\r\n', '\n'), endings: lineEndingsOf(text) };
                    state.draftVersion = version;
                    state.saving = false;
                    delete state.savingDraftText;
                    state.saveFailure = undefined;
                }
                else
                    closeEditor(state);
                state.version = version;
                state.pages = { 1: { text, lines: linesIn(text) } };
                state.eof = true;
                state.loading = false;
                state.failure = undefined;
            },
            /**
             * Keep the draft and record why the save was refused.
             * @param d - draft state.
             * @param tabId - the tab being drawn.
             * @param failure - the settled Remote failure.
             */
            saveFailed: (d, tabId, failure) => {
                const state = bucket(d, tabId);
                state.saving = false;
                delete state.savingDraftText;
                state.saveFailure = failure;
            },
            /**
             * Drop one tab's state, for a tab record that is gone.
             * @param d - draft state.
             * @param tabId - the tab that went away.
             */
            forget: (d, tabId) => {
                const byTab = {};
                // Keys were written from tab ids; reading them back as ids is exact.
                for (const [id, state] of Object.entries(d.byTab)) {
                    if (id !== tabId)
                        byTab[id] = state;
                }
                d.byTab = byTab;
            },
        },
    });
}
//# sourceMappingURL=store.js.map