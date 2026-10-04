// @vitest-environment jsdom
/**
 * Selection: which rows it names, and how a click changes it.
 *
 * Four facts are load-bearing for the body: the visible order is the drawn
 * order, including the entries of every open directory; a Shift click takes the
 * rows between the anchor and itself either way round; a Ctrl/Cmd click wins
 * over a Shift click; and a menu acts on the tab's selection only when every
 * selected path still resolves against the levels the tree holds.
 */
import { describe, expect, it } from 'vitest'
import type { WorkspaceDirectoryEntry } from '@deepseek-ai/dsh-api-workspace-files/types'
import type { EntryTarget } from '../src/client/EntryMenu.tsx'
import {
  entryAt, menuTargets, orderEntries, rangeBetween, selectionGesture, visiblePaths,
} from '../src/client/selection.ts'
import { createFilesStore } from '../src/client/store.ts'
import type { FilesTabState } from '../src/client/store.ts'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'

const TAB = 'tab-1' as TabId
const ROOT = '/work/app'

/** One tree with a root level and whatever else the test loads into it. */
function tree(levels: Record<string, readonly WorkspaceDirectoryEntry[]>, expanded: readonly string[] = [ROOT]): FilesTabState {
  const store = createFilesStore().create()
  store.actions.start(TAB, ROOT)
  for (const [path, entries] of Object.entries(levels)) store.actions.loaded(TAB, path, { entries, truncated: false })
  for (const path of expanded) store.actions.expand(TAB, path)
  return store.getSnapshot().byTab[TAB]!
}

const ROOT_ENTRIES: readonly WorkspaceDirectoryEntry[] = [
  { name: 'README.md', type: 'file' },
  { name: 'src', type: 'directory' },
  { name: 'pipe', type: 'other' },
]

describe('orderEntries', () => {
  it('puts directories first and orders each group by name, numbers included', () => {
    const ordered = orderEntries([
      { name: 'file10.txt', type: 'file' },
      { name: 'zeta', type: 'directory' },
      { name: 'file2.txt', type: 'file' },
      { name: '.env', type: 'file' },
      { name: 'Alpha', type: 'directory' },
      { name: 'sock', type: 'other' },
    ])
    expect(ordered.map(entry => entry.name)).toEqual(['Alpha', 'zeta', '.env', 'file2.txt', 'file10.txt', 'sock'])
  })

  it('leaves the endpoint\'s array untouched', () => {
    const entries = [{ name: 'b', type: 'file' as const }, { name: 'a', type: 'file' as const }]
    orderEntries(entries)
    expect(entries.map(entry => entry.name)).toEqual(['b', 'a'])
  })
})

describe('visiblePaths', () => {
  it('walks every open directory in display order and skips entries that are neither file nor directory', () => {
    const state = tree({
      [ROOT]: ROOT_ENTRIES,
      [`${ROOT}/src`]: [{ name: 'a.ts', type: 'file' }, { name: 'nested', type: 'directory' }],
    }, [ROOT, `${ROOT}/src`])
    expect(visiblePaths(state)).toEqual([
      `${ROOT}/src`,
      `${ROOT}/src/nested`,
      `${ROOT}/src/a.ts`,
      `${ROOT}/README.md`,
    ])
  })

  it('leaves a collapsed directory\'s children out, and a level that never loaded', () => {
    const state = tree({
      [ROOT]: ROOT_ENTRIES,
      [`${ROOT}/src`]: [{ name: 'a.ts', type: 'file' }],
      [`${ROOT}/docs`]: [{ name: 'b.ts', type: 'file' }],
    })
    expect(visiblePaths(state)).toEqual([`${ROOT}/src`, `${ROOT}/README.md`])
  })
})

describe('rangeBetween', () => {
  const ORDER = ['/work/app/a', '/work/app/b', '/work/app/c', '/work/app/d']

  it('takes the rows between the anchor and the clicked row, inclusive, either way round', () => {
    expect(rangeBetween(ORDER, '/work/app/b', '/work/app/d')).toEqual(['/work/app/b', '/work/app/c', '/work/app/d'])
    expect(rangeBetween(ORDER, '/work/app/d', '/work/app/b')).toEqual(['/work/app/b', '/work/app/c', '/work/app/d'])
    expect(rangeBetween(ORDER, '/work/app/b', '/work/app/b')).toEqual(['/work/app/b'])
  })

  it('selects the clicked row alone without an anchor, or with one that is off screen', () => {
    expect(rangeBetween(ORDER, null, '/work/app/c')).toEqual(['/work/app/c'])
    expect(rangeBetween(ORDER, '/elsewhere/x', '/work/app/c')).toEqual(['/work/app/c'])
    expect(rangeBetween(ORDER, '/work/app/a', '/elsewhere/y')).toEqual(['/elsewhere/y'])
  })
})

