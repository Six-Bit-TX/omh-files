/** Browser-local recovery of a Session's committed panes and tabs, without its undo history. */
import { EMPTY_HISTORY, type LayoutState } from '@deepseek-ai/dsh-client-ui-dockkit'
import type { SidebarRightSurfaceStore } from './service.ts'
import type { SurfaceState } from './stores.ts'

const PREFIX = 'dsh.sidebar.right.v1.'

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

/** Validate the persisted graph before any renderer or layout planner can traverse it. */
function layoutOf(value: unknown): LayoutState | undefined {
  if (!object(value) || !object(value.nodes) || !object(value.tabs) || !strings(value.floats)
    || typeof value.rootId !== 'string' || typeof value.activePaneId !== 'string'
    || typeof value.expanded !== 'boolean' || (value.mode !== 'push' && value.mode !== 'fullscreen')) return undefined
  const nodes = value.nodes
  const tabs = value.tabs
  for (const [id, tab] of Object.entries(tabs)) {
    if (!object(tab) || tab.id !== id || typeof tab.kind !== 'string' || typeof tab.title !== 'string'
      || typeof tab.contentId !== 'string') return undefined
  }
  const visited = new Set<string>()
  const ownedTabs = new Set<string>()
  const visit = (id: string, host: 'dock' | 'float'): boolean => {
    if (visited.has(id) || !Object.hasOwn(nodes, id)) return false
    visited.add(id)
    const node = nodes[id]
    if (!object(node) || node.id !== id) return false
    if (node.kind === 'split') {
      return host === 'dock' && (node.axis === 'row' || node.axis === 'column')
        && strings(node.children) && node.children.length >= 2 && Array.isArray(node.sizes)
        && node.sizes.length === node.children.length
        && node.sizes.every(size => typeof size === 'number' && Number.isFinite(size) && size > 0)
        && Math.abs(node.sizes.reduce((total: number, size: number) => total + size, 0) - 1) < 0.000001
        && node.children.every(child => visit(child, 'dock'))
    }
    if (node.kind !== 'pane' || node.host !== host || !strings(node.tabs)
      || (node.tabs.length === 0 ? node.activeTabId !== undefined : !node.tabs.includes(String(node.activeTabId)))) return false
    if (host === 'float') {
      const rect = node.rect
      if (node.tabs.length !== 1 || !object(rect)
        || !['x', 'y', 'width', 'height'].every(key => typeof rect[key] === 'number' && Number.isFinite(rect[key]))
        || Number(rect.width) <= 0 || Number(rect.height) <= 0) return false
    }
    return node.tabs.every((tab) => {
      if (ownedTabs.has(tab) || !Object.hasOwn(tabs, tab)) return false
      ownedTabs.add(tab)
      return true
    })
  }
  if (!visit(value.rootId, 'dock') || !value.floats.every(id => visit(id, 'float'))
    || visited.size !== Object.keys(nodes).length || ownedTabs.size !== Object.keys(tabs).length) return undefined
  const active = nodes[value.activePaneId]
  if (!object(active) || active.kind !== 'pane') return undefined
  // All fields traversed by the kit have been checked at this storage boundary.
  return value as unknown as LayoutState
}

/**
 * Read one saved surface; unavailable storage and invalid records leave a fresh layout.
 * @param sessionId - owning Session.
 * @returns the validated layout with a new undo sequence, if available.
 */
export function readSidebarSurface(sessionId: string): SurfaceState | undefined {
  if (typeof localStorage === 'undefined') return undefined
  try {
    const raw = localStorage.getItem(PREFIX + sessionId)
    if (raw === null) return undefined
    const value: unknown = JSON.parse(raw)
    if (!object(value) || value.version !== 1 || !Number.isSafeInteger(value.minted) || Number(value.minted) < 0) return undefined
    const layout = layoutOf(value.layout)
    if (layout === undefined) return undefined
    const ids = [...Object.keys(layout.nodes), ...Object.keys(layout.tabs)]
    const minted = ids.reduce((max, id) => Math.max(max, Number(/\d+$/.exec(id)?.[0] ?? 0)), Number(value.minted))
    if (!Number.isSafeInteger(minted)) return undefined
    return { layout, minted, history: EMPTY_HISTORY }
  } catch (error) {
    console.error('Sidebar layout recovery failed:', error)
    return undefined
  }
}

/**
 * Save committed layout changes; disposal retains the last saved layout.
 * @param sessionId - owning Session.
 * @param store - adopted Session store.
 * @returns the persistence subscription disposer.
 */
export function persistSidebarSurface(sessionId: string, store: SidebarRightSurfaceStore): () => void {
  let previous: SurfaceState | undefined
  return store.subscribe(() => {
    const surface = store.getSnapshot().bySession[sessionId]
    if (surface === undefined || surface === previous || typeof localStorage === 'undefined') return
    previous = surface
    try {
      localStorage.setItem(PREFIX + sessionId, JSON.stringify({ version: 1, layout: surface.layout, minted: surface.minted }))
    } catch (error) {
      console.error('Sidebar layout persistence failed:', error)
    }
  })
}
