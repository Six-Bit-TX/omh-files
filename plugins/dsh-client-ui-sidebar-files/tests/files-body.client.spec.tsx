// @vitest-environment jsdom
/**
 * The body against a scripted listing.
 *
 * What is asserted is the reader's contract: the root lists itself on mount,
 * rows come out directories-first, a directory click asks for exactly that
 * level, a file click opens exactly that session-scoped `file:` address through
 * the owner, an `other` entry is shown but not clickable, the tree says when it
 * was cut or could not be read, and reload asks again for the expanded levels
 * only. Selection is the other half: a plain click selects and activates, a
 * Ctrl/Cmd click and a Shift click only select, the row menu acts on the whole
 * selection, and a dragged row lands where it was dropped. The pure helpers the
 * rows and the selection are built from are checked on their own.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { makeTranslate, RemoteError } from '@deepseek-ai/dsh-client-test-runtime'
import type { RemoteFailure } from '@deepseek-ai/dsh-api-remotes/client'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import { orderEntries } from '../src/client/selection.ts'
import { FILES_DRAG_MIME } from '../src/client/drag.ts'
import { failureLine } from '../src/client/failures.ts'
import type { DirLevel } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'
import { mountBody, ROOT, SESSION, TAB } from './mount.client.tsx'

const ROOT_LEVEL: DirLevel = {
  entries: [
    { name: 'README.md', type: 'file', size: 12 },
    { name: 'src', type: 'directory' },
    { name: '.env', type: 'file', size: 2 },
    { name: 'pipe', type: 'other' },
  ],
  truncated: false,
}

afterEach(() => {
  cleanup()
  // A spec that stood in for the page's origin must not leak it into the next one.
  vi.unstubAllGlobals()
})

/** Row labels in document order. */
function names(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[data-files-entry]')].map(li => li.getAttribute('data-files-path')!)
}

