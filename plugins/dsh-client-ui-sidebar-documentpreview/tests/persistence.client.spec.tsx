// @vitest-environment jsdom
/** A browser reload recovers unsaved text without promoting a stale file version. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { TextPreview } from '../src/client/TextPreview.tsx'
import { hasDirtyDrafts, persistTextState, readTextState } from '../src/client/persistence.ts'
import { FILE, SESSION, TAB_ID, harness, page, settle, written } from './fixtures.client.ts'

beforeEach(() => { localStorage.clear() })
afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('persistent document drafts', () => {
  it('recovers edits and view state, reads disk afresh and requires resolution for an external edit', async () => {
    const first = harness({ 1: page(1, ['base'], true) })
    const stop = persistTextState(SESSION, first.instance)
    const initial = render(<TextPreview {...first.props()} />)
    await settle()
    fireEvent.click(initial.container.querySelector('[data-textpreview-tool="edit"]')!)
    fireEvent.change(initial.container.querySelector('textarea')!, { target: { value: 'my unsaved draft' } })
    act(() => { first.instance.actions.scrolled(TAB_ID, 84); first.instance.actions.toggledWrap(TAB_ID) })
    const saved = readTextState(SESSION)
    expect(saved.byTab[TAB_ID]).toMatchObject({ pages: {}, loading: false, draftVersion: 'v1', scrollTop: 84, wrap: false })
    expect(hasDirtyDrafts(saved)).toBe(true)
    stop()
    initial.unmount()
    first.controller.abort()

    const second = harness({ 1: page(1, ['their external edit'], true, 'v9') })
    second.instance.actions.restore(saved)
    const view = render(<TextPreview {...second.props()} />)
    await settle()
    expect(second.read).toHaveBeenCalled()
    expect((view.container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('my unsaved draft')
    expect(view.container.querySelector('[data-textpreview-recovered]')).not.toBeNull()
    expect(view.container.querySelector('[data-textpreview-conflict]')?.textContent).toContain('their external edit')
    fireEvent.keyDown(view.container.querySelector('textarea')!, { key: 's', ctrlKey: true })
    expect(second.write).not.toHaveBeenCalled()
    fireEvent.change(view.container.querySelector('textarea')!, { target: { value: 'their external edit plus mine' } })
    fireEvent.click(view.container.querySelector('[data-textpreview-conflict] button')!)
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="save"]')!)
    expect(second.write).toHaveBeenCalledExactlyOnceWith(SESSION, FILE.path, 'their external edit plus mine', 'v9', second.controller.signal)
    await settle()
  })

  it('keeps newer typing when an earlier save settles and persists only the remaining draft', async () => {
    const h = harness({ 1: page(1, ['base'], true) })
    const stop = persistTextState(SESSION, h.instance)
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof h.write>>>()
    h.write.mockReturnValueOnce(pending.promise)
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="edit"]')!)
    fireEvent.change(view.container.querySelector('textarea')!, { target: { value: 'submitted' } })
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="save"]')!)
    fireEvent.change(view.container.querySelector('textarea')!, { target: { value: 'typed while saving' } })
    await act(async () => { pending.resolve(written()); await pending.promise })
    expect((view.container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('typed while saving')
    expect(readTextState(SESSION).byTab[TAB_ID]).toMatchObject({ draftVersion: 'v2', draft: { text: 'typed while saving', base: 'submitted' } })
    stop()
  })

  it('respects cancellation of a discard confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const h = harness({ 1: page(1, ['base'], true) })
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="edit"]')!)
    fireEvent.change(view.container.querySelector('textarea')!, { target: { value: 'keep this' } })
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="cancel"]')!)
    expect((view.container.querySelector('textarea') as HTMLTextAreaElement).value).toBe('keep this')
  })

  it('does not transfer a recovered draft to another file that reuses its tab id', () => {
    const h = harness()
    h.instance.actions.attached(TAB_ID, FILE)
    h.instance.actions.page(TAB_ID, { absolutePath: '/work/a', version: 'v1', offset: 1, text: 'base', lines: 1, eof: true })
    h.instance.actions.beginEdit(TAB_ID, 'base', 'lf')
    h.instance.actions.drafted(TAB_ID, 'draft')
    h.instance.actions.attached(TAB_ID, { ...FILE, path: 'other.txt' })
    expect(h.instance.getSnapshot().byTab[TAB_ID]?.draft).toBeUndefined()
  })
})
