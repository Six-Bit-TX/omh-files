/** Browser-local draft and reading-position recovery; file contents are always read afresh. */
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { fresh, type TextState, type TextStore, type TextTabState } from './store.ts'

const PREFIX = 'dsh.document.drafts.v1.'

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Restore only validated viewing fields and unsaved text with its original write guard.
 * @param sessionId - Session owning the tabs.
 * @returns initial state with no cached pages or pending operations.
 */
export function readTextState(sessionId: string): TextState {
  const state: TextState = { byTab: {} }
  if (typeof localStorage === 'undefined') return state
  try {
    const raw = localStorage.getItem(PREFIX + sessionId)
    if (raw === null) return state
    const value: unknown = JSON.parse(raw)
    if (!object(value) || value.version !== 1 || !object(value.tabs)) return state
    for (const [id, item] of Object.entries(value.tabs)) {
      if (!object(item) || !object(item.file) || typeof item.file.sessionId !== 'string' || typeof item.file.path !== 'string') continue
      const tab: TextTabState = { ...fresh(), file: { sessionId: item.file.sessionId as SessionId, path: item.file.path } }
      if (typeof item.scrollTop === 'number' && Number.isFinite(item.scrollTop) && item.scrollTop >= 0) tab.scrollTop = item.scrollTop
      if (typeof item.wrap === 'boolean') tab.wrap = item.wrap
      if (typeof item.rendererId === 'string') tab.rendererId = item.rendererId
      const draft = item.draft
      if (object(draft) && typeof draft.text === 'string' && typeof draft.base === 'string'
        && (draft.endings === 'lf' || draft.endings === 'crlf') && typeof item.draftVersion === 'string') {
        tab.draft = { text: draft.text, base: draft.base, endings: draft.endings }
        tab.draftVersion = item.draftVersion
        tab.recovered = true
      }
      state.byTab[id as TabId] = tab
    }
  } catch (error) {
    console.error('Document draft recovery failed:', error)
  }
  return state
}

/**
 * Save drafts and view state synchronously after each edit, without persisting file caches.
 * Removed dirty buckets remain recoverable during plugin disposal; explicit discard clears them first.
 * @param sessionId - Session owning the store.
 * @param instance - live tab store.
 * @returns subscription disposer.
 */
export function persistTextState(sessionId: string, instance: ReturnType<TextStore['create']>): () => void {
  const retained: Record<string, unknown> = {}
  const write = (): void => {
    if (typeof localStorage === 'undefined') return
    for (const [id, tab] of Object.entries(instance.getSnapshot().byTab)) {
      if (tab.file === undefined) continue
      retained[id] = {
        file: tab.file, scrollTop: tab.scrollTop, wrap: tab.wrap, rendererId: tab.rendererId,
        ...tab.draft !== undefined && tab.draft.text !== tab.draft.base
          ? { draft: tab.draft, draftVersion: tab.draftVersion } : {},
      }
    }
    try {
      localStorage.setItem(PREFIX + sessionId, JSON.stringify({ version: 1, tabs: retained }))
    } catch (error) {
      console.error('Document draft persistence failed:', error)
    }
  }
  write()
  return instance.subscribe(write)
}

/**
 * Whether a store owns unsaved text, including tabs whose bodies are not mounted.
 * @param state - current document store.
 * @returns whether navigating away needs unsaved-change protection.
 */
export function hasDirtyDrafts(state: TextState): boolean {
  return Object.values(state.byTab).some(tab => tab.draft !== undefined && tab.draft.text !== tab.draft.base)
}