describe('selectionGesture', () => {
  it('reads a Ctrl or Cmd click as a toggle, a Shift click as a range, and anything else as a plain click', () => {
    expect(selectionGesture({ metaKey: false, ctrlKey: false, shiftKey: false })).toBe('plain')
    expect(selectionGesture({ metaKey: true, ctrlKey: false, shiftKey: false })).toBe('toggle')
    expect(selectionGesture({ metaKey: false, ctrlKey: true, shiftKey: false })).toBe('toggle')
    expect(selectionGesture({ metaKey: false, ctrlKey: false, shiftKey: true })).toBe('range')
    // Both held: the toggle wins, as every file manager reads them.
    expect(selectionGesture({ metaKey: true, ctrlKey: true, shiftKey: true })).toBe('toggle')
  })
})

describe('entryAt', () => {
  it('names one loaded row by the level that holds it', () => {
    const state = tree({ [ROOT]: ROOT_ENTRIES })
    expect(entryAt(state, `${ROOT}/src`)).toEqual({ path: `${ROOT}/src`, name: 'src', kind: 'directory' })
    expect(entryAt(state, `${ROOT}/README.md`)).toEqual({
      path: `${ROOT}/README.md`, name: 'README.md', kind: 'file',
    })
  })

  it('resolves nothing for an entry that is not a file or a directory, one whose level is gone, or one that left the listing', () => {
    const state = tree({ [ROOT]: ROOT_ENTRIES })
    expect(entryAt(state, `${ROOT}/pipe`)).toBeUndefined()
    expect(entryAt(state, '/elsewhere/a.ts')).toBeUndefined()
    expect(entryAt(state, `${ROOT}/gone.ts`)).toBeUndefined()
  })
})

describe('menuTargets', () => {
  const TARGET: EntryTarget = { path: `${ROOT}/README.md`, name: 'README.md', kind: 'file', x: 0, y: 0 }

  it('names the row alone while the selection is nothing but that row', () => {
    const state = tree({ [ROOT]: ROOT_ENTRIES })
    expect(menuTargets(state, TARGET)).toEqual([
      { path: `${ROOT}/README.md`, name: 'README.md', kind: 'file' },
    ])
  })

  it('names the whole selection while the row the menu opened on is part of it', () => {
    const store = createFilesStore().create()
    store.actions.start(TAB, ROOT)
    store.actions.loaded(TAB, ROOT, { entries: ROOT_ENTRIES, truncated: false })
    store.actions.selectOne(TAB, `${ROOT}/README.md`)
    store.actions.toggleSelected(TAB, `${ROOT}/src`)
    expect(menuTargets(store.getSnapshot().byTab[TAB]!, TARGET)).toEqual([
      { path: `${ROOT}/README.md`, name: 'README.md', kind: 'file' },
      { path: `${ROOT}/src`, name: 'src', kind: 'directory' },
    ])
  })

  it('names only its own row when the row the menu opened on is outside the selection', () => {
    const store = createFilesStore().create()
    store.actions.start(TAB, ROOT)
    store.actions.loaded(TAB, ROOT, { entries: ROOT_ENTRIES, truncated: false })
    store.actions.selectOne(TAB, `${ROOT}/src`)
    store.actions.toggleSelected(TAB, `${ROOT}/pipe`)
    expect(menuTargets(store.getSnapshot().byTab[TAB]!, TARGET)).toEqual([
      { path: `${ROOT}/README.md`, name: 'README.md', kind: 'file' },
    ])
  })

  it('falls back to its own row rather than acting on a selection it cannot resolve in full', () => {
    const store = createFilesStore().create()
    store.actions.start(TAB, ROOT)
    store.actions.loaded(TAB, ROOT, { entries: ROOT_ENTRIES, truncated: false })
    store.actions.selectOne(TAB, `${ROOT}/README.md`)
    // A selected path no level holds: a directory listed again without it, or an
    // entry removed elsewhere. Acting on the rest would move fewer than the menu
    // said it would.
    store.actions.toggleSelected(TAB, `${ROOT}/gone.ts`)
    expect(menuTargets(store.getSnapshot().byTab[TAB]!, TARGET)).toEqual([
      { path: `${ROOT}/README.md`, name: 'README.md', kind: 'file' },
    ])
  })
})