describe('FilesBody', () => {
  it('says so when the session has no workspace directory, and asks for nothing', () => {
    const { view, script } = mountBody(null)
    expect(view.container.querySelector('[data-files-state="no-workspace"]')?.textContent).toBe(zh.noWorkspace)
    expect(script.list).not.toHaveBeenCalled()
  })

  it('lists the root on mount, heads it with its path split at the last segment, and draws directories first with dotfiles kept', async () => {
    const { view, script } = mountBody()
    expect(script.list).toHaveBeenCalledWith(SESSION, ROOT, expect.any(AbortSignal))
    expect(view.container.querySelector('[data-files-row="loading"]')).not.toBeNull()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    expect(view.container.querySelector('[data-files-state="tree"]')?.getAttribute('data-files-root')).toBe(ROOT)
    const path = view.container.querySelector('[data-files-path]')
    expect(path?.getAttribute('title')).toBe(ROOT)
    expect([...path?.querySelectorAll('span > span') ?? []].map(span => span.textContent)).toEqual(['/work/', 'app'])
    expect(names(view.container)).toEqual([`${ROOT}/src`, `${ROOT}/.env`, `${ROOT}/pipe`, `${ROOT}/README.md`])
    const envIcon = view.container.querySelector(`[data-files-path="${ROOT}/.env"] svg`)?.innerHTML
    const readmeIcon = view.container.querySelector(`[data-files-path="${ROOT}/README.md"] svg`)?.innerHTML
    expect(envIcon).not.toBe(readmeIcon)
  })

  it('heads a separator-only root by the root itself, since it has no final segment', async () => {
    const { view, script } = mountBody('/')
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    const path = view.container.querySelector('[data-files-path]')
    expect([...path?.querySelectorAll('span > span') ?? []].map(span => span.textContent)).toEqual(['/'])
    expect(names(view.container)).toEqual(['/src', '/.env', '/pipe', '/README.md'])
  })

  it('marks the root path clipped while its text is wider than its box, re-reading on resize', async () => {
    class FakeResizeObserver implements ResizeObserver {
      static latest: FakeResizeObserver | undefined
      readonly observe = vi.fn()
      readonly unobserve = vi.fn()
      readonly disconnect = vi.fn()
      constructor(private readonly callback: ResizeObserverCallback) {
        FakeResizeObserver.latest = this
      }

      fire(): void {
        this.callback([], this)
      }
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    let boxWidth = 300
    const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
    const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 200 })
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => boxWidth })
    try {
      const { view, script } = mountBody()
      await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
      const path = view.container.querySelector<HTMLElement>('[data-files-path]')
      const text = path?.firstElementChild
      expect(path?.hasAttribute('data-files-path-clipped')).toBe(false)
      const observer = FakeResizeObserver.latest
      if (observer === undefined) throw new Error('expected the path to observe its size')
      expect(observer.observe).toHaveBeenCalledWith(path)
      expect(observer.observe).toHaveBeenCalledWith(text)

      boxWidth = 120
      act(() => { observer.fire() })
      expect(path?.hasAttribute('data-files-path-clipped')).toBe(true)

      boxWidth = 300
      act(() => { observer.fire() })
      expect(path?.hasAttribute('data-files-path-clipped')).toBe(false)
      view.unmount()
      expect(observer.disconnect).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
      for (const [name, descriptor] of [['offsetWidth', offsetWidth], ['clientWidth', clientWidth]] as const) {
        if (descriptor === undefined) Reflect.deleteProperty(HTMLElement.prototype, name)
        else Object.defineProperty(HTMLElement.prototype, name, descriptor)
      }
    }
  })

  it('a directory click lists that level once and marks it expanded; a second click collapses without asking again', async () => {
    const { view, script } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    const dir = view.container.querySelector(`[data-files-path="${ROOT}/src"] > button`)!
    act(() => { fireEvent.click(dir) })
    expect(script.list).toHaveBeenLastCalledWith(SESSION, `${ROOT}/src`, expect.any(AbortSignal))
    expect(dir.getAttribute('aria-expanded')).toBe('true')
    await act(() => script.settle({ ok: true, value: { entries: [{ name: 'a.ts', type: 'file' }], truncated: false } }))
    expect(names(view.container)).toContain(`${ROOT}/src/a.ts`)
    act(() => { fireEvent.click(dir) })
    expect(dir.getAttribute('aria-expanded')).toBe('false')
    expect(names(view.container)).not.toContain(`${ROOT}/src/a.ts`)
    act(() => { fireEvent.click(dir) })
    expect(names(view.container)).toContain(`${ROOT}/src/a.ts`)
    expect(script.list).toHaveBeenCalledTimes(2)
  })

  it('a file click opens its session-scoped file: address through the owner; an other entry offers no button', async () => {
    const { view, script, tabActions } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    fireEvent.click(view.container.querySelector(`[data-files-path="${ROOT}/README.md"] > button`)!)
    // Every row sits under the tree's root, so the address is the path relative to it.
    expect(tabActions.openResource).toHaveBeenCalledWith(fileAddressFor(SESSION, ROOT, `${ROOT}/README.md`))
    expect(tabActions.openResource).toHaveBeenCalledWith('dsh-resource://file/session/s-test/README.md')
    const other = view.container.querySelector(`[data-files-path="${ROOT}/pipe"]`)!
    expect(other.querySelector('button')).toBeNull()
    expect(other.querySelector('[aria-disabled="true"]')?.getAttribute('title')).toBe(zh['entry.other'])
  })

  it('marks a cut listing and an empty one', async () => {
    const { view, script } = mountBody()
    await act(() => script.settle({ ok: true, value: { entries: [{ name: 'd', type: 'directory' }], truncated: true } }))
    expect(view.container.querySelector('[data-files-row="truncated"]')?.textContent).toBe(zh.truncated)
    act(() => { fireEvent.click(view.container.querySelector(`[data-files-path="${ROOT}/d"] > button`)!) })
    await act(() => script.settle({ ok: true, value: { entries: [], truncated: false } }))
    expect(view.container.querySelector('[data-files-row="empty"]')?.textContent).toBe(zh.empty)
  })

  it('shows a failed level under its directory with the failure code', async () => {
    const { view, script } = mountBody()
    await act(() => script.settle({
      ok: false,
      error: new RemoteError('workspace-file/not-found', 'gone', { path: ROOT }),
    }))
    const failed = view.container.querySelector('[data-files-row="failed"]')
    expect(failed?.getAttribute('data-files-code')).toBe('workspace-file/not-found')
    expect(failed?.textContent).toBe(zh['error.notFound'])
  })

  it('reload resets every level and lists the expanded ones again', async () => {
    const { view, script, controller, instance } = mountBody()
    const child = `${ROOT}/src`
    const collapsed = `${ROOT}/docs`
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    act(() => { fireEvent.click(view.container.querySelector(`[data-files-path="${child}"] > button`)!) })
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    // A level listed earlier and since collapsed is dropped, not re-fetched.
    act(() => { instance.actions.loaded(TAB, collapsed, ROOT_LEVEL) })
    script.list.mockClear()

    act(() => { fireEvent.click(view.container.querySelector('[data-files-reload]')!) })
    expect(script.list.mock.calls.map(call => call[1])).toEqual([ROOT, child])
    expect(script.list).toHaveBeenCalledWith(SESSION, ROOT, controller.signal)
    const state = instance.getSnapshot().byTab[TAB]!
    expect(state.expanded).toEqual([ROOT, child])
    expect(state.levels).toEqual({ [ROOT]: { kind: 'loading' }, [child]: { kind: 'loading' } })
    expect(view.container.querySelector('[data-files-reload]')?.getAttribute('aria-label')).toBe(zh.reload)
  })

  it('captures the body scroll offset on unmount and restores it when a tab switch remounts the tree', async () => {
    const { view, script, instance, remount } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    const body = view.container.querySelector('[data-files-body]')!
    fireEvent.scroll(body, { target: { scrollTop: 120 } })
    // Scrolling writes nothing yet: the store hears the offset once, on unmount.
    expect(instance.getSnapshot().byTab[TAB]!.scrollTop).toBe(0)
    view.unmount()
    expect(instance.getSnapshot().byTab[TAB]!.scrollTop).toBe(120)
    const back = remount()
    expect(back.container.querySelector('[data-files-body]')!.scrollTop).toBe(120)
  })

  it('a scroll before the owner aborts is not written to a forgotten bucket', async () => {
    const { view, script, controller, instance } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    fireEvent.scroll(view.container.querySelector('[data-files-body]')!, { target: { scrollTop: 80 } })
    act(() => { controller.abort() })
    view.unmount()
    expect(instance.getSnapshot().byTab[TAB]).toBeUndefined()
  })

  it('an aborted record is forgotten and not seeded again while the body is still mounted', async () => {
    const { view, script, controller, instance } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    act(() => { controller.abort() })
    expect(instance.getSnapshot().byTab[TAB]).toBeUndefined()
    expect(view.container.querySelector('[data-files-state="tree"]')).toBeNull()
    expect(script.list).toHaveBeenCalledTimes(1)
  })
})

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

