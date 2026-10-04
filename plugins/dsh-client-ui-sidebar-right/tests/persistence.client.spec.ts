// @vitest-environment jsdom
/** Reload recovery restores committed topology before a tab body asks for its occurrence. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'
import { createSidebarRightStore } from '../src/client/stores.ts'
import { persistSidebarSurface, readSidebarSurface } from '../src/client/persistence.ts'
import { createSidebarRightController } from '../src/client/service.ts'
import { SidebarRightTabRegistry } from '../src/client/tab-registry.ts'

const SESSION = 'recovery-session' as SessionId
const KEY = `dsh.sidebar.right.v1.${SESSION}`
const create = () => createSidebarRightStore(() => ({ kind: 'guide', title: 'Start' })).create()
beforeEach(() => { localStorage.clear() })

describe('sidebar layout recovery', () => {
  it('restores split panes, floating panels, selection and mode, with fresh history and live resource pins', () => {
    const first = create()
    const unsubscribe = persistSidebarSurface(SESSION, first)
    let file = '' as TabId
    first.actions.openContent(SESSION, { kind: 'text', contentId: 'dsh-resource://file/session/recovery-session/a.ts', title: 'a.ts' }, (id) => { file = id })
    first.actions.splitPane(SESSION)
    first.actions.openContent(SESSION, { kind: 'text', contentId: 'dsh-resource://file/session/recovery-session/b.ts', title: 'b.ts' }, () => {})
    first.actions.floatTab(SESSION, file, { x: 200, y: 100, width: 420, height: 350 })
    first.actions.setMode(SESSION, 'fullscreen')
    const before = first.getSnapshot().bySession[SESSION]!
    unsubscribe()
    const second = create()
    second.actions.restore(SESSION, readSidebarSurface(SESSION)!)
    const restored = second.getSnapshot().bySession[SESSION]!
    expect(restored.layout).toEqual(JSON.parse(JSON.stringify(before.layout)))
    expect(restored.history.entries).toEqual([])
    expect(restored.minted).toBe(before.minted)
    const pins = vi.fn()
    const { controller, adopt } = createSidebarRightController(new SidebarRightTabRegistry(new Context()), pins)
    const release = adopt(SESSION, second)
    expect(controller.tabDomain.occurrence(SESSION, { id: file }).signal.aborted).toBe(false)
    expect(pins).toHaveBeenCalledTimes(Object.keys(restored.layout.tabs).length)
    release()
    controller.tabDomain.dispose()
  })

  it('does not recover another Session or reuse ids after new tabs open', () => {
    const instance = create()
    const stop = persistSidebarSurface(SESSION, instance)
    instance.actions.openContent(SESSION, { kind: 'text', contentId: 'file:a', title: 'a' }, () => {})
    const restored = readSidebarSurface(SESSION)!
    expect(readSidebarSurface('other')).toBeUndefined()
    const next = create()
    next.actions.restore(SESSION, restored)
    next.actions.openContent(SESSION, { kind: 'text', contentId: 'file:b', title: 'b' }, () => {})
    expect(Object.values(next.getSnapshot().bySession[SESSION]!.layout.tabs).map(tab => tab.contentId)).toEqual(['file:a', 'file:b'])
    stop()
  })

  it('ignores corrupted topology and unsupported records before rendering', () => {
    const instance = create()
    const stop = persistSidebarSurface(SESSION, instance)
    instance.actions.open(SESSION)
    const saved = JSON.parse(localStorage.getItem(KEY)!) as { version: number; layout: { rootId: string; nodes: Record<string, unknown> } }
    saved.layout.nodes[saved.layout.rootId] = { kind: 'split', id: saved.layout.rootId, axis: 'row', children: [saved.layout.rootId, 'missing'], sizes: [0.5, 0.5] }
    localStorage.setItem(KEY, JSON.stringify(saved))
    expect(readSidebarSurface(SESSION)).toBeUndefined()
    localStorage.setItem(KEY, JSON.stringify({ ...saved, version: 2 }))
    expect(readSidebarSurface(SESSION)).toBeUndefined()
    stop()
  })
})
