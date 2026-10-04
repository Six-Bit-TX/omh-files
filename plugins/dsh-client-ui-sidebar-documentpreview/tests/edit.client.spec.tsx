// @vitest-environment jsdom
/**
 * The text preview's editor: when it may open, what it holds, what a save
 * sends, and what a refusal leaves behind.
 *
 * The editor belongs to the body rather than to any renderer, so these cases
 * drive the whole type through its composed props and assert what a reader
 * sees: the field in place of the renderer, the controls beside the path, and
 * the one round trip a save makes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { TextPreviewProps } from '../src/client/TextPreview.tsx'
import { TextPreview } from '../src/client/TextPreview.tsx'
import type { DocumentPreviewDefinition } from '../src/client/document/registry.ts'
import { PLAIN_BODY_ID } from '../src/client/text/index.ts'
import { ABSOLUTE_PATH, failure, harness, page, settle, TAB_ID, written } from './fixtures.client.ts'

afterEach(cleanup)
beforeEach(() => { vi.spyOn(window, 'confirm').mockReturnValue(true) })
afterEach(() => { vi.restoreAllMocks() })

const binary: DocumentPreviewDefinition = {
  id: 'complete-document', extensions: ['md'], title: () => 'Complete document', loading: 'bytes-complete',
}

/** The field, once a spec has opened it. */
function editor(view: ReturnType<typeof render>): HTMLTextAreaElement {
  const field = view.container.querySelector('[data-textpreview-editor]')
  if (!(field instanceof HTMLTextAreaElement)) throw new Error('the editor is not open')
  return field
}

describe('the editor opens', () => {
  it('offers the control once the whole file is loaded and opens the text the reader holds', async () => {
    const h = harness({ 1: page(1, ['one', 'two'], true) })
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    expect(view.container.querySelector('[data-textpreview-plain]')).not.toBeNull()
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="edit"]')!)
    expect(editor(view).value).toBe('one\ntwo')
    expect(view.container.querySelector('[data-textpreview-plain]')).toBeNull()
    expect(h.instance.getSnapshot().byTab[TAB_ID]?.draft).toEqual({ text: 'one\ntwo', base: 'one\ntwo', endings: 'lf' })
    h.controller.abort()
  })

  it('withholds the control while pages are still outstanding', async () => {
    const h = harness({ 1: page(1, ['one'], false) })
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    expect(view.container.querySelector('[data-textpreview-more]')).not.toBeNull()
    expect(view.container.querySelector('[data-textpreview-tool="edit"]')).toBeNull()
    h.controller.abort()
  })

  it('withholds the control from a whole-byte renderer, which has no text to edit', async () => {
    const h = harness()
    h.bytes.mockResolvedValue({
      ok: true, value: { absolutePath: '/host/project/work/notes.md', version: 'v1', offset: 0, data: btoa('all'), bytes: 3, eof: true },
    })
    const props: TextPreviewProps = { ...h.props(), useDocumentPreviews: selector => selector([binary]), renderSlot: () => null }
    const view = render(<TextPreview {...props} />)
    await settle()
    expect(view.container.querySelector('[data-textpreview-tool="edit"]')).toBeNull()
    h.controller.abort()
  })

  it('withholds the control while the file resource service is absent', async () => {
    const h = harness({ 1: page(1, ['one'], true) })
    h.useResource.mockReturnValue({ status: 'none', value: undefined, failure: undefined })
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    expect(view.container.querySelector('[data-textpreview-tool="edit"]')).toBeNull()
    h.controller.abort()
  })

  it('withholds the control until the selected renderer has read under its own mode', async () => {
    const h = harness()
    // The tab holds complete bytes while a text renderer is selected: nothing
    // has been read for that renderer yet, so there is no text to edit.
    h.instance.actions.loading(TAB_ID, 'bytes-complete')
    h.instance.actions.complete(TAB_ID, {
      absolutePath: ABSOLUTE_PATH, version: 'v1', offset: 0, data: new Uint8Array([1]), bytes: 1, eof: true,
    })
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof h.read>>>()
    h.read.mockReturnValueOnce(pending.promise)
    const view = render(<TextPreview {...h.props()} />)
    expect(view.container.querySelector('[data-textpreview-tool="edit"]')).toBeNull()
    await act(async () => { pending.resolve(page(1, ['one'], true)); await pending.promise })
    expect(view.container.querySelector('[data-textpreview-tool="edit"]')).not.toBeNull()
    h.controller.abort()
  })
})