describe('selecting rows and acting on the selection', () => {
  /** The selected paths one mount's store holds. */
  function selectedOf(instance: ReturnType<typeof mountBody>['instance']): readonly string[] {
    return instance.getSnapshot().byTab[TAB]!.selected
  }

  /** The row button of one entry. */
  function row(view: ReturnType<typeof mountBody>['view'], path: string): HTMLElement {
    const button = view.container.querySelector(`[data-files-path="${path}"] > button`)
    if (button === null) throw new Error(`no row for ${path}`)
    return button as HTMLElement
  }

  /** One data transfer shared by a drag start and the drop it ends in. */
  function transfer(): {
    readonly data: Map<string, string>
    readonly payload: {
      files: File[]
      types: string[]
      effectAllowed: string
      dropEffect: string
      setData: (type: string, value: string) => void
      getData: (type: string) => string
    }
  } {
    const data = new Map<string, string>()
    const payload = {
      files: [] as File[],
      types: [] as string[],
      effectAllowed: '',
      dropEffect: '',
      setData: (type: string, value: string) => {
        data.set(type, value)
        if (!payload.types.includes(type)) payload.types.push(type)
      },
      getData: (type: string) => data.get(type) ?? '',
    }
    return { data, payload }
  }

  it('selects and activates on a plain click, and only selects on a Ctrl/Cmd or Shift click', async () => {
    const { view, script, instance, tabActions } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))

    fireEvent.click(row(view, `${ROOT}/README.md`))
    expect(selectedOf(instance)).toEqual([`${ROOT}/README.md`])
    expect(tabActions.openResource).toHaveBeenCalledTimes(1)

    // Ctrl/Cmd adds without opening, so a selection of files never opens them all.
    fireEvent.click(row(view, `${ROOT}/.env`), { ctrlKey: true })
    expect(selectedOf(instance)).toEqual([`${ROOT}/README.md`, `${ROOT}/.env`])
    expect(tabActions.openResource).toHaveBeenCalledTimes(1)

    // Shift takes the range from the anchor — the last row any gesture touched,
    // here `.env` — through the row clicked, in display order.
    fireEvent.click(row(view, `${ROOT}/README.md`), { shiftKey: true })
    expect(selectedOf(instance)).toEqual([`${ROOT}/.env`, `${ROOT}/README.md`])
    expect(tabActions.openResource).toHaveBeenCalledTimes(1)

    expect(row(view, `${ROOT}/.env`).getAttribute('data-files-selected')).toBe('true')
    expect(row(view, `${ROOT}/README.md`).getAttribute('data-files-selected')).toBe('true')
    expect(row(view, `${ROOT}/src`).getAttribute('data-files-selected')).toBe('false')

    // A plain click on a directory selects it and toggles it, as it always did.
    fireEvent.click(row(view, `${ROOT}/src`))
    expect(selectedOf(instance)).toEqual([`${ROOT}/src`])
    expect(row(view, `${ROOT}/src`).getAttribute('aria-expanded')).toBe('true')
  })

  it('opens the menu on the whole selection a right-click landed inside', async () => {
    const { view, script, instance } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    fireEvent.click(row(view, `${ROOT}/README.md`))
    fireEvent.click(row(view, `${ROOT}/.env`), { ctrlKey: true })

    fireEvent.contextMenu(row(view, `${ROOT}/README.md`))
    expect(screen.getByRole('menuitem', { name: zh['menu.deleteMany'].replace('{count}', '2') })).not.toBeNull()
    expect(screen.queryByRole('menuitem', { name: zh['menu.rename'] })).toBeNull()
    // The selection the menu named is the selection the store holds.
    expect(selectedOf(instance)).toHaveLength(2)
  })

  it('moves the selection to the row a right-click landed outside it', async () => {
    const { view, script, instance } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    fireEvent.click(row(view, `${ROOT}/README.md`))
    fireEvent.click(row(view, `${ROOT}/.env`), { ctrlKey: true })

    fireEvent.contextMenu(row(view, `${ROOT}/src`))
    expect(selectedOf(instance)).toEqual([`${ROOT}/src`])
    expect(screen.getByRole('menuitem', { name: zh['menu.rename'] })).not.toBeNull()
  })

  it('starts one download per selected file, and reports a refused one', async () => {
    const heads: string[] = []
    const fetchMock = vi.fn(async (input: string | URL, init?: RequestInit) => {
      expect(init?.method).toBe('HEAD')
      heads.push(String(input))
      return { ok: heads.length > 1, status: heads.length > 1 ? 200 : 404 }
    })
    vi.stubGlobal('fetch', fetchMock)
    const anchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { view, script } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    fireEvent.click(row(view, `${ROOT}/README.md`))
    fireEvent.click(row(view, `${ROOT}/.env`), { ctrlKey: true })

    fireEvent.contextMenu(row(view, `${ROOT}/README.md`))
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.downloadMany'].replace('{count}', '2') }))
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    expect(heads.map(head => new URL(head).searchParams.get('path'))).toEqual([`${ROOT}/README.md`, `${ROOT}/.env`])
    expect(anchor).toHaveBeenCalledTimes(1)
    expect(view.container.querySelector('[data-files-notice]')?.textContent)
      .toBe(zh['download.failed'].replace('{count}', '1').replace('{message}', 'README.md: HTTP 404'))
    anchor.mockRestore()
  })

  it('reads through the Remote face instead when the page has no HTTP route', async () => {
    // A `file://` shell: no origin, no `/api`, so the only download path left is
    // the Remote read, which is capped but works.
    vi.stubGlobal('location', { origin: 'null' })
    const anchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const fetched = vi.fn()
    vi.stubGlobal('fetch', fetched)
    const { view, script, ops, instance } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    fireEvent.click(row(view, `${ROOT}/README.md`))
    fireEvent.contextMenu(row(view, `${ROOT}/README.md`))
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.download'] }))
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    expect(ops.download).toHaveBeenCalledWith(SESSION, `${ROOT}/README.md`, expect.any(AbortSignal))
    expect(fetched).not.toHaveBeenCalled()
    expect(anchor).toHaveBeenCalledTimes(1)
    expect(instance.getSnapshot().byTab[TAB]).toBeDefined()
    anchor.mockRestore()
  })

  it('reports a file the Remote read refuses, and keeps going through the selection', async () => {
    vi.stubGlobal('location', { origin: 'null' })
    const anchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { view, script, ops } = mountBody()
    ops.download
      .mockResolvedValueOnce({
        ok: false,
        error: new RemoteError('workspace-file/too-large', 'too big', { path: `${ROOT}/README.md`, limit: 1 }),
      })
      .mockResolvedValueOnce({ ok: true, value: { name: '.env', base64: 'aGk=' } })
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    fireEvent.click(row(view, `${ROOT}/README.md`))
    fireEvent.click(row(view, `${ROOT}/.env`), { ctrlKey: true })
    fireEvent.contextMenu(row(view, `${ROOT}/README.md`))
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.downloadMany'].replace('{count}', '2') }))
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    expect(ops.download).toHaveBeenCalledTimes(2)
    expect(anchor).toHaveBeenCalledTimes(1)
    expect(view.container.querySelector('[data-files-notice]')?.textContent)
      .toBe(zh['download.failed'].replace('{count}', '1').replace('{message}', `README.md: ${zh['error.tooLarge']}`))
    anchor.mockRestore()
  })

  it('moves the selection through the dialog, then lists every directory that changed', async () => {
    const { view, script, ops, instance } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    fireEvent.click(row(view, `${ROOT}/README.md`))
    fireEvent.click(row(view, `${ROOT}/.env`), { ctrlKey: true })
    script.list.mockClear()

    fireEvent.contextMenu(row(view, `${ROOT}/README.md`))
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.moveMany'].replace('{count}', '2') }))
    const input = screen.getByRole('dialog').querySelector<HTMLInputElement>('[data-move-input]')!
    // Pre-filled with the tab's root: the directory the reader is looking at.
    expect(input.value).toBe(ROOT)
    fireEvent.change(input, { target: { value: `${ROOT}/archive` } })
    fireEvent.click(screen.getByRole('dialog').querySelector<HTMLButtonElement>('[data-move-confirm]')!)
    await act(async () => { await Promise.resolve() })

    expect(ops.move).toHaveBeenCalledWith(
      SESSION,
      [`${ROOT}/README.md`, `${ROOT}/.env`],
      `${ROOT}/archive`,
      expect.any(AbortSignal),
    )
    expect(script.list.mock.calls.map(call => call[1])).toEqual([ROOT, `${ROOT}/archive`])
    expect(selectedOf(instance)).toEqual([])
  })

  it('keeps a refused move in the dialog with the destination the reader typed', async () => {
    const { view, script, ops } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    ops.move.mockResolvedValue({
      ok: false,
      error: new RemoteError('workspace-file/outside-workspace', 'outside', { path: '/elsewhere' }),
    })
    fireEvent.click(row(view, `${ROOT}/README.md`))
    fireEvent.contextMenu(row(view, `${ROOT}/README.md`))
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.move'] }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(dialog.querySelector<HTMLInputElement>('[data-move-input]')!, { target: { value: '/elsewhere' } })
    fireEvent.click(dialog.querySelector<HTMLButtonElement>('[data-move-confirm]')!)
    await act(async () => { await Promise.resolve() })

    expect(screen.getByRole('dialog')).not.toBeNull()
    expect(dialog.querySelector<HTMLInputElement>('[data-move-input]')!.value).toBe('/elsewhere')
    expect(dialog.querySelector('[data-move-failure]')?.textContent)
      .toBe(zh['error.actionFailed'].replace('{message}', 'outside'))
  })

  it('moves the rows one drag dropped on a directory, then lists what changed', async () => {
    const { view, script, ops } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    fireEvent.click(row(view, `${ROOT}/README.md`))
    fireEvent.click(row(view, `${ROOT}/.env`), { ctrlKey: true })
    script.list.mockClear()

    const drag = transfer()
    fireEvent.dragStart(row(view, `${ROOT}/README.md`), { dataTransfer: drag.payload })
    expect(drag.data.get(FILES_DRAG_MIME)).toBe(JSON.stringify({ paths: [`${ROOT}/README.md`, `${ROOT}/.env`] }))
    fireEvent.dragOver(view.container.querySelector(`[data-files-path="${ROOT}/src"]`)!, { dataTransfer: drag.payload })
    expect(drag.payload.dropEffect).toBe('move')
    fireEvent.drop(view.container.querySelector(`[data-files-path="${ROOT}/src"]`)!, { dataTransfer: drag.payload })
    await act(async () => { await Promise.resolve() })

    expect(ops.move).toHaveBeenCalledWith(
      SESSION,
      [`${ROOT}/README.md`, `${ROOT}/.env`],
      `${ROOT}/src`,
      expect.any(AbortSignal),
    )
    // The directory they left, then the one they landed in.
    expect(script.list.mock.calls.map(call => call[1])).toEqual([ROOT, `${ROOT}/src`])
  })

  it('sends no request for a drop that could only move a row onto where it already is', async () => {
    const { view, script, ops } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    fireEvent.click(row(view, `${ROOT}/src`))
    await act(() => script.settle({ ok: true, value: { entries: [{ name: 'a.ts', type: 'file' }], truncated: false } }))

    const noop = transfer()
    fireEvent.dragStart(row(view, `${ROOT}/src/a.ts`), { dataTransfer: noop.payload })
    fireEvent.drop(view.container.querySelector(`[data-files-path="${ROOT}/src"]`)!, { dataTransfer: noop.payload })
    await act(async () => { await Promise.resolve() })
    expect(ops.move).not.toHaveBeenCalled()
  })

  it('counts the selection in the delete dialog and clears it once the entries are gone', async () => {
    const { view, script, ops, instance } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    fireEvent.click(row(view, `${ROOT}/README.md`))
    fireEvent.click(row(view, `${ROOT}/.env`), { ctrlKey: true })
    fireEvent.contextMenu(row(view, `${ROOT}/README.md`))
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.deleteMany'].replace('{count}', '2') }))
    expect(screen.getByText(zh['delete.descriptionMany'].replace('{count}', '2'))).not.toBeNull()
    fireEvent.click(screen.getByRole('dialog').querySelector<HTMLButtonElement>('[data-delete-confirm]')!)
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    expect(ops.remove.mock.calls.map(call => call[1])).toEqual([`${ROOT}/README.md`, `${ROOT}/.env`])
    expect(script.list).toHaveBeenLastCalledWith(SESSION, ROOT, expect.any(AbortSignal))
    expect(selectedOf(instance)).toEqual([])
  })

  it('stops a Remote download and writes nothing when the tab record ends mid-read', async () => {
    vi.stubGlobal('location', { origin: 'null' })
    const anchor = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const { view, script, ops, controller } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    const reading = Promise.withResolvers<Awaited<ReturnType<typeof ops.download>>>()
    ops.download.mockReturnValueOnce(reading.promise)
    fireEvent.click(row(view, `${ROOT}/README.md`))
    fireEvent.click(row(view, `${ROOT}/.env`), { ctrlKey: true })
    fireEvent.contextMenu(row(view, `${ROOT}/README.md`))
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.downloadMany'].replace('{count}', '2') }))
    controller.abort()
    reading.resolve({ ok: true, value: { name: 'README.md', base64: 'aGk=' } })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })

    // The selection's second file is never asked for, and the file that landed
    // after the end is not handed to the browser.
    expect(ops.download).toHaveBeenCalledTimes(1)
    expect(anchor).not.toHaveBeenCalled()
    anchor.mockRestore()
  })

  it('lists nothing after a move that outlived the tab record', async () => {
    const { view, script, ops, controller } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    const moving = Promise.withResolvers<Awaited<ReturnType<typeof ops.move>>>()
    ops.move.mockReturnValueOnce(moving.promise)
    fireEvent.click(row(view, `${ROOT}/README.md`))
    fireEvent.contextMenu(row(view, `${ROOT}/README.md`))
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.move'] }))
    fireEvent.click(screen.getByRole('dialog').querySelector<HTMLButtonElement>('[data-move-confirm]')!)
    script.list.mockClear()
    controller.abort()
    moving.resolve({ ok: true, value: { destination: `${ROOT}/src`, entries: [] } })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    expect(script.list).not.toHaveBeenCalled()
  })

  it('lists nothing after a delete that outlived the tab record', async () => {
    const { view, script, ops, controller } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    const removing = Promise.withResolvers<Awaited<ReturnType<typeof ops.remove>>>()
    ops.remove.mockReturnValueOnce(removing.promise)
    fireEvent.click(row(view, `${ROOT}/README.md`))
    fireEvent.contextMenu(row(view, `${ROOT}/README.md`))
    fireEvent.click(screen.getByRole('menuitem', { name: zh['menu.delete'] }))
    fireEvent.click(screen.getByRole('dialog').querySelector<HTMLButtonElement>('[data-delete-confirm]')!)
    script.list.mockClear()
    controller.abort()
    removing.resolve({ ok: true, value: { absolutePath: `${ROOT}/README.md` } })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    expect(script.list).not.toHaveBeenCalled()
  })
})

