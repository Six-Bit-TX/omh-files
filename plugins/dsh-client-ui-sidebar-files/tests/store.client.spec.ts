/**
 * The tree's write set, one tab at a time.
 *
 * Two facts here are load-bearing for the body: a collapsed level keeps what it
 * loaded (reopening draws at once), and `reset` clears levels while keeping the
 * expanded set, which is what lets the reload gesture know which levels to ask
 * for again. The upload list is the third: one row per file until the Host
 * answers, carrying the refusal instead of leaving when it has one.
 */
import { describe, expect, it } from 'vitest'
import { RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import { createFilesStore, RECENT_LIMIT } from '../src/client/store.ts'
import type { DirLevel } from '../src/client/store.ts'
import type { TabId } from '@deepseek-ai/dsh-client-ui-dockkit'

const ROOT = '/work/app'
const TAB = 'tab-1' as TabId

const LEVEL: DirLevel = {
  entries: [{ name: 'src', type: 'directory' }, { name: 'README.md', type: 'file', size: 12 }],
  truncated: false,
}

describe('createFilesStore', () => {
  it('mints an independent instance per call', () => {
    const first = createFilesStore().create()
    const second = createFilesStore().create()
    first.actions.start(TAB, ROOT)
    expect(second.getSnapshot().byTab[TAB]).toBeUndefined()
  })

  it('seeds a tab at its root with the root expanded and nothing loaded', () => {
    const store = createFilesStore().create()
    const { actions } = store
    const getSnapshot = (): ReturnType<typeof store.getSnapshot> => store.getSnapshot()
    actions.start(TAB, ROOT)
    expect(getSnapshot().byTab[TAB]).toEqual({
      root: ROOT, levels: {}, expanded: [ROOT], scrollTop: 0, recent: [ROOT], compareBase: null, selected: [], anchor: null, uploads: [],
    })
  })

  it('walks one level through loading, ready, and failed', () => {
    const store = createFilesStore().create()
    const { actions } = store
    const getSnapshot = (): ReturnType<typeof store.getSnapshot> => store.getSnapshot()
    actions.start(TAB, ROOT)
    actions.loading(TAB, ROOT)
    expect(getSnapshot().byTab[TAB]!.levels[ROOT]).toEqual({ kind: 'loading' })
    actions.loaded(TAB, ROOT, LEVEL)
    expect(getSnapshot().byTab[TAB]!.levels[ROOT]).toEqual({ kind: 'ready', level: LEVEL })
    const failure = new RemoteError('workspace-file/not-found', 'gone', { path: ROOT })
    actions.failed(TAB, ROOT, failure)
    expect(getSnapshot().byTab[TAB]!.levels[ROOT]).toEqual({ kind: 'failed', failure })
  })

  it('toggles a directory in and out of the expanded set without touching its level', () => {
    const store = createFilesStore().create()
    const { actions } = store
    const getSnapshot = (): ReturnType<typeof store.getSnapshot> => store.getSnapshot()
    const child = `${ROOT}/src`
    actions.start(TAB, ROOT)
    actions.loaded(TAB, child, LEVEL)
    actions.toggled(TAB, child)
    expect(getSnapshot().byTab[TAB]!.expanded).toEqual([ROOT, child])
    actions.toggled(TAB, child)
    expect(getSnapshot().byTab[TAB]!.expanded).toEqual([ROOT])
    // Collapsing keeps the listing, so reopening draws without another fetch.
    expect(getSnapshot().byTab[TAB]!.levels[child]).toEqual({ kind: 'ready', level: LEVEL })
  })

  it('reset drops every level and keeps the expanded set', () => {
    const store = createFilesStore().create()
    const { actions } = store
    const getSnapshot = (): ReturnType<typeof store.getSnapshot> => store.getSnapshot()
    const child = `${ROOT}/src`
    actions.start(TAB, ROOT)
    actions.loaded(TAB, ROOT, LEVEL)
    actions.toggled(TAB, child)
    actions.loaded(TAB, child, LEVEL)
    actions.reset(TAB)
    expect(getSnapshot().byTab[TAB]).toEqual({
      root: ROOT, levels: {}, expanded: [ROOT, child], scrollTop: 0, recent: [ROOT],
      compareBase: null, selected: [], anchor: null, uploads: [],
    })
  })

  it('remembers where the body is scrolled to', () => {
    const store = createFilesStore().create()
    const { actions } = store
    actions.start(TAB, ROOT)
    actions.scrolled(TAB, 120)
    expect(store.getSnapshot().byTab[TAB]!.scrollTop).toBe(120)
  })

  it('navigate re-roots the tab, drops the old levels, and leads the visited list with the new root', () => {
    const store = createFilesStore().create()
    const { actions } = store
    const getSnapshot = (): ReturnType<typeof store.getSnapshot> => store.getSnapshot()
    actions.start(TAB, ROOT)
    actions.loaded(TAB, ROOT, LEVEL)
    actions.navigate(TAB, '/elsewhere')
    expect(getSnapshot().byTab[TAB]).toEqual({
      root: '/elsewhere', levels: {}, expanded: ['/elsewhere'], scrollTop: 0,
      recent: ['/elsewhere', ROOT], compareBase: null, selected: [], anchor: null, uploads: [],
    })
    // Revisiting a directory moves it to the head instead of duplicating it.
    actions.navigate(TAB, ROOT)
    expect(getSnapshot().byTab[TAB]!.recent).toEqual([ROOT, '/elsewhere'])
  })

  it('keeps the visited list bounded to the newest visits', () => {
    const store = createFilesStore().create()
    const { actions } = store
    actions.start(TAB, ROOT)
    for (let index = 0; index < RECENT_LIMIT + 3; index++) actions.navigate(TAB, `/dir-${String(index)}`)
    const recent = store.getSnapshot().byTab[TAB]!.recent
    expect(recent).toHaveLength(RECENT_LIMIT)
    expect(recent[0]).toBe(`/dir-${String(RECENT_LIMIT + 2)}`)
  })

  it('records and clears the tab\'s compare base', () => {
    const store = createFilesStore().create()
    const { actions } = store
    actions.start(TAB, ROOT)
    actions.compareSelected(TAB, `${ROOT}/a.txt`)
    expect(store.getSnapshot().byTab[TAB]!.compareBase).toBe(`${ROOT}/a.txt`)
    actions.compareSelected(TAB, null)
    expect(store.getSnapshot().byTab[TAB]!.compareBase).toBeNull()
  })

  it('selects one entry, toggles entries in and out, and anchors each gesture', () => {
    const store = createFilesStore().create()
    const { actions } = store
    const tree = (): NonNullable<ReturnType<typeof store.getSnapshot>['byTab'][TabId]> => store.getSnapshot().byTab[TAB]!
    actions.start(TAB, ROOT)
    actions.selectOne(TAB, `${ROOT}/a.txt`)
    expect({ selected: tree().selected, anchor: tree().anchor })
      .toEqual({ selected: [`${ROOT}/a.txt`], anchor: `${ROOT}/a.txt` })
    // A toggle appends in the order it was asked for, and moves the anchor with it.
    actions.toggleSelected(TAB, `${ROOT}/b.txt`)
    actions.toggleSelected(TAB, `${ROOT}/c.txt`)
    expect(tree().selected).toEqual([`${ROOT}/a.txt`, `${ROOT}/b.txt`, `${ROOT}/c.txt`])
    expect(tree().anchor).toBe(`${ROOT}/c.txt`)
    // Toggling a selected entry removes it and leaves the rest in place.
    actions.toggleSelected(TAB, `${ROOT}/b.txt`)
    expect(tree().selected).toEqual([`${ROOT}/a.txt`, `${ROOT}/c.txt`])
    expect(tree().anchor).toBe(`${ROOT}/b.txt`)
  })

  it('replaces the selection with a range and leaves the anchor where the range started', () => {
    const store = createFilesStore().create()
    const { actions } = store
    const tree = (): NonNullable<ReturnType<typeof store.getSnapshot>['byTab'][TabId]> => store.getSnapshot().byTab[TAB]!
    actions.start(TAB, ROOT)
    actions.selectOne(TAB, `${ROOT}/a.txt`)
    actions.selectRange(TAB, [`${ROOT}/a.txt`, `${ROOT}/b.txt`])
    expect(tree().selected).toEqual([`${ROOT}/a.txt`, `${ROOT}/b.txt`])
    expect(tree().anchor).toBe(`${ROOT}/a.txt`)
  })

  it('clears the selection and its anchor', () => {
    const store = createFilesStore().create()
    const { actions } = store
    const tree = (): NonNullable<ReturnType<typeof store.getSnapshot>['byTab'][TabId]> => store.getSnapshot().byTab[TAB]!
    actions.start(TAB, ROOT)
    actions.selectOne(TAB, `${ROOT}/a.txt`)
    actions.clearSelection(TAB)
    expect({ selected: tree().selected, anchor: tree().anchor }).toEqual({ selected: [], anchor: null })
  })

  it('ends a selection when the tab is rooted somewhere else', () => {
    const store = createFilesStore().create()
    const { actions } = store
    const tree = (): NonNullable<ReturnType<typeof store.getSnapshot>['byTab'][TabId]> => store.getSnapshot().byTab[TAB]!
    actions.start(TAB, ROOT)
    actions.selectOne(TAB, `${ROOT}/a.txt`)
    actions.navigate(TAB, '/elsewhere')
    expect({ selected: tree().selected, anchor: tree().anchor }).toEqual({ selected: [], anchor: null })
  })

  it('refuses to write a level for a tab that was never started', () => {
    const { actions } = createFilesStore().create()
    expect(() => { actions.loading('tab-nowhere' as TabId, ROOT) }).toThrow('no tree for tab "tab-nowhere"')
  })

  it('opens one directory without disturbing the others', () => {
    const store = createFilesStore().create()
    const { actions } = store
    actions.start(TAB, ROOT)
    actions.expand(TAB, `${ROOT}/src`)
    expect(store.getSnapshot().byTab[TAB]!.expanded).toEqual([ROOT, `${ROOT}/src`])
    // Idempotent: a directory already open is not toggled shut by a late gesture.
    actions.expand(TAB, `${ROOT}/src`)
    expect(store.getSnapshot().byTab[TAB]!.expanded).toEqual([ROOT, `${ROOT}/src`])
  })

  it('keeps one row per upload, refuses to stack a second row for the same path, and clears it on landing', () => {
    const store = createFilesStore().create()
    const { actions } = store
    actions.start(TAB, ROOT)
    expect(store.getSnapshot().byTab[TAB]!.uploads).toEqual([])
    const task = { path: `${ROOT}/a.bin`, dir: ROOT, name: 'a.bin', bytes: 3 }
    actions.uploadQueued(TAB, task)
    expect(store.getSnapshot().byTab[TAB]!.uploads).toEqual([task])
    actions.uploadQueued(TAB, { ...task, bytes: 9 })
    expect(store.getSnapshot().byTab[TAB]!.uploads).toEqual([{ ...task, bytes: 9 }])
    actions.uploadFinished(TAB, task.path, undefined)
    expect(store.getSnapshot().byTab[TAB]!.uploads).toEqual([])
  })

  it('marks a refused upload in place and dismisses it the same way', () => {
    const store = createFilesStore().create()
    const { actions } = store
    const failure = new RemoteError('workspace-file/exists', 'taken', { path: `${ROOT}/a.bin` })
    actions.start(TAB, ROOT)
    actions.uploadQueued(TAB, { path: `${ROOT}/a.bin`, dir: ROOT, name: 'a.bin', bytes: 3 })
    actions.uploadFinished(TAB, `${ROOT}/a.bin`, failure)
    expect(store.getSnapshot().byTab[TAB]!.uploads).toEqual([
      { path: `${ROOT}/a.bin`, dir: ROOT, name: 'a.bin', bytes: 3, failure },
    ])
    // Another file's settlement leaves this row alone.
    actions.uploadFinished(TAB, `${ROOT}/other.bin`, failure)
    expect(store.getSnapshot().byTab[TAB]!.uploads).toHaveLength(1)
    actions.uploadFinished(TAB, `${ROOT}/a.bin`, undefined)
    expect(store.getSnapshot().byTab[TAB]!.uploads).toEqual([])
  })

  it('forget removes exactly the tab that went away', () => {
    const store = createFilesStore().create()
    const { actions } = store
    const getSnapshot = (): ReturnType<typeof store.getSnapshot> => store.getSnapshot()
    actions.start(TAB, ROOT)
    actions.start('tab-2' as TabId, ROOT)
    actions.forget(TAB)
    expect(Object.keys(getSnapshot().byTab)).toEqual(['tab-2'])
  })
})