describe('saving a draft', () => {
  it('keeps Save out of reach until the reader changes something, then sends the text and the read version', async () => {
    const h = harness({ 1: page(1, ['one'], true) })
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="edit"]')!)
    const save = view.container.querySelector('[data-textpreview-tool="save"]')
    expect((save as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(editor(view), { target: { value: 'edited' } })
    expect((save as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(save!)
    expect(h.write).toHaveBeenCalledExactlyOnceWith('s-1', 'work/notes.md', 'edited', 'v1', h.controller.signal)
    await settle()
    // The write's own report closes the editor, so the reader sees the file the
    // save produced rather than the draft they typed.
    expect(view.container.querySelector('[data-textpreview-editor]')).toBeNull()
    expect(view.container.querySelector('[data-textpreview-plain]')?.textContent).toBe('edited\n')
    expect(h.instance.getSnapshot().byTab[TAB_ID]?.version).toBe('v2')
    h.controller.abort()
  })

  it('saves on the platform shortcut without touching the file twice', async () => {
    const h = harness({ 1: page(1, ['one'], true) })
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="edit"]')!)
    fireEvent.change(editor(view), { target: { value: 'one\ntwo' } })
    fireEvent.keyDown(editor(view), { key: 's', ctrlKey: true })
    expect(h.write).toHaveBeenCalledExactlyOnceWith('s-1', 'work/notes.md', 'one\ntwo', 'v1', h.controller.signal)
    await settle()
    h.controller.abort()
  })

  it('ignores a keystroke that is not the save shortcut', async () => {
    const h = harness({ 1: page(1, ['one'], true) })
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="edit"]')!)
    fireEvent.change(editor(view), { target: { value: 'edited' } })
    fireEvent.keyDown(editor(view), { key: 's' })
    fireEvent.keyDown(editor(view), { key: 'Enter', metaKey: true })
    expect(h.write).not.toHaveBeenCalled()
    h.controller.abort()
  })

  it('sends nothing while the file resource service has gone away', async () => {
    const h = harness({ 1: page(1, ['one'], true) })
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="edit"]')!)
    fireEvent.change(editor(view), { target: { value: 'edited' } })
    h.useResource.mockReturnValue({ status: 'none', value: undefined, failure: undefined })
    view.rerender(<TextPreview {...h.props()} />)
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="save"]')!)
    fireEvent.keyDown(editor(view), { key: 's', ctrlKey: true })
    expect(h.write).not.toHaveBeenCalled()
    h.controller.abort()
  })

  it('writes a CRLF file back as CRLF, though the field holds LF', async () => {
    const h = harness({ 1: page(1, ['one\r', 'two'], true) })
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="edit"]')!)
    expect(editor(view).value).toBe('one\ntwo')
    expect(h.instance.getSnapshot().byTab[TAB_ID]?.draft?.endings).toBe('crlf')
    fireEvent.change(editor(view), { target: { value: 'one\ntwo\nthree' } })
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="save"]')!)
    expect(h.write).toHaveBeenCalledExactlyOnceWith('s-1', 'work/notes.md', 'one\r\ntwo\r\nthree', 'v1', h.controller.signal)
    await settle()
    h.controller.abort()
  })
})

describe('closing the editor', () => {
  it('gives the renderer back on Cancel and forgets the draft', async () => {
    const h = harness({ 1: page(1, ['one'], true) })
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="edit"]')!)
    fireEvent.change(editor(view), { target: { value: 'edited' } })
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="cancel"]')!)
    expect(view.container.querySelector('[data-textpreview-editor]')).toBeNull()
    expect(view.container.querySelector('[data-textpreview-plain]')?.textContent).toBe('one\n')
    expect(h.instance.getSnapshot().byTab[TAB_ID]).not.toHaveProperty('draft')
    expect(h.write).not.toHaveBeenCalled()
    h.controller.abort()
  })

  it('shows the reason a save was refused and keeps the draft', async () => {
    const h = harness({ 1: page(1, ['one'], true) })
    h.write.mockResolvedValueOnce(failure('workspace-file/denied', { path: 'work/notes.md' }))
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="edit"]')!)
    fireEvent.change(editor(view), { target: { value: 'edited' } })
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="save"]')!)
    await settle()
    const bar = view.container.querySelector('[data-textpreview-save-failed]')
    expect(bar?.getAttribute('data-textpreview-save-failed')).toBe('workspace-file/denied')
    expect(bar?.textContent).toContain('error.denied')
    expect(editor(view).value).toBe('edited')
    // Only a stale refusal has somewhere to go; a policy refusal does not.
    expect(view.container.querySelector('[data-textpreview-discard-draft]')).toBeNull()
    h.controller.abort()
  })

  it('offers to discard the draft and reload when the file moved on', async () => {
    const h = harness({ 1: page(1, ['one'], true) })
    h.write.mockResolvedValueOnce(failure('workspace-file/stale', { path: 'work/notes.md' }))
    h.script(1, page(1, ['theirs'], true, 'v2'))
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="edit"]')!)
    fireEvent.change(editor(view), { target: { value: 'mine' } })
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="save"]')!)
    await settle()
    expect(view.container.textContent).toContain('error.stale')
    fireEvent.click(view.container.querySelector('[data-textpreview-discard-draft]')!)
    await settle()
    expect(view.container.querySelector('[data-textpreview-editor]')).toBeNull()
    expect(view.container.querySelector('[data-textpreview-plain]')?.textContent).toBe('theirs\n')
    h.controller.abort()
  })
})

