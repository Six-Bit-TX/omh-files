/**
 * Browser half: register `text` as a right-Sidebar tab type.
 *
 * The type reaches the Sidebar through its public path only: the definition into
 * `ctx.sidebarRightTabs`, the body into the keyed `sidebar.right.pane.tab`
 * seat, and the chip title into `sidebar.right.pane.tab.title`, both under the
 * definition's `id`. Nothing here reaches into the Sidebar's store, its
 * panes, or its sequence. The file's metadata comes from the standard
 * `useResource`, served by the `file` provider; the content is this type's own
 * business, read through its face. Every import from another
 * client plugin is a type.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type {} from '@deepseek-ai/dsh-api-workspace-files/remote'
import type { WorkspaceFileParams } from '@deepseek-ai/dsh-api-workspace-files/client'
import { TextPreview } from './TextPreview.tsx'
import type { TextPreviewInjected } from './TextPreview.tsx'
import { TextTitle } from './TextTitle.tsx'
import { TEXTPREVIEW_ID, TEXTPREVIEW_KIND, textDefinition } from './definition.ts'
import { textFace } from './face.ts'
import { createReadPage, createSaveFile } from './rpc.ts'
import { createTextStore } from './store.ts'
import { hasDirtyDrafts, persistTextState, readTextState } from './persistence.ts'
import { en, zh } from './locales.ts'
import { DocumentPreviewRegistry } from './document/registry.ts'
import { documentTabInfoFactory } from './document/contract.ts'
import { apply as registerText } from './text/index.ts'
import { apply as registerMarkdown } from './markdown/index.ts'
import { apply as registerHtml } from './html/index.ts'
import { apply as registerImage } from './image/index.ts'
import { apply as registerPdf } from './pdf/index.ts'
import { apply as registerCode } from './code/index.ts'

// Values stay package-private unless another package needs them; the plugin
// surface is `apply`, `inject`, and the store factory another registration may
// share, plus the types a consumer of the seat or the store names.
export type { SidebarDocumentPreviewKey } from './locales.ts'
export type { TextPreviewProps } from './TextPreview.tsx'
export type { TextInjected } from './face.ts'
export type { ReadWorkspaceFilePage, SaveWorkspaceFile, SessionFile, WorkspaceFilesRemote } from './rpc.ts'
export type { TextPage, TextState, TextStore, TextTabState } from './store.ts'
export type { DocumentContent, DocumentPreviewProps, DocumentTextPage } from './document/contract.ts'
export type { DocumentLoadMode, DocumentPreviewDefinition } from './document/registry.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** File-extension renderer registrations, independent from their keyed document bodies. */
    documentPreviews: DocumentPreviewRegistry
  }
}

/** This package's copy namespace. */
const NS = 'sidebarDocumentPreview'

declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightResourceParamsMap {
    /** File line navigation supported by the text preview. */
    file: WorkspaceFileParams
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Text-preview progress, paging, change, control, and failure lines. */
    sidebarDocumentPreview: import('./locales.ts').SidebarDocumentPreviewKey
  }
}

/**
 * Required browser services: the tab registry, the slot registry, copy, and the
 * Remote carrier with its `workspaceFiles` namespace.
 */
export const inject = ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs', 'remote', 'remote.workspaceFiles']

/**
 * Client plugin body: register the type, its dictionaries, its body, and its chip title.
 * @param ctx - client root context carrying the registry, the slots, copy, and the Remote face.
 */
export function apply(ctx: ClientContext): void {
  const previews = new DocumentPreviewRegistry()
  const disposePreviews = ctx.reflect.provide('documentPreviews', previews)
  ctx.effect(() => disposePreviews)
  ctx.effect(() => ctx.sidebarRightTabs.register(textDefinition()), 'ui-sidebar-documentpreview: text type')
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-sidebar-documentpreview: dictionaries')

  const handle = createTextStore()
  const instances = new Map<string, ReturnType<typeof handle.create>>()
  const subscriptions: Array<() => void> = []
  const store: typeof handle = {
    ...handle,
    create(scopeKey) {
      const instance = handle.create(scopeKey)
      if (scopeKey !== undefined) {
        instance.actions.restore(readTextState(scopeKey))
        instances.set(scopeKey, instance)
        subscriptions.push(persistTextState(scopeKey, instance))
      }
      return instance
    },
  }
  ctx.effect(() => {
    const t = ctx.locale.bind(NS)
    const release = ctx.sidebarRight.registerCloseHandler(TEXTPREVIEW_KIND, (sessionId, tab) => {
      const instance = instances.get(sessionId)
      const state = instance?.getSnapshot().byTab[tab.id]
      if (state?.saving === true) return false
      if (state?.draft !== undefined && state.draft.text !== state.draft.base
        && !window.confirm(t('edit.confirmDiscard'))) return false
      instance?.actions.cancelEdit(tab.id)
      return true
    })
    const beforeUnload = (event: BeforeUnloadEvent): void => {
      if (![...instances.values()].some(instance => hasDirtyDrafts(instance.getSnapshot()))) return
      event.preventDefault()
      // Older browsers also require returnValue to show their native unload warning.
      // oxlint-disable-next-line typescript/no-deprecated
      event.returnValue = ''
    }
    if (typeof window !== 'undefined') window.addEventListener('beforeunload', beforeUnload)
    return () => {
      release()
      if (typeof window !== 'undefined') window.removeEventListener('beforeunload', beforeUnload)
      for (const unsubscribe of subscriptions) unsubscribe()
      instances.clear()
    }
  }, 'ui-sidebar-documentpreview: draft recovery and close protection')
  const face = textFace(
    createReadPage(ctx.remote),
    (file, signal) => ctx.remote.workspaceFiles.readAll(file.sessionId, file.path, signal),
    createSaveFile(ctx.remote),
  )
  const source = { getSnapshot: previews.getSnapshot, subscribe: previews.subscribe }
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    {
      name: 'sidebar.right.pane.tab', key: TEXTPREVIEW_ID, locale: NS, store,
      children: {
        'sidebar.right.tab.document': { kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: documentTabInfoFactory } } },
      },
      inject: (sessionId, actions): TextPreviewInjected => ({ ...face(sessionId, actions), hooks: { documentPreviews: source } }),
    },
    TextPreview,
  )), 'ui-sidebar-documentpreview: text body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab.title', key: TEXTPREVIEW_ID },
    TextTitle,
  )), 'ui-sidebar-documentpreview: text title')
  registerText(ctx)
  registerMarkdown(ctx)
  registerHtml(ctx)
  registerImage(ctx)
  registerPdf(ctx)
  registerCode(ctx)
}