describe('failureLine', () => {
  const t = makeTranslate(zh)

  it('names each directory failure', () => {
    expect(failureLine(t, new RemoteError('workspace-file/not-found', 'x', { path: 'p' }))).toBe(zh['error.notFound'])
    expect(failureLine(t, new RemoteError('workspace-file/outside-workspace', 'x', { path: 'p' })))
      .toBe(zh['error.outsideWorkspace'])
    expect(failureLine(t, new RemoteError('workspace-file/not-directory', 'x', { path: 'p', kind: 'file' })))
      .toBe(zh['error.notDirectory'])
  })

  it('carries an unclassified failure\'s own message', () => {
    const failure = { code: 'remote/transport', message: 'socket closed' } as unknown as RemoteFailure
    expect(failureLine(t, failure)).toBe('读取失败：socket closed')
  })
})

describe('uploading into the tree', () => {
  /** One file as the picker or a drop hands it over. */
  const fileOf = (name: string, content = 'hi'): File => new File([content], name)

  /** A drop carrying files, as the browser delivers it: no tree payload, so it is an OS-file drop. */
  const drop = (element: Element, ...files: File[]): void => {
    fireEvent.drop(element, { dataTransfer: { files, types: ['Files'], getData: () => '' } })
  }

  /** A drag passing over one element, with no payload (a drag is not readable until it drops). */
  const dragOver = (element: Element): void => {
    fireEvent.dragOver(element, { dataTransfer: { types: ['Files'], dropEffect: '' } })
  }

  it('takes what the header picked into the directory the tab is rooted at, then reveals and re-lists it', async () => {
    const { view, script, ops, instance } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    const picker = view.container.querySelector('[data-files-upload-input]')
    if (!(picker instanceof HTMLInputElement)) throw new Error('the upload picker is not rendered')
    fireEvent.change(picker, { target: { files: [fileOf('note.txt')] } })
    // The row is on the list before the file is read at all.
    expect(view.container.querySelector('[data-files-upload-row="sending"]')?.textContent).toContain('note.txt')
    const landed = Promise.withResolvers<undefined>()
    ops.upload.mockImplementation(async (_session, path) => {
      await landed.promise
      return { ok: true, value: { absolutePath: path } }
    })
    fireEvent.change(picker, { target: { files: [fileOf('second.txt')] } })
    landed.resolve(undefined)
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    expect(instance.getSnapshot().byTab[TAB]!.uploads).toEqual([])
    expect(script.list).toHaveBeenLastCalledWith(SESSION, ROOT, expect.any(AbortSignal))
  })

  it('keeps a refused file on its row with the reason, and dismisses it', async () => {
    const { view, script, ops } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    ops.upload.mockResolvedValue({
      ok: false,
      error: new RemoteError('workspace-file/exists', 'taken', { path: `${ROOT}/src/a.txt` }),
    })
    const dir = view.container.querySelector(`[data-files-path="${ROOT}/src"]`)
    if (dir === null) throw new Error('the directory row is not rendered')
    drop(dir, fileOf('a.txt'))
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    const row = view.container.querySelector('[data-files-upload-row="failed"]')
    expect(row?.textContent).toContain('a.txt')
    expect(row?.textContent).toContain(zh['upload.exists'])
    expect(ops.upload).toHaveBeenCalledWith(SESSION, `${ROOT}/src/a.txt`, expect.any(String), expect.any(AbortSignal))
    fireEvent.click(row!.querySelector('[data-files-upload-dismiss]')!)
    expect(view.container.querySelector('[data-files-uploads]')).toBeNull()
  })

  it('lands a drop on a directory under that directory, and one on the background under the root', async () => {
    const { view, script, ops } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    const dir = view.container.querySelector(`[data-files-path="${ROOT}/src"]`)!
    drop(dir, fileOf('inside.txt'))
    const body = view.container.querySelector('[data-files-body]')!
    drop(body, fileOf('at-root.txt'))
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    expect(ops.upload.mock.calls.map(([, path]) => path)).toEqual([`${ROOT}/src/inside.txt`, `${ROOT}/at-root.txt`])
  })

  it('marks the directory a drag is over, and clears it on the way out and on the drop', async () => {
    const { view, script } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    const dir = view.container.querySelector(`[data-files-path="${ROOT}/src"]`)!
    dragOver(dir)
    expect(view.container.querySelectorAll('[data-files-drop-target]')).toHaveLength(1)
    fireEvent.dragLeave(dir)
    expect(view.container.querySelectorAll('[data-files-drop-target]')).toHaveLength(0)
    dragOver(dir)
    expect(dir.getAttribute('data-files-drop-target')).not.toBeNull()
    drop(dir, fileOf('a.txt'))
    expect(view.container.querySelectorAll('[data-files-drop-target]')).toHaveLength(0)
  })

  it('marks the body itself while a drag is over the background, which drops into the root', async () => {
    const { view, script } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    const body = view.container.querySelector('[data-files-body]')!
    dragOver(body)
    expect(body.getAttribute('data-files-drop-target')).not.toBeNull()
    fireEvent.dragLeave(body)
    expect(body.getAttribute('data-files-drop-target')).toBeNull()
  })

  it('reports nothing for a file that lands after the tab record ended', async () => {
    const { view, script, ops, controller, instance } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof ops.upload>>>()
    ops.upload.mockReturnValue(pending.promise)
    const picker = view.container.querySelector('[data-files-upload-input]')!
    fireEvent.change(picker, { target: { files: [fileOf('late.txt')] } })
    await act(async () => { await Promise.resolve() })
    controller.abort()
    pending.resolve({ ok: true, value: { absolutePath: `${ROOT}/late.txt` } })
    await act(async () => { await Promise.resolve() })
    expect(instance.getSnapshot().byTab[TAB]).toBeUndefined()
  })
})