describe('a settled save', () => {
  it('reports the written byte count through the version it stores', async () => {
    const h = harness({ 1: page(1, ['one'], true) })
    h.write.mockResolvedValueOnce(written('v9', 6))
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="edit"]')!)
    fireEvent.change(editor(view), { target: { value: 'edited' } })
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="save"]')!)
    await settle()
    expect(h.instance.getSnapshot().byTab[TAB_ID]?.version).toBe('v9')
    expect(view.container.querySelector('[data-textpreview-tool="edit"]')).not.toBeNull()
    h.controller.abort()
  })

  it('keeps the draft and shows changed disk content until the reader resolves it', async () => {
    const h = harness({ 1: page(1, ['one'], true) })
    const view = render(<TextPreview {...h.props()} />)
    await settle()
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="edit"]')!)
    fireEvent.change(editor(view), { target: { value: 'edited' } })
    // Another writer lands between the read and the reader's next move.
    h.setVersion('v9')
    view.rerender(<TextPreview {...h.props()} />)
    const bar = view.container.querySelector('[data-textpreview-changed]')
    expect(bar).not.toBeNull()
    const action = bar!.querySelector('[data-textpreview-reload-now]')
    expect(action?.textContent).toBe('edit.compare')
    h.script(1, page(1, ['theirs'], true, 'v9'))
    fireEvent.click(action!)
    await settle()
    expect(editor(view).value).toBe('edited')
    expect(view.container.querySelector('[data-textpreview-conflict]')?.textContent).toContain('theirs')
    fireEvent.keyDown(editor(view), { key: 's', ctrlKey: true })
    expect(h.write).not.toHaveBeenCalled()
    fireEvent.change(editor(view), { target: { value: 'theirs and mine' } })
    fireEvent.click(view.container.querySelector('[data-textpreview-conflict] button')!)
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="save"]')!)
    expect(h.write).toHaveBeenCalledExactlyOnceWith('s-1', 'work/notes.md', 'theirs and mine', 'v9', h.controller.signal)
    h.controller.abort()
  })

  it('keeps the plain fallback in the picker so the reader can still switch renderers', async () => {
    const h = harness({ 1: page(1, ['one'], true) })
    const code: DocumentPreviewDefinition = {
      id: 'code', extensions: ['md'], title: () => 'Code', loading: 'text-pages', wrap: true,
    }
    const plain: DocumentPreviewDefinition = {
      id: PLAIN_BODY_ID, extensions: [], title: () => 'viewer.text', loading: 'text-pages', wrap: true,
    }
    const props: TextPreviewProps = { ...h.props(), useDocumentPreviews: selector => selector([code, plain]) }
    const view = render(<TextPreview {...props} />)
    await settle()
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="edit"]')!)
    // The field replaces the chosen renderer, so its controls step aside for
    // the editor's own; the choice itself survives and comes back on Cancel.
    expect(view.container.querySelector('[data-document-viewer-menu]')).toBeNull()
    expect(view.container.querySelector('[data-textpreview-tool="wrap"]')).toBeNull()
    expect(view.container.querySelector('[data-textpreview-tool="reload"]')).toBeNull()
    fireEvent.click(view.container.querySelector('[data-textpreview-tool="cancel"]')!)
    expect(view.container.querySelector('[data-document-viewer-menu]')).not.toBeNull()
    h.controller.abort()
  })
})
