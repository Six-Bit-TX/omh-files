import { TextPreview } from "./TextPreview.js";
import { TextTitle } from "./TextTitle.js";
import { TEXTPREVIEW_ID, TEXTPREVIEW_KIND, textDefinition } from "./definition.js";
import { textFace } from "./face.js";
import { createReadPage, createSaveFile } from "./rpc.js";
import { createTextStore } from "./store.js";
import { hasDirtyDrafts, persistTextState, readTextState } from "./persistence.js";
import { en, zh } from "./locales.js";
import { DocumentPreviewRegistry } from "./document/registry.js";
import { documentTabInfoFactory } from "./document/contract.js";
import { apply as registerText } from "./text/index.js";
import { apply as registerMarkdown } from "./markdown/index.js";
import { apply as registerHtml } from "./html/index.js";
import { apply as registerImage } from "./image/index.js";
import { apply as registerPdf } from "./pdf/index.js";
import { apply as registerCode } from "./code/index.js";
/** This package's copy namespace. */
const NS = 'sidebarDocumentPreview';
/**
 * Required browser services: the tab registry, the slot registry, copy, and the
 * Remote carrier with its `workspaceFiles` namespace.
 */
export const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles'];
/**
 * Client plugin body: register the type, its dictionaries, its body, and its chip title.
 * @param ctx - client root context carrying the registry, the slots, copy, and the Remote face.
 */
export function apply(ctx) {
    const previews = new DocumentPreviewRegistry();
    const disposePreviews = ctx.reflect.provide('documentPreviews', previews);
    ctx.effect(() => disposePreviews);
    ctx.effect(() => ctx.sidebarRightTabs.register(textDefinition()), 'ui-sidebar-documentpreview: text type');
    ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sidebar-documentpreview: dictionaries');
    const handle = createTextStore();
    const instances = new Map();
    const subscriptions = [];
    const store = {
        ...handle,
        create(scopeKey) {
            const instance = handle.create(scopeKey);
            if (scopeKey !== undefined) {
                instance.actions.restore(readTextState(scopeKey));
                instances.set(scopeKey, instance);
                subscriptions.push(persistTextState(scopeKey, instance));
            }
            return instance;
        },
    };
    ctx.effect(() => {
        const t = ctx.locale.bind(NS);
        const release = ctx.sidebarRight.registerCloseHandler(TEXTPREVIEW_KIND, (sessionId, tab) => {
            const instance = instances.get(sessionId);
            const state = instance?.getSnapshot().byTab[tab.id];
            if (state?.saving === true)
                return false;
            if (state?.draft !== undefined && state.draft.text !== state.draft.base
                && !window.confirm(t('edit.confirmDiscard')))
                return false;
            instance?.actions.cancelEdit(tab.id);
            return true;
        });
        const beforeUnload = (event) => {
            if (![...instances.values()].some(instance => hasDirtyDrafts(instance.getSnapshot())))
                return;
            event.preventDefault();
            // Older browsers also require returnValue to show their native unload warning.
            // oxlint-disable-next-line typescript/no-deprecated
            event.returnValue = '';
        };
        if (typeof window !== 'undefined')
            window.addEventListener('beforeunload', beforeUnload);
        return () => {
            release();
            if (typeof window !== 'undefined')
                window.removeEventListener('beforeunload', beforeUnload);
            for (const unsubscribe of subscriptions)
                unsubscribe();
            instances.clear();
        };
    }, 'ui-sidebar-documentpreview: draft recovery and close protection');
    const face = textFace(createReadPage(ctx.remote), (file, signal) => ctx.remote.workspaceFiles.readAll(file.sessionId, file.path, signal), createSaveFile(ctx.remote));
    const source = { getSnapshot: previews.getSnapshot, subscribe: previews.subscribe };
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
        name: 'sidebar.right.pane.tab', key: TEXTPREVIEW_ID, locale: NS, store,
        children: {
            'sidebar.right.tab.document': { kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: documentTabInfoFactory } } },
        },
        inject: (sessionId, actions) => ({ ...face(sessionId, actions), hooks: { documentPreviews: source } }),
    }, TextPreview)), 'ui-sidebar-documentpreview: text body');
    ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register({ name: 'sidebar.right.pane.tab.title', key: TEXTPREVIEW_ID }, TextTitle)), 'ui-sidebar-documentpreview: text title');
    registerText(ctx);
    registerMarkdown(ctx);
    registerHtml(ctx);
    registerImage(ctx);
    registerPdf(ctx);
    registerCode(ctx);
}
//# sourceMappingURL=index.js.map