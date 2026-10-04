// @vitest-environment jsdom
/**
 * The row context menu, driven by props alone.
 *
 * What is asserted is which rows a reader is offered for what the menu acts on
 * and which action a row reports: a single file carries open, compare, timeline,
 * copy, download, move, rename, and delete; a directory and any other non-file
 * target drop the file-only rows but keep open as a disabled row; a selection of
 * several entries keeps the entry-wide rows, counts them, and drops the rows
 * that only make sense for one; `compareWith` waits for a compare base that is
 * not the entry itself; and a chosen row reports its own action id.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { EntryMenu } from '../src/client/EntryMenu.tsx'
import type { EntryMenuAction, EntrySelection, EntryTarget } from '../src/client/EntryMenu.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh)
const FILE: EntryTarget = { path: '/work/app/a.ts', name: 'a.ts', kind: 'file', x: 12, y: 24 }
const DIRECTORY: EntryTarget = { path: '/work/app/src', name: 'src', kind: 'directory', x: 12, y: 24 }
const OTHER_PATH = '/work/app/b.ts'
const SECOND_FILE: EntrySelection = { path: '/work/app/b.ts', name: 'b.ts', kind: 'file' }

/** Mount one menu over the selection it acts on, with recording gestures. */
function setup(
  target: EntryTarget,
  selection: readonly EntrySelection[] = [target],
  compareBase: string | null = null,
) {
  const onSelect = vi.fn<(action: EntryMenuAction) => void>()
  const onClose = vi.fn<() => void>()
  render(
    <EntryMenu target={target} selection={selection} compareBase={compareBase} t={t} onSelect={onSelect} onClose={onClose} />,
  )
  return { onSelect, onClose }
}

/** The menu's rows, in document order. */
function labels(): (string | null)[] {
  return screen.getAllByRole('menuitem').map(item => item.textContent)
}

describe('EntryMenu', () => {
  it('offers a single file its open, compare, timeline, copy, download, move, rename, and delete rows in order', () => {
    setup(FILE)
    expect(labels()).toEqual([
      t('menu.open'),
      t('menu.compareSelect'),
      t('menu.timeline'),
      t('menu.copyPath'),
      t('menu.copyRelativePath'),
      t('menu.download'),
      t('menu.move'),
      t('menu.rename'),
      t('menu.delete'),
    ])
    expect(screen.getByRole('menuitem', { name: t('menu.open') }).hasAttribute('disabled')).toBe(false)
  })

  it('holds a directory to the entry-wide rows and keeps open visible but disabled', () => {
    setup(DIRECTORY)
    expect(labels()).toEqual([
      t('menu.open'),
      t('menu.copyPath'),
      t('menu.copyRelativePath'),
      t('menu.move'),
      t('menu.rename'),
      t('menu.delete'),
    ])
    expect(screen.getByRole('menuitem', { name: t('menu.open') }).hasAttribute('disabled')).toBe(true)
  })

  it('counts a selection of several entries and drops the rows only one entry can answer', () => {
    setup(FILE, [FILE, SECOND_FILE, { path: '/work/app/src', name: 'src', kind: 'directory' }])
    expect(labels()).toEqual([
      t('menu.open'),
      t('menu.copyPath'),
      t('menu.copyRelativePath'),
      t('menu.downloadMany', { count: '2' }),
      t('menu.moveMany', { count: '3' }),
      t('menu.deleteMany', { count: '3' }),
    ])
    expect(screen.getByRole('menuitem', { name: t('menu.open') }).hasAttribute('disabled')).toBe(true)
  })

  it('offers no download row for a selection holding no file', () => {
    setup(DIRECTORY, [DIRECTORY, { path: '/work/app/lib', name: 'lib', kind: 'directory' }])
    expect(labels()).not.toContain(t('menu.download'))
    expect(labels()).toContain(t('menu.moveMany', { count: '2' }))
  })

  it('adds the compare-with row once another file is the compare base', () => {
    setup(FILE, [FILE], OTHER_PATH)
    expect(labels()).toEqual([
      t('menu.open'),
      t('menu.compareSelect'),
      t('menu.compareWith'),
      t('menu.timeline'),
      t('menu.copyPath'),
      t('menu.copyRelativePath'),
      t('menu.download'),
      t('menu.move'),
      t('menu.rename'),
      t('menu.delete'),
    ])
  })

  it('leaves the compare-with row out when no base is set or the entry is its own base', () => {
    setup(FILE)
    expect(labels()).not.toContain(t('menu.compareWith'))
    cleanup()
    setup(FILE, [FILE], FILE.path)
    expect(labels()).not.toContain(t('menu.compareWith'))
  })

  it('reports the action id of the row that was picked', () => {
    const { onSelect } = setup(FILE, [FILE], OTHER_PATH)
    fireEvent.click(screen.getByRole('menuitem', { name: t('menu.open') }))
    expect(onSelect).toHaveBeenLastCalledWith('open')
    fireEvent.click(screen.getByRole('menuitem', { name: t('menu.compareWith') }))
    expect(onSelect).toHaveBeenLastCalledWith('compareWith')
    fireEvent.click(screen.getByRole('menuitem', { name: t('menu.download') }))
    expect(onSelect).toHaveBeenLastCalledWith('download')
    fireEvent.click(screen.getByRole('menuitem', { name: t('menu.move') }))
    expect(onSelect).toHaveBeenLastCalledWith('move')
    fireEvent.click(screen.getByRole('menuitem', { name: t('menu.delete') }))
    expect(onSelect).toHaveBeenLastCalledWith('delete')
    expect(onSelect).toHaveBeenCalledTimes(5)
  })

  it('reports a directory row by its own action id', () => {
    const { onSelect } = setup(DIRECTORY)
    fireEvent.click(screen.getByRole('menuitem', { name: t('menu.rename') }))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('rename')
  })

  it('reports a counted row of a selection by its own action id', () => {
    const { onSelect } = setup(FILE, [FILE, SECOND_FILE])
    fireEvent.click(screen.getByRole('menuitem', { name: t('menu.deleteMany', { count: '2' }) }))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('delete')
  })

  it('dismisses on Escape', () => {
    const { onClose } = setup(FILE)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
